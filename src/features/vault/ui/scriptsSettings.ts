// [SCOPE] Settings form handlers — API Keys (link intercept + save/clear) and Blueprint form
// Called by scripts.ts assembler. No session, vault, or wizard logic here.

export function getSettingsScripts(): string {
  return `
    // ── API Keys: intercept external links (webview can't open href directly) ──
    document.querySelectorAll('.ai-key-link').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        vscode.postMessage({ type: 'openExternal', url: a.dataset.url });
      });
    });

    // ── API Keys form handlers ──
    const apiKeysForm = document.getElementById('api-keys-form');
    const apiKeysCard = document.querySelector('[data-action="showApiKeysForm"]');
    if (apiKeysCard) {
      apiKeysCard.addEventListener('click', () => {
        if (apiKeysForm) apiKeysForm.style.display = 'block';
        apiKeysCard.style.display = 'none';
      });
    }
    document.querySelectorAll('.api-key-save-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ai = btn.dataset.ai;
        const input = document.getElementById('key-' + ai);
        const val = input ? input.value.trim() : '';
        // [WARN] alert() in a webview is jarring — replace with a soft UI notification in future.
        if (!val) { alert('Enter a key first.'); return; }
        vscode.postMessage({ type: 'saveApiKey', ai, key: val });
        if (input) input.value = '';
      });
    });
    document.querySelectorAll('.api-key-clear-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ai = btn.dataset.ai;
        // [WARN] confirm() in a webview is jarring — replace with a soft UI confirmation in future.
        if (confirm('Clear ' + ai.charAt(0).toUpperCase() + ai.slice(1) + ' API key?')) {
          vscode.postMessage({ type: 'saveApiKey', ai, key: '' });
        }
      });
    });
    const apiKeysCloseBtn = document.getElementById('api-keys-close-btn');
    if (apiKeysCloseBtn) {
      apiKeysCloseBtn.addEventListener('click', () => {
        if (apiKeysForm) apiKeysForm.style.display = 'none';
        if (apiKeysCard) apiKeysCard.style.display = '';
      });
    }

    // ── Blueprint form handlers ──
    const bpForm = document.getElementById('blueprint-form');
    const bpCard = document.querySelector('[data-action="showBlueprintForm"]');
    if (bpCard) {
      bpCard.addEventListener('click', () => {
        if (bpForm) bpForm.style.display = 'block';
        bpCard.style.display = 'none';
      });
    }
    const bpSaveBtn = document.getElementById('bp-save-btn');
    if (bpSaveBtn) {
      bpSaveBtn.addEventListener('click', () => {
        const data = {
          who: document.getElementById('bp-who').value.trim(),
          what: document.getElementById('bp-what').value.trim(),
          where: document.getElementById('bp-where').value.trim(),
          when: document.getElementById('bp-when').value.trim(),
          why: document.getElementById('bp-why').value.trim(),
          lock: document.getElementById('bp-lock').checked
        };
        vscode.postMessage({ type: 'saveBlueprint', data: data });
      });
    }
    const bpCancelBtn = document.getElementById('bp-cancel-btn');
    if (bpCancelBtn) {
      bpCancelBtn.addEventListener('click', () => {
        if (bpForm) bpForm.style.display = 'none';
        if (bpCard) bpCard.style.display = '';
      });
    }
  `;
}
