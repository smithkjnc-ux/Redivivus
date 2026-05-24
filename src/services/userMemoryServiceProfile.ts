// [SCOPE] User memory profile helpers — extracted from userMemoryService.ts (Rule 9 split)
// Display, prompt injection, and update functions. Load/save stays in userMemoryService.ts.

import type { UserMemory } from './userMemoryService.js';
import { loadUserMemory, saveUserMemory } from './userMemoryService.js';

/** Build compact AI prompt injection (~30 tokens). Only includes non-default preferences. */
export function buildPromptInjection(): string {
  const memory = loadUserMemory();
  const parts: string[] = [];
  if (memory.style.indent !== '2spaces') { parts.push(`indent:${memory.style.indent}`); }
  if (!memory.style.semicolons) { parts.push('no-semicolons'); }
  if (memory.style.quotes === 'double') { parts.push('double-quotes'); }
  const topLangs = Object.entries(memory.stack.languages).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([l]) => l);
  if (topLangs.length > 0) { parts.push(`langs:${topLangs.join(',')}`); }
  if (memory.stack.frameworks.length > 0) { parts.push(`fw:${memory.stack.frameworks.slice(0, 2).join(',')}`); }
  if (memory.stack.css) { parts.push(`css:${memory.stack.css}`); }
  if (memory.explicit.length > 0) { parts.push(`prefs:${memory.explicit.slice(-3).join('; ')}`); }
  if (parts.length === 0) { return ''; }
  return `[USER_PROFILE: ${parts.join(' | ')}]`;
}

/** Get memory for display in the Profile panel. */
export function getMemoryForDisplay(): UserMemory {
  return loadUserMemory();
}

/** Update a specific field in user memory (for the editable profile UI). */
export function updateMemoryField(field: string, value: any): void {
  const memory = loadUserMemory();
  const parts = field.split('.');
  let target: any = memory;
  for (let i = 0; i < parts.length - 1; i++) {
    if (target[parts[i]] === undefined) { return; }
    target = target[parts[i]];
  }
  target[parts[parts.length - 1]] = value;
  saveUserMemory(memory);
}

/** Remove an explicit preference by index. */
export function removeExplicit(index: number): void {
  const memory = loadUserMemory();
  if (index >= 0 && index < memory.explicit.length) {
    memory.explicit.splice(index, 1);
    saveUserMemory(memory);
  }
}
