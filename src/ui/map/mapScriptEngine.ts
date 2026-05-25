// [SCOPE] Map Script Engine — layouts, force simulation, draw loop, input handlers, message listener
// Extracted from mapScript.ts (was lines 228-531). Keep under 200 lines.
// [WARN] Injected into webview <script>. No TypeScript features — plain JS strings only.

export const MAP_SCRIPT_ENGINE = `
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
`;
