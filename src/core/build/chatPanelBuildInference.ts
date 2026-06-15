// [SCOPE] Redivivus Build Pipeline — Inference helpers (target detection, extension inference)
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceContextService } from '../../services/workspace/workspaceContext';
import type { RoutingService } from '../../services/ai/routingService';

import type { UsageTracker } from '../../services/usageTracker';

export function isWebPageTask(taskLow: string): boolean {
  return /\bweb\s*page\b|\bwebsite\b|\bhtml\s*page\b|\bstatic\s*site\b/.test(taskLow)
    || (taskLow.includes('html') && !taskLow.includes('component') && !taskLow.includes('template'));
}

// [RULE 18] AI classifier — regex cannot reliably detect modification phrasing.
// Fast paths handle obvious cases; AI handles "make them realistic", "improve the sounds", etc.
export async function isModificationRequest(taskLow: string, routing: RoutingService, usageTracker?: UsageTracker): Promise<boolean> {
  // Fast path: unambiguous modification verbs
  if (/\b(modify|update|change\s+(in|the)|fix\s+(in|the|it|this)|extend\s+(the|this)|this\s+(program|file|code|app)|existing|current\s+(file|code)|add\s+(to|another|more)|white\s+screen|blank\s+screen|not\s+working|broken|bug)\b/.test(taskLow)) {
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
    if (usageTracker && res.inputTokens) {
      usageTracker.recordUsage(Math.ceil((res.inputTokens + (res.outputTokens || 0)) / 4), 0, (res.model && res.model !== 'none') ? res.model : routing.getAvailableAI().ai, res.inputTokens, res.outputTokens, 'supervisor');
    }
    if (res.success && res.text) { return res.text.trim().toLowerCase().startsWith('modify'); }
  } catch { /* fall through to safe default */ }
  return false;
}

export async function isConversationalQuestion(taskLow: string, routing: RoutingService, usageTracker?: UsageTracker): Promise<boolean> {
  // Fast path: obvious WH-questions that aren't masking build/fix commands
  const _buildFix = /\b(build|create|make|write|generate|add|update|remove|delete|edit|change|fix|repair|broken|bug)\b/i;
  if (/^(why|what|how|explain|tell\s+me|where\s+is|who\s+is)\b/i.test(taskLow) && !_buildFix.test(taskLow)) {
    return true;
  }
  
  // Fast path: capability questions based on grammatical interrogatives (Modal + Subject)
  // This gracefully catches "can you", "can a AI", "could we", "will the system", "should I", "are you"
  if (/^(can|could|would|will|should|are)\s+(you|we|i|an?|the|this|that|someone|anyone)\b/i.test(taskLow)) {
    return true;
  }
  
  // Fast path: complex hypothetical and capability wrappers
  if (/^(are\s+you\s+able\s+to|do\s+you\s+know\s+how\s+to|is\s+it\s+possible\s+to|are\s+you\s+capable\s+of|do\s+you\s+think\s+you\s+can|how\s+would\s+you|how\s+do\s+(you|i)|how\s+can\s+(you|i)|what\s+if\s+i|what\s+would\s+happen|if\s+i\s+asked)\b/i.test(taskLow)) {
    return true;
  }
  
  // AI classifier for nuance: "can you make a checkers game?" vs "make a checkers game"
  try {
    const prompt = `Analyze this user message: "${taskLow.slice(0, 200)}"\nIs the user asking a conversational question (e.g., asking about your capabilities, asking "can you do X?"), or are they giving an explicit command to take action right now? Reply with exactly one word: question or command`;
    const res = await routing.prompt(prompt, 10000);
    if (usageTracker && res.inputTokens) {
      usageTracker.recordUsage(Math.ceil((res.inputTokens + (res.outputTokens || 0)) / 4), 0, (res.model && res.model !== 'none') ? res.model : routing.getAvailableAI().ai, res.inputTokens, res.outputTokens, 'supervisor');
    }
    if (res.success && res.text) { return res.text.trim().toLowerCase().startsWith('question'); }
  } catch { /* fall through */ }
  return false;
}

export async function findExistingTarget(root: string, task: string): Promise<string | null> {
  const taskLower = task.toLowerCase();
  if (!fs.existsSync(root)) {return null;}

  if (/\b(button|page|html|ui|interface|form|input|div|span|style|css)\b/.test(taskLower)) {
    const htmlCandidates = ['index.html', 'src/index.html', 'public/index.html'];
    for (const c of htmlCandidates) {
      const p = path.join(root, c);
      if (fs.existsSync(p)) {return p;}
    }
  }

  const contextService = getWorkspaceContextService();
  const context = await contextService.getContext();
  if (context) {
    const { targetFile } = contextService.findBestTargetForModification(context, task);
    if (targetFile) {return path.join(root, targetFile);}
  }

  const common = ['index.ts', 'src/index.ts', 'src/App.tsx', 'main.py', 'app.py'];
  for (const c of common) {
    const p = path.join(root, c);
    if (fs.existsSync(p)) {return p;}
  }
  return null;
}

