// [SCOPE] Chat Panel Webview Script — create-file and save-all handlers.
// Extracted from chatPanelScriptActions.ts (Rule 9 split).

export function buildActionsFilesScript(): string {
  return `
      if (target.classList&&target.classList.contains('create-file-btn')) {
        var c64=target.getAttribute('data-code')||'',ext=target.getAttribute('data-ext')||'txt';
        var suggestedName = target.getAttribute('data-suggested') || ('file.' + ext);
        if (!target.getAttribute('data-suggested')) {
          var rawCode = ''; try { rawCode = decodeURIComponent(escape(atob(c64))); } catch(err){}
          var lines = rawCode.split('\\n');
          if (lines.length > 0) {
            var firstLine = lines[0].trim();
            var nameMatch = firstLine.match(/\\/\\/\\s*([\\w\\.\\-\\/]+\\.[a-z0-9]+)/i)
                         || firstLine.match(/\\/\\*\\s*([\\w\\.\\-\\/]+\\.[a-z0-9]+)\\s*\\*\\//i)
                         || firstLine.match(/<!--\\s*([\\w\\.\\-\\/]+\\.[a-z0-9]+)\\s*-->/i)
                         || firstLine.match(/#\\s*([\\w\\.\\-\\/]+\\.[a-z0-9]+)/i);
            if (nameMatch) { suggestedName = nameMatch[1]; }
          }
        }
        var wrap=document.createElement('div');
        wrap.setAttribute('data-cf-wrap','1');
        wrap.setAttribute('style','display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap;');
        var iid='cf-'+Date.now();
        wrap.innerHTML='<input id="'+iid+'" type="text" value="'+suggestedName+'" style="flex:1;min-width:120px;padding:4px 8px;border:1px solid var(--vscode-input-border);border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-size:12px;">'
          +'<button data-cf-save="'+iid+'" data-cf-code="'+c64+'" style="padding:4px 10px;border:none;border-radius:4px;background:#0078d4;color:#fff;cursor:pointer;font-size:12px;font-weight:600;">Save</button>'
          +'<button data-cf-cancel="1" style="padding:4px 8px;border:1px solid var(--vscode-input-border);border-radius:4px;background:transparent;color:var(--vscode-foreground);cursor:pointer;font-size:12px;">Cancel</button>';
        target.style.display='none';
        target.insertAdjacentElement('afterend',wrap);
        var fi=document.getElementById(iid); if(fi){fi.focus();fi.select();}
        return;
      }
      var cfSave=target.closest?target.closest('[data-cf-save]'):(target.getAttribute&&target.getAttribute('data-cf-save')?target:null);
      if(cfSave){
        var siid=cfSave.getAttribute('data-cf-save'),sc64=cfSave.getAttribute('data-cf-code');
        var sinp=document.getElementById(siid); var sfname=sinp?sinp.value.trim():'';
        if(sfname&&sc64){
          var rawCode = decodeURIComponent(escape(atob(sc64)));
          if (sfname.toLowerCase().endsWith('.json')) {
            rawCode = rawCode.split('\\n')
              .filter(line => !line.trim().startsWith('//'))
              .join('\\n');
          }
          try{vscode.postMessage({type:'create-file',code:rawCode,filename:sfname});}catch(e){}
          var sw=cfSave.closest('[data-cf-wrap]');
          if(sw){
            var spb=sw.previousElementSibling;
            if(spb&&spb.classList&&spb.classList.contains('create-file-btn')){
              spb.style.display='none';
              var conf = document.createElement('div');
              conf.style.cssText = 'font-size:12px;color:#4ec959;font-weight:600;margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
              conf.innerHTML = '<span>\\u2705</span> Saved: ' + sfname;
              if(sfname.toLowerCase().endsWith('.html')){
                var obtn=document.createElement('button');
                obtn.className='preview-browser-btn';
                obtn.setAttribute('data-cf-name',sfname);
                obtn.style.cssText='background:rgba(20,184,166,0.12);border:1px solid rgba(20,184,166,0.4);color:#14B8A6;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;';
                obtn.textContent='\\uD83C\\uDF0E Open in Browser';
                conf.appendChild(obtn);
                var obtn2=document.createElement('button');
                obtn2.style.cssText='background:transparent;border:1px solid var(--c-border);color:var(--c-text-dim);border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;font-family:inherit;';
                obtn2.textContent='\\uD83D\\uDCC2 Show in Explorer';
                obtn2.onclick=function(){try{vscode.postMessage({type:'open-file',path:btoa(sfname)});}catch(e){}};
                conf.appendChild(obtn2);
              }
              sw.replaceWith(conf);
            } else { sw.remove(); }
          }
        }
        return;
      }
      var cfCancel=target.closest?target.closest('[data-cf-cancel]'):(target.getAttribute&&target.getAttribute('data-cf-cancel')?target:null);
      if(cfCancel){
        var cw=cfCancel.closest('[data-cf-wrap]');
        if(cw){var cpb=cw.previousElementSibling;if(cpb&&cpb.classList&&cpb.classList.contains('create-file-btn')){cpb.style.display='';}cw.remove();}
        return;
      }
      if (target.id === 'save-all-btn' || target.closest('#save-all-btn')) {
        const saveAllBtn = (target.id === 'save-all-btn') ? target : target.closest('#save-all-btn');
        const btns = document.querySelectorAll('.create-file-btn:not([style*="display: none"])');
        btns.forEach(b => b.click());
        setTimeout(() => {
          const saveBtns = document.querySelectorAll('[data-cf-save]');
          saveBtns.forEach(sb => sb.click());
          const count = btns.length;
          const stat = document.getElementById('save-all-stat');
          if (stat) {
            stat.innerHTML = '<span style="color:#2ba245;font-weight:600;font-size:12px;display:flex;align-items:center;gap:4px;">&#9989; Saved ' + count + ' of ' + count + ' files</span>';
          }
          if (saveAllBtn) { saveAllBtn.style.display = 'none'; }
        }, 50);
        return;
      }
  `;
}
