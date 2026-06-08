// [SCOPE] Adaptive Mode classifier — lightweight 50-token AI call to route between pipelines
// Evaluates each prompt to determine if it needs environment access (complex pipeline)
// or can be handled with code-only edits (simple surgical pipeline).

import type { RoutingService } from './routingService.js';

// [WARN] Fast-path patterns must stay conservative — false positives send simple edits
// to the expensive Agent loop. When in doubt, let the AI classifier decide.
const COMPLEX_TASK_FAST_PATHS = /\b(npm\s+(install|run|start|test|build)|yarn\s+(add|run|start)|pip\s+install|cargo\s+(build|run|test)|go\s+(build|run|test)|docker\s+(build|run|compose)|deploy|start\s+(the\s+)?server|run\s+(the\s+)?(app|project|build|tests?|server)|bundle|compile\s+and\s+(test|run|verify)|launch|execute|terminal|shell|command\s+line)\b/i;

const SIMPLE_TASK_FAST_PATHS = /\b(make|create|build)\s+(me\s+)?(a\s+)?(?:[a-zA-Z0-9\-_]+\s+)*(game|app|website|site|page|portfolio|dashboard|calculator|tracker|timer|tool|widget|form|ui)|change\s+(the\s+)?(color|font|size|text|style|margin|padding|border|background)|fix\s+(the\s+)?(typo|spelling|indent|alignment|css)|add\s+a\s+comment|rename\s+(the\s+)?(variable|function|class|file)|update\s+(the\s+)?(import|export|version)|remove\s+(the\s+)?(unused|dead|old)\b/i;

// [FIX] Visual / layout bug reports are simple code edits — never route to agent
const VISUAL_BUG_FAST_PATHS = /\b(cut off|cropped|overflow|overlap|misaligned|off screen|clipped|hidden|invisible|not showing|not displaying|not rendering|too small|too big|too large|doesn't fit|won't fit|out of|beyond|autosize|responsive|resize|scale|fit|center|align|position|margin|padding|width|height|layout)\b/i;

// [FIX] Runtime symptom bug reports — user describes what they SEE and asks for a fix.
// "blank in the browser", "acts weird", "not loading" are symptom descriptions, not requests
// to run the environment. The fix is always code. Never route these to the agent pipeline.
const SYMPTOM_BUG_FAST_PATHS = /\b(blank|black screen|white screen|acts? weird|looks? wrong|looks? broken|game is blank|board is blank|screen is blank|not (rendering|loading|working|running)|doesn'?t (render|load|work|run|show|appear)|won'?t (render|load|work|run|show)|only (in|in the) (browser|web browser|real browser)|works? in preview|blank in (the )?(browser|web)|browser.*blank|weird in|glitch|freezes?|crashes?)\b/i;

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

  // [FIX] Runtime symptom bug reports are always simple — user describes what they see,
  // fix is always in the code. "blank in browser" ≠ "needs to run a browser".
  if (SYMPTOM_BUG_FAST_PATHS.test(userText)) {
    return 'simple';
  }

  // AI classifier — 50-token call, Groq-first (cheapest), Gemini fallback
  try {
    const prompt = `You are a task router. Decide: CODE EDITS ONLY (simple) or REQUIRES running terminal commands (complex).

User request: "${userText.slice(0, 300)}"

Rules:
- Bug fixes, code changes, CSS edits, adding features, refactoring → simple
- New websites, apps, games from scratch → simple (output is files)
- User DESCRIBING a visual/runtime symptom (blank, crash, glitch, weird, not loading) and asking to FIX it → simple. The symptom is in the browser; the fix is in the code.
- "Works in X but not Y" → simple. Still a code fix.
- Installing packages, running builds, starting servers, deployment, CI/CD → complex
- ONLY complex if the task itself REQUIRES executing terminal commands — not because the bug happened at runtime

Respond with ONLY: simple or complex`;

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
