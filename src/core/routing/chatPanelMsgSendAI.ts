// [SCOPE] Chat message AI chat path — handles question/answer and convert/transform AI interaction
// Extracted from chatPanelMsgSendMessage.ts
// [RULE 18] isConvert flag passed in from classifier — no regex-based intent detection here.

import * as vscode from 'vscode';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { buildAIPrefix, processAIResponse } from '../ai/chatPanelAI';
import { clearPendingScopeQuestion } from '../../services/project/templateScopeService';
import { LearnedMemoryService } from '../../services/learnedMemoryService';
import { _architectReviews } from '../../ui/panels/chat/chatPanelMsgArchitect';
import { shouldAutoSave, extractAutoSaveTarget, autoSaveAndOpen, shouldDeleteFiles, deleteRequestedFiles, identifyFilesToDelete } from '../build/chatPanelAutoSave';
import { runChunkedConvert } from './chatPanelMsgSendAIConvert';

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
        estimatedTokens = Math.ceil(aiResponse.text.length / 4);
        estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
        await usageTracker?.recordUsage(estimatedTokens, estimatedCost, (lastResponseModel && lastResponseModel !== 'none') ? lastResponseModel : routing.getAvailableAI().ai, aiResponse.inputTokens, aiResponse.outputTokens, 'qa');
        finalText = aiResponse.text || '';
      }
    } else {
      // Question / answer path — use cheap models first (Groq/Gemini), save expensive models for code gen
      // [ADAPTIVE-PILL] Manual lock: only the locked provider is called, no failover.
      const aiResponse = manualProvider
        ? await (routing as any).promptWithProvider(manualProvider, prefix + userText, 60_000, msg.imageBase64, msg.imageType).catch((e: any) => ({ success: false, error: e?.message || 'provider error', text: '' }))
        : await routing.promptCheap(prefix + userText, 60_000, msg.imageBase64, msg.imageType);
      if (!aiResponse.success) {
        // NO_API_KEY: show guardian setup message as a normal reply, not an error wrapper
        const content = aiResponse.error === 'NO_API_KEY'
          ? (aiResponse.text || 'Add an API key in Redivivus Settings to get started.')
          : `Something went wrong -- ${aiResponse.error || 'please try again.'}`;
        conversation.push({ role: 'assistant', content, timestamp: Date.now() });
        refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); clearPendingScopeQuestion(); return;
      }
      lastResponseModel = aiResponse.model;
      estimatedTokens = Math.ceil(aiResponse.text.length / 4);
      estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
      await usageTracker?.recordUsage(estimatedTokens, estimatedCost, (lastResponseModel && lastResponseModel !== 'none') ? lastResponseModel : routing.getAvailableAI().ai, aiResponse.inputTokens, aiResponse.outputTokens, 'qa');
      finalText = aiResponse.text || '';
    }

    // [WARN] hasCodeBlock must only match FENCED code blocks, not inline backticks.
    const hasCodeBlock = /```[a-z]*\n/i.test(finalText);
    // [GUARDIAN] Only run if this is a conversion task (isConvert) AND it contains a code block.
    // Running a code-review prompt on a conversational Q&A answer causes Guardian to strip the conversation and hallucinate file replacements.
    if (routing.isGuardianActive() && isConvert && hasCodeBlock) {
      const workerAI = routing.getAvailableAI().ai;
      const blueprintCtx = redivivus.isInitialized() ? (redivivus.loadConfig()?.blueprint ? JSON.stringify(redivivus.loadConfig()!.blueprint) : '') : '';
      const guardianTask = isConvert ? `Code conversion/transform task: ${userText}` : userText;
      const review = await routing.guardianReview(guardianTask, finalText, workerAI, blueprintCtx).catch(() => null);
      if (review && review.guardianAI && review.guardianAI !== 'none') {
        const reviewInput = guardianTask.length + finalText.length;
        const reviewOutput = review.correctedText ? review.correctedText.length : 50;
        const guardianTokens = Math.ceil((reviewInput + reviewOutput) / 4);
        const guardianCost = (guardianTokens / 1_000_000) * 0.30;
        await usageTracker?.recordUsage(guardianTokens, guardianCost, review.guardianAI, review.inputTokens, review.outputTokens);
      }
      if (review && !review.passed && review.correctedText) {
        finalText = review.correctedText + `\n\n---\n*Guardian (${review.guardianAI}) reviewed and corrected this response.*`;
      }
      if (review?.scopeAlerts?.length) {
        finalText += `\n\n---\n**Guardian also noticed (not applied -- say "also fix..." to address):**\n${review.scopeAlerts.map(a => `- ${a}`).join('\n')}`;
      }
    }

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

    // [FIX] Auto-save ONLY fires on explicit build/convert paths (isConvert=true).
    // Q&A answers stay in the chat — questions get answers, not actions.
    // The user can copy the code or say "save this" / "apply this" to trigger the build pipeline.
    // [DEAD] Previous behavior: auto-saved ANY substantial code block from Q&A into a new file,
    // causing garbage files like "the.html" when users asked conversational questions.
    if (isConvert) {
      let root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      // Don't auto-save into the projects container — land in an auto-created subfolder instead
      if (root) {
        const os = require('os') as typeof import('os');
        const path = require('path') as typeof import('path');
        const cfg = vscode.workspace.getConfiguration('redivivus').get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
        if (path.resolve(root) === path.resolve(cfg)) {
          const { lastAutoCreatedDir } = await import('../build/chatPanelBuildAutoCreate.js');
          root = (lastAutoCreatedDir && require('fs').existsSync(lastAutoCreatedDir)) ? lastAutoCreatedDir : '';
        }
      }
      if (await shouldAutoSave(finalText, userText, routing)) {
        const target = extractAutoSaveTarget(finalText, userText, root);
        if (target) {
          const confirmation = await autoSaveAndOpen(target.code, target.filename, root, {
            model: answeredBy,
            tokens: estimatedTokens,
          });
          if (confirmation) { conversation.push({ role: 'assistant', content: confirmation, timestamp: Date.now() }); refresh(); }
        }
      }
    }
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
