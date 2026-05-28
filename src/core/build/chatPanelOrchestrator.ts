// [SCOPE] Chat Panel Build Orchestrator — complexity assessment, phased builds, expanded interviews
// Handles deep complexity builds with the "car assembly line" approach.
import * as vscode from 'vscode';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { RoutingService } from '../../services/ai/routingService';
import type { VaultService } from '../../services/vault/vaultService';
import type { RedivivusService } from '../../services/redivivusService';
import type { ComplexityResult} from '../ai/complexityAssessment';
import { assessComplexity, getTierDescription } from '../ai/complexityAssessment';
import { BuildOrchestrator, BuildBlueprint, BuildPlan, BuildPhase } from '../../services/build/buildOrchestrator';
import { generateVagueWarning } from '../../services/blueprint/expandedInterview';
import { createBuildContext } from './chatPanelPhasedBuild';
import { runSingleFileBuild, runChunkedBuild, isChunkedBuildRequest, BuildContext } from './chatPanelBuild';
import type { VaultSearchResult } from '../../services/vault/buildFromVaultSearch';
import type { UsageTracker } from '../../services/usageTracker';
import { inspectPhase, PhaseInspection } from '../inspector/phaseInspector';
import { formatInspectionReport } from '../inspector/phaseInspectorReport';
import { extractBlueprintFromPrompt } from '../../services/blueprint/blueprintExtractor';
import { isValidBuildRoot } from './chatPanelBuildUtils';
import { isModificationRequest } from './chatPanelBuildInference';

export interface OrchestratorDeps {
  redivivus: RedivivusService;
  routing: RoutingService;
  vault?: VaultService;
  usageTracker?: UsageTracker;
  conversation: ChatMessage[];
  blueprintContext: string;
  refresh: () => void;
  logError: (task: string, prompt: string, error: string, promptTokens?: number) => void;
  postToWebview: (msg: unknown) => void;
  setPendingTask: (t: string | undefined) => void;
  precomputedVaultSearch?: VaultSearchResult;
  assistMode?: boolean;
}

// Main entry: assess complexity and route appropriately
export async function handleComplexityRoutedBuild(
  task: string,
  deps: OrchestratorDeps,
  skipInterview = false
): Promise<boolean> {
  // ── STEP 0: Modification/file-reference fast-path — bypass vague warnings entirely ──
  // [FIX] Modification verbs + context words, OR any explicit file mention, means edit existing code.
  // Vague-request warnings must NEVER fire on these — they are for brand-new project requests only.
  const taskLow = task.toLowerCase();
  const hasFileMention = /\b[\w/-]+\.(ts|tsx|js|jsx|py|html|css|scss|json|go|rs)\b/i.test(task);
  const isModify = hasFileMention || await isModificationRequest(taskLow, deps.routing, deps.usageTracker);
  if (isModify && !skipInterview) {
    const complexity = await assessComplexity(task, deps.routing);
    return handleNanoBuild(task, deps, complexity);
  }

  // ── STEP 1: Check for vague requests (fresh new-project builds only) ──
  const vagueWarning = await generateVagueWarning(task, deps.routing);
  if (vagueWarning) {
    deps.conversation.push({
      role: 'assistant',
      content: vagueWarning + '\n\n__ACTION_CARD__redivivus.helpMeRefine|||💬 Help Me Refine This|||END__',
      timestamp: Date.now(),
    });
    deps.refresh();
    return true; // Handled — requires user clarification
  }

  // ── STEP 2: Assess complexity ──
  const complexity = await assessComplexity(task, deps.routing);

  // Show complexity assessment in chat (transparent to user)
  const complexityBadge = complexity.tier === 'nano' ? '🟢' : complexity.tier === 'standard' ? '🟡' : '🔴';
  deps.conversation.push({
    role: 'assistant',
    content: `${complexityBadge} **Complexity Assessment:** ${getTierDescription(complexity.tier)}\n_Score: ${complexity.score}/100 — ${complexity.reasons.slice(0, 3).join(', ')}_`,
    timestamp: Date.now(),
  });
  deps.refresh();

  // ── STEP 3: Route by tier ──
  if (complexity.tier === 'nano' && !skipInterview) {
    // Nano: Single confirm, then immediate build
    return handleNanoBuild(task, deps, complexity);
  }

  if (complexity.tier === 'standard' && !skipInterview) {
    // Standard: 5W interview (existing flow)
    return handleStandardBuild(task, deps, complexity);
  }

  if (complexity.tier === 'deep' || skipInterview) {
    // Deep: Expanded interview + orchestrated phases
    return handleDeepBuild(task, deps, complexity);
  }

  return false;
}

