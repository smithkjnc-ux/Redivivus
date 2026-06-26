// [SCOPE] Redivivus Retrofit Blueprint — scan existing codebase, auto-generate 5 W's blueprint
// Saves generated blueprint directly into .redivivus/config.json so Redivivus uses it immediately.

import * as fs from 'fs';
import * as path from 'path';
import type { RoutingService } from '../../shared/ai/infrastructure/routingService.js';
import { getCodeFiles } from './retrofitFileScanner.js';

export interface Blueprint5W {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
}

const STACK_MAP: [string[], string][] = [
  [['next'], 'Next.js (fullstack)'],
  [['react', 'react-dom'], 'React (frontend)'],
  [['vue', '@vue/core'], 'Vue.js (frontend)'],
  [['@angular/core'], 'Angular (frontend)'],
  [['svelte'], 'Svelte (frontend)'],
  [['electron'], 'Electron (desktop app)'],
  [['react-native', 'expo'], 'React Native (mobile)'],
  [['express'], 'Express (Node.js API)'],
  [['fastify'], 'Fastify (Node.js API)'],
  [['socket.io'], 'WebSockets'],
  [['three'], 'Three.js (3D/WebGL)'],
  [['phaser'], 'Phaser (game engine)'],
  [['prisma', '@prisma/client'], 'Prisma (ORM)'],
  [['mongoose'], 'MongoDB/Mongoose'],
  [['pg', 'postgres'], 'PostgreSQL'],
  [['tailwindcss'], 'Tailwind CSS'],
  [['vscode'], 'VS Code extension'],
  [['typescript'], 'TypeScript'],
];

export class RetrofitBlueprintService {
  constructor(private root: string, private routing: RoutingService) {}

  private detectTechStack(pkg: any): string {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const stack = STACK_MAP
      .filter(([names]) => names.some(n => deps[n] !== undefined))
      .map(([, label]) => label);
    return stack.length ? stack.join(', ') : '';
  }

  private sampleEntryPoint(): string {
    const CANDIDATES = [
      'index.html', 'index.ts', 'index.js', 'main.ts', 'main.js',
      'app.ts', 'app.js', 'app.py', 'main.py', '__main__.py',
      'index.py', 'server.ts', 'server.js',
    ];
    for (const name of CANDIDATES) {
      const p = path.join(this.root, name);
      if (!fs.existsSync(p)) { continue; }
      try {
        const lines = fs.readFileSync(p, 'utf-8').split('\n')
          .filter(l => l.trim() && !/^\s*(\/\/|#|\/\*)/.test(l))
          .slice(0, 25);
        if (lines.length) { return `=== ${name} (entry point) ===\n${lines.join('\n')}`; }
      } catch { /* skip */ }
    }
    return '';
  }

  /** Build a rich project summary: README, manifests, tech stack, entry point, [SCOPE] lines */
  async scanCodebase(): Promise<string> {
    const parts: string[] = [];

    // README — best high-level signal
    for (const name of ['README.md', 'README.txt', 'readme.md']) {
      const p = path.join(this.root, name);
      if (fs.existsSync(p)) { parts.push('=== README ===\n' + fs.readFileSync(p, 'utf-8').slice(0, 2000)); break; }
    }

    // package.json — name, description, scripts, deps + tech stack detection
    const pkgPath = path.join(this.root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        parts.push('=== package.json ===\n' + JSON.stringify({
          name: pkg.name, description: pkg.description,
          main: pkg.main, scripts: pkg.scripts,
          deps: Object.keys(pkg.dependencies || {}).slice(0, 15),
          devDeps: Object.keys(pkg.devDependencies || {}).slice(0, 10),
        }, null, 2));
        const stack = this.detectTechStack(pkg);
        if (stack) { parts.push('=== DETECTED TECH STACK ===\n' + stack); }
      } catch { /* skip */ }
    }

    // Python / Rust manifests
    for (const name of ['requirements.txt', 'pyproject.toml', 'Cargo.toml']) {
      const p = path.join(this.root, name);
      if (fs.existsSync(p)) { try { parts.push(`=== ${name} ===\n` + fs.readFileSync(p, 'utf-8').slice(0, 600)); } catch { /* skip */ } break; }
    }

    // Dockerfile — deployment signal
    const dockerPath = path.join(this.root, 'Dockerfile');
    if (fs.existsSync(dockerPath)) {
      try { parts.push('=== Dockerfile ===\n' + fs.readFileSync(dockerPath, 'utf-8').slice(0, 400)); } catch { /* skip */ }
    }

    // Entry point sample — actual code gives strong "what it does" signal
    const entry = this.sampleEntryPoint();
    if (entry) { parts.push(entry); }

    // [SCOPE] tags from source files — best per-file signal
    const files = getCodeFiles(this.root).slice(0, 40);
    const lines: string[] = [];
    for (const f of files) {
      try {
        const content = fs.readFileSync(f, 'utf-8').split('\n');
        const scope = content.find(l => /\[SCOPE\]/.test(l));
        lines.push(scope ? `${path.relative(this.root, f)}: ${scope.trim()}` : path.relative(this.root, f));
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

  // [WARN] Creates .redivivus/config.json if it doesn't exist — safe for non-Redivivus projects
  saveToConfig(blueprint: Blueprint5W): void {
    const cfgPath = path.join(this.root, '.redivivus', 'config.json');
    try {
      const existing = fs.existsSync(cfgPath)
        ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
        : { projectName: path.basename(this.root), createdAt: new Date().toISOString(), version: '0.3.6', sessions: [] };
      existing.blueprint = {
        ...(existing.blueprint || {}),
        who: blueprint.who, what: blueprint.what,
        where: blueprint.where, when: blueprint.when, why: blueprint.why,
        health: { confirmed: 0, assumed: 5, unknown: 0, confidence: 'medium' },
        locked: false, version: '1.0', revision: 1,
      };
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2), 'utf-8');
    } catch { /* never block */ }
  }

  formatMarkdown(blueprint: Blueprint5W): string {
    return `# Redivivus Blueprint (Retrofit)\nGenerated from project scan.\n\n---\n\n## Who\n${blueprint.who}\n\n## What\n${blueprint.what}\n\n## When\n${blueprint.when}\n\n## Where\n${blueprint.where}\n\n## Why\n${blueprint.why}`;
  }
}
