// [SCOPE] CHASSIS Chat Panel Build Pipeline — Main entry points
// Extracted from chatPanelHtml.ts. Keep under 200 lines.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RoutingService } from '../../services/ai/routingService.js';
import { VaultService } from '../../services/vault/vaultService.js';
import { ChassisService } from '../../services/chassisService.js';
import { UsageTracker } from '../../services/usageTracker.js';
import { findRelevantByTask, VaultSearchResult } from '../../services/vault/buildFromVaultSearch.js';
import { ChatMessage } from './chatPanelHtml.js';
import { extractNarrator, buildResultCard } from './chatPanelStory.js';
import { buildPostBuildGuidance } from './chatPanelPostBuild.js';
import { BuildLedger } from '../../services/build/buildLedgerService.js';
import * as Inf from './chatPanelBuildInference.js';
import * as Worker from './chatPanelBuildWorker.js';
import * as Review from './chatPanelBuildReview.js';
import * as Writer from './chatPanelBuildWriter.js';
import { tracer } from '../../services/pipelineTracer.js';

export interface BuildContext {
  task: string; root: string; blueprintContext: string; vault?: VaultService; routing: RoutingService; conversation: ChatMessage[]; refresh: () => void; logError: (t: string, p: string, e: string, l: number) => void; postToWebview?: (msg: any) => void; onBuildFinished?: (t: string, f?: string[]) => void;
  chassis?: ChassisService;
  usageTracker?: UsageTracker;
  onClarifySubmit?: (answers: Record<string, string>) => void;
  buildStartMessage?: string;
  isFix?: boolean;
  precomputedVaultSearch?: VaultSearchResult;
  onBuildFailed?: (t: string, reason: string) => void;
  buildMode?: 'plan' | 'direct';
}

// ── Vault-hit promise resolver — keyed by hitId, resolved by webview confirm/cancel ──
const _vaultHitResolvers = new Map<string, (result: boolean) => void>();

export function registerVaultHitResolver(hitId: string, resolve: (result: boolean) => void): void {
  _vaultHitResolvers.set(hitId, resolve);
}

// [FIX] result accepts string choice ('build-fresh'|'cancel'|'use-vault') from gate handler
export function resolveVaultHit(hitId: string, result: string | boolean): void {
  const resolver = _vaultHitResolvers.get(hitId);
  if (resolver) { _vaultHitResolvers.delete(hitId); resolver(result as any); }
}

// [RULE 18] AI classifier decides multi-file vs single-file — regex cannot reliably detect this from phrasing.
export async function isChunkedBuildRequest(task: string, routing: RoutingService): Promise<boolean> {
  // Fast path: explicit multi-file keywords
  if (/\b(full[- ]?stack|multi[- ]?file|multiple\s+files|several\s+files)\b/i.test(task)) { return true; }
  try {
    const prompt = `Does this build request require multiple separate files (e.g. HTML + CSS + JS, or frontend + backend + database), or can it be one self-contained file?\nTask: "${task.slice(0, 200)}"\nReply with one word: single or multi`;
    const res = await routing.prompt(prompt, 12_000);
    if (res.success && res.text) { return res.text.trim().toLowerCase().startsWith('multi'); }
  } catch { /* fall through to safe default */ }
  return false;
}

function updateLastMsg(ctx: BuildContext, content: string): void {
  const last = ctx.conversation[ctx.conversation.length - 1];
  if (last && last.role === 'assistant') last.content = content;
  else ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() });
  ctx.refresh();
}

function appendMsg(ctx: BuildContext, content: string): void {
  ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() });
  ctx.refresh();
}

