// [SCOPE] Build Placement Check — decides if a build request clearly fits the active project blueprint
// or needs user confirmation before writing into the current project.
// Called by handleBuildRequest before vault search, on every build path.

import type { RoutingService } from '../../../../shared/ai/infrastructure/routingService.js';

export type PlacementDecision = 'fit' | 'ambiguous' | 'no-project';

export interface PlacementCheckResult {
  decision: PlacementDecision;
  projectName: string;
}

// [DONE] BACKEND_SIGNALS/FRONTEND_SIGNALS keyword lists replaced with AI classifier per Rule 18.
// blueprintDomain reads our own structured context — kept as keyword filter (structural, not NL).
const BACKEND_SIGNALS = /\b(api|endpoint|route|controller|model|schema|migration|database|db|server|backend|django|fastapi|flask|express|sqlalchemy|orm|rest|graphql|prisma|middleware|auth|jwt|crud|repository|serializer)\b/i;
const FRONTEND_SIGNALS = /\b(ui|page|component|form|input|button|screen|modal|layout|style|css|html|react|vue|svelte|widget|panel|card|header|nav|menu|sidebar|dropdown|toast|dialog|table|grid|theme|render)\b/i;

/** Derive the domain from blueprintContext (our own structured data — keyword match is safe here). */
function blueprintDomain(ctx: string): 'frontend' | 'backend' | 'mixed' | 'unknown' {
  const isFrontend = FRONTEND_SIGNALS.test(ctx);
  const isBackend  = BACKEND_SIGNALS.test(ctx);
  if (isFrontend && !isBackend) { return 'frontend'; }
  if (isBackend  && !isFrontend) { return 'backend'; }
  if (isFrontend && isBackend)  { return 'mixed'; }
  return 'unknown';
}

/** [RULE 18] AI classifier decides task domain — regex cannot reliably parse free-form task descriptions. */
async function taskDomain(task: string, routing: RoutingService): Promise<'frontend' | 'backend' | 'mixed' | 'unknown'> {
  try {
    const prompt = `Task: "${task.slice(0, 200)}"\nIs this task about frontend UI, backend logic, or both? Reply with one word: frontend, backend, mixed, or unknown`;
    const res = await routing.prompt(prompt, 12_000);
    if (res.success && res.text) {
      const w = res.text.trim().toLowerCase();
      if (w === 'frontend' || w === 'backend' || w === 'mixed') { return w; }
    }
  } catch { /* fall through */ }
  return 'unknown';
}

/** Extract only the WHO and WHAT field values from a blueprintContext string. */
function extractCoreIntent(blueprintContext: string): string {
  const lines = blueprintContext.split('\n');
  const coreLines = lines.filter(l => /^(who|what):/i.test(l.trim()));
  return coreLines.map(l => l.replace(/^(who|what):\s*/i, '')).join(' ');
}

/** Normalise a project name (e.g. "expense-tracker") into individual keywords. */
function projectNameWords(name: string): string[] {
  return name.toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Check whether a build task clearly fits the active project blueprint.
 *
 * Rules (in priority order):
 * 1. No project / no blueprint → 'no-project'
 * 2. Project name hard rule: if task shares ZERO keywords with the normalised
 *    project name AND the task has 3+ meaningful words → 'ambiguous'
 *    (project name is the strongest signal — trust it over content matching)
 * 3. Keyword affinity (WHO + WHAT fields only, not full blueprint): 2+ task
 *    words found in WHO/WHAT → 'fit'
 * 4. Domain mismatch: strictly opposite frontend/backend domains → 'ambiguous'
 * 5. Unknown/mixed domains → 'fit'
 */
export async function checkBuildPlacement(
  task: string,
  blueprintContext: string,
  isInitialized: boolean,
  projectName: string,
  routing: RoutingService,
): Promise<PlacementCheckResult> {
  if (!isInitialized || !blueprintContext.trim()) {
    return { decision: 'no-project', projectName };
  }

  // [FIX] If task mentions a specific file path with extension, it is always for the current project.
  // Prevents edit/fix requests like "update src/app.tsx" from routing to the new-project wizard.
  if (/\b[\w/-]+\.(ts|tsx|js|jsx|py|html|css|scss|json|go|rs)\b/i.test(task)) {
    return { decision: 'fit', projectName };
  }

  const stopWords = new Set(['a','an','the','and','or','for','to','in','of','that','with','build','create','make','write','generate','simple','basic','small','i','me','please','add','new','this','my']);
  const taskWords = task.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  // Rule 2: project name hard rule — normalised project name vs task keywords
  const pnWords = projectNameWords(projectName);
  if (pnWords.length > 0 && taskWords.length >= 3) {
    const nameHits = taskWords.filter(w => pnWords.some(p => p === w || w.includes(p) || p.includes(w))).length;
    if (nameHits === 0) {
      // Task shares no words with project name — likely a different project
      return { decision: 'ambiguous', projectName };
    }
  }

  // Rule 3: keyword affinity — restrict to WHO + WHAT fields ONLY (not file names, docs, vault history)
  const coreIntent = extractCoreIntent(blueprintContext).toLowerCase();
  if (coreIntent) {
    const affinityHits = taskWords.filter(w => coreIntent.includes(w)).length;
    if (affinityHits >= 2) { return { decision: 'fit', projectName }; }
  }

  // Rule 4: domain mismatch check
  const bpDomain = blueprintDomain(blueprintContext);
  const taskDom  = await taskDomain(task, routing);

  if (bpDomain === 'unknown' || taskDom === 'unknown') { return { decision: 'fit', projectName }; }
  if (bpDomain === 'mixed'   || taskDom === 'mixed')   { return { decision: 'fit', projectName }; }
  if (bpDomain === taskDom) { return { decision: 'fit', projectName }; }

  // Strict opposite domains → ambiguous
  return { decision: 'ambiguous', projectName };
}
