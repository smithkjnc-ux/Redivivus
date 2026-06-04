// [SCOPE] Chat panel token constants — single source of truth for all __TOKEN__ strings.
// Every producer, renderer, fallback stripper, click handler, and VS Code message handler
// imports from here. TypeScript errors at compile time if any of the 5 sides drifts out of sync.
//
// Pattern: TOKEN_START + payload + DELIM + TOKEN_END
// Payload is base64 or plain string depending on token. DELIM is '|||'.

// ── Delimiters ───────────────────────────────────────────────────────────────────────────────
export const DELIM = '|||';

// ── Build state ──────────────────────────────────────────────────────────────────────────────
export const TOK_RESULT_CARD_START  = '__RESULT_CARD__';
export const TOK_RESULT_CARD_END    = '__END_RESULT_CARD__';
export const TOK_BUILD_WORKING      = '__BUILD_WORKING__';
export const TOK_BUILD_RESULT       = '__BUILD_RESULT__';       // filename|||filepath|||END__
export const TOK_BUILD_RESULT_END   = 'END__';
export const TOK_UNDO_BUILD         = '__UNDO_BUILD__';         // snapshotId|||END_UNDO__
export const TOK_UNDO_BUILD_END     = 'END_UNDO__';
export const TOK_BUILD_FEEDBACK     = '__BUILD_FEEDBACK__';     // feedbackId|||END_FEEDBACK__
export const TOK_BUILD_FEEDBACK_END = 'END_FEEDBACK__';

// ── Navigation / workspace ───────────────────────────────────────────────────────────────────
export const TOK_OPEN_WORKSPACE     = '__OPEN_WORKSPACE__';     // rootPath|||END_OPEN__
export const TOK_OPEN_WORKSPACE_END = 'END_OPEN__';
export const TOK_PREVIEW_BROWSER    = '__PREVIEW_BROWSER__';    // absFilePath|||END_PREVIEW_BROWSER__
export const TOK_PREVIEW_BROWSER_END = 'END_PREVIEW_BROWSER__';
export const TOK_RUN_PROJECT        = '__RUN_PROJECT__';        // rootPath|||END_RUN__
export const TOK_RUN_PROJECT_END    = 'END_RUN__';
export const TOK_EDIT_VISUALLY      = '__EDIT_VISUALLY__';      // rootPath|||END_EDIT_VISUALLY__
export const TOK_EDIT_VISUALLY_END  = 'END_EDIT_VISUALLY__';

// ── Story / progress ─────────────────────────────────────────────────────────────────────────
export const TOK_STORY              = '__STORY__';              // line1|||line2|||...|||END_STORY__
export const TOK_STORY_DONE         = '__STORY_DONE__';
export const TOK_STORY_END          = 'END_STORY__';

// ── AI / review ──────────────────────────────────────────────────────────────────────────────
export const TOK_AI_BREAKDOWN       = '__AI_BREAKDOWN__';       // entries|||END_BREAKDOWN__
export const TOK_AI_BREAKDOWN_END   = 'END_BREAKDOWN__';
export const TOK_ACTION_CARD        = '__ACTION_CARD__';
export const TOK_ARCHITECT_ACTIONS  = '__ARCHITECT_ACTIONS__';
export const TOK_ARCHITECT_ACTIONS_END = 'END_ARCH_ACTIONS__';
export const TOK_ARCH_CONFIRM       = '__ARCH_CONFIRM__';
export const TOK_ARCH_CONFIRM_END   = 'END_ARCH_CONFIRM__';

// ── Gates / modals ───────────────────────────────────────────────────────────────────────────
export const TOK_PLAN_GATE          = '__PLAN_GATE__';          // planId|||END_PLAN_GATE__
export const TOK_PLAN_GATE_END      = 'END_PLAN_GATE__';
export const TOK_BLUEPRINT_GAPS     = '__BLUEPRINT_GAPS__';     // sessionId|||gaps|||task|||END_BLUEPRINT_GAPS__
export const TOK_BLUEPRINT_GAPS_END = 'END_BLUEPRINT_GAPS__';
export const TOK_BLUEPRINT_CARD     = '__BLUEPRINT_CARD__';     // sessionId|||base64JSON|||END_BLUEPRINT_CARD__
export const TOK_BLUEPRINT_CARD_END = 'END_BLUEPRINT_CARD__';
export const TOK_CLARIFY            = '__CLARIFY__';
export const TOK_CLARIFY_END        = '__END_CLARIFY__';

// ── Misc ─────────────────────────────────────────────────────────────────────────────────────
export const TOK_TERMINAL_ERROR     = '__TERMINAL_ERROR__';
export const TOK_TECH_DETAILS       = '__TECH_DETAILS__';
export const TOK_TECH_DETAILS_END   = '__END_TECH__';
export const TOK_GITHUB_COMMIT      = '__GITHUB_COMMIT__';      // payload|||END_GITHUB_COMMIT__
export const TOK_GITHUB_COMMIT_END  = 'END_GITHUB_COMMIT__';
export const TOK_VAULT_DEDUP        = '__VAULT_DEDUP_ACTIONS__';
export const TOK_VAULT_DEDUP_END    = 'END_VAULT_DEDUP__';

// ── Helper: build a token string ─────────────────────────────────────────────────────────────
export function token(start: string, payload: string, end: string): string {
  return `${start}${payload}${DELIM}${end}`;
}

// ── All raw token prefixes — used by the renderer fallback stripper ───────────────────────────
// Add to this list whenever a new token is created. If it's listed here it can never leak raw.
export const ALL_TOKEN_PREFIXES: string[] = [
  TOK_RESULT_CARD_START, TOK_RESULT_CARD_END, TOK_BUILD_WORKING, TOK_BUILD_RESULT,
  TOK_UNDO_BUILD, TOK_BUILD_FEEDBACK, TOK_OPEN_WORKSPACE, TOK_PREVIEW_BROWSER,
  TOK_RUN_PROJECT, TOK_EDIT_VISUALLY, TOK_STORY, TOK_STORY_DONE,
  TOK_AI_BREAKDOWN, TOK_ACTION_CARD, TOK_ARCHITECT_ACTIONS, TOK_ARCH_CONFIRM,
  TOK_PLAN_GATE, TOK_BLUEPRINT_GAPS, TOK_BLUEPRINT_CARD, TOK_CLARIFY, TOK_CLARIFY_END,
  TOK_TERMINAL_ERROR, TOK_TECH_DETAILS, TOK_TECH_DETAILS_END,
  TOK_GITHUB_COMMIT, TOK_VAULT_DEDUP,
];

/** Strip any raw (unrendered) token from a string. Called as final renderer safety net. */
export function stripRawTokens(html: string): string {
  let out = html;
  for (const prefix of ALL_TOKEN_PREFIXES) {
    // Match: prefix + anything to end of line (raw tokens are single-line)
    out = out.replace(new RegExp(prefix.replace(/[__]/g, '\\$&') + '[^\\n]*', 'g'), '');
  }
  return out;
}
