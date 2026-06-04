// [SCOPE] Build output formatters — pure functions for formatting build results as chat tokens.
// Lives in core/build/ so services and core can import without crossing into the UI layer.
// chatPanelStory.ts (UI) re-exports these for backward compatibility with UI consumers.
// Rule: NO imports from ui/ — these functions must remain UI-agnostic.

import type { CaptureResult } from '../../services/vault/vaultAutoCapture';
import type { LedgerSummaryLine } from '../../services/build/buildLedgerService';

// ── Narrative extraction ──────────────────────────────────────────────────────────────────────

/** Extract the first NARRATOR: line from generated code (any comment style). */
export function extractNarrator(code: string): { narration: string; cleanCode: string } {
  const match = code.match(/^\s*(?:\/\/|#|--)\s*NARRATOR:\s*(.+)\n?/m);
  if (!match) { return { narration: '', cleanCode: code }; }
  return { narration: match[1].trim(), cleanCode: code.replace(match[0], '').trim() };
}

/** Extract ALL NARRATOR: lines from a block of generated code. */
export function extractAllNarrators(code: string): string[] {
  const lines: string[] = [];
  const re = /(?:\/\/|#|--)\s*NARRATOR:\s*(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) { lines.push(m[1].trim()); }
  return lines;
}

// ── Story token encoding ──────────────────────────────────────────────────────────────────────

/** Encode a running story array as a __STORY__ token for the chat renderer. */
export function encodeStoryToken(lines: string[]): string {
  return '__STORY__' + lines.join('|||') + '|||END_STORY__';
}

// ── Result card ───────────────────────────────────────────────────────────────────────────────

/**
 * Build a result-card token string shown after a build completes.
 * Pure function — no vscode or ChatPanel imports. Callers append workspace/preview tokens.
 *
 * @param snapshotId  — if provided, an Undo button is included
 * @param isModification — shows "Modified" instead of "Created"
 * @param captureResult — vault capture result for the vault-save status line
 * @param ledgerSummary — per-AI cost breakdown
 */
export function buildResultCard(
  files: string[],
  vaultCount: number,
  totalTokens: number,
  totalCost: number,
  elapsedSec = 0,
  snapshotId?: string,
  captureResult: CaptureResult | number = 0,
  isModification = false,
  ledgerSummary?: LedgerSummaryLine[],
  feedbackId?: string,
): string {
  const fileList = files.map(f => `  - \`${f}\``).join('\n');
  const vaultLine = vaultCount > 0 ? `Vault reused: ${vaultCount} piece${vaultCount !== 1 ? 's' : ''}\n` : '';

  let captureLine = '';
  if (typeof captureResult === 'number') {
    captureLine = captureResult > 0 ? `Saved to vault: ${captureResult} new piece${captureResult !== 1 ? 's' : ''}\n` : '';
  } else if (captureResult.failed) {
    captureLine = `[!] Vault save failed\n`;
  } else if (captureResult.newItems > 0) {
    captureLine = `Saved to vault: ${captureResult.newItems} new piece${captureResult.newItems !== 1 ? 's' : ''}\n`;
  } else if (captureResult.skippedDupes > 0 || captureResult.totalExtracted > 0) {
    captureLine = `Already in vault\n`;
  }

  const costLine = totalTokens > 0 ? `Cost: $${totalCost.toFixed(4)} - ${totalTokens.toLocaleString()} tokens` : '';
  const timeLine = elapsedSec > 0
    ? `Built in ${elapsedSec < 60 ? `${elapsedSec.toFixed(1)}s` : `${Math.floor(elapsedSec / 60)}m ${(elapsedSec % 60).toFixed(0)}s`}\n`
    : '';

  const undoToken = snapshotId ? `\n__UNDO_BUILD__${snapshotId}|||END_UNDO__` : '';

  const breakdownToken = (ledgerSummary && ledgerSummary.length > 0)
    ? `\n__AI_BREAKDOWN__${ledgerSummary.map(l =>
        `${l.ai}~${l.role}~${l.actions.join(',')}~${l.tokens}~${l.costUSD.toFixed(8)}~${l.hasFallback ? '1' : '0'}~${(l.reason || '').replace(/[~|]/g, ' ')}`
      ).join('|||')}|||END_BREAKDOWN__`
    : '';

  const feedbackToken = feedbackId ? `\n__BUILD_FEEDBACK__${feedbackId}|||END_FEEDBACK__` : '';
  const actionWord = isModification ? 'Modified' : 'Created';

  return `__RESULT_CARD__
Done! ${actionWord} ${files.length} file${files.length !== 1 ? 's' : ''}

${fileList}

${vaultLine}${captureLine}${timeLine}${costLine}
__END_RESULT_CARD__${undoToken}${breakdownToken}${feedbackToken}`;
}
