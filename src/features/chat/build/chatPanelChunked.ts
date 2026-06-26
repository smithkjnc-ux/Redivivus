// [SCOPE] Redivivus Chat Panel Chunked Build — multi-file build pipeline orchestration
// Per-file loop extracted to chatPanelChunkedLoop.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { VaultSearchResult } from '../../vault/infrastructure/buildFromVaultSearch.js';
import { findRelevantByTask } from '../../vault/infrastructure/buildFromVaultSearch.js';
import { getPhaseUndoService } from '../../project/application/phaseUndoService.js';
import type { BuildContext } from './chatPanelBuild.js';
import { encodeStoryToken } from '../ui/chatPanelStory.js';
import { SnapshotService } from '../../project/application/snapshotService.js';
import { BuildLedger } from './services/buildLedgerService.js';
import { runFileBuildLoop } from './chatPanelChunkedLoop.js';
import { tracer } from '../../project/application/pipelineTracer.js';
import { formatVaultContext, isVaultEnabled } from '../../vault/infrastructure/vaultContextService.js';
import { readProjectDeadEnds } from '../routing/chatPanelMsgFixDeadEnds.js';
import { readProjectRules, getRecentBuildsContext } from '../routing/chatPanelMsgFixUtils.js';
import { getWorkspaceContextService } from '../../workspace/infrastructure/workspaceContext.js';
import { runChunkedBuildFinalize } from './chatPanelChunkedFinalize.js';
import { startProgressTicker, SUPERVISOR_TICKER_LABELS } from './chatPanelBuildHelpers.js';

export function appendMsg(ctx: BuildContext, content: string, tokens = 0, cost = 0): void {
  ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now(), tokens: tokens || undefined, cost: cost || undefined }); ctx.refresh();
}

export function updateLastMsg(ctx: BuildContext, content: string): void {
  const last = ctx.conversation[ctx.conversation.length - 1];
  if (last && last.role === 'assistant') { last.content = content; } else { ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() }); }
  ctx.refresh();
}

