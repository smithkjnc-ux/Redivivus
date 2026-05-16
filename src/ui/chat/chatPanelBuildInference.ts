// [SCOPE] CHASSIS Build Pipeline — Inference helpers (target detection, extension inference)
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceContextService } from '../../services/workspace/workspaceContext.js';
import type { RoutingService } from '../../services/ai/routingService.js';

export function isWebPageTask(taskLow: string): boolean {
  return /\bweb\s*page\b|\bwebsite\b|\bhtml\s*page\b|\bstatic\s*site\b/.test(taskLow)
    || (taskLow.includes('html') && !taskLow.includes('component') && !taskLow.includes('template'));
}

// [RULE 18] AI classifier — regex cannot reliably detect modification phrasing.
// Fast paths handle obvious cases; AI handles "make them realistic", "improve the sounds", etc.
export async function isModificationRequest(taskLow: string, routing: RoutingService): Promise<boolean> {
  // Fast path: unambiguous modification verbs
  if (/\b(modify|update|change\s+(in|the)|fix\s+(in|the)|extend\s+(the|this)|this\s+(program|file|code|app)|existing|current\s+(file|code)|add\s+(to|another|more))\b/.test(taskLow)) {
    return true;
  }
  // Fast path: explicit file extension reference (e.g. "update index.html")
  if (/\b[\w/-]+\.(ts|tsx|js|jsx|py|html|css|json|go|rs)\b/i.test(taskLow)) {
    return true;
  }
  // AI classifier for natural follow-up phrasing regex cannot reliably catch
  try {
    const prompt = `Is this a request to MODIFY an existing file, or BUILD something new?\nTask: "${taskLow.slice(0, 200)}"\nReply with exactly one word: modify or new`;
    const res = await routing.prompt(prompt, 12_000);
    if (res.success && res.text) { return res.text.trim().toLowerCase().startsWith('modify'); }
  } catch { /* fall through to safe default */ }
  return false;
}

export async function findExistingTarget(root: string, task: string): Promise<string | null> {
  const taskLower = task.toLowerCase();
  if (!fs.existsSync(root)) return null;

  if (/\b(button|page|html|ui|interface|form|input|div|span|style|css)\b/.test(taskLower)) {
    const htmlCandidates = ['index.html', 'src/index.html', 'public/index.html'];
    for (const c of htmlCandidates) {
      const p = path.join(root, c);
      if (fs.existsSync(p)) return p;
    }
  }

  const contextService = getWorkspaceContextService();
  const context = await contextService.getContext();
  if (context) {
    const { targetFile } = contextService.findBestTargetForModification(context, task);
    if (targetFile) return path.join(root, targetFile);
  }

  const common = ['index.ts', 'src/index.ts', 'src/App.tsx', 'main.py', 'app.py'];
  for (const c of common) {
    const p = path.join(root, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function inferExtension(taskLow: string, where: string): string {
  if (taskLow.includes('.py')) return '.py';
  if (taskLow.includes('.rs')) return '.rs';
  if (isWebPageTask(taskLow)) return '.html';
  if (taskLow.includes('css')) return '.css';
  if (taskLow.includes('tsx') || where.includes('react')) return '.tsx';
  if (where.includes('python')) return '.py';
  if (where.includes('web')) return '.html';
  return '.ts';
}

// [RULE 18] AI for understanding, code for execution.
// Uses a 50-token AI call to derive a semantic filename from the task description.
// Falls back to word-filter regex only if the AI call fails.
export async function deriveFileBase(task: string, routing: RoutingService): Promise<string> {
  try {
    const prompt = `Task: "${task.slice(0, 200)}"\n\nReply with ONLY a snake_case filename base (no extension, no path, 1-3 words) that describes what this code does — its PURPOSE, not the request verbs. Example: profit_calculator, todo_app, file_sorter. Reply with nothing else.`;
    const res = await routing.prompt(prompt, 12_000);
    if (res.success && res.text) {
      const cleaned = res.text.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '');
      if (cleaned.length >= 2 && cleaned.length <= 40) return cleaned;
    }
  } catch { /* fall through to regex fallback */ }
  const stop = new Set(['build','create','make','write','add','generate','implement','i','need','want','require','a','an','the','me','my','new']);
  const words = task.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 1 && !stop.has(w));
  return words.slice(0, 3).join('_') || 'output';
}
