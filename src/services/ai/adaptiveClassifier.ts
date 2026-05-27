// [SCOPE] Adaptive Mode classifier — lightweight 50-token AI call to route between pipelines
// Evaluates each prompt to determine if it needs environment access (complex pipeline)
// or can be handled with code-only edits (simple surgical pipeline).

import type { RoutingService } from './routingService.js';

// [WARN] Fast-path patterns must stay conservative — false positives send simple edits
// to the expensive Agent loop. When in doubt, let the AI classifier decide.
const COMPLEX_TASK_FAST_PATHS = /\b(npm\s+(install|run|start|test|build)|yarn\s+(add|run|start)|pip\s+install|cargo\s+(build|run|test)|go\s+(build|run|test)|docker\s+(build|run|compose)|deploy|start\s+(the\s+)?server|run\s+(the\s+)?(app|project|build|tests?|server)|bundle|compile\s+and\s+(test|run|verify)|launch|execute|terminal|shell|command\s+line)\b/i;

const SIMPLE_TASK_FAST_PATHS = /\b(make|create|build)\s+(me\s+)?(a\s+)?(?:[a-zA-Z0-9\-_]+\s+)*(game|app)|change\s+(the\s+)?(color|font|size|text|style|margin|padding|border|background)|fix\s+(the\s+)?(typo|spelling|indent|alignment|css)|add\s+a\s+comment|rename\s+(the\s+)?(variable|function|class|file)|update\s+(the\s+)?(import|export|version)|remove\s+(the\s+)?(unused|dead|old)\b/i;

// [FIX] Visual / layout bug reports are simple code edits — never route to agent
const VISUAL_BUG_FAST_PATHS = /\b(cut off|cropped|overflow|overlap|misaligned|off screen|clipped|hidden|invisible|not showing|not displaying|not rendering|too small|too big|too large|doesn't fit|won't fit|out of|beyond|autosize|responsive|resize|scale|fit|center|align|position|margin|padding|width|height|layout)\b/i;

/**
 * Evaluates a user prompt to determine whether it should route to the simple pipeline
 * or the complex (agent) pipeline. Uses fast-path regex for obvious cases, then falls 
 * back to a lightweight AI classifier call.
 */
export async function evaluateTaskComplexity(
  userText: string,
  routing: RoutingService
): Promise<'simple' | 'complex'> {
  // Fast-path: obvious environment tasks → complex
  if (COMPLEX_TASK_FAST_PATHS.test(userText)) {
    return 'complex';
  }

  // Fast-path: obvious code-only edits → simple
  if (SIMPLE_TASK_FAST_PATHS.test(userText)) {
    return 'simple';
  }

  // [FIX] Visual / layout bug reports are always simple code edits — never agent
  if (VISUAL_BUG_FAST_PATHS.test(userText)) {
    return 'simple';
  }

  // AI classifier — 50-token call, Groq-first (cheapest), Gemini fallback
  try {
    const prompt = `You are a task router. Given this user request, decide if it can be handled with CODE EDITS ONLY (simple) or if it REQUIRES running terminal commands, installing packages, starting servers, compiling, testing, or interacting with the runtime environment (complex).

User request: "${userText.slice(0, 300)}"

Rules:
- Code changes, bug fixes, CSS edits, adding features, refactoring → simple
- Creating entirely new applications, games, or projects from scratch → simple
- Installing dependencies, running builds, starting servers, testing, deployment → complex
- If the request mentions BOTH code AND environment tasks → complex

Respond with ONLY the word: simple or complex`;

    const result = await routing.prompt(prompt, 12_000);
    if (result.success && result.text) {
      const answer = result.text.trim().toLowerCase();
      if (answer.includes('complex')) { return 'complex'; }
      if (answer.includes('simple')) { return 'simple'; }
    }
  } catch {
    // AI call failed — default to simple (safer, cheaper)
  }

  // Default: simple (most tasks are code-only)
  return 'simple';
}
