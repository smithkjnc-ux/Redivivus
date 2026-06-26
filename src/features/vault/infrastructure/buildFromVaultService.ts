// [SCOPE] Build From Vault Service orchestrator — thin facade over types and search modules
// Split from 228-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import * as path from 'path';
import type { VaultService, VaultItem } from './vaultService.js';
import type { RoutingService } from '../../../shared/ai/infrastructure/routingService.js';
import { BuildPlan } from './buildFromVaultTypes.js';
import type { VaultSearchResult } from './buildFromVaultSearch.js';
import { findRelevantByTask } from './buildFromVaultSearch.js';
import { BuildFromVaultModal } from '../ui/buildFromVaultModal.js';
import { handleBuildOutput } from './buildFromVaultOutput.js';

export class BuildFromVaultService {
  constructor(
    private vaultService: VaultService,
    private routingService: RoutingService,
  ) {}

  async run(prefill?: { task?: string; targetFile?: string }): Promise<void> {
    // ── Step 1-2: Get task description and target file via modal ──
    let input: { task: string; targetFile: string };
    try {
      input = await BuildFromVaultModal.show(prefill);
    } catch {
      return; // User cancelled
    }
    const task = input.task;
    const targetFile = input.targetFile;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Redivivus: Building from Vault...',
      cancellable: true,
    }, async (progress, token) => {

      // ── Step 3: Search vault for relevant items (delegated to search module)
      progress.report({ message: 'Searching vault for relevant code...' });
      const allItems = this.vaultService.listItems();
      if (allItems.length === 0) {
        vscode.window.showWarningMessage('Vault is empty — scan a codebase first to populate it.');
        return;
      }

      const searchResult: VaultSearchResult = findRelevantByTask(task, allItems);
      const relevant = searchResult.items;

      // ── Step 4: Ask AI to plan — what to use from vault, what gaps exist
      progress.report({ message: `Found ${relevant.length} vault candidates — asking AI to plan...` });

      const vaultSummary = relevant.slice(0, 12).map((item: VaultItem) => {
        return `- [${item.category}] ${item.name} (${item.language}) — ${path.basename(item.sourceFile)}`;
      }).join('\n');

      const planPrompt = `You are Redivivus, an AI code assembly assistant.

TASK: "${task}"
${targetFile ? `TARGET FILE: ${targetFile}` : 'TARGET: New file'}

AVAILABLE VAULT ITEMS (already written, tested code from this project):
${vaultSummary}

Analyze the task and respond with a JSON object:
{
  "useFromVault": ["item name 1", "item name 2"],
  "gaps": ["short description of code that must be written fresh"],
  "plan": "1-2 sentence plain English summary of how you'll build this"
}

Only include vault items that are genuinely useful for this task. Be honest about gaps.`;

      const planResponse = await this.routingService.prompt(planPrompt);
      if (!planResponse.success || token.isCancellationRequested) {
        vscode.window.showErrorMessage('Redivivus: Planning step failed — ' + (planResponse.error || 'cancelled'));
        return;
      }

      let plan: { useFromVault: string[]; gaps: string[]; plan: string };
      try {
        let raw = planResponse.text.trim()
          .replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim();
        const objMatch = raw.match(/\{[\s\S]*\}/);
        if (objMatch) { raw = objMatch[0]; }
        plan = JSON.parse(raw);
      } catch {
        vscode.window.showErrorMessage('Redivivus: Could not parse build plan. Try again.');
        return;
      }

      // ── Step 5: Show plan to user for approval
      const selectedItems = relevant.filter(i => plan.useFromVault.includes(i.name));
      const vaultLines = selectedItems.length > 0
        ? selectedItems.map(i => `  ✅ ${i.name} (${i.category})`).join('\n')
        : '  (none matched)';
      const gapLines = plan.gaps.length > 0
        ? plan.gaps.map(g => `  ✏️  ${g}`).join('\n')
        : '  (no gaps — fully covered by vault)';

      const detail = `Plan: ${plan.plan}\n\nFrom vault (${selectedItems.length}):\n${vaultLines}\n\nNeeds new code (${plan.gaps.length}):\n${gapLines}`;

      const confirm = await vscode.window.showInformationMessage(
        `Redivivus Build Plan — "${task}"`,
        { modal: true, detail },
        'Build It', 'Cancel'
      );
      if (confirm !== 'Build It' || token.isCancellationRequested) { return; }

      // ── Step 6: Assemble — AI writes final code using vault items + fills gaps
      progress.report({ message: 'Assembling code from vault + writing gaps...' });

      const vaultCode = selectedItems.map(item => {
        return `// === FROM VAULT [${item.category}]: ${item.name} ===\n${item.code}`;
      }).join('\n\n');

      const fileContext = targetFile
        ? `Write code for the file: ${targetFile}\n`
        : 'Write a new standalone module.\n';

      const assemblePrompt = `You are Redivivus. Assemble production-ready code for this task.

TASK: "${task}"
${fileContext}
VAULT CODE (already exists in this project — import or adapt, DO NOT rewrite):
${vaultCode || '(no vault items selected)'}

GAPS TO FILL WITH NEW CODE:
${plan.gaps.map(g => '- ' + g).join('\n') || '(none)'}

Rules:
- Use the vault code directly — reference it, import it, or include it as-is
- Only write NEW code for the listed gaps
- Add Redivivus [SCOPE] comment at the top explaining what this module does
- Add [TODO] markers where the user needs to wire things up (e.g. call this function, add to router)
- Keep it clean, typed, and consistent with the vault code style
- Return ONLY the code, no markdown fences, no explanation`;

      const assembleResponse = await this.routingService.prompt(assemblePrompt);
      if (!assembleResponse.success || token.isCancellationRequested) {
        vscode.window.showErrorMessage('Redivivus: Assembly failed — ' + (assembleResponse.error || 'cancelled'));
        return;
      }

      // ── Steps 7-8: Save output and show summary (see buildFromVaultOutput.ts) ──
      await handleBuildOutput({ task, targetFile, code: assembleResponse.text, selectedItems, gaps: plan.gaps });
    });
  }
}
