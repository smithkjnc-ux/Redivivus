// [SCOPE] Vault Browse command — opens vault in its own WebviewPanel (not inside chat panel).
// Own panel = full HTML document = no CSS interference from chat panel styles.

import * as vscode from 'vscode';
import type { VaultService } from '../infrastructure/vaultService.js';
import { renderVaultBrowser } from '../../../ui/views/vaultBrowserRenderer.js';

let _vaultPanel: vscode.WebviewPanel | undefined;

export function registerVaultBrowseCommand(
  context: vscode.ExtensionContext,
  vaultService: VaultService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openVault', (scrollToItem?: string) => {
      if (_vaultPanel) {
        _vaultPanel.reveal(vscode.ViewColumn.One);
        _vaultPanel.webview.html = buildVaultHtml(vaultService, scrollToItem);
        return;
      }

      _vaultPanel = vscode.window.createWebviewPanel(
        'redivivusVault', '💾 Vault Browser',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      _vaultPanel.onDidDispose(() => { _vaultPanel = undefined; });
      _vaultPanel.webview.html = buildVaultHtml(vaultService, scrollToItem);

      _vaultPanel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'cmd') {
          vscode.commands.executeCommand(msg.command);
        }
      });
    })
  );
}

function buildVaultHtml(vaultService: VaultService, scrollToItem?: string): string {
  const items = vaultService.listItems();
  const body = renderVaultBrowser(items);
  const autoOpen = scrollToItem
    ? `(function(){
        var name = ${JSON.stringify(scrollToItem.toLowerCase().replace(/[_-]/g,' '))};
        var shelves = document.querySelectorAll('[data-vshelf]');
        shelves.forEach(function(shelf) {
          var items = shelf.querySelectorAll('[data-vitem]');
          items.forEach(function(item) {
            if (item.textContent.toLowerCase().includes(name)) {
              var cat = shelf.getAttribute('data-vshelf');
              var el = document.getElementById('items-' + cat);
              if (el) { el.style.display = 'block'; }
              item.style.outline = '2px solid #1a6fb8';
              item.style.borderRadius = '10px';
              setTimeout(function(){ item.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
            }
          });
        });
      })();`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    html, body { margin:0; padding:0; background:#f7f7f8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#1e1e1e; }
    * { box-sizing:border-box; }
    details summary::-webkit-details-marker { display:none; }
    input:focus { outline:2px solid #1a6fb8; }
  </style>
  </head><body>
  ${body}
  <script>
    (function() {
      const vscode = acquireVsCodeApi();

      // Click: run-command buttons and shelf toggles
      document.addEventListener('click', function(e) {
        var cmdEl = e.target.closest('[data-cmd]');
        if (cmdEl) { vscode.postMessage({ type: 'cmd', command: cmdEl.getAttribute('data-cmd') }); return; }
        var toggleEl = e.target.closest('[data-toggle-shelf]');
        if (toggleEl) {
          var cat = toggleEl.getAttribute('data-toggle-shelf');
          var el = document.getElementById('items-' + cat);
          var arr = document.getElementById('arr-' + cat);
          if (!el) return;
          var open = el.style.display === 'block';
          el.style.display = open ? 'none' : 'block';
          if (arr) arr.textContent = open ? '\u25bc' : '\u25b2';
        }
      });

      // Search filter
      var searchInput = document.getElementById('vault-search');
      if (searchInput) {
        searchInput.addEventListener('input', function() {
          var term = this.value.trim().toLowerCase();
          var shelves = document.querySelectorAll('[data-vshelf]');
          var anyVisible = false;
          shelves.forEach(function(shelf) {
            if (!term) {
              shelf.style.display = '';
              var cat = shelf.getAttribute('data-vshelf');
              var items = shelf.querySelectorAll('[data-vitem]');
              items.forEach(function(item) { item.style.display = ''; });
              return;
            }
            var items = shelf.querySelectorAll('[data-vitem]');
            var shelfVisible = false;
            items.forEach(function(item) {
              var match = item.textContent.toLowerCase().indexOf(term) >= 0;
              item.style.display = match ? '' : 'none';
              if (match) { shelfVisible = true; }
            });
            shelf.style.display = shelfVisible ? '' : 'none';
            if (shelfVisible) {
              anyVisible = true;
              var itemsEl = document.getElementById('items-' + shelf.getAttribute('data-vshelf'));
              if (itemsEl) { itemsEl.style.display = 'block'; }
            }
          });
          var nr = document.getElementById('vault-no-results');
          if (nr) { nr.style.display = (term && !anyVisible) ? 'block' : 'none'; }
        });
      }

      ${autoOpen}
    })();
  </script>
  </body></html>`;
}
