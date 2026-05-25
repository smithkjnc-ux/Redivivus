// [SCOPE] Redivivus Vault commands — AI validate/recategorize vault items

import * as vscode from 'vscode';
import * as path from 'path';
import type { VaultService} from '../services/vault/vaultService.js';
import { VAULT_CATEGORIES } from '../services/vault/vaultService.js';
import type { RoutingService } from '../services/ai/routingService.js';
import { ChatPanel } from '../ui/panels/chat/chatPanel';
import { ensureChatPanelOpen } from './vault.js';

export function registerVaultValidate(
  context: vscode.ExtensionContext,
  vaultService: VaultService,
  routing: RoutingService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.validateVault', async () => {
      const allItems = vaultService.listItems();
      if (allItems.length === 0) { vscode.window.showInformationMessage('Vault is empty. Save some items first.'); return; }
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, title: 'Redivivus Vault: Validating categories with AI...', cancellable: true,
      }, async (progress, token) => {
        const BATCH = 20;
        let processed = 0;
        let updated = 0;
        for (let i = 0; i < allItems.length; i += BATCH) {
          if (token.isCancellationRequested) {break;}
          const batch = allItems.slice(i, i + BATCH);
          progress.report({ message: `Processing ${i + 1}-${Math.min(i + BATCH, allItems.length)} of ${allItems.length}` });

          const listStr = batch.map((item, idx) =>
            `${idx + 1}. name="${item.name}" category="${item.category}" file="${path.basename(item.sourceFile)}" preview="${item.code.slice(0, 120).replace(/\n/g, ' ')}"`
          ).join('\n');

          const prompt = `You are a code librarian. For each code block return TWO things:\n1. category — exactly ONE of: ${VAULT_CATEGORIES.join(', ')}\n2. subcategory — a short domain label (1-2 words, lowercase)\n\nCurrent categories may be wrong. Re-evaluate based on actual code content.\n\nRespond with ONLY a JSON array: [{"category":"...","subcategory":"..."},...]\n\nItems:\n${listStr}`;

          const response = await routing.prompt(prompt);
          if (!response.success || !response.text) {continue;}

          try {
            let raw = response.text.trim();
            raw = raw.replace(/^\s*```[a-zA-Z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            const arrayMatch = raw.match(/\[[\s\S]*\]/);
            if (arrayMatch) {raw = arrayMatch[0];}
            const results: { category: string; subcategory: string }[] = JSON.parse(raw);

            batch.forEach((item, idx) => {
              const r = results[idx];
              if (!r) {return;}
              const oldCat = item.category || 'other';
              if (r.category && r.category !== oldCat) {
                item.category = r.category;
                item.tags = r.subcategory ? [r.category, r.subcategory] : [r.category];
                vaultService.saveItem(item);
                updated++;
              }
              processed++;
            });
          } catch (e) { console.warn('[Redivivus] Batch validation failed:', e); }
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
}
