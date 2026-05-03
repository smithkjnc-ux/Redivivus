// [SCOPE] Core CHASSIS service — .chassis/ directory and config management

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChassisConfig, Blueprint, BlueprintHealth } from '../types/index.js';

export class ChassisService {
  private workspaceRoot: string | undefined;

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  // ── path helpers ──

  get chassisDir(): string {
    return path.join(this.workspaceRoot || '', '.chassis');
  }

  get configPath(): string {
    return path.join(this.chassisDir, 'config.json');
  }

  get blueprintPath(): string {
    return path.join(this.chassisDir, 'blueprint.md');
  }

  get worklogPath(): string {
    return path.join(this.chassisDir, 'work_log.md');
  }

  get deadendsPath(): string {
    return path.join(this.chassisDir, 'dead_ends.md');
  }

  get sessionsDir(): string {
    return path.join(this.chassisDir, 'sessions');
  }

  // ── state checks ──

  isInitialized(): boolean {
    return fs.existsSync(this.chassisDir) && fs.existsSync(this.configPath);
  }

  hasWorkspace(): boolean {
    return this.workspaceRoot !== undefined;
  }

  // ── initialization ──

  async initProject(projectName: string): Promise<void> {
    if (!this.hasWorkspace()) {
      throw new Error('No workspace folder open');
    }

    // create .chassis/ structure
    const dirs = [this.chassisDir, this.sessionsDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // create config
    const emptyBlueprint: Blueprint = {
      who: '', what: '', where: '', when: '', why: '',
      health: { confirmed: 0, assumed: 0, unknown: 5, confidence: 'low' },
      locked: false,
      version: '1.0',
    };

    const config: ChassisConfig = {
      projectName,
      createdAt: new Date().toISOString(),
      version: '0.1.0',
      blueprint: emptyBlueprint,
      sessions: [],
    };

    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

    // create work_log.md
    const worklogHeader = `# WORK_LOG — ${projectName}\n\nAuto-managed by CHASSIS. Append-only session history.\n\n---\n\n`;
    fs.writeFileSync(this.worklogPath, worklogHeader);

    // create dead_ends.md
    const deadendsHeader = `# Dead End Log — ${projectName}\n\nThings that didn't work and why. Learn from these.\n\n---\n\n`;
    fs.writeFileSync(this.deadendsPath, deadendsHeader);

    // create blueprint.md placeholder
    const bpHeader = `# Blueprint — ${projectName}\n\n🔶 Blueprint not yet completed. Run "CHASSIS: Run Blueprint Interview" to fill this in.\n\n---\n\n`;
    fs.writeFileSync(this.blueprintPath, bpHeader);

    // add .chassis/ to .gitignore if it contains sessions (but keep blueprint and work_log)
    await this.updateGitignore();

    // ── scaffold basic project structure ──
    const root = this.workspaceRoot!;
    const scaffoldDirs = [
      path.join(root, 'src'),
      path.join(root, 'tests'),
      path.join(root, 'docs'),
    ];
    for (const dir of scaffoldDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const readmePath = path.join(root, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, `# ${projectName}\n\n> Scaffolded by CHASSIS.\n\n## Getting Started\n- Edit your blueprint in \`.chassis/blueprint.md\`\n- Log work in \`.chassis/work_log.md\`\n- Track dead ends in \`.chassis/dead_ends.md\`\n`);
    }

    // generate CHASSIS shim files immediately
    this.generateRules(projectName, emptyBlueprint);
  }

  // ── scaffold at explicit path (used by wizard before vscode.openFolder) ──

  async scaffoldAt(targetPath: string, projectName: string, blueprint?: Blueprint): Promise<void> {
    const chassisDir = path.join(targetPath, '.chassis');
    const sessionsDir = path.join(chassisDir, 'sessions');

    fs.mkdirSync(chassisDir, { recursive: true });
    fs.mkdirSync(sessionsDir, { recursive: true });

    const bp: Blueprint = blueprint ? {
      who: blueprint.who || '', what: blueprint.what || '', where: blueprint.where || '',
      when: blueprint.when || '', why: blueprint.why || '',
      health: { confirmed: 0, assumed: 0, unknown: 0, confidence: 'low' as const },
      locked: false, version: '1.0',
    } : {
      who: '', what: '', where: '', when: '', why: '',
      health: { confirmed: 0, assumed: 0, unknown: 5, confidence: 'low' as const },
      locked: false, version: '1.0',
    };

    // If blueprint provided, compute health scores
    if (blueprint) {
      let confirmed = 0, assumed = 0, unknown = 0;
      for (const key of ['who', 'what', 'where', 'when', 'why'] as const) {
        const val = (blueprint[key] || '').trim();
        if (val.length > 20) confirmed++;
        else if (val.length > 0) assumed++;
        else unknown++;
      }
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (unknown === 0 && assumed <= 1) confidence = 'high';
      else if (unknown <= 1) confidence = 'medium';
      bp.health = { confirmed, assumed, unknown, confidence };
    }

    const config: ChassisConfig = {
      projectName,
      createdAt: new Date().toISOString(),
      version: '0.1.0',
      blueprint: bp,
      sessions: [],
    };

    fs.writeFileSync(path.join(chassisDir, 'config.json'), JSON.stringify(config, null, 2));

    const worklogHeader = `# WORK_LOG — ${projectName}\n\nAuto-managed by CHASSIS. Append-only session history.\n\n---\n\n`;
    fs.writeFileSync(path.join(chassisDir, 'work_log.md'), worklogHeader);

    const deadendsHeader = `# Dead End Log — ${projectName}\n\nThings that didn't work and why. Learn from these.\n\n---\n\n`;
    fs.writeFileSync(path.join(chassisDir, 'dead_ends.md'), deadendsHeader);

    const bpMd = `# Blueprint — ${projectName}\n\n## WHO\n${bp.who}\n\n## WHAT\n${bp.what}\n\n## WHERE\n${bp.where}\n\n## WHEN\n${bp.when}\n\n## WHY\n${bp.why}\n`;
    fs.writeFileSync(path.join(chassisDir, 'blueprint.md'), bpMd);

    // scaffold basic project structure
    const scaffoldDirs = [
      path.join(targetPath, 'src'),
      path.join(targetPath, 'tests'),
      path.join(targetPath, 'docs'),
    ];
    for (const dir of scaffoldDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const readmePath = path.join(targetPath, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, `# ${projectName}\n\n> Scaffolded by CHASSIS.\n\n## Getting Started\n- Edit your blueprint in \`.chassis/blueprint.md\`\n- Log work in \`.chassis/work_log.md\`\n- Track dead ends in \`.chassis/dead_ends.md\`\n`);
    }

    // rules + shims
    this.generateRules(projectName, bp, targetPath);

    // update .gitignore at target path
    const gitignorePath = path.join(targetPath, '.gitignore');
    const entry = '\n# CHASSIS session data (blueprints and logs are tracked)\n.chassis/sessions/\n';
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (!content.includes('.chassis/sessions/')) {
        fs.appendFileSync(gitignorePath, entry);
      }
    } else {
      fs.writeFileSync(gitignorePath, entry);
    }
  }

