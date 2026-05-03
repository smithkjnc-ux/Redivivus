// [SCOPE] CHASSIS Review command — AI gives feedback on current file without modifying it

import * as vscode from 'vscode';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/routingService.js';
import { ChangeTracker } from '../services/changeTracker.js';

export function registerReviewCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  routingService: RoutingService,
  changeTracker: ChangeTracker
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.reviewFile', async (pickedPath?: string) => {
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

      // stub AI review if no API key configured
      const hasKey = !!(vscode.workspace.getConfiguration('chassis').get<string>('geminiApiKey') || process.env.GEMINI_API_KEY);
      if (!hasKey) {
        vscode.window.showInformationMessage(
          'AI review requires a Gemini API key. Set it in CHASSIS settings or the GEMINI_API_KEY env variable.',
          'Open Settings'
        );
        return;
      }

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'CHASSIS: Reviewing ' + filePath,
        cancellable: true,
      }, async (progress, token) => {
        const lineCount = content.split('\n').length;
        progress.report({ message: 'Sending ' + lineCount + ' lines to Gemini...' });
        const result = await routingService.analyzeFile(
          filePath, content,
          'Review this file. Report: 1) What it does (one sentence), 2) Any bugs or risks, 3) Suggestions for improvement, 4) Whether it should be split. Format as markdown.',
          token
        );
        progress.report({ message: 'Processing response...' });

        if (!result.success) {
          vscode.window.showErrorMessage('CHASSIS routing error: ' + result.error);
          return;
        }

        // Save review to .chassis/reviews/
        const reviewsDir = chassis.chassisDir + '/reviews';
        if (!require('fs').existsSync(reviewsDir)) {
          require('fs').mkdirSync(reviewsDir, { recursive: true });
        }
        const safeFileName = require('path').basename(filePath).replace(/\./g, '_');
        const reviewPath = reviewsDir + '/' + safeFileName + '_review.md';
        const reviewContent = '# CHASSIS Review - ' + filePath + '\n\n*AI: ' + result.model + '*\n\n---\n\n' + result.text;
        require('fs').writeFileSync(reviewPath, reviewContent);
        const reviewDoc2 = await vscode.workspace.openTextDocument(reviewPath);
        await vscode.window.showTextDocument(reviewDoc2, vscode.ViewColumn.One);
        const next = await vscode.window.showInformationMessage(
          'Review complete for ' + filePath + '\n\n' +
          'The review is open on the left. It covers:\n' +
          '\u2022 What the file does\n' +
          '\u2022 Any bugs or risks found\n' +
          '\u2022 Suggestions for improvement\n' +
          '\u2022 Whether it should be split up\n\n' +
          'What would you like to do next?',
          { modal: true },
          'Clean Up File', 'Check Another File', 'Done'
        );
        if (next === 'Clean Up File') {
          await vscode.commands.executeCommand('chassis.restructureFile');
        } else if (next === 'Check Another File') {
          await vscode.commands.executeCommand('chassis.analyzeFile');
        }

        chassis.appendWorkLog(
          '- Action: AI Review\n' +
          '- File: ' + filePath + '\n' +
          '- AI: ' + result.model
        );
      });
    })
  );
}
