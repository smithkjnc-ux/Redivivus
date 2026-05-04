// [SCOPE] New Project Wizard script handlers — start, blueprint step, name+location step
// Called by scripts.ts assembler. No vault, session form, or settings logic here.

export function getWizardScripts(): string {
  return `
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
    // [WARN] sanitizeProjectName output is used in file paths — test all edge cases thoroughly.
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
        folderPath.innerHTML = (sanitized && parent)
          ? 'Project will be created at: <strong>' + parent + '/' + sanitized + '</strong>'
          : '';
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
        // [WARN] folderPath extraction depends on textContent matching exactly — fragile if HTML changes.
        const folderPath = pathEl
          ? pathEl.textContent.replace('Project will be created at: ', '').replace(/\\s+/g, '').trim()
          : '';
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
  `;
}
