// [SCOPE] Chat message handler: map-context — Architect Review / file explain from Architecture Map
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import { ChatMessage } from './chatPanelHtml.js';
import type { MessageHandlerDeps } from '../logic/chatPanelMessages.js';
import { buildAIPrefix, processAIResponse } from '../../../features/ai/logic/chatPanelAI.js';
import type { ArchitectAction } from './chatPanelMsgArchitect.js';
import { _architectReviews, _architectActions } from './chatPanelMsgArchitect.js';

export async function handleMapContext(msg: any, deps: MessageHandlerDeps): Promise<void> {
  const { routing, conversation, panel, refresh } = deps;
  const { nodeId, label, lines: nodeLines, health, todos } = msg;
  const isArchitectReview = msg._displayLabel === 'Architect Review';
  const prompt = msg._explainPrompt
    || ('You are a code reviewer. Answer concisely about this file.\n\nFile: ' + nodeId
      + '\nDescription: ' + (label || 'No description')
      + '\nLines: ' + nodeLines + ', Health: ' + health + ', TODOs: ' + todos
      + '\n\nExplain what this file does, any concerns, and what a developer should know about it. Keep it under 150 words.');
  // [FIX] Don't append empty nodeId in backticks — for Architect Review nodeId is intentionally ''
  const displayMsg = msg._displayLabel
    ? (nodeId ? msg._displayLabel + ' `' + nodeId + '`' : msg._displayLabel)
    : ('Tell me about `' + nodeId + '`');
  // [FIX] Architect review prompt is fully self-contained — skip buildAIPrefix entirely.
  // buildAIPrefix injects an activeFileContext code block that may be empty (no open file),
  // causing the AI to see empty backtick fences and respond "code section appears to be empty".
  const prefix = isArchitectReview ? '' : await buildAIPrefix(deps.redivivus, [], routing);
  conversation.push({ role: 'user', content: displayMsg, timestamp: Date.now() });
  refresh();
  try {
    panel.webview.postMessage({ type: 'set-status', status: 'working' });
    const aiResponse = await routing.prompt(prefix + prompt);
    if (!aiResponse.text && !aiResponse.success) {
      const errDetail = aiResponse.error || 'AI returned an empty response';
      conversation.push({ role: 'assistant', content: `❌ ${errDetail}`, timestamp: Date.now() });
      refresh(); return;
    }
    const estimatedTokens = Math.ceil((aiResponse.text || '').length / 4);
    const estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
    await deps.usageTracker?.recordUsage(estimatedTokens, estimatedCost, routing.getAvailableAI().ai);
    let mapText = aiResponse.text || '';
    // [FIX] Guardian is strictly a codebase/mutating code-reviewer. It should NEVER run on 
    // conversational, analytical, or Q&A responses, even if they happen to contain a code block.
    // If it does, it will hallucinate file replacements. Skip Guardian entirely for Map Context.
    // Parse and strip ACTIONS_JSON before rendering — AI appends this block when prompt requests it
    let reviewActions: ArchitectAction[] = [];
    if (isArchitectReview) {
      const actMatch = mapText.match(/ACTIONS_JSON:\s*(\[[\s\S]*?\])\s*$/m);
      if (actMatch) {
        try { reviewActions = JSON.parse(actMatch[1]); } catch { /* malformed JSON — ignore */ }
        mapText = mapText.replace(/\s*ACTIONS_JSON:[\s\S]*$/m, '').trim();
      }
    }
    const { text: processedResponse } = processAIResponse(mapText);
    let finalContent = processedResponse;
    if (msg._displayLabel === 'Architect Review') {
      const reviewId = 'ar-' + Date.now();
      _architectReviews.set(reviewId, mapText);
      if (reviewActions.length > 0) { _architectActions.set(reviewId, reviewActions); }
      finalContent += '\n\n__ARCHITECT_ACTIONS__' + reviewId + '|||END_ARCH_ACTIONS__';
    }
    conversation.push({ role: 'assistant', content: finalContent, timestamp: Date.now(), tokens: estimatedTokens, cost: estimatedCost });
  } catch (err) {
    conversation.push({ role: 'assistant', content: '❌ Something went wrong — please try again.', timestamp: Date.now() });
  } finally {
    setTimeout(() => { panel.webview.postMessage({ type: 'set-status', status: 'ready' }); }, 800);
  }
  refresh();
}
