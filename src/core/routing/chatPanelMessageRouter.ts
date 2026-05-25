// [SCOPE] Chat Panel Message Router — entry point, delegates early exits then handleChatMessage
// Early-exit handlers (bi, fix, build, folder, mode, gates) -> chatPanelMessageRouterEarlyExits.ts

import { ChatPanel } from '../../ui/panels/chat/chatPanel';
import { handleChatMessage } from './chatPanelMessages';
import { handleEarlyExits } from './chatPanelMessageRouterEarlyExits';

export async function handlePanelMessage(panel: ChatPanel, msg: any): Promise<void> {
  const state = (panel as any).state;
  const _panel = (panel as any)._panel;

  require('fs').appendFileSync(require('os').homedir() + '/redivivus_debug.log', `[handleMessage] type=${msg.type} name=${msg.name || ''}\n`);

  // Remap analysis prompts sent as fix-request to map-context so they route correctly
  if (msg.type === 'fix-request' && /^You are (a senior software architect|a code analyst|explaining code|a code reviewer|a test engineer)\b/.test(msg.text?.trim() || '')) {
    msg = { type: 'map-context', nodeId: '', label: '', lines: 0, health: 'neutral', todos: 0, _explainPrompt: msg.text, _displayLabel: 'Analysis' };
  }

  if (await handleEarlyExits(panel, msg)) { return; }

  // [FIX] start-new-project sets deps.buildMode/planInterview locally in handleChatMessage but never
  // writes back to state. Pre-sync buildMode here; planInterview is synced after handleChatMessage.
  if (msg.type === 'start-new-project') {
    state.buildMode = msg.mode === 'plan' ? 'plan' : (msg.mode === 'direct' ? 'direct' : undefined);
    if (msg.mode !== 'plan') { state.planInterview = undefined; }
    if (msg.assistMode) {
      state.assistMode = true;
      const r = require('vscode').workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (r) { try { require('fs').writeFileSync(require('path').join(r, '.redivivus-assist'), JSON.stringify({ mode: 'assist', addedAt: new Date().toISOString().slice(0, 10) })); } catch {} }
    }
  }

  const msgDeps = {
    redivivus: (panel as any).redivivus,
    routing: (panel as any).routing,
    usageTracker: (panel as any).usageTracker,
    conversation: state.conversation,
    panel: _panel,
    isBuildRequest: async (t: string) => (panel as any)._isBuildRequest(t),
    classifyIntent: async (t: string) => (panel as any)._classifyIntent(t),
    handleBuildRequest: (t: string, skipComplex?: boolean, isFixRequest?: boolean) => (panel as any)._handleBuildRequest(t, skipComplex, isFixRequest),
    buildFromVaultPrefill: () => (panel as any)._buildFromVaultPrefill(),
    refresh: () => panel.refresh(),
    onStartSession: ChatPanel.onStartSession,
    onSwitchAI: ChatPanel.onSwitchAI,
    onNewProject: ChatPanel.onNewProject,
    setLastModel: (model: string) => { (panel as any).state.lastModel = model; },
    setBlueprintContext: (ctx: string) => { state.blueprintContext = ctx; },
    buildMode: state.buildMode, assistMode: state.assistMode, vault: (panel as any).vault,
    planInterview: state.planInterview,
  };

  await handleChatMessage(msg, msgDeps);

  // [FIX] Sync planInterview back to state — startPlanInterview sets it on msgDeps but state is separate
  if (msgDeps.planInterview !== state.planInterview) { state.planInterview = msgDeps.planInterview; }
}
