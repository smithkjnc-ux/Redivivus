// [SCOPE] BuildRequestDeps interface — shared dependency injection bag for build request handlers.
// Extracted from chatPanelIntent.ts (Rule 9 split — was 202 lines).
// All callers import from chatPanelIntent.ts via re-export (no import path changes needed).

import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { RoutingService } from '../../services/ai/routingService';
import type { VaultService } from '../../services/vault/vaultService';
import type { RedivivusService } from '../../services/redivivusService';
import type { BuildContext } from '../build/chatPanelBuild';

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
  usageTracker?: import('../../services/usageTracker').UsageTracker;
  buildMode?: 'plan' | 'direct';
}
