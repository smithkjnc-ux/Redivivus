// [SCOPE] Dynamic AI/model routing engine — scores every available model against a structured task profile.
// Replaces hardcoded provider preference lists and static AI_RANK with capability-aware, task-driven selection.
// scoreModels() is synchronous (used by roster); analyzeTask() is async with regex fallback for the chat router.
// [WARN] callProvider is imported dynamically inside analyzeTask() to avoid circular dependency with providerFactory.
// [NEXT] When providerFactory supports modelId-level dispatch, route to the specific model, not just the provider.

import { MODEL_REGISTRY } from './modelRegistry.js';

export type ReasoningLevel = 'low' | 'medium' | 'high';
export type DomainType = 'code-gen' | 'architecture' | 'math' | 'debug' | 'refactor' | 'qa' | 'creative' | 'documentation';
export type SizeLevel = 'tiny' | 'small' | 'medium' | 'large' | 'huge';

export interface TaskProfile {
  reasoning: ReasoningLevel;       // how much chain-of-thought depth helps
  domain: DomainType;              // what kind of work is being requested
  contextSize: SizeLevel;          // how much input context is needed
  outputSize: SizeLevel;           // expected size of the response
  speedPriority: 'low' | 'medium' | 'high'; // latency vs quality tradeoff
  toolsRequired: boolean;          // needs function calling — eliminates deepseek-reasoner
  thinkingBenefits: boolean;       // extended reasoning / thinking budget would genuinely help
}

export interface ModelScore {
  provider: string;
  modelId: string;
  label: string;
  score: number;
  reason: string;
}

// Minimum contextK (in thousands) required for each input size level
const CTX_NEEDED: Record<SizeLevel, number> = { tiny: 4, small: 16, medium: 64, large: 128, huge: 500 };
// Minimum outputK required for each output size level
const OUT_NEEDED: Record<SizeLevel, number> = { tiny: 1, small: 4, medium: 8, large: 16, huge: 32 };

// Keywords matched against ModelDef.strengths — bidirectional substring so 'reasoning' matches 'deep reasoning'
const DOMAIN_KEYWORDS: Record<DomainType, string[]> = {
  'code-gen':       ['code generation', 'multi-file', 'fast code gen', 'full-stack', 'general coding', 'APIs'],
  'architecture':   ['architecture', 'deep reasoning', 'planning', 'complex refactor', 'security review'],
  'math':           ['logical reasoning', 'math', 'algorithms', 'step-by-step logic', 'reasoning'],
  'debug':          ['complex debugging', 'code generation', 'reasoning', 'deep reasoning'],
  'refactor':       ['complex refactor', 'multi-file', 'review', 'planning', 'architecture'],
  'qa':             ['fast', 'simple tasks', 'structured output', 'quick answers', 'fast edits'],
  'creative':       ['creative solutions', 'UI', 'games', 'large output'],
  'documentation':  ['documentation', 'data processing', 'structured output'],
};

/**
 * Score every available model against a task profile.
 * Returns models sorted best-first. availableKeys maps provider → true if a key is configured.
 * Bidirectional substring matching: 'reasoning' in strength matches 'deep reasoning' keyword and vice versa.
 */
export function scoreModels(profile: TaskProfile, availableKeys: Record<string, boolean>): ModelScore[] {
  const results: ModelScore[] = [];

  for (const m of MODEL_REGISTRY) {
    if (!availableKeys[m.provider]) continue;
    if (profile.toolsRequired && m.modelId === 'deepseek-reasoner') continue;

    let score = m.capability * 10;  // 40–100 baseline from registry
    const parts: string[] = [];

    // ── Context window ────────────────────────────────────────────────────────
    const needCtx = CTX_NEEDED[profile.contextSize];
    if (m.contextK < needCtx) {
      const pen = Math.min(40, (needCtx - m.contextK) * 1.5);
      score -= pen; parts.push(`ctx-${Math.round(pen)}`);
    }

    // ── Output size ────────────────────────────────────────────────────────────
    if (m.outputK < OUT_NEEDED[profile.outputSize]) {
      score -= 20; parts.push('out-20');
    }

    // ── Domain strength match ─────────────────────────────────────────────────
    const keywords = DOMAIN_KEYWORDS[profile.domain] ?? [];
    const hits = m.strengths.filter(s =>
      keywords.some(k => s.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(s.toLowerCase()))
    );
    if (hits.length > 0) {
      const bonus = hits.length * 8;
      score += bonus; parts.push(`dom+${bonus}`);
    }

    // ── Reasoning / thinking ──────────────────────────────────────────────────
    if (profile.reasoning === 'high') {
      if (m.thinking) { score += 20; parts.push('think+20'); }
      else             { score -= 5;  parts.push('nothink-5'); }
    } else if (profile.reasoning === 'low' && m.thinking) {
      score -= 8; parts.push('overkill-8');  // adds latency+cost with no benefit
    }

    // ── Speed vs quality ───────────────────────────────────────────────────────
    if (profile.speedPriority === 'high') {
      const pen = m.costTier * 4;
      score -= pen; parts.push(`speed-${pen}`);
    } else if (profile.speedPriority === 'low') {
      const bonus = m.capability * 2;
      score += bonus; parts.push(`quality+${bonus}`);
    }

    // ── Cost efficiency tie-breaker ───────────────────────────────────────────
    score -= m.costTier * 0.3;

    results.push({ provider: m.provider, modelId: m.modelId, label: m.label, score: Math.round(score), reason: parts.join(' ') });
  }

  return results.sort((a, b) => b.score - a.score);
}

