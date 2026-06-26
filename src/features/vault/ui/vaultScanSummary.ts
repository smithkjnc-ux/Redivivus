// [SCOPE] Vault scan summary renderer — renderVaultScanSummary for scan results view
// Called by vaultTab. No data retrieval or main tab rendering logic here.

import * as path from 'path';
import type { VaultItem } from '../infrastructure/vaultService.js';
import { esc } from './vaultDataUtils.js';

export function renderVaultScanSummary(
  newItems: VaultItem[],
  duplicates: VaultItem[],
  fileCount: number,
  filteredCount: number,
  isActive: boolean
): string {
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
  if (duplicates.length > 0) {parts.push(`${duplicates.length} duplicates skipped`);}
  if (filteredCount > 0) {parts.push(`${filteredCount} trivial filtered`);}
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
    const lineCount = item.lineCount || item.code.split('\n').length;
    html += `
      <div class="list-item" style="display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <input type="checkbox" class="vault-scan-check" data-itemid="${esc(item.id)}" checked style="margin-top: 2px; cursor: pointer; flex-shrink: 0;" />
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">${esc(item.name)}</div>
            <div style="font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.4;">
              ${esc(path.basename(item.sourceFile))} &middot; ${esc(item.language)} &middot; ${lineCount} lines
            </div>
          </div>
          <button class="vault-scan-preview-btn" data-previewid="${esc(item.id)}" style="padding: 2px 8px; background: transparent; color: var(--vscode-descriptionForeground); border: 1px solid var(--border, #334455); border-radius: 4px; cursor: pointer; font-size: 11px; flex-shrink: 0;">Preview</button>
        </div>
        <div class="vault-scan-preview" id="preview-${esc(item.id)}" style="display: none; margin-left: 24px;">
          <pre style="background: var(--input-bg, #0d1117); border: 1px solid var(--border, #334455); border-radius: 4px; padding: 8px; font-size: 11px; overflow-x: auto; white-space: pre; max-height: 200px; overflow-y: auto;">${esc(item.code)}</pre>
        </div>
      </div>`;
  }
  for (const item of duplicates) {
    html += `
      <div class="list-item" style="display: flex; align-items: flex-start; gap: 8px; opacity: 0.5;">
        <input type="checkbox" disabled style="margin-top: 2px; flex-shrink: 0;" />
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">
            ${esc(item.name)}
            <span style="background: rgba(245,166,35,0.12); color: #f5a623; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: normal; margin-left: 4px;">Already in vault</span>
          </div>
          <div style="font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.4;">${esc(item.sourceFile)}</div>
        </div>
      </div>`;
  }
  html += '</div>';
  html += '</div>';
  return html;
}