export async function runSingleFileBuild(ctx: BuildContext): Promise<void> {
  const { task, root, blueprintContext, routing } = ctx;
  const buildStart = Date.now();
  const ledger = new BuildLedger();
  // Supervisor = highest-ranked available AI (AI_RANK). Used for labeling AND the actual API call.
  const { supervisor: supervisorAI } = routing.selectSupervisorAndWorker();

  appendMsg(ctx, '🔍 Searching vault...');
  const vaultItems = ctx.vault ? ctx.vault.listItems() : [];
  const searchResult = findRelevantByTask(task, vaultItems);
  updateLastMsg(ctx, `🔍 Vault: ${searchResult.items.length} relevant items found`);

  const isMod = await Inf.isModificationRequest(task.toLowerCase(), routing);
  const existingTarget = isMod ? await Inf.findExistingTarget(root, task) : null;
  const ext = Inf.inferExtension(task.toLowerCase(), blueprintContext);
  const fileBase = await Inf.deriveFileBase(task, routing);
  const relPath = existingTarget ? path.relative(root, existingTarget) : (ext === '.html' ? 'index.html' : `src/${fileBase}${ext}`);
  const absPath = path.join(root, relPath);

  appendMsg(ctx, `📋 Supervisor planning \`${relPath}\`...`);
  const _supT0 = Date.now(); const _supSid = tracer.step('SUPERVISOR', supervisorAI, task.slice(0, 80));
  const spec = await routing.supervisorPlan(task, relPath, blueprintContext).catch(() => null);
  const _supTok = spec ? Math.ceil((task.length + blueprintContext.length + spec.length) / 4) : 0;
  tracer.done(_supSid, spec ? 'success' : 'fail', Date.now() - _supT0, spec ? `${spec.split('\n').length} steps` : 'no supervisor plan', Math.ceil((task.length + blueprintContext.length) / 4), _supTok);
  if (spec) {
    ledger.record(supervisorAI, 'supervisor', 'planned', _supTok);
    updateLastMsg(ctx, `📋 Plan ready (${spec.split('\n').length} steps) — handing off to worker AI...`);
  }

  // Worker AI is determined at build time by routeByComplexity — show placeholder until routedTo is known
  appendMsg(ctx, `⚙️ Building \`${relPath}\`...`);
  const prompt = Worker.buildWorkerPrompt(ctx, relPath, !!existingTarget, existingTarget ? fs.readFileSync(absPath, 'utf8') : '', spec, '');
  const _workT0 = Date.now(); const _workSid = tracer.step('WORKER', undefined, `Building ${relPath}`);
  const res = await Worker.executeWorkerBuild(ctx, prompt);
  if (!res.success) {
    tracer.done(_workSid, 'fail', Date.now() - _workT0, res.error || 'AI returned no response');
    tracer.end([], 0, 0);
    ctx.logError(task, prompt, res.error || 'Failed', 0);
    updateLastMsg(ctx, `❌ Build failed: ${res.error || 'AI returned no response. Check .chassis/build_errors.log for details.'}`);
    return;
  }

  const workerAI = (res as any).routedTo || supervisorAI;
  const workerTokens = Math.ceil((prompt.length + res.text.length) / 4);
  tracer.done(_workSid, 'success', Date.now() - _workT0, relPath, Math.ceil(prompt.length / 4), Math.ceil(res.text.length / 4));
  ledger.record(workerAI, spec ? 'worker' : 'solo', 'built', workerTokens);

  // Show code preview with actual worker AI name now that routedTo is known
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
  const rawLines = res.text.trim().split('\n');
  const previewLines = rawLines.slice(0, 20).join('\n') + (rawLines.length > 20 ? '\n...' : '');
  updateLastMsg(ctx, `⚙️ ${aiLabels[workerAI] || workerAI} wrote ${rawLines.length} lines — Guardian reviewing...\n\`\`\`\n${previewLines}\n\`\`\``);

  let code = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
  const _grdT0 = Date.now(); const _grdSid = tracer.step('GUARDIAN', undefined, relPath);
  code = await Review.runGuardianReview(ctx, code, relPath, spec);
  code = await Review.runStaticValidation(code, relPath);
  if (['.ts', '.tsx', '.js'].some(e => relPath.endsWith(e))) code = await Review.runImportValidation(ctx, code, absPath, root);
  tracer.done(_grdSid, 'success', Date.now() - _grdT0, 'review complete');
  updateLastMsg(ctx, `✅ Review complete — writing \`${relPath}\`...`);

  const snapshotId = Writer.createSnapshot(root, task, relPath);
  const { narration, cleanCode } = extractNarrator(code);
  Writer.writeBuiltFile(absPath, cleanCode);

  // Auto-scaffold package.json + tsconfig.json for TypeScript Node.js projects
  const scaffoldedFiles: string[] = [];
  if (ext === '.ts' && !Inf.isWebPageTask(task.toLowerCase())) {
    Writer.scaffoldNodeProject(root, path.basename(absPath, ext), scaffoldedFiles);
  }
  tracer.fileOp([relPath, ...scaffoldedFiles]);

  const ledgerSummary = ledger.hasData() ? ledger.getSummary() : undefined;
  const totalTokens = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.tokens, 0) : 0;
  const totalCost = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.costUSD, 0) : 0;
  ctx.usageTracker?.recordUsage(totalTokens, totalCost, workerAI);

  const elapsed = (Date.now() - buildStart) / 1000;
  const resultCard = buildResultCard([relPath, ...scaffoldedFiles], searchResult.items.length, totalTokens, totalCost, elapsed, snapshotId, 0, !!existingTarget, ledgerSummary);
  const previewToken = relPath.endsWith('.html') ? `\n__PREVIEW_BROWSER__${absPath}|||END_PREVIEW_BROWSER__` : '';
  const nextSteps = buildPostBuildGuidance(root, [relPath, ...scaffoldedFiles]);
  appendMsg(ctx, `${narration ? '&#x1F4DD; ' + narration + '\n\n' : ''}${resultCard}\n__BUILD_RESULT__${relPath}|||${absPath}|||END__${previewToken}${nextSteps}`);

  tracer.vault('save', `${relPath} → vault`);
  tracer.end([relPath, ...scaffoldedFiles], totalTokens, totalCost);
  Writer.captureToVault(ctx, absPath, relPath);
  Writer.openBuiltFile(absPath);
  ctx.onBuildFinished?.(task, [relPath]);
}

export { runChunkedBuild } from './chatPanelChunked.js';
export { runVaultAssemblyBuild } from './chatPanelBuildVault.js';
