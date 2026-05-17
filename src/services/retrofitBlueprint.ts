// [SCOPE] CHASSIS Retrofit Blueprint — scan existing codebase, auto-generate 5 W's blueprint
// Saves generated blueprint directly into .chassis/config.json so CHASSIS uses it immediately.

import * as fs from 'fs';
import * as path from 'path';
import { RoutingService } from './ai/routingService.js';
import { getCodeFiles } from './retrofitFileScanner.js';

export interface Blueprint5W {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
}

export class RetrofitBlueprintService {
  constructor(private root: string, private routing: RoutingService) {}

  /** Build a rich project summary: README, package.json, [SCOPE] lines, file list */
  async scanCodebase(): Promise<string> {
    const parts: string[] = [];

    // README gives the best high-level signal
    for (const name of ['README.md', 'README.txt', 'readme.md']) {
      const p = path.join(this.root, name);
      if (fs.existsSync(p)) {
        parts.push('=== README ===\n' + fs.readFileSync(p, 'utf-8').slice(0, 2000));
        break;
      }
    }

    // package.json / pyproject.toml for name, description, dependencies
    for (const manifest of ['package.json', 'pyproject.toml', 'Cargo.toml']) {
      const p = path.join(this.root, manifest);
      if (!fs.existsSync(p)) { continue; }
      try {
        if (manifest === 'package.json') {
          const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
          parts.push('=== package.json ===\n' + JSON.stringify({
            name: pkg.name, description: pkg.description,
            main: pkg.main, scripts: pkg.scripts,
            deps: Object.keys(pkg.dependencies || {}).slice(0, 12),
          }, null, 2));
        } else {
          parts.push(`=== ${manifest} ===\n` + fs.readFileSync(p, 'utf-8').slice(0, 500));
        }
      } catch { /* skip */ }
      break;
    }

    // [SCOPE] tags from source files — best per-file signal
    const files = getCodeFiles(this.root).slice(0, 40);
    const lines: string[] = [];
    for (const f of files) {
      try {
        const content = fs.readFileSync(f, 'utf-8').split('\n');
        const scope = content.find(l => /\[SCOPE\]/.test(l));
        const rel = path.relative(this.root, f);
        lines.push(scope ? `${rel}: ${scope.trim()}` : rel);
      } catch { /* skip */ }
    }
    if (lines.length > 0) { parts.push('=== FILES ===\n' + lines.join('\n')); }

    return parts.join('\n\n');
  }

  /** Use AI to generate 5 W's from the project scan */
  async generateBlueprint(): Promise<Blueprint5W | null> {
    const summary = await this.scanCodebase();
    const prompt = `Analyze this project and return a JSON object with exactly these 5 fields:
{
  "who": "Who will use this — e.g. 'solo developer', 'small team', 'general public'",
  "what": "What this project does in plain English (1-2 sentences)",
  "when": "Development stage — e.g. 'early prototype', 'v1 in active use', 'just starting'",
  "where": "Target platform — e.g. 'web browser', 'desktop app', 'command line', 'mobile'",
  "why": "The problem it solves or the goal it serves (1-2 sentences)"
}

PROJECT DATA:
${summary}

Return ONLY the JSON object. No markdown, no explanation.`;

    const res = await this.routing.prompt(prompt, 60_000);
    if (!res.success || !res.text) { return null; }
    try {
      const m = res.text.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : null;
    } catch { return null; }
  }

  // [WARN] Creates .chassis/config.json if it doesn't exist — safe for non-CHASSIS projects
  saveToConfig(blueprint: Blueprint5W): void {
    const cfgPath = path.join(this.root, '.chassis', 'config.json');
    try {
      const existing = fs.existsSync(cfgPath)
        ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
        : { projectName: path.basename(this.root), createdAt: new Date().toISOString(), version: '0.3.6', sessions: [] };
      existing.blueprint = {
        ...(existing.blueprint || {}),
        who: blueprint.who, what: blueprint.what,
        where: blueprint.where, when: blueprint.when, why: blueprint.why,
        health: { confirmed: 0, assumed: 5, unknown: 0, confidence: 'medium' },
        locked: false, version: '1.0',
      };
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2), 'utf-8');
    } catch { /* never block */ }
  }

  formatMarkdown(blueprint: Blueprint5W): string {
    return `# CHASSIS Blueprint (Retrofit)\nGenerated from project scan.\n\n---\n\n## Who\n${blueprint.who}\n\n## What\n${blueprint.what}\n\n## When\n${blueprint.when}\n\n## Where\n${blueprint.where}\n\n## Why\n${blueprint.why}`;
  }
}
