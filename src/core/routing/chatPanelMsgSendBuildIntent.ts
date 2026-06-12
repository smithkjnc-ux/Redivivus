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
import { inferBlueprintFields, buildBlueprintCardToken } from '../../services/blueprint/blueprintInference';
import { _pendingBlueprintCards } from './chatPanelMsgBlueprintCard';

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
  // [Model A] The projects container is never a project, even with a stray .redivivus config (pre-Model-A era).
  const isInitFallback = wsRoot && !isProjectsContainer(wsRoot) && require('fs').existsSync(path.join(wsRoot, '.redivivus', 'config.json'));
  const isInit = deps.redivivus?.isInitialized?.() || isInitFallback;

  // [FIX] Force modification requests to bypass build and go straight to fix pipeline
  if (wsRoot && !isProjectsContainer(wsRoot) && isInit) {
    const { isModificationRequest } = await import('../build/chatPanelBuildInference.js');
    if (await isModificationRequest(routedText, deps.routing, deps.usageTracker)) {
      await handleFixRequest(routedText, deps, msg.imageBase64, msg.imageType);
      return;
    }
  }

  if (!deps.buildMode) {
    // No project open OR workspace is just the projects container → infer 5 W's, show confirmation card
    if (!wsRoot || isProjectsContainer(wsRoot)) {
      // Skip card when re-entering from blueprint card confirm — go straight to build
      if (!msg.fromBlueprintCard) {
        // [FIX] Use userText (clean) not routedText — routedText has diagnostic suffixes that confuse inference
        // [FIX] Use the richest available task description for blueprint inference.
        // userText may be short ("can you make this?") -- prefer the enriched task if it's longer.
        const inferText = (routedText && routedText.length > userText.length) ? routedText : userText;
        const inferred = await inferBlueprintFields(inferText.slice(0, 800), deps.routing).catch(() => null);
        if (inferred) {
          _pendingBlueprintCards.set(inferred.sessionId, userText);
          conversation.push({ role: 'assistant', content: buildBlueprintCardToken(inferred), timestamp: Date.now() });
          refresh(); return;
        }
      }
      // [FIX] A confirmed blueprint card IS the confirmation — skip ALL gates (placement, scope, vault-hit,
      // cost). Passing skipComplex=true routes straight to runBuildAfterGates (auto-creates the project
      // folder + builds). Without it the Vault-Hit gate fired ("tetris" matched the user's arcade games),
      // popped a reuse modal, and the build stalled at "Building now..." with no folder ever created.
      await deps.handleBuildRequest(routedText, true); return;
    }
    if (isInit) { await handleFixRequest(routedText, deps, msg.imageBase64, msg.imageType); return; }
    // [P0] Don't force a "How do you want to work?" choice — that meta-question is pure friction. Default
    // to Auto (direct) and just build. Guided stays opt-in via the header mode badge. Fall through to the
    // build flow below with the mode now set.
    deps.buildMode = 'direct';
  }
  
  const root = wsRoot;
  if (root) {
    const config = isInit ? deps.redivivus?.loadConfig?.() : null;
    const gapResult = detectBlueprintGaps(config?.blueprint);
    // [P0] Auto mode never interrogates for blueprint gaps — the AI infers the 5 W's and builds;
    // correction is cheap (P3). Only Guided ('plan') mode pauses to fill gaps with the user.
    if (gapResult.hasGaps && deps.buildMode === 'plan') {
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
    : deps.handleBuildRequest(routedText, deps.buildMode === 'direct'));
}
