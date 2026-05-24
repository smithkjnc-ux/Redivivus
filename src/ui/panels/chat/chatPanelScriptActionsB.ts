// [SCOPE] Chat Panel Webview Script — Feedback, toggle-auto-open, recent project click handlers
// Extracted from chatPanelScriptActions.ts (was at 200-line limit). Keep under 200 lines.

export function buildActionsScriptB(): string {
  return `
    function _cEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function _buildQHtml(q, idx, total) {
      var nb = '<span style="display:flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:50%;background:rgba(59,130,246,0.15);color:#3b82f6;font-size:12px;font-weight:700;flex-shrink:0;">'+(idx+1)+'</span>';
      var title = '<div style="font-size:13px;font-weight:700;color:var(--vscode-foreground);margin-bottom:14px;display:flex;align-items:flex-start;gap:12px;line-height:1.5;">'+nb+'<span style="padding-top:3px;">'+_cEsc(q.question)+'</span></div>';
      if (q.freeText) {
        return '<div class="clarify-q-inner">'+title+'<div style="margin-left:38px;"><textarea class="clarify-freetext" data-qid="'+_cEsc(q.id)+'" placeholder="Optional — share any other preferences..." rows="3" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;color:var(--vscode-foreground);font-family:inherit;font-size:12.5px;resize:vertical;outline:none;box-sizing:border-box;"></textarea></div></div>';
      }
      var opts = (q.options||[]).map(function(opt,oIdx) {
        return '<label class="clarify-option" style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:12.5px;color:var(--vscode-foreground);border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);margin-bottom:8px;">'
          +'<input type="radio" name="clarify-'+_cEsc(q.id)+'" class="clarify-radio" data-qid="'+_cEsc(q.id)+'" value="'+_cEsc(opt.label)+'" '+(oIdx===0?'checked':'')+' style="margin:2px 0 0 0;accent-color:#3b82f6;width:15px;height:15px;flex-shrink:0;">'
          +'<span style="line-height:1.45;">'+_cEsc(opt.label)+'</span></label>';
      }).join('');
      var elab = '<div style="margin-top:10px;"><textarea class="clarify-elaborate" data-qid="'+_cEsc(q.id)+'" placeholder="Want to add more detail? (optional)" rows="2" style="width:100%;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;font-family:inherit;font-size:12px;resize:vertical;outline:none;box-sizing:border-box;color:var(--vscode-descriptionForeground);"></textarea></div>';
      return '<div class="clarify-q-inner">'+title+'<div style="margin-left:38px;display:flex;flex-direction:column;">'+opts+'</div><div style="margin-left:38px;">'+elab+'</div></div>';
    }

    function _showClarifySummary(card, questions) {
      var ans = card._clarifyAnswers || {};
      var items = '';
      for (var i=0; i<questions.length; i++) {
        var q = questions[i]; if (q.id === 'build_approach') continue;
        var a = ans[q.id]; if (!a) continue;
        var det = ans[q.id+'_detail'];
        items += '<div style="padding:10px 14px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:8px;">'
          +'<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:4px;">'+_cEsc(q.question)+'</div>'
          +'<div style="font-size:13px;font-weight:600;color:var(--vscode-foreground);">'+_cEsc(a)+'</div>'
          +(det ? '<div style="font-size:11px;color:#3b82f6;margin-top:4px;">→ '+_cEsc(det)+'</div>' : '')+'</div>';
      }
      var sumEl = card.querySelector('.clarify-summary');
      var qWrap = card.querySelector('.clarify-q-wrap');
      var nav = card.querySelector('.clarify-nav');
      if (qWrap) qWrap.style.display = 'none';
      if (nav) nav.style.display = 'none';
      if (sumEl) {
        sumEl.style.display = 'block';
        sumEl.innerHTML = '<div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);margin-bottom:14px;">&#x1F4CB; Your build plan:</div>'
          +'<div>'+(items||'<em style="color:var(--vscode-descriptionForeground)">No specific preferences — AI decides everything.</em>')+'</div>'
          +'<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin:14px 0 10px;">If everything looks right, hit Build. If not, click Make Changes to go back.</div>'
          +'<div style="display:flex;gap:10px;">'
          +'<button class="clarify-build-btn" style="padding:10px 24px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;box-shadow:0 2px 8px rgba(16,185,129,0.3);">&#x1F680; Build it!</button>'
          +'<button class="clarify-revise-btn" style="padding:10px 24px;background:rgba(255,255,255,0.06);color:var(--vscode-descriptionForeground);border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;">Make changes</button>'
          +'</div>';
      }
    }

    document.addEventListener('click', (e) => {
      const target = e.target; if (!target) return;
      var feedbackBtn = target.closest ? target.closest('[data-feedback]') : (target.getAttribute&&target.getAttribute('data-feedback')?target:null);
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
      const autoOpenEl = target.closest ? target.closest('[data-action="toggle-auto-open"]') : (target.getAttribute&&target.getAttribute('data-action')==='toggle-auto-open'?target:null);
      if (autoOpenEl) {
        const checkbox = autoOpenEl.querySelector('input[type="checkbox"]') || autoOpenEl;
        const isChecked = checkbox.checked !== undefined ? checkbox.checked : checkbox.getAttribute('checked');
        try { vscode.postMessage({type:'toggle-setting', setting:'startupBehavior', value:isChecked ? 'lastProject' : 'launcher'}); } catch(e) {}
        return;
      }
      const recentItem = target.closest ? target.closest('[data-recent-path]') : (target.getAttribute&&target.getAttribute('data-recent-path')?target:null);
      if (recentItem) {
        const projectPath = recentItem.getAttribute('data-recent-path');
        if (projectPath) { vscode.postMessage({type:'open-recent-project', folderPath: projectPath}); }
        return;
      }
      // Clarify: Next / Submit button — advances one question at a time
      var clarifyNextBtn = target.closest ? target.closest('.clarify-next-btn') : null;
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
      // Open Workspace button
      const openWsBtn = target.closest ? target.closest('.open-workspace-btn') : null;
      if (openWsBtn) {
        const b64 = openWsBtn.getAttribute('data-path');
        if (b64) { try { const rawPath = decodeURIComponent(escape(atob(b64))); vscode.postMessage({ type: 'open-workspace-btn', path: rawPath }); } catch(e) {} }
        return;
      }
    });
  `;
}