/** Multi-file chunked build — clarify → vault search → plan → per-file builds with visible progress */
export async function runChunkedBuild(task: string, ctx: BuildContext): Promise<void> {
  const { root, vault, blueprintContext, routing, conversation } = ctx;
  const buildStart = Date.now();

  const { supervisor, worker } = routing.selectSupervisorAndWorker();
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek' };
  const supervisorLabel = aiLabels[supervisor] || supervisor;
  const workerLabel = worker ? (aiLabels[worker] || worker) : null;

  // [DEAD] orchestratedBuild bypass was here — removed because it skipped file saving,
  // project creation wizard, vault capture, and explorer opening. Multi-AI coordination
  // happens through the existing supervisor/worker planning step + Guardian review instead.

  const ledger = new BuildLedger();
  const phaseUndo = getPhaseUndoService(root);
  const buildId = phaseUndo.startPhasedBuild(task);

  // Clarification answers collected upstream in chatPanelBuildRunner before single/multi routing
  const answersBlock = ctx.clarifyAnswers || '';

  // Vault search (skipped when user has disabled vault injection in Setup Hub)
  const vaultOn = isVaultEnabled();
  appendMsg(ctx, vaultOn ? '🔍 Checking your saved code library...' : '📋 Planning your build...');
  const vaultItems = (vault && vaultOn) ? vault.listItems() : [];
  const searchResult: VaultSearchResult = vaultItems.length > 0 ? findRelevantByTask(task, vaultItems) : { items: [], totalScanned: 0, matchedCount: 0, highConfidenceCount: 0 };
  const relevant = searchResult.items;
  if (vaultOn) { updateLastMsg(ctx, relevant.length > 0 ? `🔍 Found ${relevant.length} useful match${relevant.length !== 1 ? 'es' : ''} in your code library` : `🔍 No matches found in your code library`); }

  // Classification
  const _classLabels = ['📐 Classifying project architecture...', '🔍 Identifying project type...', '📐 Single-file or multi-file?'];
  const _stopClass = startProgressTicker(ctx, _classLabels, 3_000);
  const classPrompt = `I need to build: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}${answersBlock ? `${answersBlock}\n` : ''}
Classify the architecture of this project into EXACTLY ONE of these types:
- "single-file tool" (Browser games, simple calculators, single HTML pages)
- "multi-file app" (Complex web apps with separate CSS/JS, React apps, multi-page sites)
- "library" (NPM packages, generic reusable modules without a UI)
- "script" (Command line scripts, Python automation, single logic files)

Return ONLY the classification string, nothing else.`;

  let projectType = 'multi-file app';
  try {
    const classRes = await routing.prompt(classPrompt, 10_000, undefined, undefined, 'You are an expert software architect.');
    _stopClass();
    if (classRes.success && classRes.text) {
      projectType = classRes.text.trim().toLowerCase();
    }
  } catch (err) {
    _stopClass();
    // default to multi-file app on failure
  }

  // [FIX] Honor an explicit single-file request — otherwise the classifier may label a "typing test"
  // as multi-file (planning css/js modules) while the Worker, seeing "single self-contained" in the
  // task text, inlines everything into index.html. That left orphaned css/js files nothing links to.
  // When the user explicitly asks for one self-contained HTML file, force single-file so plan + build agree.
  if (/\b(single[\s-]?file|self[\s-]?contained|one\s+(?:single\s+)?html\s+file|single\s+html\s+(?:page|file))\b/i.test(task)) {
    projectType = 'single-file tool';
  }

  // [FIX] Inject workspace files & vault context into planner so supervisor knows what exists
  const wsCtx = await getWorkspaceContextService().getContext();
  const wsBlock = wsCtx?.files?.length ? `EXISTING WORKSPACE FILES:\n${wsCtx.files.map(f => `- ${f.relativePath}`).join('\n')}\n` : '';
  const vaultCtxBlock = relevant.length > 0 ? formatVaultContext(relevant) + '\n' : '';
  const deadEndsBlock = readProjectDeadEnds(root) ? `PREVIOUSLY FAILED APPROACHES:\n${readProjectDeadEnds(root)}\n` : '';
  const rulesBlock = readProjectRules(root) ? `PROJECT RULES:\n${readProjectRules(root)}\n` : '';
  const recentBlock = getRecentBuildsContext(root) ? `${getRecentBuildsContext(root)}\n` : '';
  const singleFileRule = (projectType.includes('single-file tool') || projectType.includes('script'))
    ? '- [BROWSER GAMES AND SIMPLE TOOLS]: ALWAYS output a single self-contained index.html file with all CSS and JavaScript inline. Do NOT plan external .js or .css files. Do NOT use a src/ directory. For games, center the <canvas> on screen using CSS (`body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #222; overflow: hidden; } canvas { display: block; }`).'
    : '- [BROWSER/HTML PROJECTS ONLY]: Do NOT put JavaScript inside HTML files. Always plan a separate .js file and link it via <script src="...">. Do NOT use ES modules or import/export.';

  const planPrompt = `I need to build: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}${wsBlock}${vaultCtxBlock}${recentBlock}${deadEndsBlock}${rulesBlock}${answersBlock ? `${answersBlock}\n` : ''}Identify every single source file that needs to be CREATED or MODIFIED to accomplish this task.
You MUST list both:
1. Brand new files that need to be created.
2. Existing files that need to be edited, modified, or updated to import/call the new files.

RULES:
${singleFileRule}

Return ONLY a JSON array — no markdown, no explanation, no code:
[
  {"file": "src/new-file.py", "purpose": "Create new module"},
  {"file": "src/existing.py", "purpose": "Modify to import and use src/new-file.py"}
]`;

  const promptLen = Math.ceil(planPrompt.length / 4);
  interface PlanEntry { filename: string; purpose: string; }
  let filePlan: PlanEntry[] = [];

  const _planT0 = Date.now(); const _planSid = tracer.step('SUPERVISOR', supervisorLabel, `Planning ${task.slice(0, 60)}`);
  const _stopTicker = startProgressTicker(ctx, SUPERVISOR_TICKER_LABELS);
  try {
    const res = await (workerLabel
      ? (async () => { const f = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 30_000); const { callProvider } = await import('../../../shared/ai/domain/providers/providerFactory.js'); return callProvider(supervisor, planPrompt, f); })()
      : routing.prompt(planPrompt, 30_000));
    _stopTicker();
    if (!res.success) { tracer.done(_planSid, 'fail', Date.now() - _planT0, res.error || 'failed'); throw new Error(res.error || 'Planning step failed'); }
    const planTokens = Math.ceil(res.text.length / 4);
    ledger.record(supervisor, worker ? 'supervisor' : 'solo', 'planned', planTokens);
    const planCost = (planTokens / 1_000_000) * 0.30;
    ctx.usageTracker?.recordUsage(planTokens, planCost, supervisor, res.inputTokens, res.outputTokens, 'supervisor', path.basename(root));
    let raw = res.text.trim().replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    // [FIX] Walk balanced brackets instead of greedy regex — prevents over-capture when AI adds extra text after the array
    const _s = raw.indexOf('['); if (_s !== -1) { let _d = 0; for (let _i = _s; _i < raw.length; _i++) { if (raw[_i]==='[') {_d++;} else if (raw[_i]===']' && --_d===0) { raw = raw.slice(_s, _i+1); break; } } }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) { throw new Error('AI returned empty plan'); }
    // [FIX] Sanitize filenames — AIs sometimes embed list ordinals ("4. ") or markdown backticks
    // inside the JSON value (e.g. "4. `index.html`"), which then become literal filenames on disk.
    // Strip leading ordinals, backticks, and surrounding quotes before using the path.
    const cleanFilename = (s: string) => (s || '')
      .replace(/^\s*\d+[.)]\s*/, '')   // leading "4. " / "4) "
      .replace(/[`'"]/g, '')            // stray markdown backticks / quotes
      .trim();
    filePlan = parsed.map((e: any) => ({ filename: cleanFilename(e.filename || e.file) || 'src/output.py', purpose: e.purpose || '' }));
    tracer.done(_planSid, 'success', Date.now() - _planT0, `${filePlan.length} files planned`, Math.ceil(planPrompt.length / 4), planTokens);
  } catch (err) {
    _stopTicker();
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, planPrompt, `Build plan failed: ${errMsg}`, promptLen);
    conversation.pop(); conversation.pop();
    appendMsg(ctx, `❌ Couldn't plan your build\n\n**Reason:** ${errMsg}\n\nTry again or describe what you want differently.`);
    return;
  }

  updateLastMsg(ctx, `📋 Plan ready — ${filePlan.length} file${filePlan.length !== 1 ? 's' : ''} to build`);

  if (!fs.existsSync(root)) { fs.mkdirSync(root, { recursive: true }); }
  const _wsf = vscode.workspace.workspaceFolders ?? [];
  if (_wsf.length > 0 && !_wsf.some(f => f.uri.fsPath === root)) { vscode.workspace.updateWorkspaceFolders(_wsf.length, null, { uri: vscode.Uri.file(root) }); vscode.commands.executeCommand('workbench.view.explorer').then(() => { vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer'); }, () => {}); }

  // Snapshot before building
  let snapshotId: string | undefined;
  try { const snap = new SnapshotService(root); snapshotId = snap.prepare(task, filePlan.map(f => f.filename)); } catch { /* never block */ }

  appendMsg(ctx, encodeStoryToken(['Starting build...']));
  const storyMsgIndex = ctx.conversation.length - 1;

  const loopResult = await runFileBuildLoop({
    task, ctx, filePlan, relevant, blueprintContext, answersBlock,
    routing, supervisor, worker, supervisorLabel, workerLabel,
    buildId, phaseUndo, ledger, storyMsgIndex, projectType
  });

  // On failure, error message already shown by loop; just return
  if (!loopResult.success) { return; }

  const { builtFiles, totalTokens, totalCost, storyLines } = loopResult;
  const elapsed = (Date.now() - buildStart) / 1000;

  await runChunkedBuildFinalize(ctx, task, builtFiles, totalTokens, totalCost, elapsed, snapshotId, ledger, storyLines, storyMsgIndex, supervisorLabel, worker, filePlan, blueprintContext);
}
