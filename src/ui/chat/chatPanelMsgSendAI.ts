// [SCOPE] Chat message AI chat path — handles question/answer and convert/transform AI interaction
// Extracted from chatPanelMsgSendMessage.ts
// [RULE 18] isConvert flag passed in from classifier — no regex-based intent detection here.

import * as vscode from 'vscode';
import { ChatMessage } from './chatPanelHtml.js';
import { MessageHandlerDeps } from './chatPanelMessages.js';
import { buildAIPrefix, processAIResponse, findSourceFiles } from './chatPanelAI.js';
import { clearPendingScopeQuestion } from '../../services/project/templateScopeService.js';
import { LearnedMemoryService } from '../../services/learnedMemoryService.js';
import { _architectReviews } from './chatPanelMsgArchitect.js';
import { shouldAutoSave, extractAutoSaveTarget, autoSaveAndOpen, shouldDeleteFiles, deleteRequestedFiles } from './chatPanelAutoSave.js';
import { splitSourceIntoSections, chunkedGenerate } from './chatPanelChunkedGen.js';

// [WARN] PREFERENCE_RE detects user preferences to save to learned memory.
// This is the only remaining regex — it matches explicit preference declarations, not intent.
// Replace with AI call if false-positive rate becomes a problem.
const PREFERENCE_RE = /\b(i prefer|i want|always use|never use|use only|don'?t use|we decided|we always|entry point is|main file is|i like|i hate|i don'?t like|our stack|our framework|we use|keep it|make sure|remember that|from now on)\b/i;
const AI_LABEL: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
const CHUNKED_THRESHOLD = 300;

/** Main AI chat handler — routes to chunked gen, single-call, or question path.
 *  isConvert: true = transform existing code (inject source files). false = Q&A. */
export async function handleAIChat(
  msg: any,
  userText: string,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
  options?: { isConvert?: boolean },
): Promise<void> {
  const { chassis, routing, usageTracker } = deps;
  const isConvert = options?.isConvert ?? false;
  try {
    deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });
    const recentUserMsgs = conversation.filter(m => m.role === 'user').slice(-4, -1).map(m => m.content);
    const prefix = buildAIPrefix(chassis, recentUserMsgs, routing, conversation.slice(-14), userText);
    (routing as any).promptFailoverCallback = (failedAI: string, nextAI: string) => {
      conversation.push({ role: 'assistant', content: `Switching to ${AI_LABEL[nextAI] || nextAI}...`, timestamp: Date.now() });
      refresh();
    };

    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    if (await shouldDeleteFiles(userText, routing) && wsRoot) {
      const deleteResult = await deleteRequestedFiles(userText, wsRoot);
      if (deleteResult) { conversation.push({ role: 'assistant', content: deleteResult, timestamp: Date.now() }); refresh(); }
    }

    let finalText = '';
    let estimatedTokens = 0;
    let estimatedCost = 0;
    let lastResponseModel = '';

    if (isConvert && wsRoot) {
      // [CHASSIS] Conversion path: inject source files so AI has the code to transform
      const srcFiles = findSourceFiles(userText, wsRoot);
      const totalLines = srcFiles.reduce((sum, f) => sum + f.lineCount, 0);

      if (totalLines > CHUNKED_THRESHOLD && srcFiles.length > 0) {
        const mainFile = srcFiles[0];
        const sections = splitSourceIntoSections(mainFile.content);
        const targetFormat = /\b(html|web|browser)\b/i.test(userText) ? 'HTML/JavaScript' : 'the target format';
        conversation.push({ role: 'assistant', content: `Large file detected (${totalLines} lines). Generating in ${sections.length} parts...`, timestamp: Date.now() });
        refresh();
        finalText = await chunkedGenerate(routing, mainFile.content, sections, userText, targetFormat, (progress) => {
          conversation.push({ role: 'assistant', content: progress, timestamp: Date.now() });
          refresh();
        });
        estimatedTokens = Math.ceil(finalText.length / 4);
        estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
        await usageTracker?.recordUsage(estimatedTokens, estimatedCost, routing.getAvailableAI().ai);
        const lang = /\b(html|web|browser)\b/i.test(userText) ? 'html' : 'js';
        finalText = '```' + lang + '\n' + finalText + '\n```';
      } else {
        const aiResponse = await routing.prompt(prefix + userText);
        if (!aiResponse.success) {
          conversation.push({ role: 'assistant', content: `Something went wrong -- ${aiResponse.error || 'please try again.'}`, timestamp: Date.now() });
          refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); clearPendingScopeQuestion(); return;
        }
        estimatedTokens = Math.ceil(aiResponse.text.length / 4);
        estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
        await usageTracker?.recordUsage(estimatedTokens, estimatedCost, routing.getAvailableAI().ai);
        finalText = aiResponse.text || '';
        lastResponseModel = aiResponse.model;
      }
    } else {
      // Question / answer path
      const aiResponse = await routing.prompt(prefix + userText);
      if (!aiResponse.success) {
        conversation.push({ role: 'assistant', content: `Something went wrong -- please try again.`, timestamp: Date.now() });
        refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); clearPendingScopeQuestion(); return;
      }
      estimatedTokens = Math.ceil(aiResponse.text.length / 4);
      estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
      await usageTracker?.recordUsage(estimatedTokens, estimatedCost, routing.getAvailableAI().ai);
      finalText = aiResponse.text || '';
      lastResponseModel = aiResponse.model;
    }

    // [WARN] hasCodeBlock must only match FENCED code blocks, not inline backticks.
    const hasCodeBlock = /```[a-z]*\n/i.test(finalText);
    // Skip Guardian for conversions — it would corrupt the transformed output
    if (!isConvert && routing.isGuardianActive() && hasCodeBlock) {
      const workerAI = routing.getAvailableAI().ai;
      const blueprintCtx = chassis.isInitialized() ? (chassis.loadConfig()?.blueprint ? JSON.stringify(chassis.loadConfig()!.blueprint) : '') : '';
      const review = await routing.guardianReview(userText, finalText, workerAI, blueprintCtx).catch(() => null);
      if (review && !review.passed && review.correctedText) {
        finalText = review.correctedText + `\n\n---\n*Guardian (${review.guardianAI}) reviewed and corrected this response.*`;
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

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    if (await shouldAutoSave(finalText, userText, routing)) {
      const target = extractAutoSaveTarget(finalText, userText);
      if (target) {
        const confirmation = await autoSaveAndOpen(target.code, target.filename, root);
        if (confirmation) { conversation.push({ role: 'assistant', content: confirmation, timestamp: Date.now() }); refresh(); }
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
