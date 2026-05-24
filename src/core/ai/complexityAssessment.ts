// [SCOPE] Complexity Assessment Service — score build requests, route to appropriate interview tier
// [RULE 18] AI classifier has final say on tier. Regex scoring computes reasons/score (math, not NL).
import type { RoutingService } from '../../services/ai/routingService';

export type ComplexityTier = 'nano' | 'standard' | 'deep';

export interface ComplexityResult {
  tier: ComplexityTier;
  score: number; // 0-100
  reasons: string[];
  estimatedLines: 'under50' | '50to500' | 'over500';
  recommendedPhases: number;
}

// Signal patterns that indicate complexity
const DEEP_SIGNALS = [
  { pattern: /\b(game|platform|marketplace|social network|saas|erp|crm)\b/i, weight: 30, reason: 'Large application type' },
  { pattern: /\b(engine|framework|compiler|interpreter|runtime)\b/i, weight: 40, reason: 'Infrastructure/tooling' },
  { pattern: /\b(multiplayer|real.?time|collaborative|sync|websocket|webrtc)\b/i, weight: 25, reason: 'Real-time features' },
  { pattern: /\b(ai|machine learning|ml|neural|llm|gpt|model|training)\b/i, weight: 35, reason: 'AI/ML components' },
  { pattern: /\b(crypto|blockchain|nft|smart contract|web3|defi)\b/i, weight: 35, reason: 'Blockchain complexity' },
  { pattern: /\b(payment|billing|subscription|stripe|paypal|checkout)\b/i, weight: 20, reason: 'Financial integration' },
  { pattern: /\b(auth|authentication|oauth|sso|jwt|permissions|roles)\b/i, weight: 15, reason: 'Auth system' },
  { pattern: /\b(database|db|sql|nosql|postgres|mongo|redis|cache)\b/i, weight: 15, reason: 'Data layer' },
  { pattern: /\b(api|rest|graphql|grpc|microservice)\b/i, weight: 20, reason: 'API architecture' },
  { pattern: /\b(scale|scaling|performance|optimization|cache|cdn)\b/i, weight: 20, reason: 'Performance engineering' },
];

const NANO_SIGNALS = [
  { pattern: /\b(simple|basic|single|one|just|only|minimal)\b/i, weight: -15, reason: 'Simplicity indicator' },
  { pattern: /\b(page|button|form|input|display|show)\b/i, weight: -10, reason: 'UI element' },
  { pattern: /\b(function|utility|helper|tool|snippet)\b/i, weight: -10, reason: 'Code utility' },
  { pattern: /\b(color|sound|animation|style|css)\b/i, weight: -5, reason: 'Presentation only' },
];

const VAGUE_PENALTIES = [
  { pattern: /\b(something|anything|stuff|thing|whatever)\b/i, penalty: 20, reason: 'Vague language' },
  { pattern: /^\s*(build|make|create)\s+(me\s+)?a\s+\w+\s*$/i, penalty: 30, reason: 'Extremely short request' },
];

/** Single-function/snippet keywords — requests under 15 words containing these are capped at nano */
const SINGLE_FUNCTION_KEYWORDS = /\b(function|snippet|utility|helper|hook|method|script|converter|formatter|validator|parser|calculator)\b/i;

export async function assessComplexity(task: string, routing: RoutingService): Promise<ComplexityResult> {
  const lowerTask = task.toLowerCase();
  const words = task.trim().split(/\s+/).length;

  // Fast path: short explicit single-function request — no AI call needed
  if (words < 15 && SINGLE_FUNCTION_KEYWORDS.test(lowerTask)) {
    return { tier: 'nano', score: 15, reasons: ['Short single-function request'], estimatedLines: 'under50', recommendedPhases: 1 };
  }

  // Regex scoring for score + reasons (calculation, not NL understanding)
  let score = 50;
  const reasons: string[] = [];
  for (const s of DEEP_SIGNALS) { if (s.pattern.test(lowerTask)) { score += s.weight; reasons.push(s.reason); } }
  for (const s of NANO_SIGNALS)  { if (s.pattern.test(lowerTask)) { score += s.weight; reasons.push(s.reason); } }
  for (const p of VAGUE_PENALTIES) { if (p.pattern.test(task)) { score += p.penalty; reasons.push(p.reason); } }
  if (words < 5)  { score += 20; reasons.push('Very short request'); }
  if (words > 30) { score -= 10; reasons.push('Detailed request'); }
  if (/\bapp\b/i.test(lowerTask) && words < 10) { score += 25; reasons.push('"App" without specification'); }
  if (/\bgame\b/i.test(lowerTask) && !/\b(snake|pong|tetris|wordle|flappy|simple|basic)\b/i.test(lowerTask)) {
    score += 30; reasons.push('Game without genre specification');
  }
  score = Math.max(0, Math.min(100, score));

  // [RULE 18] AI classifier has final say on tier — regex score is used for display + phase math only
  let tier: ComplexityTier = score < 25 ? 'nano' : score < 60 ? 'standard' : 'deep';
  try {
    const prompt = `Rate the complexity of this software build request.\nTask: "${task.slice(0, 200)}"\nReply with one word only: nano, standard, or deep\nnano=simple script or single page, standard=single app or feature, deep=complex multi-component system`;
    const res = await routing.prompt(prompt, 12_000);
    if (res.success && res.text) {
      const aiTier = res.text.trim().toLowerCase().replace(/[^a-z]/g, '');
      if (aiTier === 'nano' || aiTier === 'standard' || aiTier === 'deep') {
        tier = aiTier;
        if (tier === 'nano' && score >= 25)  { score = 20; }
        if (tier === 'standard' && (score < 25 || score >= 60)) { score = 45; }
        if (tier === 'deep' && score < 60)   { score = 70; }
      }
    }
  } catch { /* regex-derived tier used as fallback */ }

  const estimatedLines = tier === 'nano' ? 'under50' : tier === 'standard' ? '50to500' : 'over500';
  const recommendedPhases = tier === 'deep' ? Math.ceil(score / 15) : 1;
  return { tier, score, reasons: [...new Set(reasons)], estimatedLines, recommendedPhases };
}

export function getTierDescription(tier: ComplexityTier): string {
  switch (tier) {
    case 'nano':
      return 'Simple component or page (under 50 lines)';
    case 'standard':
      return 'Feature or module (50-500 lines)';
    case 'deep':
      return 'Complex application requiring phased build (500+ lines)';
  }
}

export function shouldRequireDeepInterview(result: ComplexityResult): boolean {
  return result.tier === 'deep' || (result.tier === 'standard' && result.score > 50);
}
