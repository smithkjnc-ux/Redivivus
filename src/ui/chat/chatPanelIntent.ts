// [SCOPE] Chat Panel Intent — classifies user messages and runs the build request handler
// Extracted from chatPanel.ts (was lines 127-221). Keep under 200 lines.

import * as vscode from 'vscode';
import { ChatMessage } from './chatPanelHtml.js';
import { RoutingService } from '../../services/ai/routingService.js';
import { VaultService } from '../../services/vault/vaultService.js';
import { ChassisService } from '../../services/chassisService.js';
import { runSingleFileBuild, runChunkedBuild, isChunkedBuildRequest, runVaultAssemblyBuild, registerVaultHitResolver, resolveVaultHit, BuildContext } from './chatPanelBuild.js';
import { findRelevantByTask, VaultSearchResult } from '../../services/vault/buildFromVaultSearch.js';
import { semanticVaultSearch } from '../../services/vault/vaultSemanticSearch.js';
import { runEditFileBuild, EditBuildContext } from './chatPanelEditBuild.js';
import { assessComplexity, ComplexityResult, shouldRequireDeepInterview } from '../../services/complexityAssessment.js';
import { BuildOrchestrator, BuildBlueprint, BuildPhase } from '../../services/build/buildOrchestrator.js';
import { BUILD_PHASES } from '../../services/build/buildPhaseDefinitions.js';
import { generateVagueWarning, getQuestionsForTier, organizeByCategory } from '../../services/blueprint/expandedInterview.js';
import { isVagueProjectRequest, askScopeQuestions, parseScopeAnswer, hasPendingScopeQuestion, resolveScopeQuestion } from '../../services/project/templateScopeService.js';
import { handleComplexityRoutedBuild, OrchestratorDeps } from './chatPanelOrchestrator.js';
import { runBuildAfterGates } from './chatPanelBuildRunner.js';
import { estimateBuild } from '../../services/costEstimatorService.js';
import { checkBuildPlacement } from '../../services/build/buildPlacementCheck.js';
import { extractBlueprintFromPrompt } from '../../services/blueprint/blueprintExtractor.js';

// [CHASSIS] Pending build-confirm resolvers — keyed by buildId. Resolved by confirm-build / cancel-build messages.
export const _pendingBuildConfirms = new Map<string, (confirmed: boolean) => void>();

// [CHASSIS] Pending placement resolvers — keyed by placementId. Resolved by placement-* messages.
export const _pendingPlacements = new Map<string, (choice: 'here' | 'new-project' | 'cancel') => void>();

/** Called by the message handler when the user responds to the placement modal. */
export function resolvePlacement(placementId: string, choice: 'here' | 'new-project' | 'cancel'): void {
  const resolve = _pendingPlacements.get(placementId);
  if (resolve) { _pendingPlacements.delete(placementId); resolve(choice); }
}

/** Called by the message handler when the user responds to the cost estimate modal. */
export function resolveBuildConfirm(buildId: string, confirmed: boolean): void {
  const resolve = _pendingBuildConfirms.get(buildId);
  if (resolve) { _pendingBuildConfirms.delete(buildId); resolve(confirmed); }
}

/** Shows placement modal and waits for user choice. Returns 'here' | 'new-project' | 'cancel'. */
import { awaitPlacementConfirmation, awaitCostConfirmation } from './chatPanelGates.js';


export interface BuildRequestDeps {
  chassis: ChassisService;
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
  usageTracker?: import('../../services/usageTracker.js').UsageTracker;
}

/** 
 * AI-driven intent classifier - replaces regex pattern matching with natural language understanding.
 * Uses Supervisor AI to classify user messages into intent categories.
 */
import { classifyIntent, isBuildRequest, IntentType, IntentResult, AvailableCommand } from './chatPanelClassifier.js';
export { classifyIntent, isBuildRequest, IntentType, IntentResult, AvailableCommand };

/** Handles a build request — shows choice dialog for complex requests, runs pipeline for simple ones. */
export async function handleBuildRequest(task: string, deps: BuildRequestDeps, skipComplex: boolean = false, isFixRequest: boolean = false): Promise<void> {
  require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[handleBuildRequest entry] task=${task.slice(0,60)} skipComplex=${skipComplex}\n`);
  deps.postToWebview({ type: 'set-status', status: 'working' });

  // ── Scope clarification — ask 2 questions in chat before doing anything for vague requests ──
  // [WARN] Only fires on fresh project-type requests with no detail. Never fires on skipComplex=true
  //        (that's a resumed build that already went through the wizard).
  if (!skipComplex && isVagueProjectRequest(task)) {
    const scopeAnswer = await askScopeQuestions(task, (content) => {
      deps.conversation.push({ role: 'assistant', content, timestamp: Date.now() });
      deps.refresh();
      deps.postToWebview({ type: 'set-status', status: 'ready' });
    });
    if (scopeAnswer) {
      const { enrichedTask } = parseScopeAnswer(scopeAnswer);
      // Note: user's answer is already in conversation (pushed by send-message handler) — don't push again
      // Continue with enriched task — skipComplex=true so we don't re-run scope check
      await handleBuildRequest(enrichedTask, deps, true);
      return;
    }
    // Timed out or no answer — fall through with original task
  }
  // ── Semantic vault signal — silent check, NO UI. Sets semanticHit flag to boost keyword search. ──
  // [DEAD] Previously showed inline code preview + "What would you like to do?" buttons and returned early.
  //        Removed: semantic check must not be a separate UI flow — it feeds into the vault-hit modal only.
  let semanticHit = false;
  if (!skipComplex && deps.vault) {
    const allItems = deps.vault.listItems();
    if (allItems.length > 0) {
      const caller = (prompt: string) => (deps.routing as any).prompt(prompt, 10_000);
      const withTimeout = (p: Promise<any>) => Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), 12_000))]);
      const match = await withTimeout(semanticVaultSearch(task, allItems, caller)).catch(() => null);
      if (match && match.confidence >= 0.95 && !match.intentMismatch) { semanticHit = true; }
    }
  }

  // ── Vault-hit gate (keyword search) — must fire BEFORE cost modal ──
  // Skip when skipComplex=true (resumed build after new project creation — just build, no gates)
// [NEXT] Continued in chatPanelIntentB.ts
}
export { handleEditRequest } from './chatPanelEditHandler.js';
