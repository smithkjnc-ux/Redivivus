// [SCOPE] CHASSIS Build Pipeline — Inference helpers (target detection, extension inference)
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceContextService } from '../services/workspaceContext.js';

export function isWebPageTask(taskLow: string): boolean {
  return /\bweb\s*page\b|\bwebsite\b|\bhtml\s*page\b|\bstatic\s*site\b/.test(taskLow)
    || (taskLow.includes('html') && !taskLow.includes('component') && !taskLow.includes('template'));
}

export function isModificationRequest(taskLow: string): boolean {
  return /\b(add\s+(to|another|more)|modify|update|change\s+(in|the)|fix\s+(in|the)|extend\s+(the|this)|this\s+(program|file|code|app)|existing|current\s+(file|code))\b/.test(taskLow);
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

export function deriveFileBase(taskLow: string): string {
  const stop = new Set(['build','create','make','write','add','generate','implement']);
  const words = taskLow.replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 1 && !stop.has(w));
  return words.slice(0, 3).join('_') || 'output';
}
