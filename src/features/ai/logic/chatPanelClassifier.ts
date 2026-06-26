// [SCOPE] Chat Panel Intent Classifier — delegates to cloud API; system prompt lives server-side
// Extracted from chatPanelIntent.ts

import type { RoutingService } from '../data/routingService.js';
import { tracer } from '../../../features/project/logic/pipelineTracer.js';
import { fallbackClassify } from './chatPanelClassifierOverrides.js';
import { cloudClassify } from '../../../features/api/data/apiClient.js';

export type IntentType = 'build' | 'convert' | 'command' | 'question' | 'offtopic' | 'run' | 'fix' | 'scaffold' | 'service';
export type AvailableCommand =
  | 'redivivus.openProject'
  | 'redivivus.wizardRetrofit'
  | 'redivivus.openBlueprint'
  | 'redivivus.showMap'
  | 'redivivus.savePoint'
  | 'redivivus.showBuildHistory'
  | 'redivivus.profileRuntime'
  | 'redivivus.viewUsageInChat'
  | 'workbench.action.closeFolder'
  | 'redivivus.analyze'
  | 'redivivus.openVault'
  | 'redivivus.deadends'
  | 'redivivus.switchAI'
  | 'redivivus.startSession'
  | 'redivivus.endSession'
  | 'redivivus.generateRules'
  | 'redivivus.scanVaultCodebase'
  | 'redivivus.openSettings';

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
  void routing; void onUsage; // kept for call-site compat; classification is now server-side
  let _sid = '';
  let _t0 = 0;
  try {
    _t0 = Date.now();
    _sid = tracer.step('INTENT', 'cloud classifier', text.slice(0, 60));
    const result = await cloudClassify(text, context);
    tracer.done(_sid, 'success', Date.now() - _t0, `classified as "${result.type}"`);
    return { type: result.type as IntentType, command: result.command as AvailableCommand | undefined };
  } catch (error) {
    if (_sid) { tracer.done(_sid, 'fail', Date.now() - _t0, String(error).slice(0, 60)); }
    return fallbackClassify(text);
  }
}

/** Returns true if the message is a direct build/create request. */
export async function isBuildRequest(text: string, routing?: RoutingService): Promise<boolean> {
  const result = await classifyIntent(text, routing);
  return result.type === 'build';
}
