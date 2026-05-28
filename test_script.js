const GRAPH_DATA = {nodes: [{id:'toe.html', lines:0}], edges: []};
window = {
  addEventListener: () => {},
  vscode: { postMessage: () => {} }
};
document = {
  getElementById: (id) => ({
    classList: { add: () => {}, remove: () => {} },
    getContext: () => ({
      clearRect: () => {}, save: () => {}, translate: () => {}, scale: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
      arc: () => {}, fill: () => {}, stroke: () => {}, fillText: () => {}, restore: () => {}
    }),
    addEventListener: () => {}
  }),
  querySelectorAll: () => []
};
const acquireVsCodeApi = () => window.vscode;
// [SCOPE] Map Script Actions — window functions, side panel, toast, node actions
// Extracted from mapScript.ts (was lines 1-227). Keep under 200 lines.
// [WARN] Injected into webview <script>. No TypeScript features — plain JS strings only.

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
      'Based on this topology data, provide:\\n' +
      '1. Overall structure pattern and health (e.g. monolith, layered, hub-and-spoke)\\n' +
      '2. Top structural problems with specific file names\\n' +
      '3. Quick wins a developer could do today\\n' +
      '4. Plain-English summary (1-2 sentences) for a non-programmer\\n' +
      'Be direct. No filler.';
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
    const prompt = '['+tag+'] in \'+n.id+'\: '+text+'\\n\\nPlease address this annotation. Read the file, understand the context, and fix or resolve it.';
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
;
// [SCOPE] Map Script Engine — layouts, force simulation, draw loop, input handlers, message listener
// Extracted from mapScript.ts (was lines 228-531). Keep under 200 lines.
// [WARN] Injected into webview <script>. No TypeScript features — plain JS strings only.

  // --- Layouts ---
  const clusterCenters = {};
  function setupLayouts() {
    const dirs = {};
    nodes.forEach(n => { const parts=n.id.split('/'); parts.pop(); const d=parts.join('/')||'/'; if(!dirs[d])dirs[d]=[]; dirs[d].push(n); });
    const sortedDirs = Object.keys(dirs).sort();
    const radius = Math.max(350, sortedDirs.length * 70);
    sortedDirs.forEach((d,i) => { const angle=(i/Math.max(1,sortedDirs.length))*Math.PI*2; clusterCenters[d]={x:Math.cos(angle)*radius,y:Math.sin(angle)*radius}; });
    let currentY = 0;
    sortedDirs.forEach(d => {
      const dirNodes=dirs[d]; let currentX=-400;
      dirNodes.forEach((n,idx) => { if(idx>0&&idx%10===0){currentY+=100;currentX=-400;} n.targetX=currentX; n.targetY=currentY; currentX+=120; });
      currentY += 180;
    });
  }
  setupLayouts();

  function resize() {
    const p = canvas.parentElement;
    console.log('[Redivivus Map] resize() - parent:', p, 'canvas:', canvas);
    if (!p) { console.log('[Redivivus Map] resize: no parent, aborting'); return; }
    const w=p.clientWidth, h=p.clientHeight;
    console.log('[Redivivus Map] resize() - w:', w, 'h:', h);
    if (w>0&&h>0) { canvas.width=w; canvas.height=h; simActive=true; simTick=0; }
  }
  if (typeof ResizeObserver !== 'undefined') { new ResizeObserver(resize).observe(canvas.parentElement); }
  window.addEventListener('resize', resize);
  setTimeout(resize, 50); setTimeout(resize, 300); resize();

  // --- Simulation ---
  function simulate() {
    if (!simActive) return;
    simTick++;
    const cx=(canvas.width/2-offsetX)/scale, cy=(canvas.height/2-offsetY)/scale;
    if (layoutMode !== 'hierarchy') {
      for (let i=0;i<nodes.length;i++) {
        for (let j=i+1;j<nodes.length;j++) {
          const a=nodes[i],b=nodes[j],dx=b.x-a.x,dy=b.y-a.y;
          const distSq=dx*dx+dy*dy||1,f=Math.min(8000/distSq,10);
          a.vx-=(dx/Math.sqrt(distSq))*f; a.vy-=(dy/Math.sqrt(distSq))*f;
          b.vx+=(dx/Math.sqrt(distSq))*f; b.vy+=(dy/Math.sqrt(distSq))*f;
        }
      }
      edges.forEach(e => {
        const a=nodeMap[e.from],b=nodeMap[e.to];
        if (a&&b) { const dx=b.x-a.x,dy=b.y-a.y,dist=Math.sqrt(dx*dx+dy*dy)||1,f=(dist-180)*0.04; a.vx+=(dx/dist)*f; a.vy+=(dy/dist)*f; b.vx-=(dx/dist)*f; b.vy-=(dy/dist)*f; }
      });
    }
    nodes.forEach(n => {
      if (n===dragNode) return;
      let tx=cx,ty=cy,pull=0.002;
      if (layoutMode==='hierarchy') { tx=cx+n.targetX; ty=cy+n.targetY-150; pull=0.12; }
      else if (layoutMode==='clustered') { const parts=n.id.split('/'); parts.pop(); const d=parts.join('/')||'/'; const c=clusterCenters[d]; if(c){tx=cx+c.x;ty=cy+c.y;} pull=0.015; }
      n.vx+=(tx-n.x)*pull; n.vy+=(ty-n.y)*pull;
      n.vx*=0.84; n.vy*=0.84; n.x+=n.vx; n.y+=n.vy;
    });
    if (simTick>300) simActive=false;
  }

  // --- Draw ---
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save(); ctx.translate(offsetX,offsetY); ctx.scale(scale,scale);
    const connectedIds=new Set();
    if (selected) { connectedIds.add(selected.id); edges.forEach(e=>{if(e.from===selected.id)connectedIds.add(e.to);if(e.to===selected.id)connectedIds.add(e.from);}); }
    edges.forEach(e => {
      const a=nodeMap[e.from],b=nodeMap[e.to]; if(!a||!b) return;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      if (selected) { ctx.strokeStyle=(e.from===selected.id||e.to===selected.id)?'#cba6f7':'rgba(150,160,190,0.05)'; ctx.lineWidth=(e.from===selected.id||e.to===selected.id)?2:1; }
      else { ctx.strokeStyle='rgba(150,160,190,0.2)'; ctx.lineWidth=1; }
      if (e.isDeadEnd) ctx.setLineDash([5,5]);
      if (e.isScenicRoute) ctx.strokeStyle='rgba(240,165,0,0.4)';
      ctx.stroke(); ctx.setLineDash([]);
    });
    nodes.forEach(n => {
      const isSelected=selected&&selected.id===n.id, isHovered=hovered&&hovered.id===n.id;
      const isDimmed=selected&&!isSelected&&!connectedIds.has(n.id);
      const fname=n.id.split('/').pop()||'', ext=fname.includes('.')?fname.split('.').pop():'';
      const isEntry=/^(main|index|app|server|start)\./i.test(fname);
      const isConfig=/^(config|settings|constants|env|\.env)/i.test(fname)||ext==='json'||ext==='yaml'||ext==='yml'||ext==='toml';
      const isUI=n.isUI||ext==='css'||ext==='scss'||ext==='html'||ext==='vue'||ext==='svelte'||/ui|view|component|screen|page/i.test(fname);
      const isService=/service|controller|handler|manager|router|provider|api|client/i.test(fname);
      const r=n.r;
      ctx.beginPath();
      if (isEntry) { ctx.moveTo(n.x,n.y-r*1.2); ctx.lineTo(n.x+r*1.1,n.y+r*0.7); ctx.lineTo(n.x-r*1.1,n.y+r*0.7); ctx.closePath(); }
      else if (isConfig) { ctx.moveTo(n.x,n.y-r*1.2); ctx.lineTo(n.x+r*1.1,n.y); ctx.lineTo(n.x,n.y+r*1.2); ctx.lineTo(n.x-r*1.1,n.y); ctx.closePath(); }
      else if (isUI) { for(let i=0;i<6;i++){const a=(Math.PI/3)*i-Math.PI/6,px=n.x+r*1.1*Math.cos(a),py=n.y+r*1.1*Math.sin(a);i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);} ctx.closePath(); }
      else if (isService) { const rr=r*0.35,w=r*1.6,h=r*1.1; ctx.roundRect?ctx.roundRect(n.x-w,n.y-h,w*2,h*2,rr):(ctx.rect(n.x-w,n.y-h,w*2,h*2)); }
      else { ctx.arc(n.x,n.y,r,0,Math.PI*2); }
      const typeKey=isEntry?'entry':isConfig?'config':isUI?'ui':isService?'service':'default';
      ctx.fillStyle=TYPE_COLORS[typeKey];
      ctx.globalAlpha=isDimmed?0.08:(isSelected||isHovered?1:0.85); ctx.fill();
      const healthStroke=HEALTH_STROKE[n.health];
      if (isSelected){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();}
      else if (isHovered){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}
      else if (healthStroke&&!isDimmed){ctx.strokeStyle=healthStroke;ctx.lineWidth=2.5;ctx.globalAlpha=0.9;ctx.stroke();}
      ctx.globalAlpha=1;
      if (!isDimmed){ctx.fillStyle='#cdd6f4';ctx.textAlign='center';ctx.font=(11/scale)+'px sans-serif';ctx.fillText(fname,n.x,n.y+r+14/scale);}
    });
    ctx.restore();
  }

  function frame() { simulate(); draw(); requestAnimationFrame(frame); }
  function startWhenReady() {
    console.log('[Redivivus Map] startWhenReady() called - canvas:', canvas.width, 'x', canvas.height);
    if(canvas.width>0&&canvas.height>0){console.log('[Redivivus Map] canvas ready, starting frame loop');frame();}else{resize();setTimeout(startWhenReady,50);}
  }
  startWhenReady();

  // --- Input ---
  function hitTest(ex,ey) { const wx=(ex-offsetX)/scale,wy=(ey-offsetY)/scale; return nodes.find(n=>(wx-n.x)**2+(wy-n.y)**2<=n.r*n.r); }

  canvas.addEventListener('mousedown', e => { lastMX=e.clientX;lastMY=e.clientY;mouseDownX=e.clientX;mouseDownY=e.clientY;dragNode=hitTest(e.offsetX,e.offsetY);if(!dragNode)isDragging=true; });
  window.addEventListener('mousemove', e => {
    if (dragNode){dragNode.x+=(e.clientX-lastMX)/scale;dragNode.y+=(e.clientY-lastMY)/scale;simActive=true;simTick=0;}
    else if (isDragging){offsetX+=e.clientX-lastMX;offsetY+=e.clientY-lastMY;}
    lastMX=e.clientX;lastMY=e.clientY;
    const rect=canvas.getBoundingClientRect();
    if (e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom){const hit=hitTest(e.offsetX,e.offsetY);if(hit!==hovered){hovered=hit;simActive=true;simTick=0;}}
  });
  window.addEventListener('mouseup', () => { dragNode=null; isDragging=false; });
  window.addEventListener('wheel', e => {
    e.preventDefault();
    const newScale=Math.max(0.1,Math.min(5,scale-e.deltaY*0.001));
    const rect=canvas.getBoundingClientRect();
    if (e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom) return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const wx=(mx-offsetX)/scale,wy=(my-offsetY)/scale;
    scale=newScale; offsetX=mx-wx*scale; offsetY=my-wy*scale;
  }, {passive:false});

  canvas.addEventListener('mouseup', e => {
    const dx=Math.abs(e.clientX-mouseDownX),dy=Math.abs(e.clientY-mouseDownY);
    if (dx<5&&dy<5){const hit=hitTest(e.offsetX,e.offsetY);if(hit){selected=hit;showSidePanel(hit);}else{selected=null;sidePanel.classList.add('hidden');}}
  });

  sidePanel.addEventListener('click', e => {
    const btn=e.target.closest('[data-action]'); if(!btn||!window._selectedNode) return;
    const action=btn.getAttribute('data-action');
    if (action==='close') window.closeSide();
    else if (action==='open') window.doOpen();
    else if (action==='confirm') window.doConfirm();
    else if (action==='chat') window.doChat();
    else if (action==='trace') window.doTrace();
    else if (action==='explain') window.doExplain();
    else if (action==='test') window.doTest();
    else if (action==='improve') window.doImprove();
    else if (action==='refactor') window.doRefactor();
    else if (action&&action.startsWith('fix-')) window.doFix(action.slice(4));
    else if (action==='delegate') window.doDelegate(btn.getAttribute('data-tag'),parseInt(btn.getAttribute('data-idx')||'0',10));
  });

  window.addEventListener('message', e => {
    if (e.data.type==='eli5-response'&&window._selectedNode&&e.data.nodeId===window._selectedNode.id){
      const el=document.getElementById('eli5-container');
      if (el) el.innerHTML='<div class="eli5-box"><strong>Guardian ELI5:</strong><br>'+e.data.text+'</div>';
    }
  });

  const refreshBtn=document.getElementById('refresh-btn'); if(refreshBtn)refreshBtn.onclick=()=>{if(vs)vs.postMessage({type:'refresh'});};
  const backBtn=document.getElementById('back-btn'); if(backBtn)backBtn.onclick=()=>{if(vs)vs.postMessage({type:'back-to-chat'});};
  const architectBtn=document.getElementById('architect-btn'); if(architectBtn)architectBtn.onclick=()=>window.doArchitectReview();
  // [Redivivus] Exposed so the timeline view switcher can set layout state without re-dispatching events
  window.setLayoutMode = function(mode) { layoutMode=mode; simActive=true; simTick=0; };
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.onclick=(e)=>{document.querySelectorAll('.layout-btn').forEach(b=>b.classList.remove('active'));const t=e.currentTarget;t.classList.add('active');layoutMode=t.dataset.layout;simActive=true;simTick=0;};
  });
;
