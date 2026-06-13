// [SCOPE] Context-aware routing guard — enforces project-open/closed rules before any intent is dispatched.
// "Certain things can and cannot be done inside an open project and vice-versa." — PapaJoe
//
// RULES:
//   Project IS open:   fix/edit/add/review = OK. New standalone BUILD = blocked (offer options).
//   Project NOT open:  new BUILD = OK.  fix/edit/add = blocked (nothing to fix).
//   Compound escape:   "open X and build Y", "close project then do Z" — detected and passed through.
//
// [WARN] This guard runs BEFORE cloudChat so misroutes never reach the AI pre-pass.
// [WARN] Only hard-blocks on HIGH-confidence actions. Ambiguous messages pass through unchanged.

import * as vscode from 'vscode';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';

// ── Compound-command detection (user explicitly mentions switching context) ──────────────────────
// These are allowed through regardless of current project state.
const COMPOUND_PATTERNS = [
  /\b(open|load|switch to|go to)\b.{1,60}\b(project|folder|workspace)\b.{0,40}\b(and|then|after|,)\b/i,
  /\b(close|exit|leave)\b.{1,40}\b(project|folder|workspace)\b.{0,40}\b(and|then|open|load|switch)\b/i,
  /\b(open|load|switch)\b.{1,80}\b(build|fix|add|create|make|update|edit)\b/i,
  /\b(close|exit)\s+(this|current|the)?\s*(project|folder|workspace)\b/i,
];

export function isCompoundContextCommand(text: string): boolean {
  return COMPOUND_PATTERNS.some(p => p.test(text));
}

// ── Confident build-intent detection (client-side, zero tokens) ──────────────────────────────────
// Only fires on CLEAR imperative build requests — not "can you" questions, not fix requests.
const BUILD_VERBS_RE   = /\b(build|make|create|generate|write|code( up)?|implement|scaffold|start( a| an| the)?)\b/i;
const FIX_VERBS_RE     = /\b(fix|debug|repair|update|change|improve|edit|modify|refactor|add to|remove from|cannot|broken|not working|fails|error|crash|blank)\b/i;
const QUESTION_RE      = /^(how|what|why|when|where|who|can you|could you|would you|should|is there|are there|does|do you|will|explain|tell me|show me)\b/i;

// Returns true ONLY when the message is unambiguously a "create something new" request.
export function isConfidentNewBuild(text: string): boolean {
  const t = text.trim();
  if (QUESTION_RE.test(t)) { return false; }        // questions never trigger
  if (FIX_VERBS_RE.test(t)) { return false; }        // fix/repair/update = not a new build
  if (!BUILD_VERBS_RE.test(t)) { return false; }     // must have a build verb
  if (t.split(/\s+/).length < 3) { return false; }   // too short to be confident
  return true;
}

// Returns true ONLY when the message is clearly a fix/edit/modify request.
export function isConfidentFixRequest(text: string): boolean {
  const t = text.trim();
  if (QUESTION_RE.test(t)) { return false; }          // questions pass through
  if (BUILD_VERBS_RE.test(t) && !FIX_VERBS_RE.test(t)) { return false; } // pure build = not fix
  return FIX_VERBS_RE.test(t);
}

// ── Helper: is the current workspace an active (initialized) project? ────────────────────────────
function getProjectContext(): { hasProject: boolean; projectName: string | null; isContainer: boolean } {
  const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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

// ── Main guard function ───────────────────────────────────────────────────────────────────────────
// Returns null = no guard fired, proceed normally.
// Returns a string = block message to show the user.
export function checkProjectContextGuard(
  userText: string,
  conversation: ChatMessage[],
  refresh: () => void,
): string | null {
  // Compound commands always pass through — user is explicitly managing context
  if (isCompoundContextCommand(userText)) { return null; }

  const { hasProject, projectName, isContainer } = getProjectContext();

  // ── Guard A: New build attempted while a project is open ─────────────────────────────────────
  // The user is inside an existing project. A "build me a X" request is almost certainly
  // an ADDITION to the project (not a completely new project). The fix pipeline handles additions.
  // We block the standalone new-build path and tell the user their options.
  // [WARN] Only block on confident new-build signals — ambiguous messages pass through to cloudChat.
  if (hasProject && isConfidentNewBuild(userText)) {
    const name = projectName ? `**${projectName}**` : 'your current project';
    return (
      `\u{1F6AB} **You\u2019re inside ${name}.**\n\n` +
      `Builds create a new standalone project \u2014 that can\u2019t be done inside an open project.\n\n` +
      `**What you can do:**\n` +
      `- \u201CAdd a login screen to this project\u201D \u2192 I\u2019ll add it here\n` +
      `- \u201CClose this project, then build me a X\u201D \u2192 I\u2019ll open the projects folder and build\n` +
      `- \u201COpen the projects folder\u201D \u2192 then ask me to build from there`
    );
  }

  // ── Guard B: Fix/edit attempted with no project open ────────────────────────────────────────
  // The user is at the projects container or no folder at all. There's no code to fix.
  // [WARN] Only block on confident fix signals — Q&A always passes through.
  if (!hasProject && isConfidentFixRequest(userText)) {
    const containerHint = isContainer
      ? `You\u2019re in the projects folder \u2014 open a specific project first.`
      : `No project is open right now.`;
    return (
      `\u{1F6AB} **No project is open.**\n\n` +
      `${containerHint}\n\n` +
      `**What you can do:**\n` +
      `- \u201COpen [project name]\u201D \u2192 I\u2019ll switch to it, then you can ask me to fix\n` +
      `- \u201CBuild me a X\u201D \u2192 create a new project from scratch\n` +
      `- Ask me any question \u2192 always works without a project`
    );
  }

  return null; // no guard fired — proceed normally
}
