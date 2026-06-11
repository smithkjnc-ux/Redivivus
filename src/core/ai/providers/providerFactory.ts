// [SCOPE] Factory for AI provider execution — delegates to specific provider implementations

import type { AIResponse } from '../../../services/ai/routingTypes.js';
import { executeGemini } from './geminiProvider.js';
import { executeClaude } from './claudeProvider.js';
import { executeOpenAI } from './openaiProvider.js';
import { executeGroq } from './groqProvider.js';
import { executeXAI } from './xaiProvider.js';
import { executeKimi } from './kimiProvider.js';
import { executeDeepseek } from './deepseekProvider.js';

// [WARN] tier selects model from modelRegistry: 'ultra'=most capable, 'pro'=guardian/supervisor,
//        'flash'=worker (cheapest that qualifies). Always pass tier explicitly for Guardian calls.
export async function callProvider(
  ai: string,
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  tier?: 'flash' | 'pro' | 'ultra',
  imageBase64?: string,
  imageType?: string,
  systemMessage?: string
): Promise<AIResponse & { usingFallback?: string }> {
  switch (ai) {
    case 'gemini':
      return executeGemini(text, fetchWithTimeout, tier, imageBase64, imageType, systemMessage);
    case 'claude':
      return executeClaude(text, fetchWithTimeout, tier, imageBase64, imageType, systemMessage);
    case 'openai':
      return executeOpenAI(text, fetchWithTimeout, systemMessage, tier);
    case 'groq':
      return executeGroq(text, fetchWithTimeout, systemMessage, tier);
    case 'xai':
      return executeXAI(text, fetchWithTimeout, systemMessage, tier);
    case 'kimi':
      return executeKimi(text, fetchWithTimeout, systemMessage, tier);
    case 'deepseek':
      return executeDeepseek(text, fetchWithTimeout, systemMessage, tier);
    default:
      return { text: '', model: 'none', success: false, error: 'Unknown AI provider: ' + ai };
  }
}
