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

    // ── Key Export/Import handlers ──
    document.querySelectorAll('.key-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const provider = btn.dataset.provider;
        vscode.postMessage({ type: 'exportKey', provider });
      });
    });

    const exportAllBtn = document.getElementById('export-all-keys-btn');
    if (exportAllBtn) {
      exportAllBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'exportAllKeys' });
      });
    }

    const importKeysBtn = document.getElementById('import-keys-btn');
    if (importKeysBtn) {
      importKeysBtn.addEventListener('click', () => {
        const textarea = document.getElementById('import-keys-textarea');
        const text = textarea ? textarea.value.trim() : '';
        if (!text) {
          showKeyStatus('Paste some keys first.', 'warning');
          return;
        }
        vscode.postMessage({ type: 'importKeys', text });
      });
    }

    function showKeyStatus(message, type = 'info') {
      const status = document.getElementById('key-export-status');
      if (status) {
        const colors = { info: '#58a6ff', success: '#3fb950', warning: '#d29922', error: '#f85149' };
        status.innerHTML = '<span style="color:' + (colors[type] || colors.info) + '">' + message + '</span>';
        setTimeout(() => { status.innerHTML = ''; }, 5000);
      }
    }

    // Listen for key export responses
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'keyExported') {
        if (msg.success) {
          showKeyStatus('✅ Copied to clipboard!', 'success');
        } else {
          showKeyStatus('❌ Failed to copy', 'error');
        }
      } else if (msg.type === 'allKeysExported') {
        if (msg.success) {
          showKeyStatus('✅ All keys copied to clipboard!', 'success');
        }
      } else if (msg.type === 'keysImported') {
        if (msg.imported && msg.imported.length > 0) {
          showKeyStatus('✅ Imported ' + msg.imported.length + ' key(s)', 'success');
          setTimeout(() => vscode.postMessage({ type: 'command', command: 'redivivus.refreshChat' }), 500);
        } else {
          showKeyStatus('⚠️ No valid keys found in pasted text', 'warning');
        }
      } else if (msg.type === 'keyPreviews') {
        // Update key preview displays
        if (msg.previews) {
          for (const [provider, preview] of Object.entries(msg.previews)) {
            const row = document.querySelector('.key-export-row[data-provider="' + provider + '"]');
            if (row) {
              const previewEl = row.querySelector('.key-preview');
              if (previewEl) previewEl.textContent = preview || 'Not available';
            }
          }
        }
      }
    });

    // Request key previews on load
    if (document.querySelector('.key-export-row')) {
      vscode.postMessage({ type: 'getKeyPreviews' });
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
