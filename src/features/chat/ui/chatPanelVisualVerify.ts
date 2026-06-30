// [SCOPE] Visual verification — renders the built app in a headless preview, captures a JPEG via
// the existing html2canvas beacon, then sends the image to a vision AI asking whether the UI looks
// correct for the given task. Closes the last honest gap: a build that passes npm run build can still
// render a blank page. This gives Redivivus actual eyes on the output.
//
// Pipeline: verifyPreviewRuns() (headless iframe) → html2canvas snapshot beaconed back →
//           vision AI (Claude / GPT-4o / Gemini) assesses the screenshot → structured verdict.
//
// Non-blocking: if the preview server can't start, the capture fails, or the AI call fails,
// the verdict is 'inconclusive' and the build proceeds unblocked.

import { verifyPreviewRuns } from './chatPanelPreviewVerify.js';
import { getRuntimeReports, clearRuntimeReports } from './chatPanelPreview.js';
import type { RoutingService } from '../../ai/data/routingService.js';

export interface VisualVerifyResult {
  applicable: boolean;       // false = not a web project, or no snapshot captured
  snapshot: boolean;         // true = screenshot was captured
  passed: boolean | null;    // null = inconclusive (AI couldn't assess)
  aiVerdict: string;         // what the vision AI said
  imageBase64?: string;      // the raw snapshot for display (data URL, no prefix)
}

const _inconclusive = (reason: string): VisualVerifyResult =>
  ({ applicable: false, snapshot: false, passed: null, aiVerdict: reason });

/**
 * Loads the project in a headless preview, waits for the html2canvas snapshot to beacon back,
 * then asks a vision AI whether the rendered output looks correct for the given task.
 *
 * waitMs should be long enough for the page to fully render (3500ms handles most SPAs).
 */
export async function runVisualVerification(
  root: string,
  task: string,
  routing: RoutingService,
  waitMs = 3500,
): Promise<VisualVerifyResult> {
  // [FIX] The prior "Ran the preview" step calls verifyPreviewRuns() which captures a snapshot at
  // 1500ms. If we call verifyPreviewRuns() again here, it clears those reports immediately and the
  // __rdvCaptureInstalled guard prevents a second capture — leaving us with no snapshot.
  // Solution: reuse the existing snapshot if one was already captured; only do a fresh run if there
  // isn't one.
  const priorReports = getRuntimeReports();
  const priorSnapshot = priorReports.find(r => r.kind === 'snapshot' && r.image);

  if (!priorSnapshot?.image) {
    // No prior snapshot — do a fresh headless run to capture one.
    // Clear stale reports first so the fresh capture isn't contaminated by old data.
    clearRuntimeReports();
    let runResult: Awaited<ReturnType<typeof verifyPreviewRuns>>;
    try {
      runResult = await verifyPreviewRuns(root, waitMs);
    } catch {
      return _inconclusive('Preview server failed to start — visual check skipped.');
    }
    if (!runResult.applicable) {
      return _inconclusive('Not a web preview project — visual check not applicable.');
    }
  }

  // Step 2: find the html2canvas snapshot beaconed by the capture script
  // The capture script sends kind:'snapshot' with image as a data URL (image/jpeg;base64,...)
  const reports = getRuntimeReports();
  const snapshotReport = reports.find(r => r.kind === 'snapshot' && r.image);
  if (!snapshotReport?.image) {
    // No screenshot captured — report any runtime errors we saw
    const errReport = priorReports.find(r => r.kind === 'error' || r.kind === 'rejection' || r.kind === 'probe');
    return { applicable: true, snapshot: false, passed: null, aiVerdict: `Screenshot not captured — ${errReport?.msg ?? 'html2canvas did not beacon back (CDN may be unavailable).'}` };
  }

  // Strip the data URL prefix to get raw base64 (routing.prompt expects raw base64)
  const raw = snapshotReport.image.replace(/^data:image\/[a-z]+;base64,/, '');

  // Step 3: ask a vision AI to assess the screenshot
  const visionPrompt = `You are a visual QA reviewer checking a web app that was just built.

TASK THAT WAS BUILT: "${task}"

Look at the screenshot and answer these three things concisely:
1. PASS or FAIL — does the rendered output look like a working result for this task?
2. What do you actually see on screen? (describe in 1-2 sentences)
3. What is wrong, if anything? (blank page, missing elements, unstyled HTML, broken layout, wrong colors, elements not visible)

Be specific. One short paragraph. No bullet points.`;

  try {
    const res = await routing.prompt(visionPrompt, 30_000, raw, 'image/jpeg');
    if (!res.success || !res.text?.trim()) {
      return { applicable: true, snapshot: true, passed: null, aiVerdict: 'Vision AI call failed — check visually.', imageBase64: raw };
    }
    const verdict = res.text.trim();
    const passed = /^(pass|yes|looks (correct|good|right|like a working))/i.test(verdict) || /\bPASS\b/.test(verdict);
    const failed = /^(fail|no,|blank|broken|missing|unstyled|wrong)/i.test(verdict) || /\bFAIL\b/.test(verdict);
    return {
      applicable: true,
      snapshot: true,
      passed: failed ? false : passed ? true : null,
      aiVerdict: verdict,
      imageBase64: raw,
    };
  } catch {
    return { applicable: true, snapshot: true, passed: null, aiVerdict: 'Vision AI unavailable — check visually.', imageBase64: raw };
  }
}
