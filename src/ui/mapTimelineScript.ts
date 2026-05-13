// [SCOPE] Architecture Map Timeline Script — SVG/Canvas timeline view for the Architecture Map panel.
// Injected as a plain-JS string via mapPanel.ts alongside MAP_SCRIPT.
// Renders .chassis/build_history.json and save points as an interactive visual timeline.
// [WARN] No TypeScript — plain JS string only. Injected into WebView <script>.
// [WARN] Must not touch Network/Clustered/Hierarchy layouts. Self-contained in #timeline-layer.

export const MAP_TIMELINE_SCRIPT = `
(function() {
  // -- Constants & Colors 
  const TL_COLORS = {
    ai:        '#4a9eff',
    aiSuper:   '#a855f7',
    vault:     '#4ec959',
    savepoint: '#f5c400',
    undone:    'transparent',
    line:      'rgba(150,160,190,0.35)',
    branch:    'rgba(150,160,190,0.22)',
    bg:        '#1e1e2e',
    panel:     '#181825',
    text:      '#cdd6f4',
    muted:     '#6c7086',
  };
  const NODE_MIN = 12, NODE_MAX = 32;
  const ROW_H = 90;      // px between main and branch row
  const MARGIN_L = 48;
  const MARGIN_R = 48;
  const MAIN_Y_FRAC = 0.42;  // fraction of canvas height for main timeline

  // -- State 
  let tlHistory    = (window.TIMELINE_DATA && window.TIMELINE_DATA.history)    || [];
  let tlSavePoints = (window.TIMELINE_DATA && window.TIMELINE_DATA.savePoints) || [];
  let tlBranchFrom = (window.TIMELINE_DATA && window.TIMELINE_DATA.branchFromId) || null;

  let tlScale = 1, tlOffsetX = 0;
  let tlSelectedId = null;
  let tlHoveredId  = null;
  let tlUndoTimers = {};
  let tlIsDragging = false, tlDragStartX = 0, tlDragStartOffsetX = 0;

  // -- Canvas 
  const tlCanvas = document.getElementById('tl-canvas');
  const tlSide   = document.getElementById('tl-side');
  const tlTooltip= document.getElementById('tl-tooltip');
  const tlEmpty  = document.getElementById('tl-empty');
  if (!tlCanvas) return;
  const tlCtx = tlCanvas.getContext('2d');

  // -- Build Node List 
  // Merge history + savepoints into a flat list of timeline nodes
  function buildNodes() {
    const spIds = new Set(tlSavePoints.map(sp => sp.id));
    const all = [];

    // Add history entries
    tlHistory.forEach(e => {
      const isSP = spIds.has(e.id);
      let color = e.source === 'vault' ? TL_COLORS.vault
                : e.worker             ? TL_COLORS.aiSuper
                :                        TL_COLORS.ai;
      if (isSP) color = TL_COLORS.savepoint;
      const fileCount = (e.files || []).length;
      const r = Math.max(NODE_MIN, Math.min(NODE_MAX, NODE_MIN + fileCount * 3));
      all.push({
        id: e.id,
        ts: new Date(e.timestamp).getTime(),
        task: e.task || '(Unknown build)',
        files: e.files || [],
        tokensUsed: e.tokensUsed || 0,
        costUSD: e.costUSD || 0,
        source: e.source || 'ai',
        supervisor: e.supervisor || '',
        worker: e.worker || null,
        undone: !!e.undone,
        isSavePoint: isSP,
        isOrphan: false,
        color,
        r,
        branch: false,   // set below
      });
    });

    // Orphan save points not in history
    tlSavePoints.forEach(sp => {
      if (!all.find(n => n.id === sp.id)) {
        all.push({
          id: sp.id,
          ts: new Date(sp.timestamp).getTime(),
          task: sp.message || (String.fromCharCode(55357,56525)) + ' Save Point',
          files: [],
          tokensUsed: 0,
          costUSD: 0,
          source: 'savepoint',
          supervisor: '',
          worker: null,
          undone: false,
          isSavePoint: true,
          isOrphan: true,
          color: TL_COLORS.savepoint,
          r: NODE_MIN + 2,
          branch: false,
        });
      }
    });

    // Sort by timestamp ascending (left = oldest)
    all.sort((a, b) => a.ts - b.ts);

    // Detect branches: if a node comes after an undone node, flag as branch
    // Simple heuristic: any node whose predecessor was undone is a branch
    let lastUndoneIdx = -1;
    all.forEach((n, i) => {
      if (n.undone) lastUndoneIdx = i;
      else if (lastUndoneIdx !== -1 && i > lastUndoneIdx) {
        n.branch = true;
      }
    });

    return all;
  }

  let tlNodes = buildNodes();

  // -- Layout 
  function computeLayout() {
    const cw = tlCanvas.width;
    const usable = cw - MARGIN_L - MARGIN_R;
    const n = tlNodes.length;
    if (n === 0) return;
    const spacing = n === 1 ? usable / 2 : usable / (n - 1) * tlScale;
    tlNodes.forEach((node, i) => {
      const mainY = tlCanvas.height * MAIN_Y_FRAC;
      node.cx = MARGIN_L + i * spacing + tlOffsetX;
      node.cy = node.branch ? mainY + ROW_H : mainY;
    });
  }

  // -- Draw 
  function tlDraw() {
    const cw = tlCanvas.width, ch = tlCanvas.height;
    tlCtx.clearRect(0, 0, cw, ch);

    if (tlNodes.length === 0) {
      if (tlEmpty) tlEmpty.style.display = 'flex';
      return;
    }
    if (tlEmpty) tlEmpty.style.display = 'none';

    computeLayout();

    const mainY   = ch * MAIN_Y_FRAC;
    const mainNodes   = tlNodes.filter(n => !n.branch && n.cx >= 0 && n.cx <= cw + 40);
    const branchNodes = tlNodes.filter(n =>  n.branch && n.cx >= 0 && n.cx <= cw + 40);

    // Main timeline line
    if (mainNodes.length >= 2) {
      tlCtx.beginPath();
      tlCtx.moveTo(mainNodes[0].cx, mainY);
      tlCtx.lineTo(mainNodes[mainNodes.length - 1].cx, mainY);
      tlCtx.strokeStyle = TL_COLORS.line;
      tlCtx.lineWidth = 2;
      tlCtx.stroke();
    }

    // Branch lines
    if (branchNodes.length > 0) {
      // Find the undo point (last undone node on main timeline)
      const undoneOnMain = mainNodes.filter(n => n.undone);
      const branchOrigin = undoneOnMain.length ? undoneOnMain[undoneOnMain.length - 1] : null;

      if (branchOrigin && branchNodes.length >= 1) {
        // Draw dashed diagonal from undo point down to first branch node
        tlCtx.beginPath();
        tlCtx.setLineDash([6, 4]);
        tlCtx.moveTo(branchOrigin.cx, branchOrigin.cy);
        tlCtx.lineTo(branchNodes[0].cx, branchNodes[0].cy);
        tlCtx.strokeStyle = TL_COLORS.branch;
        tlCtx.lineWidth = 2;
        tlCtx.stroke();
        tlCtx.setLineDash([]);
      }

      // Horizontal branch line
      if (branchNodes.length >= 2) {
        tlCtx.beginPath();
        tlCtx.setLineDash([6, 4]);
        tlCtx.moveTo(branchNodes[0].cx, branchNodes[0].cy);
        tlCtx.lineTo(branchNodes[branchNodes.length - 1].cx, branchNodes[branchNodes.length - 1].cy);
        tlCtx.strokeStyle = TL_COLORS.branch;
        tlCtx.lineWidth = 2;
        tlCtx.stroke();
        tlCtx.setLineDash([]);
      }
    }

    // Draw nodes - main first, then branch
    [...mainNodes, ...branchNodes].forEach(n => drawNode(n));

    // Connecting lines between consecutive main nodes
    for (let i = 0; i < mainNodes.length - 1; i++) {
      // already drawn via the main line above, but draw per-segment for dimming
    }
  }

  function nodeColor(n) {
    if (n.undone) return TL_COLORS.undone;
    return n.color;
  }

  function drawNode(n) {
    const isSelected = tlSelectedId === n.id;
    const isHovered  = tlHoveredId  === n.id;
    const isBranchFrom = tlBranchFrom === n.id;
    const r = n.r;

    tlCtx.beginPath();
    tlCtx.arc(n.cx, n.cy, r, 0, Math.PI * 2);

    // Fill
    if (n.undone) {
      tlCtx.fillStyle = 'rgba(100,100,100,0.15)';
    } else {
      tlCtx.fillStyle = n.color;
    }
    tlCtx.fill();

    // Stroke
    if (isSelected) {
      tlCtx.strokeStyle = '#fff';
      tlCtx.lineWidth = 3;
      tlCtx.stroke();
    } else if (isHovered) {
      tlCtx.strokeStyle = 'rgba(255,255,255,0.6)';
      tlCtx.lineWidth = 2;
      tlCtx.stroke();
    } else if (n.undone) {
      tlCtx.strokeStyle = '#e05555';
      tlCtx.lineWidth = 2;
      tlCtx.setLineDash([4, 3]);
      tlCtx.stroke();
      tlCtx.setLineDash([]);
    } else if (isBranchFrom) {
      tlCtx.strokeStyle = '#f5c400';
      tlCtx.lineWidth = 3;
      tlCtx.stroke();
    }

    // Save point star overlay
    if (n.isSavePoint && !n.undone) {
      tlCtx.fillStyle = '#0f0f1a';
      tlCtx.font = 'bold ' + Math.round(r * 0.9) + 'px sans-serif';
      tlCtx.textAlign = 'center';
      tlCtx.textBaseline = 'middle';
      tlCtx.fillText(String.fromCharCode(55357,56525), n.cx, n.cy);
    }

    // Label below node
    const fname = (n.task || '').slice(0, 22) + ((n.task || '').length > 22 ? '...' : '');
    const alpha = n.undone ? 0.4 : 1;
    tlCtx.globalAlpha = alpha;
    tlCtx.fillStyle = TL_COLORS.text;
    tlCtx.font = '10px sans-serif';
    tlCtx.textAlign = 'center';
    tlCtx.textBaseline = 'top';
    tlCtx.fillText(fname, n.cx, n.cy + r + 5);
    tlCtx.globalAlpha = 1;

    // Timestamp above node
    tlCtx.fillStyle = TL_COLORS.muted;
    tlCtx.font = '9px sans-serif';
    tlCtx.textBaseline = 'bottom';
    tlCtx.fillText(timeAgoTl(n.ts), n.cx, n.cy - r - 3);
  }

  function timeAgoTl(ts) {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return d + 's ago';
    if (d < 3600) return Math.floor(d / 60) + 'm ago';
    if (d < 86400) return Math.floor(d / 3600) + 'h ago';
    return Math.floor(d / 86400) + 'd ago';
  }

  // -- Tooltip 
  function showTooltip(n, x, y) {
    if (!tlTooltip) return;
    const aiStr = n.source === 'vault' ? 'Vault only'
                : n.worker ? n.supervisor + ' (Supervisor) -> ' + n.worker + ' (Worker)'
                : n.supervisor || 'AI';
    const costStr = n.tokensUsed > 0
      ? '$' + n.costUSD.toFixed(4) + ' - ' + n.tokensUsed.toLocaleString() + ' tokens'
      : n.source === 'vault' ? 'No AI tokens' : '--';
    tlTooltip.innerHTML =
      '<div style="font-weight:600;margin-bottom:4px;font-size:12px;color:#cba6f7">' + escTl(n.task.slice(0, 70)) + (n.task.length > 70 ? '...' : '') + '</div>' +
      '<div style="font-size:11px;color:#a6adc8;line-height:1.7;">' +
        'Time: ' + timeAgoTl(n.ts) + '<br>' +
        'Files: ' + (n.files.length || 0) + ' file' + (n.files.length !== 1 ? 's' : '') + '<br>' +
        (costStr !== '--' ? 'Cost: ' + costStr + '<br>' : '') +
        'AI: ' + escTl(aiStr) +
        (n.undone ? '<br><span style="color:#e05555;">Undone</span>' : '') +
        (n.isSavePoint ? '<br><span style="color:#f5c400;">Save Point</span>' : '') +
      '</div>';
    tlTooltip.style.display = 'block';
    const rect = tlCanvas.getBoundingClientRect();
    let tx = x + 14, ty = y - 10;
    if (tx + 220 > rect.width) tx = x - 230;
    if (ty + 120 > rect.height) ty = y - 130;
    tlTooltip.style.left = tx + 'px';
    tlTooltip.style.top  = ty + 'px';
  }

  function hideTooltip() {
    if (tlTooltip) tlTooltip.style.display = 'none';
  }

  function escTl(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // -- Side Panel 
  function showTlSide(n) {
    if (!tlSide) return;
    tlSelectedId = n.id;
    const aiStr = n.source === 'vault' ? 'Vault only - no AI used'
                : n.worker ? escTl(n.supervisor) + ' (Supervisor) -> ' + escTl(n.worker) + ' (Worker)'
                : escTl(n.supervisor || 'AI') + ' (Solo)';
    const sourceBadge = n.source === 'vault'
      ? '<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:rgba(78,201,89,0.15);color:#4ec959;">Vault</span>'
      : '<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:rgba(74,158,255,0.15);color:#4a9eff;">AI</span>';
    const undoneBadge = n.undone ? ' <span style="padding:2px 8px;border-radius:10px;font-size:10px;background:rgba(100,100,100,0.2);color:#888;">Undone</span>' : '';
    const spBadge = n.isSavePoint ? ' <span style="padding:2px 8px;border-radius:10px;font-size:10px;background:rgba(245,196,0,0.15);color:#f5c400;">Save Point</span>' : '';
    const costStr = n.tokensUsed > 0 ? '$' + n.costUSD.toFixed(4) + ' - ' + n.tokensUsed.toLocaleString() + ' tokens' : (n.source === 'vault' ? 'No AI tokens' : '--');
    const fileList = n.files.length ? n.files.map(f => '<div style="font-family:monospace;font-size:10px;color:#a6adc8;padding:1px 0;">' + escTl(f) + '</div>').join('') : '<div style="color:#6c7086;font-size:11px;">No files recorded</div>';
    const fullDate = new Date(n.ts).toLocaleString();

    const undoBtnId = 'tl-undo-' + n.id;
    const undoHtml = n.undone
      ? '<button disabled style="padding:7px 12px;border-radius:4px;border:1px solid rgba(100,100,100,0.3);background:transparent;color:#888;font-size:11px;cursor:default;">Already Undone</button>'
      : '<button id="' + undoBtnId + '" style="padding:7px 12px;border-radius:4px;border:1px solid rgba(224,85,85,0.4);background:rgba(224,85,85,0.1);color:#e05555;cursor:pointer;font-size:11px;" onclick="tlUndo(\'' + escTl(n.id) + '\',this)">Undo this build</button>';

    tlSide.innerHTML =
      '<div style="padding:14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">' +
          '<span style="font-size:13px;font-weight:700;color:#cba6f7;">Build Detail</span>' +
          '<span style="cursor:pointer;color:#6c7086;font-size:16px;" onclick="tlCloseSide()">X</span>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:600;margin-bottom:6px;word-break:break-word;">' + escTl(n.task.slice(0, 120)) + (n.task.length > 120 ? '...' : '') + '</div>' +
        '<div style="font-size:11px;color:#6c7086;margin-bottom:8px;">' + escTl(fullDate) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' + sourceBadge + undoneBadge + spBadge + '</div>' +
        '<div style="font-size:11px;color:#a6adc8;margin-bottom:6px;"><strong style="color:#cdd6f4;">Files:</strong></div>' +
        '<div style="margin-bottom:10px;padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;">' + fileList + '</div>' +
        '<div style="font-size:11px;color:#a6adc8;margin-bottom:4px;"><strong style="color:#cdd6f4;">AI:</strong> ' + aiStr + '</div>' +
        '<div style="font-size:11px;color:#a6adc8;margin-bottom:14px;"><strong style="color:#cdd6f4;">Cost:</strong> ' + escTl(costStr) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          undoHtml +
          '<button style="padding:7px 12px;border-radius:4px;border:1px solid rgba(245,196,0,0.4);background:rgba(245,196,0,0.08);color:#f5c400;cursor:pointer;font-size:11px;" onclick="tlPromote(\'' + escTl(n.id) + '\')">Save as Save Point</button>' +
          '<button style="padding:7px 12px;border-radius:4px;border:1px solid rgba(168,85,247,0.25);background:rgba(168,85,247,0.04);color:#a855f7;font-size:11px;opacity:0.45;cursor:not-allowed;pointer-events:none;" title="Coming Soon -- arriving in a future update">Branch from here <span style="font-size:9px;opacity:0.7;">[Soon]</span></button>' +
        '</div>' +
      '</div>';
    tlSide.classList.remove('hidden');
  }

  window.tlCloseSide = function() {
    if (tlSide) tlSide.classList.add('hidden');
    tlSelectedId = null;
  };

  window.tlUndo = function(id, btn) {
    if (!vs) return;
    if (btn.getAttribute('data-armed') === '1') {
      clearTimeout(tlUndoTimers[id]);
      btn.textContent = 'Undoing...';
      btn.disabled = true;
      vs.postMessage({ type: 'tl-undo-build', snapshotId: id });
    } else {
      const orig = btn.textContent;
      btn.setAttribute('data-armed', '1');
      btn.textContent = 'Click again to confirm undo';
      btn.style.background = 'rgba(224,85,85,0.25)';
      btn.style.borderColor = 'rgba(224,85,85,0.8)';
      tlUndoTimers[id] = setTimeout(() => {
        btn.textContent = orig;
        btn.style.background = 'rgba(224,85,85,0.1)';
        btn.style.borderColor = 'rgba(224,85,85,0.4)';
        btn.removeAttribute('data-armed');
      }, 5000);
    }
  };

  window.tlPromote = function(id) {
    if (vs) vs.postMessage({ type: 'tl-promote-save-point', snapshotId: id });
  };

  window.tlBranchFromHere = function(id) {
    if (vs) vs.postMessage({ type: 'tl-branch-from', snapshotId: id });
    tlBranchFrom = id;
    tlNodes.forEach(n => { if (n.id === id) { n.isBranchOrigin = true; } });
    tlRedraw();
  };

  // -- Hit test 
  function tlHitTest(mx, my) {
    return tlNodes.find(n => {
      const dx = mx - n.cx, dy = my - n.cy;
      return dx * dx + dy * dy <= n.r * n.r;
    }) || null;
  }

  // -- Controls 
  const tlFitBtn    = document.getElementById('tl-fit-btn');
  const tlOldestBtn = document.getElementById('tl-oldest-btn');
  const tlNewestBtn = document.getElementById('tl-newest-btn');
  const tlZoomSlider= document.getElementById('tl-zoom');

  function tlFitAll() {
    tlScale = 1;
    tlOffsetX = 0;
    if (tlZoomSlider) tlZoomSlider.value = '1';
    tlRedraw();
  }

  function tlScrollTo(newest) {
    if (tlNodes.length === 0) return;
    computeLayout();
    const target = newest ? tlNodes[tlNodes.length - 1] : tlNodes[0];
    tlOffsetX = tlCanvas.width / 2 - target.cx;
    tlRedraw();
  }

  if (tlFitBtn)    tlFitBtn.onclick    = tlFitAll;
  if (tlOldestBtn) tlOldestBtn.onclick = () => tlScrollTo(false);
  if (tlNewestBtn) tlNewestBtn.onclick = () => tlScrollTo(true);
  if (tlZoomSlider) tlZoomSlider.addEventListener('input', () => {
    tlScale = parseFloat(tlZoomSlider.value);
    tlRedraw();
  });

  // -- Resize 
  function tlResize() {
    const p = tlCanvas.parentElement; if (!p) return;
    const w = p.clientWidth, h = p.clientHeight;
    if (w > 0 && h > 0) { tlCanvas.width = w; tlCanvas.height = h; }
    tlRedraw();
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(tlResize).observe(tlCanvas.parentElement);
  }
  window.addEventListener('resize', tlResize);
  setTimeout(tlResize, 60);

  // -- Input 
  tlCanvas.addEventListener('mousemove', e => {
    const hit = tlHitTest(e.offsetX, e.offsetY);
    tlHoveredId = hit ? hit.id : null;
    tlCanvas.style.cursor = hit ? 'pointer' : 'grab';
    if (hit) {
      showTooltip(hit, e.offsetX, e.offsetY);
    } else {
      hideTooltip();
    }
    if (tlIsDragging) {
      tlOffsetX = tlDragStartOffsetX + (e.clientX - tlDragStartX);
      tlRedraw();
    }
  });

  tlCanvas.addEventListener('mouseleave', () => { hideTooltip(); tlHoveredId = null; });

  tlCanvas.addEventListener('mousedown', e => {
    const hit = tlHitTest(e.offsetX, e.offsetY);
    if (!hit) {
      tlIsDragging = true;
      tlDragStartX = e.clientX;
      tlDragStartOffsetX = tlOffsetX;
      tlCanvas.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('mouseup', () => { tlIsDragging = false; tlCanvas.style.cursor = 'grab'; });

  tlCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.3, Math.min(5, tlScale * factor));
    // Zoom toward mouse X
    const mx = e.offsetX;
    const worldX = (mx - MARGIN_L - tlOffsetX) / tlScale;
    tlScale = newScale;
    tlOffsetX = mx - MARGIN_L - worldX * tlScale;
    if (tlZoomSlider) tlZoomSlider.value = String(Math.round(tlScale * 10) / 10);
    tlRedraw();
  }, { passive: false });

  tlCanvas.addEventListener('click', e => {
    const hit = tlHitTest(e.offsetX, e.offsetY);
    if (hit) {
      showTlSide(hit);
    } else {
      tlSelectedId = null;
      if (tlSide) tlSide.classList.add('hidden');
    }
    tlRedraw();
  });

  // -- Message listener (for undo results & refreshes) 
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'tl-undo-result') {
      const node = tlNodes.find(n => n.id === msg.snapshotId);
      if (node && msg.success) {
        node.undone = true;
        node.color = TL_COLORS.undone;
        // Mark branch on subsequent nodes
        let pastUndo = false;
        tlNodes.forEach(n => {
          if (n.id === msg.snapshotId) { pastUndo = true; return; }
          if (pastUndo && !n.undone) n.branch = true;
        });
        // Refresh side panel if still showing this node
        if (tlSelectedId === msg.snapshotId) { showTlSide(node); }
      }
      tlRedraw();
    } else if (msg.type === 'tl-refresh') {
      // Full refresh: reload TIMELINE_DATA
      if (msg.data) {
        window.TIMELINE_DATA = msg.data;
        tlHistory    = msg.data.history    || [];
        tlSavePoints = msg.data.savePoints || [];
        tlBranchFrom = msg.data.branchFromId || null;
        tlNodes = buildNodes();
        tlCloseSide();
      }
      tlRedraw();
    } else if (msg.type === 'tl-promote-result') {
      const node = tlNodes.find(n => n.id === msg.snapshotId);
      if (node && msg.success) {
        node.isSavePoint = true;
        node.color = TL_COLORS.savepoint;
        if (tlSelectedId === msg.snapshotId) { showTlSide(node); }
      }
      tlRedraw();
    } else if (msg.type === 'tl-branch-result') {
      tlBranchFrom = msg.snapshotId || null;
      tlRedraw();
    }
  });

  // -- Redraw loop 
  function tlRedraw() { requestAnimationFrame(tlDraw); }

  // Initial render
  tlResize();
  setTimeout(tlFitAll, 150);
})();
`;
