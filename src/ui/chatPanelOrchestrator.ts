// [SCOPE] Chat Panel Build Orchestrator — complexity assessment, phased builds, expanded interviews
// Handles deep complexity builds with the "car assembly line" approach

import * as vscode from 'vscode';
import { ChatMessage } from './chatPanelHtml.js';
import { RoutingService } from '../services/routingService.js';
import { VaultService } from '../services/vaultService.js';
import { ChassisService } from '../services/chassisService.js';
import { assessComplexity, ComplexityResult, getTierDescription } from '../services/complexityAssessment.js';
import { BuildOrchestrator, BuildBlueprint, BuildPlan, BuildPhase } from '../services/buildOrchestrator.js';
import { generateVagueWarning } from '../services/expandedInterview.js';
import { runSingleFileBuild, BuildContext } from './chatPanelBuild.js';
import { VaultSearchResult } from '../services/buildFromVaultSearch.js';
import { inspectPhase, formatInspectionReport, PhaseInspection } from '../services/phaseInspector.js';
import { extractBlueprintFromPrompt } from '../services/blueprintExtractor.js';

export interface OrchestratorDeps {
  chassis: ChassisService;
  routing: RoutingService;
  vault?: VaultService;
  conversation: ChatMessage[];
  blueprintContext: string;
  refresh: () => void;
  logError: (task: string, prompt: string, error: string, promptTokens?: number) => void;
  postToWebview: (msg: unknown) => void;
  setPendingTask: (t: string | undefined) => void;
  /** Pre-computed vault search from handleBuildRequest — skips re-running vault search */
  precomputedVaultSearch?: VaultSearchResult;
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
  const isModify = /\b(add|fix|update|change|modify|edit|refactor)\b/.test(taskLow) &&
                   /\b(to|in|this|the|existing|index|src|file)\b/.test(taskLow);
  if ((isModify || hasFileMention) && !skipInterview) {
    const complexity = assessComplexity(task);
    return handleNanoBuild(task, deps, complexity);
  }

  // ── STEP 1: Check for vague requests (fresh new-project builds only) ──
  const vagueWarning = generateVagueWarning(task);
  if (vagueWarning) {
    deps.conversation.push({
      role: 'assistant',
      content: vagueWarning + '\n\n__ACTION_CARD__chassis.helpMeRefine|||💬 Help Me Refine This|||END__',
      timestamp: Date.now(),
    });
    deps.refresh();
    return true; // Handled — requires user clarification
  }

  // ── STEP 2: Assess complexity ──
  const complexity = assessComplexity(task);

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
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    // No folder — AI-extract 5W answers then show wizard with pre-fills
    deps.setPendingTask(task);
    const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
    deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: '', prefillTask: task, compact: true, prefillAnswers });
    return true;
  }

  // [CHASSIS] Cost estimate modal already confirmed upstream — build directly
  // buildStartMessage is pushed inside runSingleFileBuild AFTER vault-hit resolution
  const ctx = createBuildContext(task, deps);
  ctx.buildStartMessage = `⚡ **Nano Build** — Building now...`;
  await runSingleFileBuild(ctx);

  return true;
}

// Standard build: 5W interview then execute
async function handleStandardBuild(
  task: string,
  deps: OrchestratorDeps,
  complexity: ComplexityResult
): Promise<boolean> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  deps.setPendingTask(task);

  // [FIX] Check for .chassis/ folder (not just blueprint.md) — project may be initialized without blueprint
  const fs = require('fs');
  const path = require('path');
  const chassisInitialized = root && fs.existsSync(path.join(root, '.chassis'));

  if (!chassisInitialized) {
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
    // [CHASSIS] Has blueprint + cost estimate already confirmed — build directly, no second dialog
    const ctx = createBuildContext(task, deps);
    await runSingleFileBuild(ctx);
  }

  return true;
}

