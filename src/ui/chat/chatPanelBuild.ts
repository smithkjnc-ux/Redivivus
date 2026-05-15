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
import { BuildLedger } from '../../services/build/buildLedgerService.js';
import * as Inf from './chatPanelBuildInference.js';
import * as Worker from './chatPanelBuildWorker.js';
import * as Review from './chatPanelBuildReview.js';
import * as Writer from './chatPanelBuildWriter.js';

export interface BuildContext {
  task: string; root: string; blueprintContext: string; vault?: VaultService; routing: RoutingService; conversation: ChatMessage[]; refresh: () => void; logError: (t: string, p: string, e: string, l: number) => void; postToWebview?: (msg: any) => void; onBuildFinished?: (t: string, f?: string[]) => void;
  chassis?: ChassisService;
  usageTracker?: UsageTracker;
  onClarifySubmit?: (answers: Record<string, string>) => void;
  buildStartMessage?: string;
  isFix?: boolean;
  precomputedVaultSearch?: VaultSearchResult;
  onBuildFailed?: (t: string, reason: string) => void;
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

// Detects multi-file project requests that should use the chunked build pipeline
export function isChunkedBuildRequest(task: string): boolean {
  const low = task.toLowerCase();
  return /\b(full[- ]?stack|multi[- ]?file|multiple\s+files|several\s+files)\b/.test(low)
    || (/\b(app|application|website|platform|system|game|tool|project)\b/.test(low)
      && /\b(complete|full|entire|whole|with\s+(a\s+)?(login|auth|database|api|backend|frontend|sidebar|navbar|router|state)|multiple|several)\b/.test(low));
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
  const primaryAI = routing.getAvailableAI().ai;

  appendMsg(ctx, '🔍 Searching vault...');
  const vaultItems = ctx.vault ? ctx.vault.listItems() : [];
  const searchResult = findRelevantByTask(task, vaultItems);
  updateLastMsg(ctx, `🔍 Vault: ${searchResult.items.length} relevant items found`);

  const isMod = Inf.isModificationRequest(task.toLowerCase());
  const existingTarget = isMod ? await Inf.findExistingTarget(root, task) : null;
  const ext = Inf.inferExtension(task.toLowerCase(), blueprintContext);
  const relPath = existingTarget ? path.relative(root, existingTarget) : (ext === '.html' ? 'index.html' : `src/${Inf.deriveFileBase(task.toLowerCase())}${ext}`);
  const absPath = path.join(root, relPath);

  appendMsg(ctx, `📋 Planning... → \`${relPath}\``);
  const spec = await routing.supervisorPlan(task, relPath, blueprintContext).catch(() => null);
  if (spec) {
    const supTokens = Math.ceil((task.length + blueprintContext.length + spec.length) / 4);
    ledger.record(primaryAI, 'supervisor', 'planned', supTokens);
  }

  updateLastMsg(ctx, '⚙️ Building...');
  const prompt = Worker.buildWorkerPrompt(ctx, relPath, !!existingTarget, existingTarget ? fs.readFileSync(absPath, 'utf8') : '', spec, '');
  const res = await Worker.executeWorkerBuild(ctx, prompt);
  if (!res.success) {
    ctx.logError(task, prompt, res.error || 'Failed', 0);
    updateLastMsg(ctx, `❌ Build failed: ${res.error || 'AI returned no response. Check .chassis/build_errors.log for details.'}`);
    return;
  }

  const workerAI = (res as any).routedTo || primaryAI;
  const workerTokens = Math.ceil((prompt.length + res.text.length) / 4);
  ledger.record(workerAI, spec ? 'worker' : 'solo', 'built', workerTokens);

  let code = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
  code = await Review.runGuardianReview(ctx, code, relPath, spec);
  code = await Review.runStaticValidation(code, relPath);
  if (['.ts', '.tsx', '.js'].some(e => relPath.endsWith(e))) code = await Review.runImportValidation(ctx, code, absPath, root);

  const snapshotId = Writer.createSnapshot(root, task, relPath);
  const { narration, cleanCode } = extractNarrator(code);
  Writer.writeBuiltFile(absPath, cleanCode);

  const ledgerSummary = ledger.hasData() ? ledger.getSummary() : undefined;
  const totalTokens = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.tokens, 0) : 0;
  const totalCost = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.costUSD, 0) : 0;
  ctx.usageTracker?.recordUsage(totalTokens, totalCost, workerAI);

  const elapsed = (Date.now() - buildStart) / 1000;
  const resultCard = buildResultCard([relPath], searchResult.items.length, totalTokens, totalCost, elapsed, snapshotId, 0, !!existingTarget, ledgerSummary);
  appendMsg(ctx, `${narration ? '📝 ' + narration + '\n\n' : ''}${resultCard}\n__BUILD_RESULT__${relPath}|||${absPath}|||END__`);

  Writer.captureToVault(ctx, absPath, relPath);
  Writer.openBuiltFile(absPath);
  ctx.onBuildFinished?.(task, [relPath]);
}

export { runChunkedBuild } from './chatPanelChunked.js';
export { runVaultAssemblyBuild } from './chatPanelBuildVault.js';
