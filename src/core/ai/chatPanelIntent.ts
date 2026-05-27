// [SCOPE] Chat Panel Intent — classifies user messages and runs the build request handler
// Extracted from chatPanel.ts (was lines 127-221). Keep under 200 lines.

import * as vscode from 'vscode';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { RoutingService } from '../../services/ai/routingService';
import type { VaultService } from '../../services/vault/vaultService';
import type { RedivivusService } from '../../services/redivivusService';
import type { BuildContext } from '../build/chatPanelBuild';
import { runSingleFileBuild, runChunkedBuild, isChunkedBuildRequest, runVaultAssemblyBuild, registerVaultHitResolver, resolveVaultHit } from '../build/chatPanelBuild';
import type { VaultSearchResult } from '../../services/vault/buildFromVaultSearch';
import { findRelevantByTask } from '../../services/vault/buildFromVaultSearch';
import { semanticVaultSearch } from '../../services/vault/vaultSemanticSearch';
import { runEditFileBuild, EditBuildContext } from '../build/chatPanelEditBuild';
import { assessComplexity, ComplexityResult, shouldRequireDeepInterview } from './complexityAssessment';
import { BuildOrchestrator, BuildBlueprint, BuildPhase } from '../../services/build/buildOrchestrator';
import { BUILD_PHASES } from '../../services/build/buildPhaseDefinitions';
import { generateVagueWarning, getQuestionsForTier, organizeByCategory } from '../../services/blueprint/expandedInterview';
import { isVagueProjectRequest, askScopeQuestions, parseScopeAnswer, hasPendingScopeQuestion, resolveScopeQuestion } from '../../services/project/templateScopeService';
import { handleComplexityRoutedBuild, OrchestratorDeps } from '../build/chatPanelOrchestrator';
import { runBuildAfterGates } from '../build/chatPanelBuildRunner';
import { autoCreateProject } from '../build/chatPanelBuildAutoCreate';
import { estimateBuild } from './costEstimatorService';
import { checkBuildPlacement } from '../../services/build/buildPlacementCheck';
import { extractBlueprintFromPrompt } from '../../services/blueprint/blueprintExtractor';

// [Redivivus] Moved resolvers to chatPanelResolvers.ts

/** Shows placement modal and waits for user choice. Returns 'here' | 'new-project' | 'cancel'. */
import { awaitPlacementConfirmation, awaitCostConfirmation } from '../../ui/panels/chat/chatPanelGates';


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

/** 
 * AI-driven intent classifier - replaces regex pattern matching with natural language understanding.
 * Uses Supervisor AI to classify user messages into intent categories.
 */
import { classifyIntent, isBuildRequest, IntentType, IntentResult, AvailableCommand } from './chatPanelClassifier';
import { tracer } from '../../services/pipelineTracer';
export { classifyIntent, isBuildRequest, IntentType, IntentResult, AvailableCommand };

