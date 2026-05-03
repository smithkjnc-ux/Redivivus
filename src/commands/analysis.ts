// [SCOPE] CHASSIS Analysis commands — full codebase scan + file-level annotation health check

import * as vscode from 'vscode';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { AnalyzerService } from '../services/analyzerService.js';

export function registerAnalysisCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  analyzerService: AnalyzerService,
  refreshAll: () => void
): void {
  // Analyze Project
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.analyze', async () => {
      if (!chassis.isInitialized()) {
        vscode.window.showErrorMessage('Run "CHASSIS: Initialize Project" first.');
        return;
      }
      await analyzerService.analyzeProject();
      refreshAll();
    })
  );

  // Analyze Current File — counts CHASSIS tags, shows health
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.analyzeFile', async (pickedPath?: string) => {
      let doc: vscode.TextDocument;
      let filePath: string;
      let content: string;
      if (pickedPath) {
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
        'TODO': { emoji: '\u{1F4CB}', label: 'Work to do' },
        'WARN': { emoji: '\u26A0\uFE0F', label: 'Watch out' },
        'NEXT': { emoji: '\u27A1', label: 'Planned next' },
        'DEAD': { emoji: '\u{1FAA6}', label: 'Dead end' },
        'DONE': { emoji: '\u2705', label: 'Finished' },
      };
      const counts: Record<string, number> = {};
      for (const k of Object.keys(tagDefs)) counts[k] = 0;
      lines.forEach((l: string) => {
        for (const k of Object.keys(tagDefs)) {
          if (l.includes('[' + k + ']')) counts[k]++;
        }
      });
      const totalTags = Object.values(counts).reduce((a, b) => a + b, 0);
      let health = '';
      if (totalTags === 0) health = '\u{1F525} Not annotated yet \u2014 try Clean Up File first';
      else if (counts['SCOPE'] > 0 && counts['TODO'] === 0 && counts['WARN'] === 0) health = '\u{1F4AA} Looking good! No warnings or open tasks';
      else if (counts['WARN'] > 0) health = '\u26A0\uFE0F Has warnings that need attention';
      else health = '\u{1F527} In progress \u2014 work remaining';
      let msg = filePath + ' \u2014 ' + lines.length + ' lines\n\n' + health + '\n\n';
      for (const [key, info] of Object.entries(tagDefs)) {
        if (counts[key] > 0) {
          msg += info.emoji + ' ' + info.label + ': ' + counts[key] + '\n';
        }
      }
      if (lines.length > 500) msg += '\n\u{1F4CF} This file is pretty long. Consider splitting it up.';
      const action = await vscode.window.showInformationMessage(msg, { modal: true }, 'Clean Up File', 'AI Review', 'Close');
      if (action === 'Clean Up File') {
        await vscode.commands.executeCommand('chassis.restructureFile');
      } else if (action === 'AI Review') {
        await vscode.commands.executeCommand('chassis.reviewFile');
      }
    })
  );
}
