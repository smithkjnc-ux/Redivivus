// [SCOPE] AI Routing Service — sends code to AI backends for analysis

import * as vscode from 'vscode';
import { VaultContextService } from './vaultContextService.js';

interface AIResponse {
  text: string;
  model: string;
  success: boolean;
  error?: string;

}

export class RoutingService {
  private vaultContext?: VaultContextService;

  // Inject vault context service after construction (avoids circular dep)
  setVaultContextService(svc: VaultContextService): void {
    this.vaultContext = svc;
  }

  // Returns which AI is available, preferring the configured defaultAI then falling back
  getAvailableAI(): { ai: string; source: 'chassis-settings' | 'env' | 'none'; label: string } {
    const config = vscode.workspace.getConfiguration('chassis');
    const defaultAI = config.get<string>('defaultAI') || 'gemini';

    const checks: Array<{ id: string; label: string; key: () => string | null }> = [
      { id: 'gemini', label: 'Gemini',  key: () => this.getGeminiKey() },
      { id: 'claude', label: 'Claude',  key: () => this.getClaudeKey() },
      { id: 'openai', label: 'GPT-4o',  key: () => this.getOpenAIKey() },
      { id: 'groq',   label: 'Groq',    key: () => this.getGroqKey() },
      { id: 'xai',    label: 'Grok',    key: () => this.getXAIKey() },
      { id: 'kimi',   label: 'Kimi',    key: () => this.getKimiKey() },
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

  async analyzeFile(filePath: string, content: string, instruction: string, cancelToken?: import('vscode').CancellationToken): Promise<AIResponse> {
    const key = this.getGeminiKey();
    if (!key) {
      return { text: '', model: 'none', success: false, error: 'No Gemini API key. Set it in CHASSIS settings or via GEMINI_API_KEY env var.' };
    }

    // Prepend vault context to instruction if relevant items exist
    let enrichedInstruction = instruction;
    if (this.vaultContext) {
      const ctx = this.vaultContext.findRelevantItems(filePath, content);
      if (ctx.hitCount > 0) {
        enrichedInstruction = ctx.contextBlock + '\n\n' + instruction;
      }
    }

    return this.callGemini(key, filePath, content, enrichedInstruction, cancelToken);
  }

  private getGeminiKey(): string | null {
    const config = vscode.workspace.getConfiguration('chassis');
    const key = config.get<string>('geminiApiKey') || process.env.GEMINI_API_KEY || '';
    return key || null;
  }

  private getClaudeKey(): string | null {
    const config = vscode.workspace.getConfiguration('chassis');
    return config.get<string>('claudeApiKey') || process.env.ANTHROPIC_API_KEY || null;
  }

  private getOpenAIKey(): string | null {
    const config = vscode.workspace.getConfiguration('chassis');
    return config.get<string>('openaiApiKey') || process.env.OPENAI_API_KEY || null;
  }

  private getGroqKey(): string | null {
    const config = vscode.workspace.getConfiguration('chassis');
    return config.get<string>('groqApiKey') || process.env.GROQ_API_KEY || null;
  }

  private getXAIKey(): string | null {
    const config = vscode.workspace.getConfiguration('chassis');
    return config.get<string>('xaiApiKey') || process.env.XAI_API_KEY || null;
  }

  private getKimiKey(): string | null {
    const config = vscode.workspace.getConfiguration('chassis');
    return config.get<string>('kimiApiKey') || process.env.MOONSHOT_API_KEY || null;
  }

  private async callGemini(key: string, filePath: string, content: string, instruction: string, cancelToken?: import('vscode').CancellationToken): Promise<AIResponse> {
    const commentStyle = this.getCommentStyle(filePath);
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

INSTRUCTION: ${instruction}

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


  async prompt(text: string): Promise<AIResponse & { usingFallback?: string }> {
    const available = this.getAvailableAI();
    if (available.ai === 'none') {
      return { text: '', model: 'none', success: false, error: 'No AI key configured. Add an API key in CHASSIS Settings (Files & AI tab).' };
    }

    const defaultAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';
    const usingFallback = available.ai !== defaultAI ? available.label : undefined;

    return this.callProvider(available.ai, text, usingFallback);
  }

  private async callProvider(ai: string, text: string, usingFallback?: string): Promise<AIResponse & { usingFallback?: string }> {
    if (ai === 'gemini') {
      const key = this.getGeminiKey()!;
      try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key;
        const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }] });
        const res = await this.fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const data = await res.json() as any;
        if (!res.ok) return { text: '', model: 'gemini-2.5-flash', success: false, error: data.error?.message || 'API error ' + res.status };
        return { text: (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim(), model: 'gemini-2.5-flash', success: true, usingFallback };
      } catch (err: any) { return { text: '', model: 'gemini-2.5-flash', success: false, error: err.message }; }
    }

