// [SCOPE] Redivivus Vault commands — scan result display helpers

import { ChatPanel } from '../../chat/ui/chatPanel.js';

const catIcons: Record<string, string> = {
  component: '🧩', utility: '🔧', algorithm: '⚙️', pattern: '🏗️',
  config: '⚙️', api: '🌐', database: '🗄️', auth: '🔐',
  validation: '✅', error: '🚨', testing: '🧪', other: '📦',
};

export function showVaultScanResults(items: any[], fileCount: number, filteredCount: number, savedCount?: number, dupCount?: number): void {
  const itemsHtml = items.slice(0, 50).map(item => {
    const cat = item.category || 'other';
    const icon = catIcons[cat] || '📦';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--vscode-input-border);">
      <span style="font-size:14px;">${icon}</span>
      <span style="flex:1;font-size:13px;">${escapeHtml(item.name)}</span>
      <span style="font-size:11px;opacity:0.7;background:var(--vscode-input-background);padding:2px 6px;border-radius:4px;">${item.language}</span>
    </div>`;
  }).join('') || '<div style="padding:20px;text-align:center;opacity:0.6;">No items found.</div>';

  const actionsHtml = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
      <button data-cmd="redivivus.openVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">💾 Open Vault</button>
      <button data-cmd="redivivus.saveToVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">💾 Save to Vault</button>
      <button data-cmd="redivivus.scanVaultCodebase" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">📁 Scan to Vault</button>
      <button data-cmd="redivivus.buildFromVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-secondaryBackground, var(--vscode-button-background));color:var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;opacity:0.9;">🏗️ Build from Vault</button>
      <button data-cmd="redivivus.queryVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-secondaryBackground, var(--vscode-button-background));color:var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;opacity:0.9;">🔍 Query Vault</button>
      <button data-cmd="redivivus.validateVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-secondaryBackground, var(--vscode-button-background));color:var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;opacity:0.9;">✅ Validate</button>
    </div>
  `;

  const content = `
    <div style="font-size:13px;">
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="flex:1;text-align:center;padding:12px;background:var(--vscode-input-background);border-radius:6px;">
          <div style="font-size:24px;font-weight:bold;color:#4ec959;">${items.length}</div>
          <div style="font-size:11px;opacity:0.7;">Items Found</div>
        </div>
        <div style="flex:1;text-align:center;padding:12px;background:var(--vscode-input-background);border-radius:6px;">
          <div style="font-size:24px;font-weight:bold;">${fileCount}</div>
          <div style="font-size:11px;opacity:0.7;">Files Scanned</div>
        </div>
        ${(savedCount !== undefined) ? `<div style="flex:1;text-align:center;padding:12px;background:var(--vscode-input-background);border-radius:6px;"><div style="font-size:24px;font-weight:bold;color:#3b82f6;">${savedCount}</div><div style="font-size:11px;opacity:0.7;">Saved</div></div>` : ''}
        ${(dupCount !== undefined && dupCount > 0) ? `<div style="flex:1;text-align:center;padding:12px;background:var(--vscode-input-background);border-radius:6px;"><div style="font-size:24px;font-weight:bold;color:#ff534f;">${dupCount}</div><div style="font-size:11px;opacity:0.7;">Duplicates</div></div>` : ''}
      </div>
      ${actionsHtml}
      <div style="max-height:300px;overflow-y:auto;">${itemsHtml}</div>
      <div style="margin-top:12px;padding:10px;background:rgba(78,201,89,0.1);border-radius:6px;font-size:12px;">
        ✅ Click <strong>💾 Open Vault</strong> above to browse all saved items.
      </div>
    </div>
  `;

  ChatPanel.currentPanel?.showPanel('vault-scan', '🔍 Vault Scan Results', content);
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}
