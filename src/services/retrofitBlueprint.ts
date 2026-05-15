// [SCOPE] CHASSIS Retrofit Blueprint — scan existing codebase, auto-generate 5 W's blueprint

import * as fs from 'fs';
import * as path from 'path';
import { RoutingService } from './ai/routingService.js';

export interface Blueprint5W {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
}

export class RetrofitBlueprintService {
  constructor(private root: string, private routing: RoutingService) {}

  /** Scan codebase and collect file summaries */
  async scanCodebase(): Promise<string> {
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

    let summary = '';
    for (const filePath of files.slice(0, 50)) { // Limit to 50 files for context window
      const relPath = path.relative(this.root, filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').slice(0, 20).join('\n'); // First 20 lines
      summary += `\n\n=== ${relPath} ===\n${lines}`;
    }

    return summary;
  }

  /** Use AI to generate 5 W's blueprint from code scan */
  async generateBlueprint(): Promise<Blueprint5W | null> {
    const codeSummary = await this.scanCodebase();

    const prompt = `Analyze this codebase and generate a "5 W's" blueprint.

Code summary (first 50 files, first 20 lines each):
${codeSummary}

Return ONLY a JSON object like this:
{
  "who": "Solo developer, vibe coder, or team size",
  "what": "What this project does in plain English",
  "when": "Development timeline or release cadence",
  "where": "Target platforms (web, desktop, mobile, CLI)",
  "why": "The problem this project solves and its purpose"
}

Keep each answer concise (1-2 sentences).`;

    const res = await this.routing.prompt(prompt, 60_000);
    if (!res.success || !res.text) { return null; }

    try {
      const jsonMatch = res.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { return null; }
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }

  /** Format blueprint as markdown */
  formatMarkdown(blueprint: Blueprint5W): string {
    return `# CHASSIS Blueprint (Retrofit)

Generated from existing codebase scan.

---

## Who
${blueprint.who}

## What
${blueprint.what}

## When
${blueprint.when}

## Where
${blueprint.where}

## Why
${blueprint.why}`;
  }
}
