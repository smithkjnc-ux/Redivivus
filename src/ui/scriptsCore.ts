// [SCOPE] Core WebView script helpers — general command dispatch, file open, tab switching
// Called by scripts.ts assembler. No form-specific or vault-specific logic here.

export function getCoreScripts(): string {
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

    document.querySelectorAll('[data-openfile]').forEach(el => {
      el.addEventListener('click', () => {
        const filePath = el.dataset.openfile;
        if (filePath) { vscode.postMessage({ type: 'openFile', path: filePath }); }
      });
    });

    document.querySelectorAll('[data-action="pickProject"]').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'pickProject' });
      });
    });

    document.querySelectorAll('[data-action="dismissWelcome"]').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'dismissWelcome' });
      });
    });

    // [TODO] Remove console.log from production code (vault list-item handler).
    // [WARN] showTab is defined but called externally via inline onclick attributes — do not remove.
    function showTab(name, e) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + name)?.classList.add('active');
      if (e && e.target) e.target.classList.add('active');
      // Notify extension of tab change so state stays in sync
      vscode.postMessage({ type: 'setTab', tab: name });
    }
  `;
}
