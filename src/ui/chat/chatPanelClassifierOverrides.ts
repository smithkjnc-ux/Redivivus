// [SCOPE] CHASSIS intent classifier — hardcoded fast-path overrides before AI call
// Patterns where the user's structural phrasing unambiguously maps to a specific intent.
// Rule 18: these are structural/keyword matches (vault, map, session), NOT natural language understanding.

import type { IntentResult } from './chatPanelClassifier.js';

export function checkHardcodedOverrides(t: string): IntentResult | null {
  // CHASSIS navigation commands
  if (/\b(close|exit|leave|quit)\b.*(current\s+)?(project|folder|workspace)/i.test(t) ||
      /\b(close|exit)\s+(this|the)\s+(project|folder)/i.test(t)) {
    return { type: 'command', command: 'workbench.action.closeFolder' };
  }
  if (/\b(open|show|view|see|browse|launch)\b.*(the\s+)?vault\b/i.test(t) ||
      /\bvault\b.*(open|show|view|browse)/i.test(t)) {
    return { type: 'command', command: 'chassis.openVault' };
  }
  if (/\b(open|show|view)\b.*(the\s+)?blueprint\b/i.test(t)) {
    return { type: 'command', command: 'chassis.openBlueprint' };
  }
  if (/\b(open|show|view)\b.*(the\s+)?(architecture\s+)?map\b/i.test(t) ||
      /\barchitecture\s+map\b/i.test(t)) {
    return { type: 'command', command: 'chassis.showMap' };
  }
  if (/\b(start|begin|new)\s+session\b/i.test(t)) {
    return { type: 'command', command: 'chassis.startSession' };
  }
  if (/\b(end|stop|finish|done\s+for\s+now)\s+(the\s+)?session\b/i.test(t) ||
      /\bdone\s+for\s+(now|today)\b/i.test(t)) {
    return { type: 'command', command: 'chassis.endSession' };
  }
  if (/\b(save\s+point|savepoint|checkpoint|save\s+my\s+work)\b/i.test(t)) {
    return { type: 'command', command: 'chassis.savePoint' };
  }
  if (/\b(switch|open|go\s+to|load)\s+(to\s+)?(a\s+)?(different|another|new\s+)?project\b/i.test(t) ||
      /\bopen\s+project\b/i.test(t)) {
    return { type: 'command', command: 'chassis.openProject' };
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
  // [RULE 18] Structural fast path: explicit run/launch/preview/test verb + subject or explicit browser mention.
  if (/\b(run|launch|preview|start|execute|test)\s+(the\s+|my\s+|it\s+)?(app|program|project|player|game|site|page|script|server|it)\b/i.test(t) ||
      /\bopen\s+(it\s+)?in\s+(a\s+|the\s+)?browser\b/i.test(t) ||
      /\blet\s+me\s+(see|test|try)\s+it\b/i.test(t)) {
    return { type: 'run' };
  }

  return null;
}

/** No-routing fallback — keyword detection when no AI service is available. */
export function fallbackClassify(text: string): IntentResult {
  const t = text.toLowerCase().trim();
  // Fix verbs: user is describing a problem with existing code
  const fixVerbs = /\b(fix|debug|repair|patch|solve|resolve|broken|doesn.t work|not working|isn.t working|no sound|no audio|crash|error|bug|wrong|off|broken)\b/i;
  const buildVerbs = /\b(build|create|make|write|generate|implement|scaffold|code|develop|produce|split|refactor|reorganize|restructure|add|update|modify|extend|improve|change|edit|remove|delete|swap|replace|convert|correct|refine|rebuild|rewrite|redesign)\b/i;
  const isPureWhQuestion = /^(what|how|why|when|where|who|which)\b/i.test(t) && !buildVerbs.test(t) && !fixVerbs.test(t);
  const isTrailingQuestion = /\?$/i.test(t) && !buildVerbs.test(t) && !fixVerbs.test(t);
  if (fixVerbs.test(t)) { return { type: 'fix' }; }
  if (buildVerbs.test(t)) { return { type: 'build' }; }
  if (isPureWhQuestion || isTrailingQuestion) { return { type: 'question' }; }
  return { type: 'question' };
}
