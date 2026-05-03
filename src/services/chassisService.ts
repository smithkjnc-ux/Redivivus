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

  get roadmapPath(): string {
    return path.join(this.workspaceRoot || '', 'CHASSIS_ROADMAP.md');
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
    const rules = this.buildRulesContent(projectName, blueprint);
    fs.writeFileSync(rulesPath, rules);

    // Write FULL rules into every shim — not just a pointer.
    // This ensures Windsurf, Cursor, Claude Code, Copilot, and any other
    // AI editor reads and follows these rules even if CHASSIS is not installed.
    const shims: { file: string; content: string }[] = [
      { file: '.cursorrules',                    content: rules },
      { file: '.windsurfrules',                  content: rules },
      { file: 'CLAUDE.md',                       content: `# CLAUDE.md — ${projectName}\n\n${rules}` },
      { file: 'GEMINI.md',                       content: `# GEMINI.md — ${projectName}\n\n${rules}` },
      { file: '.clinerules',                     content: rules },
      { file: '.github/copilot-instructions.md', content: rules },
    ];
    for (const shim of shims) {
      const shimPath = path.join(root, shim.file);
      const shimDir = path.dirname(shimPath);
      if (!fs.existsSync(shimDir)) { fs.mkdirSync(shimDir, { recursive: true }); }
      fs.writeFileSync(shimPath, shim.content);
    }
  }

  private buildRulesContent(projectName: string, blueprint: Blueprint): string {
    return `# CHASSIS Project Rules — ${projectName}
> Auto-generated by CHASSIS. Read this file BEFORE making any changes.
> These rules apply to ALL AI editors: Windsurf, Cursor, Claude Code, Copilot, Gemini, and any other tool.
> CHASSIS does not need to be installed for these rules to apply. They are self-contained.

---

## Project Blueprint
- **WHO:** ${blueprint.who || '(not set)'}
- **WHAT:** ${blueprint.what || '(not set)'}
- **WHERE:** ${blueprint.where || '(not set)'}
- **WHEN:** ${blueprint.when || '(not set)'}
- **WHY:** ${blueprint.why || '(not set)'}

---

## MANDATORY — Documentation Protocol
**NO EXCEPTIONS. This applies to every change — code, comments, config, a single line edit, anything.**

### BEFORE touching any file:
1. Read \`CHASSIS_ROADMAP.md\` in full.

### AFTER EVERY change — no matter how small:
2. Open \`CHASSIS_ROADMAP.md\` and add an entry under "Recent Fixes":
   - Which file was changed and exactly what was changed
   - Why the change was made
   - Any risk introduced
3. Update the \`*Last updated:*\` line at the bottom with today's date and what you did.

### This means:
- Fixed a typo in a comment? Update the roadmap.
- Changed a variable name? Update the roadmap.
- Added a single log line? Update the roadmap.
- **There is no change too small to skip this step.**

> If CHASSIS is installed: "Done for Now" writes this automatically.
> If CHASSIS is NOT installed: update \`CHASSIS_ROADMAP.md\` manually before you stop.
> **Failure to do this breaks the project history chain for every future AI and human working on this project.**

---

## Annotation Tags
Use these in code comments. Wrong comment style = broken build (see Rule 7).
- \`[SCOPE]\` — what this file/section does. Required at top of every file.
- \`[TODO]\` — work to be done
- \`[WARN]\` — fragile or risky code. Read before touching.
- \`[NEXT]\` — where to pick up next session
- \`[DEAD]\` — tried and failed. Don't repeat it.
- \`[DONE]\` — completed. Leave for audit trail.

---

## Rules

### Rule 1: Never Remove Annotations
Annotation tags are the project's navigation system. NEVER delete, move, or modify them without reason.

### Rule 2: Read [SCOPE] Before Modifying Any File
Every file starts with [SCOPE]. Read it. If your change doesn't fit, you're in the wrong file.

### Rule 3: Read [WARN] Before Touching Flagged Code
[WARN] marks fragile code. Understand WHY before changing anything nearby.

### Rule 4: Follow [NEXT] Tags
[NEXT] tags tell you what should happen next. Follow them in order.

### Rule 5: Don't Repeat Dead Ends
[DEAD] documents what was tried and failed. Read before proposing solutions.

### Rule 6: Update Tags When You Make Changes
- Finished a [TODO]? Change to [DONE] with what you did.
- Found something fragile? Add [WARN].
- Leaving work incomplete? Add [NEXT].
- Tried something that failed? Add [DEAD].

### Rule 7: Correct Comment Syntax Per Language
ALWAYS use the correct comment character. NEVER use // in Python. NEVER use # in JavaScript.
  Python/Shell/YAML/Ruby:       # [TAG] description
  JavaScript/TypeScript/Go/etc: // [TAG] description
  HTML/XML:                     <!-- [TAG] description -->
  CSS/SCSS:                     /* [TAG] description */
  SQL/Lua:                      -- [TAG] description

### Rule 8: Don't Remove Code Without [DEAD] Logging
If you remove or replace a block, add [DEAD] explaining what was there and why.

### Rule 9: Keep Files Under 200 Lines
Files over 200 lines should be split. Add [NEXT] at natural split points.

### Rule 10: Check .chassis/ For Context
Before starting: read \`.chassis/blueprint.md\`, \`.chassis/work_log.md\`, \`CHASSIS_ROADMAP.md\`.

### Rule 11: Annotate All New Code
New file → [SCOPE] at top. New function → comment above it. Risky logic → [WARN]. Incomplete → [TODO] or [NEXT].

### Rule 12: No Orphan Code
Every new file needs [SCOPE]. Every feature must trace to the blueprint. If outside blueprint, add:
  [SCOPE] WARNING — Not in original blueprint. Added because: [reason]

---

*These rules are enforced by CHASSIS. Removing this file does not remove the rules — they are in .chassis/rules.md and every other AI editor config file in this project.*
`;
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

  // ── roadmap append ──

  appendRoadmap(sessionGoal: string, completed: string[], inProgress: string[], nextStart: string): void {
    const roadmap = this.roadmapPath;
    if (!fs.existsSync(roadmap)) { return; }
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const lines: string[] = [
      `## [${timestamp}] — Session End`,
      `- **Goal:** ${sessionGoal}`,
    ];
    if (completed.length > 0) lines.push(`- **Completed:** ${completed.join(', ')}`);
    if (inProgress.length > 0) lines.push(`- **In Progress:** ${inProgress.join(', ')}`);
    if (nextStart) lines.push(`- **Next session starts with:** ${nextStart}`);
    lines.push('');

    // Update the "Last updated" line
    let content = fs.readFileSync(roadmap, 'utf-8');
    const entry = lines.join('\n');
    // Insert before the last --- separator
    const lastSep = content.lastIndexOf('\n---\n');
    if (lastSep !== -1) {
      content = content.slice(0, lastSep) + '\n' + entry + '\n---\n' + content.slice(lastSep + 5);
    } else {
      content += '\n' + entry;
    }
    // Refresh last updated line
    content = content.replace(/\*Last updated:.*?\*$/m, `*Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} — Session: ${sessionGoal}*`);
    fs.writeFileSync(roadmap, content);
  }

  // ── dead end append ──

  appendDeadEnd(attempted: string, failedBecause: string, lesson: string): void {
    if (!fs.existsSync(this.deadendsPath)) { return; }
    const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const entry = `## [${timestamp}] — Dead End\n- **Attempted:** ${attempted}\n- **Failed because:** ${failedBecause}\n- **Lesson:** ${lesson}\n\n`;
    fs.appendFileSync(this.deadendsPath, entry);
  }
}
