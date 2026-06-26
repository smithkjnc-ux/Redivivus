// [SCOPE] BuildRequestDeps interface — shared dependency injection bag for build request handlers.
// Extracted from chatPanelIntent.ts (Rule 9 split — was 202 lines).
// All callers import from chatPanelIntent.ts via re-export (no import path changes needed).

import type { ChatMessage } from '../../../features/chat/ui/chatPanelHtml.js';
import type { RoutingService } from '../data/routingService.js';
import type { VaultService } from '../../../features/vault/data/vaultService.js';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { BuildContext } from '../../../features/build/chatPanelBuild.js';

export interface BuildRequestDeps {
  redivivus: RedivivusService;
  routing: RoutingService;
  vault?: VaultService;
  conversation: ChatMessage[];
  blueprintContext: string;
  refresh: () => void;
  logError: (task: string, prompt: string, error: string, promptTokens?: number) => void;
  postToWebview: (msg: unknown) => void;
  onClarifySubmit?: (answers: Record<string, string>) => void;
  setActiveBuildCtx: (ctx: BuildContext | undefined) => void;
  pendingTask: string | undefined;
  setPendingTask: (t: string | undefined) => void;
  usageTracker?: import('../../../features/telemetry/data/usageTracker').UsageTracker;
  buildMode?: 'plan' | 'direct';
}
