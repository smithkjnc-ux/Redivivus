// [SCOPE] AI Routing Service — supervisor planning and guardian review
// Extracted from routingService.ts

import { callProvider } from '../../core/ai/providers/providerFactory.js';
import type { GuardianReviewResult } from './guardianAI.js';
import { selectGuardianAI, runGuardianReview } from './guardianAI.js';
import type { RoutingService } from './routingService.js';
import { logAICall } from './aiCallLogger.js';

export type ProjectType = 'web' | 'api' | 'game' | 'single';

function detectProjectType(task: string, blueprint: string): ProjectType | null {
  const text = (task + ' ' + blueprint).toLowerCase();

  // Single-file projects skip folder structure
  if (/\b(single file|one file|just one|only one|standalone|html file|single page)\b/.test(text)) {
    return 'single';
  }

  // Game projects
  if (/\b(game|unity|phaser|three\.js|canvas|sprite|level|engine|physics|entity|scene)\b/.test(text)) {
    return 'game';
  }

  // Node/API projects
  if (/\b(api|backend|server|node|express|rest|graphql|database|endpoint|middleware|controller|model)\b/.test(text)) {
    return 'api';
  }

  // Web apps
  if (/\b(web|app|react|vue|angular|frontend|website|platform|spa|nextjs|svelte|component|page|hook|style)\b/.test(text)) {
    return 'web';
  }

  return null;
}

function getFolderStructureTemplate(type: ProjectType): string {
  if (type === 'web') {
    return `FOLDER STRUCTURE (Web App):
Place files in the correct subdirectories. Do NOT dump everything in src/.
  src/
    components/    — reusable UI components
    pages/         — route-level page components
    hooks/         — custom React/Vue hooks
    utils/         — helper functions and utilities
    styles/        — CSS, SCSS, or styled-component files
    assets/        — images, fonts, static files`;
  }
  if (type === 'api') {
    return `FOLDER STRUCTURE (Node/API):
Place files in the correct subdirectories. Do NOT dump everything in src/.
  src/
    routes/        — API endpoint definitions
    controllers/   — request handlers and business logic
    models/        — data models and schemas
    middleware/    — auth, validation, logging middleware
    utils/         — helper functions
    config/        — environment and configuration files`;
  }
  if (type === 'game') {
    return `FOLDER STRUCTURE (Game):
Place files in the correct subdirectories. Do NOT dump everything in src/.
  src/
    engine/        — game loop, physics, rendering core
    entities/      — player, enemies, items, NPCs
    scenes/        — menu, gameplay, gameover, level screens
    assets/        — sprites, sounds, tilemaps
    utils/         — helper functions and math utilities`;
  }
  return '';
}

