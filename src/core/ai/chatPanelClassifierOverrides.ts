// [SCOPE] Redivivus intent classifier — hardcoded fast-path overrides before AI call
// Patterns where the user's structural phrasing unambiguously maps to a specific intent.
// Rule 18: these are structural/keyword matches (vault, map, session), NOT natural language understanding.

import type { IntentResult } from './chatPanelClassifier';

export function checkHardcodedOverrides(t: string): IntentResult | null {
  // Redivivus navigation commands
  if (/\b(close|exit|leave|quit)\b.*(current\s+)?(project|folder|workspace)/i.test(t) ||
      /\b(close|exit)\s+(this|the)\s+(project|folder)/i.test(t)) {
    return { type: 'command', command: 'workbench.action.closeFolder' };
  }
  if (/\b(open|show|view|see|browse|launch)\b.*(the\s+)?vault\b/i.test(t) ||
      /\bvault\b.*(open|show|view|browse)/i.test(t)) {
    return { type: 'command', command: 'redivivus.openVault' };
  }
  if (/\b(scan|search)\b.*\b(codebase|project|workspace|folder|files?)\b.*\bvault\b/i.test(t) ||
      /\b(scan|search)\b.*\breusable\b.*\bvault\b/i.test(t)) {
    return { type: 'command', command: 'redivivus.scanVaultCodebase' };
  }
  if (/\b(open|show|view)\b.*(the\s+)?blueprint\b/i.test(t)) {
    return { type: 'command', command: 'redivivus.openBlueprint' };
  }
  if (/\b(open|show|view)\b.*(the\s+)?(architecture\s+)?map\b/i.test(t) ||
      /\barchitecture\s+map\b/i.test(t)) {
    return { type: 'command', command: 'redivivus.showMap' };
  }
  if (/\b(start|begin|new)\s+session\b/i.test(t)) {
    return { type: 'command', command: 'redivivus.startSession' };
  }
  if (/\b(end|stop|finish|done\s+for\s+now)\s+(the\s+)?session\b/i.test(t) ||
      /\bdone\s+for\s+(now|today)\b/i.test(t)) {
    return { type: 'command', command: 'redivivus.endSession' };
  }
  if (/\b(save\s+point|savepoint|checkpoint|save\s+my\s+work)\b/i.test(t)) {
    return { type: 'command', command: 'redivivus.savePoint' };
  }
  if (/\b(switch|open|go\s+to|load)\s+(to\s+)?(a\s+)?(different|another|new\s+)?project\b/i.test(t) ||
      /\bopen\s+project\b/i.test(t)) {
    return { type: 'command', command: 'redivivus.openProject' };
  }

  // "yes, apply the fix" / "yes fix it" / "go ahead" after a fix diagnosis → question (re-confirm context)
  // [RULE 18] Structural: explicit yes/confirm + fix/apply keyword in short message.
  if (/^(yes|yeah|yep|ok|okay|sure|go ahead|do it|apply|confirm)[\s,.]*(apply|it|the fix|fix it|please)?[.!]*$/i.test(t)) {
    return { type: 'question' };
  }

  // Install dependencies — "install deps", "npm install", "pip install", "install packages"
  // [RULE 18] Structural fast path: explicit package manager verb or "install" + dependency noun.
  if (/\b(npm|yarn|pnpm)\s+install\b/i.test(t) ||
      /\bpip\s+install\b/i.test(t) ||
      /\binstall\s+(the\s+)?(packages?|dependencies|deps|modules|requirements?)\b/i.test(t) ||
      /\binstall\s+dep(endencies)?\b/i.test(t)) {
    return { type: 'run', subtype: 'install' };
  }

  // Run / preview — "run the app", "launch the sound player", "open in browser", "let me see it"
  // [RULE 18] Structural fast path: explicit run/launch/preview verb + subject or explicit browser mention.
  // [DEAD] 'test' and 'start' removed — both are ambiguous:
  //   'test' matches 'test project' in CREATE requests (e.g. "create a new test project")
  //   'start' matches 'start a new project' (scaffold) and 'start a session' (command)
  //   AI classifier handles these correctly — Rule 18 says let AI handle language understanding.
  if (/\b(run|launch|preview|execute)\s+(the\s+|my\s+|it\s+)?(app|program|project|player|game|site|page|script|server|it)\b/i.test(t) ||
      /\bopen\s+(it\s+)?in\s+(a\s+|the\s+)?browser\b/i.test(t) ||
      /\blet\s+me\s+(see|test|try)\s+it\b/i.test(t)) {
    return { type: 'run' };
  }

  // [FIX] Question fast-paths — these are unambiguous interrogative grammar, not intent guessing.
  // A sentence starting with "are you able to" or "can you" is ALWAYS a question regardless of
  // what follows. The cloud classifier was returning 'build' for "are you able to make a checker
  // game?" because it focused on "make a checker game" — ignoring the question framing entirely.
  // These must fire BEFORE the cloud call so questions get answered, not built.
  if (/^(are\s+you|can\s+you|could\s+you|would\s+you|will\s+you|should\s+(i|we|you)|do\s+you|is\s+it|are\s+there|have\s+you|does\s+(it|this|that)|did\s+you)\b/i.test(t)) {
    return { type: 'question' };
  }
  if (/^(what|how|why|when|where|who|which|explain|tell\s+me)\b/i.test(t) && !/^(how\s+about\s+(you|we)\s+(make|build|create|add))\b/i.test(t)) {
    return { type: 'question' };
  }
  if (/\?\s*$/.test(t) && !/^\s*(make|build|create|add|fix|change|update|remove|delete|write|generate)\b/i.test(t)) {
    return { type: 'question' };
  }

  return null;
}

