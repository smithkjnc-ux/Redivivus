// [SCOPE] AI Routing Service — sends code to AI backends for analysis

import * as vscode from 'vscode';

interface AIResponse {
  text: string;
  model: string;
  success: boolean;
  error?: string;

}

export class RoutingService {

  async analyzeFile(filePath: string, content: string, instruction: string, cancelToken?: import('vscode').CancellationToken): Promise<AIResponse> {
    // For now, Gemini only — Claude and others added in Phase 2b
    const key = this.getGeminiKey();
    if (!key) {
      return { text: '', model: 'none', success: false, error: 'No Gemini API key. Set it in CHASSIS settings or via GEMINI_API_KEY env var.' };
    }
    return this.callGemini(key, filePath, content, instruction, cancelToken);
  }

  private getGeminiKey(): string | null {
    // check VS Code settings first, then env
    const config = vscode.workspace.getConfiguration('chassis');
    const key = config.get<string>('geminiApiKey') || process.env.GEMINI_API_KEY || '';
    return key || null;
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


  async prompt(text: string): Promise<AIResponse> {
    const key = this.getGeminiKey();
    if (!key) {
      return { text: '', model: 'none', success: false, error: 'No Gemini API key configured.' };
    }
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key;
      const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }] });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json() as any;
      if (!response.ok) {
        return { text: '', model: 'gemini-2.5-flash', success: false, error: data.error?.message || 'API error ' + response.status };
      }
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { text: result.trim(), model: 'gemini-2.5-flash', success: true };
    } catch (err: any) {
      return { text: '', model: 'gemini-2.5-flash', success: false, error: err.message || 'Network error' };
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
