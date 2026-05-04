// [SCOPE] CHASSIS initialization — initProject and scaffoldAt for creating .chassis/ structure
// Called by chassisService orchestrator. No config read/write, rules, or logging logic here.

import * as fs from 'fs';
import * as path from 'path';
import { Blueprint } from '../types/index.js';
import { ChassisPaths } from './chassisPaths.js';
import { generateRules } from './chassisRules';

export async function initProject(paths: ChassisPaths, projectName: string): Promise<void> {
  const root = paths.getWorkspaceRoot();
  if (!root) {
    throw new Error('No workspace folder open');
  }

  // create .chassis/ structure
  const dirs = [paths.chassisDir, paths.sessionsDir];
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

  const config = {
    projectName,
    createdAt: new Date().toISOString(),
    version: '0.1.0',
    blueprint: emptyBlueprint,
    sessions: [],
  };

  fs.writeFileSync(paths.configPath, JSON.stringify(config, null, 2));

  // create work_log.md
  const worklogHeader = `# WORK_LOG — ${projectName}\n\nAuto-managed by CHASSIS. Append-only session history.\n\n---\n\n`;
  fs.writeFileSync(paths.worklogPath, worklogHeader);

  // create dead_ends.md
  const deadendsHeader = `# Dead End Log — ${projectName}\n\nThings that didn't work and why. Learn from these.\n\n---\n\n`;
  fs.writeFileSync(paths.deadendsPath, deadendsHeader);

  // create blueprint.md placeholder
  const bpHeader = `# Blueprint — ${projectName}\n\n🔶 Blueprint not yet completed. Run "CHASSIS: Run Blueprint Interview" to fill this in.\n\n---\n\n`;
  fs.writeFileSync(paths.blueprintPath, bpHeader);

  // add .chassis/ to .gitignore if it contains sessions (but keep blueprint and work_log)
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
    fs.writeFileSync(readmePath, `# ${projectName}\n\n> Scaffolded by CHASSIS.\n\n## Getting Started\n- Edit your blueprint in \`.chassis/blueprint.md\`\n- Log work in \`.chassis/work_log.md\`\n- Track dead ends in \`.chassis/dead_ends.md\`\n`);
  }

  // generate CHASSIS shim files immediately
  generateRules(paths, projectName, emptyBlueprint);
}

export async function scaffoldAt(targetPath: string, projectName: string, blueprint?: Blueprint): Promise<void> {
  const paths = new ChassisPaths(targetPath);
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

  const config = {
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
  generateRules(paths, projectName, bp, targetPath);

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

async function updateGitignore(root: string): Promise<void> {
  const gitignorePath = path.join(root, '.gitignore');
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