/** Used by the roster when no task is known yet — balanced "general software engineering" baseline. */
export const DEFAULT_PROFILE: TaskProfile = {
  reasoning: 'medium', domain: 'code-gen', contextSize: 'medium', outputSize: 'medium',
  speedPriority: 'low', toolsRequired: false, thinkingBenefits: false,
};

/** Regex-based profile extraction — zero API calls. Used as fallback. */
export function regexProfile(task: string): TaskProfile {
  const t = task.toLowerCase();
  const isArch     = /\b(architect|design|system|structure|blueprint)\b/.test(t);
  const isMath     = /\b(calculate|math|algorithm|proof|optimize|logic)\b/.test(t);
  const isDebug    = /\b(fix|debug|error|bug|broken|failing|exception|crash)\b/.test(t);
  const isRefactor = /\b(refactor|clean up|reorganize|restructure|simplify)\b/.test(t);
  const isQA       = /\b(explain|what is|how does|describe|summarize|tell me)\b/.test(t);
  const isCreative = /\b(game|ui|creative|visual|animation|story|design)\b/.test(t);
  const isDoc      = /\b(document|readme|comment|api doc)\b/.test(t);
  const isLong     = task.length > 8_000;
  const isHuge     = task.length > 40_000;
  const speedTask  = isQA && task.length < 400;

  const domain: DomainType = isArch ? 'architecture' : isMath ? 'math' : isDebug ? 'debug'
    : isRefactor ? 'refactor' : isCreative ? 'creative' : isDoc ? 'documentation' : isQA ? 'qa' : 'code-gen';
  const reasoning: ReasoningLevel = (isArch || isMath) ? 'high' : (isDebug || isRefactor) ? 'medium' : 'low';

  return {
    reasoning,
    domain,
    contextSize:     isHuge ? 'huge' : isLong ? 'large' : 'small',
    outputSize:      (isQA || isDoc) ? 'small' : isArch ? 'medium' : 'large',
    speedPriority:   speedTask ? 'high' : 'low',
    toolsRequired:   false,
    thinkingBenefits: reasoning === 'high',
  };
}

/**
 * Ask a cheap fast model to produce a structured TaskProfile for a given task.
 * Falls back to regexProfile() silently on failure or when no classifier key is available.
 * Only fires for mid-range task lengths (200–80K chars) — trivially short/huge tasks use regex.
 */
export async function analyzeTask(
  task: string,
  availableKeys: Record<string, boolean>,
  fetchFn: (url: string, opts: RequestInit) => Promise<Response>,
): Promise<TaskProfile> {
  if (task.length < 200 || task.length > 80_000) return regexProfile(task);
  const classifier = availableKeys['groq'] ? 'groq' : availableKeys['gemini'] ? 'gemini' : null;
  if (!classifier) return regexProfile(task);

  const prompt = `Analyze this coding task. Reply with ONLY a JSON object — no markdown, no explanation.
Task: "${task.slice(0, 400)}"
JSON (use ONLY the exact enum values shown):
{"reasoning":"low|medium|high","domain":"code-gen|architecture|math|debug|refactor|qa|creative|documentation","contextSize":"tiny|small|medium|large|huge","outputSize":"tiny|small|medium|large|huge","speedPriority":"low|medium|high","thinkingBenefits":true|false}`;

  try {
    const { callProvider } = await import('../domain/providers/providerFactory.js');
    const res = await callProvider(classifier, prompt, fetchFn);
    if (res.success && res.text) {
      const match = res.text.match(/\{[\s\S]*?\}/);
      if (match) {
        const p = JSON.parse(match[0]);
        const validReasoning = ['low', 'medium', 'high'];
        const validDomain    = ['code-gen', 'architecture', 'math', 'debug', 'refactor', 'qa', 'creative', 'documentation'];
        const validSize      = ['tiny', 'small', 'medium', 'large', 'huge'];
        const validSpeed     = ['low', 'medium', 'high'];
        return {
          reasoning:       validReasoning.includes(p.reasoning)    ? p.reasoning    : 'medium',
          domain:          validDomain.includes(p.domain)          ? p.domain       : 'code-gen',
          contextSize:     validSize.includes(p.contextSize)       ? p.contextSize  : 'small',
          outputSize:      validSize.includes(p.outputSize)        ? p.outputSize   : 'medium',
          speedPriority:   validSpeed.includes(p.speedPriority)    ? p.speedPriority : 'low',
          toolsRequired:   false,  // caller sets this based on execution context
          thinkingBenefits: !!p.thinkingBenefits,
        };
      }
    }
  } catch { /* fall through to regex */ }

  return regexProfile(task);
}
