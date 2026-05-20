// [SCOPE] Deployment Service -- deploy web apps to hosting providers (Netlify, Vercel, etc).
// Detects project type, builds if needed, and deploys via provider CLI or API.
// [WARN] Requires user to have CLI tools installed (netlify-cli, vercel). Checks before deploying.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export interface DeployConfig {
  provider: 'netlify' | 'vercel' | 'surge' | 'manual';
  siteName?: string;
  buildCommand?: string;
  publishDir?: string;
}

export interface DeployResult {
  success: boolean;
  url?: string;
  error?: string;
  provider: string;
}

/**
 * Detect the best deployment configuration for a project.
 */
export function detectDeployConfig(root: string): DeployConfig {
  const hasNetlify = fs.existsSync(path.join(root, 'netlify.toml'));
  const hasVercel = fs.existsSync(path.join(root, 'vercel.json'));
  const hasPkg = fs.existsSync(path.join(root, 'package.json'));

  // Check for framework-specific configs
  const hasNext = fs.existsSync(path.join(root, 'next.config.js')) || fs.existsSync(path.join(root, 'next.config.mjs'));
  const hasVite = fs.existsSync(path.join(root, 'vite.config.ts')) || fs.existsSync(path.join(root, 'vite.config.js'));

  // Determine publish directory
  let publishDir = 'dist';
  if (fs.existsSync(path.join(root, 'build'))) { publishDir = 'build'; }
  if (fs.existsSync(path.join(root, 'public'))) { publishDir = 'public'; }
  if (hasNext) { publishDir = '.next'; }
  // Static HTML with no build step
  if (fs.existsSync(path.join(root, 'index.html')) && !hasPkg) { publishDir = '.'; }

  // Determine build command
  let buildCommand: string | undefined;
  if (hasPkg) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
      if (pkg.scripts?.build) { buildCommand = 'npm run build'; }
    } catch {}
  }

  // Select provider
  if (hasNetlify) { return { provider: 'netlify', buildCommand, publishDir }; }
  if (hasVercel || hasNext) { return { provider: 'vercel', buildCommand, publishDir }; }
  return { provider: 'netlify', buildCommand, publishDir };
}

/**
 * Check if a deployment CLI is available.
 */
export async function checkCli(provider: string): Promise<boolean> {
  const cmd = provider === 'vercel' ? 'vercel --version' : provider === 'surge' ? 'surge --version' : 'netlify --version';
  return new Promise((resolve) => {
    exec(cmd, (err) => resolve(!err));
  });
}

/**
 * Deploy to Netlify using the CLI.
 */
export async function deployToNetlify(root: string, config: DeployConfig): Promise<DeployResult> {
  const publishDir = config.publishDir || 'dist';
  const siteName = config.siteName || path.basename(root);

  // Build first if needed
  if (config.buildCommand) {
    const buildOk = await runCommand(config.buildCommand, root);
    if (!buildOk) { return { success: false, error: 'Build failed', provider: 'netlify' }; }
  }

  const deployDir = path.join(root, publishDir);
  if (!fs.existsSync(deployDir)) {
    return { success: false, error: `Publish directory "${publishDir}" not found. Run build first.`, provider: 'netlify' };
  }

  return new Promise((resolve) => {
    exec(`netlify deploy --prod --dir="${deployDir}" --site="${siteName}"`, { cwd: root }, (err, stdout, stderr) => {
      if (err) {
        // Try without --site for first-time deploy
        exec(`netlify deploy --prod --dir="${deployDir}"`, { cwd: root }, (err2, stdout2, stderr2) => {
          if (err2) { resolve({ success: false, error: stderr2 || stderr || err2.message, provider: 'netlify' }); }
          else {
            const url = extractUrl(stdout2);
            resolve({ success: true, url, provider: 'netlify' });
          }
        });
      } else {
        const url = extractUrl(stdout);
        resolve({ success: true, url, provider: 'netlify' });
      }
    });
  });
}

/**
 * Deploy to Vercel using the CLI.
 */
export async function deployToVercel(root: string, config: DeployConfig): Promise<DeployResult> {
  if (config.buildCommand) {
    const buildOk = await runCommand(config.buildCommand, root);
    if (!buildOk) { return { success: false, error: 'Build failed', provider: 'vercel' }; }
  }

  return new Promise((resolve) => {
    exec('vercel --prod --yes', { cwd: root }, (err, stdout, stderr) => {
      if (err) { resolve({ success: false, error: stderr || err.message, provider: 'vercel' }); }
      else {
        const url = stdout.trim().split('\n').pop()?.trim();
        resolve({ success: true, url, provider: 'vercel' });
      }
    });
  });
}

/**
 * Quick deploy for static sites -- use surge.sh (no config needed).
 */
export async function deployToSurge(root: string, publishDir: string): Promise<DeployResult> {
  const deployDir = path.join(root, publishDir);
  if (!fs.existsSync(deployDir)) {
    return { success: false, error: `Directory "${publishDir}" not found`, provider: 'surge' };
  }
  const domain = `${path.basename(root)}-${Date.now() % 10000}.surge.sh`;
  return new Promise((resolve) => {
    exec(`surge ${deployDir} ${domain}`, { cwd: root }, (err, stdout, stderr) => {
      if (err) { resolve({ success: false, error: stderr || err.message, provider: 'surge' }); }
      else { resolve({ success: true, url: `https://${domain}`, provider: 'surge' }); }
    });
  });
}

// --- Internal ---

function runCommand(cmd: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: 120_000 }, (err) => resolve(!err));
  });
}

function extractUrl(output: string): string | undefined {
  const match = output.match(/https?:\/\/[^\s]+\.netlify\.app[^\s]*/);
  return match ? match[0] : undefined;
}
