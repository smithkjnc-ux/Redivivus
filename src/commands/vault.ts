// [SCOPE] CHASSIS Vault commands — save reusable code blocks + scan entire codebase
// Now opens results in chat panel instead of separate webview

import * as vscode from 'vscode';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { VaultService, VAULT_CATEGORIES, VaultItem } from '../services/vaultService.js';
import { RoutingService } from '../services/routingService.js';
import { ChatPanel } from '../ui/chatPanel.js';

// Cache last scan results so Save to Vault in results panel can save them
let _pendingScanItems: VaultItem[] = [];

export function registerVaultCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  vaultService: VaultService,
  routing: RoutingService,
  refreshAll: () => void
): void {
  // Save to Vault — saves pending scan results if available, otherwise scans the current file
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.saveToVault', async () => {
      // If we have pending scan results (from Scan Project), save those
      const itemsToSave = _pendingScanItems.length > 0 ? _pendingScanItems : null;
      if (itemsToSave) {
        const confirm = await vscode.window.showInformationMessage(
          `Save ${itemsToSave.length} scanned items to your Vault?`,
          { modal: true }, 'Save All'
        );
        if (confirm !== 'Save All') { return; }
        let savedCount = 0;
        let dupCount = 0;
        for (const item of itemsToSave) {
          if (!vaultService.isDuplicate(item.contentHash)) {
            vaultService.saveItem(item);
            savedCount++;
          } else {
            dupCount++;
          }
        }
        _pendingScanItems = [];
        await ensureChatPanelOpen();
        showVaultScanResults(itemsToSave, itemsToSave.length, 0, savedCount, dupCount);
        vscode.window.showInformationMessage(`Vault: Saved ${savedCount} items (${dupCount} duplicates skipped).`);
        return;
      }
      // No pending scan — extract from current active file
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Open a file first to save to vault.');
        return;
      }
      const content = editor.document.getText();
      const filePath = editor.document.uri.fsPath;
      const result = vaultService.extractFromFile(filePath, content);
      if (result.items.length === 0) {
        vscode.window.showInformationMessage('No extractable blocks found in this file.');
        return;
      }
      let savedCount = 0;
      let dupCount = 0;
      for (const item of result.items) {
        if (!vaultService.isDuplicate(item.contentHash)) {
          vaultService.saveItem(item);
          savedCount++;
        } else {
          dupCount++;
        }
      }
      await ensureChatPanelOpen();
      showVaultScanResults(result.items, 1, result.filteredCount, savedCount, dupCount);
    })
  );

  // Scan Codebase to Vault — batch save with duplicate detection
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.scanVaultCodebase', async () => {
      // Show folder picker — user can scan any project, not just the current workspace
      const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri ||
        vscode.Uri.file(require('os').homedir() + '/projects');
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri,
        openLabel: 'Scan This Project',
        title: 'Select a project folder to scan into your Vault',
      });
      if (!picked || picked.length === 0) { return; }
      const root = picked[0].fsPath;
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'CHASSIS Vault: Scanning codebase...',
        cancellable: true,
      }, async (progress, token) => {
        const scanned = await vaultService.scanCodebase(root, undefined, undefined, (msg: string) => {
          if (!token.isCancellationRequested) progress.report({ message: msg });
        });
        if (token.isCancellationRequested) return null;
        return scanned;
      });
      if (!result || result.items.length === 0) {
        vscode.window.showInformationMessage('No extractable blocks found.');
        return;
      }
      // Store results for Save to Vault button — user confirms before saving
      _pendingScanItems = result.items;
      let savedCount = 0;
      let dupCount = 0;
      // Open chat panel and show results — user clicks Save to Vault to confirm
      await ensureChatPanelOpen();
      showVaultScanResults(result.items, result.fileCount, result.filteredCount, savedCount, dupCount);
    })
  );

  // Validate / Recategorize Vault — AI validates all items are in proper categories
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.validateVault', async () => {
      const allItems = vaultService.listItems();
      if (allItems.length === 0) {
        vscode.window.showInformationMessage('Vault is empty. Save some items first.');
        return;
      }
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'CHASSIS Vault: Validating categories with AI...',
        cancellable: true,
      }, async (progress, token) => {
        const BATCH = 20;
        let processed = 0;
        let updated = 0;
        for (let i = 0; i < allItems.length; i += BATCH) {
          if (token.isCancellationRequested) break;
          const batch = allItems.slice(i, i + BATCH);
          progress.report({ message: `Processing ${i + 1}-${Math.min(i + BATCH, allItems.length)} of ${allItems.length}` });
          
          const listStr = batch.map((item, idx) =>
            `${idx + 1}. name="${item.name}" category="${item.category}" file="${path.basename(item.sourceFile)}" preview="${item.code.slice(0, 120).replace(/\n/g, ' ')}"`
          ).join('\n');

          const prompt = `You are a code librarian. For each code block return TWO things:
1. category — exactly ONE of: ${VAULT_CATEGORIES.join(', ')}
2. subcategory — a short domain label (1-2 words, lowercase)

Current categories may be wrong. Re-evaluate based on actual code content.

Respond with ONLY a JSON array: [{"category":"...","subcategory":"..."},...]

Items:
${listStr}`;

          const response = await routing.prompt(prompt);
          if (!response.success || !response.text) continue;
          
          try {
            let raw = response.text.trim();
            raw = raw.replace(/^\s*```[a-zA-Z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            const arrayMatch = raw.match(/\[[\s\S]*\]/);
            if (arrayMatch) raw = arrayMatch[0];
            const results: { category: string; subcategory: string }[] = JSON.parse(raw);
            
            batch.forEach((item, idx) => {
              const r = results[idx];
              if (!r) return;
              const oldCat = item.category || 'other';
              if (r.category && r.category !== oldCat) {
                item.category = r.category;
                if (r.subcategory) item.tags = [r.category, r.subcategory];
                else item.tags = [r.category];
                vaultService.saveItem(item);
                updated++;
              }
              processed++;
            });
          } catch (e) {
            console.warn('[CHASSIS] Batch validation failed:', e);
          }
        }
        
        await ensureChatPanelOpen();
        const content = `
          <div style="font-size:13px;">
            <div style="display:flex;gap:12px;margin-bottom:16px;">
              <div style="flex:1;text-align:center;padding:12px;background:var(--vscode-input-background);border-radius:6px;">
                <div style="font-size:24px;font-weight:bold;">${allItems.length}</div>
                <div style="font-size:11px;opacity:0.7;">Total Items</div>
              </div>
              <div style="flex:1;text-align:center;padding:12px;background:var(--vscode-input-background);border-radius:6px;">
                <div style="font-size:24px;font-weight:bold;color:#4ec959;">${processed}</div>
                <div style="font-size:11px;opacity:0.7;">Processed</div>
              </div>
              <div style="flex:1;text-align:center;padding:12px;background:var(--vscode-input-background);border-radius:6px;">
                <div style="font-size:24px;font-weight:bold;color:#3b82f6;">${updated}</div>
                <div style="font-size:11px;opacity:0.7;">Re-categorized</div>
              </div>
            </div>
            <div style="padding:12px;background:rgba(78,201,89,0.1);border-radius:6px;font-size:12px;">
              ✅ Vault validation complete. ${updated} items moved to their proper categories.
            </div>
          </div>
        `;
        ChatPanel.currentPanel?.showPanel('vault-validate', '✅ Vault Validation', content);
      });
    })
  );

  // Vault Cleanup — remove items whose sourceFile came from pip/env paths (site-packages, lib/python, etc.)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.vaultCleanupSystemPaths', async () => {
      const SYSTEM_PATH_SIGNALS = [
        'site-packages', 'dist-packages', '__pycache__', '.venv', '/venv/',
        'lib/python', 'lib64/python', '.tox', '.eggs', 'sdist', 'wheels',
        '.mypy_cache', '.pytest_cache',
      ];
      const allItems = vaultService.listItems();
      const toRemove = allItems.filter(item => {
        const src = (item as any).sourceFile || (item as any).filePath || '';
        return SYSTEM_PATH_SIGNALS.some(sig => src.includes(sig));
      });
      if (toRemove.length === 0) {
        vscode.window.showInformationMessage('CHASSIS Vault: No system/pip path items found. Vault is already clean.');
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `CHASSIS Vault: Found ${toRemove.length} item(s) sourced from Python pip/env paths. Remove them?`,
        { modal: true },
        'Remove All'
      );
      if (confirm !== 'Remove All') { return; }
      for (const item of toRemove) { vaultService.deleteItem(item.id); }
      vscode.window.showInformationMessage(`CHASSIS Vault: Removed ${toRemove.length} system path item(s).`);
    })
  );
}

async function ensureChatPanelOpen(): Promise<void> {
  if (!ChatPanel.currentPanel) {
    await vscode.commands.executeCommand('chassis.openChatPanel');
    // Wait for panel to initialize
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

function showVaultScanResults(items: VaultItem[], fileCount: number, filteredCount: number, savedCount?: number, dupCount?: number): void {
  const catIcons: Record<string, string> = {
    component: '🧩', utility: '🔧', algorithm: '⚙️', pattern: '🏗️',
    config: '⚙️', api: '🌐', database: '🗄️', auth: '🔐',
    validation: '✅', error: '🚨', testing: '🧪', other: '📦',
  };

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
      <button data-cmd="chassis.openVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">
        💾 Open Vault
      </button>
      <button data-cmd="chassis.saveToVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">
        💾 Save to Vault
      </button>
      <button data-cmd="chassis.scanVaultCodebase" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;">
        📁 Scan to Vault
      </button>
      <button data-cmd="chassis.buildFromVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-secondaryBackground, var(--vscode-button-background));color:var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;opacity:0.9;">
        🏗️ Build from Vault
      </button>
      <button data-cmd="chassis.queryVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-secondaryBackground, var(--vscode-button-background));color:var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;opacity:0.9;">
        🔍 Query Vault
      </button>
      <button data-cmd="chassis.validateVault" style="flex:1;min-width:120px;padding:10px 12px;background:var(--vscode-button-secondaryBackground, var(--vscode-button-background));color:var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));border:none;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;opacity:0.9;">
        ✅ Validate
      </button>
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
        ${(savedCount !== undefined) ? `<div style="flex:1;text-align:center;padding:12px;background:var(--vscode-input-background);border-radius:6px;">
          <div style="font-size:24px;font-weight:bold;color:#3b82f6;">${savedCount}</div>
          <div style="font-size:11px;opacity:0.7;">Saved</div>
        </div>` : ''}
        ${(dupCount !== undefined && dupCount > 0) ? `<div style="flex:1;text-align:center;padding:12px;background:var(--vscode-input-background);border-radius:6px;">
          <div style="font-size:24px;font-weight:bold;color:#ff534f;">${dupCount}</div>
          <div style="font-size:11px;opacity:0.7;">Duplicates</div>
        </div>` : ''}
      </div>
      ${actionsHtml}
      <div style="max-height:300px;overflow-y:auto;">
        ${itemsHtml}
      </div>
      <div style="margin-top:12px;padding:10px;background:rgba(78,201,89,0.1);border-radius:6px;font-size:12px;">
        ✅ Click <strong>💾 Open Vault</strong> above to browse all saved items.
      </div>
    </div>
  `;

  ChatPanel.currentPanel?.showPanel('vault-scan', '🔍 Vault Scan Results', content);
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}