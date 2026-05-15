// [SCOPE] Chat Panel Intent Classifier — AI-driven intent classification
// Extracted from chatPanelIntent.ts

import { RoutingService } from '../../services/ai/routingService.js';

export type IntentType = 'build' | 'command' | 'question' | 'offtopic';
export type AvailableCommand =
  | 'chassis.openProject'
  | 'chassis.wizardRetrofit'
  | 'chassis.openBlueprint'
  | 'chassis.showMap'
  | 'chassis.savePoint'
  | 'chassis.showBuildHistory'
  | 'chassis.profileRuntime'
  | 'chassis.viewUsageInChat'
  | 'workbench.action.closeFolder'
  | 'chassis.analyze'
  | 'chassis.openVault'
  | 'chassis.deadends'
  | 'chassis.switchAI'
  | 'chassis.startSession'
  | 'chassis.endSession'
  | 'chassis.generateRules'
  | 'chassis.openSettings';

export interface IntentResult {
  type: IntentType;
  command?: AvailableCommand;
}

export async function classifyIntent(
  text: string, 
  routing?: RoutingService,
  context?: { projectName?: string; workspacePath?: string; blueprintStatus?: string }
): Promise<IntentResult> {
  // Hardcoded overrides — patterns too ambiguous for AI classifier
  const t = text.toLowerCase().trim();
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

  // If no routing service available, fall back to simple keyword detection
  if (!routing) {
    const t = text.toLowerCase().trim();
    const buildVerbs = /\b(build|create|make|write|generate|implement|scaffold|code|develop|produce|split|refactor|reorganize|restructure|add|fix|update|modify|extend|improve|change|edit|remove|delete|swap|replace)\b/i;
    const isQuestion = /\?$|^(what|how|why|when|where|who|can you|could you|do you|does|is there|tell me|explain|show me what)/i.test(t);
    
    if (buildVerbs.test(t) && !isQuestion) { return { type: 'build' }; }
    return { type: 'question' };
  }

  const systemPrompt = `You are the CHASSIS intent classifier. Given a user message and project context, classify it as ONE of these intents and return ONLY valid JSON, nothing else.

Intents:
- build: user wants to create/write/make/add something
- question: user asking about their project, code, or any software development topic
- command: user wants to trigger a CHASSIS action
- offtopic: no connection to software development, coding, architecture, databases, APIs, or technical topics

For command intent, return the specific command:
- chassis.openProject (open or switch to a different project)
- workbench.action.closeFolder (close/exit/leave the current project or folder)
- chassis.wizardRetrofit (new project)
- chassis.openBlueprint (view/edit blueprint)
- chassis.showMap (architecture map, show map, open map, view map, show architecture, open architecture, map view, dependency map, project structure map)
- chassis.savePoint (save checkpoint)
- chassis.showBuildHistory (build history)
- chassis.profileRuntime (profile project)
- chassis.viewUsageInChat (usage/tokens spent)

Project context:
- Project: ${context?.projectName || 'Unknown'}
- Path: ${context?.workspacePath || 'None'}
- Blueprint: ${context?.blueprintStatus || 'Unknown'}

User message: ${text}

Examples (follow these exactly):
"I want to switch over to the rigops project" → {"intent": "command", "command": "chassis.openProject"}
"can you pull up the map for me" → {"intent": "command", "command": "chassis.showMap"}
"close doaidream and open chassis" → {"intent": "command", "command": "chassis.openProject"}
"show me how the project is structured" → {"intent": "command", "command": "chassis.showMap"}
"what's the weather today" → {"intent": "offtopic"}
"tell me a joke" → {"intent": "offtopic"}
"how does async/await work" → {"intent": "question"}
"what does this file do" → {"intent": "question"}
"what is 2 + 2" → {"intent": "question"}
"how do I center a div in CSS" → {"intent": "question"}
"explain what a REST API is" → {"intent": "question"}
"build me a login page" → {"intent": "build"}
"add a dark mode toggle" → {"intent": "build"}

Return ONLY JSON:
{ "intent": "command", "command": "chassis.openProject" }
{ "intent": "build" }
{ "intent": "question" }
{ "intent": "offtopic" }

OFFTOPIC definition: No connection to software development, coding, architecture, databases, APIs, or technical topics. NOT offtopic: coding education, dev concepts, project advice, architecture questions. IS offtopic: weather, sports, recipes, jokes, travel, personal advice, general knowledge.`;

  try {
    // Use Supervisor AI (Gemini) for classification with max_tokens: 50
    const result = await (routing as any).prompt(systemPrompt);
    
    if (!result || !result.text) {
      throw new Error('No response from AI classifier');
    }

    // Parse JSON response
    const jsonMatch = result.text.match(/\{[^}]+\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : result.text;
    const parsed = JSON.parse(jsonStr);

    // Validate and normalize response
    const intent = parsed.intent as IntentType;
    
    if (intent === 'offtopic') {
      return { type: 'offtopic' };
    }
    
    if (intent === 'command' && parsed.command) {
      return { type: 'command', command: parsed.command as AvailableCommand };
    }
    
    if (intent === 'build') {
      return { type: 'build' };
    }
    
    return { type: 'question' };
    
  } catch (error) {
    // Fallback: if classification fails, treat as question and continue to normal chat
    console.log('[CHASSIS INTENT] AI classification failed, falling back to question:', error);
    return { type: 'question' };
  }
}

/** Returns true if the message is a direct build/create request. */
export async function isBuildRequest(text: string, routing?: RoutingService): Promise<boolean> {
  const result = await classifyIntent(text, routing);
  return result.type === 'build';
}

