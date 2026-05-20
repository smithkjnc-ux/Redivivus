// [SCOPE] Project analyzer orchestrator — coordinates scanning, report generation, and recommendations panel
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChassisService } from './chassisService.js';
import { AnalysisResult } from './analyzerTypes.js';
import { scanDirectory, buildAnalysis } from './analyzerScanner.js';
import { generateProjectMap, generateRecommendations, analyzeCurrentFile as _analyzeCurrentFile } from './analyzerReports.js';
import { showRecommendationsPanel as _showRecommendationsPanel } from './analyzerPanel.js';

export { AnalysisResult };

// [DEAD] FileInfo, AnalysisResult, SKIP_DIRS, SKIP_EXTENSIONS, SKIP_FILES, CODE_EXTENSIONS
// [DONE] constants moved to analyzerScanner.ts, types to analyzerTypes.ts

export class AnalyzerService {
  private lastResult: AnalysisResult | null = null;

  constructor(private chassis: ChassisService) {}

  getLastResult(): AnalysisResult | null { return this.lastResult; }

  async analyzeProject(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { vscode.window.showErrorMessage('No project folder is open. Open a project first, then try again.'); return; }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'CHASSIS: Analyzing project...',
      cancellable: false,
    }, async (progress) => {
      progress.report({ increment: 0, message: 'Scanning files...' });

      // [WARN] skip out/ for VS Code extension projects — compiled JS duplicates the source. Never skip src/.
      const extraSkipDirs = new Set<string>();
      try {
        const pkgPath = path.join(root, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg?.engines?.vscode) { extraSkipDirs.add('out'); }
        }
      } catch { /* non-fatal */ }

      const files: import('./analyzerTypes.js').FileInfo[] = [];
      scanDirectory(root, root, files, extraSkipDirs);
      progress.report({ increment: 40, message: `Found ${files.length} files, analyzing...` });

      const result = buildAnalysis(files);
      this.lastResult = result;
      progress.report({ increment: 30, message: 'Generating project map...' });

      const mapPath = path.join(this.chassis.chassisDir, 'project_map.md');
      fs.writeFileSync(mapPath, generateProjectMap(result, root));
      fs.writeFileSync(path.join(this.chassis.chassisDir, 'recommendations.md'), generateRecommendations(result));
      progress.report({ increment: 30, message: 'Done!' });

      this.chassis.appendWorkLog(
        `- Action: Project Analysis\n- Files scanned: ${result.totalFiles}\n` +
        `- Total lines: ${result.totalLines}\n- Large files (>200 lines): ${result.largeFiles.length}\n` +
        `- TODOs found: ${result.todoItems.length}\n- Files needing comments: ${result.uncommentedFiles.length}`
      );

      // Persist scan results so Setup Progress survives reload
      try {
        const cfg = this.chassis.loadConfig();
        if (cfg) {
          cfg.lastScan = new Date().toISOString();
          cfg.scanResults = {
            largeFiles: result.largeFiles.map(f => ({ relativePath: f.relativePath, lines: f.lines })),
            todos: result.todoItems.map(t => ({ file: t.file, line: t.line })),
            uncommented: result.uncommentedFiles.map(f => ({ relativePath: f.relativePath, lines: f.lines })),
          };
          this.chassis.saveConfig(cfg);
        }
      } catch { /* non-fatal */ }

      _showRecommendationsPanel(result);
      if (result.todoItems.length === 0 && result.largeFiles.length === 0 && result.uncommentedFiles.length === 0) {
        vscode.window.showInformationMessage(
          '\u2705 Scan complete \u2014 no issues found! ' + result.totalFiles + ' files, ' + result.totalLines.toLocaleString() + ' lines.'
        );
      }
    });
  }

  // [DONE] generateProjectMap, generateRecommendations, analyzeCurrentFile → analyzerReports.ts
  // [DONE] showRecommendationsPanel → analyzerPanel.ts

  /**
   * Fast, background-safe project scan that only updates project_map.md and config.json.
   * No UI progress bars, no AI calls, no Recommendations panel.
   */
  updateProjectMapOnly(root: string): void {
    const extraSkipDirs = new Set<string>();
    try {
      const pkgPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg?.engines?.vscode) { extraSkipDirs.add('out'); }
      }
    } catch { /* non-fatal */ }

    const files: import('./analyzerTypes.js').FileInfo[] = [];
    scanDirectory(root, root, files, extraSkipDirs);
    const result = buildAnalysis(files);
    
    // Update map file
    const mapPath = path.join(this.chassis.chassisDir, 'project_map.md');
    fs.writeFileSync(mapPath, generateProjectMap(result, root));

    // Update config snapshot
    try {
      const cfg = this.chassis.loadConfig();
      if (cfg) {
        cfg.lastScan = new Date().toISOString();
        cfg.scanResults = {
          largeFiles: result.largeFiles.map(f => ({ relativePath: f.relativePath, lines: f.lines })),
          todos: result.todoItems.map(t => ({ file: t.file, line: t.line })),
          uncommented: result.uncommentedFiles.map(f => ({ relativePath: f.relativePath, lines: f.lines })),
        };
        this.chassis.saveConfig(cfg);
      }
    } catch { /* non-fatal */ }
  }

  showRecommendationsPanel(result: AnalysisResult): void {
    _showRecommendationsPanel(result);
  }

  async analyzeCurrentFile(filePath: string, fileContent: string): Promise<string> {
    return _analyzeCurrentFile(filePath, fileContent);
  }
}
