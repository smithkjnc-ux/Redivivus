// [SCOPE] Inner handlers for answer/clarify and command routing in routeCloudChatResult.
// Extracted from chatPanelMsgSendPostCloud.ts (Rule 9 split — was 219 lines).

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages.js';
import type { ChatResult } from '../../../services/api/apiClientChat.js';
import { handleFixRequest } from './chatPanelMsgFix.js';
import { fixLog } from '../../../shared/logging/infrastructure/fixPipelineLogger.js';
import { isProjectsContainer } from '../../project/application/redivivusPaths.js';
import { cloudChat } from '../../../services/api/apiClientChat.js';

export async function handleAnswerClarifyResult(
  msg: any,
  userText: string,
  deps: MessageHandlerDeps,
  conversation: any[],
  refresh: () => void,
  chatResult: ChatResult,
  effectiveRoot: string | undefined,
  hasProjectOpen: boolean,
  byline: string,
  releaseInput: () => void,
  dbg: (s: string) => void,
): Promise<'handled' | 'fall-through-build'> {
  const isBuildSpec = /[`\s]*\{[\s\S]*"action"\s*:\s*"build"/i.test(chatResult.text?.trim() ?? '');
  if (isBuildSpec) {
    try {
      const _m2 = chatResult.text.match(/\{[\s\S]*\}/);
      if (_m2) { const _spec = JSON.parse(_m2[0]); if (_spec && typeof _spec.task === 'string' && _spec.task.trim()) { chatResult.task = _spec.task.trim(); } }
    } catch { /* keep userText as the task */ }
    if (hasProjectOpen && !isProjectsContainer(effectiveRoot || '')) {
      dbg(`[BUILD-SPEC-IN-PROJECT] isBuildSpec + hasProject → routing to fix directly\n`);
      await handleFixRequest(chatResult.task || userText, deps, msg.imageBase64, msg.imageType);
      return 'handled';
    }
    chatResult.action = 'build';
    return 'fall-through-build';
  }

  // [Rule 18] Use a tiny AI call to decide recovery — no regex intent detection.
  // cloudChat returned 'answer/clarify' but the project is open; ask a fast model whether
  // this is really a code-change request (FIX) or a genuine question (CHAT).
  // Regex kept only as catch fallback when all AI providers are unavailable simultaneously.
  if (hasProjectOpen && !isProjectsContainer(effectiveRoot || '')) {
    let _isRecoverableToFix = false;
    try {
      // [THIN-CLIENT] Route the recovery classification to the backend /chat endpoint instead of
      // calling provider APIs directly from the extension via promptCheap.
      const recoveryResult = await cloudChat(
        `A project is open. The user said: "${userText.slice(0, 300)}". ` +
        `The AI classified this as '${chatResult.action}' but may be wrong. ` +
        `Reply FIX if this is an instruction/bug report. Reply CHAT if it is a question. One word only.`,
        undefined,
        'flash',
      );
      if (recoveryResult.text) {
        _isRecoverableToFix = recoveryResult.text.trim().toUpperCase().startsWith('FIX');
      }
    } catch {
      // Regex fallback — only when all AI providers are down
      const _isImperative = /\b(add|make|change|update|fix|repair|remove|delete|set|move|put|give|turn|adjust|increase|decrease|reduce|raise|lower|replace|rename|enable|disable|hide|show|style|color|colour|resize|swap|connect|wire|implement|write|build|generate)\b/i.test(userText);
      const _isBugReport = /\b(broken|bug|doesn't work|not working|error|crash|fail|fails|glitch|stuck|missing|wrong|nothing happens|does nothing|won't start)\b/i.test(userText);
      const _isQuestion = /^\s*(how|what|why|when|where|who|which|can you|could you|would you|should|is there|are there|does|do you|did|will|explain|tell me|show me|list|describe)\b/i.test(userText) || userText.trim().endsWith('?');
      _isRecoverableToFix = (_isImperative || _isBugReport) && !_isQuestion;
    }
    if (_isRecoverableToFix) {
      dbg(`[IMPERATIVE-RECOVERY] action=${chatResult.action} + open project → AI confirmed fix`);
      fixLog(`[IMPERATIVE-RECOVERY] ${chatResult.action} on imperative inside open project → routing to fix (AI-confirmed)`);
      await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
      return 'handled';
    }
  }

  if (!chatResult.text) {
    dbg(`[SILENT-DROP] no recovery (hasProject=${hasProjectOpen})`);
    fixLog(`[SILENT-DROP] answer/clarify empty text, no recovery (hasProject=${hasProjectOpen})`);
    releaseInput();
    return 'handled';
  }
  conversation.push({ role: 'assistant', content: `${chatResult.text}\n\n---\n*-- ${byline}*`, timestamp: Date.now() });
  refresh();
  releaseInput();
  await deps.usageTracker?.recordUsage(chatResult.inputTokens + chatResult.outputTokens, 0, chatResult.model, chatResult.inputTokens, chatResult.outputTokens, 'qa').catch(() => {});
  return 'handled';
}

export async function handleCommandResult(
  msg: any,
  userText: string,
  deps: MessageHandlerDeps,
  conversation: any[],
  refresh: () => void,
  chatResult: ChatResult,
  hasProjectOpen: boolean,
  releaseInput: () => void,
  dbg: (s: string) => void,
): Promise<boolean> {
  const _isRealCommand = chatResult.task && /^[\w]+\.[\w.]+$/.test(chatResult.task.trim());
  if (_isRealCommand) {
    const _cmd = chatResult.task!;
    try { await vscode.commands.executeCommand(_cmd); } catch { /* needs args or unknown */ }
    conversation.push({ role: 'assistant', content: chatResult.text || `Done -- **${_cmd.replace(/^(redivivus|workbench\.action)\./, '').replace(/([A-Z])/g, ' $1').trim()}**`, timestamp: Date.now() });
    refresh(); releaseInput(); return true;
  }
  dbg(`[COMMAND-MISCLASS] task="${(chatResult.task ?? '').slice(0, 80)}" is not a command ID → recovering\n`);
  if (hasProjectOpen) {
    await handleFixRequest(userText, deps, msg.imageBase64, msg.imageType);
    return true;
  }
  if (chatResult.text) { conversation.push({ role: 'assistant', content: chatResult.text, timestamp: Date.now() }); refresh(); }
  releaseInput(); return true;
}
