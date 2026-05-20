// [SCOPE] Global User Memory Service -- persistent cross-project preferences and learned patterns.
// Storage: ~/.chassis/user_memory.json (global, not per-project)
// Learning: ZERO AI tokens. All learning is passive via observation or explicit "remember" commands.
// Injection: ~30 tokens prepended to AI prompts when relevant.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface UserMemory {
  style: {
    indent: string;        // '2spaces' | '4spaces' | 'tabs'
    semicolons: boolean;
    quotes: string;        // 'single' | 'double'
    trailingComma: boolean;
  };
  stack: {
    languages: Record<string, number>;  // language -> file count observed
    frameworks: string[];               // detected frameworks
    css: string;                        // 'tailwind' | 'css-modules' | 'plain' | ''
  };
  preferences: {
    defaultAI: string;
    buildMode: string;    // 'plan' | 'direct'
    verbose: boolean;     // user likes detailed explanations
  };
  explicit: string[];     // User-stated preferences: "always use functional components"
  stats: {
    projectsCreated: number;
    totalBuilds: number;
    totalFixes: number;
    firstSeen: string;    // ISO date
    lastSeen: string;     // ISO date
  };
}

const MEMORY_DIR = path.join(os.homedir(), '.chassis');
const MEMORY_PATH = path.join(MEMORY_DIR, 'user_memory.json');

const DEFAULT_MEMORY: UserMemory = {
  style: { indent: '2spaces', semicolons: true, quotes: 'single', trailingComma: false },
  stack: { languages: {}, frameworks: [], css: '' },
  preferences: { defaultAI: '', buildMode: '', verbose: false },
  explicit: [],
  stats: { projectsCreated: 0, totalBuilds: 0, totalFixes: 0, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() },
};

/**
 * Load user memory from disk. Returns defaults if file doesn't exist.
 */