  // ── config read/write ──

  loadConfig(): ChassisConfig | null {
    if (!fs.existsSync(this.configPath)) { return null; }
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(raw) as ChassisConfig;
    } catch {
      return null;
    }
  }

  saveConfig(config: ChassisConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  // ── rules generation (Universal Project Protocol) ──

  generateRules(projectName: string, blueprint: Blueprint, targetPath?: string): void {
    const root = targetPath || this.workspaceRoot;
    if (!root) return;

    const rulesPath = path.join(root, '.chassis', 'rules.md');

    const rules = `# Project Rules — ${projectName}
> Auto-generated by CHASSIS. This is the single source of truth for all AI editors.

## Blueprint
- **WHO:** ${blueprint.who || ''}
- **WHAT:** ${blueprint.what || ''}
- **WHERE:** ${blueprint.where || ''}
- **WHEN:** ${blueprint.when || ''}
- **WHY:** ${blueprint.why || ''}

## Annotation Tags
Use these tags in code comments to mark intent:
- \`[SCOPE]\` — what this file/section is responsible for
- \`[TODO]\` — work that needs to be done
- \`[WARN]\` — known risk or fragile area
- \`[NEXT]\` — the next planned step
- \`[DEAD]\` — approach that was tried and failed
- \`[DONE]\` — completed work, ready for review

## Rules
- All user-facing text must be plain English appropriate for the WHO audience
- Do not introduce dependencies outside the WHERE tech stack
- Do not build features outside the WHAT scope
- Read CHASSIS_ROADMAP.md before starting work. Update it when done.
- The blueprint is in .chassis/config.json. Do not contradict it.
`;
    fs.writeFileSync(rulesPath, rules);

    // Shim files — one line each, pointing to master rules
    const shimContent = 'Read and follow all instructions in .chassis/rules.md\n';
    const shims = [
      { file: '.cursorrules' },
      { file: '.windsurfrules' },
      { file: 'CLAUDE.md' },
      { file: '.github/copilot-instructions.md', needsDir: '.github' },
    ];
    for (const shim of shims) {
      const shimPath = path.join(root, shim.file);
      const shimDir = path.dirname(shimPath);
      if (!fs.existsSync(shimDir)) {
        fs.mkdirSync(shimDir, { recursive: true });
      }
      fs.writeFileSync(shimPath, shimContent);
    }
  }

  // ── gitignore ──

  private async updateGitignore(): Promise<void> {
    const gitignorePath = path.join(this.workspaceRoot || '', '.gitignore');
    const entry = '\n# CHASSIS session data (blueprints and logs are tracked)\n.chassis/sessions/\n';

    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (!content.includes('.chassis/sessions/')) {
        fs.appendFileSync(gitignorePath, entry);
      }
    } else {
      fs.writeFileSync(gitignorePath, entry);
    }
  }

  // ── work log append ──

  appendWorkLog(text: string): void {
    if (!fs.existsSync(this.worklogPath)) { return; }
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const entry = `## [${timestamp}]\n${text}\n\n`;
    fs.appendFileSync(this.worklogPath, entry);
  }

  // ── dead end append ──

  appendDeadEnd(attempted: string, failedBecause: string, lesson: string): void {
    if (!fs.existsSync(this.deadendsPath)) { return; }
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const entry = `## [${timestamp}] — Dead End\n- **Attempted:** ${attempted}\n- **Failed because:** ${failedBecause}\n- **Lesson:** ${lesson}\n\n`;
    fs.appendFileSync(this.deadendsPath, entry);
  }
}
