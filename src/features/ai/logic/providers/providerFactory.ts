// [SCOPE] Factory for AI provider execution — delegates to specific provider implementations

import type { AIResponse } from '../../data/routingTypes.js';
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
      return executeOpenAI(text, fetchWithTimeout, systemMessage, tier, imageBase64, imageType);
    case 'groq':
    case 'xai':
    case 'kimi':
    case 'deepseek': {
      // [VISION-WARN] These providers are text-only in the extension-side path. Image silently dropped.
      if (imageBase64) { console.warn(`[Redivivus] ${ai} does not support vision — image attachment ignored. Switch to Claude, OpenAI, or Gemini to analyze images.`); }
      if (ai === 'groq') { return executeGroq(text, fetchWithTimeout, systemMessage, tier); }
      if (ai === 'xai')  { return executeXAI(text, fetchWithTimeout, systemMessage, tier); }
      if (ai === 'kimi') { return executeKimi(text, fetchWithTimeout, systemMessage, tier); }
      return executeDeepseek(text, fetchWithTimeout, systemMessage, tier);
    }
    default:
      return { text: '', model: 'none', success: false, error: 'Unknown AI provider: ' + ai };
  }
}
