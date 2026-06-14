import type * as vscode from 'vscode';
import type { RoutingService } from '../../services/ai/routingService';
import type { UsageTracker } from '../../services/usageTracker';
import type { RedivivusService } from '../../services/redivivusService';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';

export interface MessageHandlerDeps {
  redivivus: RedivivusService;
  routing: RoutingService;
  usageTracker?: UsageTracker;
  conversation: ChatMessage[];
  panel: vscode.WebviewPanel;
  isBuildRequest: (text: string) => Promise<boolean>;
  classifyIntent?: (text: string) => Promise<{ type: 'build' | 'convert' | 'command' | 'question' | 'offtopic' | 'run' | 'fix' | 'scaffold' | 'service'; command?: string; subtype?: string }>;
  handleBuildRequest: (task: string, skipComplex?: boolean, isFixRequest?: boolean) => Promise<void>;
  buildFromVaultPrefill: () => { task?: string; targetFile?: string };
  refresh: () => void;
  setLastModel?: (model: string) => void;
  onStartSession?: (goal: string, ai: string) => Promise<void>;
  onSwitchAI?: (ai: string) => Promise<void>;
  onNewProject?: (name: string, answers: Record<string, string>, folderPath?: string) => Promise<void>;
  buildMode?: 'plan' | 'direct'; assistMode?: boolean; vault?: import('../../services/vault/vaultService').VaultService;
  planInterview?: import('../../ui/panels/chat/chatPanelPlanInterview').PlanInterviewState;
  setBlueprintContext?: (ctx: string) => void;
  // [PHASE 0] Shared per-turn context (see turnContext.ts + docs/REDIVIVUS_INTENT_ARCHITECTURE.md). Set at the
  // top of handleSendMessage and threaded everywhere deps flows. SCAFFOLD ONLY — nothing reads it yet.
  turnContext?: import('./turnContext').TurnContext;
  // [SUPERVISOR_TIER] Per-turn hint of the complexity tier (from the chat pre-pass) used to size the fix
  // Supervisor's own diagnosis model. Set after cloudChat; read in runPhase1Supervisor. Absent -> default 'pro'.
  supervisorTierHint?: 'flash' | 'pro' | 'ultra';
}
