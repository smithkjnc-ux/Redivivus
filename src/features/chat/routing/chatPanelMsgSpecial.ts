// [SCOPE] Chat message handlers: special flows — blueprint gap answers, vault dedup, terminal error
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import type { ChatMessage } from '../ui/chatPanelHtml.js';
import type { MessageHandlerDeps } from './chatPanelMessages.js';
import { applyGapAnswers } from '../../project/infrastructure/blueprint/blueprintGapDetector.js';
import { syncBlueprintMd } from '../../project/infrastructure/blueprint/blueprintWriter.js';

// [Redivivus] Guided Blueprint Mode — pending build tasks waiting for gap answers (sessionId -> original task)
export const _pendingGuidedBuilds = new Map<string, string>();

export async function handleBlueprintGapAnswer(msg: any, deps: MessageHandlerDeps, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const sessionId = msg.sessionId as string | undefined;
  const answers = msg.answers as Record<string, string> | undefined;
  const buildTask = sessionId ? _pendingGuidedBuilds.get(sessionId) : undefined;
  if (!sessionId || !answers || !buildTask) { return; }
  _pendingGuidedBuilds.delete(sessionId);

  const config = deps.redivivus.isInitialized() ? deps.redivivus.loadConfig() : null;
  if (config) {
    config.blueprint = applyGapAnswers(config.blueprint || {}, answers) as typeof config.blueprint;
    deps.redivivus.saveConfig(config);
    syncBlueprintMd(deps.redivivus, config);
  }

  const fields = Object.keys(answers).filter(k => answers[k]?.trim()).map(k => k.toUpperCase()).join(', ');
  conversation.push({ role: 'assistant', content: `Blueprint updated (${fields}). Building now...`, timestamp: Date.now() });
  refresh();
  await deps.handleBuildRequest(buildTask);
}

export async function handleBlueprintGapSkip(msg: any, deps: MessageHandlerDeps, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const sessionId = msg.sessionId as string | undefined;
  const buildTask = sessionId ? _pendingGuidedBuilds.get(sessionId) : undefined;
  if (!sessionId || !buildTask) { return; }
  _pendingGuidedBuilds.delete(sessionId);
  conversation.push({ role: 'assistant', content: 'Skipping blueprint questions -- building with current context.', timestamp: Date.now() });
  refresh();
  await deps.handleBuildRequest(buildTask, true);
}

export function handleVaultDedupPreview(msg: any, conversation: ChatMessage[], refresh: () => void): void {
  const clusters = msg.clusters as Array<{
    keep: { name: string; category: string; importCount: number };
    duplicates: Array<{ name: string; importCount: number }>;
    similarity: number;
  }> | undefined;
  if (!clusters || clusters.length === 0) {
    conversation.push({ role: 'assistant', content: 'Vault is clean -- no near-duplicates found.', timestamp: Date.now() });
    refresh(); return;
  }
  const total = clusters.reduce((n, c) => n + c.duplicates.length, 0);
  const lines = [`**Vault Deduplication** -- Found **${clusters.length} duplicate cluster${clusters.length !== 1 ? 's' : ''}** (${total} item${total !== 1 ? 's' : ''} removable):`, ''];
  for (const c of clusters) {
    const simPct = Math.round(c.similarity * 100);
    lines.push(`- **Keep:** \`${c.keep.name}\` (${c.keep.category}, ${c.keep.importCount} imports)`);
    for (const d of c.duplicates) { lines.push(`  - Remove: \`${d.name}\` (${simPct}% similar, ${d.importCount} imports)`); }
  }
  lines.push('', '__VAULT_DEDUP_ACTIONS__END_VAULT_DEDUP__');
  conversation.push({ role: 'assistant', content: lines.join('\n'), timestamp: Date.now() });
  refresh();
}

export async function handleVaultDedupMerge(conversation: ChatMessage[], refresh: () => void): Promise<void> {
  conversation.push({ role: 'user', content: 'Merge vault duplicates', timestamp: Date.now() });
  refresh();
  try { await vscode.commands.executeCommand('redivivus.vaultDedup'); } catch { /* ignore */ }
}

export function handleInjectTerminalError(msg: any, conversation: ChatMessage[], refresh: () => void): void {
  const err = msg.error as { terminalName: string; errorBlock: string; fullContext: string } | undefined;
  if (!err || !err.errorBlock) {
    conversation.push({ role: 'assistant', content: 'No terminal error found. Run your project in the terminal first, then try again.', timestamp: Date.now() });
    refresh(); return;
  }
  const errorMsg = [
    `**Terminal error detected** in \`${err.terminalName}\`:`, '',
    '```', err.errorBlock.slice(0, 800), '```', '',
    '__TERMINAL_ERROR__' + Buffer.from(err.fullContext.slice(0, 1200)).toString('base64') + '|||END_TERMINAL_ERROR__',
  ].join('\n');
  conversation.push({ role: 'assistant', content: errorMsg, timestamp: Date.now() });
  refresh();
}

export async function handleFixTerminalError(msg: any, deps: MessageHandlerDeps, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const errorContext = msg.errorContext as string | undefined;
  if (!errorContext) { return; }
  const fixPrompt = `Fix the following terminal error in my project:\n\n${errorContext}`;
  conversation.push({ role: 'user', content: fixPrompt, timestamp: Date.now() });
  refresh();
  await deps.handleBuildRequest(fixPrompt, true, true);
}
