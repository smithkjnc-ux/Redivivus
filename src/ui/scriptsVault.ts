// [SCOPE] Vault WebView script handlers — navigation, scan, save, open, import, delete
// Called by scripts.ts assembler. No session form, wizard, or settings logic here.

export function getVaultScripts(): string {
  return `
    // ── Vault navigation: category → subcategory → items ──
    document.querySelectorAll('.vault-cat-card').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'vaultSetView', view: 'subcategories', category: el.dataset.category });
      });
    });
    document.querySelectorAll('.vault-subcat-card').forEach(el => {
      el.addEventListener('click', () => {
        const sub = el.dataset.subcategory || '';
        vscode.postMessage({ type: 'vaultSetView', view: 'items', category: el.dataset.category, subcategory: sub });
      });
    });

    // ── Vault back button ──
    const vaultBackBtn = document.getElementById('vault-back-btn');
    if (vaultBackBtn) {
      vaultBackBtn.addEventListener('click', () => {
        const backView = vaultBackBtn.dataset.backview || 'categories';
        const category = vaultBackBtn.dataset.category || null;
        vscode.postMessage({ type: 'vaultSetView', view: backView, category });
      });
    }

    // ── Vault scan controls ──
    const vaultScanBtn = document.getElementById('vault-scan-btn');
    if (vaultScanBtn) {
      vaultScanBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'vaultScanCodebase' });
      });
    }
    const vaultScanSaveAll = document.getElementById('vault-scan-save-all');
    if (vaultScanSaveAll) {
      vaultScanSaveAll.addEventListener('click', () => {
        const checked = document.querySelectorAll('.vault-scan-check:checked');
        const ids = Array.from(checked).map(el => el.dataset.itemid);
        vscode.postMessage({ type: 'vaultScanSaveAll', itemIds: ids });
      });
    }
    const vaultScanCancel = document.getElementById('vault-scan-cancel');
    if (vaultScanCancel) {
      vaultScanCancel.addEventListener('click', () => {
        vscode.postMessage({ type: 'vaultScanCancel' });
      });
    }
    const vaultScanBack = document.getElementById('vault-scan-back');
    if (vaultScanBack) {
      vaultScanBack.addEventListener('click', () => {
        vscode.postMessage({ type: 'vaultScanCancel' });
      });
    }
    const vaultScanToggleCheck = document.getElementById('vault-scan-toggle-check');
    if (vaultScanToggleCheck) {
      vaultScanToggleCheck.addEventListener('click', () => {
        const allChecks = document.querySelectorAll('.vault-scan-check');
        const allChecked = Array.from(allChecks).every(c => c.checked);
        allChecks.forEach(c => c.checked = !allChecked);
        vaultScanToggleCheck.textContent = allChecked ? 'Check All' : 'Uncheck All';
      });
    }
    document.querySelectorAll('.vault-scan-preview-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preview = document.getElementById('preview-' + btn.dataset.previewid);
        if (preview) {
          const showing = preview.style.display !== 'none';
          preview.style.display = showing ? 'none' : 'block';
          btn.textContent = showing ? 'Preview' : 'Hide';
        }
      });
    });

    // ── Vault item actions ──
    const vaultSaveBtn = document.getElementById('vault-save-btn');
    if (vaultSaveBtn) {
      vaultSaveBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'vaultSaveFromProject' });
      });
    }
    const vaultRecategorizeBtn = document.getElementById('vault-recategorize-btn');
    if (vaultRecategorizeBtn) {
      vaultRecategorizeBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'vaultRecategorize' });
      });
    }
    document.querySelectorAll('.vault-open-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'vaultOpenItem', itemId: btn.dataset.itemid, global: btn.dataset.global === 'true' });
      });
    });
    document.querySelectorAll('.vault-import-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'vaultImportItem', itemId: btn.dataset.itemid, global: btn.dataset.global === 'true' });
      });
    });
    document.querySelectorAll('.vault-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // [WARN] Deletion has no undo — backend must validate before acting.
        vscode.postMessage({ type: 'vaultDeleteItem', itemId: btn.dataset.itemid, global: btn.dataset.global === 'true' });
      });
    });
    document.querySelectorAll('.list-item[data-vaultid]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.vault-import-btn, .vault-delete-btn, .vault-open-btn')) return;
        vscode.postMessage({ type: 'vaultOpenItem', itemId: el.dataset.vaultid, global: el.dataset.vaultglobal === 'true' });
      });
    });
  `;
}
