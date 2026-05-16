// [SCOPE] Clarification Service — when uncertain, ask user instead of guessing
// Forces explicit confirmation before proceeding with ambiguous requests

import * as vscode from 'vscode';
import type { RoutingService } from './ai/routingService.js';

export interface ClarificationRequest {
  question: string;
  options: { label: string; value: string; description?: string }[];
  allowFreeText: boolean;
  context: string; // What we're trying to clarify
}

export interface ClarificationResult {
  selected: string;
  freeText?: string;
}

// When multiple files could be the target, ask which one
export async function clarifyTargetFile(
  candidates: string[],
  task: string,
  postToWebview: (msg: any) => void
): Promise<string | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const options = candidates.slice(0, 5).map(file => ({
    label: file,
    value: file,
    description: getFileDescription(file),
  }));

  const clarification: ClarificationRequest = {
    question: `Which file should I modify for: "${task}"?`,
    options,
    allowFreeText: true,
    context: 'target_file',
  };

  // Send to webview for user selection
  postToWebview({
    type: 'show-clarification',
    clarification,
  });

  // Return null here — the actual response comes via message handler
  // The caller should pause and wait for the response
  return null;
}

// When intent is ambiguous (add vs modify vs create)
export async function clarifyIntent(
  task: string,
  postToWebview: (msg: any) => void
): Promise<string | null> {
  const clarification: ClarificationRequest = {
    question: `I'm not sure what you want to do with: "${task}"`,
    options: [
      { label: 'Create new file', value: 'create', description: 'Build something new' },
      { label: 'Modify existing', value: 'modify', description: 'Change existing code' },
      { label: 'Add to existing', value: 'add', description: 'Add feature to current file' },
      { label: 'Fix/refactor', value: 'fix', description: 'Repair or improve existing code' },
    ],
    allowFreeText: true,
    context: 'intent',
  };

  postToWebview({
    type: 'show-clarification',
    clarification,
  });

  return null;
}

// When we don't know what "this" or "it" refers to
export async function clarifyAmbiguousReference(
  reference: string,
  task: string,
  postToWebview: (msg: any) => void
): Promise<string | null> {
  const clarification: ClarificationRequest = {
    question: `When you say "${reference}", what do you mean?`,
    options: [],
    allowFreeText: true,
    context: 'ambiguous_reference',
  };

  postToWebview({
    type: 'show-clarification',
    clarification,
  });

  return null;
}

// [DONE] needsClarification regex replaced with AI classifier per Rule 18.
export async function needsClarification(
  task: string,
  candidates: string[],
  routing: RoutingService
): Promise<{ needsClarification: boolean; reason: string }> {
  // Structural fast-path: explicit file extension → unambiguous target, no clarification needed
  if (/\b[\w\-]+\.(html|ts|tsx|js|jsx|py|rs|go|css|scss)\b/.test(task)) {
    return { needsClarification: false, reason: '' };
  }
  // [RULE 18] AI classifier decides if the request is ambiguous given the candidate files
  try {
    const fileList = candidates.slice(0, 5).join(', ') || 'none';
    const prompt = `Task: "${task.slice(0, 200)}"\nCandidate files: ${fileList}\nIs it clear which file to modify, or is this request ambiguous? Reply with one word: clear or unclear`;
    const res = await routing.prompt(prompt, 12_000);
    if (res.success && res.text && res.text.trim().toLowerCase().startsWith('unclear')) {
      return { needsClarification: true, reason: `Ambiguous request across ${candidates.length} candidate file(s)` };
    }
  } catch { /* fall through */ }
  return { needsClarification: false, reason: '' };
}

function getFileDescription(file: string): string {
  if (file.endsWith('.html')) return 'HTML page';
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) return 'React component';
  if (file.endsWith('.ts')) return 'TypeScript module';
  if (file.endsWith('.js')) return 'JavaScript file';
  if (file.endsWith('.py')) return 'Python module';
  if (file.endsWith('.css') || file.endsWith('.scss')) return 'Stylesheet';
  return 'File';
}

// Main entry: check if we need clarification, if so ask, otherwise proceed
export async function ensureClarityBeforeBuild(
  task: string,
  candidates: string[],
  postToWebview: (msg: any) => void,
  routing: RoutingService
): Promise<{ canProceed: boolean; targetFile?: string }> {
  const check = await needsClarification(task, candidates, routing);

  if (!check.needsClarification) {
    return { canProceed: true, targetFile: candidates[0] };
  }

  // Show message that we're asking for clarification
  postToWebview({
    type: 'assistant-message',
    content: `⚠️ **Need clarification:** ${check.reason}\n\nPlease specify so I can help you correctly.`,
  });

  // Trigger clarification UI
  if (candidates.length > 1) {
    await clarifyTargetFile(candidates, task, postToWebview);
  } else {
    await clarifyIntent(task, postToWebview);
  }

  return { canProceed: false };
}
