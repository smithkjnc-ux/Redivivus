// [SCOPE] Blueprint card webview script — click handlers for .bpc-build-btn and .bpc-edit-btn
// Extracted into its own file per 200-line rule. Appended to chat webview via chatPanelScript.ts.
// [WARN] ASCII only — no emoji or Unicode box chars in this template string (Rule 13).

export function buildBlueprintCardScript(): string {
  return `
    document.addEventListener('click', function(e) {
      var target = (e.target && e.target.nodeType === 3) ? e.target.parentNode : e.target;
      if (!target) return;

      var buildBtn = target.closest ? target.closest('.bpc-build-btn') : (target.classList&&target.classList.contains('bpc-build-btn')?target:null);
      if (buildBtn) {
        var sid = buildBtn.getAttribute('data-session') || '';
        var card = document.querySelector('.bpc-card[data-session="'+sid+'"]');
        var answers = {};
        if (card) {
          card.querySelectorAll('.bpc-input').forEach(function(inp) {
            var f = inp.getAttribute('data-field');
            if (f) { answers[f] = inp.value || ''; }
          });
        }
        buildBtn.textContent = 'Building...';
        buildBtn.setAttribute('disabled', 'true');
        var editBtn = card && card.querySelector('.bpc-edit-btn');
        if (editBtn) { editBtn.setAttribute('disabled', 'true'); }
        try { vscode.postMessage({ type: 'blueprint-card-confirm', sessionId: sid, answers: answers }); } catch(ex) {}
        return;
      }

      var editBtn2 = target.closest ? target.closest('.bpc-edit-btn') : (target.classList&&target.classList.contains('bpc-edit-btn')?target:null);
      if (editBtn2) {
        var sid2 = editBtn2.getAttribute('data-session') || '';
        var card2 = document.querySelector('.bpc-card[data-session="'+sid2+'"]');
        if (card2) {
          card2.querySelectorAll('.bpc-static').forEach(function(el) {
            var field = el.getAttribute('data-field') || '';
            var hiddenInp = card2.querySelector('input.bpc-input[data-field="'+field+'"]');
            var inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'bpc-input';
            inp.setAttribute('data-field', field);
            inp.value = hiddenInp ? hiddenInp.value : '';
            inp.style.cssText = 'flex:1;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);color:var(--vscode-foreground);border-radius:5px;padding:5px 8px;font-size:12px;font-family:inherit;';
            el.parentNode.replaceChild(inp, el);
            if (hiddenInp) { hiddenInp.parentNode.removeChild(hiddenInp); }
          });
        }
        editBtn2.style.display = 'none';
        return;
      }
    });
  `;
}
