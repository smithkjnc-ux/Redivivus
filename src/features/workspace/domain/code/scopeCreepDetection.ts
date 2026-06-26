// [SCOPE] Redivivus Scope Creep Detection — warns when project drifts from blueprint

import * as fs from 'fs';
import * as path from 'path';
import type { RedivivusService } from '../../../../shared/vscode/application/redivivusService.js';
import type { RoutingService } from '../../../../shared/ai/infrastructure/routingService.js';

export interface ScopeIssue {
  type: 'missing_file' | 'extra_file' | 'drift';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export class ScopeCreepDetectionService {
  constructor(private root: string, private redivivus: RedivivusService, private routing: RoutingService) {}

  /** Detect scope creep by comparing blueprint to actual files */
  async detectScopeCreep(): Promise<ScopeIssue[]> {
    const issues: ScopeIssue[] = [];

    if (!this.redivivus.isInitialized()) {
      issues.push({
        type: 'drift',
        description: 'Redivivus not initialized — no blueprint to compare against',
        severity: 'high',
      });
      return issues;
    }

    const config = this.redivivus.loadConfig();

    // Get actual source files
    const actualFiles = this.getSourceFiles();

    // Use AI to detect conceptual drift (Redivivus blueprint doesn't track files, only 5 W's)
    const driftIssues = await this.detectConceptualDrift(actualFiles, config?.blueprint?.what || '');
    issues.push(...driftIssues);

    return issues;
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
          files.push(path.relative(this.root, path.join(dir, entry.name)));
        }
      }
    };

    scanDir(this.root);
    return files;
  }

  private async detectConceptualDrift(files: string[], blueprintWhat: string): Promise<ScopeIssue[]> {
    if (!blueprintWhat || files.length === 0) { return []; }

    const fileList = files.slice(0, 20).join(', ');
    const prompt = `Blueprint says project is: "${blueprintWhat}"

Actual source files (first 20): ${fileList}

Does the actual codebase match the blueprint description? If there's a mismatch (scope creep), return a JSON array like:
[{"type": "drift", "description": "Description of the mismatch", "severity": "medium"}]

If they match, return an empty array [].`;

    const res = await this.routing.prompt(prompt, 30_000);
    if (!res.success || !res.text) { return []; }

    try {
      const jsonMatch = res.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) { return []; }
      return JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
  }

  /** Format issues as markdown */
  formatMarkdown(issues: ScopeIssue[]): string {
    if (issues.length === 0) {
      return '# Scope Creep Detection\n\n✅ No scope creep detected. Project aligns with blueprint.';
    }

    let md = '# Scope Creep Detection\n\n';
    md += `Found ${issues.length} issue(s):\n\n---\n\n`;

    for (const issue of issues) {
      const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
      md += `### ${icon} ${issue.type.replace('_', ' ').toUpperCase()}\n`;
      md += `**Severity:** ${issue.severity}\n\n`;
      md += `${issue.description}\n\n---\n\n`;
    }

    return md;
  }
}
