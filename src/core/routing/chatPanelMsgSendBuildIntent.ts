// [SCOPE] Chat send-message: build intent handler — mode gates, blueprint gap check, template wizard
import * as vscode from 'vscode';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { handleFixRequest } from './chatPanelMsgFix';
import { runTemplateWizard } from '../../services/project/templateWizard';
import { detectBlueprintGaps, buildGapPromptMessage } from '../../services/blueprint/blueprintGapDetector';
import { _pendingGuidedBuilds } from './chatPanelMsgSpecial';

export async function handleBuildIntent(
  routedText: string,
  userText: string,
  msg: any,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<void> {
  const { panel } = deps;
  if (!deps.buildMode) {
    if (!vscode.workspace.workspaceFolders?.length) { await deps.handleBuildRequest(routedText); return; }
    if (deps.redivivus?.isInitialized?.()) { await handleFixRequest(routedText, deps, msg.imageBase64, msg.imageType); return; }
    panel.webview.postMessage({ type: 'show-mode-popover', pendingText: userText });
    return;
  }
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (root) {
    const config = deps.redivivus?.isInitialized?.() ? deps.redivivus?.loadConfig?.() : null;
    const gapResult = detectBlueprintGaps(config?.blueprint);
    if (gapResult.hasGaps) {
      _pendingGuidedBuilds.set(gapResult.sessionId, userText);
      conversation.push({ role: 'assistant', content: buildGapPromptMessage(gapResult, userText), timestamp: Date.now() });
      refresh(); return;
    }
  }
  if (deps.buildMode === 'plan' && !deps.redivivus?.isInitialized?.()) {
    const wiz = await runTemplateWizard(userText, (m) => panel.webview.postMessage(m), deps.routing);
    if (wiz.handled && wiz.customizationPrompt) { await deps.handleBuildRequest(wiz.customizationPrompt); return; }
  }
  await (deps.redivivus?.isInitialized?.()
    ? handleFixRequest(routedText, deps, msg.imageBase64, msg.imageType)
    : deps.handleBuildRequest(routedText));
}
