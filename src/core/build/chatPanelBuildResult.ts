// [SCOPE] Single-file build result card construction — extracted from chatPanelBuild.ts (Rule 9 split)

import * as path from 'path';
import * as fs from 'fs';
import { checkImports, formatMissingImports } from '../../ui/panels/chat/chatPanelImportCheck';
import { buildResultCard } from '../../ui/panels/chat/chatPanelStory';
import { buildPostBuildGuidance } from './chatPanelPostBuild';
import { BuildLedger } from '../../services/build/buildLedgerService';
import { BuildHistoryService, makeBuildHistoryEntry } from '../../services/build/buildHistoryService';
import * as Inf from './chatPanelBuildInference';
import * as Writer from './chatPanelBuildWriter';
import { redivivusLog } from '../../services/logging/redivivusLogger';
import type { BuildContext } from './chatPanelBuildHelpers';

export interface SingleFileBuildResultParams {
  ctx: BuildContext;
  relPath: string; absPath: string; root: string; task: string;
  existingTarget: string | null; isCrossLang: boolean;
  _oldContent: string; cleanCode: string; narration: string;
  usedSurgical: boolean;
  ledger: BuildLedger; _supTok: number; supervisorAI: string;
  workerAI: string; spec: string | null;
  res: { inputTokens?: number; outputTokens?: number };
  snapshotId: string | undefined; buildStart: number;
  searchResult: { items: any[] };
  ext: string;
}

export function buildSingleFileResult(p: SingleFileBuildResultParams): {
  resultMessage: string; scaffoldedFiles: string[]; totalTokens: number; totalCost: number;
} {
  const scaffoldedFiles: string[] = [];
  let resultMessage = '';
  let totalTokens = 0;
  let totalCost = 0;
  try {
    const _diff = p.existingTarget && !p.isCrossLang ? diffSummary(p._oldContent, p.cleanCode) : '';
    const importCheck = checkImports(p.root, p.absPath, p.cleanCode);
    const importWarning = formatMissingImports(importCheck, p.relPath);
    if (p.ext === '.ts' && !Inf.isWebPageTask(p.task.toLowerCase())) {
      try { Writer.scaffoldNodeProject(p.root, path.basename(p.absPath, p.ext), scaffoldedFiles); } catch (e) { console.error('[Redivivus] scaffoldNodeProject failed:', e); }
    }
    const ledgerSummary = p.ledger.hasData() ? p.ledger.getSummary() : undefined;
    totalTokens = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.tokens, 0) : 0;
    totalCost = ledgerSummary ? ledgerSummary.reduce((s, l) => s + l.costUSD, 0) : 0;
    const _proj = path.basename(p.root);
    try {
      if (p.spec && p.workerAI !== p.supervisorAI) {
        const supCost = (p._supTok / 1_000_000) * 0.30;
        p.ctx.usageTracker?.recordUsage(p._supTok, supCost, p.supervisorAI, undefined, undefined, 'supervisor', _proj);
        const workerCost = (totalTokens / 1_000_000) * 0.30;
        p.ctx.usageTracker?.recordUsage(totalTokens, workerCost, p.workerAI, p.res.inputTokens, p.res.outputTokens, 'worker', _proj);
      } else {
        p.ctx.usageTracker?.recordUsage(totalTokens, totalCost, p.workerAI, p.res.inputTokens, p.res.outputTokens, 'solo', _proj);
      }
    } catch (e) { console.error('[Redivivus] usageTracker failed:', e); }

    const elapsed = (Date.now() - p.buildStart) / 1000;
    redivivusLog({ operation: 'build', phase: 'complete', message: 'Build completed', data: { file: p.relPath, durationSec: elapsed, tokens: totalTokens, cost: totalCost, method: p.usedSurgical ? 'surgical' : 'full_file' }, success: true });
    const resultCard = buildResultCard([p.relPath, ...scaffoldedFiles], p.searchResult.items.length, totalTokens, totalCost, elapsed, p.snapshotId, 0, !!p.existingTarget, ledgerSummary) + (_diff ? `\n_Changes: ${_diff}_` : '');
    try { new BuildHistoryService(p.root).record(makeBuildHistoryEntry({ snapshotId: p.snapshotId || Date.now().toString(), task: p.task, files: [p.relPath, ...scaffoldedFiles], tokensUsed: totalTokens, costUSD: totalCost, source: 'ai', supervisor: p.supervisorAI, worker: p.workerAI !== p.supervisorAI ? p.workerAI : null, resultCardToken: resultCard })); } catch (e) { console.error('[Redivivus] BuildHistory.record failed:', e); }
    const previewToken = p.relPath.endsWith('.html') ? `\n__PREVIEW_BROWSER__${p.absPath}|||END_PREVIEW_BROWSER__` : '';
    let nextSteps = '';
    try { nextSteps = buildPostBuildGuidance(p.root, [p.relPath, ...scaffoldedFiles]); } catch (e) { console.error('[Redivivus] postBuildGuidance failed:', e); }
    let compileAction = '';
    try { compileAction = (require('./chatPanelBuildPipeline.js') as any).appendCompileAction(p.relPath) || ''; } catch (e) { console.error('[Redivivus] appendCompileAction failed:', e); }
    resultMessage = `${p.narration ? '📝 ' + p.narration + '\n\n' : ''}${resultCard}${importWarning}\n__BUILD_RESULT__${p.relPath}|||${p.absPath}|||END__${previewToken}${nextSteps}${compileAction}`;
  } catch (e) {
    redivivusLog({ operation: 'build', phase: 'error', message: 'Build failed', error: e instanceof Error ? e.message : String(e), success: false });
    console.error('[Redivivus] Result construction failed:', e);
    resultMessage = `✅ **Done** — ${p.existingTarget ? 'Modified' : 'Created'} \`${p.relPath}\`\n\n_(result card unavailable: ${e instanceof Error ? e.message : String(e)})_`;
  }
  return { resultMessage, scaffoldedFiles, totalTokens, totalCost };
}

function diffSummary(before: string, after: string): string {
  const bl = before.split('\n').length; const al = after.split('\n').length;
  const delta = al - bl;
  return delta === 0 ? `${al} lines unchanged` : delta > 0 ? `+${delta} lines (${al} total)` : `${delta} lines (${al} total)`;
}
