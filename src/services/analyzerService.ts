// [SCOPE] Project analyzer — retrofit existing projects into CHASSIS structure

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChassisService } from './chassisService.js';

interface FileInfo {
  relativePath: string;
  extension: string;
  lines: number;
  size: number;
  todos: string[];
  hasComments: boolean;
}

interface AnalysisResult {
  totalFiles: number;
  totalLines: number;
  filesByType: Record<string, number>;
  largeFiles: FileInfo[];      // over 200 lines
  todoItems: { file: string; line: string }[];
  uncommentedFiles: FileInfo[];
  structure: string[];         // directory tree
}

// directories and files to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.chassis', '__pycache__', '.vscode',
  'venv', '.venv', 'dist', 'out', 'build', '.next', '.cache',
  'venv_ryppel', 'LivePortrait', 'avatar', 'old files',
]);

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.mp3', '.mp4', '.wav', '.ogg', '.glb', '.obj', '.fbx',
  '.woff', '.woff2', '.ttf', '.eot',
  '.lock', '.map',
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css',
  '.json', '.yaml', '.yml', '.md', '.sh', '.bash',
  '.sql', '.env', '.toml', '.cfg', '.ini',
]);

export class AnalyzerService {
  constructor(private chassis: ChassisService) {}

  async analyzeProject(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'CHASSIS: Analyzing project...',
      cancellable: false,
    }, async (progress) => {
      progress.report({ increment: 0, message: 'Scanning files...' });

      const files: FileInfo[] = [];
      this.scanDirectory(root, root, files);

      progress.report({ increment: 40, message: `Found ${files.length} files, analyzing...` });

      const result = this.buildAnalysis(files);

      progress.report({ increment: 30, message: 'Generating project map...' });

      const mapContent = this.generateProjectMap(result, root);
      const mapPath = path.join(this.chassis.chassisDir, 'project_map.md');
      fs.writeFileSync(mapPath, mapContent);

      // also generate a structure recommendation
      const recsContent = this.generateRecommendations(result);
      const recsPath = path.join(this.chassis.chassisDir, 'recommendations.md');
      fs.writeFileSync(recsPath, recsContent);

      progress.report({ increment: 30, message: 'Done!' });

      // log it
      this.chassis.appendWorkLog(
        `- Action: Project Analysis\n` +
        `- Files scanned: ${result.totalFiles}\n` +
        `- Total lines: ${result.totalLines}\n` +
        `- Large files (>200 lines): ${result.largeFiles.length}\n` +
        `- TODOs found: ${result.todoItems.length}\n` +
        `- Files needing comments: ${result.uncommentedFiles.length}`
      );

      // open the project map
      const doc = await vscode.workspace.openTextDocument(mapPath);
      await vscode.window.showTextDocument(doc);

      const scanMsg = 
        'Scan complete!\n\n' +
        'Your project has ' + result.totalFiles + ' files and ' + result.totalLines + ' lines of code.\n\n' +
        (result.todoItems.length > 0 ? '\u{1F4CB} ' + result.todoItems.length + ' thing(s) still need work\n' : '') +
        (result.largeFiles.length > 0 ? '\u{1F4CF} ' + result.largeFiles.length + ' file(s) are pretty long and could be split up\n' : '') +
        (result.uncommentedFiles.length > 0 ? '\u{1F4AD} ' + result.uncommentedFiles.length + ' file(s) need better comments\n' : '') +
        '\nA project map is open on the left.';
      const scanChoice = await vscode.window.showInformationMessage(
        scanMsg,
        { modal: true },
        'View Recommendations', 'Clean Up Project', 'Done'
      );
      if (scanChoice === 'View Recommendations') {
        const rdoc = await vscode.workspace.openTextDocument(recsPath);
        await vscode.window.showTextDocument(rdoc, vscode.ViewColumn.One);
      } else if (scanChoice === 'Clean Up Project') {
        await vscode.commands.executeCommand('chassis.retrofit');
      }
    });
  }

  private scanDirectory(dir: string, root: string, files: FileInfo[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          this.scanDirectory(fullPath, root, files);
        }
        continue;
      }

      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) { continue; }
        if (!CODE_EXTENSIONS.has(ext) && ext !== '') { continue; }

        try {
          const stat = fs.statSync(fullPath);
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          const relativePath = path.relative(root, fullPath);

          // find TODOs, FIXMEs, HACKs
          const todos: string[] = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/\b(TODO|FIXME|HACK|XXX|BUG)\b/i.test(line)) {
              todos.push(`L${i + 1}: ${line.trim().substring(0, 100)}`);
            }
          }

          // check for any comments
          const hasComments = /\/\/|\/\*|#\s|"""|'''|<!--/.test(content);

          files.push({
            relativePath,
            extension: ext || path.basename(entry.name),
            lines: lines.length,
            size: stat.size,
            todos,
            hasComments,
          });
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  private buildAnalysis(files: FileInfo[]): AnalysisResult {
    const filesByType: Record<string, number> = {};
    const largeFiles: FileInfo[] = [];
    const todoItems: { file: string; line: string }[] = [];
    const uncommentedFiles: FileInfo[] = [];
    let totalLines = 0;

    for (const f of files) {
      // count by type
      filesByType[f.extension] = (filesByType[f.extension] || 0) + 1;
      totalLines += f.lines;

      // large files
      if (f.lines > 200) { largeFiles.push(f); }

      // collect todos
      for (const t of f.todos) {
        todoItems.push({ file: f.relativePath, line: t });
      }

      // uncommented code files (skip .json, .md, etc)
      if (!f.hasComments && ['.ts', '.tsx', '.js', '.jsx', '.py'].includes(f.extension)) {
        uncommentedFiles.push(f);
      }
    }

    // sort large files by size descending
    largeFiles.sort((a, b) => b.lines - a.lines);

    // build directory tree
    const dirs = new Set<string>();
    for (const f of files) {
      const dir = path.dirname(f.relativePath);
      if (dir !== '.') { dirs.add(dir); }
    }
    const structure = Array.from(dirs).sort();

    return {
      totalFiles: files.length,
      totalLines,
      filesByType,
      largeFiles,
      todoItems,
      uncommentedFiles,
      structure,
    };
  }

  private generateProjectMap(result: AnalysisResult, root: string): string {
    const projectName = path.basename(root);
    let md = `# Project Map — ${projectName}\n\n`;
    md += `*Generated by CHASSIS Analyzer*\n\n`;
    md += `---\n\n`;

    // overview
    md += `## Overview\n\n`;
    md += `| Metric | Count |\n|--------|-------|\n`;
    md += `| Total Files | ${result.totalFiles} |\n`;
    md += `| Total Lines | ${result.totalLines.toLocaleString()} |\n`;
    md += `| Large Files (>200 lines) | ${result.largeFiles.length} |\n`;
    md += `| TODO/FIXME items | ${result.todoItems.length} |\n`;
    md += `| Files without comments | ${result.uncommentedFiles.length} |\n\n`;

    // file types
    md += `## File Types\n\n`;
    const sorted = Object.entries(result.filesByType).sort((a, b) => b[1] - a[1]);
    for (const [ext, count] of sorted) {
      md += `- **${ext}**: ${count} files\n`;
    }
    md += `\n`;

    // directory structure
    md += `## Directory Structure\n\n`;
    md += '```\n';
    for (const dir of result.structure) {
      const depth = dir.split(path.sep).length - 1;
      md += `${'  '.repeat(depth)}📁 ${dir}\n`;
    }
    md += '```\n\n';

    // large files
    if (result.largeFiles.length > 0) {
      md += `## ⚠️ Large Files (>200 lines)\n\n`;
      md += `These should be reviewed for splitting:\n\n`;
      for (const f of result.largeFiles) {
        md += `- **${f.relativePath}** — ${f.lines} lines\n`;
      }
      md += `\n`;
    }

    // existing TODOs
    if (result.todoItems.length > 0) {
      md += `## 📋 Existing TODOs & FIXMEs\n\n`;
      md += `Convert these to CHASSIS annotations (\`// [TODO]\`, \`// [DONE]\`, etc.):\n\n`;
      for (const t of result.todoItems) {
        md += `- **${t.file}** — ${t.line}\n`;
      }
      md += `\n`;
    }

    // uncommented files
    if (result.uncommentedFiles.length > 0) {
      md += `## 🔇 Files Without Comments\n\n`;
      md += `Consider adding \`// [SCOPE]\` tags to define boundaries:\n\n`;
      for (const f of result.uncommentedFiles) {
        md += `- **${f.relativePath}** (${f.lines} lines)\n`;
      }
      md += `\n`;
    }

    return md;
  }

  private generateRecommendations(result: AnalysisResult): string {
    let md = `# CHASSIS Recommendations\n\n`;
    md += `*Based on project analysis*\n\n---\n\n`;

    // priority actions
    md += `## Priority Actions\n\n`;

    let priority = 1;

    if (result.largeFiles.length > 0) {
      md += `### ${priority++}. Split Large Files\n\n`;
      md += `${result.largeFiles.length} files exceed 200 lines. `;
      md += `Large files are harder for AI coders to hold in context and more prone to merge conflicts.\n\n`;
      for (const f of result.largeFiles.slice(0, 5)) {
        md += `- \`${f.relativePath}\` (${f.lines} lines) — consider splitting by function/responsibility\n`;
      }
      md += `\n`;
    }

    if (result.todoItems.length > 0) {
      md += `### ${priority++}. Convert TODOs to CHASSIS Annotations\n\n`;
      md += `Found ${result.todoItems.length} existing TODO/FIXME markers. Convert them:\n\n`;
      md += `| Old Style | CHASSIS Style |\n|-----------|---------------|\n`;
      md += `| \`// TODO:\` | \`// [TODO] description\` |\n`;
      md += `| \`// FIXME:\` | \`// [WARN] description\` |\n`;
      md += `| \`// HACK:\` | \`// [WARN] hacky — description\` |\n`;
      md += `| \`// XXX:\` | \`// [TODO] needs attention — description\` |\n\n`;
    }

    if (result.uncommentedFiles.length > 0) {
      md += `### ${priority++}. Add Scope Tags\n\n`;
      md += `${result.uncommentedFiles.length} code files have zero comments. `;
      md += `Add a \`// [SCOPE]\` tag at the top of each file describing its purpose:\n\n`;
      md += `\`\`\`\n// [SCOPE] WebSocket bridge — connects TUI dashboard to browser avatar\n\`\`\`\n\n`;
    }

    md += `### ${priority++}. Add Entry Point Comments\n\n`;
    md += `Every main file should have a \`// [SCOPE]\` tag explaining what it does and what it connects to. `;
    md += `This is the single most valuable annotation for cold-read handoff.\n\n`;

    md += `### ${priority++}. Establish File Size Discipline\n\n`;
    md += `Going forward, aim for **200 lines max per file**. `;
    md += `When a file exceeds this, split it by responsibility. `;
    md += `CHASSIS will flag violations automatically in future versions.\n\n`;

    md += `---\n\n`;
    md += `*These recommendations are structural. Deep code analysis requires CHASSIS Phase 2 (AI routing).*\n`;

    return md;
  }

  async analyzeCurrentFile(filePath: string, fileContent: string): Promise<string> {
    const lines = fileContent.split('\n');
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const commentChar = ['py','sh','bash','yaml','yml','rb'].includes(ext) ? '#' : '//';
    
    let report = '# File Analysis \u2014 ' + filePath + '\n\n';
    report += '*Generated by CHASSIS Analyzer*\n\n---\n\n';
    
    report += '## Current State\n\n';
    report += '- **Lines:** ' + lines.length + '\n';
    report += '- **Type:** ' + (ext || 'unknown') + '\n';
    report += '- **Comment style:** ' + commentChar + '\n';
    
    const tags = ['[SCOPE]', '[TODO]', '[NEXT]', '[WARN]', '[DEAD]', '[DONE]'];
    const found: string[] = [];
    for (const tag of tags) {
      const escaped = tag.replace(/[\[\]]/g, '\\$&');
      const count = (fileContent.match(new RegExp(escaped, 'g')) || []).length;
      if (count > 0) found.push(tag + ' x' + count);
    }
    report += '- **CHASSIS tags:** ' + (found.length > 0 ? found.join(', ') : 'None') + '\n';
    
    const oldTodos: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/\b(TODO|FIXME|HACK|XXX|BUG)\b/i.test(lines[i])) {
        oldTodos.push('  L' + (i+1) + ': ' + lines[i].trim().substring(0, 80));
      }
    }
    report += '- **Old-style TODOs:** ' + oldTodos.length + '\n';
    
    const commentLines = lines.filter(l => {
      const t = l.trim();
      return t.startsWith('#') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('<!--');
    }).length;
    const commentRatio = Math.round((commentLines / lines.length) * 100);
    report += '- **Comment density:** ' + commentRatio + '% (' + commentLines + ' lines)\n';
    
    const functions = lines.filter(l => /^\s*(def |function |class |export |const \w+ = \(|async function)/.test(l));
    report += '- **Functions/classes:** ' + functions.length + '\n\n';
    
    if (oldTodos.length > 0) {
      report += '### Existing TODOs/FIXMEs\n\n';
      for (const t of oldTodos) { report += t + '\n'; }
      report += '\n';
    }
    
    report += '---\n\n## Planned CHASSIS Changes\n\n';
    const planned: string[] = [];
    
    if (!found.some(f => f.startsWith('[SCOPE]'))) {
      planned.push('Add ' + commentChar + ' [SCOPE] at top');
    }
    if (oldTodos.length > 0) {
      planned.push('Convert ' + oldTodos.length + ' TODO/FIXME to CHASSIS format');
    }
    if (commentRatio < 5) {
      planned.push('Add ' + commentChar + ' [WARN] to fragile sections');
    }
    if (lines.length > 500) {
      planned.push('File is ' + lines.length + ' lines \u2014 will chunk into ' + Math.ceil(lines.length / 200) + ' parts');
      planned.push('Recommend splitting into smaller files');
    }
    if (lines.length > 200) {
      planned.push('Add ' + commentChar + ' [NEXT] split point markers');
    }
    if (planned.length === 0) {
      planned.push('File already meets CHASSIS standards');
    }
    for (const p of planned) { report += '- ' + p + '\n'; }
    
    report += '\n---\n\nRun **Restructure File** or **Retrofit Project** to apply.\n';
    return report;
  }
}
