// [SCOPE] Redivivus scaffolding — scaffoldAt for creating .redivivus/ structure idempotently
import * as fs from 'fs';
import * as path from 'path';
import type { Blueprint } from '../../../types/index.js';
import { RedivivusPaths } from './redivivusPaths.js';
import { generateRules } from '../../../services/redivivusRules.js';

export async function scaffoldAt(targetPath: string, projectName: string, blueprint?: Blueprint): Promise<void> {
  const paths = new RedivivusPaths(targetPath);
  const redivivusDir = path.join(targetPath, '.redivivus');
  const sessionsDir = path.join(redivivusDir, 'sessions');

  fs.mkdirSync(redivivusDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  // [MARKER] Drop the project marker FIRST so this folder is recognised as a project the instant it exists —
  // before the rest of the scaffold (config, blueprint, src…) is written. See projectResolver.
  require('./projectResolver.js').writeProjectMarker(targetPath, projectName);

  const today = new Date().toISOString().slice(0, 10);
  const bp: Blueprint = blueprint ? {
    who: blueprint.who || 'User', 
    what: blueprint.what || projectName, 
    where: blueprint.where || 'Web-based / Local',
    when: blueprint.when || today, 
    why: blueprint.why || 'General utility or entertainment',
    health: { confirmed: 0, assumed: 0, unknown: 0, confidence: 'low' as const },
    locked: false, version: '1.0', revision: 1,
  } : {
    who: 'User', 
    what: projectName, 
    where: 'Web-based / Local', 
    when: today, 
    why: 'General utility or entertainment',
    health: { confirmed: 1, assumed: 4, unknown: 0, confidence: 'low' as const },
    locked: false, version: '1.0', revision: 1,
  };

  // If blueprint provided, compute health scores
  if (blueprint) {
    let confirmed = 0, assumed = 0, unknown = 0;
    for (const key of ['who', 'what', 'where', 'when', 'why'] as const) {
      const val = (blueprint[key] || '').trim();
      if (val.length > 20) {confirmed++;}
      else if (val.length > 0) {assumed++;}
      else {unknown++;}
    }
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (unknown === 0 && assumed <= 1) {confidence = 'high';}
    else if (unknown <= 1) {confidence = 'medium';}
    bp.health = { confirmed, assumed, unknown, confidence };
  }

  const config = {
    projectName,
    createdAt: new Date().toISOString(),
    version: '0.1.0',
    blueprint: bp,
    sessions: [],
  };

  // [WARN] All writes below are guarded — scaffoldAt must be idempotent so calling it on
  // an existing project never overwrites config, logs, or blueprint the user has edited.
  const configPath = path.join(redivivusDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  const worklogPath = path.join(redivivusDir, 'work_log.md');
  if (!fs.existsSync(worklogPath)) {
    const worklogHeader = `# WORK_LOG — ${projectName}\n\nAuto-managed by Redivivus. Append-only session history.\n\n---\n\n`;
    fs.writeFileSync(worklogPath, worklogHeader);
  }

  const deadendsPath = path.join(redivivusDir, 'dead_ends.md');
  if (!fs.existsSync(deadendsPath)) {
    const deadendsHeader = `# Dead End Log — ${projectName}\n\nThings that didn't work and why. Learn from these.\n\n---\n\n`;
    fs.writeFileSync(deadendsPath, deadendsHeader);
  }

  const bpFilePath = path.join(redivivusDir, 'blueprint.md');
  if (!fs.existsSync(bpFilePath)) {
    const bpMd = `# Blueprint — ${projectName}\n\n## WHO\n${bp.who}\n\n## WHAT\n${bp.what}\n\n## WHERE\n${bp.where}\n\n## WHEN\n${bp.when}\n\n## WHY\n${bp.why}\n`;
    fs.writeFileSync(bpFilePath, bpMd);
  }

  // [BUILD CONTRACT] Do NOT pre-create empty src/tests/docs — this is the SECOND copy of that code (the first was
  // in redivivusInit.ts). scaffoldAt() is the path most builds actually use, which is why the folders were still
  // empty after the init fix. The build now creates + fills real folders on demand. NO EMPTY FOLDERS.
  // [DEAD] Removed: unconditional mkdir of src/, tests/, docs/.

  const readmePath = path.join(targetPath, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `# ${projectName}\n\n> Scaffolded by Redivivus.\n\n## Getting Started\n- Edit your blueprint in \`.redivivus/blueprint.md\`\n- Log work in \`.redivivus/work_log.md\`\n- Track dead ends in \`.redivivus/dead_ends.md\`\n`);
  }

  // rules + shims
  generateRules(paths, projectName, bp, targetPath);

  // update .gitignore at target path
  const gitignorePath = path.join(targetPath, '.gitignore');
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
