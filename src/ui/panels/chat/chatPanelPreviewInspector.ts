// [SCOPE] Redivivus Visual Inspector — script injected into HTML responses by the static preview server.
// Dormant on load. Activated via postMessage from the Redivivus webview parent.
// On element click: posts redivivus-element-selected back to parent with selector, HTML, styles, and rect.

export function getInspectorScript(): string {
  return `<script>
(function(){
  if(window.__redivivusInspectorInstalled){return;}
  window.__redivivusInspectorInstalled=true;
  var _hovered=null,_indicator=null,_revealedEls=[];

  function revealHidden(){
    var SKIP=/^(SCRIPT|STYLE|LINK|META|HEAD|TITLE|NOSCRIPT|TEMPLATE|BASE|PARAM|SOURCE|TRACK|SVG|PATH|DEFS|USE)$/;
    var style=document.getElementById('__redivivus-rs');
    if(!style){style=document.createElement('style');style.id='__redivivus-rs';
      style.textContent='.__redivivus-revealed{display:block!important;outline:2px dashed #a78bfa!important;min-width:20px;min-height:20px;background:rgba(167,139,250,0.07)!important;pointer-events:auto!important;}';
      document.head.appendChild(style);}
    var all=document.querySelectorAll('*');
    for(var i=0;i<all.length;i++){
      var el=all[i];
      if(SKIP.test(el.tagName)||el.classList.contains('__redivivus-revealed')||el.id==='__redivivus-rs'){continue;}
      if(el.closest('.__redivivus-revealed')){continue;} // parent already revealed — child appears automatically
      if(window.getComputedStyle(el).display==='none'){
        _revealedEls.push({el:el,orig:el.style.display});
        el.classList.add('__redivivus-revealed');
      }
    }
  }

  function hideRevealed(){
    for(var i=0;i<_revealedEls.length;i++){var r=_revealedEls[i];r.el.classList.remove('__redivivus-revealed');r.el.style.display=r.orig;}
    _revealedEls=[];
    var s=document.getElementById('__redivivus-rs');if(s){s.remove();}
  }

  function getSelector(el){
    if(el.id){return '#'+el.id;}
    var parts=[],cur=el;
    while(cur&&cur!==document.body&&parts.length<4){
      var tag=cur.tagName.toLowerCase();
      if(cur.id){parts.unshift('#'+cur.id);break;}
      var cls=Array.from(cur.classList).filter(function(c){return!c.startsWith('__redivivus');}).slice(0,2).join('.');
      if(cls){parts.unshift(tag+'.'+cls);}
      else{var idx=1,s=cur.previousElementSibling;while(s){idx++;s=s.previousElementSibling;}parts.unshift(tag+':nth-child('+idx+')');}
      cur=cur.parentElement;
    }
    return parts.join(' > ')||el.tagName.toLowerCase();
  }

  function keyStyles(el){
    var c=window.getComputedStyle(el);
    return{color:c.color,background:c.backgroundColor,fontSize:c.fontSize,fontWeight:c.fontWeight,display:c.display,position:c.position,width:c.width,height:c.height,borderRadius:c.borderRadius};
  }

  function enable(){
    document.addEventListener('mouseover',onOver,true);
    document.addEventListener('mouseout',onOut,true);
    document.addEventListener('click',onClick,true);
    document.addEventListener('keydown',onKey);
    _indicator=document.createElement('div');
    _indicator.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#1e40af;color:#fff;padding:5px 16px;border-radius:20px;font-size:12px;font-family:sans-serif;z-index:2147483647;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,0.5);letter-spacing:.3px;';
    _indicator.textContent='✏️ Click an element to select  •  Esc to cancel';
    document.body.appendChild(_indicator);
  }

  function disable(){
    document.removeEventListener('mouseover',onOver,true);
    document.removeEventListener('mouseout',onOut,true);
    document.removeEventListener('click',onClick,true);
    document.removeEventListener('keydown',onKey);
    if(_hovered){_hovered.style.outline='';_hovered.style.cursor='';_hovered=null;}
    if(_indicator){_indicator.remove();_indicator=null;}
    hideRevealed();
  }

  function onOver(e){
    if(_hovered&&_hovered!==e.target){_hovered.style.outline='';_hovered.style.cursor='';}
    _hovered=e.target;
    _hovered.style.outline='2px solid #3b82f6';
    _hovered.style.cursor='crosshair';
    e.stopPropagation();
  }

  function onOut(e){
    if(_hovered===e.target){_hovered.style.outline='';_hovered.style.cursor='';_hovered=null;}
  }

  function onClick(e){
    e.preventDefault();e.stopPropagation();
    var el=e.target,rect=el.getBoundingClientRect();
    window.parent.postMessage({
      type:'redivivus-element-selected',
      tagName:el.tagName.toLowerCase(),
      id:el.id||'',
      classes:Array.from(el.classList).filter(function(c){return!c.startsWith('__redivivus');}).join(' '),
      selector:getSelector(el),
      html:el.outerHTML.slice(0,600),
      text:(el.textContent||'').trim().slice(0,120),
      rect:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)},
      styles:keyStyles(el),
    },'*');
    disable();
  }

  function onKey(e){
    if(e.key==='Escape'){disable();window.parent.postMessage({type:'redivivus-inspect-cancelled'},'*');}
  }

  window.addEventListener('message',function(e){
    if(!e.data){return;}
    if(e.data.type==='redivivus-enable-inspect'){enable();}
    if(e.data.type==='redivivus-disable-inspect'){disable();}
    if(e.data.type==='redivivus-reveal-hidden'){revealHidden();}
    if(e.data.type==='redivivus-hide-revealed'){hideRevealed();}
  });
})();
<\/script>`;
}
