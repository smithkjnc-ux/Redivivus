// [SCOPE] AI Routing Service orchestrator — thin facade over keys, providers, and roster modules
// Complexity routing and guardian logic extracted to routingComplexity.ts and routingGuardian.ts.

import * as vscode from 'vscode';
import type { VaultContextService } from '../vault/vaultContextService.js';
import type { AIResponse } from './routingTypes.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from './routingKeys.js';
import { callProvider } from '../../core/ai/providers/providerFactory.js';
import { AI_RANK } from './guardianAI.js';
import { routeByComplexityImpl } from './routingComplexity.js';
import { supervisorPlanImpl, guardianReviewImpl } from './routingGuardian.js';
import { supervisorPlanWithFailover } from './routingServiceSupervisor.js';
import type { OrchestratedResult, ProgressCallback } from './supervisorOrchestrator.js';
import { createPlan, executeStep, reviewOutput } from './supervisorOrchestrator.js';
import { redivivusLog } from '../logging/redivivusLogger.js';
import { analyzeFileImpl } from './routingServiceAnalyze.js';
import { logTelemetry } from '../api/apiClient.js';
import { logAICall } from './aiCallLogger.js';
import { promptCheapImpl } from './routingServiceCheap.js';

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

  async prompt(text: string, timeoutMs = 60_000, imageBase64?: string, imageType?: string, systemMessage?: string, role = 'worker'): Promise<AIResponse & { usingFallback?: string }> {

    const keyMap = this.getKeyMap();
    // Build ranked list of available AIs
    const ranked = Object.entries(AI_RANK)
      .filter(([ai]) => keyMap[ai]?.())
      .sort(([, a], [, b]) => b - a)
      .map(([ai]) => ai);

    if (ranked.length === 0) {
      redivivusLog({ operation: 'system', message: 'No AI keys configured', success: false });
      return {
        text: 'To build with Redivivus, you\'ll need at least one AI API key. I can walk you through adding one -- which AI service do you have access to?\n\n- **Anthropic (Claude)** -- console.anthropic.com\n- **Google (Gemini)** -- aistudio.google.com (free tier available)\n- **OpenAI (GPT)** -- platform.openai.com\n- **Other** -- Groq, xAI, Kimi also supported\n\nOpen **Redivivus Settings** (Ctrl+Shift+P -> "Redivivus: Open Settings") to add your key.',
        model: 'none',
        success: false,
        error: 'NO_API_KEY',
      };
    }
    
    const startTime = Date.now();
    const promptPreview = text.substring(0, 200);
    redivivusLog({ operation: 'chat', message: 'AI prompt sent', data: { ai: ranked[0], promptLength: text.length, hasImage: !!imageBase64 } });

    // [WARN] Try each AI in rank order — failover on timeout/network errors only
    let lastError = '';
    for (let i = 0; i < ranked.length; i++) {
      const ai = ranked[i];
      const fetchFn = (url: string, opts: RequestInit) => this.fetchWithTimeout(url, opts, timeoutMs);
      const result = await callProvider(ai, text, fetchFn, undefined, imageBase64, imageType, systemMessage);

      if (result.success) {
        // Fire-and-forget telemetry so admin analytics reflect direct calls too
        logTelemetry('ai_prompt', {
          model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens, success: true,
        });
        logAICall({
          role,
          model: result.model || ai,
          prompt: text,
          response: result.text || '',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: Date.now() - startTime,
        });
        return { ...result, usingFallback: i > 0 ? ai : undefined };
      }

      // Check if this error should trigger failover to next AI
      const err = (result.error || '').toLowerCase();
      // Network/timeout errors: always failover
      const isNetworkError = err.includes('timed out') || err.includes('timeout') || err.includes('abort')
        || err.includes('network') || err.includes('enotfound') || err.includes('econnrefused')
        || err.includes('fetch');
      // Capacity errors: credit exhausted, rate limits, quota — failover to next AI
      const isCapacityError = err.includes('credit') || err.includes('balance') || err.includes('quota')
        || err.includes('rate limit') || err.includes('rate_limit') || err.includes('429')
        || err.includes('402') || err.includes('insufficient') || err.includes('overloaded')
        || err.includes('capacity') || err.includes('billing');
      const isRetryable = isNetworkError || isCapacityError;
      lastError = result.error || 'Unknown error';

      if (!isRetryable) {
        // Hard error (bad API key, invalid request, etc.) — don't failover
        return result;
      }

      // Notify caller about failover
      if (i < ranked.length - 1 && this.promptFailoverCallback) {
        this.promptFailoverCallback(ai, ranked[i + 1]);
      }
    }

    return { text: '', model: 'none', success: false, error: `All AI providers failed. Last error: ${lastError}` };
  }

  // [SCOPE] Cheap-first prompt — extracted to routingServiceCheap.ts (203-line split)
  // [DEAD] Body was inline here — moved to keep routingService.ts under 200 lines (Rule 9)
  async promptCheap(text: string, timeoutMs = 30_000, imageBase64?: string, imageType?: string, systemMessage?: string, role = 'cheap'): Promise<AIResponse & { usingFallback?: string }> {
    return promptCheapImpl(this, text, timeoutMs, imageBase64, imageType, systemMessage, role);
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(id); }
  }

  getKeyMap(): Record<string, () => string | null> {
    return { gemini: getGeminiKey, claude: getClaudeKey, openai: getOpenAIKey, groq: getGroqKey, xai: getXAIKey, kimi: getKimiKey };
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

  async guardianReview(originalTask: string, workerResponse: string, workerAI: string, blueprintContext: string) {
    return guardianReviewImpl(this, originalTask, workerResponse, workerAI, blueprintContext);
  }

  isGuardianActive(): boolean {
    const { guardianEnabled } = require('./guardianAI.js');
    return guardianEnabled(this.getKeyMap());
  }

  getGuardianFor(workerAI: string): string | null {
    const { selectGuardianAI } = require('./guardianAI.js');
    return selectGuardianAI(workerAI, this.getKeyMap());
  }

  /** Multi-AI orchestrated build — delegates to routingOrchestration.ts */
  async orchestratedBuild(task: string, context: string, onProgress?: ProgressCallback): Promise<OrchestratedResult> {
    const { orchestratedBuildImpl } = await import('./routingOrchestration.js');
    return orchestratedBuildImpl(this, task, context, onProgress);
  }
}
