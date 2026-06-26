// [SCOPE] Visual Contract Editor — webview HTML + embedded client JS

import type { VisualContract } from '../../../services/visualContract/visualContractTypes.js';

export function getVisualContractHtml(nonce: string, initialContract?: VisualContract): string {
  const contractJson = initialContract ? JSON.stringify(initialContract).replace(/</g, '\\u003c') : 'null';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#1e1e2e;color:#cdd6f4;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#181825;border-bottom:1px solid #313244;flex-shrink:0}
header h1{font-size:14px;font-weight:600;flex:1}
.mode-toggle{display:flex;gap:0;border:1px solid #45475a;border-radius:6px;overflow:hidden}
.mode-toggle button{padding:4px 12px;font-size:12px;background:transparent;color:#a6adc8;border:none;cursor:pointer}
.mode-toggle button.active{background:#89b4fa;color:#1e1e2e;font-weight:600}
.apply-btn{padding:5px 14px;background:#a6e3a1;color:#1e1e2e;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer}
.apply-btn:disabled{background:#45475a;color:#6c7086;cursor:not-allowed}
.tabs{display:flex;gap:2px;padding:8px 14px 0;background:#181825;flex-shrink:0}
.tabs button{padding:6px 14px;font-size:12px;background:transparent;color:#a6adc8;border:1px solid transparent;border-radius:6px 6px 0 0;cursor:pointer;border-bottom:none}
.tabs button.active{background:#1e1e2e;color:#cdd6f4;border-color:#313244}
.canvas{flex:1;overflow-y:auto;padding:14px}
.empty{color:#6c7086;font-size:13px;padding:20px}
.prop-list{display:flex;flex-direction:column;gap:1px}
.prop-row{display:flex;align-items:center;gap:6px;padding:0 6px;background:#181825;height:24px;overflow:hidden;border-bottom:1px solid #23243a;cursor:pointer}
.prop-row:hover{background:#1e1e2e}
.prop-row.active{background:#0d1f2d;outline:1px solid #89b4fa;outline-offset:-1px}
@keyframes propPulse{0%,100%{outline-color:#89b4fa}50%{outline-color:#cdd6f4}}
.prop-row label{flex:1;font-size:11px;color:#a6adc8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;cursor:default}
.prop-row input[type=color]{width:22px;height:16px;border:none;border-radius:2px;cursor:pointer;background:transparent;padding:0;flex-shrink:0}
.prop-row input[type=text]{flex:1;padding:1px 5px;background:#313244;border:1px solid #45475a;border-radius:3px;color:#cdd6f4;font-size:11px;min-width:0}
.prop-row input[type=range]{flex:1;accent-color:#89b4fa;min-width:0}
.prop-row .num-val{width:42px;padding:1px 4px;background:#313244;border:1px solid #45475a;border-radius:3px;color:#cdd6f4;font-size:11px;text-align:right;flex-shrink:0}
.prop-row .num-val-unit{font-size:10px;color:#6c7086;width:22px;flex-shrink:0}
.sections{display:flex;flex-direction:column;gap:8px}
.section-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#181825;border:1px solid #313244;border-radius:8px}
.section-row span{font-size:13px}
.section-tag{font-size:10px;color:#89b4fa;background:#1e1e2e;border:1px solid #313244;border-radius:4px;padding:2px 6px;margin-right:8px}
.add-sec-btn{padding:8px 14px;background:#313244;border:1px solid #45475a;border-radius:6px;color:#cdd6f4;font-size:12px;cursor:pointer;width:100%;margin-top:8px}
.add-sec-row{display:flex;gap:6px;margin-top:8px}
.add-sec-input{flex:1;padding:6px 8px;background:#313244;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;font-size:13px}
.status{font-size:11px;color:#a6e3a1;margin-left:auto;opacity:0}
.status.show{opacity:1}
.ctx{font-size:10px;color:#585b70;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style></head><body>
<header>
  <h1>✏️ Visual Editor</h1>
  <span class="status" id="status">Saved</span>
  <div class="mode-toggle">
    <button id="plainBtn" class="active">Plain</button>
    <button id="proBtn">Pro</button>
  </div>
  <button class="apply-btn" id="applyBtn">Apply All</button>
</header>
<div class="tabs" id="tabs"></div>
<div class="canvas" id="canvas"></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let contract = ${contractJson}, mode = 'plain', activeTab = 'colors', pending = {};

const TABS = ['colors','text','layout','effects','structure'];
const TAB_LABELS = {colors:'🎨 Colors',text:'✏️ Text',layout:'📐 Layout',effects:'✨ Effects',structure:'🧱 Structure'};

window.addEventListener('message', e => {
  const msg = e.data;
  console.log('[Redivivus][VisualEditor] webview received message:', msg.type, JSON.stringify(msg).slice(0, 200));
  if (msg.type === 'load-contract') { contract = msg.contract; render(); }
  if (msg.type === 'patch-ack') {
    if (msg.ok) { pending = {}; } else { document.getElementById('applyBtn').disabled = false; }
    showStatus(msg.ok ? 'Saved ✓' : '⚠ ' + msg.message, !msg.ok);
  }
});

function setMode(m) {
  mode = m;
  document.getElementById('plainBtn').classList.toggle('active', m === 'plain');
  document.getElementById('proBtn').classList.toggle('active', m === 'pro');
  render();
}

function render() {
  if (!contract) return;
  const visibleTabs = mode === 'plain' ? TABS.filter(t => t !== 'structure') : TABS;
  const tabsEl = document.getElementById('tabs');
  tabsEl.innerHTML = visibleTabs.map(t =>
    \`<button class="\${t===activeTab?'active':''}" data-tab="\${t}">\${TAB_LABELS[t]}</button>\`
  ).join('');
  if (!visibleTabs.includes(activeTab)) { activeTab = visibleTabs[0]; }
  renderTab();
}

function switchTab(t) { activeTab = t; render(); }

function renderTab() {
  const el = document.getElementById('canvas');
  if (!contract) { el.innerHTML = '<div class="empty">No project loaded.</div>'; return; }
  if (activeTab === 'structure') { renderStructure(el); return; }
  const props = contract.properties.filter(p =>
    p.category === activeTab && (mode === 'pro' || !p.proOnly)
  );
  if (!props.length) { el.innerHTML = '<div class="empty">No ' + activeTab + ' properties found in this project.</div>'; return; }
  el.innerHTML = '<div class="prop-list">' + props.map(renderProp).join('') + '</div>';
}

function renderProp(p) {
  const cur = pending[p.id] !== undefined ? pending[p.id] : p.value;
  if (p.type === 'color') return \`<div class="prop-row" title="\${escH(p.label)}\${p.selectorCtx?' ('+escH(p.selectorCtx)+')':''}">
    <input type="color" data-id="\${p.id}" data-label="\${escQ(p.label)}" value="\${toHex(cur)}">
    <label>\${escH(p.label)}</label></div>\`;
  if (p.type === 'text') return \`<div class="prop-row"><label title="\${escH(p.label)}">\${escH(p.label)}</label>
    <input type="text" data-id="\${p.id}" data-label="\${escQ(p.label)}" value="\${escH(cur)}"></div>\`;
  if (p.type === 'number') return \`<div class="prop-row"><label title="\${escH(p.label)}">\${escH(p.label)}</label>
    <input type="range" data-id="\${p.id}" data-label="\${escQ(p.label)}" data-peer="num-\${p.id}" min="0" max="\${numMax(p)}" step="\${numStep(p)}" value="\${cur}">
    <input class="num-val" type="number" id="num-\${p.id}" data-id="\${p.id}" data-label="\${escQ(p.label)}" data-peer-range="true" min="0" max="\${numMax(p)}" value="\${cur}">
    <span class="num-val-unit">\${p.unit||''}</span></div>\`;
  return '';
}

function renderStructure(el) {
  const secs = contract.sections || [];
  let html = '<div class="sections">';
  if (!secs.length) html += '<div class="empty">No named sections detected.</div>';
  secs.forEach(s => { html += \`<div class="section-row"><span class="section-tag">&lt;\${s.elementTag}&gt;</span><span>\${escH(s.label)}</span></div>\`; });
  html += \`<button class="add-sec-btn" id="addSecBtn">+ Add Section</button>
  <div id="addSecRow" class="add-sec-row" style="display:none">
    <input class="add-sec-input" id="addSecInput" placeholder="Describe section (e.g. Contact form with email field)">
    <button class="apply-btn" id="submitSecBtn">Add</button>
  </div></div>\`;
  el.innerHTML = html;
}

function showAddSection() {
  document.getElementById('addSecRow').style.display = 'flex';
  document.getElementById('addSecInput').focus();
}

function submitAddSection() {
  const desc = document.getElementById('addSecInput').value.trim();
  if (!desc) return;
  vscode.postMessage({ type: 'add-section', description: desc });
  document.getElementById('addSecInput').value = '';
  document.getElementById('addSecRow').style.display = 'none';
  showStatus('Building section…');
}

function setPending(id, value, label) {
  pending[id] = value;
  document.getElementById('applyBtn').disabled = false;
  vscode.postMessage({ type: 'property-changed', id, value, label, immediate: false });
}

function applyAll() {
  if (!Object.keys(pending).length) return;
  vscode.postMessage({ type: 'apply-all', pending: Object.assign({}, pending) });
  document.getElementById('applyBtn').disabled = true;
  // pending is NOT cleared here — cleared in patch-ack on success so errors can be retried
}

function showStatus(msg, isErr) {
  const el = document.getElementById('status');
  el.textContent = msg; el.style.color = isErr ? '#f38ba8' : '#a6e3a1'; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), isErr ? 6000 : 2000);
}

function toHex(v) {
  if (!v) return '#000000';
  if (v.startsWith('#')) { return v.length === 4 ? '#'+[...v.slice(1)].map(c=>c+c).join('') : v.slice(0,7); }
  const m = v.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
  if (m) return '#'+[m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
  return '#000000';
}
function numMax(p) { return p.unit==='%'?100:p.unit==='em'||p.unit==='rem'?10:200; }
function numStep(p) { return p.unit==='em'||p.unit==='rem'?0.1:1; }
function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escQ(s) { return String(s).replace(/'/g,"\\\\'"); }
document.getElementById('plainBtn').addEventListener('click', () => setMode('plain'));
document.getElementById('proBtn').addEventListener('click', () => setMode('pro'));
document.getElementById('applyBtn').addEventListener('click', applyAll);
document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { activeTab = b.dataset.tab; render(); } });
document.getElementById('canvas').addEventListener('input', e => { const el = e.target.closest('[data-id]'); if (!el) return; const peer = el.dataset.peer && document.getElementById(el.dataset.peer); if (peer) peer.value = el.value; setPending(el.dataset.id, el.value, el.dataset.label || ''); });
document.getElementById('canvas').addEventListener('change', e => { const el = e.target.closest('[data-id]'); if (!el || el.type === 'range') return; if (el.dataset.peerRange) { const prev = el.previousElementSibling; if (prev) prev.value = el.value; } setPending(el.dataset.id, el.value, el.dataset.label || ''); });
document.getElementById('canvas').addEventListener('click', e => { if (e.target.closest('#addSecBtn')) showAddSection(); if (e.target.closest('#submitSecBtn')) submitAddSection(); });
if (contract) { render(); }
</script></body></html>`;
}
