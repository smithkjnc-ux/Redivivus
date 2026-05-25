// [SCOPE] Chat Panel Webview Script — File actions, Undo, Feedback, Architect
// Extracted from chatPanelScript.ts. Keep under 200 lines.

export function buildActionsScript(): string {
  return `
    document.addEventListener('click', (e) => {
      const target = e.target; if (!target) return;
      if (target.classList&&target.classList.contains('create-file-btn')) {
        var c64=target.getAttribute('data-code')||'',ext=target.getAttribute('data-ext')||'txt';
        // [FIX] Use pre-computed suggested filename from data-suggested attribute (set by renderer)
        var suggestedName = target.getAttribute('data-suggested') || ('file.' + ext);
        // Fallback: if no data-suggested, try first-line comment detection in browser
        if (!target.getAttribute('data-suggested')) {
          var rawCode = ''; try { rawCode = atob(c64); } catch(err){}
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
          var rawCode = atob(sc64);
          if (sfname.toLowerCase().endsWith('.json')) {
            rawCode = rawCode.split('\\n')
              .filter(line => !line.trim().startsWith('//'))
              .join('\\n');
          }
          try{vscode.postMessage({type:'create-file',code:rawCode,filename:sfname});}catch(e){}
          // [FIX 2] SAVED CONFIRMATION
          var sw=cfSave.closest('[data-cf-wrap]');
          if(sw){
            var spb=sw.previousElementSibling;
            if(spb&&spb.classList&&spb.classList.contains('create-file-btn')){
              spb.style.display='none'; 
              // Replace form with green checkmark
              var conf = document.createElement('div');
              conf.style.cssText = 'font-size:12px;color:#4ec959;font-weight:600;margin-top:6px;display:flex;align-items:center;gap:4px;';
              conf.innerHTML = '<span>\\u2705</span> Saved: ' + sfname;
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
      // [FIX 3] SAVE ALL FILES BUTTON HANDLER
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
          if (saveAllBtn) {
            saveAllBtn.style.display = 'none';
          }
        }, 50);
        return;
      }
      // Blueprint gap submit button
      var bpSubmitBtn = target.closest ? target.closest('.bp-gap-submit-btn') : (target.classList&&target.classList.contains('bp-gap-submit-btn')?target:null);
      if (bpSubmitBtn) {
        var sid = bpSubmitBtn.getAttribute('data-session') || '';
        var card = document.querySelector('.bp-gap-card[data-session="'+sid+'"]');
        var answers = {};
        if (card) {
          var inputs = card.querySelectorAll('.bp-gap-input');
          inputs.forEach(function(inp) {
            var f = inp.getAttribute('data-field');
            if (f && inp.value && inp.value.trim()) { answers[f] = inp.value.trim(); }
          });
        }
        bpSubmitBtn.textContent = 'Building...';
        bpSubmitBtn.setAttribute('disabled','true');
        try { vscode.postMessage({ type: 'blueprint-gap-answer', sessionId: sid, answers: answers }); } catch(e) {}
        return;
      }
      // Blueprint gap skip button
      var bpSkipBtn = target.closest ? target.closest('.bp-gap-skip-btn') : (target.classList&&target.classList.contains('bp-gap-skip-btn')?target:null);
      if (bpSkipBtn) {
        var skipSid = bpSkipBtn.getAttribute('data-session') || '';
        bpSkipBtn.textContent = 'Skipping...';
        bpSkipBtn.setAttribute('disabled','true');
        try { vscode.postMessage({ type: 'blueprint-gap-skip', sessionId: skipSid }); } catch(e) {}
        return;
      }
      // Vault dedup merge button
      const dedupBtn = target.closest ? target.closest('.vault-dedup-merge-btn') : (target.classList&&target.classList.contains('vault-dedup-merge-btn')?target:null);
      if (dedupBtn) {
        dedupBtn.textContent = 'Merging...';
        dedupBtn.setAttribute('disabled','true');
        try { vscode.postMessage({ type: 'vault-dedup-merge' }); } catch(e) {}
        return;
      }
      // Fix terminal error button
      const fixErrBtn = target.closest ? target.closest('.fix-terminal-error-btn') : (target.classList&&target.classList.contains('fix-terminal-error-btn')?target:null);
      if (fixErrBtn) {
        var b64ctx = fixErrBtn.getAttribute('data-ctx') || '';
        var errorContext = ''; try { errorContext = atob(b64ctx); } catch(e){}
        if (errorContext) {
          fixErrBtn.textContent = 'Sending to Redivivus...';
          fixErrBtn.setAttribute('disabled','true');
          try { vscode.postMessage({ type: 'fix-terminal-error', errorContext: errorContext }); } catch(e) {}
        }
        return;
      }
      const openFileBtn = target.closest ? target.closest('.open-file-btn') : (target.classList&&target.classList.contains('open-file-btn')?target:null);
      if (openFileBtn) {
        const b64path = openFileBtn.getAttribute('data-path') || '';
        if (b64path) { try { vscode.postMessage({ type: 'open-file', path: b64path }); } catch(e) {} }
        return;
      }
      const previewBtn = target.closest ? target.closest('.preview-browser-btn') : (target.classList&&target.classList.contains('preview-browser-btn')?target:null);
      if (previewBtn) {
        const b64path = previewBtn.getAttribute('data-path') || '';
        if (b64path) { try { vscode.postMessage({ type: 'preview-browser', path: b64path }); } catch(e) {} }
        return;
      }
      const undoEl = target.closest ? target.closest('[data-undo-build]') : (target.getAttribute&&target.getAttribute('data-undo-build')?target:null);
      if (undoEl) {
        const snapshotId=undoEl.getAttribute('data-undo-build');
        if(!snapshotId) return;
        if(undoEl.getAttribute('data-undo-armed')==='1'){
          undoEl.textContent='Undoing...';undoEl.setAttribute('disabled','true');
          vscode.postMessage({type:'undo-build',snapshotId});
        } else {
          const origText=undoEl.textContent; undoEl.setAttribute('data-undo-armed','1');
          undoEl.textContent='\\u26a0\\ufe0f Are you sure? Click again to confirm undo';
          undoEl.style.background='rgba(224,85,85,0.25)';
          setTimeout(()=>{undoEl.textContent=origText;undoEl.removeAttribute('data-undo-armed');},5000);
        }
        return;
      }
      const archEl = target.closest ? target.closest('[data-arch-action]') : (target.getAttribute&&target.getAttribute('data-arch-action')?target:null);
      if (archEl) {
        const action = archEl.getAttribute('data-arch-action');
        const rid = archEl.getAttribute('data-review-id') || '';
        const aidx = parseInt(archEl.getAttribute('data-action-index') || '0');
        if (action === 'fix-all') vscode.postMessage({type:'architect-fix-all',reviewId:rid});
        else if (action === 'per-action') vscode.postMessage({type:'architect-per-action',reviewId:rid,actionIndex:aidx});
        else if (action === 'confirm') vscode.postMessage({type:'architect-action-confirm',reviewId:rid,actionIndex:aidx});
        else if (action === 'cancel') vscode.postMessage({type:'architect-action-cancel'});
        else if (action === 'dismiss') archEl.closest('div[style]')?.remove();
        return;
      }
      const commitBtn = target.closest ? target.closest('.github-commit-btn') : (target.classList&&target.classList.contains('github-commit-btn')?target:null);
      if (commitBtn) {
        var cpayload = commitBtn.getAttribute('data-payload') || '';
        commitBtn.textContent = 'Committing...';
        commitBtn.setAttribute('disabled','true');
        try { vscode.postMessage({ type: 'github-commit', payload: cpayload }); } catch(e) {}
        return;
      }
    });
    window.addEventListener('message', function(ev) {
      if (!ev.data || ev.data.type !== 'github-commit-result') { return; }
      document.querySelectorAll('.github-commit-btn[disabled]').forEach(function(btn) {
        btn.textContent = ev.data.success ? 'Committed!' : 'Commit failed -- try again';
        btn.style.opacity = ev.data.success ? '0.5' : '';
        if (!ev.data.success) { btn.removeAttribute('disabled'); }
      });
    });
  `;
}
