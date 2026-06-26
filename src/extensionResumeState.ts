// [SCOPE] Extension resume-state helpers — runs at activation to resume flows interrupted by a folder close/reload.
// Handles: pendingBuildTask, pendingVaultBuild, pendingNewProjectMode.

import * as vscode from 'vscode';
import type { RedivivusService } from './shared/vscode/application/redivivusService.js';
import type { RoutingService } from './shared/ai/infrastructure/routingService.js';
import type { UsageTracker } from './features/telemetry/infrastructure/usageTracker.js';
import type { VaultService } from './features/vault/infrastructure/vaultService.js';
import { ChatPanel } from './features/chat/ui/chatPanel.js';

type ShowArgs = [RedivivusService, RoutingService, UsageTracker | undefined, VaultService];

async function openPanel(args: ShowArgs, delayMs = 800, innerDelayMs = 400): Promise<void> {
  await new Promise(r => setTimeout(r, delayMs));
  ChatPanel.show(...args);
  await new Promise(r => setTimeout(r, innerDelayMs));
}

// [FIX] Resolve once SecretStorage keys have loaded so a resumed build uses the real roster
// (Claude supervisor) instead of the stale pre-init default. Times out after 8s so a failed/slow
// key init never hangs the build forever — it proceeds with whatever keys are available by then.
async function awaitKeysReady(timeoutMs = 8000): Promise<void> {
  try {
    const { onSecretKeyStoreReady } = await import('./shared/ai/infrastructure/secretKeyStore.js');
    await Promise.race([
      new Promise<void>(resolve => onSecretKeyStoreReady(() => resolve())),
      new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  } catch { /* non-blocking — proceed without gating */ }
}

// [FIX] Wait for whatever panel the deserializer or auto-open timer naturally produces, instead of
// calling ChatPanel.show() ourselves — show() crashes on the deserializer sentinel and racing it
// against the auto-open timer spawns a duplicate tab. Resolves with the live panel or undefined.
async function waitForPanel(timeoutMs = 4000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cp = ChatPanel.currentPanel;
    if (cp && !(ChatPanel as any)._isDeserializing) {
      await new Promise(r => setTimeout(r, 200)); // let it settle
      return ChatPanel.currentPanel;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return undefined;
}

export function resumePendingState(
  context: vscode.ExtensionContext,
  showArgs: ShowArgs,
): void {
  // ── restore conversation after successful build opened a new folder ──
  const pendingBuildComplete = context.globalState.get<boolean>('redivivus.pendingBuildComplete');
  if (pendingBuildComplete) {
    context.globalState.update('redivivus.pendingBuildComplete', undefined);
    const rescuedConv = context.globalState.get<any[]>('redivivus.pendingRescueConversation');
    if (rescuedConv && rescuedConv.length > 0) {
      context.globalState.update('redivivus.pendingRescueConversation', undefined);
      (async () => {
        const cp = await waitForPanel();
        if (cp) {
          const conv = cp.getConversation();
          conv.splice(0, conv.length, ...rescuedConv);
          cp.refresh();
        }
      })();
    }
    return;
  }

  // ── resume build task after reload (openFolder / updateWorkspaceFolders 0→1 restarts the host) ──
  // [FIX] Saved by onNewProject and the auto-create build path BEFORE the reload so the task survives.
  // The auto-create path opens the folder FIRST so the Explorer shows the scaffold and files appear
  // live as the resumed build writes them.
  const pendingResumeRaw = context.globalState.get<string>('redivivus.pendingResumeTask');
  if (pendingResumeRaw) {
    context.globalState.update('redivivus.pendingResumeTask', undefined);
    try {
      const { task, projectRoot } = JSON.parse(pendingResumeRaw);
      (async () => {
        // Focus the Explorer so the user watches files appear as the resumed build writes them.
        vscode.commands.executeCommand('workbench.view.explorer').then(undefined, () => {});
        const cp = await waitForPanel();
        if (cp) {
          // Restore chat history wiped by the window reload
          const rescuedConv = context.globalState.get<any[]>('redivivus.pendingRescueConversation');
          if (rescuedConv && rescuedConv.length > 0) {
             context.globalState.update('redivivus.pendingRescueConversation', undefined);
             const conv = cp.getConversation();
             conv.splice(0, conv.length, ...rescuedConv);
             cp.refresh();
          }
          // [FIX] Wait for SecretStorage keys to load BEFORE resuming — otherwise the build runs
          // with the stale pre-init roster (Gemini +2) instead of the real key set (Claude +5),
          // and the Supervisor call fails (400 / missing key) producing a 0-file "built solo" result.
          // Invalidate the roster cache after keys load so the right models are selected.
          await awaitKeysReady();
          try {
            const { invalidateRosterCache } = await import('./shared/ai/infrastructure/routingServiceRoster.js');
            invalidateRosterCache();
          } catch { /* non-blocking */ }
          cp.resumeBuildTask(task, projectRoot);
        }
      })();
    } catch { /* ignore parse errors from stale entries */ }
    return; // skip other resume paths — this takes priority
  }

  // [DEAD] Removed conversation restore after intentional workspace open.
  // User wants a fresh project chat screen, not the old conversation history.
  // Build-result cards are shown via pendingBuildResult, not rescued conversation.

  // ── resume build task (wizard path — shows new-project panel) ──
  const pendingBuildTask = context.globalState.get<string>('redivivus.pendingBuildTask');
  if (pendingBuildTask) {
    context.globalState.update('redivivus.pendingBuildTask', undefined);
    (async () => {
      await openPanel(showArgs);
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.showNewProject('', pendingBuildTask, /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(pendingBuildTask));
      }
    })();
  }

  // ── resume vault build ──
  const pendingVaultBuild = context.globalState.get<boolean>('redivivus.pendingVaultBuild');
  if (pendingVaultBuild) {
    context.globalState.update('redivivus.pendingVaultBuild', undefined);
    setTimeout(() => { vscode.commands.executeCommand('redivivus.buildFromVault'); }, 800);
  }

  // ── show vault build summary after folder reload ──
  const pendingVaultSummary = context.globalState.get<string>('redivivus.pendingVaultSummary');
  if (pendingVaultSummary) {
    context.globalState.update('redivivus.pendingVaultSummary', undefined);
    (async () => {
      await openPanel(showArgs);
      const cp = ChatPanel.currentPanel;
      if (cp) {
        cp.getConversation().push({ role: 'assistant', content: pendingVaultSummary, timestamp: Date.now() });
        (cp as any).refresh();
      }
    })();
  }

  // ── show build result card after auto-save triggered vscode.openFolder ──
  const pendingBuildResult = context.globalState.get<{
    filename: string; root: string; model?: string; tokens?: number; absPath: string; timestamp: number;
  }>('redivivus.pendingBuildResult');
  if (pendingBuildResult) {
    context.globalState.update('redivivus.pendingBuildResult', undefined);
    const { filename, model, tokens, absPath } = pendingBuildResult;
    const modelLabel = model ?? 'AI';
    const breakdownToken = tokens ? `\n__AI_BREAKDOWN__${modelLabel}~solo~built~${tokens}~0.00000000~0~primary builder|||END_BREAKDOWN__` : '';
    const previewToken = filename.endsWith('.html')
      ? `\n__PREVIEW_BROWSER__${absPath}|||END_PREVIEW_BROWSER__`
      : '';
    const resultMsg = `__RESULT_CARD__\n✅ Done! Built 1 file\n\n- \`${filename}\`\n__END_RESULT_CARD__${previewToken}${breakdownToken}`;
    (async () => {
      await openPanel(showArgs, 100, 250);
      const cp = ChatPanel.currentPanel;
      if (cp) {
        cp.getConversation().push({ role: 'assistant', content: resultMsg, timestamp: Date.now() });
        (cp as any).refresh();
        // Also open the built file in the editor
        try {
          const vscodeUri = (await import('vscode')).Uri.file(absPath);
          const doc = await (await import('vscode')).workspace.openTextDocument(vscodeUri);
          await (await import('vscode')).window.showTextDocument(doc, { preview: false });
        } catch { /* best-effort */ }
      }
    })();
    return;
  }

  // ── clear stale flags from old code paths ──
  context.globalState.update('redivivus.pendingNewProjectMode', undefined);
  context.globalState.update('redivivus.pendingNewProjectTask', undefined);
}
