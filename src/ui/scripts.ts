// [SCOPE] CHASSIS Dashboard scripts — all JS event handlers for the WebView panel

export function getScripts(): string {
  return `
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-cmd]').forEach(el => {
      el.addEventListener('click', () => {
        const cmd = el.dataset.cmd;
        if (cmd) {
          if (el.dataset.pick) {
            vscode.postMessage({ type: 'pickAndRun', command: cmd });
          } else {
            vscode.postMessage({ command: cmd });
          }
        }
      });
    });

    // ── Start Working form handlers ──
    let selectedAi = '';
    const startForm = document.getElementById('start-form');
    const startCard = document.querySelector('[data-action="showStartForm"]');
    if (startCard) {
      startCard.addEventListener('click', () => {
        if (startForm) startForm.style.display = 'block';
        startCard.style.display = 'none';
      });
    }
    document.querySelectorAll('.ai-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedAi = btn.dataset.ai;
        document.querySelectorAll('.ai-btn').forEach(b => {
          b.style.background = 'var(--input-bg, #0d1117)';
          b.style.borderColor = 'var(--border, #334455)';
        });
        btn.style.background = '#238636';
        btn.style.borderColor = '#238636';
      });
    });
    const goBtn = document.getElementById('start-go-btn');
    if (goBtn) {
      goBtn.addEventListener('click', () => {
        const goal = document.getElementById('start-goal').value.trim();
        if (!goal) { document.getElementById('start-goal').style.borderColor = '#f85149'; return; }
        if (!selectedAi) { return; }
        vscode.postMessage({ type: 'startSession', goal: goal, ai: selectedAi });
      });
    }
    const cancelBtn = document.getElementById('start-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (startForm) startForm.style.display = 'none';
        if (startCard) startCard.style.display = '';
      });
    }

    // ── Done for Now form handlers ──
    const endForm = document.getElementById('end-form');
    const endCard = document.querySelector('[data-action="showEndForm"]');
    if (endCard) {
      endCard.addEventListener('click', () => {
        if (endForm) endForm.style.display = 'block';
        endCard.style.display = 'none';
      });
    }
    const endGoBtn = document.getElementById('end-go-btn');
    if (endGoBtn) {
      endGoBtn.addEventListener('click', () => {
        const data = {
          completed: document.getElementById('end-completed').value.trim(),
          inProgress: document.getElementById('end-inprogress').value.trim(),
          risks: document.getElementById('end-risks').value.trim(),
          nextStart: document.getElementById('end-nextstart').value.trim()
        };
        vscode.postMessage({ type: 'endSession', data: data });
      });
    }
    const endCancelBtn = document.getElementById('end-cancel-btn');
    if (endCancelBtn) {
      endCancelBtn.addEventListener('click', () => {
        if (endForm) endForm.style.display = 'none';
        if (endCard) endCard.style.display = '';
      });
    }

    // ── Switch AI form handlers ──
    let switchAi = '';
    const switchForm = document.getElementById('switch-form');
    const switchCard = document.querySelector('[data-action="showSwitchForm"]');
    if (switchCard) {
      switchCard.addEventListener('click', () => {
        if (switchForm) switchForm.style.display = 'block';
        switchCard.style.display = 'none';
      });
    }
    document.querySelectorAll('.switch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchAi = btn.dataset.ai;
        document.querySelectorAll('.switch-btn').forEach(b => {
          b.style.background = 'var(--input-bg, #0d1117)';
          b.style.borderColor = 'var(--border, #334455)';
        });
        btn.style.background = '#238636';
        btn.style.borderColor = '#238636';
      });
    });
    const switchGoBtn = document.getElementById('switch-go-btn');
    if (switchGoBtn) {
      switchGoBtn.addEventListener('click', () => {
        if (!switchAi) return;
        vscode.postMessage({ type: 'switchAI', ai: switchAi });
      });
    }
    const switchCancelBtn = document.getElementById('switch-cancel-btn');
    if (switchCancelBtn) {
      switchCancelBtn.addEventListener('click', () => {
        if (switchForm) switchForm.style.display = 'none';
        if (switchCard) switchCard.style.display = '';
      });
    }

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
        if (!val) { alert('Enter a key first.'); return; }
        vscode.postMessage({ type: 'saveApiKey', ai, key: val });
        if (input) input.value = '';
      });
    });
    document.querySelectorAll('.api-key-clear-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ai = btn.dataset.ai;
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

    // __ Blueprint form handlers __
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

    // ── Wizard start handler ──
    document.querySelectorAll('[data-action="startWizard"]').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'wizardStep', step: 'blueprint' });
      });
    });

    // ── Wizard blueprint Next / Back ──
    const wizBpNext = document.getElementById('wiz-bp-next');
    if (wizBpNext) {
      wizBpNext.addEventListener('click', () => {
        const data = {
          who: document.getElementById('wiz-bp-who').value.trim(),
          what: document.getElementById('wiz-bp-what').value.trim(),
          where: document.getElementById('wiz-bp-where').value.trim(),
          when: document.getElementById('wiz-bp-when').value.trim(),
          why: document.getElementById('wiz-bp-why').value.trim()
        };
        vscode.postMessage({ type: 'wizardBlueprint', data: data });
      });
    }
    const wizBpBack = document.getElementById('wiz-bp-back');
    if (wizBpBack) {
      wizBpBack.addEventListener('click', () => {
        vscode.postMessage({ type: 'wizardStep', step: 'welcome' });
      });
    }

    // ── Wizard name+location handlers ──
    function sanitizeProjectName(name) {
      return name.toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9\\-_]/g, '');
    }
    function updateFolderPath() {
      const input = document.getElementById('wiz-project-name');
      const parent = input ? input.dataset.parent : '';
      const name = input ? input.value.trim() : '';
      const sanitized = sanitizeProjectName(name);
      const folderDisplay = document.getElementById('wiz-folder-display');
      const folderPath = document.getElementById('wiz-folder-path');
      const createBtn = document.getElementById('wiz-create-btn');
      if (folderDisplay) {
        folderDisplay.innerHTML = sanitized ? 'Folder: <code>' + sanitized + '</code>' : '';
      }
      if (folderPath) {
        folderPath.innerHTML = (sanitized && parent) ? 'Project will be created at: <strong>' + parent + '/' + sanitized + '</strong>' : '';
      }
      if (createBtn) {
        createBtn.disabled = !sanitized;
        createBtn.style.background = sanitized ? '#238636' : '#333';
        createBtn.style.color = sanitized ? '#fff' : '#aaa';
      }
    }
    const wizProjectName = document.getElementById('wiz-project-name');
    if (wizProjectName) {
      wizProjectName.addEventListener('input', updateFolderPath);
    }
    const wizChangeParent = document.getElementById('wiz-change-parent');
    if (wizChangeParent) {
      wizChangeParent.addEventListener('click', (e) => {
        e.preventDefault();
        const name = document.getElementById('wiz-project-name').value.trim();
        vscode.postMessage({ type: 'wizardPickFolder', name: name });
      });
    }
    const wizCreateBtn = document.getElementById('wiz-create-btn');
    if (wizCreateBtn) {
      wizCreateBtn.addEventListener('click', () => {
        const name = document.getElementById('wiz-project-name').value.trim();
        const pathEl = document.getElementById('wiz-folder-path');
        const folderPath = pathEl ? pathEl.textContent.replace('Project will be created at: ', '').replace(/\\s+/g, '').trim() : '';
        if (name && folderPath) {
          vscode.postMessage({ type: 'wizardNameLocation', name: name, folder: folderPath });
        }
      });
    }
    const wizNameBack = document.getElementById('wiz-name-back');
    if (wizNameBack) {
      wizNameBack.addEventListener('click', () => {
        vscode.postMessage({ type: 'wizardStep', step: 'blueprint' });
      });
    }

    // ── Open Existing Project handler ──
    document.querySelectorAll('[data-action="pickProject"]').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'pickProject' });
      });
    });

    document.querySelectorAll('[data-openfile]').forEach(el => {
      el.addEventListener('click', () => {
        const filePath = el.dataset.openfile;
        if (filePath) { vscode.postMessage({ type: 'openFile', path: filePath }); }
      });
    });
    function showTab(name, e) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + name)?.classList.add('active');
      if (e && e.target) e.target.classList.add('active');
    }

    // ── Vault handlers ──
    // Level 1 → Level 2: category card clicked → show subcategories
    document.querySelectorAll('.vault-cat-card').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'vaultSetView', view: 'subcategories', category: el.dataset.category });
      });
    });
    // Level 2 → Level 3: subcategory card clicked → show items
    document.querySelectorAll('.vault-subcat-card').forEach(el => {
      el.addEventListener('click', () => {
        const sub = el.dataset.subcategory || '';
        vscode.postMessage({ type: 'vaultSetView', view: 'items', category: el.dataset.category, subcategory: sub });
      });
    });
    // Smart back button: reads data-backview to go to correct level
    const vaultBackBtn = document.getElementById('vault-back-btn');
    if (vaultBackBtn) {
      vaultBackBtn.addEventListener('click', () => {
        const backView = vaultBackBtn.dataset.backview || 'categories';
        const category = vaultBackBtn.dataset.category || null;
        vscode.postMessage({ type: 'vaultSetView', view: backView, category });
      });
    }
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
        vscode.postMessage({
          type: 'vaultOpenItem',
          itemId: btn.dataset.itemid,
          global: btn.dataset.global === 'true'
        });
      });
    });
    document.querySelectorAll('.vault-import-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({
          type: 'vaultImportItem',
          itemId: btn.dataset.itemid,
          global: btn.dataset.global === 'true'
        });
      });
    });
    document.querySelectorAll('.vault-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({
          type: 'vaultDeleteItem',
          itemId: btn.dataset.itemid,
          global: btn.dataset.global === 'true'
        });
      });
    });
    document.querySelectorAll('.list-item[data-vaultid]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.vault-import-btn, .vault-delete-btn, .vault-open-btn')) return;
        console.log('[vault] open item', el.dataset.vaultid, el.dataset.vaultglobal);
        vscode.postMessage({
          type: 'vaultOpenItem',
          itemId: el.dataset.vaultid,
          global: el.dataset.vaultglobal === 'true'
        });
      });
    });
  `;
}
