// [SCOPE] Local AI build fallback — runs when cloud /build returns a server error (5xx).
// Builds directly using the user's own AI keys, no backend required.
// Uses the same XML file-block format as the FIX pipeline so output can be parsed consistently.

import * as path from 'path';
import { callProvider } from '../../core/ai/providers/providerFactory.js';
import { collectKeys } from '../api/apiClient.js';
import type { CloudBuildContext } from './buildContextCollector.js';
import type { CloudBuildResult } from './cloudBuildClient.js';
import { processBuildResults } from './cloudBuildResultProcessor.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';

const PROVIDER_ORDER = ['claude', 'gemini', 'openai', 'groq', 'xai', 'kimi'];

const SYSTEM = `You are a code generation assistant. The user wants to build a project.
Output ONLY file blocks in this exact XML format — no prose, no explanation:

<file path="relative/path/to/file.ext">
<content>
...complete file content here...
</content>
</file>

CRITICAL RULES — follow these exactly:
- Use relative paths (e.g. index.html, src/app.ts)
- Write COMPLETE file content — never truncate or use placeholders
- Generate all files needed to fully run and USE the project
- For web projects: index.html is the entry point
- For GAMES: the game MUST be fully playable — not just a visual layout. This means:
  * All click/mouse event handlers wired up and working
  * Complete game state management (tracking turns, scores, selected pieces, board state)
  * All game rules implemented (valid moves, captures, win conditions)
  * Players can actually play the game from start to finish
  * If it is a board game: piece selection, highlighting valid moves, executing moves all work
  * AI/computer opponents MUST go through the SAME move-execution path as human moves
    (populate valid moves list BEFORE calling movePiece — never set selectedPiece directly)
  * Test mentally: after human moves, does the AI's turn actually fire and complete?
- Do NOT include any text outside the file blocks
- Self-contained single-file web apps are preferred (inline CSS and JS in index.html) unless the project clearly needs multiple files
- NEVER use CDN URLs (unpkg, jsdelivr, cdnjs, etc.) -- files are opened via file:// and CDN scripts will not load. All JS must be inline or bundled`;

function buildLocalPrompt(task: string, context: CloudBuildContext): string {
  const parts: string[] = [`BUILD TASK: ${task}`];
  if (context.blueprint?.projectName) {
    parts.push(`PROJECT: ${context.blueprint.projectName}`);
  }
  if (context.blueprint?.what) {
    parts.push(`DESCRIPTION: ${context.blueprint.what}`);
  }
  if (context.projectMap) {
    parts.push(`PROJECT STRUCTURE:\n${context.projectMap}`);
  }
  if (context.existingFiles && Object.keys(context.existingFiles).length > 0) {
    parts.push('EXISTING FILES (modify, do not recreate from scratch):');
    for (const [rel, content] of Object.entries(context.existingFiles)) {
      parts.push(`--- ${rel} ---\n${content.slice(0, 6000)}`);
    }
  }
  if (context.vaultItems && context.vaultItems.length > 0) {
    parts.push('REUSABLE CODE PATTERNS FROM VAULT:');
    for (const item of context.vaultItems.slice(0, 5)) {
      parts.push(`// ${item.name}\n${item.code.slice(0, 2000)}`);
    }
  }
  if (context.recentBuilds && context.recentBuilds.length > 0) {
    parts.push(`RECENT BUILDS (extend these, do not recreate):\n${context.recentBuilds.map(b => `- ${b}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

function parseLocalBuildResponse(text: string, root: string): Array<{ path: string; content: string; isNew: boolean }> {
  const files: Array<{ path: string; content: string; isNew: boolean }> = [];
  const xmlFileRe = /<file\s+path="([^"]+)">[\s\S]*?<content>\n?([\s\S]*?)\n?<\/content>[\s\S]*?<\/file>/g;
  let m: RegExpExecArray | null;
  while ((m = xmlFileRe.exec(text)) !== null) {
    // [FIX] Strip project-name prefix if AI echoes it (e.g. "react-todo-app/index.html" → "index.html")
    const slug = path.basename(root);
    const rawPath = m[1].trim().replace(/^\.?\//, '');
    const relPath = rawPath.startsWith(slug + '/') ? rawPath.slice(slug.length + 1) : rawPath;
    const content = m[2].trimEnd();
    if (relPath && content) {
      const { existsSync } = require('fs') as typeof import('fs');
      const isNew = !existsSync(path.join(root, relPath));
      files.push({ path: relPath, content, isNew });
    }
  }
  return files;
}

function createFetch() {
  return async (url: string, options: RequestInit) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) { clearTimeout(id); throw e; }
  };
}

export async function runLocalBuild(
  task: string,
  root: string,
  context: CloudBuildContext,
  deps: BuildRequestDeps,
  onProgress?: (msg: string) => void,
): Promise<CloudBuildResult> {
  const keys = collectKeys();
  const prompt = buildLocalPrompt(task, context);
  const availableProviders = PROVIDER_ORDER.filter(p => keys[p]);

  if (availableProviders.length === 0) {
    return { success: false, error: 'No AI keys configured. Add a key in Redivivus settings to build locally.', failureSource: 'local-fallback' };
  }

  const providerLabel: Record<string, string> = { claude: 'Claude', gemini: 'Gemini', openai: 'GPT-4o', groq: 'Groq (Llama)', xai: 'Grok', kimi: 'Kimi' };

  for (const provider of availableProviders) {
    try {
      console.log(`[Redivivus] Local fallback: trying provider=${provider}`);
      onProgress?.(`Building with ${providerLabel[provider] || provider} (cloud unavailable)...`);
      // [WARN] createFetch clears timeout on response headers, not body — AI streaming can hang.
      // Wrap in Promise.race to enforce a hard 150s ceiling across the full provider call.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Local build timed out after 150s')), 150_000));
      const response = await Promise.race([
        callProvider(provider, prompt, createFetch(), undefined, undefined, undefined, SYSTEM),
        timeout,
      ]);
      if (!response.text || response.text.length < 50) { continue; }

      const files = parseLocalBuildResponse(response.text, root);
      if (files.length === 0) {
        console.warn(`[Redivivus] Local fallback: ${provider} returned no parseable file blocks`);
        continue;
      }

      console.log(`[Redivivus] Local fallback: ${provider} returned ${files.length} file(s)`);
      const label = providerLabel[provider] || provider;
      const data = {
        files,
        narration: `**Builder:** ${label} (your local key) generated all code directly\n**Cloud:** Unavailable (server error — local fallback activated)\n**Cost:** $0.00 (used your own API key)`,
        model: label,
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
      };
      return await processBuildResults(data, task, root, deps,
        { source: 'local-fallback', provider, vaultItemNames: context.vaultItems?.map(v => v.name) });
    } catch (err: any) {
      console.warn(`[Redivivus] Local fallback: ${provider} failed — ${err?.message}`);
    }
  }

  return { success: false, error: 'Local build failed — all AI providers returned errors. Check your API keys in settings.', failureSource: 'local-fallback' };
}