/** Handles a build request — shows choice dialog for complex requests, runs pipeline for simple ones. */
export async function handleBuildRequest(task: string, deps: BuildRequestDeps, skipComplex: boolean = false, isFixRequest: boolean = false): Promise<void> {
  deps.postToWebview({ type: 'set-status', status: 'working' });
  
  // Hard auth gate — check FIRST before asking scope questions
  const { getAccountToken } = await import('../../services/api/apiClient.js');
  const token = await getAccountToken();
  if (!token) {
    deps.postToWebview({ type: 'set-status', status: 'ready' });
    deps.conversation.push({
      role: 'assistant',
      content: '🔒 **Sign in to use Redivivus**\n\nOpen the command palette and run **Redivivus: Sign In** to connect your account.',
      timestamp: Date.now(),
    });
    deps.refresh();
    vscode.commands.executeCommand('redivivus.signIn');
    return;
  }

  // [FIX] No workspace open → skip all gates (scope, vault, cost). Auto-create handles project setup.
  if (!vscode.workspace.workspaceFolders?.length) { skipComplex = true; }
  if (!skipComplex) {tracer.start(task);}

  // ── Scope clarification — ask 2 questions in chat before doing anything for vague requests ──
  // [WARN] Only fires on fresh project-type requests with no detail. Never fires on skipComplex=true
  //        (that's a resumed build that already went through the wizard).
  // Direct mode: skip scope clarification entirely (auto-approve scope)
  // Initialized projects: skip scope clarification — user is modifying, not starting fresh
  if (!skipComplex && deps.buildMode !== 'direct' && !deps.redivivus?.isInitialized?.() && await isVagueProjectRequest(task, deps.routing)) {
    const scopeAnswer = await askScopeQuestions(task, deps.postToWebview);
    if (scopeAnswer) {
      const { enrichedTask } = await parseScopeAnswer(scopeAnswer, deps.routing);
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
  let precomputedVaultSearch: VaultSearchResult | undefined;
  if (!skipComplex && deps.vault) {
    const vaultHits = findRelevantByTask(task, deps.vault.listItems());
    // AI relevance pre-filter — keyword search produces false positives; only show modal for genuinely relevant items
    let relevantItems = vaultHits.items;
    if (relevantItems.length > 2) {
      try {
        const itemList = relevantItems.slice(0,12).map((it:any,i:number)=>`${i+1}. ${it.name}: ${(it.description||'').slice(0,80)}`).join('\n');
        const checkRes = await deps.routing.routeByComplexity(task, `Task: "${task.slice(0,200)}"\n\nVault components:\n${itemList}\n\nWhich are directly relevant to this task? Reply ONLY with comma-separated numbers (e.g. "1,3") or "none".`, 12_000);
        const reply = ((checkRes as any).text||'').trim().toLowerCase();
        const nums = (reply.match(/\d+/g)||[]).map(Number);
        if (reply==='none'||nums.length===0){relevantItems=[];}else{relevantItems=relevantItems.filter((_:any,i:number)=>nums.includes(i+1));}
      } catch {}
    }
    if (relevantItems.length > 0 || semanticHit) {
      tracer.vault('hit', `${relevantItems.length} relevant (${vaultHits.items.length} raw) — "${task.slice(0, 40)}"`);
      tracer.gate('Vault-Hit', `${relevantItems.length} relevant matches — showing choice modal`);
      precomputedVaultSearch = { ...vaultHits, items: relevantItems };
      const resolverId = `vault-${Date.now()}`;
      const choice = await new Promise<'use-vault' | 'build-fresh' | 'cancel'>((resolve) => {
        registerVaultHitResolver(resolverId, resolve as any);
        deps.postToWebview({ type: 'show-vault-hit', resolverId, task, matchCount: relevantItems.length, isSemantic: semanticHit });
        setTimeout(() => resolve('cancel'), 60000);
      });
      if (choice === 'cancel') { deps.postToWebview({ type: 'set-status', status: 'ready' }); return; }
      if (choice === 'use-vault') {
        let vaultRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        let vaultBlueprintContext = deps.blueprintContext;
        let autoCreated = false;
        if (!vaultRoot) {
          try {
            const created = await autoCreateProject(task, deps);
            vaultRoot = created.dir;
            vaultBlueprintContext = created.blueprintContext;
            autoCreated = true;
          } catch (e) {
            deps.conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
            deps.refresh();
            deps.postToWebview({ type: 'set-status', status: 'ready' });
            return;
          }
        }
        const ctx = { task, root: vaultRoot!, blueprintContext: vaultBlueprintContext, vault: deps.vault, redivivus: deps.redivivus, routing: deps.routing, conversation: deps.conversation, refresh: deps.refresh, logError: deps.logError, postToWebview: deps.postToWebview };
        await runVaultAssemblyBuild(ctx, relevantItems);
        if (autoCreated && vaultRoot) {
          // [DEAD] Was: showInformationMessage -- users expect auto-open
          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(vaultRoot));
        }
        deps.postToWebview({ type: 'set-status', status: 'ready' });
        return;
      }
      // if 'build-fresh', fall through to cost estimate
    }
  }

  // ── Cost Estimate gate ──
  // Direct mode: skip cost estimate gate entirely (auto-approve)
  if (!skipComplex && deps.buildMode !== 'direct') {
    const confirmed = await awaitCostConfirmation(task, deps);
    tracer.gate('Cost', confirmed ? 'approved' : 'user cancelled');
    if (!confirmed) { deps.postToWebview({ type: 'set-status', status: 'ready' }); return; }
  }

  // ── Plan mode: check blueprint completeness before building ──
  if (deps.buildMode === 'plan' && !skipComplex) {
    const config = deps.redivivus?.isInitialized?.() ? deps.redivivus.loadConfig() : null;
    const bp = config?.blueprint;
    const hasCompleteBlueprint = bp && ['who','what','where','when','why'].every((k: string) => (bp as any)[k] && (bp as any)[k].trim().length > 0);
    if (!hasCompleteBlueprint) {
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      deps.postToWebview({ type: 'assistant-message', text: '📋 **Plan Mode Active** — Let\'s complete your project blueprint first. I\'m starting the 5 W\'s interview...' });
      // Trigger blueprint interview via command; after completion user can re-submit the build request
      await vscode.commands.executeCommand('redivivus.blueprintInterview');
      return;
    }
  }

  // ── All gates passed, run the build ──
  await runBuildAfterGates(task, deps, skipComplex, isFixRequest, precomputedVaultSearch);
}
export { handleEditRequest } from '../../ui/panels/chat/chatPanelEditHandler';
