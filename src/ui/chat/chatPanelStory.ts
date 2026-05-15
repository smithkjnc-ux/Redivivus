// [SCOPE] CHASSIS Chat Panel Story Mode — extract narrator lines from AI code, build result cards

/** Extract the first NARRATOR: line from generated code (any comment style).
 *  Supports: // NARRATOR: (JS/TS)  # NARRATOR: (Python/Ruby/bash)  -- NARRATOR: (SQL/Lua)
 *  Returns the plain-English narration and the code with the line removed. */
export function extractNarrator(code: string): { narration: string; cleanCode: string } {
  const match = code.match(/^\s*(?:\/\/|#|--)\s*NARRATOR:\s*(.+)\n?/m);
  if (!match) { return { narration: '', cleanCode: code }; }
  const narration = match[1].trim();
  const cleanCode = code.replace(match[0], '').trim();
  return { narration, cleanCode };
}

/** Extract ALL NARRATOR: lines from a block of generated code (any comment style).
 *  Supports: // NARRATOR: (JS/TS)  # NARRATOR: (Python/Ruby/bash)  -- NARRATOR: (SQL/Lua) */
export function extractAllNarrators(code: string): string[] {
  const lines: string[] = [];
  const re = /(?:\/\/|#|--)\s*NARRATOR:\s*(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) { lines.push(m[1].trim()); }
  return lines;
}

/** Encode a running story array as a __STORY__ token for the chat renderer.
 *  Format: __STORY__line1|||line2|||...|||END_STORY__ */
export function encodeStoryToken(lines: string[]): string {
  return '__STORY__' + lines.join('|||') + '|||END_STORY__';
}

/** Build a result-card string shown after a build completes.
 *  @param snapshotId — if provided, an Undo Everything button is shown.
 *  @param isModification — if true, shows "Modified" instead of "Created"
 *  @param captureResult — full vault capture result for three-state vault-save line
 *  @param ledgerSummary — if provided, appends per-AI breakdown token
 *  Format: __RESULT_CARD__summary__END_RESULT_CARD__ + optional __UNDO_BUILD__snapshotId|||END_UNDO__
 *          + optional __AI_BREAKDOWN__...|||END_BREAKDOWN__ */
export function buildResultCard(
  files: string[],
  vaultCount: number,
  totalTokens: number,
  totalCost: number,
  elapsedSec = 0,
  snapshotId?: string,
  captureResult: import('../../services/vault/vaultAutoCapture.js').CaptureResult | number = 0,
  isModification = false,
  ledgerSummary?: import('../../services/build/buildLedgerService.js').LedgerSummaryLine[],
  feedbackId?: string,
): string {
  const fileList = files.map(f => `  • \`${f}\``).join('\n');
  const vaultLine = vaultCount > 0 ? `📦 Vault reused: ${vaultCount} piece${vaultCount !== 1 ? 's' : ''}\n` : '';
  // Three-state vault-save line
  let captureLine = '';
  if (typeof captureResult === 'number') {
    // Legacy: plain number passed (e.g. 0 default or old callers)
    captureLine = captureResult > 0 ? `\u{1F4BE} Saved to vault: ${captureResult} new piece${captureResult !== 1 ? 's' : ''}\n` : '';
  } else if (captureResult.failed) {
    captureLine = `⚠️ Vault save failed\n`;
  } else if (captureResult.newItems > 0) {
    captureLine = `💾 Saved to vault: ${captureResult.newItems} new piece${captureResult.newItems !== 1 ? 's' : ''}\n`;
  } else if (captureResult.skippedDupes > 0 || captureResult.totalExtracted > 0) {
    captureLine = `💾 Already in vault\n`;
  }
  const costLine = totalTokens > 0 ? `💰 Cost: $${totalCost.toFixed(4)} · ${totalTokens.toLocaleString()} tokens` : '';
  const timeLine = elapsedSec > 0 ? `⏱️ Built in ${elapsedSec < 60 ? `${elapsedSec.toFixed(1)}s` : `${Math.floor(elapsedSec / 60)}m ${(elapsedSec % 60).toFixed(0)}s`}\n` : '';
  const undoToken = snapshotId ? `\n__UNDO_BUILD__${snapshotId}|||END_UNDO__` : '';
  const actionWord = isModification ? 'Modified' : 'Created';

  // Encode ledger summary as a pipe-delimited token: ai~role~actions~tokens~costUSD~hasFallback~reason
  const breakdownToken = (ledgerSummary && ledgerSummary.length > 0)
    ? `\n__AI_BREAKDOWN__${ledgerSummary.map(l =>
        `${l.ai}~${l.role}~${l.actions.join(',')}~${l.tokens}~${l.costUSD.toFixed(8)}~${l.hasFallback ? '1' : '0'}~${(l.reason || '').replace(/[~|]/g, ' ')}`
      ).join('|||')}|||END_BREAKDOWN__`
    : '';

  const feedbackToken = feedbackId ? `\n__BUILD_FEEDBACK__${feedbackId}|||END_FEEDBACK__` : '';
  return `__RESULT_CARD__
✅ Done! ${actionWord} ${files.length} file${files.length !== 1 ? 's' : ''}

${fileList}

${vaultLine}${captureLine}${timeLine}${costLine}
__END_RESULT_CARD__${undoToken}${breakdownToken}${feedbackToken}`;
}