    if (ai === 'claude') {
      const key = this.getClaudeKey()!;
      try {
        const url = 'https://api.anthropic.com/v1/messages';
        const body = JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 1024, messages: [{ role: 'user', content: text }] });
        const res = await this.fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body });
        const data = await res.json() as any;
        if (!res.ok) return { text: '', model: 'claude-3-5-haiku', success: false, error: data.error?.message || 'API error ' + res.status };
        return { text: (data.content?.[0]?.text || '').trim(), model: 'claude-3-5-haiku', success: true, usingFallback };
      } catch (err: any) { return { text: '', model: 'claude-3-5-haiku', success: false, error: err.message }; }
    }

    if (ai === 'openai') {
      const key = this.getOpenAIKey()!;
      try {
        const url = 'https://api.openai.com/v1/chat/completions';
        const body = JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: text }] });
        const res = await this.fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
        const data = await res.json() as any;
        if (!res.ok) return { text: '', model: 'gpt-4o-mini', success: false, error: data.error?.message || 'API error ' + res.status };
        return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'gpt-4o-mini', success: true, usingFallback };
      } catch (err: any) { return { text: '', model: 'gpt-4o-mini', success: false, error: err.message }; }
    }

    if (ai === 'groq') {
      const key = this.getGroqKey()!;
      try {
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        const body = JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: text }] });
        const res = await this.fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
        const data = await res.json() as any;
        if (!res.ok) return { text: '', model: 'llama-3.3-70b', success: false, error: data.error?.message || 'API error ' + res.status };
        return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'llama-3.3-70b', success: true, usingFallback };
      } catch (err: any) { return { text: '', model: 'llama-3.3-70b', success: false, error: err.message }; }
    }

    if (ai === 'xai') {
      const key = this.getXAIKey()!;
      try {
        const url = 'https://api.x.ai/v1/chat/completions';
        const body = JSON.stringify({ model: 'grok-3-mini', messages: [{ role: 'user', content: text }] });
        const res = await this.fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
        const data = await res.json() as any;
        if (!res.ok) return { text: '', model: 'grok-3-mini', success: false, error: data.error?.message || 'API error ' + res.status };
        return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'grok-3-mini', success: true, usingFallback };
      } catch (err: any) { return { text: '', model: 'grok-3-mini', success: false, error: err.message }; }
    }

    if (ai === 'kimi') {
      const key = this.getKimiKey()!;
      try {
        const url = 'https://api.moonshot.cn/v1/chat/completions';
        const body = JSON.stringify({ model: 'moonshot-v1-8k', messages: [{ role: 'user', content: text }] });
        const res = await this.fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body });
        const data = await res.json() as any;
        if (!res.ok) return { text: '', model: 'kimi', success: false, error: data.error?.message || 'API error ' + res.status };
        return { text: (data.choices?.[0]?.message?.content || '').trim(), model: 'kimi', success: true, usingFallback };
      } catch (err: any) { return { text: '', model: 'kimi', success: false, error: err.message }; }
    }

    return { text: '', model: 'none', success: false, error: 'Unknown AI provider: ' + ai };
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

    private getCommentStyle(filePath: string): { single: string; block?: [string, string]; example: string } {
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const styles: Record<string, { single: string; block?: [string, string]; example: string }> = {
        // Python, Shell, YAML, Ruby
        'py':   { single: '#', example: '# [SCOPE] description' },
        'sh':   { single: '#', example: '# [SCOPE] description' },
        'bash': { single: '#', example: '# [SCOPE] description' },
        'yaml': { single: '#', example: '# [SCOPE] description' },
        'yml':  { single: '#', example: '# [SCOPE] description' },
        'rb':   { single: '#', example: '# [SCOPE] description' },
        'r':    { single: '#', example: '# [SCOPE] description' },
        // JavaScript, TypeScript, Java, C, C++, C#, Rust, Go, Swift, Kotlin, PHP
        'js':   { single: '//', example: '// [SCOPE] description' },
        'jsx':  { single: '//', example: '// [SCOPE] description' },
        'ts':   { single: '//', example: '// [SCOPE] description' },
        'tsx':  { single: '//', example: '// [SCOPE] description' },
        'java': { single: '//', example: '// [SCOPE] description' },
        'c':    { single: '//', example: '// [SCOPE] description' },
        'cpp':  { single: '//', example: '// [SCOPE] description' },
        'h':    { single: '//', example: '// [SCOPE] description' },
        'cs':   { single: '//', example: '// [SCOPE] description' },
        'rs':   { single: '//', example: '// [SCOPE] description' },
        'go':   { single: '//', example: '// [SCOPE] description' },
        'swift':{ single: '//', example: '// [SCOPE] description' },
        'kt':   { single: '//', example: '// [SCOPE] description' },
        'php':  { single: '//', example: '// [SCOPE] description' },
        // HTML, XML
        'html': { single: '<!--', block: ['<!--', '-->'], example: '<!-- [SCOPE] description -->' },
        'xml':  { single: '<!--', block: ['<!--', '-->'], example: '<!-- [SCOPE] description -->' },
        'vue':  { single: '<!--', block: ['<!--', '-->'], example: '<!-- [SCOPE] description -->' },
        'svelte':{ single: '<!--', block: ['<!--', '-->'], example: '<!-- [SCOPE] description -->' },
        // CSS
        'css':  { single: '/*', block: ['/*', '*/'], example: '/* [SCOPE] description */' },
        'scss': { single: '//', example: '// [SCOPE] description' },
        'less': { single: '//', example: '// [SCOPE] description' },
        // SQL, Lua
        'sql':  { single: '--', example: '-- [SCOPE] description' },
        'lua':  { single: '--', example: '-- [SCOPE] description' },
        // BASIC, VB
        'bas':  { single: "\'", example: "\' [SCOPE] description" },
        'vb':   { single: "\'", example: "\' [SCOPE] description" },
        'vbs':  { single: "\'", example: "\' [SCOPE] description" },
      };
      return styles[ext] || { single: '//', example: '// [SCOPE] description' };
    }

}
