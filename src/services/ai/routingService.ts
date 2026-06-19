// [SCOPE] AI Routing Service orchestrator — thin facade over keys, providers, and roster modules. Complexity routing and guardian logic extracted to routingComplexity.ts and routingGuardian.ts.

import * as vscode from 'vscode';
import type { VaultContextService } from '../vault/vaultContextService.js';
import type { AIResponse } from './routingTypes.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey, getDeepseekKey } from './routingKeys.js';
import { callProvider } from '../../core/ai/providers/providerFactory.js';
import { AI_RANK } from './guardianAI.js';
import { routeByComplexityImpl } from './routingComplexity.js';
import { supervisorPlanImpl, guardianReviewImpl } from './routingGuardian.js';
import { supervisorPlanWithFailover } from './routingServiceSupervisor.js';
import { redivivusLog } from '../logging/redivivusLogger.js';
import { analyzeFileImpl } from './routingServiceAnalyze.js';
import { logTelemetry } from '../api/apiClient.js';
import { logAICall } from './aiCallLogger.js';
import { promptCheapImpl } from './routingServiceCheap.js';
import { recordQuotaError } from './providerTierState.js';

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
      // [FIX] Hard full-call deadline. fetchWithTimeout's AbortController aborts the CONNECTION but NOT
      // the body read in Electron's fetch — so a provider that connects then hangs mid-response would
      // freeze the whole UI forever and never fail over. Promise.race guarantees we always move on to the
      // next AI. The +3s buffer over the fetch timeout avoids cutting off a slow-but-working provider.
      const deadlineMs = timeoutMs + 3000;
      const result = await Promise.race([
        callProvider(ai, text, fetchFn, undefined, imageBase64, imageType, systemMessage),
        new Promise<AIResponse>(resolve => setTimeout(() => resolve({ text: '', model: ai, success: false, error: `${ai} timed out after ${deadlineMs}ms (no response)` }), deadlineMs)),
      ]);

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

      // [FIX] Fail over on ANY error, not just network/capacity. User's rule: when an AI stops for ANY
      // reason (timeout, hang, quota, auth, bad/empty response, 4xx/5xx, content filter), drop to the
      // next-ranked AI and continue. Trying the next provider can only help; if every provider fails we
      // return the aggregate error below. The only non-failover case is "no keys", handled before the loop.
      const err = (result.error || '').toLowerCase();
      lastError = result.error || 'Unknown error';

      // Feed the tier detector: repeated quota/capacity errors mark a free-capable provider as constrained
      // so future build plans match its real ceiling. Silent, soft, self-recovering.
      const isCapacityError = err.includes('credit') || err.includes('balance') || err.includes('quota')
        || err.includes('rate limit') || err.includes('rate_limit') || err.includes('429')
        || err.includes('402') || err.includes('insufficient') || err.includes('overloaded')
        || err.includes('capacity') || err.includes('billing');
      if (isCapacityError) { recordQuotaError(ai); }

      // Notify caller about the failover so the chat can show "Claude stalled -> trying Gemini".
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
