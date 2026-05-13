// [SCOPE] Complexity Assessment Service — score build requests, route to appropriate interview tier
// Determines if a request is Nano, Standard, or Deep based on signal words and clarity

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

export function assessComplexity(task: string): ComplexityResult {
  const lowerTask = task.toLowerCase();
  const words = task.trim().split(/\s+/).length;

  // [CHASSIS] Short single-function cap — under 15 words + single-function keyword → max score 15, always nano, 1 phase
  if (words < 15 && SINGLE_FUNCTION_KEYWORDS.test(lowerTask)) {
    return {
      tier: 'nano',
      score: 15,
      reasons: ['Short single-function request (capped at nano)'],
      estimatedLines: 'under50',
      recommendedPhases: 1,
    };
  }

  let score = 50; // Start neutral
  const reasons: string[] = [];

  // Check for deep complexity signals
  for (const signal of DEEP_SIGNALS) {
    if (signal.pattern.test(lowerTask)) {
      score += signal.weight;
      reasons.push(signal.reason);
    }
  }

  // Check for nano simplicity signals
  for (const signal of NANO_SIGNALS) {
    if (signal.pattern.test(lowerTask)) {
      score += signal.weight; // weight is negative
      reasons.push(signal.reason);
    }
  }

  // Penalize vague language
  for (const penalty of VAGUE_PENALTIES) {
    if (penalty.pattern.test(task)) {
      score += penalty.penalty;
      reasons.push(penalty.reason);
    }
  }

  // Word count factor
  if (words < 5) {
    score += 20;
    reasons.push('Very short request (likely vague)');
  } else if (words > 30) {
    score -= 10;
    reasons.push('Detailed request (likely clear)');
  }

  // Special cases
  if (/\bapp\b/i.test(lowerTask) && words < 10) {
    score += 25;
    reasons.push('"App" without specification');
  }

  if (/\bgame\b/i.test(lowerTask)) {
    if (!/\b(snake|pong|tetris|wordle|flappy|simple|basic)\b/i.test(lowerTask)) {
      score += 30;
      reasons.push('Game without genre specification');
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine tier
  let tier: ComplexityTier;
  let estimatedLines: 'under50' | '50to500' | 'over500';
  let recommendedPhases: number;

  if (score < 25) {
    tier = 'nano';
    estimatedLines = 'under50';
    recommendedPhases = 1;
  } else if (score < 60) {
    tier = 'standard';
    estimatedLines = '50to500';
    recommendedPhases = 1;
  } else {
    tier = 'deep';
    estimatedLines = 'over500';
    recommendedPhases = Math.ceil(score / 15); // 4-7 phases based on complexity
  }

  return {
    tier,
    score,
    reasons: [...new Set(reasons)], // Deduplicate
    estimatedLines,
    recommendedPhases,
  };
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
