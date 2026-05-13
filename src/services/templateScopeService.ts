// [SCOPE] Template Scope Service — detects vague project requests and asks 2 clarifying questions
// in the chat BEFORE showing the template wizard. Wizard becomes a confirmation/gap-filler only.
// [WARN] Never block builds — if user ignores or times out, continue with original task.
// [NEXT] Use AI to parse the scope answer and pre-select wizard category + subcategory.

// [WARN] One pending scope resolver at a time — cleared on reply or timeout
let _pendingScopeResolve: ((answer: string | null) => void) | null = null;
// [CHASSIS] Timestamp when the scope question was posted — used to age out stale questions
let _scopeQuestionTimestamp = 0;

/**
 * Called by the message handler when the user replies to a scope question.
 * The reply is the raw message text — we detect it came from scope context via a flag.
 */
export function resolveScopeQuestion(answer: string): boolean {
  if (!_pendingScopeResolve) { return false; }
  const resolver = _pendingScopeResolve;
  _pendingScopeResolve = null;
  resolver(answer);
  return true;
}

export function hasPendingScopeQuestion(): boolean {
  return _pendingScopeResolve !== null;
}

/** Returns the timestamp (ms) when the scope question was asked. 0 if none pending. */
export function getScopeQuestionTimestamp(): number {
  return _pendingScopeResolve ? _scopeQuestionTimestamp : 0;
}

/** Clears any pending scope question without resolving it. Called when builds complete or stale. */
export function clearPendingScopeQuestion(): void {
  if (_pendingScopeResolve) {
    const resolver = _pendingScopeResolve;
    _pendingScopeResolve = null;
    _scopeQuestionTimestamp = 0;
    resolver(null);
  }
}

/**
 * Returns true if the task is a vague project-type request that needs scope clarification.
 * "Build me a website" → true
 * "Build me a portfolio website for Jane Smith, dark theme" → false (already has detail)
 * "Add a contact form" → false (modification, not a new project)
 */
export function isVagueProjectRequest(task: string): boolean {
  const t = task.trim();

  // Must be a project-type request
  const isProjectRequest =
    /build\s+(me\s+)?(a|an)\s+(website|web site|game|app|dashboard|portfolio|landing page|api|backend|blog|tool|cli)/i.test(t) ||
    /create\s+(a|an)\s+(website|game|app|dashboard|portfolio|blog)/i.test(t) ||
    /make\s+(a|an)\s+(website|game|app|dashboard|portfolio|blog)/i.test(t);

  if (!isProjectRequest) { return false; }

  // If task has substantial detail (>60 chars or contains key detail words), don't ask
  const hasDetail =
    t.length > 70 ||
    /for\s+\w|with\s+(a|an|the|dark|light|blue|red|green|my|our)\b/i.test(t) ||
    /\b(portfolio|personal|business|blog|dashboard|e-commerce|ecommerce|landing|admin|crud|rest|fastapi|express)\b/i.test(t.replace(/build|create|make/gi, ''));

  return !hasDetail;
}

/**
 * Asks 2 scope questions in the chat and waits for the user's reply.
 * Returns the user's answer string, or null if timed out / skipped.
 * postChatMessage: function that adds a message to the conversation and refreshes.
 */
export async function askScopeQuestions(
  task: string,
  postChatMessage: (content: string) => void,
): Promise<string | null> {
  const projectType = extractProjectType(task);

  const question =
    `Before I start building, two quick questions:\n\n` +
    `1. **What's it for?** (e.g. personal portfolio, business landing page, blog, e-commerce, tool, "just a simple page")\n` +
    `2. **How big?** Simple (1-2 pages) / Medium (multi-section with JS) / Full (backend, forms, data)\n\n` +
    `One reply covers both — or just describe what you need and I'll figure it out.`;

  postChatMessage(question);

  // Wait for user reply — 5 minute timeout then bail
  return new Promise<string | null>((resolve) => {
    _pendingScopeResolve = resolve;
    _scopeQuestionTimestamp = Date.now();
    setTimeout(() => {
      if (_pendingScopeResolve === resolve) {
        _pendingScopeResolve = null;
        resolve(null);
      }
    }, 300_000);
  });
}

/**
 * Parse a scope answer and return hints for the wizard pre-selection.
 */
export function parseScopeAnswer(answer: string): {
  complexity: 'simple' | 'medium' | 'full';
  purposeHint: string;
  enrichedTask: string;
} {
  const a = answer.toLowerCase();

  const complexity: 'simple' | 'medium' | 'full' =
    /\bfull\b|backend|database|auth|login|e-commerce|ecommerce|api|server|node|python|react|vue|angular/i.test(answer) ? 'full' :
    /\bmedium\b|multi|several|section|js|javascript|dynamic|form|animation|carousel|chart/i.test(answer) ? 'medium' :
    'simple';

  const purposeHint =
    /portfolio|personal|about me|my work|resume|cv/i.test(answer) ? 'portfolio' :
    /business|company|product|service|landing|startup|saas/i.test(answer) ? 'business' :
    /blog|article|post|write|content|news/i.test(answer) ? 'blog' :
    /dashboard|admin|panel|analytics|stats|chart/i.test(answer) ? 'dashboard' :
    /game|play|arcade|puzzle/i.test(answer) ? 'game' :
    /tool|utility|cli|convert|generate|calculate/i.test(answer) ? 'tool' :
    /api|rest|endpoint|backend|server/i.test(answer) ? 'api' :
    'general';

  // Keep enrichedTask short and regex-friendly so runTemplateWizard's isTemplateRequest check matches it
  const typeWord = purposeHint === 'game' ? 'game' :
    purposeHint === 'api' ? 'api' :
    purposeHint === 'tool' ? 'tool' :
    'website';
  const enrichedTask = `Build me a ${purposeHint} ${typeWord} (${complexity}). Details: ${answer}`;

  return { complexity, purposeHint, enrichedTask };
}

function extractProjectType(task: string): string {
  const m = task.match(/\b(website|web site|game|app|dashboard|portfolio|landing page|api|backend|blog|tool|cli)\b/i);
  return m ? m[1] : 'project';
}