export async function supervisorPlanImpl(
  svc: RoutingService,
  userTask: string,
  targetFile: string,
  blueprintContext: string,
  neverDoContext?: string
): Promise<string | null> {
  // Supervisor = highest-ranked available AI by AI_RANK (Claude > OpenAI > xAI > Gemini > Kimi > Groq).
  // Do NOT use getPreferredAI() here — defaultAI is the user's chat default, not a supervisor override.
  const { supervisor, worker } = svc.selectSupervisorAndWorker();
  if (!worker || worker === supervisor) { return null; }
  // [FIX] 20s was too short — detailed prescriptions (polygon verts, physics, full API specs) take 30-50s
  const fetch = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, 50_000);
  const neverDoSection = neverDoContext ? `\n${neverDoContext}\n` : '';

  // Detect project type and inject folder structure for multi-file projects
  const projectType = detectProjectType(userTask, blueprintContext || '');
  const folderBlock = (projectType && projectType !== 'single')
    ? `\n\n${getFolderStructureTemplate(projectType)}`
    : '';

  const supervisorPersona = `You are the shop foreman. You size the job before anyone picks up a wrench.

Your voice: direct, warm, efficient. You've seen every kind of job. You know in 5 seconds whether this is a 10-minute fix or a full day's work.

Rules for how you talk:
- For small jobs (tell-them tier): don't ask anything. Say what you're doing in one sentence and do it.
- For medium jobs (look-it-up, offer-choices): ask ONE question at a time. Most important unknown first.
- For big jobs (explore-with-them): make sure you're building the right thing before starting.
- No technical jargon with the user. "I'll update the function" not "I'll refactor the async handler."
- You have opinions. Share them. "I'd go with option 2 -- easier to change later. But it's your call."
- If the request doesn't match the goal, say so. "You asked for X -- sounds like you need Y. Want me to do Y?"

`;
  const prompt = `${supervisorPersona}You are the Redivivus Supervisor AI. Your prescription is the Worker's ONLY instruction set. The Worker executes exactly what you write — nothing more, nothing less. If you are vague, the output will be wrong.${neverDoSection}

USER REQUEST: "${userTask}"
TARGET FILE: ${targetFile}
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}
PRESCRIPTION FORMAT:
## [filename]
- \`functionName(params)\` — [complete behavior: exact logic, return value, every meaningful detail]
- \`CONSTANT_NAME = value\` — explain why this specific value
- Change \`[exact old code]\` → \`[exact new code]\`

UNIVERSAL PRECISION REQUIREMENT — applies to every build, no exceptions:
The Worker has zero judgment. Every blank you leave becomes a wrong guess. Fill every blank.

VISUAL / CANVAS / GAME — for every drawn element:
  - Exact shape: polygon(N irregular verts) / circle(r) / arc — never just "shape" or "rock"
  - Fill: fillStyle='#rrggbb' or "no fill" | Stroke: strokeStyle='#rrggbb', lineWidth=N or "no stroke"
  - Polygon vertices: count, how calculated, where stored (e.g. "8 verts, random radius 0.8–1.2×base, pre-calc on spawn into asteroid.verts[]")
  - Physics: px/frame speed, deg/frame rotation, wrap or bounce rule | Color palette: every color used

LOGIC / BACKEND / API — for every function:
  - Exact signature, return type | All branches: what each case returns/throws
  - Data shape: exact field names and types | Constants: value + why that value

CSS / STYLING / UI — for every element:
  - Exact colors (hex) and exact px/rem values — not "dark blue" or "small margin"
  - Layout: flex/grid direction, gap, alignment | Breakpoints if any | Hover/focus states

STATE / DATA — for every piece of state:
  - Name, type, initial value | Allowed mutations and when | Where it lives

RULE: If you cannot specify something exactly, choose the canonical default and state it explicitly.
Bad: "\`drawAsteroid(ctx, a)\` — draws an asteroid"
Good: "\`drawAsteroid(ctx, a)\` — ctx.beginPath(); a.verts.forEach((v,i)=> i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y)); ctx.closePath(); ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.stroke(); // no fill"

Match EXACT scope of the request — no extra features.${folderBlock ? ' Place each file in the correct subdirectory.' : ''}
Reply with ONLY the prescription. No preamble.${folderBlock}`;
  try {
    const startTime = Date.now();
    const res = await callProvider(supervisor, prompt, fetch, 'pro');
    if (res.success && res.text.trim().length > 50) {
      logAICall({
        role: 'supervisor',
        model: res.model || supervisor,
        prompt,
        response: res.text,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        durationMs: Date.now() - startTime,
      });
      let spec = res.text.trim();
      // Append folder structure directly to the returned spec for multi-file projects
      if (folderBlock && !spec.includes('FOLDER STRUCTURE')) {
        spec += '\n\n' + getFolderStructureTemplate(projectType!);
      }
      return spec;
    }
  } catch { /* fall through */ }
  return null;
}

export async function guardianReviewImpl(
  svc: RoutingService,
  originalTask: string,
  workerResponse: string,
  workerAI: string,
  blueprintContext: string
): Promise<GuardianReviewResult> {
  const keyMap = svc.getKeyMap();
  const guardianAI = selectGuardianAI(workerAI, keyMap);
  if (!guardianAI) {
    return { passed: true, correctedText: null, issues: [], scopeAlerts: [], guardianAI: 'none', workerAI };
  }
  // [FIX] 20s was too short — detailed prescriptions (polygon verts, physics, full API specs) take 30-50s
  const fetch = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, 50_000);
  // [WARN] Guardian uses 'pro' tier (Sonnet/Pro) — it IS the quality gate, same as Supervisor.
  // [DEAD] Was: default tier (flash/haiku) — cheap model produced vague style critiques that
  // wasted 4-6 retry calls, costing MORE than one pro-tier guardian call.
  const startTime = Date.now();
  const caller = (ai: string, prompt: string) => callProvider(ai, prompt, fetch, 'pro');
  const result = await runGuardianReview(originalTask, workerResponse, workerAI, guardianAI, blueprintContext, caller);
  logAICall({
    role: 'guardian',
    model: guardianAI,
    prompt: `TASK: ${originalTask}\n\nWORKER (${workerAI}) OUTPUT:\n${workerResponse}`,
    response: JSON.stringify({ passed: result.passed, issues: result.issues, scopeAlerts: result.scopeAlerts }),
    durationMs: Date.now() - startTime,
  });
  return result;
}
