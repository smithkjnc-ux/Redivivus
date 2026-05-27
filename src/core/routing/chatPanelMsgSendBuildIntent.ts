// [SCOPE] Chat send-message: build intent handler — mode gates, blueprint gap check, template wizard
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { handleFixRequest } from './chatPanelMsgFix';
import { runTemplateWizard } from '../../services/project/templateWizard';
import { detectBlueprintGaps, buildGapPromptMessage } from '../../services/blueprint/blueprintGapDetector';
import { _pendingGuidedBuilds } from './chatPanelMsgSpecial';

function isProjectsContainer(root: string): boolean {
  const cfg = vscode.workspace.getConfiguration('redivivus').get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
  return path.resolve(root) === path.resolve(cfg);
}

export async function handleBuildIntent(
  routedText: string,
  userText: string,
  msg: any,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<void> {
  const { panel } = deps;
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const isInitFallback = wsRoot && require('fs').existsSync(path.join(wsRoot, '.redivivus', 'config.json'));
  const isInit = deps.redivivus?.isInitialized?.() || isInitFallback;

  // [FIX] Force modification requests to bypass build and go straight to fix pipeline
  if (wsRoot && !isProjectsContainer(wsRoot) && isInit) {
    const { isModificationRequest } = await import('../build/chatPanelBuildInference.js');
    if (await isModificationRequest(routedText, deps.routing)) {
      await handleFixRequest(routedText, deps, msg.imageBase64, msg.imageType);
      return;
    }
  }

  if (!deps.buildMode) {
    // No project open OR workspace is just the projects container → build directly (auto-create project folder)
    if (!wsRoot || isProjectsContainer(wsRoot)) { await deps.handleBuildRequest(routedText); return; }
    if (isInit) { await handleFixRequest(routedText, deps, msg.imageBase64, msg.imageType); return; }
    panel.webview.postMessage({ type: 'show-mode-popover', pendingText: userText });
    return;
  }
  
  const root = wsRoot;
  if (root) {
    const config = isInit ? deps.redivivus?.loadConfig?.() : null;
    const gapResult = detectBlueprintGaps(config?.blueprint);
    if (gapResult.hasGaps) {
      _pendingGuidedBuilds.set(gapResult.sessionId, userText);
      conversation.push({ role: 'assistant', content: buildGapPromptMessage(gapResult, userText), timestamp: Date.now() });
      refresh(); return;
    }
  }
  if (deps.buildMode === 'plan' && !isInit) {
    const wiz = await runTemplateWizard(userText, (m) => panel.webview.postMessage(m), deps.routing);
    if (wiz.handled && wiz.customizationPrompt) { await deps.handleBuildRequest(wiz.customizationPrompt); return; }
  }
  await (isInit
    ? handleFixRequest(routedText, deps, msg.imageBase64, msg.imageType)
    : deps.handleBuildRequest(routedText));
}
