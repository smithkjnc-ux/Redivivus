// [SCOPE] Routing Gemini provider — callGemini with comment style and vault context
// Called by routingService for analyzeFile. No other provider logic here.

import { VaultContextService } from '../vault/vaultContextService.js';
import { AIResponse } from './routingTypes.js';
import { getCommentStyle } from './routingCommentStyle.js';

export async function callGemini(
  key: string,
  filePath: string,
  content: string,
  instruction: string,
  vaultContext?: VaultContextService,
  cancelToken?: import('vscode').CancellationToken
): Promise<AIResponse> {
  const commentStyle = getCommentStyle(filePath);

  // Prepend vault context to instruction if relevant items exist
  let enrichedInstruction = instruction;
  if (vaultContext) {
    const ctx = vaultContext.findRelevantItems(filePath, content);
    if (ctx.hitCount > 0) {
      enrichedInstruction = ctx.contextBlock + '\n\n' + instruction;
    }
  }

  const prompt = `You are CHASSIS, an AI code structure assistant.

CRITICAL: This file is ${filePath.split('.').pop()?.toUpperCase()} — use ONLY ${commentStyle.single} style comments.
Example: ${commentStyle.example}
NEVER use // comments in Python files. NEVER use # comments in JavaScript files.

Rules:
- Add ${commentStyle.example.replace('description', 'what this file does')} at the very top of the file
- Convert any TODO, FIXME, HACK, XXX comments to CHASSIS format using ${commentStyle.single} style: ${commentStyle.single} [TODO], ${commentStyle.single} [WARN], ${commentStyle.single} [DEAD]
- Add ${commentStyle.single} [WARN] to any fragile or risky code
- If a file is over 200 lines, suggest where to split it with ${commentStyle.single} [NEXT] split point markers
- Keep all existing code exactly as-is — only add/convert comments
- Return the COMPLETE modified file, not just snippets

File: ${filePath}

INSTRUCTION: ${enrichedInstruction}

CODE:
\`\`\`
${content}
\`\`\`

Return ONLY the modified code. No explanation before or after. No markdown fences.`;

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key;

    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    // 60 second timeout + cancellation support
    const controller = new AbortController();
    // scale timeout: 60s base + 1s per 50 lines
    const lineCount = content.split('\n').length;
    const timeoutMs = Math.max(60000, Math.min(600000, 60000 + lineCount * 50));
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (cancelToken) {
      cancelToken.onCancellationRequested(() => controller.abort());
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json() as any;

    if (!response.ok) {
      return { text: '', model: 'gemini-2.5-flash', success: false, error: data.error?.message || 'API error ' + response.status };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      return { text: '', model: 'gemini-2.5-flash', success: false, error: 'Empty response from Gemini' };
    }

    // strip markdown fences if present
    let clean = text;
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    }

    return { text: clean, model: 'gemini-2.5-flash', success: true };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { text: '', model: 'gemini-2.5-flash', success: false, error: 'Cancelled or timed out' };
    }
    return { text: '', model: 'gemini-2.5-flash', success: false, error: err.message || 'Network error' };
  }
}
