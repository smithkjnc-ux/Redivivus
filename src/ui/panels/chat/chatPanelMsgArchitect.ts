// [SCOPE] Chat message handlers: architect review actions — explain, add-todos, fix-all, fix-one
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ChatMessage } from './chatPanelHtml';
import type { RoutingService } from '../../../services/ai/routingService';
import { getActiveProjectRoot } from '../../../services/project/activeProjectRoot.js';

// [FIX] Under Model A the workspace root is the projects CONTAINER (~/projects); the ACTIVE project is a
// subfolder (e.g. ~/projects/tic-tac-toe-game). Architect-review file paths (e.g. `src/ai.js`) are relative
// to that subfolder. Resolving them against the container made fs.existsSync fail for EVERY file ->
// "Skipping N file(s) that don't exist yet" -> "No existing files to fix", even though the files were right
// there and the diagnosis was correct. Always resolve against the active project root (same resolver Run/
// Preview/Map use), falling back to the raw workspace root only if no active project is resolvable.
function _projectRoot(): string {
  return getActiveProjectRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
}

// [FIX] Build a per-file fix TASK that carries the Supervisor's ACTUAL prescription to the Worker, instead of
// a generic "improve quality" instruction. Without this the Worker re-diagnosed each file and tended to add
// explanatory COMMENTS rather than implement the fix (observed on tic-tac-toe: ai.js got +3 comment lines and
// no real change). We pull every review line that names the file (the problems-table row + Quick-Wins items)
// and tell the Worker to implement them as REAL code edits. Falls back to the generic task if nothing matched.
function _fixTaskFor(reviewText: string, file: string): string {
  const base = path.basename(file);
  const lines = reviewText.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.includes(base));
  const prescription = lines.join('\n').slice(0, 1500);
  if (!prescription) {
    return `Fix issues identified in architect review for ${file}: address health problems, reduce complexity, and improve code quality.`;
  }
  return `Implement these architect-review fixes for \`${file}\` EXACTLY as prescribed. Make REAL code changes -- `
    + `do NOT just add explanatory comments, do NOT re-analyze the file, do NOT leave placeholders. If a fix says `
    + `remove a function, delete it; if it says add an export, add the actual export statement.\n\n`
    + `PRESCRIPTION (from the architect review):\n${prescription}`;
}

// [Redivivus] Architect review text store — keyed by reviewId, used by action handlers
export const _architectReviews = new Map<string, string>();
// [Redivivus] Fix-one-at-a-time state — keyed by reviewId
export const _architectFixState = new Map<string, { issues: string[]; index: number }>();

export interface ArchitectAction { file: string; action: 'fix' | 'delete' | 'create'; label: string; description: string; }
// [Redivivus] Per-action buttons — populated by chatPanelMsgMapContext when AI returns ACTIONS_JSON
export const _architectActions = new Map<string, ArchitectAction[]>();

export async function handleArchitectPerAction(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const actions = _architectActions.get(msg.reviewId || '');
  const act = actions?.[msg.actionIndex];
  if (!act) { return; }
  const verb = act.action === 'delete' ? 'Delete' : act.action === 'create' ? 'Create' : 'Fix';
  const warning = act.action === 'delete' ? '\n\n> A snapshot is saved automatically — use Save Point to restore if needed.' : '';
  const detail = `**${verb} \`${act.file}\`?**\n\n${act.description}${warning}\n\n__ARCH_CONFIRM__${msg.reviewId}|||${msg.actionIndex}|||END_ARCH_CONFIRM__`;
  conversation.push({ role: 'assistant', content: detail, timestamp: Date.now() });
  refresh();
}

