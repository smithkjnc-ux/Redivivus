// [SCOPE] Chat message AI chat path — handles question/answer and convert/transform AI interaction
// Extracted from chatPanelMsgSendMessage.ts
// [RULE 18] isConvert flag passed in from classifier — no regex-based intent detection here.

import * as vscode from 'vscode';
import type { ChatMessage } from '../ui/chatPanelHtml.js';
import type { MessageHandlerDeps } from './chatPanelMessages.js';
import { buildAIPrefix, processAIResponse, getPreviewSnapshot } from '../../../shared/ai/domain/chatPanelAI.js';
import { clearPendingScopeQuestion } from '../../project/application/templateScopeService.js';
import { LearnedMemoryService } from '../application/learnedMemoryService.js';
import { _architectReviews } from '../ui/chatPanelMsgArchitect.js';
import { shouldDeleteFiles, deleteRequestedFiles, identifyFilesToDelete } from '../build/chatPanelAutoSave.js';
import { runChunkedConvert } from './chatPanelMsgSendAIConvert.js';
import { runGuardianReviewOnCode, handleAutoSaveLogic } from './chatPanelMsgSendAIHelpers.js';

// [WARN] PREFERENCE_RE detects user preferences to save to learned memory.
// This is the only remaining regex — it matches explicit preference declarations, not intent.
// Replace with AI call if false-positive rate becomes a problem.
const PREFERENCE_RE = /\b(i prefer|i want|always use|never use|use only|don'?t use|we decided|we always|entry point is|main file is|i like|i hate|i don'?t like|our stack|our framework|we use|keep it|make sure|remember that|from now on)\b/i;
const AI_LABEL: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek' };
/** Main AI chat handler — routes to chunked gen, single-call, or question path.
 *  isConvert: true = transform existing code (inject source files). false = Q&A.
 *  manualProvider: when set, only that provider is used — no failover. */
