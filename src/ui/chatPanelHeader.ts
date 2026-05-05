// [SCOPE] CHASSIS Chat Panel header builder — computes ChatHeaderInfo from chassis/routing state

import * as vscode from 'vscode';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { ChatHeaderInfo } from './chatPanelHtml.js';

export function buildHeaderInfo(chassis: ChassisService, routing: RoutingService, usageTracker?: UsageTracker): ChatHeaderInfo {
  const available = routing.getAvailableAI();
  const config = chassis.isInitialized() ? chassis.loadConfig() : null;
  const hasBlueprint = !!config?.blueprint?.who;
  const blueprintLocked = config?.blueprint?.locked || false;
  const isInitialized = chassis.isInitialized();
  const projectName = config?.projectName || (vscode.workspace.workspaceFolders?.[0] ? path.basename(vscode.workspace.workspaceFolders[0].uri.fsPath) : 'No Project');

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const selectedAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };

  const hasKey = available.ai !== 'none';
  const aiName = hasKey ? available.ai : selectedAI;
  const aiLabel = hasKey ? available.label : aiLabels[selectedAI] + ' (no key)';

  return {
    projectName, aiName, aiLabel,
    isFallback: hasKey && available.ai !== selectedAI,
    hasKey, blueprintLocked, hasBlueprint,
    sessionActive: false, currentTime: timeStr, isInitialized,
    usageReport: usageTracker?.getReport(),
  };
}