// Deep build: expanded interview + orchestrated phases
async function handleDeepBuild(
  task: string,
  deps: OrchestratorDeps,
  complexity: ComplexityResult
): Promise<boolean> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Show the "this is complex" warning with phased approach
  const phaseCount = complexity.recommendedPhases;
  deps.conversation.push({
    role: 'assistant',
    content: [
      `🔴 **Complex Build Detected**`,
      ``,
      `This request requires a **phased build approach** (~${phaseCount} phases).`,
      ``,
      `Like building a car: foundation → data → core → interface → features → polish → delivery.`,
      ``,
      `**Next:** Expanded interview to capture requirements, then we'll build phase by phase.`,
      ``,
      `__ACTION_CARD__chassis.startExpandedInterview|||📝 Start Expanded Interview|||END__`,
    ].join('\n'),
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
export async function executePhasedBuild(
  plan: BuildPlan,
  deps: OrchestratorDeps,
  orchestrator: BuildOrchestrator
): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return; }

  // Show build plan summary
  const summary = orchestrator.getPlanSummary(plan.task);
  deps.conversation.push({
    role: 'assistant',
    content: summary + '\n\n**Starting Phase 1...**',
    timestamp: Date.now(),
  });
  deps.refresh();

  // Build phase by phase with inspection gates
  let currentPhase = orchestrator.getCurrentPhase(plan.task);
  let phaseNumber = 1;
  
  while (currentPhase) {
    // Build this phase + inspect
    const result = await buildPhase(currentPhase, plan, deps);

    // Gate: Stop if inspection failed
    if (!result.passed) {
      deps.conversation.push({
        role: 'assistant',
        content: [
          `⛔ **Phase Gate Closed**`,
          ``,
          `${currentPhase.name} did not pass inspection.`,
          ``,
          `Like an engine failing compression tests — we cannot install it.`,
          ``,
          `**Options:**`,
          `1. Fix the issues and re-inspect`,
          `2. Rebuild this phase with different approach`,
          `3. Pause and reconsider the blueprint`,
        ].join('\n'),
        timestamp: Date.now(),
      });
      deps.refresh();
      
      // Pause the build plan
      plan.state = 'paused';
      orchestrator.savePlans?.();
      return;
    }

    // Phase passed — complete and advance
    orchestrator.completeCurrentPhase(plan.task);
    currentPhase = orchestrator.getCurrentPhase(plan.task);
    phaseNumber++;

    if (currentPhase) {
      deps.conversation.push({
        role: 'assistant',
        content: `✅ **Phase ${phaseNumber - 1} passed inspection.**\n\n🔨 Starting: ${currentPhase.icon} ${currentPhase.name}...`,
        timestamp: Date.now(),
      });
      deps.refresh();
    }
  }

  // All phases complete
  deps.conversation.push({
    role: 'assistant',
    content: `🎉 **Build Complete!** All ${plan.phases.length} phases passed inspection and built successfully.`,
    timestamp: Date.now(),
  });
  deps.refresh();
}

// Build a single phase with inspection gate
async function buildPhase(
  phase: { id: BuildPhase; name: string; description: string; icon: string; outputs: string[] },
  plan: BuildPlan,
  deps: OrchestratorDeps
): Promise<{ passed: boolean; inspection: PhaseInspection }> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return { passed: false, inspection: null as any }; }

  // Generate phase-specific prompt
  const prompt = [
    `You are building: ${plan.blueprint.what}`,
    ``,
    `## Current Phase: ${phase.name} ${phase.icon}`,
    `${phase.description}`,
    ``,
    `### Blueprint Context:`,
    `- WHO: ${plan.blueprint.who}`,
    `- WHAT: ${plan.blueprint.what}`,
    `- WHERE: ${plan.blueprint.where}`,
    `- WHEN: ${plan.blueprint.when}`,
    `- WHY: ${plan.blueprint.why}`,
    ``,
    `### Phase Instructions:`,
    `1. Build ONLY the ${phase.name} phase`,
    `2. Expected outputs: ${phase.outputs.join(', ')}`,
    `3. Generate working, complete code — NO placeholders`,
    `4. Leave extension points for next phases`,
    ``,
    `Return ONLY code — no markdown fences, no explanation.`,
  ].join('\n');

  // Build context for this phase
  const ctx = createBuildContext(plan.task, deps);

  // Execute build
  deps.conversation.push({
    role: 'assistant',
    content: `🔨 ${phase.icon} **Building ${phase.name}...**`,
    timestamp: Date.now(),
  });
  deps.refresh();

  try {
    await runSingleFileBuild(ctx);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    deps.logError(plan.task, prompt, errMsg, Math.ceil(prompt.length / 4));
    throw err;
  }

  // ── PHASE INSPECTION ──
  deps.conversation.push({
    role: 'assistant',
    content: `🔍 **Inspecting ${phase.name}...** (like testing an engine before installation)`,
    timestamp: Date.now(),
  });
  deps.refresh();

  // Collect built files (from the outputs patterns)
  const builtFiles: string[] = [];
  const fs = require('fs');
  const path = require('path');
  for (const pattern of phase.outputs) {
    const dir = pattern.includes('/') ? path.join(root, path.dirname(pattern)) : root;
    const filePattern = path.basename(pattern).replace(/\*/g, '');
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter((f: string) => f.includes(filePattern.replace('*', '')))
        .map((f: string) => path.join(dir, f));
      builtFiles.push(...files);
    }
  }

  // Run inspection
  const inspection = await inspectPhase(
    phase.id,
    builtFiles,
    root,
    plan.blueprint,
    deps.routing
  );

  // Show inspection results
  const report = formatInspectionReport(inspection);
  deps.conversation.push({
    role: 'assistant',
    content: report,
    timestamp: Date.now(),
  });
  deps.refresh();

  // Gate: Don't proceed if failed
  if (inspection.status === 'fail') {
    return { passed: false, inspection };
  }

  return { passed: true, inspection };
}

// Helper to create build context
function createBuildContext(task: string, deps: OrchestratorDeps): BuildContext {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  return {
    task,
    root,
    blueprintContext: deps.blueprintContext,
    vault: deps.vault,
    chassis: deps.chassis,
    routing: deps.routing,
    conversation: deps.conversation,
    refresh: deps.refresh,
    logError: deps.logError,
    postToWebview: deps.postToWebview,
    precomputedVaultSearch: deps.precomputedVaultSearch,
  };
}
