// [SCOPE] Import Validator — checks all import statements in generated code resolve to real files
// or known npm packages. Called after static validation, before file write. Never blocks a build.

import * as fs from 'fs';
import * as path from 'path';

export interface ImportValidationResult {
  valid: boolean;
  brokenRelativeImports: string[];
  brokenPackageImports: string[];
}

// Packages Redivivus builds commonly use — treated as always-valid even if not in package.json
const KNOWN_NPM_PACKAGES = new Set([
  'react', 'react-dom', 'react-router-dom', 'react-router',
  'recharts', 'd3', 'chart.js', 'victory', 'nivo',
  'lodash', 'axios', 'uuid', 'dayjs', 'date-fns', 'moment',
  'express', 'fastify', 'koa', 'hapi',
  'socket.io', 'socket.io-client', 'ws',
  'zod', 'yup', 'joi',
  'tailwindcss', '@tailwindcss/forms',
  'framer-motion', 'gsap', 'three', '@react-three/fiber',
  'zustand', 'jotai', 'redux', '@reduxjs/toolkit', 'mobx',
  'next', 'nuxt', 'svelte', '@sveltejs/kit', 'vite', 'webpack',
  'typescript', 'ts-node', 'tsx', 'esbuild',
  'jest', 'vitest', '@testing-library/react', 'playwright', 'cypress',
  'prisma', '@prisma/client', 'mongoose', 'sequelize', 'typeorm',
  'dotenv', 'cors', 'helmet', 'morgan', 'body-parser',
  'vscode', '@types/node', '@types/react', '@types/react-dom',
]);

// Node.js built-in modules — always valid
const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'http', 'https', 'net', 'dns', 'url', 'util',
  'crypto', 'stream', 'events', 'buffer', 'child_process', 'cluster',
  'readline', 'zlib', 'assert', 'module', 'process', 'console',
  'timers', 'string_decoder', 'querystring', 'punycode',
]);

const RESOLVABLE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js'];

function resolves(importPath: string, fromDir: string): boolean {
  const abs = path.resolve(fromDir, importPath);
  if (fs.existsSync(abs)) { return true; }
  for (const ext of RESOLVABLE_EXTS) {
    if (fs.existsSync(abs + ext)) { return true; }
  }
  return false;
}

function loadInstalledPackages(projectRoot: string): Set<string> {
  const pkgPath = path.join(projectRoot, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = Object.keys({
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.peerDependencies || {}),
    });
    return new Set(deps);
  } catch {
    return new Set();
  }
}

export function validateImports(
  code: string,
  fileAbsPath: string,
  projectRoot: string,
): ImportValidationResult {
  const fromDir = path.dirname(fileAbsPath);
  const installed = loadInstalledPackages(projectRoot);

  const brokenRelativeImports: string[] = [];
  const brokenPackageImports: string[] = [];

  const importRe = /(?:from\s+|import\s+|require\s*\(\s*)['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = importRe.exec(code)) !== null) {
    const spec = match[1];

    if (spec.startsWith('.') || spec.startsWith('/')) {
      // Relative or absolute path import
      if (!resolves(spec, fromDir)) {
        brokenRelativeImports.push(spec);
      }
    } else {
      // Bare package import — strip sub-path (e.g. "react-dom/client" -> "react-dom")
      const pkgName = spec.startsWith('@')
        ? spec.split('/').slice(0, 2).join('/')
        : spec.split('/')[0];
      if (!NODE_BUILTINS.has(pkgName) && !KNOWN_NPM_PACKAGES.has(pkgName) && !installed.has(pkgName)) {
        brokenPackageImports.push(spec);
      }
    }
  }

  return {
    valid: brokenRelativeImports.length === 0 && brokenPackageImports.length === 0,
    brokenRelativeImports,
    brokenPackageImports,
  };
}

export function buildImportRepairPrompt(
  originalTask: string,
  code: string,
  result: ImportValidationResult,
  relPath: string,
): string {
  const broken: string[] = [
    ...result.brokenRelativeImports.map(p => `  - Relative import "${p}" (file does not exist)`),
    ...result.brokenPackageImports.map(p => `  - Package import "${p}" (not installed)`),
  ];

  return [
    `You generated code for "${originalTask}" but it has broken imports that will crash at runtime.`,
    ``,
    `FILE: ${relPath}`,
    `BROKEN IMPORTS:`,
    ...broken,
    ``,
    `Fix rules (pick one per broken import):`,
    `1. If the import is a helper/util you can inline: inline the relevant code directly into this file.`,
    `2. If the import is an uninstalled npm package: replace with a stdlib/built-in equivalent, or remove the feature.`,
    `3. Do NOT add new imports to fix this — only remove or inline.`,
    ``,
    `Return ONLY the complete fixed file contents — no markdown fences, no explanation.`,
    ``,
    `CURRENT CODE:`,
    code,
  ].join('\n');
}
