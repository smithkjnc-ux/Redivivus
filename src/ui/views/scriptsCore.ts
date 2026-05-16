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

    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'show-pick-project-modal') {
        var existing = document.getElementById('pick-project-modal-overlay');
        if (existing) existing.remove();
        var folderPath = msg.folderPath || '';
        var folderName = msg.folderName || folderPath;
        var ov = document.createElement('div');
        ov.id = 'pick-project-modal-overlay';
        ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
        var cd = document.createElement('div');
        cd.style.cssText = 'background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-foreground,#ccc);border-radius:12px;width:460px;max-width:92vw;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid var(--vscode-editorGroup-border,#444);overflow:hidden;font-family:inherit;';
        cd.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:20px 20px 0;">' +
            '<div>' +
              '<div style="font-size:16px;font-weight:700;margin-bottom:5px;">This project hasn\'t been set up with CHASSIS yet</div>' +
              '<div style="font-size:12px;color:var(--vscode-descriptionForeground,#888);font-family:monospace;word-break:break-all;">' + folderName + '</div>' +
            '</div>' +
            '<button id="ppm-close" style="background:none;border:none;color:var(--vscode-descriptionForeground,#888);cursor:pointer;font-size:20px;padding:0 4px;line-height:1;flex-shrink:0;">&#x2715;</button>' +
          '</div>' +
          '<div style="padding:16px 20px 8px;font-size:13px;color:var(--vscode-descriptionForeground,#999);line-height:1.5;">' +
            'CHASSIS tracks your blueprint, sessions, vault, and history. Set it up now for the full experience, or browse the folder without setup.' +
          '</div>' +
          '<div style="display:flex;gap:10px;padding:12px 20px 20px;justify-content:flex-end;">' +
            '<button id="ppm-browse" style="padding:9px 20px;border:1px solid var(--vscode-input-border,#555);background:transparent;color:var(--vscode-descriptionForeground,#aaa);border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;">Browse Anyway</button>' +
            '<button id="ppm-setup" style="padding:9px 22px;border:none;background:#2d8a4e;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;">&#x1F527; Set It Up</button>' +
          '</div>';
        ov.appendChild(cd);
        document.body.appendChild(ov);
        document.getElementById('ppm-close').onclick = function() { ov.remove(); };
        document.getElementById('ppm-browse').onclick = function() { ov.remove(); vscode.postMessage({ type: 'browse-anyway', folderPath: folderPath }); };
        document.getElementById('ppm-setup').onclick = function() { ov.remove(); vscode.postMessage({ type: 'set-it-up', folderPath: folderPath }); };
        setTimeout(function() { var b = document.getElementById('ppm-setup'); if (b) b.focus(); }, 50);
      }
    });

    // [DONE] console.log removed from vault list-item handler (no console.log in this block).
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
