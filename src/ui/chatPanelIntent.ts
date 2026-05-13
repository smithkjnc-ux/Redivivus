// [SCOPE] Chat Panel Intent — classifies user messages and runs the build request handler
// Extracted from chatPanel.ts (was lines 127-221). Keep under 200 lines.

import * as vscode from 'vscode';
import { ChatMessage } from './chatPanelHtml.js';
import { RoutingService } from '../services/routingService.js';
import { VaultService } from '../services/vaultService.js';
import { ChassisService } from '../services/chassisService.js';
import { runSingleFileBuild, runChunkedBuild, isChunkedBuildRequest, runVaultAssemblyBuild, registerVaultHitResolver, resolveVaultHit, BuildContext } from './chatPanelBuild.js';
import { findRelevantByTask, VaultSearchResult } from '../services/buildFromVaultSearch.js';
import { semanticVaultSearch } from '../services/vaultSemanticSearch.js';
import { runEditFileBuild, EditBuildContext } from './chatPanelEditBuild.js';
import { assessComplexity, ComplexityResult, shouldRequireDeepInterview } from '../services/complexityAssessment.js';
import { BuildOrchestrator, BuildBlueprint, BuildPhase, BUILD_PHASES } from '../services/buildOrchestrator.js';
import { generateVagueWarning, getQuestionsForTier, organizeByCategory } from '../services/expandedInterview.js';
import { isVagueProjectRequest, askScopeQuestions, parseScopeAnswer, hasPendingScopeQuestion, resolveScopeQuestion } from '../services/templateScopeService.js';
import { handleComplexityRoutedBuild, OrchestratorDeps } from './chatPanelOrchestrator.js';
import { estimateBuild } from '../services/costEstimatorService.js';
import { checkBuildPlacement } from '../services/buildPlacementCheck.js';
import { extractBlueprintFromPrompt } from '../services/blueprintExtractor.js';

// [CHASSIS] Pending build-confirm resolvers — keyed by buildId. Resolved by confirm-build / cancel-build messages.
const _pendingBuildConfirms = new Map<string, (confirmed: boolean) => void>();

// [CHASSIS] Pending placement resolvers — keyed by placementId. Resolved by placement-* messages.
const _pendingPlacements = new Map<string, (choice: 'here' | 'new-project' | 'cancel') => void>();

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
async function awaitPlacementConfirmation(
  task: string,
  projectName: string,
  noProject: boolean,
  deps: BuildRequestDeps,
): Promise<'here' | 'new-project' | 'cancel'> {
  const placementId = `placement-${Date.now()}`;
  const choice = await new Promise<'here' | 'new-project' | 'cancel'>((resolve) => {
    _pendingPlacements.set(placementId, resolve);
    deps.postToWebview({ type: 'show-placement-check', placementId, projectName, noProject });
    // Safety timeout — treat as cancel after 5 min
    setTimeout(() => {
      if (_pendingPlacements.has(placementId)) {
        _pendingPlacements.delete(placementId);
        resolve('cancel');
      }
    }, 5 * 60 * 1000);
  });
  return choice;
}

/** Shows cost estimate modal and waits (async) for user to confirm or cancel. Returns true = proceed. */
async function awaitCostConfirmation(task: string, deps: BuildRequestDeps): Promise<boolean> {
  const model = deps.routing.getModelName?.() || deps.routing.getAvailableAI().ai || 'gemini';
  const estimate = estimateBuild(task, model);
  // [CHASSIS] Fast-path: small builds (< 3k tokens, < $0.01) skip cost modal for responsiveness
  if (estimate.tokens < 3000 && estimate.costUSD < 0.01) {
    return true;
  }
  const buildId = `build-${Date.now()}`;
  const confirmed = await new Promise<boolean>((resolve) => {
    _pendingBuildConfirms.set(buildId, resolve);
    deps.postToWebview({ type: 'show-cost-estimate', buildId, estimate });
    // Safety timeout — auto-confirm after 5 min so builds never hang forever
    setTimeout(() => {
      if (_pendingBuildConfirms.has(buildId)) {
        _pendingBuildConfirms.delete(buildId);
        resolve(true);
      }
    }, 5 * 60 * 1000);
  });
  return confirmed;
}

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
  usageTracker?: import('../services/usageTracker.js').UsageTracker;
}

