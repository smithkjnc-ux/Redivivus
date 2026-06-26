// [SCOPE] Redivivus Chat Panel header builder — computes ChatHeaderInfo from redivivus/routing state

import * as vscode from 'vscode';
import * as path from 'path';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { RoutingService } from '../../../features/ai/data/routingService.js';
import type { UsageTracker } from '../../telemetry/data/usageTracker.js';
import type { ChatHeaderInfo } from './chatPanelHtml.js';
import { BuildHistoryService } from '../../build/services/buildHistoryService.js';
import { getAccountToken } from '../../../features/api/data/apiClient.js';
import * as fs from 'fs';
import { determineBlueprintStatus } from './chatPanelHeaderUtils.js';
import { isProjectsContainer } from '../../project/logic/redivivusPaths.js';
import { isSecretKeyStoreReady } from '../../../features/ai/data/secretKeyStore.js';
import { getPrimaryAction, getConfiguredProviders, getVaultCounts } from './chatPanelHeaderActions.js';

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

  // [FIX] Effective project root — the no-reload build flow shows the project in the Redivivus
  // "Project Files" tree WITHOUT adding it to the VS Code workspace, so workspaceFolders is empty.
  // We use getEffectiveProjectRoot to correctly resolve the nested project when the workspace is 'projects'.
  const effectiveRoot = require('./chatPanelHeaderUtils.js').getEffectiveProjectRoot(redivivus.getWorkspaceRoot());
  let svc = redivivus;
  if (effectiveRoot && redivivus.getWorkspaceRoot() !== effectiveRoot) {
    try { svc = new (redivivus as any).constructor(effectiveRoot); } catch { svc = redivivus; }
  }

  const isInitialized = svc.isInitialized();
  const config = isInitialized ? svc.loadConfig() : null;
  const hasBlueprint = !!config?.blueprint?.who;
  const blueprintLocked = config?.blueprint?.locked || false;
  const projectName = config?.projectName || (effectiveRoot ? path.basename(effectiveRoot) : 'No Project');

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const workspaceRoot = effectiveRoot;
  const workspaceIsProjectsContainer = workspaceRoot ? isProjectsContainer(workspaceRoot) : false;
  const workspaceHasRedivivus = !!workspaceRoot && !workspaceIsProjectsContainer && fs.existsSync(path.join(workspaceRoot, '.redivivus'));

  // A project is "open" if there is an effective root (workspace folder OR active build root), it is initialized, AND it is not the container.
  const workspaceFolderIsOpen = !!effectiveRoot;
  const hasProjectOpen = workspaceFolderIsOpen && isInitialized && !workspaceIsProjectsContainer;
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

  const selectedAI = vscode.workspace.getConfiguration('redivivus').get<string>('defaultAI') || '';
  const aiLabels: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', deepseek: 'DeepSeek' };

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

  const primaryAction = getPrimaryAction(workspaceRoot);

  return {
    projectName, aiName, aiLabel: displayModel,
    isFallback: hasKey && available.ai !== selectedAI,
    hasKey, keyStoreReady: isSecretKeyStoreReady(), blueprintLocked, hasBlueprint,
    sessionActive: false, currentTime: timeStr, isInitialized,
    usageReport: usageTracker?.getReport(),
    lastModel,
    hasProjectOpen,
    workspaceHasRedivivus,
    workspaceIsProjectsContainer,
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
    ...getVaultCounts(extensionContext),
    isSignedIn: false,
    healthStatus: extensionContext?.globalState.get<'green' | 'yellow' | 'red'>('redivivus.healthStatus'),
    configuredProviders: getConfiguredProviders(),
  };
}

// [DONE] determineBlueprintStatus extracted to chatPanelHeaderUtils.ts (Rule 9 split)
