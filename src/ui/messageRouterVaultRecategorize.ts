// [SCOPE] Vault AI recategorization handler — re-categorizes "other" tagged items via AI
// Called by messageRouter orchestrator. This is a standalone complex operation.

import * as vscode from 'vscode';
import * as path from 'path';
import type { VaultService } from '../services/vault/vaultService.js';
import type { RoutingService } from '../services/ai/routingService.js';
import type { WizardPanelState } from './messageRouterTypes.js';

export async function handleVaultRecategorizeMessage(
  msg: any,
  vaultService: VaultService,
  routingService: RoutingService | undefined,
  state: WizardPanelState,
  refresh: () => void
): Promise<boolean> {
  if (msg.type !== 'vaultRecategorize') {return false;}

  if (!routingService) {
    vscode.window.showErrorMessage('No AI routing service available for re-categorization.');
    return true;
  }
  const allItems = vaultService.listItems();
  if (allItems.length === 0) {
    vscode.window.showInformationMessage('No saved vault items to re-categorize.');
    return true;
  }
  // Only recategorize items currently tagged 'other'
  const otherItems = allItems.filter((i: any) => i.tags.includes('other') || i.tags.length === 0);
  if (otherItems.length === 0) {
    vscode.window.showInformationMessage('All vault items already have proper categories.');
    return true;
  }
  // Check if any AI is available — if not, offer clipboard fallback for editor AI
  const aiCheck = routingService.getAvailableAI();
  if (aiCheck.ai === 'none') {
    const categories = ['component','utility','algorithm','pattern','config','api','database','auth','validation','error','testing','other'];
    const listStr = otherItems.map((item: any, idx: number) =>
      `${idx + 1}. name="${item.name}" language="${item.language}" file="${path.basename(item.sourceFile)}" preview="${item.code.slice(0, 80).replace(/\n/g, ' ')}"`
    ).join('\n');
    const clipboardPrompt = `Categorize each code block below into exactly ONE of: ${categories.join(', ')}\n\nRespond with ONLY a JSON array of strings, one per item. Example: ["utility","component","api"]\n\nItems:\n${listStr}`;
    await vscode.env.clipboard.writeText(clipboardPrompt);
    const action = await vscode.window.showWarningMessage(
      'No API key set. CHASSIS copied a categorization prompt to your clipboard — paste it into your AI chat (Windsurf/Cursor/Claude), then paste the JSON result back here.',
      'Open AI Chat', 'Dismiss'
    );
    if (action === 'Open AI Chat') {
      await vscode.commands.executeCommand('workbench.action.chat.open');
    }
    return true;
  }
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `CHASSIS Vault: AI categorizing ${otherItems.length} items tagged "other"...`,
    cancellable: false,
  }, async () => {
    try {
      // Snapshot original tags BEFORE aiCategorize — it mutates item objects in place (shallow copy)
      const originalTags = new Map<string, string[]>();
      for (const item of otherItems) {
        originalTags.set(item.id, [...item.tags]);
      }

      // [WARN] This involves external AI API calls and modifications to vault items.
      const recategorized = await vaultService.aiCategorize(otherItems, routingService!);
      let updated = 0;
      const stillOther: any[] = [];

      for (const item of recategorized) {
        const isStillOther = item.tags.length === 0 || item.tags.every((t: string) => t === 'other');
        if (isStillOther) {
          stillOther.push(item);
          continue;
        }
        const origSorted = [...(originalTags.get(item.id) ?? [])].sort().join(',');
        const newSorted  = [...item.tags].sort().join(',');
        if (origSorted !== newSorted) {
          vaultService.saveItem(item);
          updated++;
        }
      }

      // Report successfully categorized
      if (updated > 0) {
        vscode.window.showInformationMessage(`✓ Re-categorized ${updated} vault item${updated !== 1 ? 's' : ''}.`);
      }

      // Handle items AI couldn't place — offer to delete
      if (stillOther.length > 0) {
        const preview = stillOther.slice(0, 5).map((i: any) => `• ${i.name} (${i.language})`).join('\n');
        const moreNote = stillOther.length > 5 ? `\n  ...and ${stillOther.length - 5} more` : '';
        const action = await vscode.window.showWarningMessage(
          `AI could not categorize ${stillOther.length} item${stillOther.length !== 1 ? 's' : ''} — they remain tagged "other".\n\n${preview}${moreNote}\n\nDelete them? They cannot be used if uncategorized.`,
          { modal: true },
          'Delete All Uncategorized', 'Keep Them'
        );
        if (action === 'Delete All Uncategorized') {
          let deleted = 0;
          for (const i of stillOther) { vaultService.deleteItem(i.id); deleted++; }
          vscode.window.showInformationMessage(`🗑 Deleted ${deleted} uncategorized vault item${deleted !== 1 ? 's' : ''}.`);
        }
      }

      if (updated === 0 && stillOther.length === 0) {
        vscode.window.showInformationMessage('AI reviewed all items — categories are already correct.');
      }

      // Reset to category grid so user sees fresh counts, not stale item list
      state.vaultView = 'categories';
      state.vaultCategory = null;
      state.vaultSubcategory = null;
      state.vaultItems = [];
      state.activeTab = 'vault';
      refresh();
    } catch (e) {
      vscode.window.showErrorMessage('Re-categorization failed: ' + (e as Error).message);
    }
  });
  return true;
}
