// [SCOPE] Clarification Service — when uncertain, ask user instead of guessing
// Forces explicit confirmation before proceeding with ambiguous requests

import * as vscode from 'vscode';

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

// Detect if clarification is needed before proceeding
export function needsClarification(
  task: string,
  candidates: string[]
): { needsClarification: boolean; reason: string } {
  const taskLower = task.toLowerCase();

  // Ambiguous pronouns
  const ambiguousRefs = /\b(this|that|it|here|there)\b/;
  if (ambiguousRefs.test(taskLower) && candidates.length > 1) {
    return {
      needsClarification: true,
      reason: `Ambiguous reference "${taskLower.match(ambiguousRefs)?.[0]}" with ${candidates.length} possible files`,
    };
  }

  // No explicit file mentioned and multiple candidates
  const hasExplicitFile = /\b([\w\-]+\.(html|ts|tsx|js|jsx|py|rs|go|css|scss))\b/.test(task);
  if (!hasExplicitFile && candidates.length > 1) {
    return {
      needsClarification: true,
      reason: `No explicit file mentioned, ${candidates.length} candidates found`,
    };
  }

  // Unclear action (could be add OR modify)
  const hasAdd = /\badd\b/.test(taskLower);
  const hasModify = /\b(modify|update|change|fix)\b/.test(taskLower);
  if (hasAdd && !hasModify && candidates.length > 0) {
    // "Add" could mean "add new file" or "add to existing"
    return {
      needsClarification: true,
      reason: 'Unclear if "add" means new file or add to existing',
    };
  }

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
  postToWebview: (msg: any) => void
): Promise<{ canProceed: boolean; targetFile?: string }> {
  const check = needsClarification(task, candidates);

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
