// [SCOPE] Fix pipeline helpers -- parseFixResponse, takeSnapshot, collectSourceFiles,
//         readProjectDeadEnds, appendProjectDeadEnd, getRecentBuildContext,
//         readProjectRules, writeProjectRoadmapEntry.
// Extracted from chatPanelMsgFix.ts (200-line split).
// parseFixResponse filters to allowedRels only -- prevents Worker from creating phantom files.
// Dead-end helpers read/write <project>/.redivivus/dead_ends.md so the Supervisor never repeats
// approaches that have already been tried and failed in this project.
// getRecentBuildContext implements Rule 17: causation-first debugging via build_history.json.
// writeProjectRoadmapEntry logs AI-made file changes to the project's REDIVIVUS_ROADMAP.md.

import * as fs from 'fs';
import * as path from 'path';
import { SnapshotService } from '../../services/snapshotService';
import { listSourceFiles } from '../../services/workspace/codebaseSearch';
import { fixLog } from '../../services/logging/fixPipelineLogger.js';

/** Maps raw model ID strings to friendly display names for chat messages. */
export function modelLabel(model: string): string {
  const m = (model || '').toLowerCase();
  if (m.includes('claude')) { return 'Claude'; }
  if (m.includes('gemini')) { return 'Gemini'; }
  if (m.includes('gpt') || m.includes('openai')) { return 'GPT-4o'; }
  if (m.includes('llama') || m === 'groq') { return 'Groq'; }
  if (m.includes('grok') || m === 'xai') { return 'Grok'; }
  if (m.includes('kimi') || m.includes('moonshot')) { return 'Kimi'; }
  return model || 'AI';
}


/** Parse Worker fix blocks. Only returns fixes whose paths are in allowedRels.
 *  Phantom files (paths not in the original source list) are collected in skipped[]. */
