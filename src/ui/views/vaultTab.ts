// [SCOPE] CHASSIS Vault tab — reusable code library browser with category grid

import * as path from 'path';
import { VaultService, VaultCategory, VaultItem, VAULT_CATEGORIES } from '../../services/vaultService.js';

export function getVaultItems(vaultService: VaultService): VaultItem[] {
  return vaultService.listItems(true); // global vault
}

export function getVaultCategoryCounts(vaultService: VaultService): Record<string, number> {
  const all = vaultService.listItems(true);
  const counts: Record<string, number> = {};
  for (const c of VAULT_CATEGORIES) counts[c] = 0;
  for (const item of all) {
    for (const tag of item.tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return counts;
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function renderVaultScanSummary(
  newItems: VaultItem[],
  duplicates: VaultItem[],
  fileCount: number,
  filteredCount: number,
  isActive: boolean
): string {
  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  let html = `<div id="tab-vault" class="tab-content ${isActive ? 'active' : ''}">`;
  html += `
    <div style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <button id="vault-scan-back" style="padding: 4px 10px; background: transparent; color: var(--fg, #e6edf3); border: 1px solid var(--border, #334455); border-radius: 4px; cursor: pointer; font-size: 12px;">&larr; Back</button>
        <span style="font-size: 14px; font-weight: 600;">Vault Scan Results</span>
      </div>
      <div style="font-size: 13px; margin-bottom: 8px; line-height: 1.5;">
        Scan complete — <strong style="color: #4ec959;">${newItems.length} new blocks</strong> found`;
  const parts: string[] = [];
  if (duplicates.length > 0) parts.push(`${duplicates.length} duplicates skipped`);
  if (filteredCount > 0) parts.push(`${filteredCount} trivial filtered`);
  if (parts.length > 0) {
    html += ` (${parts.join(', ')})`;
  }
  html += ` across ${fileCount} files.
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button id="vault-scan-save-all" style="padding: 10px 24px; background: #238636; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;">Save All New (${newItems.length})</button>
        <button id="vault-scan-toggle-check" style="padding: 8px 14px; background: transparent; color: var(--fg, #e6edf3); border: 1px solid var(--border, #334455); border-radius: 4px; cursor: pointer; font-size: 12px;">Uncheck All</button>
        <button id="vault-scan-cancel" style="padding: 8px 14px; background: transparent; color: var(--fg, #e6edf3); border: 1px solid var(--border, #334455); border-radius: 4px; cursor: pointer; font-size: 12px;">Cancel</button>
      </div>
    </div>`;

  html += '<div class="list">';
  for (const item of newItems) {
    const lineCount = item.block.lines ? (item.block.lines[1] - item.block.lines[0] + 1) : item.block.code.split('\n').length;
    html += `
      <div class="list-item" style="display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <input type="checkbox" class="vault-scan-check" data-itemid="${esc(item.id)}" checked style="margin-top: 2px; cursor: pointer; flex-shrink: 0;" />
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">${esc(item.block.name)}</div>
            <div style="font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.4;">
              ${esc(path.basename(item.block.filePath))} &middot; ${esc(item.block.type)} &middot; ${lineCount} lines
            </div>
          </div>
          <button class="vault-scan-preview-btn" data-previewid="${esc(item.id)}" style="padding: 2px 8px; background: transparent; color: var(--vscode-descriptionForeground); border: 1px solid var(--border, #334455); border-radius: 4px; cursor: pointer; font-size: 11px; flex-shrink: 0;">Preview</button>
        </div>
        <div class="vault-scan-preview" id="preview-${esc(item.id)}" style="display: none; margin-left: 24px;">
          <pre style="background: var(--input-bg, #0d1117); border: 1px solid var(--border, #334455); border-radius: 4px; padding: 8px; font-size: 11px; overflow-x: auto; white-space: pre; max-height: 200px; overflow-y: auto;">${esc(item.block.code)}</pre>
        </div>
      </div>`;
  }
  for (const item of duplicates) {
    html += `
      <div class="list-item" style="display: flex; align-items: flex-start; gap: 8px; opacity: 0.5;">
        <input type="checkbox" disabled style="margin-top: 2px; flex-shrink: 0;" />
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">
            ${esc(item.block.name)}
            <span style="background: rgba(245,166,35,0.12); color: #f5a623; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: normal; margin-left: 4px;">Already in vault</span>
          </div>
          <div style="font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.4;">${esc(item.block.filePath)}</div>
        </div>
      </div>`;
  }
  html += '</div>';
  html += '</div>';
  return html;
}

export function renderVaultTab(
  vaultItems: VaultItem[],
  vaultView: 'categories' | 'items' | 'detail',
  vaultCategory: VaultCategory | null,
  vaultGlobal: boolean,
  vaultService: VaultService,
  isActive: boolean
): string {
  const counts = getVaultCategoryCounts(vaultService);
  const total = vaultItems.length;

  let html = `<div id="tab-vault" class="tab-content ${isActive ? 'active' : ''}">`;

  // Header with actions
  html += `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <div>
        <div class="section-title" style="margin:0;">Code Vault</div>
        <p style="margin:4px 0 0 0; font-size:12px; color:var(--vscode-descriptionForeground);">
          ${total} saved item${total === 1 ? '' : 's'} — reusable across all projects
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="vault-scan-btn" style="padding:6px 12px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">📂 Scan Codebase</button>
        <button id="vault-save-btn" style="padding:6px 12px; background:transparent; color:var(--fg,#e6edf3); border:1px solid var(--border,#334455); border-radius:4px; cursor:pointer; font-size:12px;">💾 Save from Project</button>
      </div>
    </div>`;

  if (vaultView === 'items' && vaultCategory && vaultItems.length > 0) {
    // Detail view: list items in selected category
    const catLabel = vaultCategory || 'All';
    const catIcon = '📦';
    html += `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <button id="vault-back-btn" style="padding:4px 10px; background:transparent; color:var(--fg,#e6edf3); border:1px solid var(--border,#334455); border-radius:4px; cursor:pointer; font-size:12px;">← Back</button>
        <span style="font-size:14px; font-weight:600;">${catIcon} ${catLabel}</span>
        <span style="font-size:11px; color:var(--vscode-descriptionForeground);">${vaultItems.length} item${vaultItems.length === 1 ? '' : 's'}</span>
      </div>
      <div class="list">`;
    for (const item of vaultItems) {
      html += `
        <div class="list-item" data-vaultid="${esc(item.id)}" data-vaultglobal="${vaultGlobal}" style="display:flex; justify-content:space-between; align-items:flex-start; cursor:pointer;">
          <div style="flex:1; min-width:0; cursor:inherit;">
            <div style="font-weight:600; font-size:13px; margin-bottom:2px;">${esc(item.block.name)}</div>
            <div style="font-size:11px; color:var(--vscode-descriptionForeground); line-height:1.4;">${esc(item.block.filePath)}</div>
            <div style="font-size:10px; color:var(--vscode-descriptionForeground); margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">
              <span>${esc(item.block.language)}</span>
              <span>•</span>
              <span>${item.tags.join(', ')}</span>
            </div>
          </div>
          <div style="display:flex; gap:4px; flex-shrink:0; margin-left:8px;">
            <button class="vault-open-btn" data-itemid="${esc(item.id)}" data-global="${vaultGlobal}" style="padding:4px 10px; background:#1f6feb; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Open</button>
            <button class="vault-import-btn" data-itemid="${esc(item.id)}" data-global="${vaultGlobal}" style="padding:4px 10px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Import</button>
            <button class="vault-delete-btn" data-itemid="${esc(item.id)}" data-global="${vaultGlobal}" style="padding:4px 8px; background:transparent; color:#f85149; border:1px solid #f85149; border-radius:4px; cursor:pointer; font-size:11px;">×</button>
          </div>
        </div>`;
    }
    html += '</div>';
  } else {
    // Category grid view
    html += '<div class="cards cols-3">';
    for (const cat of VAULT_CATEGORIES) {
      const count = counts[cat] || 0;
      html += `
        <div class="card vault-cat-card" data-category="${cat}" style="${count === 0 ? 'opacity:0.6;' : ''}">
          <div class="card-icon">📦</div>
          <div class="card-body">
            <div class="card-title">${cat}</div>
            <div class="card-desc">${count} saved item${count === 1 ? '' : 's'}</div>
          </div>
        </div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}
