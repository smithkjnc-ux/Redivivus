// [SCOPE] Factory for AI provider execution — delegates to specific provider implementations

import type { AIResponse } from '../../../services/ai/routingTypes.js';
import { executeGemini } from './geminiProvider.js';
import { executeClaude } from './claudeProvider.js';
import { executeOpenAI } from './openaiProvider.js';
import { executeGroq } from './groqProvider.js';
import { executeXAI } from './xaiProvider.js';
import { executeKimi } from './kimiProvider.js';

export async function callProvider(
  ai: string,
  text: string,
  fetchWithTimeout: (url: string, options: RequestInit, timeoutMs?: number) => Promise<Response>,
  geminiModel?: 'flash' | 'pro',
  imageBase64?: string,
  imageType?: string,
  systemMessage?: string
): Promise<AIResponse & { usingFallback?: string }> {
  switch (ai) {
    case 'gemini':
      return executeGemini(text, fetchWithTimeout, geminiModel, imageBase64, imageType, systemMessage);
    case 'claude':
      return executeClaude(text, fetchWithTimeout, geminiModel, imageBase64, imageType, systemMessage);
    case 'openai':
      return executeOpenAI(text, fetchWithTimeout, systemMessage);
    case 'groq':
      return executeGroq(text, fetchWithTimeout, systemMessage);
    case 'xai':
      return executeXAI(text, fetchWithTimeout, systemMessage);
    case 'kimi':
      return executeKimi(text, fetchWithTimeout, systemMessage);
    default:
      return { text: '', model: 'none', success: false, error: 'Unknown AI provider: ' + ai };
  }
}
