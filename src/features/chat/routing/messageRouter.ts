// [SCOPE] WebView message router orchestrator — attaches handler modules to webview and routes messages
// Split from 434-line monolith. Each responsibility now lives in its own file under 200 lines.
// [WARN] All handler modules share the same state object — mutations must be coordinated.

import type * as vscode from 'vscode';
import type { RedivivusService } from '../../../shared/vscode/application/redivivusService.js';
import type { SessionService } from '../../project/application/sessionService.js';
import type { VaultService } from '../../vault/infrastructure/vaultService.js';
import type { RoutingService } from '../../../shared/ai/infrastructure/routingService.js';
import type { GuardianService } from '../../../shared/ai/infrastructure/guardianService.js';
import type { IntentService } from './intentService.js';
import { WizardPanelState } from './messageRouterTypes.js';

export { WizardPanelState };
import { handleCoreMessage } from './messageRouterCore.js';
import { handleSessionMessage } from './messageRouterSession.js';
import { handleWizardMessage } from './messageRouterWizard.js';
import { handleVaultMessage } from './messageRouterVault.js';
import { handleVaultScanMessage } from './messageRouterVaultScan.js';
import { handleVaultRecategorizeMessage } from './messageRouterVaultRecategorize.js';
import { handleMapMessage } from './messageRouterMap.js';

export function attachMessageRouter(
  webview: vscode.Webview,
  redivivus: RedivivusService,
  sessions: SessionService,
  vaultService: VaultService,
  context: vscode.ExtensionContext | undefined,
  state: WizardPanelState,
  refresh: () => void,
  routingService?: RoutingService,
  guardianService?: GuardianService,
  intentService?: IntentService
): void {
  webview.onDidReceiveMessage(async (msg) => {
    if (!msg.type && msg.command) { msg.type = 'command'; }

    const postToWebview = (m: any) => webview.postMessage(m);
    const handled =
      await handleCoreMessage(msg, redivivus, state, refresh, postToWebview) ||
      await handleSessionMessage(msg, sessions, refresh) ||
      await handleWizardMessage(msg, redivivus, state, context, refresh) ||
      await handleVaultMessage(msg, vaultService, state, refresh) ||
      await handleVaultScanMessage(msg, vaultService, routingService, state, refresh) ||
      await handleVaultRecategorizeMessage(msg, vaultService, routingService, state, refresh) ||
      (guardianService ? await handleMapMessage(msg, state, guardianService, refresh, webview, intentService) : false);

    // If no handler matched, ignore silently (unknown message)
  });
}