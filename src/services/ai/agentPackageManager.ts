// [SCOPE] Pure helper: detect a Node project's package manager from its lockfile, so the agent uses the one
// the project is actually set up for instead of reaching for yarn on an npm project (which triggers a needless
// "install yarn" tool-gap card). Returns a short prompt directive injected into the agent's system prompt.
// The lockfile is the source of truth — yarn.lock => yarn, pnpm-lock.yaml => pnpm, bun.lockb => bun, else npm.
// No VS Code deps → unit-testable.

import * as fs from 'fs';
import * as path from 'path';

export interface PackageManager { pm: 'npm' | 'yarn' | 'pnpm' | 'bun'; install: string; exec: string; }

/** Detect the package manager for `root`. Returns undefined when it isn't a Node project (no package.json). */
export function detectPackageManager(root: string): PackageManager | undefined {
  const has = (f: string) => { try { return fs.existsSync(path.join(root, f)); } catch { return false; } };
  if (!has('package.json')) { return undefined; }
  if (has('yarn.lock'))        { return { pm: 'yarn', install: 'yarn install', exec: 'yarn' }; }
  if (has('pnpm-lock.yaml'))   { return { pm: 'pnpm', install: 'pnpm install', exec: 'pnpm exec' }; }
  if (has('bun.lockb'))        { return { pm: 'bun',  install: 'bun install',  exec: 'bunx' }; }
  // package-lock.json, npm-shrinkwrap.json, or no lockfile at all → npm is the safe default for Node.
  return { pm: 'npm', install: 'npm install', exec: 'npx' };
}

/** A one-line PACKAGE MANAGER directive for the agent prompt, or '' when `root` isn't a Node project. */
export function packageManagerGuidance(root: string): string {
  const m = detectPackageManager(root);
  if (!m) { return ''; }
  return `PACKAGE MANAGER: This project uses **${m.pm}**. Install deps with \`${m.install}\` and run local ` +
    `tools/binaries with \`${m.exec} <tool>\` (e.g. \`${m.exec} vitest run\`). Do NOT use a different package ` +
    `manager — only ${m.pm} is set up here, so reaching for another one will fail with a missing-tool error.`;
}
