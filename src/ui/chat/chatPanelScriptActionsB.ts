// [SCOPE] Chat Panel Webview Script — Feedback, toggle-auto-open, recent project click handlers
// Extracted from chatPanelScriptActions.ts (was at 200-line limit). Keep under 200 lines.

export function buildActionsScriptB(): string {
  return `
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
    });
  `;
}
