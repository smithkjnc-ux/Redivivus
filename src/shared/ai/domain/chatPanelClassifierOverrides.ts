// [SCOPE] Redivivus intent classifier — offline fallback only
// [DONE] checkHardcodedOverrides removed — cloud classifier handles all intent routing.
// This file now contains only fallbackClassify, used when the cloud classifier is unreachable.

import type { IntentResult } from './chatPanelClassifier.js';

/** No-routing fallback — keyword detection when no AI service is available. */
export function fallbackClassify(text: string): IntentResult {
  const t = text.toLowerCase().trim();
  const fixVerbs = /\b(fix|debug|repair|patch|solve|resolve|broken|doesn.t work|not working|isn.t working|no sound|no audio|crash|error|bug|wrong|off|broken)\b/i;
  const buildVerbs = /^\s*(now|please|can\s+you|could\s+you|just|go\s+ahead\s+and)?\s*(build|create|make|write|generate|implement|scaffold|code|develop|produce|split|refactor|reorganize|restructure|add|update|modify|extend|improve|change|edit|remove|delete|swap|replace|convert|correct|refine|rebuild|rewrite|redesign)\b/i;
  const implicitFix = /\b(it\s+(doesn.t|isn.t|won.t|can.t|shouldn.t|keeps|still)|the\s+\w+\s+(doesn.t|isn.t|won.t|doesn't|isn't|won't|not)\s+(work|show|display|appear|move|respond|function|load|render|play))/i;
  const implicitBuild = /\b(i\s+(want|need|would like)|it\s+(needs?|should|must)\s+(to\s+)?(have|be|include|support)|make\s+it|give\s+it|have\s+it)\b/i;
  const isPureWhQuestion = /^(what|how|why|when|where|who|which)\b/i.test(t) && !buildVerbs.test(t) && !fixVerbs.test(t) && !implicitFix.test(t);
  const isTrailingQuestion = /\?$/i.test(t) && !buildVerbs.test(t) && !fixVerbs.test(t) && !implicitFix.test(t);
  if (fixVerbs.test(t) || implicitFix.test(t)) { return { type: 'fix' }; }
  if (buildVerbs.test(t) || implicitBuild.test(t)) { return { type: 'build' }; }
  if (isPureWhQuestion || isTrailingQuestion) { return { type: 'question' }; }
  return { type: 'question' };
}
