// [SCOPE] Retrofit Service — orchestrates the full project annotation pipeline
// Delegates file discovery to retrofitFileScanner, large-file chunking to retrofitChunker
// [NEXT] Further split: extract runRetrofit into retrofitRunner.ts if it grows past 200 lines

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ChassisService } from '../../services/chassisService';
import type { ChangeTracker } from '../../services/build/changeTracker';
import type { MeasureTwiceService } from '../../services/build/measureTwiceService';
import type { RoutingService } from '../../services/ai/routingService';
import type { AnalyzerService } from '../../ui/panels/analyzer/analyzerService';
import { getCodeFiles, backupFiles, restoreFiles, deleteDir } from './retrofitFileScanner';
import { ChatPanel } from '../../ui/panels/chat/chatPanel';
import { processInChunks } from './retrofitChunker';
import { handleAllAnnotated, showRetrofitSummary, buildReport } from './retrofitHelpers';

export class RetrofitService {
  constructor(
    private chassis: ChassisService,
    private routing: RoutingService,
    private measureTwice: MeasureTwiceService,
    private changeTracker: ChangeTracker,
    private analyzer?: AnalyzerService
  ) {}

  async runRetrofit(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { vscode.window.showErrorMessage('No project folder is open. Open a project first, then try again.'); return; }

    const mapPath = path.join(this.chassis.chassisDir, 'project_map.md');
    if (!fs.existsSync(mapPath)) {
      const run = await vscode.window.showInformationMessage(
        'No project analysis found. Run Analyze first?',
        { modal: true }, 'Analyze Now', 'Cancel'
      );
      if (run === 'Analyze Now') { await vscode.commands.executeCommand('chassis.analyze'); }
      return;
    }

    const recsPath = path.join(this.chassis.chassisDir, 'recommendations.md');
    const filesToProcess = getCodeFiles(root);
    const projectName = path.basename(root);

    const pendingFiles: string[] = [];
    const doneFiles: string[] = [];
    for (const f of filesToProcess) {
      try {
        const fc = fs.readFileSync(f, 'utf-8');
        if (fc.includes('[SCOPE]')) { doneFiles.push(f); } else { pendingFiles.push(f); }
      } catch { pendingFiles.push(f); }
    }

    if (pendingFiles.length === 0) {
      await handleAllAnnotated(doneFiles);
      return;
    }

    const proceed = await showRetrofitSummary(projectName, pendingFiles, doneFiles);
    filesToProcess.length = 0;
    filesToProcess.push(...pendingFiles);

    if (proceed === 'View Recommendations') {
      const cached = this.analyzer?.getLastResult();
      if (cached) { this.analyzer!.showRecommendationsPanel(cached); }
      else if (fs.existsSync(recsPath)) {
        const recsRaw = fs.readFileSync(recsPath, 'utf-8');
        const recsEscaped = recsRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const recsHtml = `<div style="padding:12px 0;"><h2 style="margin:0 0 10px;font-size:15px;">📋 Recommendations</h2><pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;background:var(--vscode-editor-background);padding:12px;border-radius:6px;border:1px solid var(--vscode-input-border);overflow-y:auto;max-height:480px;">${recsEscaped}</pre></div>`;
        if (!ChatPanel.currentPanel) {
          vscode.commands.executeCommand('chassis.openChatPanel');
          setTimeout(() => ChatPanel.currentPanel?.showPanel('recommendations', '📋 Recommendations', recsHtml), 300);
        } else {
          ChatPanel.currentPanel.showPanel('recommendations', '📋 Recommendations', recsHtml);
        }
      }
      return;
    }
    if (proceed !== 'Start Retrofit') { return; }

    const backupDir = path.join(this.chassis.chassisDir, 'backup');
    if (fs.existsSync(backupDir)) {
      const overwrite = await vscode.window.showWarningMessage(
        'A backup already exists. Overwrite it?', { modal: true }, 'Overwrite', 'Cancel'
      );
      if (overwrite !== 'Overwrite') { return; }
      deleteDir(backupDir);
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'CHASSIS Retrofit',
      cancellable: true,
    }, async (progress, token) => {
      progress.report({ message: 'Backing up original files...' });
      backupFiles(root, backupDir, filesToProcess);

      let completed = 0;
      let failed = 0;
      const total = filesToProcess.length;
      const results: { file: string; status: string }[] = [];

      for (const filePath of filesToProcess) {
        if (token.isCancellationRequested) { results.push({ file: filePath, status: 'CANCELLED' }); break; }

        const relPath = path.relative(root, filePath);
        completed++;
        progress.report({ message: '(' + completed + '/' + total + ') ' + relPath, increment: (1 / total) * 100 });

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (content.split('\n').length < 5) { results.push({ file: relPath, status: 'SKIPPED (too small)' }); continue; }
          if (content.includes('[SCOPE]')) { results.push({ file: relPath, status: 'SKIPPED (already annotated)' }); continue; }

          let result;
          if (content.split('\n').length > 500) {
            progress.report({ message: '(' + completed + '/' + total + ') ' + relPath + ' — large file, chunking...' });
            result = await processInChunks(relPath, content, this.routing, token);
          } else {
            result = await this.routing.analyzeFile(
              relPath, content,
              'Add CHASSIS annotations to this file. Add a [SCOPE] comment at the very top explaining what this file does. Convert any TODO/FIXME/HACK to [TODO]/[WARN]/[DEAD]. Add [WARN] to fragile code. Keep ALL existing code exactly as-is.',
              token
            );
          }

          if (!result.success) { results.push({ file: relPath, status: 'FAILED: ' + result.error }); failed++; continue; }

          const validation = this.measureTwice.validate(content, result.text, relPath);
          if (!validation.passed) { results.push({ file: relPath, status: 'BLOCKED: ' + validation.issues.join('; ') }); failed++; continue; }
          if (validation.warnings.length > 0) { results.push({ file: relPath, status: 'OK (warnings: ' + validation.warnings.join('; ') + ')' }); }

          fs.writeFileSync(filePath, result.text);
          const changeSummary = this.changeTracker.summarize(relPath, content, result.text, result.model, 'Retrofit');
          this.changeTracker.log(changeSummary);
          results.push({ file: relPath, status: 'OK' });
        } catch (err: any) {
          results.push({ file: relPath, status: 'ERROR: ' + err.message });
          failed++;
        }
      }

      progress.report({ message: 'Generating report...' });
      const reportPath = path.join(this.chassis.chassisDir, 'retrofit_report.md');
      fs.writeFileSync(reportPath, buildReport(results, total, failed));
      this.chassis.appendWorkLog('- Action: Project Retrofit\n- Files processed: ' + total + '\n- Successful: ' + (total - failed) + '\n- Failed: ' + failed + '\n- Backup: .chassis/backup/');
      const reportContent = fs.readFileSync(reportPath, 'utf-8');
      const escaped = reportContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<div style="padding:12px 0;"><h2 style="margin:0 0 10px;font-size:15px;">🔧 Retrofit Report</h2><pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;background:var(--vscode-editor-background);padding:12px;border-radius:6px;border:1px solid var(--vscode-input-border);overflow-y:auto;max-height:480px;">${escaped}</pre></div>`;
      if (!ChatPanel.currentPanel) {
        vscode.commands.executeCommand('chassis.openChatPanel');
        setTimeout(() => ChatPanel.currentPanel?.showPanel('retrofit-report', '🔧 Retrofit Report', html), 300);
      } else {
        ChatPanel.currentPanel.showPanel('retrofit-report', '🔧 Retrofit Report', html);
      }
    });
  }

  async confirmRetrofit(): Promise<void> {
    const backupDir = path.join(this.chassis.chassisDir, 'backup');
    if (!fs.existsSync(backupDir)) { vscode.window.showInformationMessage('No backup to confirm — nothing to do.'); return; }
    const confirm = await vscode.window.showWarningMessage(
      'Delete the backup and keep the restructured files?',
      { modal: true, detail: 'Make sure you\'ve tested everything first. This cannot be undone.' },
      'Confirm — Delete Backup', 'Cancel'
    );
    if (confirm === 'Confirm — Delete Backup') {
      deleteDir(backupDir);
      this.chassis.appendWorkLog('- Action: Retrofit Confirmed\n- Backup deleted');
      vscode.window.showInformationMessage('\u2705 Retrofit confirmed. Backup deleted. Project is now under CHASSIS structure.');
    }
  }

  async revertRetrofit(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { return; }
    const backupDir = path.join(this.chassis.chassisDir, 'backup');
    if (!fs.existsSync(backupDir)) { vscode.window.showInformationMessage('No backup found to revert from.'); return; }
    const confirm = await vscode.window.showWarningMessage(
      'Revert all files to their pre-retrofit state?',
      { modal: true, detail: 'This will overwrite the current restructured files with the originals from backup.' },
      'Revert', 'Cancel'
    );
    if (confirm === 'Revert') {
      restoreFiles(root, backupDir);
      deleteDir(backupDir);
      this.chassis.appendWorkLog('- Action: Retrofit Reverted\n- Original files restored from backup');
      vscode.window.showInformationMessage('\u2705 Reverted to original files. Backup cleaned up.');
    }
  }

}
