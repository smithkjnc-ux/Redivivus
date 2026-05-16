// [SCOPE] CHASSIS Chat Panel message handler — thin router, delegates to handler sub-modules
// Sub-modules: chatPanelMsgSendMessage, chatPanelMsgFileOps, chatPanelMsgProjectOps, chatPanelMsgArchitect, chatPanelMsgSpecial

import * as vscode from 'vscode';
import { RoutingService } from '../../services/ai/routingService.js';
import { UsageTracker } from '../../services/usageTracker.js';
import { ChassisService } from '../../services/chassisService.js';
import { ChatMessage } from './chatPanelHtml.js';
import { resolveBuildConfirm, resolvePlacement } from './chatPanelIntent.js';
import { resolveVaultHit } from './chatPanelBuild.js';
import { handleSendMessage } from './chatPanelMsgSendMessage.js';
import { handleUndoBuild, handleBuildFeedback, handleOpenFile, handleOpenInBrowser, handleCreateFile, handlePreviewBrowser } from './chatPanelMsgFileOps.js';
import { handleRunCommand, handleOpenProject, handleOpenExistingProject, handleOpenRecentProject, handleToggleSetting, handleBrowseFolder } from './chatPanelMsgProjectOps.js';
import { handleArchitectExplain, handleArchitectAddTodos, handleArchitectFixAll, handleArchitectFixOne } from './chatPanelMsgArchitect.js';
import { handleBlueprintGapAnswer, handleBlueprintGapSkip, handleVaultDedupPreview, handleVaultDedupMerge, handleInjectTerminalError, handleFixTerminalError } from './chatPanelMsgSpecial.js';
import { handleMapContext } from './chatPanelMsgMapContext.js';

export interface MessageHandlerDeps {
  chassis: ChassisService;
  routing: RoutingService;
  usageTracker?: UsageTracker;
  conversation: ChatMessage[];
  panel: vscode.WebviewPanel;
  isBuildRequest: (text: string) => Promise<boolean>;
  classifyIntent?: (text: string) => Promise<{ type: 'build' | 'convert' | 'command' | 'question' | 'offtopic' | 'run'; command?: string }>;
  handleBuildRequest: (task: string, skipComplex?: boolean, isFixRequest?: boolean) => Promise<void>;
  buildFromVaultPrefill: () => { task?: string; targetFile?: string };
  refresh: () => void;
  setLastModel?: (model: string) => void;
  onStartSession?: (goal: string, ai: string) => Promise<void>;
  onSwitchAI?: (ai: string) => Promise<void>;
  onNewProject?: (name: string, answers: Record<string, string>, folderPath?: string) => Promise<void>;
  buildMode?: 'plan' | 'direct';
  planInterview?: import('./chatPanelPlanInterview.js').PlanInterviewState;
}


export async function handleChatMessage(msg: any, deps: MessageHandlerDeps): Promise<void> {
  const { routing, conversation, panel, refresh } = deps;

  if (msg.type === 'send-message') {
    // [CHASSIS] Plan mode: if interview is active, route to conversational interview handler
    if (deps.buildMode === 'plan' && deps.planInterview && deps.planInterview.step < 8) {
      const { handlePlanInterviewAnswer } = await import('./chatPanelPlanInterview.js');
      await handlePlanInterviewAnswer(msg, deps);
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

  } else if (msg.type === 'create-file') {
    await handleCreateFile(msg);

  } else if (msg.type === 'clear-chat') {
    conversation.length = 0; refresh();

  } else if (msg.type === 'run-command') {
    await handleRunCommand(msg, deps, panel);

  } else if (msg.type === 'start-session') {
    if (deps.onStartSession) { await deps.onStartSession(msg.goal || '', msg.ai || 'Unknown'); }

  } else if (msg.type === 'switch-ai') {
    if (deps.onSwitchAI) { await deps.onSwitchAI(msg.ai || 'gemini'); }

  } else if (msg.type === 'new-project') {
    require('fs').appendFileSync(require('os').homedir() + '/chassis_debug.log', `[chatPanelMessages] new-project received name=${msg.name}
`);
    if (deps.onNewProject) {
      const answers = msg.answers || {};
      if (msg.originalTask) { answers._originalTask = msg.originalTask; }
      await deps.onNewProject(msg.name || '', answers, msg.folderPath || undefined);
    }

  } else if (msg.type === 'open-project') {
    await handleOpenProject(msg);

  } else if (msg.type === 'start-new-project') {
    deps.buildMode = msg.mode === 'plan' ? 'plan' : 'direct';
    deps.planInterview = undefined;
    if (msg.mode === 'plan') {
      const { startPlanInterview } = await import('./chatPanelPlanInterview.js');
      await startPlanInterview(deps);
    } else {
      // Just Build: prompt the user to describe what they want — AI handles it from there
      conversation.push({ role: 'assistant', content: "What would you like to build? Describe it in plain English and I'll get started.", timestamp: Date.now() });
    }
    refresh();

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

  } else if (msg.type === 'placement-add-here') {
    if (msg.placementId) { resolvePlacement(msg.placementId, 'here'); }

  } else if (msg.type === 'placement-new-project') {
    if (msg.placementId) { resolvePlacement(msg.placementId, 'new-project'); }

  } else if (msg.type === 'placement-cancel') {
    if (msg.placementId) { resolvePlacement(msg.placementId, 'cancel'); }

  } else if (msg.type === 'scope-submit') {
    const { resolveScopeQuestion } = await import('../../services/project/templateScopeService.js');
    resolveScopeQuestion(msg.answer || '');

  } else if (msg.type === 'scope-cancel') {
    const { clearPendingScopeQuestion } = await import('../../services/project/templateScopeService.js');
    clearPendingScopeQuestion();

  } else if (msg.type === 'template-wizard-submit' || msg.type === 'template-wizard-cancel') {
    try {
      const { resolveTemplateWizard } = await import('../../services/project/templateWizard.js');
      resolveTemplateWizard(msg);
    } catch { /* wizard may have already timed out */ }

  } else if (msg.type === 'architect-dismiss') {
    // no-op

  } else if (msg.type === 'architect-explain') {
    await handleArchitectExplain(msg, routing, conversation, refresh);

  } else if (msg.type === 'architect-add-todos') {
    handleArchitectAddTodos(msg, conversation, refresh);

  } else if (msg.type === 'architect-fix-all') {
    await handleArchitectFixAll(msg, conversation, refresh);

  } else if (msg.type === 'architect-fix-one') {
    await handleArchitectFixOne(msg, conversation, refresh);

  } else if (msg.type === 'blueprint-gap-answer') {
    await handleBlueprintGapAnswer(msg, deps, conversation, refresh);

  } else if (msg.type === 'blueprint-gap-skip') {
    await handleBlueprintGapSkip(msg, deps, conversation, refresh);

  } else if (msg.type === 'vault-dedup-preview') {
    handleVaultDedupPreview(msg, conversation, refresh);

  } else if (msg.type === 'vault-dedup-merge') {
    await handleVaultDedupMerge(conversation, refresh);

  } else if (msg.type === 'inject-terminal-error') {
    handleInjectTerminalError(msg, conversation, refresh);

  } else if (msg.type === 'fix-terminal-error') {
    await handleFixTerminalError(msg, deps, conversation, refresh);
  }
}
