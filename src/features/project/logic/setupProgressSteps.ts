// [SCOPE] Setup Progress Step Checkers — 10 step-check functions for SetupProgressService
// Extracted from setupProgressService.ts to keep it under 200 lines.

import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { SetupStep } from './setupProgressService.js';


type Ctx = { redivivus: RedivivusService; root: string };

async function pathExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

export async function checkStep1({ root }: Ctx): Promise<SetupStep> {
  const exists = await pathExists(path.join(root, '.redivivus'));
  return { id: 1, title: 'Project initialized (.redivivus/ created)', completed: exists, inProgress: false, action: exists ? undefined : 'Run "new project" or "retrofit project" to initialize' };
}

export async function checkStep2({ redivivus }: Ctx): Promise<SetupStep> {
  if (!redivivus.isInitialized()) { return { id: 2, title: "Blueprint completed (5 W's answered)", completed: false, inProgress: false }; }
  const has = !!redivivus.loadConfig()?.blueprint;
  return { id: 2, title: "Blueprint completed (5 W's answered)", completed: has, inProgress: false, action: has ? undefined : 'Run "open blueprint" to complete the 5 Ws interview' };
}

export async function checkStep3({ redivivus }: Ctx): Promise<SetupStep> {
  if (!redivivus.isInitialized()) { return { id: 3, title: 'Blueprint revision active', completed: false, inProgress: false }; }
  const bp = redivivus.loadConfig()?.blueprint;
  const hasRevision = !!(bp && bp.revision && bp.revision >= 1);
  return { id: 3, title: 'Blueprint revision active', completed: hasRevision, inProgress: false, action: hasRevision ? undefined : 'Complete the blueprint interview to start revision tracking' };
}

export async function checkStep4({ root }: Ctx): Promise<SetupStep> {
  // Editor shim files are opt-in now. The canonical rules live in .redivivus/rules.md — that's what
  // this step verifies. Editor-specific files (CLAUDE.md, .cursorrules, etc.) are configured separately.
  const completed = await pathExists(path.join(root, '.redivivus', 'rules.md'));
  return { id: 4, title: 'Project rules generated (.redivivus/rules.md)', completed, inProgress: false, action: completed ? undefined : 'Run "generate rules" to create the project rules' };
}

export async function checkStep5({ redivivus }: Ctx): Promise<SetupStep> {
  if (!redivivus.isInitialized()) { return { id: 5, title: 'Project scanned', completed: false, inProgress: false }; }
  const hasScan = !!redivivus.loadConfig()?.lastScan;
  // [FIX] Step 5 tracks only "was a scan run" — large files/TODOs/[SCOPE] are steps 6/7/8
  return { id: 5, title: 'Project scanned', completed: hasScan, inProgress: false, action: hasScan ? undefined : 'Run "scan project" to analyze your codebase' };
}

export async function checkStep6({ redivivus, root }: Ctx): Promise<SetupStep> {
  // First build completed — at least one entry in build history
  if (!redivivus.isInitialized()) { return { id: 6, title: 'First build completed', completed: false, inProgress: false }; }
  let hasBuilds = false;
  try {
    const histPath = path.join(root, '.redivivus', 'build_history.json');
    const content = await fs.readFile(histPath, 'utf-8');
    const entries = JSON.parse(content);
    hasBuilds = Array.isArray(entries) && entries.length > 0;
  } catch { /* no history yet */ }
  return { id: 6, title: 'First build completed', completed: hasBuilds, inProgress: false, action: hasBuilds ? undefined : 'Ask Redivivus to build something to complete this step' };
}

export async function checkStep7({ root }: Ctx): Promise<SetupStep> {
  // Architecture map generated — .redivivus/map.json exists
  const mapExists = await pathExists(path.join(root, '.redivivus', 'map.json'));
  return { id: 7, title: 'Architecture map generated', completed: mapExists, inProgress: false, action: mapExists ? undefined : 'Open the Map panel to generate an architecture map' };
}

export async function checkStep8({ redivivus }: Ctx): Promise<SetupStep> {
  // Code health baseline — scan has been run (file/scope/todo analysis done)
  if (!redivivus.isInitialized()) { return { id: 8, title: 'Code health baseline established', completed: false, inProgress: false }; }
  const hasScan = !!redivivus.loadConfig()?.scanResults;
  return { id: 8, title: 'Code health baseline established', completed: hasScan, inProgress: false, action: hasScan ? undefined : 'Run "scan project" to establish a code health baseline' };
}

export async function checkStep9({ redivivus, root }: Ctx): Promise<SetupStep> {
  if (!redivivus.isInitialized()) { return { id: 9, title: 'First session completed', completed: false, inProgress: false }; }
  const config = redivivus.loadConfig();
  // Check config sessions, work_log, or manual override
  const hasSessions = !!(config?.sessions?.length);
  const manualDone = !!(config?.manualCompletedSteps as number[] | undefined)?.includes(9);
  let hasWorkLogSession = false;
  try {
    const wl = await fs.readFile(path.join(root, '.redivivus', 'work_log.md'), 'utf-8');
    hasWorkLogSession = wl.includes('Session Start');
  } catch { /* work_log.md missing — ignore */ }
  const done = hasSessions || hasWorkLogSession || manualDone;
  return { id: 9, title: 'First session completed', completed: done, inProgress: false, action: done ? undefined : 'Run "start session" to begin tracking your work' };
}

export async function checkStep10({ root }: Ctx): Promise<SetupStep> {
  // [FIX] Save points are git commits, not config.savePoints (that field never existed)
  let hasSavePoints = false;
  try {
    const out = execSync('git log --oneline --grep="Save Point:" -1', { cwd: root, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    hasSavePoints = out.trim().length > 0;
  } catch { /* not a git repo or no commits */ }
  return { id: 10, title: 'First save point created', completed: hasSavePoints, inProgress: false, action: hasSavePoints ? undefined : 'Run "create save point" to save your progress' };
}
