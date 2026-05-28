// [SCOPE] Redivivus initialization — initProject and scaffoldAt for creating .redivivus/ structure
// Called by redivivusService orchestrator. No config read/write, rules, or logging logic here.

import * as fs from 'fs';
import * as path from 'path';
import type { Blueprint } from '../../types/index.js';
import { RedivivusPaths } from './redivivusPaths.js';
import { generateRules } from '../redivivusRules';

export async function initProject(paths: RedivivusPaths, projectName: string): Promise<void> {
  const root = paths.getWorkspaceRoot();
  if (!root) {
    throw new Error('No workspace folder open');
  }

  // create .redivivus/ structure
  const dirs = [paths.redivivusDir, paths.sessionsDir];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const emptyBlueprint: Blueprint = {
    who: 'User', 
    what: projectName, 
    where: 'Web-based / Local', 
    when: today, 
    why: 'General utility or entertainment',
    health: { confirmed: 1, assumed: 4, unknown: 0, confidence: 'low' },
    locked: false,
    version: '1.0',
  };

  const config = {
    projectName,
    createdAt: new Date().toISOString(),
    version: '0.1.0',
    blueprint: emptyBlueprint,
    sessions: [],
  };

  fs.writeFileSync(paths.configPath, JSON.stringify(config, null, 2));

  // create work_log.md
  const worklogHeader = `# WORK_LOG — ${projectName}\n\nAuto-managed by Redivivus. Append-only session history.\n\n---\n\n`;
  fs.writeFileSync(paths.worklogPath, worklogHeader);

  // create dead_ends.md
  const deadendsHeader = `# Dead End Log — ${projectName}\n\nThings that didn't work and why. Learn from these.\n\n---\n\n`;
  fs.writeFileSync(paths.deadendsPath, deadendsHeader);

  // create blueprint.md placeholder
  const bpHeader = `# Blueprint — ${projectName}\n\n## WHO\n${emptyBlueprint.who}\n\n## WHAT\n${emptyBlueprint.what}\n\n## WHERE\n${emptyBlueprint.where}\n\n## WHEN\n${emptyBlueprint.when}\n\n## WHY\n${emptyBlueprint.why}\n`;
  fs.writeFileSync(paths.blueprintPath, bpHeader);

  // add .redivivus/ to .gitignore if it contains sessions (but keep blueprint and work_log)
  await updateGitignore(root);

  // ── scaffold basic project structure ──
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
    fs.writeFileSync(readmePath, `# ${projectName}\n\n> Scaffolded by Redivivus.\n\n## Getting Started\n- Edit your blueprint in \`.redivivus/blueprint.md\`\n- Log work in \`.redivivus/work_log.md\`\n- Track dead ends in \`.redivivus/dead_ends.md\`\n`);
  }

  // generate Redivivus shim files immediately
  generateRules(paths, projectName, emptyBlueprint);
}

export { scaffoldAt } from './redivivusScaffold.js';

async function updateGitignore(root: string): Promise<void> {
  const gitignorePath = path.join(root, '.gitignore');
  const entry = '\n# Redivivus session data (blueprints and logs are tracked)\n.redivivus/sessions/\n';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.redivivus/sessions/')) {
      fs.appendFileSync(gitignorePath, entry);
    }
  } else {
    fs.writeFileSync(gitignorePath, entry);
  }
}