/** No-routing fallback — keyword detection when no AI service is available. */
export function fallbackClassify(text: string): IntentResult {
  const t = text.toLowerCase().trim();
  // Fix verbs: user is describing a problem with existing code
  const fixVerbs = /\b(fix|debug|repair|patch|solve|resolve|broken|doesn.t work|not working|isn.t working|no sound|no audio|crash|error|bug|wrong|off|broken)\b/i;
  const buildVerbs = /^\s*(now|please|can\s+you|could\s+you|just|go\s+ahead\s+and)?\s*(build|create|make|write|generate|implement|scaffold|code|develop|produce|split|refactor|reorganize|restructure|add|update|modify|extend|improve|change|edit|remove|delete|swap|replace|convert|correct|refine|rebuild|rewrite|redesign)\b/i;
  // [FIX] Detect implicit modification requests that don't start with a verb:
  // "the AI opponent isn't working", "it keeps doing X", "the game doesn't have Y"
  const implicitFix = /\b(it\s+(doesn.t|isn.t|won.t|can.t|shouldn.t|keeps|still)|the\s+\w+\s+(doesn.t|isn.t|won.t|doesn't|isn't|won't|not)\s+(work|show|display|appear|move|respond|function|load|render|play))/i;
  const implicitBuild = /\b(i\s+(want|need|would like)|it\s+(needs?|should|must)\s+(to\s+)?(have|be|include|support)|make\s+it|give\s+it|have\s+it)\b/i;
  const isPureWhQuestion = /^(what|how|why|when|where|who|which)\b/i.test(t) && !buildVerbs.test(t) && !fixVerbs.test(t) && !implicitFix.test(t);
  const isTrailingQuestion = /\?$/i.test(t) && !buildVerbs.test(t) && !fixVerbs.test(t) && !implicitFix.test(t);
  if (fixVerbs.test(t) || implicitFix.test(t)) { return { type: 'fix' }; }
  if (buildVerbs.test(t) || implicitBuild.test(t)) { return { type: 'build' }; }
  if (isPureWhQuestion || isTrailingQuestion) { return { type: 'question' }; }
  return { type: 'question' };
}
