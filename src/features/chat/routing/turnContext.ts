// [SCOPE] TurnContext — the shared per-turn object that will carry intent + context + artifacts through the
// Supervisor/Worker/Guardian stages so they stop re-deriving from passed-forward summaries. The lossy handoff
// (classify -> plan -> worker, each getting only a summary) is the root of "losing something between plan and
// worker"; one shared object fixes it. See docs/REDIVIVUS_INTENT_ARCHITECTURE.md.
//
// [PHASE 0] SCAFFOLD ONLY. This is created at the top of a turn and threaded via MessageHandlerDeps, but
// NOTHING reads it yet — pure plumbing, no behavior change. Later phases move stages to read+write it:
//   Phase 1 — classifier fills hint.confidence; Phase 2 — one handler shares this object across build+fix;
//   Phase 3 — the Supervisor (not hint) decides the operation; Phase 4 — apply/Guardian/finalize unified.

import type { ChatMessage } from '../ui/chatPanelHtml.js';

// The classifier's decision becomes a HINT here — used for the cost tier and the "Building…/Updating…" badge,
// NOT (in later phases) as a hard router for code requests. confidence is added in Phase 1.
export interface IntentHint {
  action: string;            // build | fix | answer | clarify | command | run | convert | scaffold | service
  task?: string;             // AI-extracted task (build/fix). Routing still uses the raw message for history.
  confidence?: number;       // [Phase 1] 0..1 — undefined until the classifier emits it
  model?: string;
  provider?: string;
}

// Artifacts accumulated AS the turn executes — shared, not re-summarized between stages.
export interface TurnArtifacts {
  decision?: 'build' | 'fix';                               // [Phase 2] what the change-request seam dispatched to
  prescription?: unknown;                                   // Supervisor contract (/plan or fix-supervisor)
  files?: Array<{ path: string; description?: string }>;    // files the build/fix targets
  written?: string[];                                       // files actually written
  diffs?: Array<{ path: string; summary?: string }>;
  guardianNotes?: string[];
}

export interface TurnContext {
  id: string;
  startedAt: number;
  rawMessage: string;        // the user's EXACT words — never the AI-rewritten task
  conversation: ChatMessage[];
  projectRoot?: string;      // active project root (Model A: the subfolder, never the projects container)
  blueprint?: unknown;
  hint?: IntentHint;
  artifacts: TurnArtifacts;
}

let _seq = 0;

// Create the shared context for one user turn. Cheap; holds references (conversation) not copies.
export function createTurnContext(
  rawMessage: string,
  conversation: ChatMessage[],
  opts: { projectRoot?: string; blueprint?: unknown } = {},
): TurnContext {
  return {
    id: `turn-${Date.now()}-${++_seq}`,
    startedAt: Date.now(),
    rawMessage,
    conversation,
    projectRoot: opts.projectRoot,
    blueprint: opts.blueprint,
    hint: undefined,
    artifacts: {},
  };
}
