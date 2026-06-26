// [SCOPE] Chat Panel Webview Script — File actions, Undo, Feedback, Architect
// Extracted from chatPanelScript.ts. Keep under 200 lines.
// create-file / save-all handlers extracted to chatPanelScriptActionsFiles.ts (Rule 9 split).

import { buildActionsFilesScript } from './chatPanelScriptActionsFiles.js';

export function buildActionsScript(): string {
  return `
    document.addEventListener('click', (e) => {
      const target = (e.target && e.target.nodeType === 3) ? e.target.parentNode : e.target;
      if (!target || !target.closest) return;
      ${buildActionsFilesScript()}
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
        var errorContext = ''; try { errorContext = decodeURIComponent(escape(atob(b64ctx))); } catch(e){}
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
        const cfName = previewBtn.getAttribute('data-cf-name');
        if (cfName) {
          // Created via + Create File button — resolve by filename in workspace root
          try { vscode.postMessage({ type: 'open-html-by-name', filename: cfName }); } catch(e) {}
        } else {
          const b64path = previewBtn.getAttribute('data-path') || '';
          if (b64path) { try { vscode.postMessage({ type: 'preview-browser', path: b64path }); } catch(e) {} }
        }
        return;
      }
      var phoneBtn = target.closest ? target.closest('.add-to-phone-btn') : (target.classList&&target.classList.contains('add-to-phone-btn')?target:null);
      if (phoneBtn) { try { vscode.postMessage({ type: 'add-to-phone' }); } catch(e) {} return; }
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
        else if (action === 'deep-fix') vscode.postMessage({type:'architect-deep-fix',reviewId:rid});
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
      // [FIX] Plan Approval Gate button handlers
      const planApprove = target.closest ? target.closest('.plan-approve-btn') : null;
      if (planApprove) { var pid = planApprove.getAttribute('data-plan-id'); var pTa = document.querySelector('.plan-edit[data-plan-id="'+pid+'"]'); var pEdit = pTa ? pTa.value : undefined; planApprove.textContent='Working…'; planApprove.setAttribute('disabled','true'); try{vscode.postMessage({type:'plan-approve',planId:pid,editedPlan:pEdit});}catch(e){} return; }
      const planRevise = target.closest ? target.closest('.plan-revise-btn') : null;
      if (planRevise) { var pid2 = planRevise.getAttribute('data-plan-id'); try{vscode.postMessage({type:'plan-revise',planId:pid2});}catch(e){} return; }
      const planCancel = target.closest ? target.closest('.plan-cancel-btn') : null;
      if (planCancel) { var pid3 = planCancel.getAttribute('data-plan-id'); try{vscode.postMessage({type:'plan-cancel',planId:pid3});}catch(e){} return; }
      // [FIX] Forward / Copy message buttons on assistant bubbles
      const fwdBtn = target.closest ? target.closest('.msg-fwd-btn') : null;
      if (fwdBtn) {
        var raw=''; try{raw=decodeURIComponent(escape(atob(fwdBtn.getAttribute('data-fwd')||fwdBtn.getAttribute('data-copy')||'')));}catch(e){}
        if (fwdBtn.hasAttribute('data-copy')) {
          try{navigator.clipboard.writeText(raw);}catch(e){var t=document.createElement('textarea');t.value=raw;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);}
          var orig=fwdBtn.textContent; fwdBtn.textContent='\\u2713'; setTimeout(function(){fwdBtn.textContent=orig;},1200);
        } else {
          var inp=document.getElementById('message-input'); if(inp){inp.value=raw;inp.focus();inp.style.height='auto';inp.style.height=inp.scrollHeight+'px';}
        }
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
