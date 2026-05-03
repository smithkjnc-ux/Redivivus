// [SCOPE] Retrofit Service — full project restructure pipeline

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChassisService } from './chassisService.js';
import { ChangeTracker } from './changeTracker.js';
import { MeasureTwiceService } from './measureTwiceService.js';
import { RoutingService } from './routingService.js';

export class RetrofitService {
  constructor(
    private chassis: ChassisService,
    private routing: RoutingService,
    private measureTwice: MeasureTwiceService,
    private changeTracker: ChangeTracker
  ) {}

  async runRetrofit(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }

    // Step 1: Check if analysis exists
    const mapPath = path.join(this.chassis.chassisDir, 'project_map.md');
    if (!fs.existsSync(mapPath)) {
      const run = await vscode.window.showInformationMessage(
        'No project analysis found. Run Analyze first?',
        { modal: true }, 'Analyze Now', 'Cancel'
      );
      if (run === 'Analyze Now') {
        await vscode.commands.executeCommand('chassis.analyze');
      }
      return;
    }

    // Step 2: Show summary and ask to proceed
    const recsPath = path.join(this.chassis.chassisDir, 'recommendations.md');
    const recs = fs.existsSync(recsPath) ? fs.readFileSync(recsPath, 'utf-8') : 'No recommendations file found.';

    // Count files to process
    const filesToProcess = this.getCodeFiles(root);

    const projectName = require('path').basename(root);

    // separate done vs pending files
    const pendingFiles: string[] = [];
    const doneFiles: string[] = [];
    for (const f of filesToProcess) {
      try {
        const fc = fs.readFileSync(f, 'utf-8');
        if (fc.includes('[SCOPE]') && (fc.includes('[TODO]') || fc.includes('[WARN]') || fc.includes('[NEXT]'))) {
          doneFiles.push(f);
        } else {
          pendingFiles.push(f);
        }
      } catch {
        pendingFiles.push(f);
      }
    }

    const doneList = doneFiles.map(f => '  ✅ ' + require('path').relative(root, f)).join('\n');
    const pendingList = pendingFiles.map(f => '  🔵 ' + require('path').relative(root, f)).join('\n');

    if (pendingFiles.length === 0) {
      await vscode.window.showInformationMessage(
        'All files are already annotated! Nothing to retrofit.',
        { modal: true }
      );
      return;
    }

    let fileDisplay = '';
    if (pendingFiles.length > 0) {
      fileDisplay += 'Pending (' + pendingFiles.length + '):\n' + pendingList + '\n\n';
    }
    if (doneFiles.length > 0) {
      fileDisplay += 'Already done (' + doneFiles.length + '):\n' + doneList + '\n\n';
    }

    const proceed = await vscode.window.showInformationMessage(
      'CHASSIS Retrofit — ' + projectName,
      {
        modal: true,
        detail: 'Project: ' + projectName + '\n\n' +
          fileDisplay +
          'What happens:\n' +
          '1. Your current project is backed up to .chassis/backup/\n' +
          '2. Pending files get CHASSIS annotations added by AI\n' +
          '3. Already-done files are skipped\n' +
          '4. You test, then confirm or revert\n\n' +
          'Estimated time: ~' + Math.ceil(pendingFiles.length * 0.5) + ' minutes (' + pendingFiles.length + ' files)'
      },
      'Start Retrofit', 'View Recommendations'
    );

    // Only process pending files
    filesToProcess.length = 0;
    filesToProcess.push(...pendingFiles);

    if (proceed === 'View Recommendations') {
      const doc = await vscode.workspace.openTextDocument(recsPath);
      await vscode.window.showTextDocument(doc);
      return;
    }
    if (proceed !== 'Start Retrofit') { return; }

