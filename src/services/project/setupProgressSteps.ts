// [SCOPE] Setup Progress Step Checkers — 10 step-check functions for SetupProgressService
// Extracted from setupProgressService.ts to keep it under 200 lines.

import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import type { RedivivusService } from '../redivivusService.js';
import type { SetupStep } from './setupProgressService.js';
import { getResolvedPaths } from '../resolvedItems.js';

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
  if (!redivivus.isInitialized()) { return { id: 3, title: 'Blueprint locked', completed: false, inProgress: false }; }
  const locked = redivivus.loadConfig()?.blueprint?.locked === true;
  return { id: 3, title: 'Blueprint locked', completed: locked, inProgress: false, action: locked ? undefined : 'Run "lock blueprint" to lock your blueprint' };
}

export async function checkStep4({ root }: Ctx): Promise<SetupStep> {
  const ruleFiles = ['.cursorrules', '.windsurfrules', 'CLAUDE.md', 'GEMINI.md', '.clinerules'];
  const results = await Promise.all(ruleFiles.map(f => pathExists(path.join(root, f))));
  const completed = results.every(Boolean);
  return { id: 4, title: 'Editor rules generated (.cursorrules, CLAUDE.md, etc.)', completed, inProgress: false, action: completed ? undefined : 'Run "generate rules" to create editor shim files' };
}

export async function checkStep5({ redivivus }: Ctx): Promise<SetupStep> {
  if (!redivivus.isInitialized()) { return { id: 5, title: 'Project scanned', completed: false, inProgress: false }; }
  const hasScan = !!redivivus.loadConfig()?.lastScan;
  // [FIX] Step 5 tracks only "was a scan run" — large files/TODOs/[SCOPE] are steps 6/7/8
  return { id: 5, title: 'Project scanned', completed: hasScan, inProgress: false, action: hasScan ? undefined : 'Run "scan project" to analyze your codebase' };
}

export async function checkStep6({ redivivus }: Ctx): Promise<SetupStep> {
  if (!redivivus.isInitialized()) { return { id: 6, title: 'All files under 200 lines', completed: false, inProgress: false }; }
  const allLarge: Array<{ relativePath?: string } | string> = redivivus.loadConfig()?.scanResults?.largeFiles || [];
  const resolvedSet = getResolvedPaths('largeFile');
  const remaining = allLarge.filter(f => !resolvedSet.has(typeof f === 'string' ? f : (f.relativePath || '')));
  const largeFiles = remaining.length;
  return { id: 6, title: 'All files under 200 lines', completed: largeFiles === 0, inProgress: false, action: largeFiles === 0 ? undefined : `Split ${largeFiles} large file${largeFiles > 1 ? 's' : ''} into smaller files` };
}

export async function checkStep7({ redivivus }: Ctx): Promise<SetupStep> {
  if (!redivivus.isInitialized()) { return { id: 7, title: 'All files have [SCOPE] tags', completed: false, inProgress: false }; }
  const uncommented = redivivus.loadConfig()?.scanResults?.uncommented?.length || 0;
  return { id: 7, title: 'All files have [SCOPE] tags', completed: uncommented === 0, inProgress: false, action: uncommented === 0 ? undefined : `Add [SCOPE] tags to ${uncommented} file${uncommented > 1 ? 's' : ''}` };
}

export async function checkStep8({ redivivus }: Ctx): Promise<SetupStep> {
  if (!redivivus.isInitialized()) { return { id: 8, title: 'All TODOs converted to Redivivus format', completed: false, inProgress: false }; }
  const todos = redivivus.loadConfig()?.scanResults?.todos?.length || 0;
  return { id: 8, title: 'All TODOs converted to Redivivus format', completed: todos === 0, inProgress: false, action: todos === 0 ? undefined : `Convert ${todos} TODO${todos > 1 ? 's' : ''} to Redivivus format` };
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
