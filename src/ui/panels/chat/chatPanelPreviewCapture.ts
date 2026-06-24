// [SCOPE] Runtime-capture script injected into previewed pages (Preview Auto-Fix Phase 0). Reports uncaught
// errors, failed <script src> loads, console.error, and a post-load "is it actually running" probe (blank
// canvas / no animation loop) back to the preview server via a beacon (POST /__rdv_runtime). This lets
// Redivivus PROVE a build/fix runs instead of trusting an AI's opinion. See docs/REDIVIVUS_PREVIEW_AUTOFIX.md.
// [WARN] Rule 13: ASCII ONLY - this string is injected into the page. No emoji / unicode anywhere.

export function getCaptureScript(): string {
  return `<script>(function(){
  if(window.__rdvCaptureInstalled){return;} window.__rdvCaptureInstalled=true;
  var loopSeen=false;
  // Hook the loop primitives EARLY (before the page's own scripts run) so we can tell whether the page ever
  // STARTS a render loop. A canvas game with no loop is a dead shell - the classic "blank game" failure.
  var _raf=window.requestAnimationFrame;
  if(_raf){ window.requestAnimationFrame=function(){ loopSeen=true; return _raf.apply(window,arguments); }; }
  var _si=window.setInterval;
  window.setInterval=function(){ loopSeen=true; return _si.apply(window,arguments); };
  function send(kind,msg,img){
    try{
      var payload={kind:kind,msg:String(msg).slice(0,400)};
      if(img) payload.image=img;
      var body=JSON.stringify(payload);
      if(navigator.sendBeacon){ navigator.sendBeacon('/__rdv_runtime', body); }
      else { fetch('/__rdv_runtime',{method:'POST',body:body,keepalive:true}).catch(function(){}); }
    }catch(e){}
  }
  window.addEventListener('error',function(e){
    var m=(e&&e.message)||'script error';
    if(e&&e.target&&e.target.src){ m='failed to load '+e.target.src; }
    send('error',m);
  },true);
  window.addEventListener('unhandledrejection',function(e){
    send('rejection',(e&&e.reason&&(e.reason.message||e.reason))||'unhandled rejection');
  });
  var _ce=console.error; console.error=function(){ try{ send('console',Array.prototype.join.call(arguments,' ')); }catch(e){} return _ce.apply(console,arguments); };
  // Post-load probe: after the page has had time to render, is it actually alive?
  setTimeout(function(){
    try{
      var c=document.querySelector('canvas');
      if(c){
        var blank=false;
        var b64=null;
        try{ b64=c.toDataURL('image/jpeg',0.5); }catch(e){}
        try{
          var ctx=c.getContext&&c.getContext('2d');
          if(ctx){
            var w=Math.min(c.width||0,48), h=Math.min(c.height||0,48);
            if(w>0&&h>0){
              var d=ctx.getImageData(0,0,w,h).data, first=d[0]+'_'+d[1]+'_'+d[2]+'_'+d[3]; blank=true;
              for(var i=4;i<d.length;i+=4){ if(d[i]+'_'+d[i+1]+'_'+d[i+2]+'_'+d[i+3]!==first){ blank=false; break; } }
            }
          }
        }catch(e){}
        if(blank && !loopSeen){ send('probe','canvas is blank and no animation loop started - the game is not running', b64); }
        else if(!loopSeen){ send('probe','no animation loop (requestAnimationFrame/setInterval) ever started', b64); }
        else if(b64){ send('snapshot','visual snapshot', b64); }
      } else {
        // No canvas — HTML-rendered page (div/span UI, chess boards, DOM games).
        // Use html2canvas to capture the visible DOM as a JPEG and beacon it back.
        try{
          var s=document.createElement('script');
          s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          s.onload=function(){
            try{
              (window as any).html2canvas(document.body,{
                scale:0.5, useCORS:true, allowTaint:true,
                width:Math.min(document.body.scrollWidth,900),
                height:Math.min(document.body.scrollHeight,700),
                logging:false
              }).then(function(cv){
                try{
                  var img=cv.toDataURL('image/jpeg',0.6);
                  send('snapshot','html visual snapshot',img);
                }catch(e){}
              }).catch(function(){});
            }catch(e){}
          };
          document.head.appendChild(s);
        }catch(e){}
      }
    }catch(e){}
  }, 1500);
})();</script>`;
}
