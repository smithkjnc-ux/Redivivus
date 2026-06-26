// [SCOPE] Context-aware routing guard — enforces project-open/closed rules before any intent is dispatched.
// "Certain things can and cannot be done inside an open project and vice-versa." — PapaJoe
//
// RULES:
//   Project IS open:   fix/edit/add/review = OK. New standalone BUILD = blocked (offer options).
//   Project NOT open:  new BUILD = OK.  fix/edit/add = blocked (nothing to fix).
//   Compound escape:   "open X and build Y", "close project then do Z" — detected and passed through.
//
// [WARN] This guard runs BEFORE cloudChat — must be zero-cost (no AI calls).
// [WARN] Only hard-blocks on HIGH-confidence signals. Ambiguous messages pass through unchanged.

import * as vscode from 'vscode';
import type { ChatMessage } from '../ui/chatPanelHtml.js';

// ── Compound-command detection (user explicitly mentions switching context) ──────────────────────
const COMPOUND_PATTERNS = [
  /\b(open|load|switch to|go to)\b.{1,60}\b(project|folder|workspace)\b.{0,40}\b(and|then|after|,)\b/i,
  /\b(close|exit|leave)\b.{1,40}\b(project|folder|workspace)\b.{0,40}\b(and|then|open|load|switch)\b/i,
  /\b(open|load|switch)\b.{1,80}\b(build|fix|add|create|make|update|edit)\b/i,
  /\b(close|exit)\s+(this|current|the)?\s*(project|folder|workspace)\b/i,
];

export function isCompoundContextCommand(text: string): boolean {
  return COMPOUND_PATTERNS.some(p => p.test(text));
}

// ── Confident intent detection — conservative regex, zero API cost ────────────────────────────────
const BUILD_VERBS_RE  = /\b(build|make|create|generate|write|code( up)?|implement|scaffold|start( a| an| the)?)\b/i;
const FIX_VERBS_RE    = /\b(fix|debug|repair|update|change|improve|edit|modify|refactor|add to|remove from|cannot|broken|not working|fails|error|crash|blank)\b/i;
const QUESTION_RE     = /^(how|what|why|when|where|who|can you|could you|would you|should|is there|are there|does|do you|will|explain|tell me|show me)\b/i;
const NEW_OBJECT_RE   = /\b(a|an|me a|me an|new|another)\b/i;
// [FIX] Definite reference ("the vehicles", "it", "the game") = modify existing, NOT a new build.
// Prevents "make the vehicles look more real" from being blocked as a new-build inside a project.
const DEFINITE_REF_RE = /\b(the|this|that|these|those|it|its|them|their|they)\b/i;

export function isConfidentNewBuild(text: string): boolean {
  const t = text.trim();
  if (QUESTION_RE.test(t)) { return false; }
  if (FIX_VERBS_RE.test(t)) { return false; }
  if (!BUILD_VERBS_RE.test(t)) { return false; }
  if (t.split(/\s+/).length < 3) { return false; }
  if (!NEW_OBJECT_RE.test(t)) { return false; }
  if (DEFINITE_REF_RE.test(t) && !/\bnew\b/i.test(t)) { return false; }
  return true;
}

export function isConfidentFixRequest(text: string): boolean {
  const t = text.trim();
  if (QUESTION_RE.test(t)) { return false; }
  if (BUILD_VERBS_RE.test(t) && !FIX_VERBS_RE.test(t)) { return false; }
  return FIX_VERBS_RE.test(t);
}

// ── Helper: is the current workspace an active (initialized) project? ────────────────────────────
function getProjectContext(effectiveRoot?: string): { hasProject: boolean; projectName: string | null; isContainer: boolean } {
  const wsPath = effectiveRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsPath) { return { hasProject: false, projectName: null, isContainer: false }; }
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const cfgDir = (vscode.workspace.getConfiguration('redivivus').get('projectsDirectory', '~/projects') as string).replace('~', os.homedir());
  const isContainer = path.resolve(wsPath) === path.resolve(cfgDir);
  const hasConfig   = fs.existsSync(path.join(wsPath, '.redivivus', 'config.json'));
  const hasProject  = !isContainer && hasConfig;
  const projectName = hasProject ? require('path').basename(wsPath) : null;
  return { hasProject, projectName, isContainer };
}

// ── Main guard — synchronous, zero AI cost ────────────────────────────────────────────────────────
// Returns null = no guard fired. Returns a string = block message to show the user.
// Ambiguous messages always return null and fall through to cloudChat for proper classification.
export function checkProjectContextGuard(
  userText: string,
  conversation: ChatMessage[],
  refresh: () => void,
  effectiveRoot?: string
): string | null {
  if (isCompoundContextCommand(userText)) { return null; }

  const { hasProject, projectName, isContainer } = getProjectContext(effectiveRoot);

  if (hasProject && isConfidentNewBuild(userText)) {
    const name = projectName ? `**${projectName}**` : 'your current project';
    return (
      `\u{1F6AB} **You're inside ${name}.**\n\n` +
      `Builds create a new standalone project — that can't be done inside an open project.\n\n` +
      `**What you can do:**\n` +
      `- “Add a login screen to this project” → I'll add it here\n` +
      `- “Close this project, then build me a X” → I'll open the projects folder and build\n` +
      `- “Open the projects folder” → then ask me to build from there`
    );
  }

  if (!hasProject && isConfidentFixRequest(userText)) {
    const containerHint = isContainer
      ? `You're in the projects folder — open a specific project first.`
      : `No project is open right now.`;
    return (
      `\u{1F6AB} **No project is open.**\n\n` +
      `${containerHint}\n\n` +
      `**What you can do:**\n` +
      `- “Open [project name]” → I'll switch to it, then you can ask me to fix\n` +
      `- “Build me a X” → create a new project from scratch\n` +
      `- Ask me any question → always works without a project`
    );
  }

  return null;
}
