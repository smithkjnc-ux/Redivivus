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

  // Easter egg: Konami code in the webview triggers the personality picker
  if (msg.type === 'easter-egg-personality') {
    import('../../commands/personalityPicker.js').then(m => m.pickPersonality());
    return;
  }

  // [RULE 18] AI-size the live tier pill — the webview asks, we classify with the AI (never regex), post back.
  if (msg.type === 'classify-route') {
    let tier = 'pro';
    try {
      const { classifyRoute } = await import('../../services/ai/routeClassifier.js');
      const hasProject = !!require('vscode').workspace.workspaceFolders?.length;
      const cls = await classifyRoute(msg.text || '', hasProject, { routing: (panel as any).routing } as any);
      if (cls) { tier = cls.tier; }
    } catch { /* fall through to the safe 'pro' default */ }
    try { _panel?.webview?.postMessage({ type: 'route-tier', text: msg.text, tier }); } catch { /* webview gone */ }
    return;
  }

  if (await handleEarlyExits(panel, msg)) { return; }

  // Pre-load buildMode from VS Code setting on first message if the user hasn't chosen yet this session.
  // Translates the public setting values ('auto'/'guided') to internal values ('direct'/'plan').
  if (!state.buildMode) {
    const saved = (require('vscode').workspace.getConfiguration('redivivus').get('buildMode', '') as string);
    if (saved === 'auto') { state.buildMode = 'direct'; }
    else if (saved === 'guided') { state.buildMode = 'plan'; }
  }

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

  // [FIX] The send button spins via setInputBusy(true) on send but had NO stop — the webview was never told the
  // turn finished, so the spinner ran forever. Signal turn-done in a finally (covers success AND error) for the
  // message types that start a turn, so the webview can reset the send button.
  const _isTurn = msg.type === 'send-message' || msg.type === 'fix-request' || msg.type === 'map-context';
  try {
    await handleChatMessage(msg, msgDeps);
  } finally {
    if (_isTurn) { try { _panel?.webview?.postMessage({ type: 'turn-done' }); } catch { /* webview gone */ } }
  }

  // [FIX] Sync planInterview back to state — startPlanInterview sets it on msgDeps but state is separate
  if (msgDeps.planInterview !== state.planInterview) { state.planInterview = msgDeps.planInterview; }
}