export function inferExtension(taskLow: string, where: string): string {
  // Explicit extension in task
  if (taskLow.includes('.py'))  {return '.py';}
  if (taskLow.includes('.rs'))  {return '.rs';}
  if (taskLow.includes('.go'))  {return '.go';}
  if (taskLow.includes('.cpp') || taskLow.includes('c++')) {return '.cpp';}
  if (/\bc file\b|\.c\b/.test(taskLow)) {return '.c';}
  if (taskLow.includes('.java') && !taskLow.includes('javascript')) {return '.java';}
  if (taskLow.includes('.rb'))  {return '.rb';}
  if (taskLow.includes('.sh'))  {return '.sh';}

  // Web targets always go HTML/CSS/TS
  if (isWebPageTask(taskLow)) {return '.html';}
  if (taskLow.includes('css')) {return '.css';}
  if (taskLow.includes('tsx') || where.includes('react')) {return '.tsx';}

  // [RULE 18] Natural language language detection — keywords are unambiguous enough for fast-path
  if (/\b(python|pygame|flask|django|fastapi|numpy|pandas|matplotlib|tkinter)\b/.test(taskLow) || where.includes('python')) {return '.py';}
  if (/\b(rust|cargo|rustlang)\b/.test(taskLow) || where.includes('rust')) {return '.rs';}
  if (/\b(golang|go\s+(program|app|cli|tool|lang|binary))\b/.test(taskLow) || where.includes('go lang')) {return '.go';}
  if (/\b(c\+\+|cpp|cmake|sfml)\b/.test(taskLow)) {return '.cpp';}
  if (/\b(c\s+program|c\s+code|ansi\s+c|gcc\s)\b/.test(taskLow)) {return '.c';}
  if (/\b(java\s|spring|maven|gradle)\b/.test(taskLow) && !taskLow.includes('javascript')) {return '.java';}
  if (/\b(ruby|rails|gem)\b/.test(taskLow)) {return '.rb';}
  if (/\b(bash|shell\s+script|zsh)\b/.test(taskLow)) {return '.sh';}

  // [FIX] Explicit exe/CLI request overrides blueprint 'where: web browser' — user intent wins.
  // Must come BEFORE the where.includes('web') fallback or it gets swallowed by the blueprint field.
  if (/\b(exe|\.exe|executable|standalone|command.?line|run.*terminal|terminal.*run|desktop\s+app|native\s+app|binary)\b/i.test(taskLow)) {
    // Prefer Python for games; Go for CLI tools; Python as safe general default
    if (/\b(game|pygame|arcade|snake|tetris|flappy|pong|pacman|platformer)\b/.test(taskLow)) {return '.py';}
    if (/\b(cli|tool|utility|script|automation)\b/.test(taskLow)) {return '.py';}
    return '.py';
  }

  if (where.includes('web')) {return '.html';}
  return '.ts';
}

// [RULE 18] AI for understanding, code for execution.
// Uses a 50-token AI call to derive a semantic filename from the task description.
// Falls back to word-filter regex only if the AI call fails.
export async function deriveFileBase(task: string, routing: RoutingService, usageTracker?: UsageTracker): Promise<string> {
  try {
    const prompt = `Task: "${task.slice(0, 200)}"\n\nReply with ONLY a snake_case filename base (no extension, no path, 1-3 words) that describes what this code does — its PURPOSE, not the request verbs. Example: profit_calculator, todo_app, file_sorter. Reply with nothing else.`;
    const res = await routing.prompt(prompt, 12_000);
    if (usageTracker && res.inputTokens) {
      usageTracker.recordUsage(Math.ceil((res.inputTokens + (res.outputTokens || 0)) / 4), 0, (res.model && res.model !== 'none') ? res.model : routing.getAvailableAI().ai, res.inputTokens, res.outputTokens, 'supervisor');
    }
    if (res.success && res.text) {
      const cleaned = res.text.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '');
      if (cleaned.length >= 2 && cleaned.length <= 40) {return cleaned;}
    }
  } catch { /* fall through to regex fallback */ }
  const stop = new Set(['build','create','make','write','add','generate','implement','i','need','want','require','a','an','the','me','my','new']);
  const words = task.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 1 && !stop.has(w));
  return words.slice(0, 3).join('_') || 'output';
}

/**
 * Extracts runnable code from an AI response that may contain prose and/or markdown fences.
 * Three-stage fallback:
 *   1. Largest closed fence block (``` ... ```) — handles prose before/after code
 *   2. Everything after the first ``` fence — handles missing closing fence
 *   3. Raw text as-is — no fences at all
 * [FIX] Stage 1 only works when the AI includes a closing fence. Without it, stage 2
 *       finds the first ``` and slices from there, discarding any prose preamble.
 *       The old single-replace fallback left prose text intact when no closing fence existed.
 */
export function extractCodeFromResponse(text: string): string {
  // Stage 1: find all properly closed fence blocks, return the largest
  const blocks: string[] = [];
  const fenceRe = /```(?:[a-zA-Z0-9]*)[ \t]*(?:[^\n]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) { blocks.push(m[1]); }
  if (blocks.length > 0) {
    return blocks.reduce((a, b) => a.length >= b.length ? a : b).trim();
  }
  // Stage 2: no closing fence — slice from first ``` onward and strip the fence line
  const fenceIdx = text.indexOf('```');
  if (fenceIdx !== -1) {
    return text.slice(fenceIdx).replace(/^```[a-zA-Z0-9]*\n?/, '').trim();
  }
  // Stage 3: no fences at all — return as-is
  return text.trim();
}
