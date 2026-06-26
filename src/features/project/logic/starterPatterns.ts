// [SCOPE] Curated starter patterns shipped with Redivivus — hand-verified, zero AI variance.
// These seed the vault on first install so every user gets quality reference patterns from day one.
// Categories: component, utility, api, auth, algorithm, pattern, error, validation, network, config
// [WARN] All patterns here must be verified working before adding. Test before committing.
// [DONE] Added DOM utils, storage wrapper, string utils, array utils — see starterPatternsUtils.ts
// Utility patterns + makeItem factory -> starterPatternsUtils.ts

import type { VaultItem } from '../../vault/data/vaultTypes.js';
import { makeItem, getUtilityPatterns, getDOMPatterns, getStoragePatterns, getStringPatterns } from './starterPatternsUtils.js';

export function getStarterPatterns(): VaultItem[] {
  return [
    ...getUtilityPatterns(),
    ...getDOMPatterns(),
    ...getStoragePatterns(),
    ...getStringPatterns(),

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
}`.trim(), 'js', 'algorithm', 'Binary search on a sorted array -- O(log n)', ['binary-search', 'search', 'sorted', 'algorithm']),

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
}`.trim(), 'js', 'algorithm', 'Memoize any function -- caches results by serialized args', ['memoize', 'cache', 'performance', 'optimization']),

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
  on(event, listener) { (this._events[event] = this._events[event] || []).push(listener); return this; }
  off(event, listener) { this._events[event] = (this._events[event] || []).filter(l => l !== listener); return this; }
  emit(event, ...args) { (this._events[event] || []).forEach(l => l(...args)); return this; }
  once(event, listener) { const w = (...args) => { listener(...args); this.off(event, w); }; return this.on(event, w); }
}`.trim(), 'js', 'pattern', 'Minimal EventEmitter -- on/off/emit/once', ['event-emitter', 'observer', 'pattern', 'events']),

    makeItem('singleton', `
class Singleton {
  static _instance = null;
  constructor() { if (Singleton._instance) { return Singleton._instance; } Singleton._instance = this; }
  static getInstance() { if (!Singleton._instance) { new Singleton(); } return Singleton._instance; }
}`.trim(), 'js', 'pattern', 'Singleton pattern -- ensures only one instance exists', ['singleton', 'pattern', 'instance']),

    // ── Error ─────────────────────────────────────────────────────────────────
    makeItem('tryCatchAsync', `
async function tryCatch(promise) {
  try { const result = await promise; return [null, result]; }
  catch (err) { return [err, null]; }
}`.trim(), 'js', 'error', 'Async try/catch that returns [error, result] tuple -- no try/catch needed at callsite', ['error', 'async', 'promise', 'tuple']),

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
