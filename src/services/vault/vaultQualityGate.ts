// [SCOPE] Vault Quality Gate — AI-assisted evaluation of code snippets before vault storage
// Asks the AI: Is this reusable? What does it do? Quality score 1-5?
// Only items scoring 3+ get saved. Prevents junk accumulation.

import type { AIResponse } from '../ai/routingTypes.js';

export interface QualityVerdict {
  reusable: boolean;
  description: string;   // 1-sentence description of what the code does
  useCase: string;       // 1-sentence "when you'd use this"
  qualityScore: number;  // 1-5
  reason: string;        // Why this verdict
  tags: string[];        // 3-6 searchable keywords for retrieval
}

/** Default verdict when AI is unavailable — uses heuristic fallback */
function heuristicVerdict(name: string, code: string): QualityVerdict {
  const lines = code.split('\n').filter(l => l.trim()).length;
  const hasLogic = /\b(if|else|for|while|switch|try|catch|async|await|map|filter|reduce)\b/.test(code);
  const hasParams = /\(.*\w+.*\)/.test(code.split('\n')[0] || '');
  const score = Math.min(5, 1 + (hasLogic ? 1 : 0) + (hasParams ? 1 : 0) + (lines > 10 ? 1 : 0) + (lines > 20 ? 1 : 0));
  // Derive basic tags from the function name (camelCase split)
  const nameTags = name.replace(/([A-Z])/g,' $1').toLowerCase().trim().split(/\s+/).filter(w => w.length >= 3);
  return {
    reusable: score >= 3,
    description: `Function "${name}" (${lines} lines)`,
    useCase: hasLogic ? 'When you need similar logic' : 'Basic utility',
    qualityScore: score,
    reason: 'Heuristic evaluation (AI unavailable)',
    tags: nameTags.slice(0, 5),
  };
}

// [WARN] The AI prompt must return strict JSON. Any deviation and parsing fails.
function buildQualityPrompt(name: string, code: string, language: string): string {
  return `You are evaluating a code snippet for a reusable code vault. Be strict — only genuinely reusable code should score 3+.

SNIPPET NAME: "${name}"
LANGUAGE: ${language}
CODE:
\`\`\`
${code.slice(0, 1500)}
\`\`\`

Evaluate and respond with ONLY valid JSON (no markdown, no explanation):
{
  "reusable": true/false,
  "description": "one sentence: what this code does",
  "useCase": "one sentence: when you would use this",
  "qualityScore": 1-5,
  "reason": "one sentence: why this score",
  "tags": ["keyword1", "keyword2", "keyword3"]
}

TAGS: 3-6 lowercase keywords that describe what this code does and what domain it belongs to.
Example: ["audio", "playback", "sound", "html5"] or ["validation", "email", "form", "regex"]

SCORING GUIDE:
1 = Trivial (getters, setters, single returns) — NOT worth saving
2 = Simple but project-specific (resetGame, clearForm) — NOT worth saving
3 = Useful pattern that could be reused (validation, formatting, API helpers)
4 = Solid reusable utility (data transforms, state machines, parsers)
5 = Excellent reusable module (complete subsystems, well-tested patterns)`;
}

/** Run AI quality evaluation on a code snippet */
export async function evaluateQuality(
  name: string,
  code: string,
  language: string,
  callAI?: (prompt: string) => Promise<AIResponse>
): Promise<QualityVerdict> {
  // No AI available — use heuristic
  if (!callAI) { return heuristicVerdict(name, code); }

  try {
    const prompt = buildQualityPrompt(name, code, language);
    const res = await callAI(prompt);
    if (!res.success || !res.text) { return heuristicVerdict(name, code); }

    let clean = res.text.trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) { clean = match[0]; }
    const parsed = JSON.parse(clean);

    const aiTags = Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t).toLowerCase().trim()).filter((t: string) => t.length >= 3).slice(0, 6) : [];
    return {
      reusable: Boolean(parsed.reusable),
      description: String(parsed.description || '').slice(0, 200),
      useCase: String(parsed.useCase || '').slice(0, 200),
      qualityScore: Math.max(1, Math.min(5, Number(parsed.qualityScore) || 1)),
      reason: String(parsed.reason || '').slice(0, 200),
      tags: aiTags,
    };
  } catch {
    // AI parse failed — fall back to heuristic
    return heuristicVerdict(name, code);
  }
}
