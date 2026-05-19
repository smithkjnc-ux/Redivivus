// [SCOPE] CHASSIS Chat Panel header builder — computes ChatHeaderInfo from chassis/routing state

import * as vscode from 'vscode';
import * as path from 'path';
import { ChassisService } from '../../services/chassisService.js';
import { RoutingService } from '../../services/ai/routingService.js';
import { UsageTracker } from '../../services/usageTracker.js';
import { ChatHeaderInfo } from './chatPanelHtml.js';
import { BuildHistoryService } from '../../services/build/buildHistoryService.js';

export function buildHeaderInfo(
  chassis: ChassisService,
  routing: RoutingService,
  usageTracker?: UsageTracker,
  lastModel?: string,
  extensionContext?: vscode.ExtensionContext,
  buildMode?: 'plan' | 'direct',
  assistMode?: boolean,
): ChatHeaderInfo {
  const available = routing.getAvailableAI();
  const config = chassis.isInitialized() ? chassis.loadConfig() : null;
  const hasBlueprint = !!config?.blueprint?.who;
  const blueprintLocked = config?.blueprint?.locked || false;
  const isInitialized = chassis.isInitialized();
  const projectName = config?.projectName || (vscode.workspace.workspaceFolders?.[0] ? path.basename(vscode.workspace.workspaceFolders[0].uri.fsPath) : 'No Project');

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const workspaceFolderIsOpen = !!vscode.workspace.workspaceFolders?.length;
  const hasProjectOpen = workspaceFolderIsOpen && isInitialized;

  // Check if current workspace has a .chassis/ folder or .chassis-assist shim
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const fs = require('fs');
  const workspaceHasChassis = workspaceRoot ? fs.existsSync(path.join(workspaceRoot, '.chassis')) : false;
  // [FIX] Check .chassis-assist regardless of whether .chassis/ exists — .chassis/ now exists in both modes
  const workspaceIsAssistMode = workspaceRoot ? fs.existsSync(path.join(workspaceRoot, '.chassis-assist')) : false;

  // Get recent projects from globalState
  const recentProjects: Array<{ path: string; name: string }> = [];
  if (extensionContext) {
    const recent = extensionContext.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
    // Filter out deleted projects and sort by most recent
    const valid = recent
      .filter((p: any) => fs.existsSync(p.path))
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 5);
    recentProjects.push(...valid.map((p: any) => ({ path: p.path, name: p.name })));
  }
  
  // Determine blueprint status: 'complete' | 'incomplete' | 'missing'
  const blueprintStatus = determineBlueprintStatus(config);

  const selectedAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };

  const hasKey = available.ai !== 'none';
  const aiName = hasKey ? available.ai : selectedAI;
  const aiLabel = hasKey ? available.label : aiLabels[selectedAI] + ' (no key)';

  // Supervisor label for display model
  const { supervisor } = routing.selectSupervisorAndWorker();
  const supervisorDisplayLabel = hasKey ? (aiLabels[supervisor] || supervisor) : aiLabel;

  // Use the exact model from the last response if available, otherwise use the label
  const displayModel = lastModel || supervisorDisplayLabel;

  const rosterDisplay = routing.getRosterDisplay();

  // [STARTUP BEHAVIOR] Check if we should auto-open the last project
  const startupBehavior = vscode.workspace.getConfiguration('chassis').get<string>('startupBehavior') || 'launcher';
  const shouldAutoOpenLastProject = startupBehavior === 'lastProject' 
    && !workspaceHasChassis 
    && recentProjects.length > 0;

  // Project-level token totals — sums all build history entries for the current workspace
  let projectTokens: { tokens: number; cost: number } | undefined;
  if (workspaceRoot) {
    try {
      const hist = new BuildHistoryService(workspaceRoot).list();
      const tokens = hist.reduce((s, e) => s + (e.tokensUsed || 0), 0);
      const cost = hist.reduce((s, e) => s + (e.costUSD || 0), 0);
      if (tokens > 0) { projectTokens = { tokens, cost }; }
    } catch {}
  }

  return {
    projectName, aiName, aiLabel: displayModel,
    isFallback: hasKey && available.ai !== selectedAI,
    hasKey, blueprintLocked, hasBlueprint,
    sessionActive: false, currentTime: timeStr, isInitialized,
    usageReport: usageTracker?.getReport(),
    lastModel,
    hasProjectOpen,
    workspaceHasChassis,
    workspaceFolderIsOpen,
    workspaceIsAssistMode,
    assistMode,
    recentProjects,
    shouldAutoOpenLastProject,
    blueprintStatus,
    rosterDisplay,
    buildMode,
    projectTokens,
  };
}

/**
 * Determine blueprint completeness status
 * - 'complete': All 5 W's defined (who, what, where, when, why)
 * - 'incomplete': Some W's defined but not all
 * - 'missing': No blueprint exists
 */
function determineBlueprintStatus(config: any): 'complete' | 'incomplete' | 'missing' {
  if (!config?.blueprint) return 'missing';
  
  const blueprint = config.blueprint;
  const definedFields = ['who', 'what', 'where', 'when', 'why'].filter(
    field => blueprint[field] && blueprint[field].trim().length > 0
  );
  
  if (definedFields.length === 5) return 'complete';
  if (definedFields.length > 0) return 'incomplete';
  return 'missing';
}
