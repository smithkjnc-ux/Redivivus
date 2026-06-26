// [SCOPE] Redivivus Duplicate Code Detection — finds repeated patterns across files

import * as fs from 'fs';
import * as path from 'path';
import type { RoutingService } from '../../../../shared/ai/infrastructure/routingService.js';

export interface DuplicatePattern {
  files: string[];
  pattern: string;
  suggestion: string;
}

export class DuplicateCodeDetectionService {
  constructor(private root: string, private routing: RoutingService) {}

  /** Scan codebase for duplicate code patterns using AI */
  async detectDuplicates(): Promise<DuplicatePattern[]> {
    const files = this.getSourceFiles();
    if (files.length < 2) { return []; }

    // Collect file contents (limit to 30 files for context window)
    const fileContents: string[] = [];
    for (const filePath of files.slice(0, 30)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      fileContents.push(`=== ${path.basename(filePath)} ===\n${content}`);
    }

    const combinedContent = fileContents.join('\n\n');

    const prompt = `Analyze this codebase for duplicate code patterns (similar functions, classes, or code blocks).

Code content (first 30 files):
${combinedContent}

Return ONLY a JSON array like this:
[
  {"files": ["file1.ts", "file2.ts"], "pattern": "Description of the duplicate pattern", "suggestion": "Suggestion for extraction"}
]

Look for:
- Similar function implementations
- Repeated class structures
- Common utility patterns
- Similar validation logic

If no duplicates found, return an empty array [].`;

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

  private getSourceFiles(): string[] {
    const files: string[] = [];
    const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs', '.java'];

    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'build') {
            scanDir(path.join(dir, entry.name));
          }
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(path.join(dir, entry.name));
        }
      }
    };

    scanDir(this.root);
    return files;
  }

  /** Format duplicates as markdown */
  formatMarkdown(duplicates: DuplicatePattern[]): string {
    if (duplicates.length === 0) {
      return '# Duplicate Code Detection\n\n✅ No duplicate code patterns detected.';
    }

    let md = '# Duplicate Code Detection\n\n';
    md += `Found ${duplicates.length} duplicate pattern(s):\n\n---\n\n`;

    for (const dup of duplicates) {
      md += `### 🔄 Duplicate Pattern\n`;
      md += `**Files:** ${dup.files.join(', ')}\n\n`;
      md += `**Pattern:** ${dup.pattern}\n\n`;
      md += `**Suggestion:** ${dup.suggestion}\n\n---\n\n`;
    }

    return md;
  }
}
