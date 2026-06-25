// [SCOPE] Behavior Panel popover in the Chat Panel Header
export function buildBehaviorPopoverScript(): string {
  return `
    let behaviorPopover = document.getElementById('behavior-popover');
    if (!behaviorPopover) {
      behaviorPopover = document.createElement('div');
      behaviorPopover.id = 'behavior-popover';
      behaviorPopover.style.cssText = 'display:none;position:absolute;top:40px;right:10px;background:var(--vscode-editor-background);border:1px solid var(--vscode-focusBorder);border-radius:8px;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,0.35);z-index:9999;width:320px;';
      
      const content = \`
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-size:12px; font-weight:bold; margin-bottom:4px;">🎛️ AI Behavior Panel</div>
            <div style="font-size:10px; color:var(--vscode-descriptionForeground); margin-bottom:12px;">Session Overrides (resets on new chat)</div>
          </div>
          <button id="pop-therm-reset" title="Reset to defaults" style="background:transparent; border:none; color:var(--vscode-descriptionForeground); cursor:pointer; font-size:12px; padding:2px; opacity:0.8;">↺ Reset</button>
        </div>
        <div style="display:flex; justify-content:space-between; gap:4px; height:140px; align-items:flex-end;">
          <div style="display:flex; flex-direction:column; justify-content:space-between; height:100px; font-size:9px; color:var(--vscode-descriptionForeground); text-align:right; padding-right:4px; margin-bottom:28px;">
            <div>🔥 Experimental</div>
            <div>Creative</div>
            <div>Balanced</div>
            <div>Stable</div>
            <div>❄️ Consistent</div>
          </div>
          \${renderPopTherm('visual', '🎨', 'Visual', '0.75')}
          \${renderPopTherm('mechanics', '⚙️', 'Mechanics', '0.50')}
          \${renderPopTherm('logic', '🧠', 'Logic', '0.25')}
          \${renderPopTherm('data', '🗄️', 'Data', '0.10')}
          \${renderPopTherm('security', '🔒', 'Security', '0.00', true)}
        </div>
      \`;
      
      behaviorPopover.innerHTML = content;
      document.body.appendChild(behaviorPopover);
    }

    const THERM_TIPS = {
      visual:    'Visual (0-1): Controls creativity in UI, colors, animations and layout. High = more experimental visuals. Low = conventional, safe styling.',
      mechanics: 'Mechanics (0-1): Controls game logic, physics and interaction systems. High = creative approaches. Low = predictable, well-tested patterns.',
      logic:     'Logic (0-1): Controls algorithms, conditions and data flow. Low = more deterministic, reliable code. High = novel but riskier logic.',
      data:      'Data (0-1): Controls data structures and persistence patterns. Low = safer, conventional patterns. High = experimental data design.',
      security:  'Security: Always fixed at 0.00. Security code must be fully deterministic with zero creativity — no exceptions.',
    };

    function renderPopTherm(id, icon, label, defaultVal, locked = false) {
      const lockedStyle = locked ? 'opacity: 0.6; cursor: not-allowed;' : 'cursor: pointer;';
      const tip = THERM_TIPS[id] || '';
      const tooltip = locked ? 'title="Fixed for project safety — security code must be fully deterministic"' : ('title="' + tip + '"');
      return \`
        <div style="display:flex; flex-direction:column; align-items:center; flex:1;" \${tooltip}>
          <div class="pop-therm-track" data-domain="\${id}" style="position:relative; width:16px; height:100px; background:var(--vscode-input-background); border-radius:8px; border:1px solid var(--vscode-dropdown-border); overflow:hidden; \${lockedStyle}; margin-bottom:4px;">
            <div class="pop-therm-fill" id="pop-therm-\${id}" data-val="\${defaultVal}" style="position:absolute; bottom:0; left:0; width:100%; height:\${parseFloat(defaultVal)*100}%; background:linear-gradient(to top, #3b82f6, #ef4444); transition:height 0.2s ease, background 0.2s ease;"></div>
          </div>
          <div style="font-size:12px; margin-bottom:2px;">\${icon}</div>
          <div style="font-size:9px; font-weight:bold;">\${label}</div>
          <div style="font-size:8px; color:var(--vscode-descriptionForeground);" id="pop-therm-label-\${id}">\${defaultVal}</div>
        </div>
      \`;
    }

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#header-behavior-btn');
      if (btn) {
        behaviorPopover.style.display = behaviorPopover.style.display === 'none' ? 'block' : 'none';
        return;
      }
      if (e.target.closest('#pop-therm-reset')) {
        const defaults = { visual: 0.75, mechanics: 0.50, logic: 0.25, data: 0.10, security: 0.00 };
        Object.keys(defaults).forEach(d => {
          const fill = document.getElementById('pop-therm-' + d);
          const label = document.getElementById('pop-therm-label-' + d);
          if (fill && label) {
            fill.style.height = (defaults[d] * 100) + '%';
            fill.dataset.val = defaults[d].toFixed(2);
            label.innerText = defaults[d].toFixed(2);
          }
        });
        vscode.postMessage({ type: 'session-override-temperature', temperature: defaults });
        return;
      }
      if (!e.target.closest('#behavior-popover')) {
        behaviorPopover.style.display = 'none';
      }
    });

    let isDraggingPop = false;
    let activePopTherm = null;

    function updatePopTherm(track, clientY) {
      if (track.style.cursor === 'not-allowed') return;
      const rect = track.getBoundingClientRect();
      let pos = rect.bottom - clientY;
      pos = Math.max(0, Math.min(rect.height, pos));
      
      const pct = pos / rect.height;
      const fill = track.querySelector('.pop-therm-fill');
      const domain = track.getAttribute('data-domain');
      const label = document.getElementById('pop-therm-label-' + domain);
      
      const snappedPct = Math.round(pct * 20) / 20;
      
      if (fill) {
        fill.style.height = (snappedPct * 100) + '%';
        fill.dataset.val = snappedPct.toFixed(2);
      }
      if (label) {
        label.innerText = snappedPct.toFixed(2);
      }
      
      // Instantly dispatch the override payload
      const payload = {};
      document.querySelectorAll('.pop-therm-fill').forEach(f => {
        const d = f.id.replace('pop-therm-', '');
        payload[d] = parseFloat(f.dataset.val);
      });
      vscode.postMessage({ type: 'session-override-temperature', temperature: payload });
    }

    document.addEventListener('mousedown', (e) => {
      const track = e.target.closest('.pop-therm-track');
      if (track && track.style.cursor !== 'not-allowed') {
        isDraggingPop = true;
        activePopTherm = track;
        updatePopTherm(activePopTherm, e.clientY);
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isDraggingPop && activePopTherm) {
        updatePopTherm(activePopTherm, e.clientY);
      }
    });

    document.addEventListener('mouseup', () => {
      isDraggingPop = false;
      activePopTherm = null;
    });

    // Listen for state restore or blueprint load to update the popover values
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'update-behavior-panel') {
        if (msg.temperature) {
          Object.keys(msg.temperature).forEach(domain => {
            const fill = document.getElementById('pop-therm-' + domain);
            const label = document.getElementById('pop-therm-label-' + domain);
            if (fill && label) {
              fill.style.height = (msg.temperature[domain] * 100) + '%';
              fill.dataset.val = msg.temperature[domain].toFixed(2);
              label.innerText = msg.temperature[domain].toFixed(2);
            }
          });
        }
      }
    });
  `;
}
