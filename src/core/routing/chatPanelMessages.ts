// [SCOPE] Redivivus Chat Panel message handler — thin router, delegates to handler sub-modules
// Sub-modules: chatPanelMsgSendMessage, chatPanelMsgFileOps, chatPanelMsgProjectOps, chatPanelMsgArchitect, chatPanelMsgSpecial

import type * as vscode from 'vscode';
import type { RoutingService } from '../../services/ai/routingService';
import type { UsageTracker } from '../../services/usageTracker';
import type { RedivivusService } from '../../services/redivivusService';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import { resolveBuildConfirm, resolvePlacement } from '../ai/chatPanelResolvers.js';
import { resolveVaultHit } from '../build/chatPanelBuild';
import { handleSendMessage } from './chatPanelMsgSendMessage';
import { handleUndoBuild, handleBuildFeedback, handleOpenFile, handleOpenInBrowser, handleCreateFile, handlePreviewBrowser, handleOpenHtmlByName } from '../project/chatPanelMsgFileOps';
import { handleRunCommand, handleOpenProject, handleOpenExistingProject, handleOpenRecentProject, handleToggleSetting, handleBrowseFolder, handleStartNewProject } from '../project/chatPanelMsgProjectOps';
import { handleArchitectExplain, handleArchitectAddTodos, handleArchitectFixAll, handleArchitectFixOne, handleArchitectPerAction, handleArchitectActionConfirm } from '../../ui/panels/chat/chatPanelMsgArchitect';
import { handleBlueprintGapAnswer, handleBlueprintGapSkip, handleVaultDedupPreview, handleVaultDedupMerge, handleInjectTerminalError, handleFixTerminalError } from './chatPanelMsgSpecial';
import { handleBlueprintCardConfirm, handleBlueprintCardSkip } from './chatPanelMsgBlueprintCard';
import { handleMapContext } from '../../ui/panels/chat/chatPanelMsgMapContext';
import { handleExpandedInterviewSubmit } from '../../ui/panels/chat/chatPanelMsgExpandedInterview';
import { handleToolGapCopy, handleToolGapTerminal, handleCheckReadiness, handleGithubCommit, handlePlanApproval, handleFileSizeGateChoice, handleScopeSubmit, handleScopeCancel, handleTemplateWizard } from './chatPanelMsgTools';
import { handlePlacementAction } from './chatPanelMsgPlacement';

import type { MessageHandlerDeps } from './chatPanelMessageDeps.js';
export type { MessageHandlerDeps };


