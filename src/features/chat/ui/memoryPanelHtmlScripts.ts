// [SCOPE] DOM interactions and webview messaging scripts for the Memory Panel
export function getMemoryPanelScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (e) => {
      const t = e.target;
      // Delete explicit preference
      if (t.dataset.type === 'explicit') {
        vscode.postMessage({ type: 'delete-explicit', index: parseInt(t.dataset.index) });
        return;
      }
      // Delete knowledge entry
      if (t.dataset.type === 'knowledge') {
        vscode.postMessage({ type: 'delete-knowledge', root: t.dataset.root, index: parseInt(t.dataset.index) });
        return;
      }
      // Clear recent
      if (t.id === 'clear-recent-btn') {
        vscode.postMessage({ type: 'clear-recent', root: t.dataset.root });
        return;
      }
      // Open rules file
      if (t.id === 'open-rules-btn') {
        vscode.postMessage({ type: 'open-rules-file', path: t.dataset.path });
        return;
      }
      // Add explicit preference
      if (t.id === 'add-pref-btn') {
        const input = document.getElementById('new-pref-input');
        if (input && input.value.trim()) {
          vscode.postMessage({ type: 'add-explicit', text: input.value.trim() });
          input.value = '';
        }
        return;
      }
    });
    // Enter key on add-preference input
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target && e.target.id === 'new-pref-input') {
        const input = e.target;
        if (input.value.trim()) {
          vscode.postMessage({ type: 'add-explicit', text: input.value.trim() });
          input.value = '';
        }
      }
    });
  `;
}