    // Step 3: Backup
    const backupDir = path.join(this.chassis.chassisDir, 'backup');
    if (fs.existsSync(backupDir)) {
      const overwrite = await vscode.window.showWarningMessage(
        'A backup already exists. Overwrite it?',
        { modal: true }, 'Overwrite', 'Cancel'
      );
      if (overwrite !== 'Overwrite') { return; }
      this.deleteDir(backupDir);
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'CHASSIS Retrofit',
      cancellable: true,
    }, async (progress, token) => {

      // backup original files
      progress.report({ message: 'Backing up original files...' });
      this.backupFiles(root, backupDir, filesToProcess);

      // Step 4: Restructure each file
      let completed = 0;
      let failed = 0;
      const total = filesToProcess.length;
      const results: { file: string; status: string }[] = [];

      for (const filePath of filesToProcess) {
        if (token.isCancellationRequested) {
          results.push({ file: filePath, status: 'CANCELLED' });
          break;
        }

        const relPath = path.relative(root, filePath);
        completed++;
        progress.report({
          message: '(' + completed + '/' + total + ') ' + relPath,
          increment: (1 / total) * 100,
        });

        try {
          const content = fs.readFileSync(filePath, 'utf-8');

          // skip tiny files
          if (content.split('\n').length < 5) {
            results.push({ file: relPath, status: 'SKIPPED (too small)' });
            continue;
          }

          // skip already-annotated files
          if (content.includes('[SCOPE]') && (content.includes('[TODO]') || content.includes('[WARN]') || content.includes('[NEXT]'))) {
            results.push({ file: relPath, status: 'SKIPPED (already annotated)' });
            continue;
          }

          let result;
          const lines = content.split('\n');

          if (lines.length > 500) {
            // chunk large files — process in sections
            progress.report({ message: '(' + completed + '/' + total + ') ' + relPath + ' — large file, chunking...' });
            result = await this.processInChunks(relPath, content, token);
          } else {
            result = await this.routing.analyzeFile(
              relPath, content,
              'Add CHASSIS annotations to this file. Add a [SCOPE] comment at the very top explaining what this file does. Convert any TODO/FIXME/HACK to [TODO]/[WARN]/[DEAD]. Add [WARN] to fragile code. Keep ALL existing code exactly as-is.',
              token
            );
          }

          if (!result.success) {
            results.push({ file: relPath, status: 'FAILED: ' + result.error });
            failed++;
            continue;
          }

          // ── Measure Twice ──
          const validation = this.measureTwice.validate(content, result.text, relPath);
          if (!validation.passed) {
            results.push({ file: relPath, status: 'BLOCKED: ' + validation.issues.join('; ') });
            failed++;
            continue;
          }
          if (validation.warnings.length > 0) {
            results.push({ file: relPath, status: 'OK (warnings: ' + validation.warnings.join('; ') + ')' });
          }

          // write restructured file
          fs.writeFileSync(filePath, result.text);

          // auto-track changes
          const changeSummary = this.changeTracker.summarize(relPath, content, result.text, result.model, 'Retrofit');
          this.changeTracker.log(changeSummary);
          results.push({ file: relPath, status: 'OK' });
        } catch (err: any) {
          results.push({ file: relPath, status: 'ERROR: ' + err.message });
          failed++;
        }
      }

      // Step 5: Generate retrofit report
      progress.report({ message: 'Generating report...' });

      let report = '# CHASSIS Retrofit Report\n\n';
      report += '*Retrofit completed: ' + new Date().toISOString().split('T')[0] + '*\n\n';
      report += '---\n\n';
      report += '## Summary\n\n';
      report += '- Files processed: ' + total + '\n';
      report += '- Successful: ' + (total - failed) + '\n';
      report += '- Failed: ' + failed + '\n';
      report += '- Backup location: `.chassis/backup/`\n\n';
      report += '## Results\n\n';
      report += '| File | Status |\n|------|--------|\n';
      for (const r of results) {
        const icon = r.status === 'OK' ? '\u2705' : r.status.startsWith('SKIP') ? '\u23ed\ufe0f' : '\u274c';
        report += '| ' + r.file + ' | ' + icon + ' ' + r.status + ' |\n';
      }
      report += '\n---\n\n';
      report += '## Next Steps\n\n';
      report += '1. **Test your project** — make sure everything still works\n';
      report += '2. If good: run **CHASSIS: Confirm Retrofit** to delete the backup\n';
      report += '3. If bad: run **CHASSIS: Revert Retrofit** to restore original files\n';

      const reportPath = path.join(this.chassis.chassisDir, 'retrofit_report.md');
      fs.writeFileSync(reportPath, report);

      // log it
      this.chassis.appendWorkLog(
        '- Action: Project Retrofit\n' +
        '- Files processed: ' + total + '\n' +
        '- Successful: ' + (total - failed) + '\n' +
        '- Failed: ' + failed + '\n' +
        '- Backup: .chassis/backup/'
      );

      // open report
      const doc = await vscode.workspace.openTextDocument(reportPath);
      await vscode.window.showTextDocument(doc, { preview: false });
    });
  }

  async confirmRetrofit(): Promise<void> {
    const backupDir = path.join(this.chassis.chassisDir, 'backup');
    if (!fs.existsSync(backupDir)) {
      vscode.window.showInformationMessage('No backup to confirm — nothing to do.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Delete the backup and keep the restructured files?',
      { modal: true, detail: 'Make sure you\'ve tested everything first. This cannot be undone.' },
      'Confirm — Delete Backup', 'Cancel'
    );

    if (confirm === 'Confirm — Delete Backup') {
      this.deleteDir(backupDir);
      this.chassis.appendWorkLog('- Action: Retrofit Confirmed\n- Backup deleted');
      vscode.window.showInformationMessage('\u2705 Retrofit confirmed. Backup deleted. Project is now under CHASSIS structure.');
    }
  }

  async revertRetrofit(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { return; }
    const backupDir = path.join(this.chassis.chassisDir, 'backup');
    if (!fs.existsSync(backupDir)) {
      vscode.window.showInformationMessage('No backup found to revert from.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Revert all files to their pre-retrofit state?',
      { modal: true, detail: 'This will overwrite the current restructured files with the originals from backup.' },
      'Revert', 'Cancel'
    );

    if (confirm === 'Revert') {
      this.restoreFiles(root, backupDir);
      this.deleteDir(backupDir);
      this.chassis.appendWorkLog('- Action: Retrofit Reverted\n- Original files restored from backup');
      vscode.window.showInformationMessage('\u2705 Reverted to original files. Backup cleaned up.');
    }
  }

  // ── helpers ──

  private async processInChunks(
    filePath: string,
    content: string,
    token?: vscode.CancellationToken
  ): Promise<{ text: string; model: string; success: boolean; error?: string }> {
    const lines = content.split('\n');
    const CHUNK_SIZE = 200;
    const chunks: string[] = [];
    
    // split into chunks at natural break points (empty lines, function defs)
    let currentChunk: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      currentChunk.push(lines[i]);
      
      if (currentChunk.length >= CHUNK_SIZE) {
        // try to find a natural break in next 20 lines
        let breakFound = false;
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          const line = lines[j].trim();
          if (line === '' || line.startsWith('def ') || line.startsWith('class ') ||
              line.startsWith('function ') || line.startsWith('export ') ||
              line.startsWith('// ──') || line.startsWith('# ──')) {
            // include up to the break
            for (let k = i + 1; k <= j; k++) {
              currentChunk.push(lines[k]);
            }
            i = j;
            breakFound = true;
            break;
          }
        }
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }

    // process first chunk with [SCOPE] instruction
    const processedChunks: string[] = [];
    
    for (let c = 0; c < chunks.length; c++) {
      if (token?.isCancellationRequested) {
        return { text: '', model: '', success: false, error: 'Cancelled' };
      }

      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const commentChar = ['py','sh','bash','yaml','yml','rb'].includes(ext) ? '#' : '//';
      const isFirst = c === 0;
      const styleWarning = '\nCRITICAL: This is a ' + ext.toUpperCase() + ' file. Use ONLY ' + commentChar + ' for comments. NEVER use ' + (commentChar === '#' ? '//' : '#') + ' comments.';
      const instruction = isFirst
        ? 'Add a ' + commentChar + ' [SCOPE] comment at the very top explaining what this file does. Convert TODOs to ' + commentChar + ' [TODO], add ' + commentChar + ' [WARN] to fragile code. Keep ALL code as-is.' + styleWarning
        : 'This is part ' + (c + 1) + ' of a large file. Convert TODOs to ' + commentChar + ' [TODO], add ' + commentChar + ' [WARN] to fragile code. Do NOT add [SCOPE]. Keep ALL code as-is.' + styleWarning;

      const result = await this.routing.analyzeFile(
        filePath + ' (chunk ' + (c + 1) + '/' + chunks.length + ')',
        chunks[c],
        instruction,
        token
      );

      if (!result.success) {
        // if a chunk fails, keep the original chunk
        processedChunks.push(chunks[c]);
      } else {
        // strip markdown fences if present
        let cleaned = result.text;
        if (cleaned.startsWith('\`\`\`')) {
          cleaned = cleaned.replace(/^\`\`\`[a-z]*\n?/, '').replace(/\n?\`\`\`$/, '');
        }
        // strip any remaining fences mid-text
        cleaned = cleaned.replace(/^\`\`\`[a-z]*$/gm, '').replace(/^\`\`\`$/gm, '');
        
        // auto-fix wrong comment style
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        if (['py','sh','bash','yaml','yml','rb'].includes(ext)) {
          // fix // [TAG] to # [TAG] in Python files
          cleaned = cleaned.replace(/^\/\/ (\[(?:SCOPE|TODO|NEXT|WARN|DEAD|DONE)\])/gm, '# $1');
          // fix any remaining // comments that look like annotations
          cleaned = cleaned.replace(/^\/\/ /gm, '# ');
        }
        if (['html','xml','vue','svelte'].includes(ext)) {
          // fix // [TAG] to <!-- [TAG] --> in HTML files
          cleaned = cleaned.replace(/^\/\/ (\[(?:SCOPE|TODO|NEXT|WARN|DEAD|DONE)\].*)/gm, '<!-- $1 -->');
        }
        
        processedChunks.push(cleaned);
      }
    }

    const assembled = processedChunks.join('\n');
    return { text: assembled, model: 'gemini-2.5-flash (chunked)', success: true };
  }

  private getCodeFiles(root: string): string[] {
    const files: string[] = [];
    const skipDirs = new Set([
      'node_modules', '.git', '.chassis', '__pycache__', '.vscode',
      'venv', '.venv', 'dist', 'out', 'build', '.cache',
      'venv_ryppel', 'LivePortrait', 'avatar', 'old files',
    ]);
    const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css', '.sh']);
    const skipFiles = new Set([
      'basis_transcoder.js', 'three.min.js', 'jquery.min.js',
      'bootstrap.min.js', 'tailwind.min.js', 'vendor.js', 'bundle.js',
    ]);

    const scan = (dir: string) => {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && !skipDirs.has(e.name) && !e.name.startsWith('.')) {
          scan(full);
        } else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (codeExts.has(ext) && !skipFiles.has(e.name) && !e.name.includes('.min.')) { files.push(full); }
        }
      }
    };
    scan(root);
    return files;
  }

  private backupFiles(root: string, backupDir: string, files: string[]): void {
    for (const f of files) {
      const rel = path.relative(root, f);
      const dest = path.join(backupDir, rel);
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) { fs.mkdirSync(destDir, { recursive: true }); }
      fs.copyFileSync(f, dest);
    }
  }

  private restoreFiles(root: string, backupDir: string): void {
    const restore = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { restore(full); }
        else {
          const rel = path.relative(backupDir, full);
          const dest = path.join(root, rel);
          fs.copyFileSync(full, dest);
        }
      }
    };
    restore(backupDir);
  }

  private deleteDir(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
