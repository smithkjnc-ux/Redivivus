// [SCOPE] AI Routing Service orchestrator — thin facade over keys, comment style, Gemini, and providers modules
// Split from 322-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import { VaultContextService } from './vaultContextService.js';
import { AIResponse } from './routingTypes.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from './routingKeys.js';
import { callGemini } from './routingGemini.js';
import { callProvider } from './routingProviders.js';
import { classifyTask, estimateTokens, estimateCost } from './routingClassifier.js';
import { AI_RANK, selectGuardianAI, guardianEnabled, runGuardianReview, GuardianReviewResult } from './guardianAI.js';

// [CHASSIS] Supervisor/Worker pair — cached per settings snapshot, invalidated on change.
interface SwPair { supervisor: string; worker: string | null; }
let _swCache: { pair: SwPair; settingsKey: string } | null = null;

/** Returns current settings key for cache invalidation */
function _settingsKey(): string {
  const cfg = vscode.workspace.getConfiguration('chassis');
  const keys = ['gemini','claude','openai','groq','xai','kimi'];
  return keys.map(k => cfg.get<string>(k + 'ApiKey') ? k : '').join(',') + '|' + (cfg.get<string>('defaultAI') || 'gemini');
}

export class RoutingService {
  private vaultContext?: VaultContextService;

  // Inject vault context service after construction (avoids circular dep)
  setVaultContextService(svc: VaultContextService): void {
    this.vaultContext = svc;
  }

  // ── Supervisor/Worker pair selection