// Nano build: minimal friction, immediate execution
async function handleNanoBuild(
  task: string,
  deps: OrchestratorDeps,
  complexity: ComplexityResult
): Promise<boolean> {
  const rawRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const root = isValidBuildRoot(rawRoot) ? rawRoot : undefined;
  if (!root) {
    // No folder — AI-extract 5W answers then show wizard with pre-fills
    deps.setPendingTask(task);
    const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
    deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: '', prefillTask: task, compact: true, prefillAnswers });
    return true;
  }

  const ctx = createBuildContext(task, deps);
  ctx.buildStartMessage = `⚡ **Nano Build** — Building now...`;
  if (await isChunkedBuildRequest(task, ctx.routing)) {
    await runChunkedBuild(task, ctx);
  } else {
    await runSingleFileBuild(ctx);
  }

  return true;
}

// Standard build: 5W interview then execute
async function handleStandardBuild(
  task: string,
  deps: OrchestratorDeps,
  complexity: ComplexityResult
): Promise<boolean> {
  const rawRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const root = isValidBuildRoot(rawRoot) ? rawRoot : undefined;

  deps.setPendingTask(task);

  // [FIX] Check for .redivivus/ folder (not just blueprint.md) — project may be initialized without blueprint
  const fs = require('fs');
  const path = require('path');
  const redivivusInitialized = root && fs.existsSync(path.join(root, '.redivivus'));

  if (!redivivusInitialized) {
    // No blueprint — AI-extract 5W answers then show wizard with pre-fills
    const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
    deps.postToWebview({
      type: 'show-panel',
      panelType: 'new-project',
      suggestedParent: root ? path.dirname(root) : '',
      prefillTask: task,
      compact: false,
      prefillAnswers,
    });
  } else {
    // [Redivivus] Has blueprint + cost estimate already confirmed — build directly, no second dialog
    const ctx = createBuildContext(task, deps);
    if (await isChunkedBuildRequest(task, ctx.routing)) {
      await runChunkedBuild(task, ctx);
    } else {
      await runSingleFileBuild(ctx);
    }
  }

  return true;
}

// Deep build: expanded interview + orchestrated phases
async function handleDeepBuild(
  task: string,
  deps: OrchestratorDeps,
  complexity: ComplexityResult
): Promise<boolean> {
  const rawRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const root = isValidBuildRoot(rawRoot) ? rawRoot : undefined;

  // Show the "this is complex" warning with phased approach
  const phaseCount = complexity.recommendedPhases;
  deps.conversation.push({
    role: 'assistant',
    content: `🔴 **Complex Build Detected**\n\nThis request requires a **phased build approach** (~${phaseCount} phases).\n\nLike building a car: foundation → data → core → interface → features → polish → delivery.\n\n**Next:** Expanded interview to capture requirements, then we'll build phase by phase.\n\n__ACTION_CARD__redivivus.startExpandedInterview|||📝 Start Expanded Interview|||END__`,
    timestamp: Date.now(),
  });
  deps.refresh();

  deps.setPendingTask(task);

  // Store complexity for when interview completes
  (deps as any)._pendingComplexity = complexity;

  // Trigger expanded interview panel
  deps.postToWebview({
    type: 'show-panel',
    panelType: 'expanded-interview',
    prefillTask: task,
    complexity: complexity,
  });

  return true;
}

// Execute a phased build using the orchestrator
export { executePhasedBuild } from './chatPanelPhasedBuild';
