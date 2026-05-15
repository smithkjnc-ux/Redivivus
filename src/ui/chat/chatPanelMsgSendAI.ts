// [SCOPE] Chat message AI chat path — handles question/answer AI interaction from send-message
// Extracted from chatPanelMsgSendMessage.ts

import * as vscode from 'vscode';
import { ChatMessage } from './chatPanelHtml.js';
import { MessageHandlerDeps } from './chatPanelMessages.js';
import { buildAIPrefix, processAIResponse, findSourceFiles } from './chatPanelAI.js';
import { clearPendingScopeQuestion } from '../../services/project/templateScopeService.js';
import { LearnedMemoryService } from '../../services/learnedMemoryService.js';
import { _architectReviews } from './chatPanelMsgArchitect.js';
import { shouldAutoSave, extractAutoSaveTarget, autoSaveAndOpen, shouldDeleteFiles, deleteRequestedFiles } from './chatPanelAutoSave.js';
import { splitSourceIntoSections, chunkedGenerate } from './chatPanelChunkedGen.js';

const BUILD_TRIGGER_RE = /\b(build|create|make|generate|write|add|implement|code|develop|produce)\s+(a|an|the|my|new|some|that|this|those)?\s*(website|app|application|page|site|component|function|class|file|code|script|tool|api|backend|frontend|feature|thing|project|module|library|plugin|extension|html|css|js|ts|python|go|rust|java|component|form|button|handler|utility)/i;
// [WARN] CODE_GEN_RE must require BOTH a verb AND a target to avoid false positives.
// "build" alone is too broad — "build a pong game" should trigger, "what does the build system do?" should not.
const CODE_GEN_RE = /\b(convert|turn|transform|rewrite|replace|port|rebuild)\b/i;
const NEW_BUILD_RE = /\b(build|create|make|generate|write)\s+(a|an|the|me|my|new)\s+\w+/i;
const PREFERENCE_RE = /\b(i prefer|i want|always use|never use|use only|don'?t use|we decided|we always|entry point is|main file is|i like|i hate|i don'?t like|our stack|our framework|we use|keep it|make sure|remember that|from now on)\b/i;
const AI_LABEL: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
const CHUNKED_THRESHOLD = 300; // Lines above which we use chunked generation