export async function handleChatMessage(msg: any, deps: MessageHandlerDeps): Promise<void> {
  const { routing, conversation, panel, refresh } = deps;

  if (msg.type === 'send-message') {
    // [Redivivus] Plan mode: if interview is active (including project-name step), route to handler
    if (deps.buildMode === 'plan' && deps.planInterview && (deps.planInterview.step < 8 || deps.planInterview.needsProjectName)) {
      const { handlePlanInterviewAnswer } = await import('../../ui/panels/chat/chatPanelPlanInterview.js');
      // [FIX] try-catch guarantees set-status:ready even if the handler throws or an AI call hangs
      try { await handlePlanInterviewAnswer(msg, deps); }
      catch (e) { console.error('[plan-interview] error:', e); deps.conversation.push({ role: 'assistant', content: 'Something went wrong — please try again.', timestamp: Date.now() }); deps.refresh(); }
      // Unlock input — the build pipeline will re-lock with set-status:working if a build starts
      const _iv = deps.planInterview as any;
      if (!_iv || !(_iv.step >= 8 && !_iv.needsProjectName)) {
        panel.webview.postMessage({ type: 'set-status', status: 'ready' });
      }
      return;
    }
    await handleSendMessage(msg, deps);

  } else if (msg.type === 'map-context') {
    await handleMapContext(msg, deps);

  } else if (msg.type === 'undo-build') {
    await handleUndoBuild(msg, deps, conversation, refresh);

  } else if (msg.type === 'build-feedback') {
    await handleBuildFeedback(msg, deps, conversation, refresh);

  } else if (msg.type === 'open-file') {
    await handleOpenFile(msg);

  } else if (msg.type === 'open-in-browser') {
    await handleOpenInBrowser(msg);

  } else if (msg.type === 'preview-browser') {
    await handlePreviewBrowser(msg);

  } else if (msg.type === 'add-to-phone') {
    await (require('vscode') as typeof import('vscode')).commands.executeCommand('redivivus.addToPhone');

  } else if (msg.type === 'open-html-by-name') {
    await handleOpenHtmlByName(msg);

  } else if (msg.type === 'create-file') {
    await handleCreateFile(msg);

  } else if (msg.type === 'clear-chat') {
    conversation.length = 0; try { const { clearPersistedConversation } = await import('../../ui/panels/chat/chatPanelPublicAPI.js'); clearPersistedConversation(); } catch {} refresh();

  } else if (msg.type === 'run-command') {
    await handleRunCommand(msg, deps, panel);

  } else if (msg.type === 'start-session') {
    deps.redivivus.setSessionAiTemperature(undefined);
    if (deps.onStartSession) { await deps.onStartSession(msg.goal || '', msg.ai || 'Unknown'); }
  } else if (msg.type === 'switch-ai') {
    if (deps.onSwitchAI) { await deps.onSwitchAI(msg.ai || 'gemini'); }
  } else if (msg.type === 'new-project') {
    if (deps.onNewProject) { const answers = msg.answers || {}; if (msg.originalTask) { answers._originalTask = msg.originalTask; } await deps.onNewProject(msg.name || '', answers, msg.folderPath || undefined); }

  } else if (msg.type === 'open-project') {
    await handleOpenProject(msg);

  } else if (msg.type === 'start-new-project') {
    await handleStartNewProject(msg, deps);

  } else if (msg.type === 'open-existing-project') {
    await handleOpenExistingProject(msg, conversation, refresh);

  } else if (msg.type === 'open-recent-project') {
    await handleOpenRecentProject(msg, conversation, refresh);

  } else if (msg.type === 'toggle-setting') {
    await handleToggleSetting(msg, conversation, refresh);

  } else if (msg.type === 'browse-folder') {
    await handleBrowseFolder(msg, panel);

  } else if (msg.type === 'confirm-build') {
    // [FIX] msg.confirmed=false means user clicked Cancel — was always resolving true before
    if (msg.buildId) { resolveBuildConfirm(msg.buildId, msg.confirmed !== false); }

  } else if (msg.type === 'cancel-build') {
    if (msg.buildId) { resolveBuildConfirm(msg.buildId, false); }

  } else if (msg.type === 'use-vault') {
    if (msg.hitId) { resolveVaultHit(msg.hitId, true); }

  } else if (msg.type === 'build-anyway') {
    if (msg.hitId) { resolveVaultHit(msg.hitId, false); }

  } else if (msg.type.startsWith('placement-')) {
    await handlePlacementAction(msg);

  } else if (msg.type === 'filesize-gate-choice') {
    await handleFileSizeGateChoice(msg);

  } else if (msg.type === 'scope-submit') {
    await handleScopeSubmit(msg);

  } else if (msg.type === 'scope-cancel') {
    await handleScopeCancel();

  } else if (msg.type === 'template-wizard-submit' || msg.type === 'template-wizard-cancel') {
    await handleTemplateWizard(msg);

  } else if (msg.type === 'architect-explain') {
    await handleArchitectExplain(msg, routing, conversation, refresh);

  } else if (msg.type === 'architect-add-todos') {
    handleArchitectAddTodos(msg, conversation, refresh);

  } else if (msg.type === 'architect-fix-all') {
    await handleArchitectFixAll(msg, conversation, refresh, panel);

  } else if (msg.type === 'architect-deep-fix') {
    const { handleArchitectDeepFix } = await import('../../ui/panels/chat/chatPanelMsgArchitectDeepFix.js');
    await handleArchitectDeepFix(msg, conversation, refresh, deps, panel);

  } else if (msg.type === 'architect-fix-one') {
    await handleArchitectFixOne(msg, conversation, refresh, panel);

  } else if (msg.type === 'architect-per-action') {
    await handleArchitectPerAction(msg, conversation, refresh);

  } else if (msg.type === 'architect-action-confirm') {
    await handleArchitectActionConfirm(msg, conversation, refresh);

  } else if (msg.type === 'architect-action-cancel') {
    conversation.push({ role: 'assistant', content: 'Cancelled.', timestamp: Date.now() }); refresh();

  } else if (msg.type === 'blueprint-card-confirm') { await handleBlueprintCardConfirm(msg, deps, conversation, refresh);
  } else if (msg.type === 'blueprint-card-skip') { await handleBlueprintCardSkip(msg, deps, conversation, refresh);
  } else if (msg.type === 'blueprint-gap-answer') { await handleBlueprintGapAnswer(msg, deps, conversation, refresh);
  } else if (msg.type === 'blueprint-gap-skip') { await handleBlueprintGapSkip(msg, deps, conversation, refresh);

  } else if (msg.type === 'vault-dedup-preview') {
    handleVaultDedupPreview(msg, conversation, refresh);

  } else if (msg.type === 'vault-dedup-merge') {
    await handleVaultDedupMerge(conversation, refresh);

  } else if (msg.type === 'inject-terminal-error') {
    handleInjectTerminalError(msg, conversation, refresh);
    // [FIX] Auto-trigger fix immediately after injecting error — closes the run→crash→fix loop
    if (msg.error?.errorBlock) { await handleFixTerminalError({ errorContext: msg.error.fullContext || msg.error.errorBlock }, deps, conversation, refresh); }

  } else if (msg.type === 'fix-terminal-error') {
    await handleFixTerminalError(msg, deps, conversation, refresh);

  } else if (msg.type === 'expanded-interview-submit') {
    await handleExpandedInterviewSubmit(msg, deps, conversation, refresh);

  } else if (msg.type === 'github-commit') {
    await handleGithubCommit(msg, deps);

  // [FIX] Plan Approval Gate — bridges webview plan buttons to the build pipeline Promise
  } else if (msg.type === 'plan-approve' || msg.type === 'plan-revise' || msg.type === 'plan-cancel') {
    await handlePlanApproval(msg);

  // [TOOL-GAP] User chose to copy an install command — drop it on the clipboard, confirm with a toast.
  } else if (msg.type === 'toolgap-copy') {
    await handleToolGapCopy(msg);

  // [TOOL-GAP] User chose the terminal hand-off — open a terminal with the command PRE-FILLED but NOT run.
  } else if (msg.type === 'toolgap-terminal') {
    await handleToolGapTerminal(msg);

  } else if (msg.type === 'check-readiness') {
    await handleCheckReadiness(msg, deps);

  } else if (msg.type === 'save-ai-temperature') {
    // [FIX] Read existing config from root, update aiTemperature, and save back using deps.redivivus.saveConfig()
    try {
      if (deps.onSaveAiTemperature) {
        deps.onSaveAiTemperature(msg.temperature);
      }
    } catch {}

  } else if (msg.type === 'session-override-temperature') {
    deps.redivivus.setSessionAiTemperature(msg.temperature);
    // Reflect back to UI
    panel.webview.postMessage({ type: 'update-behavior-panel', temperature: msg.temperature });
  }
}
