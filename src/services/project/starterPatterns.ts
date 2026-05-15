// [SCOPE] Curated starter patterns shipped with CHASSIS — hand-verified, zero AI variance.
// These seed the vault on first install so every user gets quality reference patterns from day one.
// Categories: component, utility, api, auth, algorithm, pattern, error, validation, network, config
// [WARN] All patterns here must be verified working before adding. Test before committing.
// [NEXT] Add patterns per category as they are validated: React hooks, Python utils, CLI tools

import * as crypto from 'crypto';
import { VaultItem, VaultCategory } from '../vault/vaultTypes.js';

function makeItem(
  name: string, code: string, language: string,
  category: VaultCategory, description: string, tags: string[]
): VaultItem {
  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
  return {
    id: hash, name, code, language, category, description,
    sourceProject: 'chassis-starter', sourceFile: 'starterPatterns.ts',
    tags, lineCount: code.split('\n').length,
    importCount: 0, createdAt: new Date().toISOString(), contentHash: hash,
  };
}

export function getStarterPatterns(): VaultItem[] {
  return [

    // ── Utility ──────────────────────────────────────────────────────────────
    makeItem('debounce', `
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}`.trim(), 'js', 'utility', 'Debounce — delays function execution until after wait ms have elapsed', ['debounce', 'performance', 'events']),

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
}`.trim(), 'js', 'utility', 'Throttle — limits function to fire at most once per limit ms', ['throttle', 'performance', 'events']),

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

    // ── API ──────────────────────────────────────────────────────────────────
    makeItem('fetchWithRetry', `
async function fetchWithRetry(url, options = {}, retries = 3, backoff = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res;
    } catch (err) {
      if (i === retries - 1) { throw err; }
      await new Promise(r => setTimeout(r, backoff * Math.pow(2, i)));
    }
  }
}`.trim(), 'js', 'api', 'Fetch with exponential backoff retry', ['fetch', 'retry', 'api', 'network', 'backoff']),

    makeItem('apiClient', `
const apiClient = {
  baseUrl: '',
  headers: { 'Content-Type': 'application/json' },
  async get(path) {
    const res = await fetch(this.baseUrl + path, { headers: this.headers });
    if (!res.ok) { throw new Error('GET ' + path + ' failed: ' + res.status); }
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(this.baseUrl + path, {
      method: 'POST', headers: this.headers, body: JSON.stringify(body),
    });
    if (!res.ok) { throw new Error('POST ' + path + ' failed: ' + res.status); }
    return res.json();
  },
};`.trim(), 'js', 'api', 'Minimal API client with GET/POST and error handling', ['api', 'client', 'fetch', 'rest']),

    // ── Auth ─────────────────────────────────────────────────────────────────
    makeItem('parseJwt', `
function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}`.trim(), 'js', 'auth', 'Parse JWT payload client-side (no verification)', ['jwt', 'auth', 'token', 'decode']),

    makeItem('generateToken', `
const crypto = require('crypto');
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}`.trim(), 'js', 'auth', 'Generate a cryptographically secure random token', ['token', 'auth', 'crypto', 'random']),

    // ── Algorithm ─────────────────────────────────────────────────────────────
    makeItem('binarySearch', `
function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === target) { return mid; }
    if (arr[mid] < target) { lo = mid + 1; } else { hi = mid - 1; }
  }
  return -1;
}`.trim(), 'js', 'algorithm', 'Binary search on a sorted array — O(log n)', ['binary-search', 'search', 'sorted', 'algorithm']),

    makeItem('memoize', `
function memoize(fn) {
  const cache = new Map();
  return function(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) { return cache.get(key); }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}`.trim(), 'js', 'algorithm', 'Memoize any function — caches results by serialized args', ['memoize', 'cache', 'performance', 'optimization']),

    makeItem('groupBy', `
function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
}`.trim(), 'js', 'algorithm', 'Group array items by a key function or property name', ['group-by', 'array', 'reduce', 'transform']),

    // ── Pattern ───────────────────────────────────────────────────────────────
    makeItem('EventEmitter', `
class EventEmitter {
  constructor() { this._events = {}; }
  on(event, listener) {
    (this._events[event] = this._events[event] || []).push(listener);
    return this;
  }
  off(event, listener) {
    this._events[event] = (this._events[event] || []).filter(l => l !== listener);
    return this;
  }
  emit(event, ...args) {
    (this._events[event] || []).forEach(l => l(...args));
    return this;
  }
  once(event, listener) {
    const wrapper = (...args) => { listener(...args); this.off(event, wrapper); };
    return this.on(event, wrapper);
  }
}`.trim(), 'js', 'pattern', 'Minimal EventEmitter — on/off/emit/once', ['event-emitter', 'observer', 'pattern', 'events']),

    makeItem('singleton', `
class Singleton {
  static _instance = null;
  constructor() {
    if (Singleton._instance) { return Singleton._instance; }
    Singleton._instance = this;
  }
  static getInstance() {
    if (!Singleton._instance) { new Singleton(); }
    return Singleton._instance;
  }
}`.trim(), 'js', 'pattern', 'Singleton pattern — ensures only one instance exists', ['singleton', 'pattern', 'instance']),

    // ── Error ─────────────────────────────────────────────────────────────────
    makeItem('tryCatchAsync', `
async function tryCatch(promise) {
  try {
    const result = await promise;
    return [null, result];
  } catch (err) {
    return [err, null];
  }
}`.trim(), 'js', 'error', 'Async try/catch that returns [error, result] tuple — no try/catch needed at callsite', ['error', 'async', 'promise', 'tuple']),

    // ── Validation ────────────────────────────────────────────────────────────
    makeItem('validateEmail', `
function validateEmail(email) {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(email).toLowerCase());
}`.trim(), 'js', 'validation', 'Validate email address format', ['email', 'validate', 'regex', 'form']),

    makeItem('validateUrl', `
function validateUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}`.trim(), 'js', 'validation', 'Validate URL using the built-in URL parser', ['url', 'validate', 'form']),

    // ── Config ────────────────────────────────────────────────────────────────
    makeItem('loadEnv', `
function loadEnv(key, fallback) {
  const val = process.env[key];
  if (val === undefined || val === '') {
    if (fallback !== undefined) { return fallback; }
    throw new Error('Missing required env var: ' + key);
  }
  return val;
}`.trim(), 'js', 'config', 'Load env var with fallback and required enforcement', ['env', 'config', 'environment', 'node']),

  ];
}
