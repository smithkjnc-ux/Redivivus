// [SCOPE] Blueprint health calculator — calculateHealth function for blueprint confidence scoring
// Called by blueprintService. No interview or writing logic here.

import type { Blueprint, BlueprintHealth } from '../../../types/index.js';

export function calculateHealth(answers: Pick<Blueprint, 'who' | 'what' | 'where' | 'when' | 'why'>): BlueprintHealth {
  let confirmed = 0;
  let assumed = 0;
  let unknown = 0;

  for (const key of ['who', 'what', 'where', 'when', 'why'] as const) {
    const val = answers[key].trim();
    // [WARN] Health calculation uses magic numbers (20, 0) for determining "confirmed", "assumed", and "unknown" answers.
    // These thresholds are somewhat arbitrary and could lead to subjective health ratings.
    if (val.length > 20) {
      confirmed++;
    } else if (val.length > 0) {
      assumed++;  // short answer = probably not fully thought through
    } else {
      unknown++;
    }
  }

  let confidence: 'high' | 'medium' | 'low';
  if (unknown === 0 && assumed <= 1) { confidence = 'high'; }
  else if (unknown <= 1) { confidence = 'medium'; }
  else { confidence = 'low'; }

  return { confirmed, assumed, unknown, confidence };
}
