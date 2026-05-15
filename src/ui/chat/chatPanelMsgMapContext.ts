// [SCOPE] Chat message handler: map-context — Architect Review / file explain from Architecture Map
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import { ChatMessage } from './chatPanelHtml.js';
import { MessageHandlerDeps } from './chatPanelMessages.js';
import { buildAIPrefix, processAIResponse } from './chatPanelAI.js';
import { _architectReviews } from './chatPanelMsgArchitect.js';

export async function handleMapContext(msg: any, deps: MessageHandlerDeps): Promise<void> {
  const { routing, conversation, panel, refresh } = deps;
  const { nodeId, label, lines: nodeLines, health, todos } = msg;
  const prompt = msg._explainPrompt
    || ('You are a code reviewer. Answer concisely about this file.\n\nFile: ' + nodeId
      + '\nDescription: ' + (label || 'No description')
      + '\nLines: ' + nodeLines + ', Health: ' + health + ', TODOs: ' + todos
      + '\n\nExplain what this file does, any concerns, and what a developer should know about it. Keep it under 150 words.');
  const displayMsg = msg._displayLabel
    ? msg._displayLabel + ' `' + nodeId + '`'
    : ('Tell me about `' + nodeId + '`');
  const prefix = buildAIPrefix(deps.chassis, [], routing);
  conversation.push({ role: 'user', content: displayMsg, timestamp: Date.now() });
  refresh();
  try {
    panel.webview.postMessage({ type: 'set-status', status: 'working' });
    const aiResponse = await routing.prompt(prefix + prompt);
    const estimatedTokens = Math.ceil(aiResponse.text.length / 4);
    const estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
    await deps.usageTracker?.recordUsage(estimatedTokens, estimatedCost, routing.getAvailableAI().ai);
    let mapText = aiResponse.text || '';
    if (routing.isGuardianActive()) {
      const review = await routing.guardianReview(displayMsg, mapText, routing.getAvailableAI().ai, '').catch(() => null);
      if (review && !review.passed && review.correctedText) {
        mapText = review.correctedText + '\n\n---\n*Guardian reviewed this response.*';
      }
    }
    const { text: processedResponse } = processAIResponse(mapText);
    let finalContent = processedResponse;
    if (msg._displayLabel === 'Architect Review') {
      const reviewId = 'ar-' + Date.now();
      _architectReviews.set(reviewId, mapText);
      finalContent += '\n\n__ARCHITECT_ACTIONS__' + reviewId + '|||END_ARCH_ACTIONS__';
    }
    conversation.push({ role: 'assistant', content: finalContent, timestamp: Date.now(), tokens: estimatedTokens, cost: estimatedCost });
  } catch (err) {
    conversation.push({ role: 'assistant', content: 'Error: ' + (err instanceof Error ? err.message : 'Unknown error'), timestamp: Date.now() });
  } finally {
    setTimeout(() => { panel.webview.postMessage({ type: 'set-status', status: 'ready' }); }, 800);
  }
  refresh();
}
