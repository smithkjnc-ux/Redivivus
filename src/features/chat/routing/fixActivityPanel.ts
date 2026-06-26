// [SCOPE] Bridges the FIX pipeline to the shared Build Activity panel so a fix SHOWS its real work — the
// Supervisor's diagnosis, the Worker's actual fix (streamed live), and the Guardian's verdict — the same way
// a build does, instead of a vague 4-line chat bubble ("Supervisor: done / Worker: writing fix"). Thin wrapper
// over BuildActivityPanel (singleton); every call is best-effort and NEVER blocks or throws into the fix.
// Each step's `detail` is expandable in the panel, so the user can open it and read exactly what each AI did.

import { BuildActivityPanel } from '../ui/buildActivity/buildActivityPanel.js';

// Open the panel for this fix and show the Supervisor starting to read the code.
export function fixActStart(userText: string, fileCount: number): void {
  try {
    BuildActivityPanel.start('Fix: ' + userText.slice(0, 70));
    BuildActivityPanel.current?.step({
      phase: 'supervisor', status: 'running',
      label: `Reading ${fileCount} file${fileCount !== 1 ? 's' : ''} to find the problem`,
    });
  } catch { /* panel optional — never block a fix */ }
}

// Supervisor finished: show a plain-English summary of WHAT IT FOUND, with the full diagnosis as detail.
export function fixActSupervisor(diagnosis: string, model?: string): void {
  try {
    const plain = diagnosis.match(/^PLAIN:\s*(.+?)(?:\n|$)/m)?.[1]?.trim();
    BuildActivityPanel.current?.step({
      phase: 'supervisor', status: 'pass',
      label: plain ? `Found: ${plain.slice(0, 140)}` : 'Diagnosis complete',
      detail: diagnosis, model,
    });
  } catch { /* best-effort */ }
}

// Generic step passthrough (Worker / Guardian rows). detail = the expandable "actual work".
export function fixActStep(step: { phase: string; status: string; label: string; detail?: string; model?: string; live?: boolean }): void {
  try { BuildActivityPanel.current?.step(step); } catch { /* best-effort */ }
}

// Stream a chunk of the Worker's fix into the live code block (the step before must have live:true).
export function fixActCode(text: string): void {
  try { BuildActivityPanel.current?.code(text); } catch { /* best-effort */ }
}

// Final marker: green when files were written with no failures, red otherwise.
export function fixActFinish(written: string[], failed: string[]): void {
  try {
    BuildActivityPanel.current?.finish(
      written.length > 0 && failed.length === 0,
      written.length ? `Fixed ${written.join(', ')}` : 'Could not apply the fix',
    );
  } catch { /* best-effort */ }
}
