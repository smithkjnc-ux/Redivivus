// [SCOPE] Chat Panel Webview Script — Feedback, toggle-auto-open, recent project click handlers
// Extracted from chatPanelScriptActions.ts (was at 200-line limit). Keep under 200 lines.
// _cEsc/_buildQHtml/_showClarifySummary extracted to chatPanelScriptActionsClarify.ts (Rule 9 split).

import { buildClarifyHelpersScript } from './chatPanelScriptActionsClarify';

export function buildActionsScriptB(): string {
  return `
    ${buildClarifyHelpersScript()}

    document.addEventListener('click', (e) => {
      const target = (e.target && e.target.nodeType === 3) ? e.target.parentNode : e.target;
      if (!target || !target.closest) return;
      var feedbackBtn = target.closest('[data-feedback]');
      if (feedbackBtn) {
        var fbRating = feedbackBtn.getAttribute('data-feedback');
        var fbId = feedbackBtn.getAttribute('data-feedback-id');
        if (fbRating === 'good') {
          vscode.postMessage({type:'build-feedback',feedbackId:fbId,rating:'good',note:''});
          var fbBox = document.getElementById('feedback-'+fbId);
          if (fbBox) fbBox.innerHTML = '<span style="font-size:11px;color:#4caf50;font-style:italic;">Thanks!</span>';
        } else if (fbRating === 'bad') {
          var noteDiv = document.getElementById('feedback-note-'+fbId);
          if (noteDiv) noteDiv.style.display = 'block';
        }
        return;
      }
      const autoOpenEl = target.closest('[data-action="toggle-auto-open"]');
      if (autoOpenEl) {
        const checkbox = autoOpenEl.querySelector('input[type="checkbox"]') || autoOpenEl;
        const isChecked = checkbox.checked !== undefined ? checkbox.checked : checkbox.getAttribute('checked');
        try { vscode.postMessage({type:'toggle-setting', setting:'startupBehavior', value:isChecked ? 'lastProject' : 'launcher'}); } catch(e) {}
        return;
      }
      const recentItem = target.closest('[data-recent-path]');
      if (recentItem) {
        const projectPath = recentItem.getAttribute('data-recent-path');
        if (projectPath) { vscode.postMessage({type:'open-recent-project', folderPath: projectPath}); }
        return;
      }
      // Clarify: Next / Submit button — advances one question at a time
      var clarifyNextBtn = target.closest('.clarify-next-btn');
      if (clarifyNextBtn) {
        var card = clarifyNextBtn.closest('.clarify-card'); if (!card) return;
        var curIdx = parseInt(card.getAttribute('data-current-q')||'0', 10);
        var totalQ = parseInt(card.getAttribute('data-total-q')||'1', 10);
        var questions = JSON.parse(card.getAttribute('data-questions') || '[]');
        var curQ = questions[curIdx];
        if (!card._clarifyAnswers) card._clarifyAnswers = {};
        var isFT = curQ && !!curQ.freeText;
        if (isFT) {
          var ftEl = card.querySelector('.clarify-freetext');
          if (ftEl && ftEl.value.trim()) card._clarifyAnswers[curQ.id] = ftEl.value.trim();
        } else {
          var chk = card.querySelector('.clarify-radio:checked');
          if (chk && chk.value) {
            card._clarifyAnswers[curQ.id] = chk.value;
            var elabEl = card.querySelector('.clarify-elaborate');
            if (elabEl && elabEl.value.trim()) card._clarifyAnswers[curQ.id+'_detail'] = elabEl.value.trim();
          }
        }
        // Quick-build: "Build it now" on first question — skip remaining
        if (curIdx === 0 && card._clarifyAnswers['build_approach'] && card._clarifyAnswers['build_approach'].toLowerCase().includes('now')) {
          clarifyNextBtn.textContent = 'Building...'; clarifyNextBtn.setAttribute('disabled','true');
          var cBtnQ = card.querySelector('.clarify-cancel-btn'); if (cBtnQ) cBtnQ.setAttribute('disabled','true');
          try { vscode.postMessage({ type: 'clarify-submit', answers: card._clarifyAnswers }); } catch(e) {}
          return;
        }
        if (curIdx < totalQ - 1) {
          var nextIdx = curIdx + 1;
          card.setAttribute('data-current-q', String(nextIdx));
          var qWrap = card.querySelector('.clarify-q-wrap');
          if (qWrap) qWrap.innerHTML = _buildQHtml(questions[nextIdx], nextIdx, totalQ);
          var prog = card.querySelector('.clarify-progress');
          if (prog) prog.textContent = 'Question '+(nextIdx+1)+' of '+totalQ;
          clarifyNextBtn.textContent = (nextIdx === totalQ-1) ? 'Submit & Build →' : 'Next →';
        } else {
          _showClarifySummary(card, questions);
        }
        return;
      }
      // Clarify: Build button on summary screen
      var clarifyBuildBtn = target.closest ? target.closest('.clarify-build-btn') : null;
      if (clarifyBuildBtn) {
        var bCard = clarifyBuildBtn.closest('.clarify-card');
        clarifyBuildBtn.textContent = 'Building...'; clarifyBuildBtn.setAttribute('disabled','true');
        var revBtn = bCard ? bCard.querySelector('.clarify-revise-btn') : null; if (revBtn) revBtn.setAttribute('disabled','true');
        try { vscode.postMessage({ type: 'clarify-submit', answers: (bCard && bCard._clarifyAnswers) || {} }); } catch(e) {}
        return;
      }
      // Clarify: Make Changes — reset to question 1
      var clarifyReviseBtn = target.closest ? target.closest('.clarify-revise-btn') : null;
      if (clarifyReviseBtn) {
        var rCard = clarifyReviseBtn.closest('.clarify-card'); if (!rCard) return;
        var rQs = JSON.parse(rCard.getAttribute('data-questions') || '[]');
        rCard.setAttribute('data-current-q','0'); rCard._clarifyAnswers = {};
        var sumEl = rCard.querySelector('.clarify-summary'); if (sumEl) sumEl.style.display = 'none';
        var rNav = rCard.querySelector('.clarify-nav'); if (rNav) rNav.style.display = 'flex';
        var rWrap = rCard.querySelector('.clarify-q-wrap');
        if (rWrap) { rWrap.style.display = 'block'; rWrap.innerHTML = _buildQHtml(rQs[0], 0, rQs.length); }
        var rProg = rCard.querySelector('.clarify-progress'); if (rProg) rProg.textContent = 'Question 1 of '+rQs.length;
        var rNext = rCard.querySelector('.clarify-next-btn'); if (rNext) { rNext.textContent = 'Next →'; rNext.removeAttribute('disabled'); }
        return;
      }
      // Clarify: Cancel
      const clarifyCancelBtn = target.closest ? target.closest('.clarify-cancel-btn') : null;
      if (clarifyCancelBtn) {
        clarifyCancelBtn.textContent = 'Canceling...'; clarifyCancelBtn.setAttribute('disabled','true');
        var cCard = clarifyCancelBtn.closest('.clarify-card');
        var sBtn = cCard ? cCard.querySelector('.clarify-next-btn') : null; if (sBtn) sBtn.setAttribute('disabled','true');
        try { vscode.postMessage({ type: 'clarify-submit', answers: { _cancelled: 'true' } }); } catch(e) {}
        return;
      }
      // Edit Visually button
      const editVisBtn = target.closest ? target.closest('.edit-visually-btn') : null;
      if (editVisBtn) {
        const b64 = editVisBtn.getAttribute('data-root');
        if (b64) { try { const root = decodeURIComponent(escape(atob(b64))); vscode.postMessage({ type: 'open-visual-editor', root }); } catch(e) {} }
        return;
      }
      // [TOOL-GAP] Copy an install command to the clipboard (user runs it wherever they like).
      const tgCopy = target.closest ? target.closest('.tg-copy') : null;
      if (tgCopy) {
        const b64 = tgCopy.getAttribute('data-cmd');
        if (b64) { try { vscode.postMessage({ type: 'toolgap-copy', cmd: b64 }); } catch(e) {} }
        return;
      }
      // [TOOL-GAP] Open a terminal with the install command PRE-FILLED but NOT run — the user presses Enter.
      const tgTerm = target.closest ? target.closest('.tg-term') : null;
      if (tgTerm) {
        const b64 = tgTerm.getAttribute('data-cmd');
        if (b64) { try { vscode.postMessage({ type: 'toolgap-terminal', cmd: b64 }); } catch(e) {} }
        return;
      }
      // [READINESS] Production-readiness check button — runs the preflight on the active project.
      const readyBtn = target.closest ? target.closest('.readiness-btn') : null;
      if (readyBtn) {
        const b64 = readyBtn.getAttribute('data-root') || '';
        try { vscode.postMessage({ type: 'check-readiness', root: b64 }); } catch(e) {}
        return;
      }
      // Retry fix button — re-sends the original request as if the user typed it again.
      const retryBtn = target.closest ? target.closest('.retry-fix-btn') : null;
      if (retryBtn) {
        const b64 = retryBtn.getAttribute('data-retry');
        if (b64) { try { const text = decodeURIComponent(escape(atob(b64))); vscode.postMessage({ type: 'send-message', text }); } catch(e) {} }
        return;
      }
      // Open Workspace button
      const openWsBtn = target.closest ? target.closest('.open-workspace-btn') : null;
      if (openWsBtn) {
        const b64 = openWsBtn.getAttribute('data-path');
        if (b64) { try { const rawPath = decodeURIComponent(escape(atob(b64))); vscode.postMessage({ type: 'open-workspace-btn', path: rawPath }); } catch(e) {} }
        return;
      }
      // Run Project button
      const runBtn = target.closest ? target.closest('.run-project-btn') : null;
      if (runBtn) {
        const b64 = runBtn.getAttribute('data-path');
        if (b64) { try { const rawPath = decodeURIComponent(escape(atob(b64))); vscode.postMessage({ type: 'run-project', path: rawPath }); } catch(e) {} }
        return;
      }
      // Progress style toggle button
      const progressBtn = target.id === 'progress-style-btn' ? target : (target.closest ? target.closest('#progress-style-btn') : null);
      if (progressBtn) {
        const current = progressBtn.getAttribute('data-current-style') || 'plain';
        const next = current === 'plain' ? 'technical' : 'plain';
        progressBtn.setAttribute('data-current-style', next);
        progressBtn.innerHTML = next === 'plain' ? '&#x1F4AC; Plain' : '&#x2699;&#xFE0F; Technical';
        progressBtn.title = next === 'plain' ? 'Showing plain English progress. Click for technical (Supervisor/Worker/Guardian) mode.' : 'Showing technical progress. Click for plain English mode.';
        try { vscode.postMessage({ type: 'toggle-setting', setting: 'progressStyle', value: next }); } catch(e) {}
        return;
      }
    });
  `;
}