  /**
   * Returns { supervisor, worker } where supervisor = highest-ranked connected AI,
   * worker = second-highest. If only one AI is connected, worker = null.
   * Result is cached per settings state and invalidated when keys/defaultAI change.
   */
  selectSupervisorAndWorker(): SwPair {
    const key = _settingsKey();
    if (_swCache && _swCache.settingsKey === key) { return _swCache.pair; }
    const keyMap = this.getKeyMap();
    const ranked = Object.entries(AI_RANK)
      .filter(([ai]) => keyMap[ai]?.())
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([ai]) => ai);
    const pair: SwPair = {
      supervisor: ranked[0] || 'gemini',
      worker: ranked.length >= 2 ? ranked[1] : null,
    };
    _swCache = { pair, settingsKey: key };
    return pair;
  }

  /** Builds the full AI roster: Supervisor (highest-ranked), Workers (remaining), Guardian (highest-ranked). */
  buildRoster(): { supervisor: string; workers: string[]; guardian: string | null } {
    const keyMap = this.getKeyMap();
    const ranked = Object.entries(AI_RANK)
      .filter(([ai]) => keyMap[ai]?.())
      .sort(([, a], [, b]) => b - a)
      .map(([ai]) => ai);
    if (ranked.length === 0) return { supervisor: 'gemini', workers: [], guardian: null };
    const supervisor = ranked[0];
    const workers = ranked.slice(1);
    const guardian = ranked.length >= 1 ? ranked[0] : null;
    return { supervisor, workers, guardian };
  }

  /** Returns human-readable roster display with roles and emojis. */
  getRosterDisplay(): Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }> {
    const roster = this.buildRoster();
    const labelMap: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
    const result: Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }> = [];
    result.push({ ai: roster.supervisor, label: labelMap[roster.supervisor] || roster.supervisor, role: 'Supervisor', emoji: '🎯' });
    for (const w of roster.workers) {
      result.push({ ai: w, label: labelMap[w] || w, role: 'Worker', emoji: '⚙️' });
    }
    if (roster.guardian && roster.guardian !== roster.supervisor) {
      result.push({ ai: roster.guardian, label: labelMap[roster.guardian] || roster.guardian, role: 'Guardian', emoji: '🛡️' });
    }
    return result;
  }

  // ── AI availability check (delegated to routingKeys)

  /** Returns the full model version string for the currently active AI (e.g. "gemini-2.5-flash", "gpt-4o-mini"). */
  getModelName(): string {
    const ai = this.getAvailableAI().ai;
    const modelMap: Record<string, string> = {
      gemini: 'gemini-2.5-flash',
      claude: 'claude-3-5-haiku-20241022',
      openai: 'gpt-4o-mini',
      groq: 'llama-3.3-70b-versatile',
      xai: 'grok-2-1212',
      kimi: 'moonshot-v1-8k',
    };
    return modelMap[ai] || ai;
  }

  getAvailableAI(): { ai: string; source: 'chassis-settings' | 'env' | 'none'; label: string } {
    const config = vscode.workspace.getConfiguration('chassis');
    const defaultAI = config.get<string>('defaultAI') || 'gemini';

    const checks: Array<{ id: string; label: string; key: () => string | null }> = [
      { id: 'gemini', label: 'Gemini',  key: getGeminiKey },
      { id: 'claude', label: 'Claude',  key: getClaudeKey },
      { id: 'openai', label: 'GPT-4o',  key: getOpenAIKey },
      { id: 'groq',   label: 'Groq',    key: getGroqKey },
      { id: 'xai',    label: 'Grok',    key: getXAIKey },
      { id: 'kimi',   label: 'Kimi',    key: getKimiKey },
    ];

    // Try defaultAI first
    const preferred = checks.find(c => c.id === defaultAI);
    if (preferred && preferred.key()) {
      return { ai: preferred.id, source: 'chassis-settings', label: preferred.label };
    }
    // Fall back to first available
    for (const c of checks) {
      if (c.key()) return { ai: c.id, source: 'chassis-settings', label: c.label + ' (fallback)' };
    }
    return { ai: 'none', source: 'none', label: 'No AI' };
  }

  // ── file analysis — routed through Supervisor AI (highest-ranked connected AI)

  async analyzeFile(filePath: string, content: string, instruction: string, cancelToken?: import('vscode').CancellationToken): Promise<AIResponse> {
    const { supervisor } = this.selectSupervisorAndWorker();
    // [CHASSIS] Gemini has a dedicated streaming analyzeFile path via callGemini.
    // All other supervisors fall through to callProvider with a composed prompt.
    if (supervisor === 'gemini') {
      const key = getGeminiKey();
      if (!key) {
        return { text: '', model: 'none', success: false, error: 'No Gemini API key. Set it in CHASSIS settings or via GEMINI_API_KEY env var.' };
      }
      return callGemini(key, filePath, content, instruction, this.vaultContext, cancelToken);
    }
    const fetch = (url: string, opts: RequestInit) => this.fetchWithTimeout(url, opts, 30_000);
    const prompt = `${instruction}\n\nFile: ${filePath}\n\`\`\`\n${content.slice(0, 6000)}\n\`\`\``;
    return callProvider(supervisor, prompt, fetch);
  }

  // ── general prompt (delegated to routingProviders)

  async prompt(text: string, timeoutMs = 30_000): Promise<AIResponse & { usingFallback?: string }> {
    const available = this.getAvailableAI();
    if (available.ai === 'none') {
      return { text: '', model: 'none', success: false, error: 'No AI key configured. Add an API key in CHASSIS Settings (Files & AI tab).' };
    }

    const defaultAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';
    const usingFallback = available.ai !== defaultAI ? available.label : undefined;

    const fetch = (url: string, opts: RequestInit) => this.fetchWithTimeout(url, opts, timeoutMs);
    return callProvider(available.ai, text, fetch);
  }

  // ── fetch with timeout (orchestrator-only — shared by all providers)

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

  // ── complexity-based routing (Auto AI Routing)

  /** Classify task complexity and route to the most cost-effective AI.
   *  Returns the AI response plus routing metadata (cost estimate, tier used).
   *  Simple tasks → free AI. Complex tasks → paid AI if available, else free fallback. */
  async routeByComplexity(task: string, promptText: string, timeoutMs = 30_000): Promise<AIResponse & { estimate?: string; tier?: 'free' | 'paid'; routedTo?: string; routingReason?: string }> {
    const complexity = classifyTask(task);
    const tokens = estimateTokens(promptText);
    const estCost = estimateCost(tokens.total, complexity === 'simple' ? 'free' : 'paid');

    const keyMap: Record<string, () => string | null> = {
      gemini: getGeminiKey, claude: getClaudeKey, openai: getOpenAIKey,
      groq: getGroqKey, xai: getXAIKey, kimi: getKimiKey,
    };
    const has = (ai: string) => !!keyMap[ai]?.();

    // -- Aces in their places: task-aware Worker routing --
    // Kimi 32k  → large prompts (file analysis, multi-file, existing content tasks)
    // Groq      → speed tasks (simple builds, short Q&A)
    // Gemini    → complex reasoning, fallback
    let chosenAI: string | null = null;
    const isLargeContext = tokens.total > 4000;  // prompt is large — Kimi's strength
    const isSpeedTask = complexity === 'simple' && tokens.total < 1500; // short and simple — Groq's strength

    let routingReason = '';
    if (isLargeContext && has('kimi'))       { chosenAI = 'kimi';   routingReason = 'Large prompt (' + tokens.total.toLocaleString() + ' tokens) — Kimi 32k handles big context best'; }
    else if (isSpeedTask && has('groq'))     { chosenAI = 'groq';   routingReason = 'Simple short task — Groq/Llama is fastest for quick builds'; }
    else if (has('gemini'))                  { chosenAI = 'gemini'; routingReason = 'Medium complexity — Gemini Flash is the reliable all-rounder'; }
    else if (has('claude'))                  { chosenAI = 'claude'; routingReason = 'Complex task — Claude chosen for strongest reasoning'; }
    else if (has('openai'))                  { chosenAI = 'openai'; routingReason = 'Complex task — GPT-4o chosen as strong fallback'; }
    else if (has('xai'))                     { chosenAI = 'xai';    routingReason = 'Grok chosen — strong reasoning fallback'; }
    else if (has('kimi'))                    { chosenAI = 'kimi';   routingReason = 'Kimi chosen as fallback worker'; }
    else if (has('groq'))                    { chosenAI = 'groq';   routingReason = 'Groq chosen as fallback worker'; }

    if (!chosenAI) {
      return { text: '', model: 'none', success: false, error: 'No AI key configured. Add an API key in CHASSIS Settings (Files & AI tab).' };
    }

    // -- Smart fallback chain --
    // Capable tier (handles complex tasks): gemini, claude, openai, xai, kimi
    // Speed tier (simple tasks only): groq
    // Rules: try chosen AI first; on failure retry within capable tier; never fall to groq for complex tasks
    const capableTier = ['gemini', 'claude', 'openai', 'xai', 'kimi'].filter(ai => ai !== chosenAI && has(ai));
    const speedTier = ['groq'].filter(ai => ai !== chosenAI && has(ai));
    const isComplexTask = !isSpeedTask; // was routed to capable tier
    const fallbackChain = isComplexTask ? capableTier : [...capableTier, ...speedTier];

    const fetch = (url: string, opts: RequestInit) => this.fetchWithTimeout(url, opts, timeoutMs);
    let res = await callProvider(chosenAI, promptText, fetch);

    if (!res.success && fallbackChain.length > 0) {
      for (const fallbackAI of fallbackChain) {
        const prevAI = chosenAI;
        res = await callProvider(fallbackAI, promptText, fetch);
        if (res.success) {
          routingReason += ` [${prevAI} failed — fell back to ${fallbackAI}]`;
          chosenAI = fallbackAI;
          break;
        }
      }
    }

    return { ...res, estimate: `${tokens.total.toLocaleString()} tokens · ~${estCost}`, tier: chosenAI === 'gemini' || chosenAI === 'groq' ? 'free' : 'paid', routedTo: chosenAI, routingReason };
  }

  // ── Guardian AI review ──

  /** Returns the key map for all providers (used by guardian selection) */
  getKeyMap(): Record<string, () => string | null> {
    return {
      gemini: getGeminiKey, claude: getClaudeKey, openai: getOpenAIKey,
      groq: getGroqKey, xai: getXAIKey, kimi: getKimiKey,
    };
  }

  /** Returns true if Guardian AI review is enabled and 2+ keys are configured */
  isGuardianActive(): boolean {
    return guardianEnabled(this.getKeyMap());
  }

  /** Returns which AI will act as guardian for a given worker AI */
  getGuardianFor(workerAI: string): string | null {
    return selectGuardianAI(workerAI, this.getKeyMap());
  }

  /**
   * Supervisor planning pass — translates vague user intent into a precise, unambiguous technical spec.
   * Only runs when a Supervisor/Worker pair is configured (2+ AI keys). Returns null if solo mode.
   */
  async supervisorPlan(userTask: string, targetFile: string, blueprintContext: string, neverDoContext?: string): Promise<string | null> {
    const { supervisor, worker } = this.selectSupervisorAndWorker();
    if (!worker || worker === supervisor) { return null; } // solo mode — skip
    const fetch = (url: string, opts: RequestInit) => this.fetchWithTimeout(url, opts, 20_000);
    const neverDoSection = neverDoContext ? `\n${neverDoContext}\n` : '';
    const prompt = `You are the CHASSIS Supervisor AI. Your ONLY job is to resolve ambiguity in the user's request — do NOT add features, complexity, or implementation patterns the user didn't ask for.${neverDoSection}

USER REQUEST: "${userTask}"
TARGET FILE: ${targetFile}
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}
Write a TECHNICAL SPEC that:
- Keeps the SAME scope as the user's request — no new features, no extra classes, no patterns not implied by the request
- Replaces vague words with specific values ONLY (e.g. "dark background" → background: #0a0a0f; canvas clear: rgba(0,0,0,0.12) per frame for persistent trail fading)
- For trail/glow effects: trail stores {x, y, hue} per frame; hue increments each frame for color cycling; ageFactor = i / trail.length (NOT i / maxTrailLength — divide by actual array length so head is always full brightness even while filling up); alpha = ageFactor * 0.8 + 0.1; radius = ageFactor * segmentRadius + minRadius; use ctx.arc() + shadowBlur + shadowColor per point for glow; AFTER the trail loop reset ctx.shadowBlur = 0 to prevent glow bleeding into the background clear rect
- Init order: set canvas.width/height FIRST, then derive speed = Math.hypot(canvas.width, canvas.height) / 180, then set x/y/dx/dy — NEVER reference x/y in resize handler before they are initialized (causes NaN → black screen); guard resize clamp with typeof x === 'number' check
- Background: body and canvas background-color must be #0a0a0f in CSS; the fillRect clear uses rgba(0,0,0,0.12) — this must NEVER be a colored value; the background must always remain near-black regardless of trail colors
- For canvas: canvas.width MUST be set via JS assignment (canvas.width = window.innerWidth), NOT CSS alone; add window resize listener
- For velocity variables: always use let for dx, dy; derive speed = Math.hypot(canvas.width, canvas.height) / 180 at init; normalize a random direction to unit vector THEN multiply by speed: angle = Math.random()*Math.PI*2; dx = Math.cos(angle)*speed; dy = Math.sin(angle)*speed — this guarantees the ball actually moves at the intended speed
- Wall bounce: clamp position AND reverse velocity — if (x < r) { x = r; dx = Math.abs(dx); } pattern, prevents sticking at edges
- Single animation loop only: ONE requestAnimationFrame call at the bottom of the loop function — never call rAF inside draw() AND inside the loop
- Stays under 200 words
- Is written as terse direct instructions to the Worker AI

DO NOT: add classes, new features, refactor simple tasks into OOP, suggest libraries, or expand scope.
Reply with ONLY the spec. No preamble.`;
    try {
      // Supervisor uses Pro for reasoning quality — Flash for Worker, Pro for planning/review
      const res = await callProvider(supervisor, prompt, fetch, 'pro');
      if (res.success && res.text.trim().length > 50) { return res.text.trim(); }
    } catch { /* fall through to null */ }
    return null;
  }

  /** Run guardian review of a worker AI response. Returns corrected text or null if clean. */
  async guardianReview(
    originalTask: string,
    workerResponse: string,
    workerAI: string,
    blueprintContext: string
  ): Promise<GuardianReviewResult> {
    const keyMap = this.getKeyMap();
    const guardianAI = selectGuardianAI(workerAI, keyMap);
    if (!guardianAI) {
      return { passed: true, correctedText: null, issues: [], guardianAI: 'none', workerAI };
    }
    const fetch = (url: string, opts: RequestInit) => this.fetchWithTimeout(url, opts, 20_000);
    // Guardian uses Pro for reasoning quality — catches more errors than Flash
    const caller = (ai: string, prompt: string) => callProvider(ai, prompt, fetch, 'pro');
    return runGuardianReview(originalTask, workerResponse, workerAI, guardianAI, blueprintContext, caller);
  }
}