export async function handleArchitectActionConfirm(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const actions = _architectActions.get(msg.reviewId || '');
  const act = actions?.[msg.actionIndex];
  if (!act) { return; }
  const root = _projectRoot();
  if (act.action === 'delete') {
    const absPath = path.join(root, act.file);
    try {
      if (!fs.existsSync(absPath)) { conversation.push({ role: 'assistant', content: `\`${act.file}\` not found — nothing to delete.`, timestamp: Date.now() }); refresh(); return; }
      fs.unlinkSync(absPath);
      conversation.push({ role: 'assistant', content: `✅ Deleted \`${act.file}\`.`, timestamp: Date.now() });
    } catch (err) {
      conversation.push({ role: 'assistant', content: `❌ Delete failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() });
    }
  } else if (act.action === 'fix') {
    await vscode.commands.executeCommand('redivivus.runEditFix', act.description, act.file, 'refactor');
  } else {
    await vscode.commands.executeCommand('redivivus.postToChat', act.description);
  }
  refresh();
}

export async function handleArchitectExplain(msg: any, routing: RoutingService, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const reviewText = _architectReviews.get(msg.reviewId || '');
  if (!reviewText) { return; }
  const explainPrompt = 'You are explaining a code review to a non-technical person. Rewrite the following architect review in plain English.\n\n'
    + 'Rules:\n- Use real-world analogies.\n- No technical jargon.\n- Every point must be understandable by someone who has never coded.\n'
    + '- End with: "Ready to fix these? I can walk you through them one at a time."\n\nReview:\n' + reviewText;
  conversation.push({ role: 'user', content: 'Explain this review in plain English', timestamp: Date.now() });
  refresh();
  try {
    const aiRes = await routing.prompt(explainPrompt);
    conversation.push({ role: 'assistant', content: aiRes.text || 'Could not generate explanation.', timestamp: Date.now() });
  } catch (err) {
    conversation.push({ role: 'assistant', content: '❌ Could not generate explanation — please try again.', timestamp: Date.now() });
  }
  refresh();
}

export function handleArchitectAddTodos(msg: any, conversation: ChatMessage[], refresh: () => void): void {
  const reviewText = _architectReviews.get(msg.reviewId || '');
  if (!reviewText) { return; }
  const root = _projectRoot();
  if (!root) { conversation.push({ role: 'assistant', content: '⚠️ No project folder is open. Open a project first, then try again.', timestamp: Date.now() }); refresh(); return; }
  const bpPath = path.join(root, '.redivivus', 'blueprint.md');
  const dateStr = new Date().toISOString().slice(0, 10);
  const lines = reviewText.split('\n').filter(l => l.trim().startsWith('-') || /^\d+\./.test(l.trim()) || /^\*\*/.test(l.trim()));
  const todoLines = lines.slice(0, 20).map(l => '- [ ] ' + l.replace(/^[-*]+\s*/, '').replace(/^\d+\.\s*/, '').replace(/^\*\*([^*]+)\*\*:?/, '$1:').trim());
  const section = '\n\n## Architect Review TODOs -- ' + dateStr + '\n\n' + (todoLines.length > 0 ? todoLines.join('\n') : '- [ ] Review architect findings') + '\n';
  try {
    if (fs.existsSync(bpPath)) {
      fs.appendFileSync(bpPath, section, 'utf8');
    } else {
      fs.mkdirSync(path.join(root, '.redivivus'), { recursive: true });
      fs.writeFileSync(bpPath, '# Blueprint\n' + section, 'utf8');
    }
    conversation.push({ role: 'assistant', content: '✅ Added ' + todoLines.length + ' to-do items to your blueprint. Open `.redivivus/blueprint.md` to see them.', timestamp: Date.now() });
  } catch (err) {
    conversation.push({ role: 'assistant', content: '❌ Could not save to-do items — please try again.', timestamp: Date.now() });
  }
  refresh();
}

// [DONE] handleArchitectFixAll + handleArchitectFixOne moved to chatPanelMsgArchitectFix.ts (Rule 9 split)
export { handleArchitectFixAll, handleArchitectFixOne } from './chatPanelMsgArchitectFix.js';
