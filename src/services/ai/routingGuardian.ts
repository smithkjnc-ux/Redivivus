// [SCOPE] AI Routing Service — supervisor planning and guardian review
// Extracted from routingService.ts

import { callProvider } from '../../core/ai/providers/providerFactory.js';
import type { GuardianReviewResult } from './guardianAI.js';
import { selectGuardianAI, runGuardianReview } from './guardianAI.js';
import type { RoutingService } from './routingService.js';

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
  const fetch = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, 20_000);
  const neverDoSection = neverDoContext ? `\n${neverDoContext}\n` : '';

  // Detect project type and inject folder structure for multi-file projects
  const projectType = detectProjectType(userTask, blueprintContext || '');
  const folderBlock = (projectType && projectType !== 'single')
    ? `\n\n${getFolderStructureTemplate(projectType)}`
    : '';

  const prompt = `You are the CHASSIS Supervisor AI. Your ONLY job is to resolve ambiguity in the user's request — do NOT add features, complexity, or implementation patterns the user didn't ask for.${neverDoSection}

USER REQUEST: "${userTask}"
TARGET FILE: ${targetFile}
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}Write a TECHNICAL SPEC that:
- Keeps the SAME scope as the user's request — no new features, no extra classes, no patterns not implied by the request
- Replaces vague words with specific values ONLY
- Stays under 200 words
- Is written as terse direct instructions to the Worker AI
${folderBlock ? '- Includes the folder structure above so the Worker places each file in the correct subdirectory' : ''}

DO NOT: add classes, new features, refactor simple tasks into OOP, suggest libraries, or expand scope.
Reply with ONLY the spec. No preamble.`;
  try {
    const res = await callProvider(supervisor, prompt, fetch, 'pro');
    if (res.success && res.text.trim().length > 50) {
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
  const fetch = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, 20_000);
  // [FIX] Guardian uses default (flash/haiku) tier — scope review needs accuracy not Sonnet reasoning
  // [DEAD] Was: callProvider(..., 'pro') → every guardian pass cost Sonnet rates ($3/$15 per 1M)
  const caller = (ai: string, prompt: string) => callProvider(ai, prompt, fetch);
  return runGuardianReview(originalTask, workerResponse, workerAI, guardianAI, blueprintContext, caller);
}
