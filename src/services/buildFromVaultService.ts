// [SCOPE] Build From Vault Service — assembles features from vault items + fills gaps with AI

import * as vscode from 'vscode';
import * as path from 'path';
import { VaultService, VaultItem } from './vaultService.js';
import { RoutingService } from './routingService.js';

interface BuildPlan {
  task: string;
  vaultItems: VaultItem[];
  gaps: string[];
  assembledCode: string;
  targetFile?: string;
}

export class BuildFromVaultService {
  constructor(
    private vaultService: VaultService,
    private routingService: RoutingService,
  ) {}

  async run(): Promise<void> {
    // ── Step 1: Get task description ──
    const task = await vscode.window.showInputBox({
      prompt: 'Describe what you want to build',
      placeHolder: 'e.g. "add push notifications when a new listing is posted"',
      ignoreFocusOut: true,
    });
    if (!task?.trim()) { return; }

    // ── Step 2: Get optional target file ──
    const targetFile = await vscode.window.showInputBox({
      prompt: 'Target file to write into (optional — leave blank for new file)',
      placeHolder: 'e.g. src/features/listings/notificationService.ts',
      ignoreFocusOut: true,
    });

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'CHASSIS: Building from Vault...',
      cancellable: true,
    }, async (progress, token) => {

      // ── Step 3: Search vault for relevant items ──
      progress.report({ message: 'Searching vault for relevant code...' });
      const allItems = this.vaultService.listItems(true);
      if (allItems.length === 0) {
        vscode.window.showWarningMessage('Vault is empty — scan a codebase first to populate it.');
        return;
      }

      const relevant = this.findRelevantByTask(task, allItems);

      // ── Step 4: Ask AI to plan — what to use from vault, what gaps exist ──
      progress.report({ message: `Found ${relevant.length} vault candidates — asking AI to plan...` });

      const vaultSummary = relevant.slice(0, 12).map(item => {
        const sub = item.subcategory ? ` (${item.subcategory})` : '';
        return `- [${item.tags.join('/')}${sub}] ${item.block.name} (${item.block.type}) — ${path.basename(item.block.filePath)}`;
      }).join('\n');

      const planPrompt = `You are CHASSIS, an AI code assembly assistant.

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
        vscode.window.showErrorMessage('CHASSIS: Planning step failed — ' + (planResponse.error || 'cancelled'));
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
        vscode.window.showErrorMessage('CHASSIS: Could not parse build plan. Try again.');
        return;
      }

      // ── Step 5: Show plan to user for approval ──
      const selectedItems = relevant.filter(i => plan.useFromVault.includes(i.block.name));
      const vaultLines = selectedItems.length > 0
        ? selectedItems.map(i => `  ✅ ${i.block.name} (${i.tags.join('/')}${i.subcategory ? ' › ' + i.subcategory : ''})`).join('\n')
        : '  (none matched)';
      const gapLines = plan.gaps.length > 0
        ? plan.gaps.map(g => `  ✏️  ${g}`).join('\n')
        : '  (no gaps — fully covered by vault)';

      const detail = `Plan: ${plan.plan}\n\nFrom vault (${selectedItems.length}):\n${vaultLines}\n\nNeeds new code (${plan.gaps.length}):\n${gapLines}`;

      const confirm = await vscode.window.showInformationMessage(
        `CHASSIS Build Plan — "${task}"`,
        { modal: true, detail },
        'Build It', 'Cancel'
      );
      if (confirm !== 'Build It' || token.isCancellationRequested) { return; }

      // ── Step 6: Assemble — AI writes final code using vault items + fills gaps ──
      progress.report({ message: 'Assembling code from vault + writing gaps...' });

      const vaultCode = selectedItems.map(item => {
        const sub = item.subcategory ? ` › ${item.subcategory}` : '';
        return `// === FROM VAULT [${item.tags.join('/')}${sub}]: ${item.block.name} ===\n${item.block.code}`;
      }).join('\n\n');

      const fileContext = targetFile
        ? `Write code for the file: ${targetFile}\n`
        : 'Write a new standalone module.\n';

      const assemblePrompt = `You are CHASSIS. Assemble production-ready code for this task.

TASK: "${task}"
${fileContext}
VAULT CODE (already exists in this project — import or adapt, DO NOT rewrite):
${vaultCode || '(no vault items selected)'}

GAPS TO FILL WITH NEW CODE:
${plan.gaps.map(g => '- ' + g).join('\n') || '(none)'}

Rules:
- Use the vault code directly — reference it, import it, or include it as-is
- Only write NEW code for the listed gaps
- Add CHASSIS [SCOPE] comment at the top explaining what this module does
- Add [TODO] markers where the user needs to wire things up (e.g. call this function, add to router)
- Keep it clean, typed, and consistent with the vault code style
- Return ONLY the code, no markdown fences, no explanation`;

      const assembleResponse = await this.routingService.prompt(assemblePrompt);
      if (!assembleResponse.success || token.isCancellationRequested) {
        vscode.window.showErrorMessage('CHASSIS: Assembly failed — ' + (assembleResponse.error || 'cancelled'));
        return;
      }

      // ── Step 7: Show result in new editor tab ──
      const lang = targetFile
        ? (targetFile.endsWith('.ts') || targetFile.endsWith('.tsx') ? 'typescript'
          : targetFile.endsWith('.js') || targetFile.endsWith('.jsx') ? 'javascript'
          : targetFile.endsWith('.py') ? 'python' : 'typescript')
        : 'typescript';

      const doc = await vscode.workspace.openTextDocument({
        content: assembleResponse.text,
        language: lang,
      });
      await vscode.window.showTextDocument(doc, { preview: false });

      // ── Step 8: Offer to save ──
      const saveTarget = targetFile?.trim();
      if (saveTarget) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root) {
          const saveTo = await vscode.window.showInformationMessage(
            `Save to ${saveTarget}?`,
            { modal: true },
            'Save', 'Keep as Preview'
          );
          if (saveTo === 'Save') {
            const fullPath = path.join(root, saveTarget);
            const fs = await import('fs');
            const dirPath = path.dirname(fullPath);
            if (!fs.existsSync(dirPath)) { fs.mkdirSync(dirPath, { recursive: true }); }
            fs.writeFileSync(fullPath, assembleResponse.text);
            const savedDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
            await vscode.window.showTextDocument(savedDoc, { preview: false });
            vscode.window.showInformationMessage(`✅ CHASSIS: Saved to ${saveTarget} — ${selectedItems.length} vault items used, ${plan.gaps.length} gaps written.`);
          }
        }
      } else {
        vscode.window.showInformationMessage(
          `✅ CHASSIS Build complete — ${selectedItems.length} vault items used, ${plan.gaps.length} gaps written fresh.`
        );
      }
    });
  }

  // ── Task-aware vault search — keyword extraction from natural language ──
  private findRelevantByTask(task: string, items: VaultItem[]): VaultItem[] {
    const taskLower = task.toLowerCase();

    // Extract words from task (3+ chars, no stop words)
    const stopWords = new Set(['the','and','for','with','that','this','from','into','when','will','make','have','add','new','get','set','use','its','are','was','not','but','can','all','any','put','our','out','has','had','more','than','then','some','such','also','into','over','only','just','how','what','each','they','them','been','were','does','did','let','per','via']);
    const taskWords = taskLower
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w));

    return items
      .map(item => {
        let score = 0;
        const itemText = [
          item.block.name.toLowerCase(),
          item.block.filePath.toLowerCase(),
          item.tags.join(' '),
          item.subcategory || '',
          item.block.code.slice(0, 200).toLowerCase(),
        ].join(' ');

        for (const word of taskWords) {
          if (itemText.includes(word)) { score += 2; }
        }
        // boost exact name matches
        if (taskLower.includes(item.block.name.toLowerCase())) { score += 5; }
        return { item, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(s => s.item);
  }
}
