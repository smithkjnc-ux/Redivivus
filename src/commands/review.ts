// [SCOPE] This file registers the 'chassis.reviewFile' command, which sends the content of the active VS Code file to an AI for review, displays the AI's feedback, and provides options for subsequent actions.

import * as vscode from 'vscode';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/ai/routingService.js';
import { ChangeTracker } from '../services/build/changeTracker.js';
import { ChatPanel } from '../ui/chat/chatPanel.js';

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
        // [WARN] Accessing workspaceFolders[0] without null/undefined check can throw if no folder is open.
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
        // [WARN] This is a critical external API call; prone to network issues, API errors, or rate limits.
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
        // [WARN] File system operations can fail due to permissions, disk space, or invalid paths.
        const reviewsDir = chassis.chassisDir + '/reviews';
        if (!require('fs').existsSync(reviewsDir)) {
          require('fs').mkdirSync(reviewsDir, { recursive: true });
        }
        // [WARN] Filename sanitization might not cover all edge cases for different OS file system rules.
        const safeFileName = require('path').basename(filePath).replace(/\./g, '_');
        const reviewPath = reviewsDir + '/' + safeFileName + '_review.md';
        const reviewContent = '# CHASSIS Review - ' + filePath + '\n\n*AI: ' + result.model + '*\n\n---\n\n' + result.text;
        // [WARN] File system operations can fail due to permissions, disk space, or invalid paths.
        require('fs').writeFileSync(reviewPath, reviewContent);
        // Show review inside chat panel
        const reviewRaw = require('fs').readFileSync(reviewPath, 'utf-8');
        const reviewEscaped = reviewRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const reviewHtml = `<div style="padding:12px 0;"><h2 style="margin:0 0 10px;font-size:15px;">🔍 AI Review — ${path.basename(filePath)}</h2><pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;background:var(--vscode-editor-background);padding:12px;border-radius:6px;border:1px solid var(--vscode-input-border);overflow-y:auto;max-height:480px;">${reviewEscaped}</pre></div>`;
        if (!ChatPanel.currentPanel) {
          vscode.commands.executeCommand('chassis.openChatPanel');
          setTimeout(() => ChatPanel.currentPanel?.showPanel('review', '🔍 AI Review', reviewHtml), 300);
        } else {
          ChatPanel.currentPanel.showPanel('review', '🔍 AI Review', reviewHtml);
        }
        const next = await vscode.window.showInformationMessage(
          'Review complete for ' + filePath + '\n\nWhat would you like to do next?',
          { modal: true },
          'Clean Up File', 'Check Another File', 'Done'
        );
        if (next === 'Clean Up File') {
          await vscode.commands.executeCommand('chassis.cleanUpFile');
        } else if (next === 'Check Another File') {
          await vscode.commands.executeCommand('chassis.analyzeFile');
        }

        // [WARN] File system operations for logging can fail due to permissions or disk space.
        chassis.appendWorkLog(
          '- Action: AI Review\n' +
          '- File: ' + filePath + '\n' +
          '- AI: ' + result.model
        );
      });
    })
  );
}