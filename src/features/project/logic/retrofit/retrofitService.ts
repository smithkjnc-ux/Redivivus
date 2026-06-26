// [SCOPE] Retrofit Service — orchestrates the full project annotation pipeline
// Delegates file discovery to retrofitFileScanner, large-file chunking to retrofitChunker
// [NEXT] Further split: extract runRetrofit into retrofitRunner.ts if it grows past 200 lines

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { RedivivusService } from '../../../../features/vscode/logic/redivivusService.js';
import type { ChangeTracker } from '../../../build/services/changeTracker.js';
import type { MeasureTwiceService } from '../../../build/services/measureTwiceService.js';
import type { RoutingService } from '../../../../features/ai/data/routingService.js';
import type { AnalyzerService } from '../../../workspace/logic/analyzerService.js';
import { getCodeFiles, backupFiles, restoreFiles, deleteDir } from './retrofitFileScanner.js';

import { processInChunks } from './retrofitChunker.js';
import { handleAllAnnotated, showRetrofitSummary, buildReport } from './retrofitHelpers.js';

export class RetrofitService {
  constructor(
    private redivivus: RedivivusService,
    private routing: RoutingService,
    private measureTwice: MeasureTwiceService,
    private changeTracker: ChangeTracker,
    private analyzer?: AnalyzerService
  ) {}

  async runRetrofit(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { vscode.window.showErrorMessage('No project folder is open. Open a project first, then try again.'); return; }

    const mapPath = path.join(this.redivivus.redivivusDir, 'project_map.md');
    if (!fs.existsSync(mapPath)) {
      const run = await vscode.window.showInformationMessage(
        'No project analysis found. Run Analyze first?',
        { modal: true }, 'Analyze Now', 'Cancel'
      );
      if (run === 'Analyze Now') { await vscode.commands.executeCommand('redivivus.analyze'); }
      return;
    }

    const recsPath = path.join(this.redivivus.redivivusDir, 'recommendations.md');
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
        try {
          const _CPr = require('../../../chat/ui/chatPanel.js').ChatPanel;
          if (!_CPr?.currentPanel) { vscode.commands.executeCommand('redivivus.openChatPanel'); setTimeout(() => { try { require('../../../chat/ui/chatPanel.js').ChatPanel?.currentPanel?.showPanel('recommendations', 'Recommendations', recsHtml); } catch {} }, 300); }
          else { _CPr.currentPanel.showPanel('recommendations', 'Recommendations', recsHtml); }
        } catch { /* non-blocking */ }
      }
      return;
    }
    if (proceed !== 'Start Retrofit') { return; }

    const backupDir = path.join(this.redivivus.redivivusDir, 'backup');
    if (fs.existsSync(backupDir)) {
      const overwrite = await vscode.window.showWarningMessage(
        'A backup already exists. Overwrite it?', { modal: true }, 'Overwrite', 'Cancel'
      );
      if (overwrite !== 'Overwrite') { return; }
      deleteDir(backupDir);
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Redivivus Retrofit',
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
          // Skip only when BOTH the file-level [SCOPE] AND region chapters already exist. A file annotated
          // before the Region Map existed still needs a region pass, so [SCOPE]-only files re-process.
          if (content.includes('[SCOPE]') && content.includes('[REGION:')) { results.push({ file: relPath, status: 'SKIPPED (already annotated)' }); continue; }

          let result;
          if (content.split('\n').length > 500) {
            progress.report({ message: '(' + completed + '/' + total + ') ' + relPath + ' — large file, chunking...' });
            result = await processInChunks(relPath, content, this.routing, token);
          } else {
            result = await this.routing.analyzeFile(
              relPath, content,
              'Add Redivivus annotations to this file. Add a [SCOPE] comment at the very top explaining what this file does. Convert any TODO/FIXME/HACK to [TODO]/[WARN]/[DEAD]. Add [WARN] to fragile code. ALSO add a REGION MAP: wrap each distinct entity/concept (e.g. a game has FROG, VEHICLES, WATER, HUD, INPUT, GAME_LOOP, COLORS) in PAIRED markers in the correct comment syntax -- "// [REGION: NAME] one-line description" before the block and "// [/REGION: NAME]" after it (use <!-- --> in HTML, /* */ in CSS, # in Python). Granularity is entity/concept level, not per-function. Keep ALL existing code exactly as-is -- only ADD comment markers.',
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
      const reportPath = path.join(this.redivivus.redivivusDir, 'retrofit_report.md');
      fs.writeFileSync(reportPath, buildReport(results, total, failed));
      this.redivivus.appendWorkLog('- Action: Project Retrofit\n- Files processed: ' + total + '\n- Successful: ' + (total - failed) + '\n- Failed: ' + failed + '\n- Backup: .redivivus/backup/');
      const reportContent = fs.readFileSync(reportPath, 'utf-8');
      const escaped = reportContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<div style="padding:12px 0;"><h2 style="margin:0 0 10px;font-size:15px;">🔧 Retrofit Report</h2><pre style="white-space:pre-wrap;font-size:12px;line-height:1.6;background:var(--vscode-editor-background);padding:12px;border-radius:6px;border:1px solid var(--vscode-input-border);overflow-y:auto;max-height:480px;">${escaped}</pre></div>`;
      // [FIX] Dynamic require — retrofitService is in core/ and must not statically import ui/
      const _showRetrofitReport = () => {
        try {
          const _CP = require('../../../chat/ui/chatPanel.js').ChatPanel;
          if (_CP?.currentPanel) { _CP.currentPanel.showPanel('retrofit-report', 'Retrofit Report', html); }
        } catch { /* non-blocking */ }
      };
      try { const _CP2 = require('../../../chat/ui/chatPanel.js').ChatPanel; if (!_CP2?.currentPanel) { vscode.commands.executeCommand('redivivus.openChatPanel'); setTimeout(_showRetrofitReport, 300); } else { _showRetrofitReport(); } } catch { /* non-blocking */ }
    });
  }

  async confirmRetrofit(): Promise<void> {
    const backupDir = path.join(this.redivivus.redivivusDir, 'backup');
    if (!fs.existsSync(backupDir)) { vscode.window.showInformationMessage('No backup to confirm — nothing to do.'); return; }
    const confirm = await vscode.window.showWarningMessage(
      'Delete the backup and keep the restructured files?',
      { modal: true, detail: 'Make sure you\'ve tested everything first. This cannot be undone.' },
      'Confirm — Delete Backup', 'Cancel'
    );
    if (confirm === 'Confirm — Delete Backup') {
      deleteDir(backupDir);
      this.redivivus.appendWorkLog('- Action: Retrofit Confirmed\n- Backup deleted');
      vscode.window.showInformationMessage('\u2705 Retrofit confirmed. Backup deleted. Project is now under Redivivus structure.');
    }
  }

  async revertRetrofit(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { return; }
    const backupDir = path.join(this.redivivus.redivivusDir, 'backup');
    if (!fs.existsSync(backupDir)) { vscode.window.showInformationMessage('No backup found to revert from.'); return; }
    const confirm = await vscode.window.showWarningMessage(
      'Revert all files to their pre-retrofit state?',
      { modal: true, detail: 'This will overwrite the current restructured files with the originals from backup.' },
      'Revert', 'Cancel'
    );
    if (confirm === 'Revert') {
      restoreFiles(root, backupDir);
      deleteDir(backupDir);
      this.redivivus.appendWorkLog('- Action: Retrofit Reverted\n- Original files restored from backup');
      vscode.window.showInformationMessage('\u2705 Reverted to original files. Backup cleaned up.');
    }
  }

}
