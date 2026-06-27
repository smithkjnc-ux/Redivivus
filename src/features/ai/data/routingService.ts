// [SCOPE] AI Routing Service orchestrator — thin facade over keys, providers, and roster modules. Complexity routing and guardian logic extracted to routingComplexity.ts and routingGuardian.ts.

import * as vscode from 'vscode';
import type { VaultContextService } from '../../../features/vault/data/vaultContextService.js';
import type { AIResponse } from './routingTypes.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey, getDeepseekKey } from './routingKeys.js';
import { callProvider } from '../logic/providers/providerFactory.js';
import { routeByComplexityImpl } from './routingComplexity.js';
import { supervisorPlanImpl, guardianReviewImpl } from './routingGuardian.js';
import { supervisorPlanWithFailover } from './routingServiceSupervisor.js';
import { analyzeFileImpl } from './routingServiceAnalyze.js';
import { promptCheapImpl } from './routingServiceCheap.js';
import { promptImpl } from './routingServicePrompt.js';

import {
  selectSupervisorAndWorker,
  buildRoster,
  getRosterDisplay,
  getPreferredAI,
  getAvailableAI,
  getModelName,
  type SwPair
} from './routingServiceRoster.js';

export class RoutingService {
  private vaultContext?: VaultContextService;

  setVaultContextService(svc: VaultContextService): void { this.vaultContext = svc; }

  selectSupervisorAndWorker(): SwPair {
    return selectSupervisorAndWorker(this.getKeyMap());
  }

  buildRoster(): { supervisor: string; workers: string[]; guardian: string | null } {
    return buildRoster(this.getKeyMap());
  }

  getRosterDisplay(): Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }> {
    return getRosterDisplay(this.getKeyMap());
  }

  getPreferredAI(): string {
    return getPreferredAI();
  }

  getModelName(): string {
    return getModelName();
  }

  getAvailableAI(): { ai: string; source: 'redivivus-settings' | 'env' | 'none'; label: string } {
    return getAvailableAI();
  }

  async analyzeFile(filePath: string, content: string, instruction: string, cancelToken?: import('vscode').CancellationToken): Promise<AIResponse> {
    const { supervisor } = this.selectSupervisorAndWorker();
    return analyzeFileImpl(supervisor, this.vaultContext, this.fetchWithTimeout.bind(this), filePath, content, instruction, cancelToken);
  }

  // [Redivivus] Failover callbacks — set by chat panel to notify user about role changes
  promptFailoverCallback?: (failedAI: string, nextAI: string) => void;
  supervisorFailoverCallback?: (msg: string) => void;

  // [SCOPE] Prompt body extracted to routingServicePrompt.ts (Rule 9 split — was 208 lines)
  // [DEAD] Body was inline here — loop logic, skip-check, failover, quota recording all in routingServicePrompt.ts
  async prompt(text: string, timeoutMs = 60_000, imageBase64?: string, imageType?: string, systemMessage?: string, role = 'worker', maxOutputTokens?: number): Promise<AIResponse & { usingFallback?: string }> {
    return promptImpl(this, text, timeoutMs, imageBase64, imageType, systemMessage, role, maxOutputTokens);
  }

  // [SCOPE] Cheap-first prompt — extracted to routingServiceCheap.ts (Rule 9 split)
  // [DEAD] Body was inline here — moved to keep routingService.ts under 200 lines (Rule 9)
  async promptCheap(text: string, timeoutMs = 30_000, imageBase64?: string, imageType?: string, systemMessage?: string, role = 'cheap'): Promise<AIResponse & { usingFallback?: string }> {
    return promptCheapImpl(this, text, timeoutMs, imageBase64, imageType, systemMessage, role);
  }

  // [ADAPTIVE-PILL] Single-provider call with no failover — used by manual-lock mode.
  async promptWithProvider(providerId: string, text: string, timeoutMs = 60_000, imageBase64?: string, imageType?: string): Promise<AIResponse> {
    const fetchFn = (url: string, opts: RequestInit) => this.fetchWithTimeout(url, opts, timeoutMs);
    return callProvider(providerId, text, fetchFn, undefined, imageBase64, imageType);
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(id); }
  }

  getKeyMap(): Record<string, () => string | null> {
    return { gemini: getGeminiKey, claude: getClaudeKey, openai: getOpenAIKey, groq: getGroqKey, xai: getXAIKey, kimi: getKimiKey, deepseek: getDeepseekKey };
  }

  async routeByComplexity(task: string, promptText: string, timeoutMs = 30_000): Promise<AIResponse & { estimate?: string; tier?: 'free' | 'paid'; routedTo?: string; routingReason?: string }> {
    return routeByComplexityImpl(this, task, promptText, timeoutMs);
  }

  async supervisorPlan(userTask: string, targetFile: string, blueprintContext: string, neverDoContext?: string): Promise<string | null> {
    return supervisorPlanWithFailover(this, userTask, targetFile, blueprintContext, neverDoContext);
  }

  /** Returns true if at least one AI provider key is configured. */
  hasAnyKey(): boolean {
    return Object.values(this.getKeyMap()).some(fn => fn());
  }

  async guardianReview(originalTask: string, workerResponse: string, workerAI: string, blueprintContext: string, forceProvider?: string) {
    return guardianReviewImpl(this, originalTask, workerResponse, workerAI, blueprintContext, forceProvider);
  }
  isGuardianActive(): boolean {
    const { guardianEnabled } = require('./guardianAI.js');
    return guardianEnabled(this.getKeyMap());
  }
  getGuardianFor(workerAI: string): string | null {
    const { selectGuardianAI } = require('./guardianAI.js');
    return selectGuardianAI(workerAI, this.getKeyMap());
  }
  // [DEAD][M4] Removed `orchestratedBuild()` + `src/services/ai/routingOrchestration.ts` — they had no
  // live callers (the only reference was a [DEAD] comment in chatPanelChunked.ts). The live orchestrated
  // build path is core/build/chatPanelBuildOrchestrated.ts, which calls supervisorOrchestrator directly.
}
