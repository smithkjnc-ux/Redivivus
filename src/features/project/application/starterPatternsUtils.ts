// [SCOPE] Starter Patterns utilities — makeItem factory + utility category patterns
// Imported by starterPatterns.ts. Extracted to keep it under 200 lines.

import * as crypto from 'crypto';
import type { VaultItem, VaultCategory } from '../../vault/infrastructure/vaultTypes.js';

export function makeItem(
  name: string, code: string, language: string,
  category: VaultCategory, description: string, tags: string[]
): VaultItem {
  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
  return {
    id: hash, name, code, language, category, description,
    sourceProject: 'redivivus-starter', sourceFile: 'starterPatterns.ts',
    tags, lineCount: code.split('\n').length,
    importCount: 0, createdAt: new Date().toISOString(), contentHash: hash,
  };
}

export function getDOMPatterns(): VaultItem[] {
  return [
    makeItem('$', `const $ = (sel, ctx = document) => ctx.querySelector(sel);\nconst $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];`,
      'js', 'utility', 'Shorthand querySelector helpers -- $ and $$ without a library', ['dom', 'query', 'selector', 'utility']),
    makeItem('onEvent', `function on(el, event, fn, opts) {\n  el.addEventListener(event, fn, opts);\n  return () => el.removeEventListener(event, fn, opts);\n}`,
      'js', 'utility', 'Add event listener and return a cleanup/unlisten function', ['dom', 'events', 'listener', 'cleanup']),
    makeItem('toggleClass', `function toggleClass(el, cls, force) {\n  if (typeof force === 'boolean') { el.classList[force ? 'add' : 'remove'](cls); }\n  else { el.classList.toggle(cls); }\n  return el;\n}`,
      'js', 'utility', 'Toggle, force-add, or force-remove a CSS class on a DOM element', ['dom', 'class', 'css', 'toggle']),
  ];
}

export function getStoragePatterns(): VaultItem[] {
  return [
    makeItem('localStore', `const localStore = {\n  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; } },\n  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },\n  remove(key) { localStorage.removeItem(key); },\n  clear() { localStorage.clear(); },\n};`,
      'js', 'utility', 'localStorage wrapper with JSON parse/stringify and safe error handling', ['storage', 'localstorage', 'persistence', 'json']),
  ];
}

export function getStringPatterns(): VaultItem[] {
  return [
    makeItem('capitalize', `function capitalize(str) {\n  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();\n}`,
      'js', 'utility', 'Capitalize first letter of a string', ['string', 'format', 'text']),
    makeItem('truncate', `function truncate(str, max, ellipsis = '...') {\n  return str.length <= max ? str : str.slice(0, max - ellipsis.length) + ellipsis;\n}`,
      'js', 'utility', 'Truncate a string to max length with optional custom ellipsis', ['string', 'truncate', 'format']),
    makeItem('sleep', `const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));`,
      'js', 'utility', 'Promise-based sleep -- await sleep(500) pauses for ms milliseconds', ['sleep', 'delay', 'async', 'promise']),
    makeItem('chunk', `function chunk(arr, size) {\n  const result = [];\n  for (let i = 0; i < arr.length; i += size) { result.push(arr.slice(i, i + size)); }\n  return result;\n}`,
      'js', 'utility', 'Split an array into chunks of a fixed size', ['array', 'chunk', 'split', 'batch']),
    makeItem('unique', `const unique = (arr) => [...new Set(arr)];\nconst uniqueBy = (arr, keyFn) => [...new Map(arr.map(x => [keyFn(x), x])).values()];`,
      'js', 'utility', 'Remove duplicates from array -- unique() by value, uniqueBy() by key function', ['array', 'unique', 'dedupe', 'filter']),
  ];
}

export function getUtilityPatterns(): VaultItem[] {
  return [
    makeItem('debounce', `
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}`.trim(), 'js', 'utility', 'Debounce -- delays function execution until after wait ms have elapsed', ['debounce', 'performance', 'events']),

    makeItem('throttle', `
function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}`.trim(), 'js', 'utility', 'Throttle -- limits function to fire at most once per limit ms', ['throttle', 'performance', 'events']),

    makeItem('deepClone', `
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') { return obj; }
  if (obj instanceof Date) { return new Date(obj.getTime()); }
  if (Array.isArray(obj)) { return obj.map(deepClone); }
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, deepClone(v)]));
}`.trim(), 'js', 'utility', 'Deep clone an object without external libraries', ['clone', 'deep-copy', 'object']),

    makeItem('slugify', `
function slugify(str) {
  return str.toLowerCase().trim()
    .replace(/[^a-z0-9\\s-]/g, '')
    .replace(/[\\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}`.trim(), 'js', 'utility', 'Convert a string to a URL-safe slug', ['slug', 'url', 'string', 'format']),

    makeItem('formatBytes', `
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) { return '0 Bytes'; }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}`.trim(), 'js', 'utility', 'Format byte count to human-readable string (KB, MB, GB)', ['bytes', 'format', 'filesize']),
  ];
}
