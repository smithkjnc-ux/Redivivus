// [SCOPE] Redivivus Chat Panel header builder — computes ChatHeaderInfo from redivivus/routing state

import * as vscode from 'vscode';
import * as path from 'path';
import type { RedivivusService } from '../../../services/redivivusService';
import type { RoutingService } from '../../../services/ai/routingService';
import type { UsageTracker } from '../../../services/usageTracker';
import type { ChatHeaderInfo } from './chatPanelHtml';
import { BuildHistoryService } from '../../../services/build/buildHistoryService';
import { getAccountToken } from '../../../services/api/apiClient.js';
import * as fs from 'fs';

export function buildHeaderInfo(
  redivivus: RedivivusService,
  routing: RoutingService,
  usageTracker?: UsageTracker,
  lastModel?: string,
  extensionContext?: vscode.ExtensionContext,
  buildMode?: 'plan' | 'direct',
  assistMode?: boolean,
): ChatHeaderInfo {
  const available = routing.getAvailableAI();
  const isInitialized = redivivus.isInitialized();
  const config = isInitialized ? redivivus.loadConfig() : null;
  const hasBlueprint = !!config?.blueprint?.who;
  const blueprintLocked = config?.blueprint?.locked || false;
  const projectName = config?.projectName || (vscode.workspace.workspaceFolders?.[0] ? path.basename(vscode.workspace.workspaceFolders[0].uri.fsPath) : 'No Project');

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const workspaceFolderIsOpen = !!vscode.workspace.workspaceFolders?.length;
  const hasProjectOpen = workspaceFolderIsOpen && isInitialized;

  // [DEBUG] Log header state to diagnose header button issue
  require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log',
    `[buildHeaderInfo] ws0=${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath} isInit=${isInitialized} hasProject=${hasProjectOpen} wsFolderOpen=${workspaceFolderIsOpen}\n`);

  // Check if current workspace has a .redivivus/ folder or .redivivus-assist shim
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const fs = require('fs');
  const workspaceHasRedivivus = workspaceRoot ? fs.existsSync(path.join(workspaceRoot, '.redivivus')) : false;
  // [FIX] Check .redivivus-assist regardless of whether .redivivus/ exists — .redivivus/ now exists in both modes
  const workspaceIsAssistMode = workspaceRoot ? fs.existsSync(path.join(workspaceRoot, '.redivivus-assist')) : false;

  // Get recent projects from globalState
  const recentProjects: Array<{ path: string; name: string; timestamp?: number }> = [];
  if (extensionContext) {
    const recent = extensionContext.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('redivivus.recentProjects', []);
    // Filter out deleted projects and sort by most recent
    const valid = recent
      .filter((p: any) => fs.existsSync(p.path))
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 5);
    recentProjects.push(...valid.map((p: any) => ({ path: p.path, name: p.name, timestamp: p.timestamp || undefined })));
  }
  
  // Determine blueprint status: 'complete' | 'incomplete' | 'missing'
  const blueprintStatus = determineBlueprintStatus(config);

  const selectedAI = vscode.workspace.getConfiguration('redivivus').get<string>('defaultAI') || 'gemini';
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
  const startupBehavior = vscode.workspace.getConfiguration('redivivus').get<string>('startupBehavior') || 'launcher';
  const shouldAutoOpenLastProject = startupBehavior === 'lastProject' 
    && !workspaceHasRedivivus 
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

  // Build stamp — read from out/data/build-info.json so every compile+deploy shows a new timestamp
  let buildStamp: string | undefined;
  try {
    const extPath = extensionContext?.extensionPath;
    if (extPath) {
      const info = JSON.parse(fs.readFileSync(path.join(extPath, 'out', 'data', 'build-info.json'), 'utf-8'));
      const d = new Date(info.timestamp);
      const hhmm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      buildStamp = `v${info.version} \u00b7 ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hhmm}`;
    }
  } catch {}

  // Determine primary action for the header pill (Preview vs Run)
  let primaryAction = {
    label: 'Preview',
    actionAttr: 'data-action',
    actionValue: 'preview-show',
    tooltip: 'Live preview of your project',
    icon: '&#x25B6;'
  };

  const activeEditor = vscode.window.activeTextEditor;
  const activeFilePath = activeEditor?.document.uri.fsPath;

  if (activeFilePath) {
    const ext = path.extname(activeFilePath).toLowerCase();
    if (['.py', '.go', '.rs', '.sh', '.rb', '.php', '.java', '.c', '.cpp', '.cs'].includes(ext)) {
      primaryAction = {
        label: 'Run',
        actionAttr: 'data-cmd',
        actionValue: 'redivivus.runProject',
        tooltip: 'Run your project in the terminal',
        icon: '&#x25B6;'
      };
    }
  } else if (workspaceRoot) {
    // [FIX] Scan workspace root directly for backend file extensions.
    // detectPostBuildInfo with empty builtFiles misses files like calculator.py because
    // it only checks fixed entry names (main.py, app.py, etc). Direct scan catches all.
    try {
      const rootFiles = fs.readdirSync(workspaceRoot);
      const backendExts = ['.py', '.go', '.rs', '.sh', '.rb', '.php', '.java', '.c', '.cpp', '.cs'];
      const hasHtml = rootFiles.some((f: string) => f.endsWith('.html'));
      const hasBackend = rootFiles.some((f: string) => backendExts.some(e => f.endsWith(e)));
      // Also check for package.json without any .html — pure Node CLI project
      const hasPackageJson = rootFiles.includes('package.json');
      const isNodeCli = hasPackageJson && !hasHtml;
      if ((hasBackend || isNodeCli) && !hasHtml) {
        primaryAction = {
          label: 'Run',
          actionAttr: 'data-cmd',
          actionValue: 'redivivus.runProject',
          tooltip: 'Run your project in the terminal',
          icon: '&#x25B6;'
        };
      }
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
    workspaceHasRedivivus,
    workspaceFolderIsOpen,
    workspaceIsAssistMode,
    assistMode,
    recentProjects,
    shouldAutoOpenLastProject,
    blueprintStatus,
    rosterDisplay,
    buildMode,
    projectTokens,
    buildStamp,
    primaryAction,
    vaultItemCount: (() => { try { const { VaultService } = require('../../../services/vault/vaultService.js'); const v = new VaultService(extensionContext); return v.listItems().length; } catch { return 0; } })(),
    isSignedIn: false,
    healthStatus: extensionContext?.globalState.get<'green' | 'yellow' | 'red'>('redivivus.healthStatus'), // populated async below — caller uses refreshHeader() to get updated value
  };
}

/**
 * Determine blueprint completeness status
 * - 'complete': All 5 W's defined (who, what, where, when, why)
 * - 'incomplete': Some W's defined but not all
 * - 'missing': No blueprint exists
 */
function determineBlueprintStatus(config: any): 'complete' | 'incomplete' | 'missing' {
  if (!config?.blueprint) {return 'missing';}
  
  const blueprint = config.blueprint;
  const definedFields = ['who', 'what', 'where', 'when', 'why'].filter(
    field => blueprint[field] && blueprint[field].trim().length > 0
  );
  
  if (definedFields.length === 5) {return 'complete';}
  if (definedFields.length > 0) {return 'incomplete';}
  return 'missing';
}
