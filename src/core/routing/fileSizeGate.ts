// [SCOPE] File Size Gate — intercepts oversized files before fix pipeline fires AI calls.
// Implements Part A-E of the File Size Gate specification.
// Thresholds: Advisory at 30KB, Hard gate at 50KB. [FIX] Raised after Worker token limits increased.

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { fixLog } from '../../services/logging/fixPipelineLogger';

/** File size thresholds for the gate.
 * [FIX] Raised from 10KB/15KB to 30KB/50KB — Worker token limits raised to provider maximums,
 * so we can now reliably handle larger files without truncation.
 */
export const FILE_SIZE_THRESHOLDS = {
  ADVISORY_KB: 30,
  GATE_KB: 50,
  ADVISORY_BYTES: 30 * 1024,
  GATE_BYTES: 50 * 1024,
  SPLIT_TARGET_LINES: 150,
  SPLIT_MAX_LINES: 200,
} as const;

/** Format bytes to human-readable string. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} bytes`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)}KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Check if any file exceeds the gate threshold. */
export function checkFileSizes(
  files: { rel: string; content: string }[]
): { gateTriggered: boolean; advisoryTriggered: boolean; oversizedFiles: { rel: string; size: number }[] } {
  const oversizedFiles: { rel: string; size: number }[] = [];
  let gateTriggered = false;
  let advisoryTriggered = false;

  for (const file of files) {
    const size = file.content.length;
    if (size > FILE_SIZE_THRESHOLDS.GATE_BYTES) {
      oversizedFiles.push({ rel: file.rel, size });
      gateTriggered = true;
    } else if (size > FILE_SIZE_THRESHOLDS.ADVISORY_BYTES) {
      advisoryTriggered = true;
    }
  }

  return { gateTriggered, advisoryTriggered, oversizedFiles };
}

/** Pending file size gate resolvers waiting for user choice. */
const _pendingFileSizeGates = new Map<string, (choice: 'split' | 'anyway' | 'show' | 'cancel') => void>();

/** Wait for user choice from the file size gate UI. */
export async function awaitFileSizeGate(
  deps: MessageHandlerDeps,
  oversizedFiles: { rel: string; size: number }[]
): Promise<'split' | 'anyway' | 'show' | 'cancel'> {
  const gateId = `filesize-${Date.now()}`;

  fixLog('[FILE_SIZE_GATE] Showing gate UI', { files: oversizedFiles.map(f => f.rel), sizes: oversizedFiles.map(f => f.size) });

  const choice = await new Promise<'split' | 'anyway' | 'show' | 'cancel'>((resolve) => {
    _pendingFileSizeGates.set(gateId, resolve);

    // Send message to webview to show the gate
    deps.panel.webview.postMessage({
      type: 'show-filesize-gate',
      gateId,
      files: oversizedFiles.map(f => ({ rel: f.rel, size: formatFileSize(f.size) })),
    });

    // Safety timeout — auto-cancel after 10 min
    setTimeout(() => {
      if (_pendingFileSizeGates.has(gateId)) {
        _pendingFileSizeGates.delete(gateId);
        resolve('cancel');
      }
    }, 10 * 60 * 1000);
  });

  fixLog('[FILE_SIZE_GATE] User choice', { choice });
  return choice;
}

/** Handle webview response for file size gate choice. */
export function handleFileSizeGateResponse(message: { gateId: string; choice: 'split' | 'anyway' | 'show' | 'cancel' }): void {
  const resolver = _pendingFileSizeGates.get(message.gateId);
  if (resolver) {
    _pendingFileSizeGates.delete(message.gateId);
    resolver(message.choice);
  }
}

