// [SCOPE] Chat Panel embedded Visual Editor script — drawer JS, injected into chat panel webview

export function buildVEScript(): string {
  return `
var veContract=null,vePending={},veMode='plain',veActiveTab='colors';
var VE_TABS=['colors','text','layout','effects'];
var VE_LABELS={colors:'🎨 Colors',text:'✏️ Text',layout:'📏 Layout',effects:'✨ Effects'};

function veToHex(v){if(!v)return'#000000';if(v.startsWith('#'))return v.length===4?'#'+[...v.slice(1)].map(function(c){return c+c;}).join(''):v.slice(0,7);var m=v.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);if(m)return'#'+[m[1],m[2],m[3]].map(function(n){return parseInt(n).toString(16).padStart(2,'0');}).join('');return'#000000';}
function veNumMax(p){return p.unit==='%'?100:p.unit==='em'||p.unit==='rem'?10:200;}
function veNumStep(p){return p.unit==='em'||p.unit==='rem'?0.1:1;}
function veEscH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function veRenderProp(p){
  var cur=vePending[p.id]!==undefined?vePending[p.id]:p.value;
  var row='<div class="ve-row" data-prop-id="'+p.id+'" data-prop-label="'+veEscH(p.label)+'" data-prop-ctx="'+veEscH(p.selectorCtx||'')+'">';
  if(p.type==='color'){row+='<input type="color" data-id="'+p.id+'" value="'+veToHex(cur)+'"><label title="'+veEscH(p.label)+'">'+veEscH(p.label)+'</label>';}
  else if(p.type==='text'){row+='<label>'+veEscH(p.label)+'</label><input type="text" data-id="'+p.id+'" value="'+veEscH(cur)+'">';}
  else if(p.type==='number'){row+='<label>'+veEscH(p.label)+'</label><input type="range" data-id="'+p.id+'" data-peer="ve-num-'+p.id+'" min="0" max="'+veNumMax(p)+'" step="'+veNumStep(p)+'" value="'+cur+'"><input class="ve-num" type="number" id="ve-num-'+p.id+'" data-id="'+p.id+'" data-peer-range="true" value="'+cur+'"><span class="ve-unit">'+(p.unit||'')+'</span>';}
  return row+'</div>';
}

function veRenderTab(){
  var el=document.getElementById('ve-canvas');if(!el||!veContract)return;
  var props=veContract.properties.filter(function(p){return p.category===veActiveTab&&(veMode==='pro'||!p.proOnly);});
  el.innerHTML=props.length?'<div class="ve-list">'+props.map(veRenderProp).join('')+'</div>':'<div class="ve-empty">No '+veActiveTab+' properties found.</div>';
}

function veRender(){
  if(!veContract)return;
  var tabs=document.getElementById('ve-tabs');
  if(tabs)tabs.innerHTML=VE_TABS.map(function(t){return'<button class="'+(t===veActiveTab?'active':'')+'" data-ve-tab="'+t+'">'+VE_LABELS[t]+'</button>';}).join('');
  veRenderTab();
}

function veSetPending(id,value){vePending[id]=value;var b=document.getElementById('ve-apply');if(b)b.disabled=false;}

function veApplyAll(){
  if(!Object.keys(vePending).length||!veContract)return;
  vscode.postMessage({type:'visual-apply-all',pending:Object.assign({},vePending),projectRoot:veContract.projectRoot});
  var b=document.getElementById('ve-apply');if(b)b.disabled=true;
}

function veShowStatus(msg,isErr){
  var el=document.getElementById('ve-status');if(!el)return;
  el.textContent=msg;el.style.color=isErr?'#f38ba8':'#a6e3a1';el.classList.add('show');
  setTimeout(function(){el.classList.remove('show');},isErr?6000:2500);
}

function veOpen(contract){
  veContract=contract;vePending={};
  var d=document.getElementById('ve-drawer');if(d)d.classList.add('open');
  var b=document.getElementById('ve-apply');if(b)b.disabled=true;
  veRender();
}

function veClose(){var d=document.getElementById('ve-drawer');if(d)d.classList.remove('open');}

document.getElementById('ve-close').addEventListener('click',veClose);
document.getElementById('ve-apply').addEventListener('click',veApplyAll);
document.getElementById('ve-plain').addEventListener('click',function(){veMode='plain';document.getElementById('ve-plain').classList.add('active');document.getElementById('ve-pro').classList.remove('active');veRenderTab();});
document.getElementById('ve-pro').addEventListener('click',function(){veMode='pro';document.getElementById('ve-pro').classList.add('active');document.getElementById('ve-plain').classList.remove('active');veRenderTab();});
document.getElementById('ve-tabs').addEventListener('click',function(e){var b=e.target.closest('[data-ve-tab]');if(b){veActiveTab=b.dataset.veTab;veRender();}});
document.getElementById('ve-canvas').addEventListener('input',function(e){var el=e.target.closest('[data-id]');if(!el)return;var peer=el.dataset.peer&&document.getElementById(el.dataset.peer);if(peer)peer.value=el.value;veSetPending(el.dataset.id,el.value);});
document.getElementById('ve-canvas').addEventListener('change',function(e){var el=e.target.closest('[data-id]');if(!el||el.type==='range')return;if(el.dataset.peerRange){var prev=el.previousElementSibling;if(prev)prev.value=el.value;}veSetPending(el.dataset.id,el.value);});
document.getElementById('ve-canvas').addEventListener('click',function(e){
  var row=e.target.closest('[data-prop-id]');if(!row)return;
  document.querySelectorAll('.ve-row.active').forEach(function(r){r.classList.remove('active');});
  row.classList.add('active');
  vscode.postMessage({type:'visual-focus-prop',label:row.dataset.propLabel,selectorCtx:row.dataset.propCtx});
});
`;
}
