// [SCOPE] File analysis helper — extracted from routingService.ts (Rule 9 split)

import * as path from 'path';
import type { VaultContextService } from '../../../features/vault/data/vaultContextService.js';
import type { AIResponse } from './routingTypes.js';
import { getGeminiKey } from './routingKeys.js';
import { callGemini } from './routingGemini.js';
import { callProvider } from '../logic/providers/providerFactory.js';
import { redivivusLog, logAIInteraction } from '../../../features/logging/data/redivivusLogger.js';

export async function analyzeFileImpl(
  supervisor: string,
  vaultContext: VaultContextService | undefined,
  fetchWithTimeout: (url: string, opts: RequestInit, ms?: number) => Promise<Response>,
  filePath: string,
  content: string,
  instruction: string,
  cancelToken?: import('vscode').CancellationToken
): Promise<AIResponse> {
  const startTime = Date.now();
  redivivusLog({ operation: 'analyze', phase: 'start', message: `Analyzing ${path.basename(filePath)}`, data: { file: filePath, ai: supervisor } });

  let result: AIResponse;
  if (supervisor === 'gemini') {
    const key = getGeminiKey();
    if (!key) { return { text: '', model: 'none', success: false, error: 'No Gemini API key. Set it in Redivivus settings or via GEMINI_API_KEY env var.' }; }
    result = await callGemini(key, filePath, content, instruction, vaultContext, cancelToken);
  } else {
    const fetch = (url: string, opts: RequestInit) => fetchWithTimeout(url, opts, 30_000);
    const prompt = `${instruction}\n\nFile: ${filePath}\n\`\`\`\n${content.slice(0, 6000)}\n\`\`\``;
    result = await callProvider(supervisor, prompt, fetch);
  }

  const duration = Date.now() - startTime;
  logAIInteraction('analyze', 'analyzer', supervisor, 'complete', instruction, result.text || '', {
    durationMs: duration, success: result.success, error: result.error,
    inputTokens: result.inputTokens, outputTokens: result.outputTokens
  });
  return result;
}
