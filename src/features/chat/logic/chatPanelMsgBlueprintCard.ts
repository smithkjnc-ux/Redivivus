// [SCOPE] Blueprint card message handlers — handles blueprint-card-confirm and blueprint-card-skip
// from the AI-inferred 5W confirmation card shown before new project builds.

import type { ChatMessage } from '../ui/chatPanelHtml.js';
import type { MessageHandlerDeps } from './chatPanelMessages.js';
import { enrichTaskWithBlueprint } from '../../blueprint/logic/blueprintInference.js';
import { handleSendMessage } from './chatPanelMsgSendMessage.js';

// [Redivivus] Pending blueprint card builds — sessionId -> original user task
export const _pendingBlueprintCards = new Map<string, string>();

export async function handleBlueprintCardConfirm(
  msg: any,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<void> {
  const sessionId = msg.sessionId as string | undefined;
  const answers = msg.answers as Record<string, string> | undefined;
  const originalTask = sessionId ? _pendingBlueprintCards.get(sessionId) : undefined;
  if (!sessionId || !originalTask) { return; }
  _pendingBlueprintCards.delete(sessionId);

  const enriched = answers ? enrichTaskWithBlueprint(originalTask, answers) : originalTask;
  const filledFields = answers
    ? Object.keys(answers).filter(k => answers[k]?.trim()).map(k => k.toUpperCase()).join(', ')
    : '';
  const note = filledFields ? `Blueprint confirmed (${filledFields}). Building now...` : 'Building now...';
  conversation.push({ role: 'assistant', content: note, timestamp: Date.now() });
  refresh();
  // [FIX] Re-route through full pipeline (job sizing, fiveWsDiagnostic, visual spec, model routing)
  // instead of calling handleBuildRequest directly — those stages pick the right model quality.
  // fromBlueprintCard=true tells handleBuildIntent to skip re-showing the card.
  await handleSendMessage({ text: enriched, fromBlueprintCard: true }, deps);
}

export async function handleBlueprintCardSkip(
  msg: any,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<void> {
  const sessionId = msg.sessionId as string | undefined;
  const originalTask = sessionId ? _pendingBlueprintCards.get(sessionId) : undefined;
  if (!sessionId || !originalTask) { return; }
  _pendingBlueprintCards.delete(sessionId);
  conversation.push({ role: 'assistant', content: 'Skipping blueprint -- building now...', timestamp: Date.now() });
  refresh();
  await handleSendMessage({ text: originalTask, fromBlueprintCard: true }, deps);
}