export function loadUserMemory(): UserMemory {
  try {
    if (!fs.existsSync(MEMORY_PATH)) { return { ...DEFAULT_MEMORY }; }
    const raw = fs.readFileSync(MEMORY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    // Merge with defaults to handle schema evolution
    return { ...DEFAULT_MEMORY, ...parsed, style: { ...DEFAULT_MEMORY.style, ...parsed.style }, stack: { ...DEFAULT_MEMORY.stack, ...parsed.stack }, preferences: { ...DEFAULT_MEMORY.preferences, ...parsed.preferences }, stats: { ...DEFAULT_MEMORY.stats, ...parsed.stats } };
  } catch { return { ...DEFAULT_MEMORY }; }
}

/**
 * Save user memory to disk.
 */
export function saveUserMemory(memory: UserMemory): void {
  try {
    if (!fs.existsSync(MEMORY_DIR)) { fs.mkdirSync(MEMORY_DIR, { recursive: true }); }
    memory.stats.lastSeen = new Date().toISOString();
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf-8');
  } catch {}
}

/**
 * Passive learning: observe a file and learn style preferences (0 AI tokens).
 */
export function learnFromFile(filePath: string, content: string): void {
  const memory = loadUserMemory();
  const ext = path.extname(filePath).toLowerCase();

  // Track language usage
  const langMap: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.py': 'python', '.go': 'go', '.rs': 'rust', '.rb': 'ruby', '.java': 'java',
    '.html': 'html', '.css': 'css', '.scss': 'scss',
  };
  const lang = langMap[ext];
  if (lang) { memory.stack.languages[lang] = (memory.stack.languages[lang] || 0) + 1; }

  // Detect indent style from first 20 lines
  const lines = content.split('\n').slice(0, 20);
  const indented = lines.filter(l => l.startsWith(' ') || l.startsWith('\t'));
  if (indented.length > 3) {
    const tabCount = indented.filter(l => l.startsWith('\t')).length;
    const twoSpace = indented.filter(l => l.match(/^  \S/)).length;
    const fourSpace = indented.filter(l => l.match(/^    \S/)).length;
    if (tabCount > indented.length / 2) { memory.style.indent = 'tabs'; }
    else if (fourSpace > twoSpace) { memory.style.indent = '4spaces'; }
    else { memory.style.indent = '2spaces'; }
  }

  // Detect quote style in JS/TS
  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    const singleCount = (content.match(/'/g) || []).length;
    const doubleCount = (content.match(/"/g) || []).length;
    memory.style.quotes = singleCount > doubleCount ? 'single' : 'double';
    memory.style.semicolons = (content.match(/;\s*$/gm) || []).length > 5;
  }

  // Detect frameworks
  if (content.includes('from \'react\'') || content.includes('from "react"')) { addUnique(memory.stack.frameworks, 'react'); }
  if (content.includes('from \'vue\'') || content.includes('from "vue"')) { addUnique(memory.stack.frameworks, 'vue'); }
  if (content.includes('from \'@angular')) { addUnique(memory.stack.frameworks, 'angular'); }
  if (content.includes('from \'svelte\'')) { addUnique(memory.stack.frameworks, 'svelte'); }
  if (content.includes('tailwind') || content.includes('@apply')) { memory.stack.css = 'tailwind'; }
  if (content.includes('.module.css') || content.includes('.module.scss')) { memory.stack.css = 'css-modules'; }

  saveUserMemory(memory);
}

/**
 * Explicit learning: user says "remember that X" (0 AI tokens).
 */
export function rememberExplicit(statement: string): void {
  const memory = loadUserMemory();
  const clean = statement.replace(/^remember\s+(?:that\s+)?/i, '').trim();
  if (clean && !memory.explicit.includes(clean)) {
    memory.explicit.push(clean);
    if (memory.explicit.length > 50) { memory.explicit = memory.explicit.slice(-50); }
  }
  saveUserMemory(memory);
}

/**
 * Detect "remember that..." pattern in user message.
 * Returns the statement if matched, null otherwise.
 */
export function detectRememberIntent(text: string): string | null {
  const m = text.match(/^(?:remember|note|save|store|keep in mind)\s+(?:that\s+)?(.+)/i);
  return m ? m[1].trim() : null;
}

/**
 * Record a build event (0 tokens -- just increment counter).
 */
export function recordBuild(): void {
  const memory = loadUserMemory();
  memory.stats.totalBuilds++;
  saveUserMemory(memory);
}

/**
 * Record a fix event (0 tokens).
 */
export function recordFix(): void {
  const memory = loadUserMemory();
  memory.stats.totalFixes++;
  saveUserMemory(memory);
}

/**
 * Build compact AI prompt injection (~30 tokens).
 * Only includes non-default preferences to minimize token usage.
 */
export function buildPromptInjection(): string {
  const memory = loadUserMemory();
  const parts: string[] = [];

  // Style
  if (memory.style.indent !== '2spaces') { parts.push(`indent:${memory.style.indent}`); }
  if (!memory.style.semicolons) { parts.push('no-semicolons'); }
  if (memory.style.quotes === 'double') { parts.push('double-quotes'); }

  // Stack
  const topLangs = Object.entries(memory.stack.languages).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([l]) => l);
  if (topLangs.length > 0) { parts.push(`langs:${topLangs.join(',')}`); }
  if (memory.stack.frameworks.length > 0) { parts.push(`fw:${memory.stack.frameworks.slice(0, 2).join(',')}`); }
  if (memory.stack.css) { parts.push(`css:${memory.stack.css}`); }

  // Explicit
  if (memory.explicit.length > 0) {
    parts.push(`prefs:${memory.explicit.slice(-3).join('; ')}`);
  }

  if (parts.length === 0) { return ''; }
  return `[USER_PROFILE: ${parts.join(' | ')}]`;
}

/**
 * Get memory for display in the Profile panel.
 */
export function getMemoryForDisplay(): UserMemory {
  return loadUserMemory();
}

/**
 * Update a specific field in user memory (for the editable profile UI).
 */
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

/**
 * Remove an explicit preference by index.
 */
export function removeExplicit(index: number): void {
  const memory = loadUserMemory();
  if (index >= 0 && index < memory.explicit.length) {
    memory.explicit.splice(index, 1);
    saveUserMemory(memory);
  }
}

// --- Internal ---

function addUnique(arr: string[], val: string): void {
  if (!arr.includes(val)) { arr.push(val); }
}