export async function handleAIChat(
  msg: any,
  userText: string,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
  options?: { isConvert?: boolean; manualProvider?: string },
): Promise<void> {
  const { redivivus, routing, usageTracker } = deps;
  const isConvert = options?.isConvert ?? false;
  // [ADAPTIVE-PILL] manualProvider: single-provider lock — no failover to other providers.
  // When set, ALL AI calls go through routing.promptWithProvider(provider, ...) which targets
  // only that provider. Worker cap (worker ≤ supervisor tier) is enforced by the routing service.
  const manualProvider = options?.manualProvider || null;
  try {
    deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });
    const recentUserMsgs = conversation.filter(m => m.role === 'user').slice(-4, -1).map(m => m.content);
    const prefix = await buildAIPrefix(redivivus, recentUserMsgs, routing, conversation.slice(-14), userText, isConvert);
    (routing as any).promptFailoverCallback = (failedAI: string, nextAI: string) => {
      conversation.push({ role: 'assistant', content: `Switching to ${AI_LABEL[nextAI] || nextAI}...`, timestamp: Date.now() });
      refresh();
    };

    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    if (await shouldDeleteFiles(userText, routing) && wsRoot) {
      const filesToDelete = identifyFilesToDelete(userText, wsRoot);
      if (filesToDelete.length > 0) {
        const fileList = filesToDelete.length === 1 ? filesToDelete[0] : `${filesToDelete.length} files: ${filesToDelete.join(', ')}`;
        const answer = await vscode.window.showWarningMessage(
          `Permanently delete ${fileList}?`,
          { modal: true },
          'Delete',
        );
        if (answer === 'Delete') {
          const deleteResult = deleteRequestedFiles(filesToDelete, wsRoot);
          if (deleteResult) { conversation.push({ role: 'assistant', content: deleteResult, timestamp: Date.now() }); refresh(); }
        } else {
          conversation.push({ role: 'assistant', content: 'Delete cancelled — no files were removed.', timestamp: Date.now() });
          refresh();
        }
      }
    }

    let finalText = '';
    let estimatedTokens = 0;
    let estimatedCost = 0;
    let lastResponseModel = '';

    if (isConvert && wsRoot) {
      // [Redivivus] Conversion path: chunked for large files, single-call for small ones
      const chunked = await runChunkedConvert(userText, wsRoot, routing, usageTracker, conversation, refresh);
      if (chunked) {
        finalText = chunked.finalText;
        estimatedTokens = chunked.estimatedTokens;
        estimatedCost = chunked.estimatedCost;
      } else {
        const aiResponse = await routing.prompt(prefix + userText, 60_000, msg.imageBase64, msg.imageType);
        if (!aiResponse.success) {
          // NO_API_KEY: show guardian setup message as a normal reply, not an error wrapper
          const content = aiResponse.error === 'NO_API_KEY'
            ? (aiResponse.text || 'Add an API key in Redivivus Settings to get started.')
            : `Something went wrong -- ${aiResponse.error || 'please try again.'}`;
          conversation.push({ role: 'assistant', content, timestamp: Date.now() });
          refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); clearPendingScopeQuestion(); return;
        }
        lastResponseModel = aiResponse.model;
        // [FIX] Use real API token counts when available; fall back to char-based estimate only if missing.
        const _inTok = aiResponse.inputTokens ?? 0;
        const _outTok = aiResponse.outputTokens ?? 0;
        estimatedTokens = (_inTok + _outTok) > 0 ? (_inTok + _outTok) : Math.ceil(aiResponse.text.length / 4);
        estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
        await usageTracker?.recordUsage(estimatedTokens, estimatedCost, (lastResponseModel && lastResponseModel !== 'none') ? lastResponseModel : routing.getAvailableAI().ai, _inTok || undefined, _outTok || undefined, 'qa');
        finalText = aiResponse.text || '';
      }
    } else {
      // Question / answer path — use cheap models first (Groq/Gemini), save expensive models for code gen
      // [FIX] Attach live preview snapshot so the AI can SEE what is rendering, not just read code.
      // User-attached image takes priority; fall back to preview snapshot if no image was attached.
      const snap = (!msg.imageBase64) ? getPreviewSnapshot() : undefined;
      const qaImageBase64 = msg.imageBase64 || snap?.data;
      const qaImageType = msg.imageType || snap?.mimeType;
      // [ADAPTIVE-PILL] Manual lock: only the locked provider is called, no failover.
      const aiResponse = manualProvider
        ? await (routing as any).promptWithProvider(manualProvider, prefix + userText, 60_000, qaImageBase64, qaImageType).catch((e: any) => ({ success: false, error: e?.message || 'provider error', text: '' }))
        : await routing.promptCheap(prefix + userText, 60_000, qaImageBase64, qaImageType);
      if (!aiResponse.success) {
        // NO_API_KEY: show guardian setup message as a normal reply, not an error wrapper
        const content = aiResponse.error === 'NO_API_KEY'
          ? (aiResponse.text || 'Add an API key in Redivivus Settings to get started.')
          : `Something went wrong -- ${aiResponse.error || 'please try again.'}`;
        conversation.push({ role: 'assistant', content, timestamp: Date.now() });
        refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); clearPendingScopeQuestion(); return;
      }
      lastResponseModel = aiResponse.model;
      // [FIX] Use real API token counts when available; fall back to char-based estimate only if missing.
      const _inTok = aiResponse.inputTokens ?? 0;
      const _outTok = aiResponse.outputTokens ?? 0;
      estimatedTokens = (_inTok + _outTok) > 0 ? (_inTok + _outTok) : Math.ceil(aiResponse.text.length / 4);
      estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
      await usageTracker?.recordUsage(estimatedTokens, estimatedCost, (lastResponseModel && lastResponseModel !== 'none') ? lastResponseModel : routing.getAvailableAI().ai, _inTok || undefined, _outTok || undefined, 'qa');
      finalText = aiResponse.text || '';
    }

    const blueprintCtx = redivivus.isInitialized() ? (redivivus.loadConfig()?.blueprint ? JSON.stringify(redivivus.loadConfig()!.blueprint) : '') : '';
    finalText = await runGuardianReviewOnCode(finalText, userText, isConvert, routing, usageTracker, blueprintCtx);

    const { text: processedResponse, executedCommand } = processAIResponse(finalText);
    void executedCommand;
    let finalContent = processedResponse;
    if (msg._displayLabel === 'Architect Review') {
      const reviewId = 'ar-' + Date.now();
      _architectReviews.set(reviewId, finalText);
      finalContent += '\n\n__ARCHITECT_ACTIONS__' + reviewId + '|||END_ARCH_ACTIONS__';
    }
    const MODEL_TO_LABEL: Record<string, string> = {
      'gemini-2.5-flash': 'Gemini', 'gemini-2.5-pro': 'Gemini Pro',
      'claude-sonnet-4': 'Claude Sonnet', 'claude-haiku-4': 'Claude Haiku',
      'gpt-4o-mini': 'GPT-4o', 'llama-3.3-70b': 'Groq', 'moonshot-v1-8k': 'Kimi', 'grok-2-1212': 'Grok',
    };
    const answeredBy = MODEL_TO_LABEL[lastResponseModel] || AI_LABEL[routing.getAvailableAI().ai] || routing.getAvailableAI().ai;
    conversation.push({ role: 'assistant', content: finalContent + `\n\n---\n*-- ${answeredBy}*`, timestamp: Date.now(), tokens: estimatedTokens, cost: estimatedCost });
    refresh();

    await handleAutoSaveLogic(isConvert, finalText, userText, routing, answeredBy, estimatedTokens, conversation, refresh);
    if (PREFERENCE_RE.test(userText)) {
      const prefRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (prefRoot) {
        LearnedMemoryService.extractFacts([userText], routing).then(({ permanent }) => {
          if (permanent.length > 0) { const learned = new LearnedMemoryService(prefRoot); permanent.forEach(fact => learned.addPermanent(fact)); }
        }).catch(() => { /* never surface memory errors */ });
      }
    }
  } catch (err) {
    const lastUserMsg = conversation.filter(m => m.role === 'user').pop();
    const retryHint = lastUserMsg ? `\n\n> Your message was: "${lastUserMsg.content.slice(0, 100)}"` : '';
    conversation.push({ role: 'assistant', content: `Something went wrong -- please try again.${retryHint}`, timestamp: Date.now() });
    refresh();
  } finally {
    setTimeout(() => { deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); }, 800);
  }
}