/** Main AI chat handler — routes to chunked gen, single-call, or question path based on intent */
export async function handleAIChat(
  msg: any,
  userText: string,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<void> {
  const { chassis, routing, usageTracker } = deps;
  try {
    deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });
    const recentUserMsgs = conversation.filter(m => m.role === 'user').slice(-4, -1).map(m => m.content);
    const prefix = buildAIPrefix(chassis, recentUserMsgs, routing, conversation.slice(-14), userText);
    (routing as any).promptFailoverCallback = (failedAI: string, nextAI: string) => {
      conversation.push({ role: 'assistant', content: `AI failover: ${AI_LABEL[failedAI] || failedAI} timed out -- retrying with ${AI_LABEL[nextAI] || nextAI}...`, timestamp: Date.now() });
      refresh();
    };

    // [CHASSIS] Handle file deletion requests
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    if (shouldDeleteFiles(userText) && wsRoot) {
      const deleteResult = await deleteRequestedFiles(userText, wsRoot);
      if (deleteResult) {
        conversation.push({ role: 'assistant', content: deleteResult, timestamp: Date.now() });
        refresh();
      }
    }

    // [CHASSIS] Check if this is a code gen request
    // Two types: (1) convert/rewrite existing code, (2) build something new from scratch
    const isConvert = CODE_GEN_RE.test(userText);
    const isNewBuild = NEW_BUILD_RE.test(userText);
    const isCodeGen = isConvert || isNewBuild;
    const workspaceRoot = wsRoot;
    let finalText = '';
    let estimatedTokens = 0;
    let estimatedCost = 0;

    if (isCodeGen && workspaceRoot) {
      const srcFiles = findSourceFiles(userText, workspaceRoot);
      const totalLines = srcFiles.reduce((sum, f) => sum + f.lineCount, 0);

      // [WARN] For NEW builds (not conversions), don't inject source files from the current project.
      // User asked "build a pong game" — don't inject flappy_bird_clone.ts as source context.
      const useSourceFiles = isConvert && totalLines > 0;

      if (useSourceFiles && totalLines > CHUNKED_THRESHOLD && srcFiles.length > 0) {
        // [WARN] Chunked generation — each API call sees FULL source, output is chunked
        const mainFile = srcFiles[0];
        const sections = splitSourceIntoSections(mainFile.content);
        const targetFormat = /\b(html|web|browser)\b/i.test(userText) ? 'HTML/JavaScript' : 'the target format';
        conversation.push({ role: 'assistant', content: `📦 Large file detected (${totalLines} lines). Generating in ${sections.length} parts...`, timestamp: Date.now() });
        refresh();
        finalText = await chunkedGenerate(routing, mainFile.content, sections, userText, targetFormat, (progress) => {
          conversation.push({ role: 'assistant', content: progress, timestamp: Date.now() });
          refresh();
        });
        // Track usage for chunked output
        estimatedTokens = Math.ceil(finalText.length / 4);
        estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
        await usageTracker?.recordUsage(estimatedTokens, estimatedCost, routing.getAvailableAI().ai);
        // Wrap in code fence for auto-save detection
        const lang = /\b(html|web|browser)\b/i.test(userText) ? 'html' : 'js';
        finalText = '```' + lang + '\n' + finalText + '\n```';
      } else {
        // Small file — single API call (existing path)
        const aiResponse = await routing.prompt(prefix + userText);
        if (!aiResponse.success) {
          conversation.push({ role: 'assistant', content: `AI Error: ${aiResponse.error || 'Unknown error'}`, timestamp: Date.now() });
          refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); clearPendingScopeQuestion(); return;
        }
        estimatedTokens = Math.ceil(aiResponse.text.length / 4);
        estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
        await usageTracker?.recordUsage(estimatedTokens, estimatedCost, routing.getAvailableAI().ai);
        finalText = aiResponse.text || '';
      }
    } else {
      // Question/answer path — single API call
      const aiResponse = await routing.prompt(prefix + userText);
      if (!aiResponse.success) {
        conversation.push({ role: 'assistant', content: `AI Error: ${aiResponse.error || 'Unknown error'}`, timestamp: Date.now() });
        refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); clearPendingScopeQuestion(); return;
      }
      estimatedTokens = Math.ceil(aiResponse.text.length / 4);
      estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
      await usageTracker?.recordUsage(estimatedTokens, estimatedCost, routing.getAvailableAI().ai);
      finalText = aiResponse.text || '';
    }
    // [WARN] hasCodeBlock must only match FENCED code blocks, not inline backticks.
    // Previous bug: /`[^`]+`/ matched `filename.ts` which triggered Guardian on every answer.
    const hasCodeBlock = /```[a-z]*\n/i.test(finalText);
    // [WARN] Skip Guardian review for code generation — the Guardian was corrupting generated code blocks.
    if (!isCodeGen && routing.isGuardianActive() && (hasCodeBlock || BUILD_TRIGGER_RE.test(userText))) {
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
    conversation.push({ role: 'assistant', content: finalContent, timestamp: Date.now(), tokens: estimatedTokens, cost: estimatedCost });
    refresh();
    // [CHASSIS] Auto-save: if AI produced a substantial code block and user asked for a build/convert, save it
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root && shouldAutoSave(finalText, userText)) {
      const target = extractAutoSaveTarget(finalText, userText);
      if (target) {
        const confirmation = await autoSaveAndOpen(target.code, target.filename, root);
        if (confirmation) {
          conversation.push({ role: 'assistant', content: confirmation, timestamp: Date.now() });
          refresh();
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
    conversation.push({ role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, timestamp: Date.now() });
    refresh();
  } finally {
    setTimeout(() => { deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' }); }, 800);
  }
}
