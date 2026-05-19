// [SCOPE] Chat Panel Intent Classifier — AI-driven intent classification
// Extracted from chatPanelIntent.ts

import { RoutingService } from '../../services/ai/routingService.js';
import { tracer } from '../../services/pipelineTracer.js';
import { checkHardcodedOverrides, fallbackClassify } from './chatPanelClassifierOverrides.js';

export type IntentType = 'build' | 'convert' | 'command' | 'question' | 'offtopic' | 'run' | 'fix' | 'scaffold' | 'service';
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
  subtype?: string;
}

export async function classifyIntent(
  text: string,
  routing?: RoutingService,
  context?: { projectName?: string; workspacePath?: string; blueprintStatus?: string },
  onUsage?: (inputTokens: number, outputTokens: number, model: string) => void
): Promise<IntentResult> {
  const t = text.toLowerCase().trim();
  const override = checkHardcodedOverrides(t);
  if (override) { return override; }
  if (!routing) { return fallbackClassify(text); }

  const systemPrompt = `You are the CHASSIS intent classifier. Given a user message and project context, classify it as ONE of these intents and return ONLY valid JSON, nothing else.

Intents:
- build: user wants to CREATE something NEW from scratch (new file, new app, new feature, new script, add a new capability)
- fix: user is reporting a BUG, PROBLEM, or MALFUNCTION in EXISTING code — something that used to or should work is broken, wrong, or missing behavior
- convert: user wants to TRANSFORM or PORT existing code (convert, rewrite, refactor, port, turn X into Y, change language/format)
- run: user wants to RUN, PREVIEW, LAUNCH, TEST, or SEE the existing project/app/file in action
- scaffold: user wants to SET UP a NEW PROJECT from a template (new React app, new Flask API, new Go service, new Express server, set up a project)
- service: user wants to SET UP or INTEGRATE an EXTERNAL SERVICE (Firebase, Supabase, Stripe, OpenAI API, add auth, add database, add payments)
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
"add a settings page" → {"intent": "build"}
"can you fix the audio" → {"intent": "fix"}
"fix this bug" → {"intent": "fix"}
"the button doesn't work" → {"intent": "fix"}
"it runs but doesn't produce any sounds" → {"intent": "fix"}
"nothing happens when I click" → {"intent": "fix"}
"the colors are wrong" → {"intent": "fix"}
"it's broken" → {"intent": "fix"}
"something is off with the layout" → {"intent": "fix"}
"run the animal sound player" → {"intent": "run"}
"let me see if it works" → {"intent": "run"}
"open it in the browser" → {"intent": "run"}
"launch the app" → {"intent": "run"}
"update the styles" → {"intent": "build"}
"repair the broken link" → {"intent": "build"}
"option A" → {"intent": "build"}
"go with option B" → {"intent": "build"}
"let's do the first approach" → {"intent": "build"}
"convert this to TypeScript" → {"intent": "convert"}
"rewrite this in Python" → {"intent": "convert"}
"turn this HTML into a React component" → {"intent": "convert"}
"port this to Go" → {"intent": "convert"}
"refactor this into components" → {"intent": "convert"}
"transform this JSON into CSV" → {"intent": "convert"}
"scaffold a new React app" → {"intent": "scaffold"}
"set up a Flask API" → {"intent": "scaffold"}
"create a new Go service" → {"intent": "scaffold"}
"init a Node Express project" → {"intent": "scaffold"}
"start a new React project" → {"intent": "scaffold"}
"set up Firebase auth" → {"intent": "service"}
"add Stripe payments" → {"intent": "service"}
"integrate Supabase database" → {"intent": "service"}
"configure OpenAI API" → {"intent": "service"}
"add Firebase to my project" → {"intent": "service"}

Return ONLY JSON:
{ "intent": "command", "command": "chassis.openProject" }
{ "intent": "build" }
{ "intent": "fix" }
{ "intent": "convert" }
{ "intent": "run" }
{ "intent": "scaffold" }
{ "intent": "service" }
{ "intent": "question" }
{ "intent": "offtopic" }

OFFTOPIC definition: No connection to software development, coding, architecture, databases, APIs, or technical topics. NOT offtopic: coding education, dev concepts, project advice, architecture questions. IS offtopic: weather, sports, recipes, jokes, travel, personal advice, general knowledge.`;

  let _sid = '';
  let _t0 = 0;
  try {
    _t0 = Date.now();
    _sid = tracer.step('INTENT', 'AI classifier', text.slice(0, 60));
    // Use Supervisor AI (Gemini) for classification with max_tokens: 50
    const result = await (routing as any).prompt(systemPrompt);
    if (result && onUsage) { onUsage(result.inputTokens ?? 0, result.outputTokens ?? 0, result.model ?? ''); }

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
    
    if (intent === 'build' || intent === 'convert' || intent === 'run' || intent === 'fix' || intent === 'scaffold' || intent === 'service') {
      tracer.done(_sid, 'success', Date.now() - _t0, `classified as "${intent}"`, Math.ceil(systemPrompt.length / 4), Math.ceil(result.text.length / 4));
      return { type: intent };
    }

    tracer.done(_sid, 'success', Date.now() - _t0, `classified as "${intent}"`, Math.ceil(systemPrompt.length / 4), Math.ceil(result.text.length / 4));
    return { type: 'question' };

  } catch (error) {
    if (_sid) tracer.done(_sid, 'fail', Date.now() - _t0, String(error).slice(0, 60));
    // Fallback: if classification fails, treat as question and continue to normal chat
    return { type: 'question' };
  }
}

/** Returns true if the message is a direct build/create request. */
export async function isBuildRequest(text: string, routing?: RoutingService): Promise<boolean> {
  const result = await classifyIntent(text, routing);
  return result.type === 'build';
}

