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
import type { OrchestratedResult, ProgressCallback } from './supervisorOrchestrator.js';
import { createPlan, executeStep, reviewOutput } from './supervisorOrchestrator.js';
import { chassisLog } from '../logging/chassisLogger.js';
import { analyzeFileImpl } from './routingServiceAnalyze.js';

interface SwPair { supervisor: string; worker: string | null; }
let _swCache: { pair: SwPair; settingsKey: string } | null = null;

function _settingsKey(): string {
  const cfg = vscode.workspace.getConfiguration('chassis');
  const keys = ['gemini','claude','openai','groq','xai','kimi'];
  return keys.map(k => cfg.get<string>(k + 'ApiKey') ? k : '').join(',') + '|' + (cfg.get<string>('defaultAI') || 'gemini');
}

export class RoutingService {
  private vaultContext?: VaultContextService;

  setVaultContextService(svc: VaultContextService): void { this.vaultContext = svc; }

  selectSupervisorAndWorker(): SwPair {
    const key = _settingsKey();
    if (_swCache && _swCache.settingsKey === key) { return _swCache.pair; }
    const keyMap = this.getKeyMap();
    const ranked = Object.entries(AI_RANK)
      .filter(([ai]) => keyMap[ai]?.())
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([ai]) => ai);
    const pair: SwPair = { supervisor: ranked[0] || 'gemini', worker: ranked.length >= 2 ? ranked[1] : null };
    _swCache = { pair, settingsKey: key };
    return pair;
  }

  buildRoster(): { supervisor: string; workers: string[]; guardian: string | null } {
    const keyMap = this.getKeyMap();
    const ranked = Object.entries(AI_RANK)
      .filter(([ai]) => keyMap[ai]?.())
      .sort(([, a], [, b]) => b - a)
      .map(([ai]) => ai);
    if (ranked.length === 0) {return { supervisor: 'gemini', workers: [], guardian: null };}
    return { supervisor: ranked[0], workers: ranked.slice(1), guardian: ranked.length >= 1 ? ranked[0] : null };
  }

  getRosterDisplay(): Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }> {
    const roster = this.buildRoster();
    const labelMap: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi' };
    const result: Array<{ ai: string; label: string; role: 'Supervisor' | 'Worker' | 'Guardian'; emoji: string }> = [];
    result.push({ ai: roster.supervisor, label: labelMap[roster.supervisor] || roster.supervisor, role: 'Supervisor', emoji: '🎯' });
    for (const w of roster.workers) { result.push({ ai: w, label: labelMap[w] || w, role: 'Worker', emoji: '⚙️' }); }
    if (roster.guardian && roster.guardian !== roster.supervisor) {
      result.push({ ai: roster.guardian, label: labelMap[roster.guardian] || roster.guardian, role: 'Guardian', emoji: '🛡️' });
    }
    return result;
  }

  /** Returns the user's explicitly selected AI (from the header chip / settings), or '' if none set. */
  getPreferredAI(): string {
    return vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || '';
  }

  getModelName(): string {
    const ai = this.getAvailableAI().ai;
    const modelMap: Record<string, string> = {
      gemini: 'gemini-2.5-flash', claude: 'claude-sonnet-4-20250514',
      openai: 'gpt-4o-mini', groq: 'llama-3.3-70b-versatile',
      xai: 'grok-2-1212', kimi: 'moonshot-v1-8k',
    };
    return modelMap[ai] || ai;
  }

  getAvailableAI(): { ai: string; source: 'chassis-settings' | 'env' | 'none'; label: string } {
    const config = vscode.workspace.getConfiguration('chassis');
    const defaultAI = config.get<string>('defaultAI') || 'gemini';
    const checks = [
      { id: 'gemini', label: 'Gemini', key: getGeminiKey },
      { id: 'claude', label: 'Claude', key: getClaudeKey },
      { id: 'openai', label: 'GPT-4o', key: getOpenAIKey },
      { id: 'groq', label: 'Groq', key: getGroqKey },
      { id: 'xai', label: 'Grok', key: getXAIKey },
      { id: 'kimi', label: 'Kimi', key: getKimiKey },
    ];
    const preferred = checks.find(c => c.id === defaultAI);
    if (preferred && preferred.key()) { return { ai: preferred.id, source: 'chassis-settings', label: preferred.label }; }
    for (const c of checks) { if (c.key()) {return { ai: c.id, source: 'chassis-settings', label: c.label + ' (fallback)' };} }
    return { ai: 'none', source: 'none', label: 'No AI' };
  }

  async analyzeFile(filePath: string, content: string, instruction: string, cancelToken?: import('vscode').CancellationToken): Promise<AIResponse> {
    const { supervisor } = this.selectSupervisorAndWorker();
    return analyzeFileImpl(supervisor, this.vaultContext, this.fetchWithTimeout.bind(this), filePath, content, instruction, cancelToken);
  }

  // [CHASSIS] Failover callback — set by caller to show "Gemini timed out, retrying with Kimi..." in chat
  promptFailoverCallback?: (failedAI: string, nextAI: string) => void;

  async prompt(text: string, timeoutMs = 60_000, imageBase64?: string, imageType?: string, systemMessage?: string): Promise<AIResponse & { usingFallback?: string }> {
    const keyMap = this.getKeyMap();
    // Build ranked list of available AIs
    const ranked = Object.entries(AI_RANK)
      .filter(([ai]) => keyMap[ai]?.())
      .sort(([, a], [, b]) => b - a)
      .map(([ai]) => ai);

    if (ranked.length === 0) {
      chassisLog({ operation: 'system', message: 'No AI keys configured', success: false });
      return { text: '', model: 'none', success: false, error: 'No AI key configured. Add an API key in CHASSIS Settings (Files & AI tab).' };
    }
    
    const startTime = Date.now();
    const promptPreview = text.substring(0, 200);
    chassisLog({ operation: 'chat', message: 'AI prompt sent', data: { ai: ranked[0], promptLength: text.length, hasImage: !!imageBase64 } });

    // [WARN] Try each AI in rank order — failover on timeout/network errors only
    let lastError = '';
    for (let i = 0; i < ranked.length; i++) {
      const ai = ranked[i];
      const fetchFn = (url: string, opts: RequestInit) => this.fetchWithTimeout(url, opts, timeoutMs);
      const result = await callProvider(ai, text, fetchFn, undefined, imageBase64, imageType, systemMessage);

      if (result.success) {
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
    return supervisorPlanImpl(this, userTask, targetFile, blueprintContext, neverDoContext);
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
