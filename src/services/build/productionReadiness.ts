// [SCOPE] Production-Readiness Preflight — the backend analog of the Plan Gate. A deliberate "before you
// launch" checklist of mechanical, project-level inspections the "120 apps" author warns founders to do:
// secrets not committed, DB migrations + backups, rate-limiting, input validation, tests. Each check is a
// heuristic over files/deps (no subprocess) → fast + unit-testable, and speaks PLAIN ENGLISH with a concrete
// fix. Composes migrationsGuard (DB toolchain); the per-line code scan stays in securityScanner. Non-blocking
// guidance, like the rest of Redivivus — it tells you what to harden, it doesn't stop you.

import * as fs from 'fs';
import * as path from 'path';
import { detectToolchain } from './migrationsGuard.js';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'na';
export interface ReadinessItem { id: string; title: string; status: CheckStatus; detail: string; fix?: string; }
export interface ReadinessReport { items: ReadinessItem[]; ok: number; warn: number; fail: number; }

function read(root: string, rel: string): string | null { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; } }
function exists(root: string, rel: string): boolean { try { return fs.existsSync(path.join(root, rel)); } catch { return false; } }
function deps(root: string): Record<string, string> {
  try { const j = JSON.parse(read(root, 'package.json') || '{}'); return { ...(j.dependencies || {}), ...(j.devDependencies || {}) }; } catch { return {}; }
}
const hasAny = (d: Record<string, string>, names: string[]) => names.some((n) => d[n]);

/** Detect a backend server (where rate-limiting/validation matter). Static sites return kind 'none'. */
export function detectServer(root: string): { kind: 'node' | 'python' | 'none'; framework: string } {
  const d = deps(root);
  const nodeFw = ['express', 'fastify', 'koa', '@nestjs/core', '@hapi/hapi', 'hapi'].find((f) => d[f]);
  if (nodeFw) { return { kind: 'node', framework: nodeFw }; }
  const reqs = (read(root, 'requirements.txt') || '') + (read(root, 'pyproject.toml') || '');
  const pyFw = ['fastapi', 'flask', 'django'].find((f) => new RegExp(`\\b${f}\\b`, 'i').test(reqs)) || (exists(root, 'manage.py') ? 'django' : '');
  if (pyFw) { return { kind: 'python', framework: pyFw }; }
  return { kind: 'none', framework: '' };
}

function checkSecretsInGit(root: string): ReadinessItem {
  const hasEnv = exists(root, '.env');
  const gi = read(root, '.gitignore') || '';
  if (hasEnv && !/(^|\n)\s*\.env\b/.test(gi)) {
    return { id: 'secrets', title: 'API keys / secrets', status: 'fail',
      detail: 'You have a `.env` file that is NOT in `.gitignore` — it can get committed and leak your keys publicly.',
      fix: 'Add `.env` to `.gitignore`, and rotate any key that may already have been pushed.' };
  }
  return { id: 'secrets', title: 'API keys / secrets', status: 'ok',
    detail: hasEnv ? '`.env` is git-ignored — secrets stay off GitHub.' : 'No `.env` secrets file in the project root.' };
}

function checkGitignore(root: string): ReadinessItem {
  const gi = read(root, '.gitignore');
  if (gi === null) {
    return { id: 'gitignore', title: 'Version-control hygiene', status: 'warn',
      detail: 'No `.gitignore` — build output, dependencies, and secrets can get committed by accident.',
      fix: 'Add a `.gitignore` covering `node_modules/`, build output (`dist/`, `build/`), and `.env`.' };
  }
  // node_modules present but not ignored is the common foot-gun — flag just that one.
  if (exists(root, 'node_modules') && !/(^|\n)\s*\/?node_modules/.test(gi)) {
    return { id: 'gitignore', title: 'Version-control hygiene', status: 'warn',
      detail: '`node_modules/` is not in `.gitignore` — you could commit thousands of dependency files.',
      fix: 'Add `node_modules/` to `.gitignore`.' };
  }
  return { id: 'gitignore', title: 'Version-control hygiene', status: 'ok', detail: '`.gitignore` is present.' };
}

function checkMigrations(root: string): ReadinessItem {
  const tc = detectToolchain(root);
  if (tc.id === 'none') { return { id: 'migrations', title: 'Database migrations', status: 'na', detail: '' }; }
  const dirs = ['prisma/migrations', 'db/migrate', 'migrations', 'alembic/versions', 'drizzle'];
  const hasMig = dirs.some((dir) => exists(root, dir));
  return hasMig
    ? { id: 'migrations', title: 'Database migrations', status: 'ok', detail: `${tc.label} migrations are set up — schema changes are tracked and reversible.` }
    : { id: 'migrations', title: 'Database migrations', status: 'warn',
        detail: `You're using ${tc.label} but I see no migrations folder. Editing the schema directly drifts your local and production databases out of sync.`,
        fix: `Generate your first migration: \`${tc.migrate('init')}\`.` };
}

