// [SCOPE] AI Routing Service orchestrator — thin facade over keys, comment style, Gemini, and providers modules
// Split from 322-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import { VaultContextService } from './vaultContextService.js';
import { AIResponse } from './routingTypes.js';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from './routingKeys.js';
import { callGemini } from './routingGemini.js';
import { callProvider } from './routingProviders.js';

export class RoutingService {
  private vaultContext?: VaultContextService;

  // Inject vault context service after construction (avoids circular dep)
  setVaultContextService(svc: VaultContextService): void {
    this.vaultContext = svc;
  }

  // ── AI availability check (delegated to routingKeys)

  getAvailableAI(): { ai: string; source: 'chassis-settings' | 'env' | 'none'; label: string } {
    const config = vscode.workspace.getConfiguration('chassis');
    const defaultAI = config.get<string>('defaultAI') || 'gemini';

    const checks: Array<{ id: string; label: string; key: () => string | null }> = [
      { id: 'gemini', label: 'Gemini',  key: getGeminiKey },
      { id: 'claude', label: 'Claude',  key: getClaudeKey },
      { id: 'openai', label: 'GPT-4o',  key: getOpenAIKey },
      { id: 'groq',   label: 'Groq',    key: getGroqKey },
      { id: 'xai',    label: 'Grok',    key: getXAIKey },
      { id: 'kimi',   label: 'Kimi',    key: getKimiKey },
    ];

    // Try defaultAI first
    const preferred = checks.find(c => c.id === defaultAI);
    if (preferred && preferred.key()) {
      return { ai: preferred.id, source: 'chassis-settings', label: preferred.label };
    }
    // Fall back to first available
    for (const c of checks) {
      if (c.key()) return { ai: c.id, source: 'chassis-settings', label: c.label + ' (fallback)' };
    }
    return { ai: 'none', source: 'none', label: 'No AI' };
  }

  // ── file analysis (delegated to routingGemini)

  async analyzeFile(filePath: string, content: string, instruction: string, cancelToken?: import('vscode').CancellationToken): Promise<AIResponse> {
    const key = getGeminiKey();
    if (!key) {
      return { text: '', model: 'none', success: false, error: 'No Gemini API key. Set it in CHASSIS settings or via GEMINI_API_KEY env var.' };
    }
    return callGemini(key, filePath, content, instruction, this.vaultContext, cancelToken);
  }

  // ── general prompt (delegated to routingProviders)

  async prompt(text: string): Promise<AIResponse & { usingFallback?: string }> {
    const available = this.getAvailableAI();
    if (available.ai === 'none') {
      return { text: '', model: 'none', success: false, error: 'No AI key configured. Add an API key in CHASSIS Settings (Files & AI tab).' };
    }

    const defaultAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';
    const usingFallback = available.ai !== defaultAI ? available.label : undefined;

    return callProvider(available.ai, text, this.fetchWithTimeout.bind(this));
  }

  // ── fetch with timeout (orchestrator-only — shared by all providers)

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }
}
