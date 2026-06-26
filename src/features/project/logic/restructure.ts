// [SCOPE] Redivivus Restructure command — AI adds Redivivus annotations to current file

import * as vscode from 'vscode';
import * as path from 'path';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { RoutingService } from '../../../features/ai/data/routingService.js';
import type { MeasureTwiceService } from '../../build/services/measureTwiceService.js';
import type { ChangeTracker } from '../../build/services/changeTracker.js';

export function registerRestructureCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  routingService: RoutingService,
  measureTwice: MeasureTwiceService,
  changeTracker: ChangeTracker,
  refreshAll: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.cleanUpFile', async (arg?: string | vscode.Uri) => {
      let doc: vscode.TextDocument;
      let filePath: string;
      if (arg) {
        let uri: vscode.Uri;
        if (typeof arg === 'string') {
          filePath = arg;
          const ws = vscode.workspace.workspaceFolders?.[0];
          if (!ws) { vscode.window.showErrorMessage('Open a workspace folder first.'); return; }
          uri = vscode.Uri.file(path.join(ws.uri.fsPath, arg));
        } else {
          uri = arg;
          filePath = vscode.workspace.asRelativePath(uri) || path.basename(uri.fsPath);
        }
        doc = await vscode.workspace.openTextDocument(uri);
      } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('Open a file first.');
          return;
        }
        doc = editor.document;
        filePath = vscode.workspace.asRelativePath(doc.uri);
      }

      // [WARN] Relies on external configuration or environment variable for critical API access.
      const hasKey = !!(vscode.workspace.getConfiguration('redivivus').get<string>('geminiApiKey') || process.env.GEMINI_API_KEY);
      if (!hasKey) {
        vscode.window.showInformationMessage(
          'Clean Up File requires a Gemini API key. Set it in Redivivus settings or the GEMINI_API_KEY env variable.',
          'Open Settings'
        );
        return;
      }

      const lineCount = doc.getText().split('\n').length;
      let msg = 'Redivivus will read through ' + filePath + ' and add notes about what each section does, flag anything risky, and mark work that still needs doing.';
      if (lineCount > 500) {
        msg += '\n\n⚠️ This file is ' + lineCount + ' lines — AI processing may take a while.';
      }
      const confirm = await vscode.window.showInformationMessage(
        msg,
        { modal: true },
        'Restructure', 'Cancel'
      );
      if (confirm !== 'Restructure') { return; }

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Redivivus: Restructuring ' + filePath,
        cancellable: true,
      }, async (progress, token) => {
        progress.report({ message: 'Sending to AI...' });
        const content = doc.getText();
        const lineCount = content.split('\n').length;
        progress.report({ message: 'Sending ' + lineCount + ' lines to Gemini...' });
        // [WARN] This is the core AI API call. Its success is critical for the command to function, and its output directly modifies user code.
        const result = await routingService.analyzeFile(
          filePath, content,
          'Add Redivivus annotations to this file. Add [SCOPE] at top, convert TODOs, flag warnings.',
          token
        );
        progress.report({ message: 'Processing response...' });

        if (!result.success) {
          vscode.window.showErrorMessage('Redivivus routing error: ' + result.error);
          return;
        }

        // show diff in a new tab
        const original = doc.uri;
        const modified = vscode.Uri.parse('untitled:' + filePath + '.redivivus-restructured');
        const newDoc = await vscode.workspace.openTextDocument({ content: result.text, language: doc.languageId });
        await vscode.window.showTextDocument(newDoc, { preview: false });

        // ── Measure Twice, Cut Once ──
        // [WARN] Critical safety mechanism to prevent unintended modifications. If this validation fails or is bypassed, user code could be corrupted.
        const validation = measureTwice.validate(content, result.text, filePath);
        const validReport = measureTwice.formatReport(validation, filePath);

        let applyMsg = '';
        if (validation.passed) {
          applyMsg = '✅ Measure Twice PASSED. Apply changes to the original?';
        } else {
          applyMsg = '❌ Measure Twice FAILED — issues found. Apply anyway?';
        }
        if (validation.warnings.length > 0) {
          applyMsg += '\n\n⚠️ ' + validation.warnings.length + ' warning(s)';
        }

        const apply = await vscode.window.showInformationMessage(
          applyMsg,
          { modal: true, detail: validation.issues.concat(validation.warnings).join('\n') || 'No issues found.' },
          'Apply', 'View Report', 'Discard'
        );

        if (apply === 'View Report') {
          const reportDoc = await vscode.workspace.openTextDocument({ content: validReport, language: 'markdown' });
          await vscode.window.showTextDocument(reportDoc, { preview: false });
          return;
        }

        if (apply === 'Apply') {
          const edit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(content.length));
          edit.replace(doc.uri, fullRange, result.text);
          // [WARN] Directly applies the AI-generated changes to the user's active document. This is a high-impact operation that can alter source code.
          await vscode.workspace.applyEdit(edit);
          await doc.save();

          const changeSummary = changeTracker.summarize(filePath, content, result.text, result.model, 'Restructure File');
          changeTracker.log(changeSummary);
          vscode.window.showInformationMessage('Redivivus: ' + changeTracker.formatNotification(changeSummary));
          refreshAll();
          const nextAction = await vscode.window.showInformationMessage(
          filePath + ' has been cleaned up and saved.\n\n' +
          'The AI added notes throughout your code explaining what each part does, ' +
          'flagged anything that looks risky, and marked remaining work.\n\n' +
          'What next?',
          { modal: true },
          'Check the File', 'AI Review', 'Done'
        );
        if (nextAction === 'Check the File') {
          await vscode.commands.executeCommand('redivivus.analyzeFile');
        } else if (nextAction === 'AI Review') {
          await vscode.commands.executeCommand('redivivus.reviewFile');
        }
        }
      });
    })
  );
}