export function parseFixResponse(
  text: string,
  root: string,
  allowedRels: Set<string>,
): { fixes: { rel: string; abs: string; content: string }[]; skipped: string[] } {
  const all: { rel: string; abs: string; content: string }[] = [];
  
  // [DEBUG] Log what we're trying to parse
  fixLog(`[PARSE] Input text length: ${text.length}, first 200 chars: ${text.substring(0, 200).replace(/\n/g, '\\n')}`);
  fixLog(`[PARSE] Last 200 chars: ${text.substring(text.length - 200).replace(/\n/g, '\\n')}`);
  
  // 1. XML Structured Format
  // [FIX] Made whitespace matching more permissive — Worker may output content on same line as tag
  const xmlFileRe = /<file\s+path="([^"]+)">[\s\S]*?<content>\s*([\s\S]*?)\s*<\/content>[\s\S]*?<\/file>/g;
  let xmlMatch: RegExpExecArray | null;
  let xmlMatches = 0;
  while ((xmlMatch = xmlFileRe.exec(text)) !== null) {
    xmlMatches++;
    const rel = xmlMatch[1].trim().replace(/^\.?\//, '');
    const content = xmlMatch[2].trimEnd();
    fixLog(`[PARSE] XML match #${xmlMatches}: path="${rel}", content length=${content.length}`);
    if (rel && content) { all.push({ rel, abs: path.join(root, rel), content }); }
  }
  fixLog(`[PARSE] XML regex found ${xmlMatches} matches, ${all.length} valid fixes`);
  
  // [FIX] Handle TRUNCATED XML: if we see <file path="..."><content> but no closing tags,
  // extract everything from after <content> to end of text
  if (all.length === 0 && text.includes('<file') && text.includes('<content>') && !text.includes('</content>')) {
    const truncatedMatch = text.match(/<file\s+path="([^"]+)"[^>]*>[\s\S]*?<content>\s*([\s\S]*)/);
    if (truncatedMatch) {
      const rel = truncatedMatch[1].trim().replace(/^\.?\//, '');
      const content = truncatedMatch[2].trimEnd();
      fixLog(`[PARSE] TRUNCATED XML detected: path="${rel}", content length=${content.length}`);
      if (rel && content) { all.push({ rel, abs: path.join(root, rel), content }); }
    }
  }

  // 2. Legacy fallback: ## Fix: header format
  if (all.length === 0) {
    const fixPattern = /^## Fix:\s*(.+?)\s*\n```[a-z]*\n([\s\S]*?)```/gm;
    let match: RegExpExecArray | null;
    while ((match = fixPattern.exec(text)) !== null) {
      const rel = match[1].trim().replace(/^\.?\//, '');
      const content = match[2].trimEnd();
      if (rel && content) { all.push({ rel, abs: path.join(root, rel), content }); }
    }
    if (all.length === 0) {
      const alt = /^## Fix:\s*(.+?)\s*\n([\s\S]*?)(?=^## Fix:|$)/gm;
      while ((match = alt.exec(text)) !== null) {
        const rel = match[1].trim().replace(/^\.?\//, '');
        const content = match[2].replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trimEnd();
        if (rel && content && content.length > 10) { all.push({ rel, abs: path.join(root, rel), content }); }
      }
    }
  }

  // 3. FULL FILE markdown format: ### filename.js or ## filename.js followed by code block
  // This catches Worker output that uses standard markdown headers instead of '## Fix:'
  if (all.length === 0) {
    // Pattern: ### filename.js or ## filename.js (without 'Fix:' prefix) followed by code block
    const mdHeaderPattern = /^#{2,4}\s+(?!Fix:)([^\n]+\.\w+)\s*\n```[a-z]*\n([\s\S]*?)```/gm;
    let match: RegExpExecArray | null;
    while ((match = mdHeaderPattern.exec(text)) !== null) {
      const rel = match[1].trim().replace(/^\.?\//, '');
      const content = match[2].trimEnd();
      if (rel && content) { all.push({ rel, abs: path.join(root, rel), content }); }
    }
  }

  // 4. File path mention followed by code block (most permissive fallback)
  // Catches patterns like "game.js:
  // ```js
  // ...
  // ```"
  if (all.length === 0) {
    const fileMentionPattern = /(?:^|\n)([\w\-./]+\.\w{1,6}):?\s*\n```[a-z]*\n([\s\S]*?)```/gm;
    let match: RegExpExecArray | null;
    while ((match = fileMentionPattern.exec(text)) !== null) {
      const rel = match[1].trim().replace(/^\.?\//, '');
      const content = match[2].trimEnd();
      if (rel && content) { all.push({ rel, abs: path.join(root, rel), content }); }
    }
  }

  // [FIX] Rule 9 Modularity: allow Worker to create NEW files (e.g. splitting a monolith), 
  // but strictly block path traversal or absolute paths to prevent escaping the workspace.
  const isSafeNewFile = (f: { rel: string; abs: string }) => {
    return !f.rel.includes('..') && !path.isAbsolute(f.rel) && f.abs.startsWith(root);
  };

  const fixes = all.filter(f => allowedRels.has(f.rel) || isSafeNewFile(f));
  const skipped = all.filter(f => !allowedRels.has(f.rel) && !isSafeNewFile(f)).map(f => f.rel);
  return { fixes, skipped };
}

/** Snapshot files before an AI fix. Uses SnapshotService so Build History panel can undo fixes. Returns snapshot ID. */
export function takeSnapshot(root: string, relPaths: string[], task?: string): string {
  try { return new SnapshotService(root).prepare(task ? `[FIX] ${task.slice(0, 80)}` : 'fix', relPaths); } catch { return ''; }
}

// [FIX] Smart file selection: when userText is provided, send only files relevant to the bug
// rather than all 50 source files. Mentioned files + their importers come first; others fill to 12.
// When no userText or project is tiny (<= 15 files), returns all files as before.
// [FIX] Include src/ folder files and content-matched files, not just filename mentions.
// [FIX] Prioritize files with [SCOPE] or [ANNOTATION] tags - they have self-documenting info.
export function collectSourceFiles(root: string, userText?: string): { rel: string; content: string }[] {
  const all = listSourceFiles(root, true, 50)
    .filter(f => f.content)
    .map(f => ({ rel: f.rel, content: f.content! }));
  if (!userText || all.length <= 15) { return all; }
  const textLower = userText.toLowerCase();

  // Include files whose basename is mentioned in user text
  const mentioned = all.filter(f => textLower.includes(path.basename(f.rel).toLowerCase()));
  const mentionedSet = new Set(mentioned.map(f => f.rel));

  // Include files in src/ folder (likely contains core logic)
  const srcFiles = all.filter(f => f.rel.startsWith('src/') && !mentionedSet.has(f.rel));
  const srcSet = new Set(srcFiles.map(f => f.rel));

  // Include files whose CONTENT contains keywords from user text (semantic match)
  const keywords = textLower.split(/\s+/).filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'they', 'have', 'were', 'been', 'have', 'game', 'make', 'code', 'file'].includes(w));
  const contentMatched = all.filter(f => !mentionedSet.has(f.rel) && !srcSet.has(f.rel) && keywords.some(k => f.content.toLowerCase().includes(k)));
  const contentMatchedSet = new Set(contentMatched.map(f => f.rel));

  // Files that import the mentioned files
  const importers = all.filter(f => !mentionedSet.has(f.rel) && !srcSet.has(f.rel) && mentioned.some(m => f.content.includes(path.basename(m.rel, path.extname(m.rel)))));
  const importersSet = new Set(importers.map(f => f.rel));

  // [Redivivus CORE] Prioritize files with ANNOTATIONS - they have [SCOPE]/[ANNOTATION] tags
  const hasAnnotations = (f: {content: string}) => /\[?(?:SCOPE|ANNOTATION|TODO|WARN|DONE)\]?\s*[:\-]/.test(f.content);
  const annotatedFiles = all.filter(f => !mentionedSet.has(f.rel) && !srcSet.has(f.rel) && !contentMatchedSet.has(f.rel) && !importersSet.has(f.rel) && hasAnnotations(f));

  const selected = [...mentioned, ...srcFiles, ...contentMatched, ...importers, ...annotatedFiles];
  if (selected.length >= 12) { return selected.slice(0, 12); }
  const rest = all.filter(f => !selected.some(s => s.rel === f.rel)).sort((a, b) => a.content.length - b.content.length);
  return [...selected, ...rest].slice(0, 12);
}


// [DONE] readProjectRules, getRecentBuildContext, getRecentBuildsContext moved to chatPanelMsgFixBuildCtx.ts (Rule 9 split)
export { readProjectRules, getRecentBuildContext, getRecentBuildsContext } from './chatPanelMsgFixBuildCtx.js';
export { writeProjectRoadmapEntry } from './chatPanelMsgFixRoadmap.js';

