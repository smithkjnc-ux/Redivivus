// [SCOPE] Workspace Context Service — find best target file for a modification request
import * as path from 'path';
import type { WorkspaceContext } from './workspaceContext.js';

export function findBestTargetForModification(
  context: WorkspaceContext,
  task: string
): { targetFile: string | null; reason: string } {
  const taskLower = task.toLowerCase();

  const fileMention = task.match(/\b([\w\-]+)\.(html|ts|tsx|js|jsx|py|rs|go|css|scss)\b/i);
  if (fileMention) {
    const mentionedFile = fileMention[0];
    const mentionedFileLower = mentionedFile.toLowerCase();
    const found = context.files.find(f =>
      f.relativePath.toLowerCase().endsWith(mentionedFileLower) ||
      f.relativePath.toLowerCase() === mentionedFileLower
    );
    if (found) { return { targetFile: found.relativePath, reason: `User mentioned "${mentionedFile}"` }; }
  }

  for (const recent of context.recentlyModified) {
    const recentExt = path.extname(recent).toLowerCase();
    if (taskLower.includes('html') && recentExt === '.html') {
      return { targetFile: recent, reason: 'Recently modified HTML file matching task' };
    }
    if ((taskLower.includes('style') || taskLower.includes('css')) && (recentExt === '.css' || recentExt === '.scss')) {
      return { targetFile: recent, reason: 'Recently modified stylesheet' };
    }
    if (taskLower.includes('component') && (recentExt === '.tsx' || recentExt === '.jsx')) {
      return { targetFile: recent, reason: 'Recently modified component file' };
    }
  }

  if (context.entryPoints.length > 0) {
    return { targetFile: context.entryPoints[0], reason: 'Main entry point of project' };
  }

  if (context.recentlyModified.length > 0) {
    return { targetFile: context.recentlyModified[0], reason: 'Most recently modified file' };
  }

  return { targetFile: null, reason: 'No suitable target found' };
}
