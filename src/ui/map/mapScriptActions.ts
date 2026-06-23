// [SCOPE] Map Script Actions — window functions, side panel, toast, node actions
// Extracted from mapScript.ts (was lines 1-227). Keep under 200 lines.
// [WARN] Injected into webview <script>. No TypeScript features — plain JS strings only.

export const MAP_SCRIPT_ACTIONS = `
  // --- Initialization ---
  let vs;
  try { vs = acquireVsCodeApi(); } catch(e) { vs = window.vscode || null; }

  const canvas = document.getElementById('canvas');
  const sidePanel = document.getElementById('side-panel');
  const toast = document.getElementById('toast');

  if (!canvas || !sidePanel) { console.error('[Redivivus Map] ABORT: canvas or sidePanel not found'); return; }

  const ctx = canvas.getContext('2d');
  const COLORS = { good: '#4ec959', warn: '#f0a500', bad: '#e05555', neutral: '#7f849c' };
  const TYPE_COLORS = { entry: '#4a9eff', config: '#f5c400', ui: '#a855f7', service: '#00c9a7', default: '#6b7280' };
  const HEALTH_STROKE = { good: null, warn: '#f0a500', bad: '#e05555', neutral: null };

  // --- Data ---
  let nodes = (GRAPH_DATA.nodes || []).map(n => ({
    ...n, x: Math.random() * 800 + 50, y: Math.random() * 500 + 50, vx: 0, vy: 0,
    r: Math.max(12, Math.min(30, 10 + (n.lines || 0) / 20))
  }));
  const edges = GRAPH_DATA.edges || [];
  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });

  let selected = null, hovered = null;
  let scale = 1, offsetX = 0, offsetY = 0;
  let isDragging = false, dragNode = null, lastMX = 0, lastMY = 0, mouseDownX = 0, mouseDownY = 0;
  let simActive = true, simTick = 0;
  let layoutMode = 'network';

  // --- Window functions (called by side panel data-action buttons) ---
  window.closeSide = function() { sidePanel.classList.add('hidden'); selected = null; };

  window.doArchitectReview = function() {
    if (!vs) return;
    showToast('Analyzing architecture...');
    const inDeg = {}, outDeg = {};
    nodes.forEach(n => { inDeg[n.id] = 0; outDeg[n.id] = 0; });
    edges.forEach(e => { if (outDeg[e.source] !== undefined) outDeg[e.source]++; if (inDeg[e.target] !== undefined) inDeg[e.target]++; });
    const ranked = nodes.map(n => ({ id: n.id, label: n.label||'', lines: n.lines||0, health: n.health, todos: n.todos||0, warns: n.warns||0, in: inDeg[n.id]||0, out: outDeg[n.id]||0, total: (inDeg[n.id]||0)+(outDeg[n.id]||0) })).sort((a,b)=>b.total-a.total);
    const orphans = ranked.filter(n=>n.total===0);
    const hotspots = ranked.slice(0,5);
    const unhealthy = ranked.filter(n=>n.health==='bad'||n.health==='warn').slice(0,8);
    const large = ranked.filter(n=>n.lines>200).sort((a,b)=>b.lines-a.lines).slice(0,5);
    const violations = [];
    edges.forEach(e => {
      const src=e.source||'',tgt=e.target||'';
      if (/service|controller|handler|manager/i.test(src)&&/ui|view|component|screen|page|\.css|\.html/i.test(tgt)) violations.push(src+' -> '+tgt);
    });
    // [FIX] Prompt must NOT start with "You are a..." — Claude refuses user-role persona reassignment.
    // Frame as a data analysis task. Explicitly say this is graph topology, not source code.
    const hasData = nodes.length > 0;
    const prompt =
      'Analyze the following project dependency graph and give a structural assessment.\\n' +
      'This is file topology metadata (connections, line counts, health scores) -- not source code.\\n\\n' +
      'PROJECT STATS: '+nodes.length+' file'+(nodes.length!==1?'s':'')+', '+edges.length+' connection'+(edges.length!==1?'s':'')+'\\n\\n' +
      (hasData?'MOST CONNECTED FILES (hotspots):\\n'+hotspots.map(n=>'  '+n.id+' (in:'+n.in+' out:'+n.out+', '+n.lines+' lines, health:'+n.health+')').join('\\n')+'\\n\\n':'') +
      (orphans.length?'ISOLATED FILES (no connections -- possibly dead code):\\n'+orphans.map(n=>'  '+n.id+' ('+n.lines+' lines)').join('\\n')+'\\n\\n':'') +
      (unhealthy.length?'FILES WITH HEALTH ISSUES:\\n'+unhealthy.map(n=>'  '+n.id+' ('+n.health+', '+n.todos+' TODOs)').join('\\n')+'\\n\\n':'') +
      (large.length?'OVERSIZED FILES (over 200 lines):\\n'+large.map(n=>'  '+n.id+' ('+n.lines+' lines)').join('\\n')+'\\n\\n':'') +
      (violations.length?'LAYER VIOLATIONS (service imports UI):\\n'+violations.slice(0,5).map(v=>'  '+v).join('\\n')+'\\n\\n':'') +
      'Based on this topology data AND the actual file content below, provide a thorough architectural review:\\n\\n' +
      '1. **Structure pattern and health** — identify the pattern (layered, monolith, hub-and-spoke, etc.), flow direction, and whether separation of concerns is clean.\\n' +
      '2. **Coupling and dependency problems** — flag concrete classes instantiated inside constructors (tight coupling), missing interfaces or abstractions, and any file that imports more than it should.\\n' +
      '3. **Input validation gaps** — list every public method or CLI command that accepts user input without validating it (empty strings, out-of-range values, wrong types).\\n' +
      '4. **Error handling and resilience** — identify silent failures (errors swallowed without re-throw), missing error propagation, and places that could corrupt data on failure.\\n' +
      '5. **Type safety issues** — flag use of "any", unsafe casts, or untyped parsed data (e.g. JSON.parse results used without a typed interface).\\n' +
      '6. **Security concerns** — note side-effects on import, hardcoded paths, missing sanitization, or patterns that could be exploited.\\n' +
      '7. **Testability** — flag classes that are hard to unit-test because of tight coupling, no dependency injection, or global mutable state.\\n' +
      '8. **Prioritized quick-wins** — list 3-5 specific, concrete changes a developer could make today, each naming the exact file and line area. Order by impact.\\n' +
      '9. **Plain-English summary** (2-3 sentences) for a non-programmer.\\n\\n' +
      'Rules: be specific — name files and methods. Skip sections where there are no issues. No filler. No praise.';
    vs.postMessage({ type: 'architectReview', prompt: prompt });
  };

  window.doOpen = function() { if (window._selectedNode&&vs) { const n=window._selectedNode; vs.postMessage({type:'openFileAtSymbol',nodeId:n.id,label:n.label||'',logicFlow:n.logicFlow||''}); } };
  window.doConfirm = function() { if (window._selectedNode&&vs) { vs.postMessage({type:'confirmIntent',nodeId:window._selectedNode.id,confirmType:'file'}); showToast('Intent confirmed'); } };
  window.doFix = function(issueType) { if (window._selectedNode&&vs) { vs.postMessage({type:'fixFile',nodeId:window._selectedNode.id,issueType:issueType}); showToast('Fix started'); } };
  window.doChat = function() { if (window._selectedNode&&vs) { const n=window._selectedNode; vs.postMessage({type:'mapChat',nodeId:n.id,label:n.label,lines:n.lines,health:n.health,todos:n.todos}); } };
  window.doTrace = function() { if (window._selectedNode&&vs) { const n=window._selectedNode; vs.postMessage({type:'analyzeFile',nodeId:n.id,label:n.label,lines:n.lines,health:n.health,todos:n.todos,mode:'trace'}); showToast('Tracing logic...'); } };
  window.doTest = function() { if (window._selectedNode&&vs) { const n=window._selectedNode; vs.postMessage({type:'analyzeFile',nodeId:n.id,label:n.label,lines:n.lines,health:n.health,todos:n.todos,mode:'test'}); showToast('Generating tests...'); } };
  window.doImprove = function() { if (window._selectedNode&&vs) { const n=window._selectedNode; vs.postMessage({type:'analyzeFile',nodeId:n.id,label:n.label,lines:n.lines,health:n.health,todos:n.todos,mode:'improve'}); showToast('Analyzing...'); } };
  window.doRefactor = function() { if (window._selectedNode&&vs) { const n=window._selectedNode; vs.postMessage({type:'fixFile',nodeId:n.id,issueType:'refactor'}); showToast('Refactoring...'); } };
  window.doExplain = function() { if (window._selectedNode&&vs) { const n=window._selectedNode; vs.postMessage({type:'explainFile',nodeId:n.id,label:n.label,lines:n.lines,health:n.health,todos:n.todos}); showToast('Explaining...'); } };
  window.doDelegate = function(tag, idx) {
    if (!window._selectedNode||!vs) return;
    const n=window._selectedNode;
    const list = tag==='WARN'?n.warnTexts:tag==='TODO'?n.todoTexts:n.deadTexts;
    const text = (list&&list[idx])||'';
    const prompt = '['+tag+'] in \`'+n.id+'\`: '+text+'\\n\\nPlease address this annotation. Read the file, understand the context, and fix or resolve it.';
    vs.postMessage({type:'delegateAnnotation',nodeId:n.id,tag:tag,text:text,prompt:prompt});
    showToast('Delegating to AI...');
  };

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
  }

  function showSidePanel(n) {
    const hIcon = {good:'\u2705',warn:'\u26A0\uFE0F',bad:String.fromCharCode(55357,56628),neutral:'\u26AA'}[n.health]||'\u26AA';
    const roadmap = (n.refactorRoadmap||[]).map(r=>'<li>'+r+'</li>').join('');
    const fileName = n.id.split('/').pop();
    let html = '<div id="side-panel-scroll">';
    html += '<div class="side-close" data-action="close">✕</div>';
    html += '<div class="side-health">'+hIcon+'</div>';
    html += '<div class="side-filename">'+fileName+'</div>';
    html += '<div class="side-path">'+n.id+'</div>';
    html += '<div class="side-desc"><strong>What it does:</strong> '+(n.label||'No description provided.')+'</div>';
    html += '<div class="side-desc side-flow">'+(n.logicFlow||'No logic flow detected.')+'</div>';
    html += '<div class="side-stats"><span class="stat-chip">'+n.lines+' lines</span>';
    if (n.todos>0) html += '<span class="stat-chip warn">'+n.todos+' TODOs</span>';
    if (n.warns>0) html += '<span class="stat-chip warn">'+n.warns+' WARNs</span>';
    html += '</div>';
    if (n.isSledgehammer) html += '<div class="critique-box bad"><strong>Sledgehammer:</strong> Large file, low complexity.</div>';
    if (roadmap) html += '<div class="roadmap-box"><strong>Roadmap:</strong><ul>'+roadmap+'</ul></div>';
    function renderAnnotations(texts, tag) {
      if (!texts||!texts.length) return '';
      return texts.map(function(t,i){return '<div class="annot-row"><span class="annot-tag '+tag.toLowerCase()+'">'+tag+'</span><span class="annot-text">'+t.replace(/</g,'&lt;')+'</span><button class="delegate-btn" data-action="delegate" data-tag="'+tag+'" data-idx="'+i+'">&#9889; Delegate</button></div>';}).join('');
    }
    const annotHtml = renderAnnotations(n.warnTexts,'WARN')+renderAnnotations(n.todoTexts,'TODO')+renderAnnotations(n.deadTexts,'DEAD');
    if (annotHtml) html += '<div class="annot-list">'+annotHtml+'</div>';
    html += '<div id="eli5-container" class="eli5-loading"></div>';
    html += '</div>';
    html += '<div class="side-actions"><div class="action-grid">';
    html += '<button class="ag-btn primary" data-action="open">'+String.fromCharCode(55357,56516)+' Open</button>';
    html += '<button class="ag-btn primary" data-action="chat">'+String.fromCharCode(55357,56492)+' Chat</button>';
    html += '<button class="ag-btn" data-action="trace">'+String.fromCharCode(55357,56589)+' Trace Logic</button>';
    html += '<button class="ag-btn" data-action="explain">'+String.fromCharCode(55357,56481)+' Explain</button>';
    html += '<button class="ag-btn" data-action="test">'+String.fromCharCode(55358,56810)+' Write Tests</button>';
    html += '<button class="ag-btn" data-action="improve">'+String.fromCharCode(55357,56580)+' Better Approach</button>';
    html += '<button class="ag-btn" data-action="refactor">'+String.fromCharCode(55358,56825)+' Refactor</button>';
    html += '<button class="ag-btn" data-action="confirm">'+String.fromCharCode(55357,57057,65039)+' Why This?</button>';
    if (n.lines>200) html += '<button class="ag-btn warn" data-action="fix-largeFile">\u2702\uFE0F Split File</button>';
    if (n.todos>0) html += '<button class="ag-btn warn" data-action="fix-todo">'+String.fromCharCode(55357,56615)+' Fix TODOs</button>';
    if (!n.hasScope) html += '<button class="ag-btn warn" data-action="fix-uncommented">'+String.fromCharCode(55357,56541)+' Add Scope</button>';
    html += '</div></div>';
    sidePanel.innerHTML = html;
    sidePanel.classList.remove('hidden');
    window._selectedNode = n;
    if (n.health!=='good'&&vs) { const el=document.getElementById('eli5-container'); if(el)el.textContent='Guardian is translating...'; vs.postMessage({type:'getELI5',nodeId:n.id}); }
  }
`;
