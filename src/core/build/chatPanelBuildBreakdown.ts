// [SCOPE] Builds the __AI_BREAKDOWN__ token and cleans narration for the cloud build result card.
// Renders an HONEST two-phase byline: the Supervisor (who wrote the prescription) AND the Worker
// (who wrote the code) — or a single solo row when no Supervisor ran, surfacing WHY if one was
// attempted and failed. Previously the runner hardcoded a single "solo / primary builder" row, so
// the Supervisor (e.g. Claude) was never shown even though it ran. Extracted from chatPanelBuildRunner.

import type { CloudBuildResult } from '../../services/build/cloudBuildClient';

// Field delimiter is '~' and row delimiter is '|||' — strip both from free text so a stray
// character in a model name or error message can't corrupt the byline parsing.
function safeField(s: string): string {
  return (s || '').replace(/[~|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** Build the `__AI_BREAKDOWN__...|||END_BREAKDOWN__` token from the real two-phase attribution. */
export function buildBreakdownToken(result: CloudBuildResult, workerLabel: string, workerTokens: number): string {
  const rows: string[] = [];

  // Supervisor row — only when a Supervisor actually wrote the prescription.
  if (result.supervisorRan && result.supervisorModel) {
    const supTokens = (result.supervisorInputTokens ?? 0) + (result.supervisorOutputTokens ?? 0);
    rows.push(`${safeField(result.supervisorModel)}~supervisor~planned~${supTokens}~0.00000000~0~prescribed the build`);
  }

  // Worker row — always present (or a solo row when there was no Supervisor).
  if (workerTokens > 0 || rows.length === 0) {
    const ranSupervisor = !!result.supervisorRan;
    const role = ranSupervisor ? 'worker' : 'solo';
    const reason = ranSupervisor
      ? 'built from the prescription'
      : (result.supervisorError ? `built solo — Supervisor unavailable: ${safeField(result.supervisorError)}` : 'primary builder');
    rows.push(`${safeField(workerLabel)}~${role}~built~${workerTokens}~0.00000000~0~${reason}`);
  }

  if (rows.length === 0) { return ''; }
  return `\n__AI_BREAKDOWN__${rows.join('|||')}|||END_BREAKDOWN__`;
}

/** Strip system-context enrichments from narration before it is shown to the user. */
export function cleanBuildNarration(narration: string | undefined): string {
  const cleaned = (narration ?? '')
    .replace(/\n*USER EXPERIENCE LEVEL:[^\n]*/gi, '')
    .replace(/\n*AI DEFAULT CHOICES[^]*?(?=\n\nBuild|\n*$)/gi, '')
    .replace(/\n*MANDATORY GAME REQUIREMENTS[^]*?(?=\n\n[A-Z]|\n*$)/gi, '')
    .replace(/\n*SUPERVISOR TO WORKER CONTRACT[^]*?(?=\n\n[A-Z]|\n*$)/gi, '')
    .trim();
  return cleaned ? `\n\n**Who Did What & Why**\n${cleaned}` : '';
}
