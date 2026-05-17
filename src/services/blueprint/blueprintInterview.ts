// [SCOPE] Adaptive Blueprint Interview Engine — detects project type, runs layered questions
// Replaces the flat 5-question interview. Questions branch by project type.
// Called by blueprintService or chat panel. Returns a rich BlueprintSpec.
// Layer data constants -> blueprintInterviewLayers.ts

// [WARN] This is the engine only — it returns structured data, does NOT write files or call VS Code UI.
// The caller handles saving and display.

export type ProjectType =
  | 'game' | 'webapp' | 'mobile' | 'api' | 'cli' | 'desktop' | 'script' | 'library' | 'unknown';

export interface BlueprintLayer {
  id: string;
  name: string;
  emoji: string;
  questions: BlueprintQuestion[];
}

export interface BlueprintQuestion {
  id: string;
  text: string;
  hint: string;
  required: boolean;
  type: 'text' | 'choice' | 'multi';
  choices?: string[];
}

export interface BlueprintSpec {
  projectType: ProjectType;
  layers: Record<string, Record<string, string>>;  // layerId -> questionId -> answer
  summary?: string;
  completionScore: number;  // 0-100
}

export { FOUNDATION_LAYER, TYPE_LAYERS } from './blueprintInterviewLayers.js';
import { FOUNDATION_LAYER, TYPE_LAYERS } from './blueprintInterviewLayers.js';

export function detectProjectType(what: string, where: string): ProjectType {
  const combined = (what + ' ' + where).toLowerCase();
  if (/game|rpg|puzzle|shooter|platformer|multiplayer|unity|godot|phaser|pygame/i.test(combined)) { return 'game'; }
  if (/mobile|android|ios|react native|flutter|swift|kotlin/i.test(combined)) { return 'mobile'; }
  if (/cli|command.?line|terminal|shell|script|bash|python script|node script/i.test(combined)) { return 'cli'; }
  if (/api|rest|graphql|backend|server|microservice|endpoint/i.test(combined)) { return 'api'; }
  if (/desktop|electron|tauri|winforms|wpf|native app/i.test(combined)) { return 'desktop'; }
  if (/library|package|sdk|npm|module|framework/i.test(combined)) { return 'library'; }
  if (/website|web app|webapp|react|vue|angular|nextjs|dashboard|saas/i.test(combined)) { return 'webapp'; }
  if (/script|automation|batch|cron|scraper/i.test(combined)) { return 'script'; }
  return 'webapp';
}

export function scoreBlueprint(spec: BlueprintSpec): number {
  let total = 0, answered = 0;
  const allLayers = [FOUNDATION_LAYER, ...(TYPE_LAYERS[spec.projectType] || [])];
  allLayers.forEach(layer => {
    layer.questions.forEach(q => {
      if (q.required) {
        total++;
        const ans = spec.layers[layer.id]?.[q.id];
        if (ans && ans.trim().length > 2) { answered++; }
      }
    });
  });
  return total === 0 ? 0 : Math.round((answered / total) * 100);
}

export function buildBlueprintSummary(spec: BlueprintSpec, projectName: string): string {
  const typeName = spec.projectType.toUpperCase();
  const allLayers = [FOUNDATION_LAYER, ...(TYPE_LAYERS[spec.projectType] || [])];
  let out = `# Blueprint: ${projectName}\n**Project Type:** ${typeName}\n**Completeness:** ${spec.completionScore}%\n\n`;
  allLayers.forEach(layer => {
    const answers = spec.layers[layer.id];
    if (!answers) { return; }
    out += `## ${layer.emoji} ${layer.name}\n`;
    layer.questions.forEach(q => {
      const ans = answers[q.id];
      if (ans) { out += `- **${q.text}** ${ans}\n`; }
    });
    out += '\n';
  });
  return out;
}

export function getLayersForType(type: ProjectType): BlueprintLayer[] {
  return [FOUNDATION_LAYER, ...(TYPE_LAYERS[type] || [])];
}