/** Run the file size gate check and return true if we should abort the fix. */
export async function runFileSizeGate(
  sourceFiles: { rel: string; content: string }[],
  deps: MessageHandlerDeps
): Promise<{ shouldAbort: boolean; forceSurgical: boolean; oversizedFiles: { rel: string; size: number }[] }> {
  const { gateTriggered, advisoryTriggered, oversizedFiles } = checkFileSizes(sourceFiles);

  // Advisory only — log but proceed
  if (!gateTriggered && advisoryTriggered) {
    fixLog('[FILE_SIZE_GATE] Advisory: some files over 30KB', { files: sourceFiles.filter(f => f.content.length > FILE_SIZE_THRESHOLDS.ADVISORY_BYTES).map(f => f.rel) });
    return { shouldAbort: false, forceSurgical: false, oversizedFiles: [] };
  }

  // Hard gate triggered — show UI and wait for user choice
  if (gateTriggered) {
    fixLog('[FILE_SIZE_GATE] HARD GATE: files over 50KB detected', { oversizedFiles });

    const choice = await awaitFileSizeGate(deps, oversizedFiles);

    if (choice === 'cancel') {
      deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
      return { shouldAbort: true, forceSurgical: false, oversizedFiles };
    }

    if (choice === 'anyway') {
      // User wants to try anyway — force surgical format
      return { shouldAbort: false, forceSurgical: true, oversizedFiles };
    }

    if (choice === 'split') {
      // Return with flag to trigger split flow
      return { shouldAbort: false, forceSurgical: false, oversizedFiles, triggerSplit: true } as any;
    }

    if (choice === 'show') {
      // Show analysis (TODO: implement in future)
      deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
      return { shouldAbort: true, forceSurgical: false, oversizedFiles };
    }
  }

  return { shouldAbort: false, forceSurgical: false, oversizedFiles: [] };
}

/** Check if Worker output is truncated and block write if so. */
export function isTruncatedOutput(text: string): boolean {
  // Check for obvious truncation indicators
  if (!text || text.length < 100) { return false; }

  // Ends mid-line without proper closing
  const lastChars = text.slice(-100);
  const lastLine = lastChars.split('\n').pop() || '';

  // Common truncation patterns
  const truncationIndicators = [
    /const\s+\w+\s*=$/,                    // Ends with "const x ="
    /let\s+\w+\s*=$/,                      // Ends with "let x ="
    /var\s+\w+\s*=$/,                      // Ends with "var x ="
    /function\s+\w+\s*\([^)]*$/,           // Ends mid-function signature
    /if\s*\([^)]*$/,                        // Ends mid-if condition
    /for\s*\([^)]*$/,                       // Ends mid-for loop
    /while\s*\([^)]*$/,                     // Ends mid-while loop
    /\.then\s*\([^)]*$/,                    // Ends mid-promise chain
    /\.catch\s*\([^)]*$/,                   // Ends mid-catch
    /[\w\.]\s*\+$/,                         // Ends with partial expression
    /\{\s*$/,                               // Ends with open brace
    /\(\s*$/,                               // Ends with open paren
    /,\s*$/,                                // Ends with trailing comma
    /\|\|\s*$/,                             // Ends with operator
    /&&\s*$/,                               // Ends with operator
    /===?\s*$/,                             // Ends with comparison
  ];

  for (const pattern of truncationIndicators) {
    if (pattern.test(lastLine)) { return true; }
  }

  // Check if XML content is missing closing tags
  if (text.includes('<file') && text.includes('<content>') && !text.includes('</content>')) {
    return true;
  }

  // Check if file ends mid-statement (truncated mid-word or mid-expression)
  const lastNonEmptyLine = text.split('\n').reverse().find(l => l.trim().length > 0) || '';
  const validEndings = [';', '}', ')', ']', '"', "'", '`', '*/', '---', 'EOF'];
  const endsCleanly = validEndings.some(e => lastNonEmptyLine.trimEnd().endsWith(e));
  if (!endsCleanly && lastNonEmptyLine.trim().length > 0) {
    return true;
  }

  // Check if code block is missing closing backticks
  const codeBlockOpens = (text.match(/```[a-z]*\n/g) || []).length;
  const codeBlockCloses = (text.match(/\n```/g) || []).length;
  if (codeBlockOpens > codeBlockCloses) { return true; }

  return false;
} 
