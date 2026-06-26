// [SCOPE] Redivivus File Split Assistant — detects files >200 lines, suggests AI-powered splits

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { RoutingService } from '../../shared/ai/infrastructure/routingService.js';

export interface FileSuggestion {
  filePath: string;
  currentLines: number;
  suggestions: SplitSuggestion[];
}

export interface SplitSuggestion {
  newFileName: string;
  startLine: number;
  endLine: number;
  reason: string;
}

export class FileSplitService {
  constructor(private root: string, private routing: RoutingService) {}

  /** Scan codebase for files >200 lines */
  async scanForLargeFiles(): Promise<string[]> {
    const largeFiles: string[] = [];
    const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java'];

    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'build') {
            scanDir(path.join(dir, entry.name));
          }
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          const filePath = path.join(dir, entry.name);
          const lines = fs.readFileSync(filePath, 'utf-8').split('\n').length;
          if (lines > 200) {
            largeFiles.push(filePath);
          }
        }
      }
    };

    scanDir(this.root);
    return largeFiles;
  }

  /** Use AI to suggest split points for a file */
  async suggestSplits(filePath: string): Promise<SplitSuggestion[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const fileName = path.basename(filePath);

    const prompt = `Analyze this ${lines.length}-line file and suggest how to split it into multiple files under 200 lines each.

File: ${fileName}
\`\`\`
${content}
\`\`\`

Return ONLY a JSON array like this:
[
  {"newFileName": "utils.ts", "startLine": 10, "endLine": 50, "reason": "Utility functions"},
  {"newFileName": "types.ts", "startLine": 52, "endLine": 80, "reason": "Type definitions"}
]

Rules:
- Each split must be a logical unit (function, class, or related group)
- Start at the line where the code block begins
- End at the line after the closing brace
- New file names should be descriptive
- Suggest 2-4 splits max`;

    const res = await this.routing.prompt(prompt, 60_000);
    if (!res.success || !res.text) { return []; }

    try {
      const jsonMatch = res.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) { return []; }
      return JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
  }

  /** Generate full analysis for all large files */
  async analyzeAll(): Promise<FileSuggestion[]> {
    const largeFiles = await this.scanForLargeFiles();
    const results: FileSuggestion[] = [];

    for (const filePath of largeFiles) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').length;
      const suggestions = await this.suggestSplits(filePath);
      results.push({ filePath, currentLines: lines, suggestions });
    }

    return results;
  }

  /** Format results as markdown for chat display */
  formatMarkdown(results: FileSuggestion[]): string {
    if (results.length === 0) {
      return '# File Split Assistant\n\n✅ All files are under 200 lines. No splits needed.';
    }

    let md = '# File Split Assistant\n\n';
    md += `Found ${results.length} file(s) over 200 lines:\n\n---\n\n`;

    for (const file of results) {
      const relPath = path.relative(this.root, file.filePath);
      md += `## 📄 ${relPath}\n`;
      md += `**Current:** ${file.currentLines} lines\n\n`;

      if (file.suggestions.length === 0) {
        md += `_No split suggestions available._\n\n`;
      } else {
        md += `**Suggested splits:**\n\n`;
        for (const split of file.suggestions) {
          md += `- \`${split.newFileName}\` (lines ${split.startLine}-${split.endLine})\n`;
          md += `  _${split.reason}_\n\n`;
        }
      }
      md += `---\n\n`;
    }

    return md;
  }
}
