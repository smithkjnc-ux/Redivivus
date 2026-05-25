// [SCOPE] Drag-to-reorder script — injected into the user's HTML file during Rearrange mode
// Uses mousedown/mousemove/mouseup (not HTML5 DnD) to avoid iframe sandbox snap-back.

export function getRearrangeScript(): string {
  return `(function(){
  var TARGETS='div,nav,header,footer,section,article,aside,main,ul,ol,li,p,h1,h2,h3,h4,h5,h6,button,a,form,figure,blockquote,details,summary';
  var dragging=null,ghost=null,dragParent=null,fromIdx=0,dropRef=null,dropAfter=false,dropInside=false,dropInsideEl=null,offX=0,offY=0,selected=null,curHudEl=null;
  var bar=document.createElement('div');
  bar.style.cssText='position:fixed;top:0;left:0;right:0;background:rgba(137,180,250,0.15);border-bottom:2px solid #89b4fa;color:#89b4fa;font:12px/28px system-ui,sans-serif;text-align:center;z-index:99999;pointer-events:none;';
  bar.textContent='\\u21D5  Move Mode \\u2014 drag to reorder or nest, click + \\u2191\\u2193 to adjust';
  document.body.appendChild(bar);
  var indicator=document.createElement('div');
  indicator.style.cssText='height:3px;background:#89b4fa;border-radius:2px;pointer-events:none;display:none;position:fixed;z-index:99998;';
  document.body.appendChild(indicator);
  var hud=document.createElement('div');
  hud.style.cssText='position:fixed;bottom:8px;right:8px;background:rgba(20,29,54,0.97);border:1px solid #89b4fa;color:#89b4fa;font:11px/1.8 monospace;padding:8px 10px;border-radius:6px;z-index:99999;display:none;width:210px;box-sizing:border-box;';
  document.body.appendChild(hud);
  function elIdx(el){return Array.from(el.parentElement.children).indexOf(el);}
  function sibCount(el){return el.parentElement?el.parentElement.children.length:1;}
  function pPath(el){var p=[],n=el;while(n.parentElement){p.unshift(Array.from(n.parentElement.children).indexOf(n));n=n.parentElement;}return p;}
  function buildChildList(el){
    var kids=Array.from(el.children);if(!kids.length)return '';
    var h='<div style="margin-top:5px;border-top:1px solid rgba(137,180,250,0.25);padding-top:4px;max-height:120px;overflow-y:auto;">';
    h+='<div style="font-size:9px;color:rgba(137,180,250,0.5);letter-spacing:0.5px;margin-bottom:2px;">CHILDREN</div>';
    for(var i=0;i<kids.length;i++){
      var tag=kids[i].tagName.toLowerCase(),txt=(kids[i].textContent||'').trim().slice(0,22).replace(/</g,'&lt;'),ug=kids[i]._ug?'checked':'';
      h+='<div style="display:flex;align-items:center;gap:4px;padding:1px 0;">'
       +'<input type="checkbox" class="hud-ug" data-ki="'+i+'" '+ug+' style="margin:0;accent-color:#89b4fa;cursor:pointer;flex-shrink:0;">'
       +'<span class="hud-kid" data-ki="'+i+'" style="color:#89b4fa;font-size:10px;cursor:pointer;">&lt;'+tag+'&gt;</span>'
       +(txt?'<span class="hud-kid" data-ki="'+i+'" style="color:rgba(137,180,250,0.6);font-size:10px;cursor:pointer;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:80px;">'+txt+'</span>':'')
       +'</div>';
    }
    return h+'</div>';
  }
  function showHud(el){
    curHudEl=el;var r=el.getBoundingClientRect(),i=elIdx(el)+1,t=sibCount(el);
    hud.innerHTML='<div style="white-space:pre;font:11px/1.8 monospace;">Pos: '+i+' / '+t+'\\nx: '+Math.round(r.left)+'  y: '+Math.round(r.top)+'\\nw: '+Math.round(r.width)+'  h: '+Math.round(r.height)+'</div>'
     +buildChildList(el)
     +'<div style="display:flex;gap:5px;margin-top:5px;border-top:1px solid rgba(137,180,250,0.25);padding-top:5px;">'
     +'<button class="hud-save" style="flex:1;background:rgba(52,211,153,0.15);border:1px solid #34d399;color:#34d399;padding:2px 0;border-radius:3px;cursor:pointer;font:10px system-ui,sans-serif;">Save</button>'
     +'<button class="hud-revert" style="flex:1;background:rgba(248,113,113,0.15);border:1px solid #f87171;color:#f87171;padding:2px 0;border-radius:3px;cursor:pointer;font:10px system-ui,sans-serif;">Revert</button>'
     +'</div>';
    hud.style.display='block';
  }
  function hideHud(){hud.style.display='none';curHudEl=null;}
  function postMove(el,pp){window.parent.postMessage({type:'redivivus-drag-drop',parentPath:pp,fromIndex:fromIdx,toIndex:elIdx(el)},'*');}
  function postReparent(fromPP,fi,toPP){window.parent.postMessage({type:'redivivus-drag-drop',inside:true,fromParentPath:fromPP,fromIndex:fi,toPath:toPP},'*');}
  function postTransplant(fromPP,fi,refPP,after){window.parent.postMessage({type:'redivivus-drag-drop',transplant:true,fromParentPath:fromPP,fromIndex:fi,refPath:refPP,after:after},'*');}
  function deselect(){if(selected){selected.style.outline='';selected.style.boxShadow='';}selected=null;hideHud();}
  function clearInsideGlow(){if(dropInsideEl){dropInsideEl.style.outline='';dropInsideEl.style.boxShadow='';dropInsideEl=null;}}
  function nearestSib(y){
    var kids=Array.from(dragParent.children),best=null,bestD=Infinity;
    for(var i=0;i<kids.length;i++){if(kids[i]===dragging)continue;var r=kids[i].getBoundingClientRect(),d=Math.abs(y-(r.top+r.height/2));if(d<bestD){bestD=d;best=kids[i];}}
    return best;
  }
  hud.addEventListener('click',function(e){
    if(e.target.classList.contains('hud-save')){window.parent.postMessage({type:'redivivus-hud-save'},'*');return;}
    if(e.target.classList.contains('hud-revert')){window.parent.postMessage({type:'redivivus-hud-revert'},'*');return;}
    if(e.target.classList.contains('hud-ug')){var c=curHudEl&&Array.from(curHudEl.children)[parseInt(e.target.getAttribute('data-ki'),10)];if(c)c._ug=e.target.checked;return;}
    var ki=e.target.closest&&e.target.closest('.hud-kid');if(!ki||!curHudEl)return;
    var child=Array.from(curHudEl.children)[parseInt(ki.getAttribute('data-ki'),10)];if(!child)return;
    deselect();selected=child;fromIdx=elIdx(child);dragParent=child.parentElement;
    child.style.outline='2px solid #89b4fa';child.style.boxShadow='0 0 0 4px rgba(137,180,250,0.2)';showHud(child);
  });
  document.querySelectorAll(TARGETS).forEach(function(el){
    el.style.cursor='grab';
    el.addEventListener('click',function(e){
      if(hud.contains(e.target))return;
      e.stopPropagation();e.preventDefault();
      deselect();selected=el;fromIdx=elIdx(el);dragParent=el.parentElement;
      el.style.outline='2px solid #89b4fa';el.style.boxShadow='0 0 0 4px rgba(137,180,250,0.2)';
      if(!el.getAttribute('tabindex'))el.setAttribute('tabindex','-1');el.focus({preventScroll:true});showHud(el);
    });
    el.addEventListener('mousedown',function(e){
      if(hud.contains(e.target)||e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      dragging=el;dragParent=el.parentElement;fromIdx=elIdx(el);
      var r=el.getBoundingClientRect();offX=e.clientX-r.left;offY=e.clientY-r.top;
      ghost=el.cloneNode(true);
      ghost.style.cssText='position:fixed;z-index:99997;opacity:0.65;pointer-events:none;width:'+r.width+'px;left:'+r.left+'px;top:'+r.top+'px;margin:0;box-shadow:0 6px 24px rgba(0,0,0,0.45);outline:2px solid #89b4fa;border-radius:4px;';
      document.body.appendChild(ghost);el.style.opacity='0.25';el.style.pointerEvents='none';
    });
  });
  document.addEventListener('mousemove',function(e){
    if(!dragging||!ghost)return;
    ghost.style.left=(e.clientX-offX)+'px';ghost.style.top=(e.clientY-offY)+'px';
    ghost.style.visibility='hidden';hud.style.pointerEvents='none';
    var under=document.elementFromPoint(e.clientX,e.clientY);
    ghost.style.visibility='';hud.style.pointerEvents='auto';
    indicator.style.display='none';dropRef=null;dropAfter=false;dropInside=false;
    if(!under)return;
    var sib=under;while(sib&&sib.parentElement!==dragParent)sib=sib.parentElement;
    if(!sib||sib===dragging)sib=nearestSib(e.clientY);
    if(!sib||sib===dragging){
      if(dragParent.contains(under)){clearInsideGlow();return;}
      var ct=under;while(ct&&ct!==document.body){if(ct!==dragging&&!dragging.contains(ct)&&ct.matches&&ct.matches(TARGETS))break;ct=ct.parentElement;}
      if(!ct||ct===document.body){clearInsideGlow();return;}
      sib=ct;
    }
    var r=sib.getBoundingClientRect(),zone=e.clientY<r.top+r.height*0.25?'before':e.clientY>r.bottom-r.height*0.25?'after':'inside';
    if(zone==='inside'&&sib.children.length){
      if(dropInsideEl&&dropInsideEl!==sib)clearInsideGlow();
      dropRef=sib;dropInside=true;dropInsideEl=sib;
      sib.style.outline='2px dashed #89b4fa';sib.style.boxShadow='0 0 0 4px rgba(137,180,250,0.12)';
    }else{
      clearInsideGlow();dropRef=sib;dropAfter=(zone==='after');
      indicator.style.top=(dropAfter?r.bottom-2:r.top)+'px';
      indicator.style.left=r.left+'px';indicator.style.width=r.width+'px';indicator.style.display='block';
    }
  });
  document.addEventListener('mouseup',function(){
    if(!dragging)return;
    if(ghost){document.body.removeChild(ghost);ghost=null;}
    indicator.style.display='none';clearInsideGlow();
    dragging.style.opacity='';dragging.style.pointerEvents='';
    if(!dropRef||dropRef===dragging){dragging=null;dragParent=null;return;}
    if(dropInside){
      var fromPP=pPath(dragParent),fi=fromIdx,toPP=pPath(dropRef);
      dropRef.appendChild(dragging);postReparent(fromPP,fi,toPP);showHud(dragging);
    }else if(dropRef.parentElement===dragParent){
      var pp=pPath(dragParent);
      if(dropAfter){dragParent.insertBefore(dragging,dropRef.nextSibling);}else{dragParent.insertBefore(dragging,dropRef);}
      postMove(dragging,pp);showHud(dragging);
    }else{
      var fromPP=pPath(dragParent),fi=fromIdx,refPP=pPath(dropRef),newPar=dropRef.parentElement;
      if(dropAfter){newPar.insertBefore(dragging,dropRef.nextSibling);}else{newPar.insertBefore(dragging,dropRef);}
      postTransplant(fromPP,fi,refPP,dropAfter);showHud(dragging);
    }
    dragging=null;dragParent=null;dropRef=null;dropAfter=false;dropInside=false;
  });
  function handleKey(key){
    if(key==='Escape'){deselect();return;}
    if(!selected||!selected.parentElement)return;
    if(key!=='ArrowUp'&&key!=='ArrowDown')return;
    dragParent=selected.parentElement;fromIdx=elIdx(selected);
    var pp=pPath(dragParent);
    if(key==='ArrowUp'&&selected.previousElementSibling){dragParent.insertBefore(selected,selected.previousElementSibling);}
    else if(key==='ArrowDown'&&selected.nextElementSibling){dragParent.insertBefore(selected.nextElementSibling,selected);}
    else{return;}
    postMove(selected,pp);selected.scrollIntoView({block:'nearest'});showHud(selected);
  }
  document.addEventListener('keydown',function(e){if(e.key==='ArrowUp'||e.key==='ArrowDown'||e.key==='Escape'){e.preventDefault();}handleKey(e.key);});
  window.addEventListener('message',function(e){if(e.data&&e.data.type==='redivivus-key')handleKey(e.data.key);});
})();`;
}