export type IntentType = 'build' | 'command' | 'question' | 'offtopic';
export type AvailableCommand = 
  | 'chassis.openProject'
  | 'chassis.wizardRetrofit'
  | 'chassis.openBlueprint'
  | 'chassis.showMap'
  | 'chassis.savePoint'
  | 'chassis.showBuildHistory'
  | 'chassis.profileRuntime'
  | 'chassis.viewUsageInChat'
  | 'workbench.action.closeFolder'
  | 'chassis.analyze'
  | 'chassis.openVault'
  | 'chassis.deadends'
  | 'chassis.switchAI'
  | 'chassis.startSession'
  | 'chassis.endSession'
  | 'chassis.generateRules'
  | 'chassis.openSettings';

export interface IntentResult {
  type: IntentType;
  command?: AvailableCommand;
}

/** 
 * AI-driven intent classifier - replaces regex pattern matching with natural language understanding.
 * Uses Supervisor AI to classify user messages into intent categories.
 */
export async function classifyIntent(
  text: string, 
  routing?: RoutingService,
  context?: { projectName?: string; workspacePath?: string; blueprintStatus?: string }
): Promise<IntentResult> {
  // Hardcoded overrides — patterns too ambiguous for AI classifier
  const t = text.toLowerCase().trim();
  if (/\b(close|exit|leave|quit)\b.*(current\s+)?(project|folder|workspace)/i.test(t) ||
      /\b(close|exit)\s+(this|the)\s+(project|folder)/i.test(t)) {
    return { type: 'command', command: 'workbench.action.closeFolder' };
  }
  if (/\b(open|show|view|see|browse|launch)\b.*(the\s+)?vault\b/i.test(t) ||
      /\bvault\b.*(open|show|view|browse)/i.test(t)) {
    return { type: 'command', command: 'chassis.openVault' };
  }
  if (/\b(open|show|view)\b.*(the\s+)?blueprint\b/i.test(t)) {
    return { type: 'command', command: 'chassis.openBlueprint' };
  }
  if (/\b(open|show|view)\b.*(the\s+)?(architecture\s+)?map\b/i.test(t) ||
      /\barchitecture\s+map\b/i.test(t)) {
    return { type: 'command', command: 'chassis.showMap' };
  }
  if (/\b(start|begin|new)\s+session\b/i.test(t)) {
    return { type: 'command', command: 'chassis.startSession' };
  }
  if (/\b(end|stop|finish|done\s+for\s+now)\s+(the\s+)?session\b/i.test(t) ||
      /\bdone\s+for\s+(now|today)\b/i.test(t)) {
    return { type: 'command', command: 'chassis.endSession' };
  }
  if (/\b(save\s+point|savepoint|checkpoint|save\s+my\s+work)\b/i.test(t)) {
    return { type: 'command', command: 'chassis.savePoint' };
  }
  if (/\b(switch|open|go\s+to|load)\s+(to\s+)?(a\s+)?(different|another|new\s+)?project\b/i.test(t) ||
      /\bopen\s+project\b/i.test(t)) {
    return { type: 'command', command: 'chassis.openProject' };
  }

  // If no routing service available, fall back to simple keyword detection
  if (!routing) {
    const t = text.toLowerCase().trim();
    const buildVerbs = /\b(build|create|make|write|generate|implement|scaffold|code|develop|produce|split|refactor|reorganize|restructure|add|fix|update|modify|extend|improve|change|edit|remove|delete|swap|replace)\b/i;
    const isQuestion = /\?$|^(what|how|why|when|where|who|can you|could you|do you|does|is there|tell me|explain|show me what)/i.test(t);
    
    if (buildVerbs.test(t) && !isQuestion) { return { type: 'build' }; }
    return { type: 'question' };
  }

  const systemPrompt = `You are the CHASSIS intent classifier. Given a user message and project context, classify it as ONE of these intents and return ONLY valid JSON, nothing else.

Intents:
- build: user wants to create/write/make/add something
- question: user asking about their project, code, or any software development topic
- command: user wants to trigger a CHASSIS action
- offtopic: no connection to software development, coding, architecture, databases, APIs, or technical topics

For command intent, return the specific command:
- chassis.openProject (open or switch to a different project)
- workbench.action.closeFolder (close/exit/leave the current project or folder)
- chassis.wizardRetrofit (new project)
- chassis.openBlueprint (view/edit blueprint)
- chassis.showMap (architecture map, show map, open map, view map, show architecture, open architecture, map view, dependency map, project structure map)
- chassis.savePoint (save checkpoint)
- chassis.showBuildHistory (build history)
- chassis.profileRuntime (profile project)
- chassis.viewUsageInChat (usage/tokens spent)

Project context:
- Project: ${context?.projectName || 'Unknown'}
- Path: ${context?.workspacePath || 'None'}
- Blueprint: ${context?.blueprintStatus || 'Unknown'}

User message: ${text}

Examples (follow these exactly):
"I want to switch over to the rigops project" → {"intent": "command", "command": "chassis.openProject"}
"can you pull up the map for me" → {"intent": "command", "command": "chassis.showMap"}
"close doaidream and open chassis" → {"intent": "command", "command": "chassis.openProject"}
"show me how the project is structured" → {"intent": "command", "command": "chassis.showMap"}
"what's the weather today" → {"intent": "offtopic"}
"tell me a joke" → {"intent": "offtopic"}
"how does async/await work" → {"intent": "question"}
"what does this file do" → {"intent": "question"}
"what is 2 + 2" → {"intent": "question"}
"how do I center a div in CSS" → {"intent": "question"}
"explain what a REST API is" → {"intent": "question"}
"build me a login page" → {"intent": "build"}
"add a dark mode toggle" → {"intent": "build"}

Return ONLY JSON:
{ "intent": "command", "command": "chassis.openProject" }
{ "intent": "build" }
{ "intent": "question" }
{ "intent": "offtopic" }

OFFTOPIC definition: No connection to software development, coding, architecture, databases, APIs, or technical topics. NOT offtopic: coding education, dev concepts, project advice, architecture questions. IS offtopic: weather, sports, recipes, jokes, travel, personal advice, general knowledge.`;

  try {
    // Use Supervisor AI (Gemini) for classification with max_tokens: 50
    const result = await (routing as any).prompt(systemPrompt);
    
    if (!result || !result.text) {
      throw new Error('No response from AI classifier');
    }

    // Parse JSON response
    const jsonMatch = result.text.match(/\{[^}]+\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : result.text;
    const parsed = JSON.parse(jsonStr);

    // Validate and normalize response
    const intent = parsed.intent as IntentType;
    
    if (intent === 'offtopic') {
      return { type: 'offtopic' };
    }
    
    if (intent === 'command' && parsed.command) {
      return { type: 'command', command: parsed.command as AvailableCommand };
    }
    
    if (intent === 'build') {
      return { type: 'build' };
    }
    
    return { type: 'question' };
    
  } catch (error) {
    // Fallback: if classification fails, treat as question and continue to normal chat
    console.log('[CHASSIS INTENT] AI classification failed, falling back to question:', error);
    return { type: 'question' };
  }
}

/** Returns true if the message is a direct build/create request. */
export async function isBuildRequest(text: string, routing?: RoutingService): Promise<boolean> {
  const result = await classifyIntent(text, routing);
  return result.type === 'build';
}

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
  let precomputedVaultSearch: VaultSearchResult | undefined;
  if (deps.vault && !skipComplex) {
    const allItems = deps.vault.listItems();
    if (allItems.length > 0) {
      const checkMsg = { role: 'assistant' as const, content: '🔍 Searching vault...', timestamp: Date.now() };
      deps.conversation.push(checkMsg);
      deps.refresh();
      const searchResult = findRelevantByTask(task, allItems);
      // Semantic signal boosts: if semantic check found a high-confidence match but keyword search
      // scored it below the high-confidence threshold, treat it as 1 high-confidence hit so the
      // vault-hit modal fires and the user gets a chance to use it.
      if (semanticHit && searchResult.highConfidenceCount === 0 && searchResult.items.length > 0) {
        (searchResult as any).highConfidenceCount = 1;
      }
      // Replace transient message with result summary
      checkMsg.content = searchResult.items.length > 0
        ? `🔍 Vault: ${searchResult.items.length} relevant from ${searchResult.totalScanned} scanned (${searchResult.highConfidenceCount} high confidence)`
        : `🔍 Vault: No matches found in ${searchResult.totalScanned} items`;
      deps.refresh();
      precomputedVaultSearch = searchResult;

      if (searchResult.highConfidenceCount > 0) {
        const hitId = `vault-hit-${Date.now()}`;
        const useVault = await new Promise<boolean>((resolve) => {
          registerVaultHitResolver(hitId, resolve);
          deps.postToWebview({ type: 'show-vault-hit', hitId, count: searchResult.highConfidenceCount });
          setTimeout(() => { resolveVaultHit(hitId, false); }, 5 * 60 * 1000);
        });

        // ── Placement check — runs after vault-hit resolves, on both Use Vault and Build Anyway paths ──
        if (!skipComplex) {
          const config = deps.chassis?.loadConfig?.();
          const projectName = config?.projectName || 'this project';
          const isInit = deps.chassis?.isInitialized?.() ?? false;
          const placement = checkBuildPlacement(task, deps.blueprintContext, isInit, projectName);
          if (placement.decision !== 'fit') {
            const placementChoice = await awaitPlacementConfirmation(task, placement.projectName, placement.decision === 'no-project', deps);
            if (placementChoice === 'cancel') {
              deps.conversation.push({ role: 'assistant', content: '🚫 Build cancelled.', timestamp: Date.now() });
              deps.refresh();
              deps.postToWebview({ type: 'set-status', status: 'ready' });
              return;
            }
            if (placementChoice === 'new-project') {
              deps.setPendingTask(task);
              // Trim back any assistant messages added during this aborted attempt (vault cards etc)
              while (deps.conversation.length > 0 && deps.conversation[deps.conversation.length - 1].role !== 'user') {
                deps.conversation.pop();
              }
              deps.refresh();
              const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
              const root2 = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              const _defaultParent2 = root2 ? require('path').dirname(root2) : (require('os').homedir() + '/projects');
              deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: _defaultParent2, prefillTask: task, compact: false, prefillAnswers });
              deps.postToWebview({ type: 'set-status', status: 'ready' });
              return;
            }
          }
        }

        if (useVault) {
          const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!root) {
            deps.postToWebview({ type: 'set-status', status: 'ready' });
            return;
          }
          const ctx: BuildContext = {
            task, root, blueprintContext: deps.blueprintContext, vault: deps.vault,
            chassis: deps.chassis, routing: deps.routing, conversation: deps.conversation,
            refresh: deps.refresh, logError: deps.logError, postToWebview: deps.postToWebview,
            usageTracker: deps.usageTracker,
            isFix: false, // [CHASSIS] vault assembly is never a fix request
            onBuildFinished: (t, builtFiles) => {
              // [CHASSIS] Only call resolveFix for actual fix requests, not fresh vault builds
              if (skipComplex) {
                vscode.commands.executeCommand('chassis.resolveFix', t, builtFiles);
              }
              const { ChatPanel } = require('./chatPanel.js');
              ChatPanel.onBuildFinished?.(t, builtFiles || []);
            },
          };
          await runVaultAssemblyBuild(ctx, searchResult.items);
          deps.postToWebview({ type: 'set-status', status: 'ready' });
          return;
        }
        // useVault = false → fall through to cost modal
      }
    }
  }

  // ── Placement check — no vault hit path (no vault or no high-confidence items) ──
  if (!skipComplex) {
    const config = deps.chassis?.loadConfig?.();
    const projectName = config?.projectName || 'this project';
    const isInit = deps.chassis?.isInitialized?.() ?? false;
    const placement = checkBuildPlacement(task, deps.blueprintContext, isInit, projectName);
    if (placement.decision !== 'fit') {
      const placementChoice = await awaitPlacementConfirmation(task, placement.projectName, placement.decision === 'no-project', deps);
      if (placementChoice === 'cancel') {
        deps.conversation.push({ role: 'assistant', content: '🚫 Build cancelled.', timestamp: Date.now() });
        deps.refresh();
        deps.postToWebview({ type: 'set-status', status: 'ready' });
        return;
      }
      if (placementChoice === 'new-project') {
        deps.setPendingTask(task);
        // Trim back any assistant messages added during this aborted attempt (vault cards etc)
        while (deps.conversation.length > 0 && deps.conversation[deps.conversation.length - 1].role !== 'user') {
          deps.conversation.pop();
        }
        deps.refresh();
        const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
        const root2 = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const _defaultParent4 = root2 ? require('path').dirname(root2) : (require('os').homedir() + '/projects');
        deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: _defaultParent4, prefillTask: task, compact: false, prefillAnswers });
        deps.postToWebview({ type: 'set-status', status: 'ready' });
        return;
      }
    }
  }

  // ── Cost estimate gate — show modal and wait for user confirmation ──
  // [WARN] Only show on first pass — skipComplex=true means build was already confirmed before project creation
  if (!skipComplex) {
    const confirmed = await awaitCostConfirmation(task, deps);
    if (!confirmed) {
      deps.conversation.push({ role: 'assistant', content: '🚫 Build cancelled.', timestamp: Date.now() });
      deps.refresh();
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      return;
    }
  }

  // Use chassis root — it may point to a just-created project before VS Code workspace catches up
  const root = deps.chassis?.getWorkspaceRoot?.() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const isSimpleUnit = /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(task);

  if (!root) {
    // No folder open + simple unit → build to vault directly, no folder needed
    if (isSimpleUnit && !skipComplex) {
      deps.setPendingTask(task);
      const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
      const _defaultParentV = require('os').homedir() + '/projects';
      deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: _defaultParentV, prefillTask: task, compact: true, vaultOnly: true, prefillAnswers });
      return;
    }
    // No folder open + complex project → show WebView placement modal (not native dialog)
    const placementId = `placement-${Date.now()}`;
    const noFolderChoice = await new Promise<'here' | 'new-project' | 'cancel'>((resolve) => {
      _pendingPlacements.set(placementId, resolve);
      deps.postToWebview({ type: 'show-placement-check', placementId, noProject: true });
      setTimeout(() => { if (_pendingPlacements.has(placementId)) { _pendingPlacements.delete(placementId); resolve('cancel'); } }, 5 * 60 * 1000);
    });
    if (noFolderChoice === 'new-project') {
      // [CHASSIS] AI-extract 5W answers first, then show wizard with pre-fills
      deps.setPendingTask(task);
      const prefillAnswers = await extractBlueprintFromPrompt(task, deps.routing);
      const _defaultParentN = require('os').homedir() + '/projects';
      deps.postToWebview({ type: 'show-panel', panelType: 'new-project', suggestedParent: _defaultParentN, prefillTask: task, compact: false, prefillAnswers });
    }
    return;
  }

  // ── Complexity-based routing (nano/standard/deep) ──
  if (!skipComplex) {
    const orchDeps: OrchestratorDeps = {
      chassis: deps.chassis,
      routing: deps.routing,
      vault: deps.vault,
      conversation: deps.conversation,
      blueprintContext: deps.blueprintContext,
      refresh: deps.refresh,
      logError: deps.logError,
      postToWebview: deps.postToWebview,
      setPendingTask: deps.setPendingTask,
      precomputedVaultSearch,
    };

    const handled = await handleComplexityRoutedBuild(task, orchDeps);
    if (handled) { return; }
  }

  const ctx: BuildContext = {
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
    usageTracker: deps.usageTracker,
    onClarifySubmit: undefined,
    precomputedVaultSearch,
    isFix: isFixRequest,
    onBuildFinished: (t: string, builtFiles?: string[]) => {
      // [CHASSIS] Only call resolveFix for actual fix requests, not fresh builds
      if (isFixRequest) {
        vscode.commands.executeCommand('chassis.resolveFix', t, builtFiles);
      }
      const { ChatPanel } = require('./chatPanel.js');
      ChatPanel.onBuildFinished?.(t, builtFiles || []);
    },
    onBuildFailed: (t: string, reason: string) => {
      vscode.commands.executeCommand('chassis.buildFailed', t, reason);
    },
  };
  deps.setActiveBuildCtx(ctx);
  try {
    if (isChunkedBuildRequest(task)) {
      await runChunkedBuild(task, ctx);
    } else {
      await runSingleFileBuild(ctx);
    }
  } finally {
    deps.setActiveBuildCtx(undefined);
    deps.postToWebview({ type: 'set-status', status: 'ready' });
  }
}

/** Handles edit-request messages — edits an existing file in-place for TODO/scope fixes. */
export async function handleEditRequest(msg: any, deps: Omit<BuildRequestDeps, 'blueprintContext' | 'pendingTask' | 'setPendingTask' | 'setActiveBuildCtx'>): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return; }
  deps.conversation.push({ role: 'user', content: `Fix \`${msg.filePath}\`: ${msg.task}`, timestamp: Date.now() });
  deps.refresh();
  const ctx: EditBuildContext = {
    filePath: msg.filePath,
    task: msg.task,
    issueType: msg.issueType || 'todo',
    root,
    routing: deps.routing,
    vault: deps.vault,
    conversation: deps.conversation,
    refresh: deps.refresh,
    logError: deps.logError,
    onBuildFinished: (task: string, builtFiles?: string[]) => {
      vscode.commands.executeCommand('chassis.resolveFix', task, builtFiles);
      const { ChatPanel } = require('./chatPanel.js');
      ChatPanel.onBuildFinished?.(task, builtFiles || []);
    },
    onBuildFailed: (task, reason) => { vscode.commands.executeCommand('chassis.buildFailed', task, reason); },
  };
  await runEditFileBuild(ctx);
}
