// [SCOPE] Redivivus Analysis commands — full codebase scan + file-level annotation health check

import * as vscode from 'vscode';
import * as path from 'path';
import type { RedivivusService } from '../services/redivivusService.js';
import type { AnalyzerService } from '../ui/panels/analyzer/analyzerService';

export function registerAnalysisCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  analyzerService: AnalyzerService,
  refreshAll: () => void
): void {
  // Analyze Project
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.analyze', async () => {
      if (!redivivus.isInitialized()) {
        vscode.window.showErrorMessage('Run "Redivivus: Initialize Project" first.');
        return;
      }
      try {
        await analyzerService.analyzeProject();
      } catch (err) {
        // [WARN] analyzeProject can throw after writing results (e.g. panel reveal conflict).
        // The scan data was already written and the Recommendations panel was shown.
        // Log but don't propagate — the action should not show ❌ Failed.
        console.error('[Redivivus] analyzeProject post-scan error (non-fatal):', err);
      }
      try { refreshAll(); } catch { /* non-fatal */ }
    })
  );

  // Verify Fix — checks if a file is actually fixed before marking done
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.verifyFix', async (filePath: string, issueType: string) => {
      if (!filePath || !issueType) {
        return { fixed: false, reason: 'Missing file path or issue type' };
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        return { fixed: false, reason: 'No workspace open' };
      }
      const uri = vscode.Uri.file(path.join(root, filePath));
      const doc = await vscode.workspace.openTextDocument(uri);
      const content = doc.getText();
      const lines = content.split('\n');

      let fixed = false;
      let reason = '';
      let retryPrompt = '';

      if (issueType === 'largeFile') {
        fixed = lines.length <= 200;
        if (!fixed) {
          reason = `File is still ${lines.length} lines (must be under 200)`;
          retryPrompt = `Split ${filePath} (${lines.length} lines) into smaller files.\nEach new file should handle one responsibility and be under 200 lines.\nKeep all existing behavior — just reorganize the code.\nAdd a // [SCOPE] comment at the top of each new file explaining what it does.\nReference .redivivus/rules.md for annotation standards.\nAfter splitting, make sure the project still compiles with: npm run compile`;
        }
      } else if (issueType === 'todo') {
        const hasTodo = lines.some(l => l.includes('[TODO]') || l.includes('TODO:') || l.includes('FIXME') || l.includes('HACK'));
        fixed = !hasTodo;
        if (!fixed) {
          reason = 'File still contains TODO/FIXME markers';
          const todoLines = lines.filter((l, i) => l.includes('[TODO]') || l.includes('TODO:') || l.includes('FIXME') || l.includes('HACK')).map((l, i) => `L${i + 1}: ${l.trim()}`).slice(0, 3).join('\n');
          retryPrompt = `Look at ${filePath}\nThere are still TODO/FIXME markers that need to be addressed:\n${todoLines}\n\nImplement these following the project rules in .redivivus/rules.md.\nAfter making changes, verify the project still compiles.`;
        }
      } else if (issueType === 'uncommented') {
        const hasScope = lines.some(l => l.includes('[SCOPE]'));
        fixed = hasScope;
        if (!fixed) {
          reason = 'File still has no [SCOPE] comment at the top';
          retryPrompt = `Add a // [SCOPE] comment at the very top of ${filePath} explaining what this file does, what it connects to, and why it exists.\nAlso add // [WARN] to any fragile or unclear sections.\nReference .redivivus/rules.md for the annotation format.\nDo not change any existing code — comments only.`;
        }
      }

      return { fixed, reason, retryPrompt };
    })
  );

  // Analyze Current File — counts Redivivus tags, shows health
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.checkFileHealth', async (pickedPath?: string) => {
      let doc: vscode.TextDocument;
      let filePath: string;
      let content: string;
      if (pickedPath) {
        // [WARN] Accessing `workspaceFolders[0]` directly without checking for existence can lead to runtime errors if no folder is open.
        filePath = pickedPath;
        const uri = vscode.Uri.file(path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, pickedPath));
        doc = await vscode.workspace.openTextDocument(uri);
        content = doc.getText();
      } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('Open a file first.');
          return;
        }
        doc = editor.document;
        filePath = vscode.workspace.asRelativePath(doc.uri);
        content = doc.getText();
      }
      const lines = content.split('\n');
      const tagDefs: Record<string, {emoji: string, label: string}> = {
        'SCOPE': { emoji: '\u{1F32F}', label: 'Purpose defined' },
        '// [TODO] ': { emoji: '\u{1F4CB}', label: 'Work to do' },
        'WARN': { emoji: '\u26A0\uFE0F', label: 'Watch out' },
        'NEXT': { emoji: '\u27A1', label: 'Planned next' },
        'DEAD': { emoji: '\u{1FAA6}', label: 'Dead end' },
        'DONE': { emoji: '\u2705', label: 'Finished' },
      };
      const counts: Record<string, number> = {};
      for (const k of Object.keys(tagDefs)) {counts[k] = 0;}
      lines.forEach((l: string) => {
        for (const k of Object.keys(tagDefs)) {
          if (l.includes('[' + k + ']')) {counts[k]++;}
        }
      });
      const totalTags = Object.values(counts).reduce((a, b) => a + b, 0);
      let health = '';
      if (totalTags === 0) {health = '\u{1F525} Not annotated yet \u2014 try Clean Up File first';}
      else if (counts['SCOPE'] > 0 && counts['// [TODO] '] === 0 && counts['WARN'] === 0) {health = '\u{1F4AA} Looking good! No warnings or open tasks';}
      else if (counts['WARN'] > 0) {health = '\u26A0\uFE0F Has warnings that need attention';}
      else {health = '\u{1F527} In progress \u2014 work remaining';}
      let msg = filePath + ' \u2014 ' + lines.length + ' lines\n\n' + health + '\n\n';
      for (const [key, info] of Object.entries(tagDefs)) {
        if (counts[key] > 0) {
          msg += info.emoji + ' ' + info.label + ': ' + counts[key] + '\n';
        }
      }
      if (lines.length > 500) {msg += '\n\u{1F4CF} This file is pretty long. Consider splitting it up.';}
      const next = await vscode.window.showInformationMessage(
        'Health check complete for ' + filePath + '\n\nWhat would you like to do next?',
        { modal: true },
        'Clean Up File', 'Check Another File', 'Done'
      );
      if (next === 'Clean Up File') {
        await vscode.commands.executeCommand('redivivus.cleanUpFile');
      }
    })
  );
}