function checkBackups(root: string): ReadinessItem {
  if (detectToolchain(root).id === 'none') { return { id: 'backups', title: 'Database backups', status: 'na', detail: '' }; }
  return { id: 'backups', title: 'Database backups', status: 'warn',
    detail: "You have a database — data loss hurts most after you have real users, and it can't be undone.",
    fix: 'Turn on automated daily backups with your database host (most managed Postgres/MySQL providers do this in one click).' };
}

function checkRateLimiting(root: string): ReadinessItem {
  const srv = detectServer(root);
  if (srv.kind === 'none') { return { id: 'ratelimit', title: 'Rate limiting', status: 'na', detail: '' }; }
  const has = srv.kind === 'node'
    ? hasAny(deps(root), ['express-rate-limit', 'express-slow-down', '@fastify/rate-limit', 'rate-limiter-flexible', '@nestjs/throttler'])
    : /\b(slowapi|flask-limiter|django-ratelimit|djangorestframework)\b/i.test((read(root, 'requirements.txt') || '') + (read(root, 'pyproject.toml') || ''));
  return has
    ? { id: 'ratelimit', title: 'Rate limiting', status: 'ok', detail: 'A rate-limiter is installed — helps block spam bots and abuse.' }
    : { id: 'ratelimit', title: 'Rate limiting', status: 'warn',
        detail: 'Your server has no rate limiting. Without it, bots can flood your API with fake accounts and spam.',
        fix: srv.kind === 'node' ? 'Add `express-rate-limit` (or your framework\'s limiter) on public routes.' : 'Add `slowapi` (FastAPI) / `flask-limiter` / `django-ratelimit`.' };
}

function checkInputValidation(root: string): ReadinessItem {
  const srv = detectServer(root);
  if (srv.kind === 'none') { return { id: 'validation', title: 'Input validation', status: 'na', detail: '' }; }
  const has = srv.kind === 'node'
    ? hasAny(deps(root), ['zod', 'joi', 'yup', 'express-validator', 'class-validator', 'ajv', 'valibot'])
    : /\b(pydantic|marshmallow|cerberus|voluptuous)\b/i.test((read(root, 'requirements.txt') || '') + (read(root, 'pyproject.toml') || '')) || srv.framework === 'django';
  return has
    ? { id: 'validation', title: 'Input validation', status: 'ok', detail: 'A validation library is in place — user input is checked before you trust it.' }
    : { id: 'validation', title: 'Input validation', status: 'warn',
        detail: 'No input-validation library found. Unchecked input is how bad data and injection attacks get in.',
        fix: srv.kind === 'node' ? 'Validate request bodies with `zod` or `express-validator`.' : 'Validate with `pydantic` / `marshmallow`.' };
}

function checkTests(root: string): ReadinessItem {
  const d = deps(root);
  const hasRunner = hasAny(d, ['jest', 'vitest', 'mocha', 'ava', '@playwright/test', 'pytest', 'cypress']);
  const hasTestDir = ['test', 'tests', '__tests__', 'spec'].some((dir) => exists(root, dir));
  const pkgScript = /"test"\s*:/.test(read(root, 'package.json') || '') && !/"test"\s*:\s*"[^"]*no test specified/.test(read(root, 'package.json') || '');
  return (hasRunner || hasTestDir || pkgScript)
    ? { id: 'tests', title: 'Automated tests', status: 'ok', detail: 'You have tests — they catch breakage before your users do.' }
    : { id: 'tests', title: 'Automated tests', status: 'warn',
        detail: 'No tests found. The first real users are a bad time to discover the login or checkout is broken.',
        fix: 'Add a couple of tests for your critical flows (login, payments, data writes), or ask the agent to.' };
}

/** Run all readiness checks for a project. Items with status 'na' are dropped (not applicable here). */
export function runReadinessReport(root: string): ReadinessReport {
  const all = [checkSecretsInGit, checkGitignore, checkMigrations, checkBackups, checkRateLimiting, checkInputValidation, checkTests]
    .map((fn) => { try { return fn(root); } catch { return null; } })
    .filter((i): i is ReadinessItem => !!i && i.status !== 'na');
  return { items: all, ok: all.filter((i) => i.status === 'ok').length, warn: all.filter((i) => i.status === 'warn').length, fail: all.filter((i) => i.status === 'fail').length };
}

const ICON: Record<CheckStatus, string> = { ok: '✅', warn: '⚠️', fail: '❌', na: '' };
const ORDER: Record<CheckStatus, number> = { fail: 0, warn: 1, ok: 2, na: 3 };

/** Plain-English checklist message for the chat. */
export function formatReadinessReport(report: ReadinessReport, projectName: string): string {
  const head = `🚀 **Production readiness — ${projectName}**\n\n${report.fail} must-fix · ${report.warn} to look at · ${report.ok} good\n`;
  const body = [...report.items].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map((i) => {
    const fix = i.fix && i.status !== 'ok' ? `\n   → ${i.fix}` : '';
    return `${ICON[i.status]} **${i.title}** — ${i.detail}${fix}`;
  }).join('\n\n');
  const close = report.fail === 0 && report.warn === 0
    ? '\n\nNothing blocking — looking solid. 🎉'
    : '\n\n_This is a guide, not a gate — fix what matters for your launch._';
  return `${head}\n${body}${close}`;
}
