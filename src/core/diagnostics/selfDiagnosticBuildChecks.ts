// [SCOPE] CHASSIS Self-Diagnostic — commands, file system, vault, routing, guardian, and build checks
// Extracted from selfDiagnostic.ts. Imported by runDiagnostic in selfDiagnostic.ts.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { DiagResult } from './selfDiagnosticChecks';

// ── UI COMMANDS ──

export function checkCommandRegistered(commandId: string): DiagResult {
  return {
    name: commandId, category: 'Commands', status: 'pass',
    message: 'Registered (extension active)',
    detail: 'Full validation requires async getCommands() -- see enhanced check below',
  };
}

// ── EXTENSION RESOURCES ──

export function checkExtensionResources(context: vscode.ExtensionContext): DiagResult {
  const extPath = context.extensionPath;
  const items = [
    { name: 'package.json', path: path.join(extPath, 'package.json') },
    { name: 'out/extension.js', path: path.join(extPath, 'out', 'extension.js') },
    { name: 'resources/', path: path.join(extPath, 'resources') },
  ];
  const missing = items.filter(c => !fs.existsSync(c.path));
  if (missing.length === 0) { return { name: 'Extension resources', category: 'File System', status: 'pass', message: 'All critical resources present' }; }
  return { name: 'Extension resources', category: 'File System', status: 'fail', message: `Missing: ${missing.map(m => m.name).join(', ')}` };
}

export function checkOutDir(): DiagResult {
  const extPath = vscode.extensions.getExtension('chassis.chassis')?.extensionPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const outDir = path.join(extPath, 'out');
  if (!fs.existsSync(outDir)) { return { name: 'out/ directory', category: 'File System', status: 'fail', message: 'out/ directory missing -- extension not compiled' }; }
  const jsFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.js'));
  return { name: 'out/ directory', category: 'File System', status: 'pass', message: `${jsFiles.length} compiled JS files in out/` };
}

// ── VAULT ──

export function checkVaultDir(): DiagResult {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return { name: 'Vault', category: 'Vault', status: 'skip', message: 'No workspace -- skipped' }; }
  const vaultPath = path.join(root, '.chassis', 'vault');
  if (fs.existsSync(vaultPath)) {
    try {
      const files = fs.readdirSync(vaultPath);
      return { name: 'Vault', category: 'Vault', status: 'pass', message: `Vault directory found with ${files.length} entries` };
    } catch (e: any) {
      return { name: 'Vault', category: 'Vault', status: 'fail', message: `Vault directory exists but not readable: ${e.message}` };
    }
  }
  return { name: 'Vault', category: 'Vault', status: 'warn', message: 'No vault directory -- will be created on first vault save' };
}

// ── ROUTING / FAILOVER ──

export function checkRoutingService(): DiagResult {
  try {
    const possiblePaths = [
      path.join(__dirname, 'ai', 'routingService.js'),
      path.join(__dirname, '..', 'services', 'ai', 'routingService.js'),
      path.join(__dirname, '..', '..', 'out', 'services', 'ai', 'routingService.js'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const mod = require(p);
        const exports = Object.keys(mod);
        const hasRoute = exports.some(e => /route|send|dispatch|failover|fallback/i.test(e));
        if (hasRoute) { return { name: 'Routing service', category: 'AI Routing', status: 'pass', message: `Loaded with exports: ${exports.slice(0, 5).join(', ')}` }; }
        return { name: 'Routing service', category: 'AI Routing', status: 'warn', message: `File found but no routing exports detected` };
      }
    }
    return { name: 'Routing service', category: 'AI Routing', status: 'warn', message: 'Could not locate routingService.js' };
  } catch (e: any) {
    return { name: 'Routing service', category: 'AI Routing', status: 'fail', message: `Failed to load routing service: ${e.message}` };
  }
}

// ── GUARDIAN ──

export function checkGuardianService(): DiagResult {
  try {
    const possiblePaths = [
      path.join(__dirname, 'ai', 'guardianAI.js'),
      path.join(__dirname, '..', 'services', 'ai', 'guardianAI.js'),
      path.join(__dirname, '..', '..', 'out', 'services', 'ai', 'guardianAI.js'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const mod = require(p);
        const exports = Object.keys(mod);
        return { name: 'Guardian service', category: 'Guardian', status: 'pass', message: `Loaded with exports: ${exports.slice(0, 5).join(', ')}` };
      }
    }
    return { name: 'Guardian service', category: 'Guardian', status: 'warn', message: 'Could not locate guardianAI.js' };
  } catch (e: any) {
    return { name: 'Guardian service', category: 'Guardian', status: 'fail', message: `Failed to load guardian: ${e.message}` };
  }
}

// ── BUILD FRESHNESS ──

export function checkBuildFreshness(): DiagResult {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return { name: 'Build freshness', category: 'Build', status: 'skip', message: 'No workspace' }; }
  const outExt = path.join(root, 'out', 'extension.js');
  const srcExt = path.join(root, 'src', 'extension.ts');
  if (!fs.existsSync(outExt)) { return { name: 'Build freshness', category: 'Build', status: 'warn', message: 'out/extension.js not found in workspace' }; }
  if (!fs.existsSync(srcExt)) { return { name: 'Build freshness', category: 'Build', status: 'skip', message: 'Not in CHASSIS dev workspace' }; }
  const outTime = fs.statSync(outExt).mtimeMs;
  const srcTime = fs.statSync(srcExt).mtimeMs;
  if (srcTime > outTime) { return { name: 'Build freshness', category: 'Build', status: 'warn', message: 'Source is newer than build output -- run npm run compile' }; }
  return { name: 'Build freshness', category: 'Build', status: 'pass', message: 'Build output is current' };
}

// ── ENHANCED ASYNC COMMAND CHECK ──

export async function checkAllCommandsRegistered(): Promise<DiagResult[]> {
  const allCommands = await vscode.commands.getCommands(true);
  const chassisCommands = allCommands.filter(c => c.startsWith('chassis.'));
  const results: DiagResult[] = [];
  const extPath = vscode.extensions.getExtension('chassis.chassis')?.extensionPath;
  if (!extPath) {
    results.push({ name: 'Command audit', category: 'Commands', status: 'warn', message: 'Could not locate extension to read package.json' });
    return results;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(extPath, 'package.json'), 'utf-8'));
    const declaredCommands: string[] = (pkg.contributes?.commands || []).map((c: any) => c.command);
    for (const declared of declaredCommands) {
      if (!chassisCommands.includes(declared)) {
        results.push({ name: declared, category: 'Commands (Deep)', status: 'fail', message: 'Declared in package.json but NOT registered at runtime' });
      }
    }
    for (const registered of chassisCommands) {
      if (!declaredCommands.includes(registered)) {
        results.push({ name: registered, category: 'Commands (Deep)', status: 'warn', message: 'Registered at runtime but not in package.json (dynamic command)' });
      }
    }
    if (results.length === 0) {
      results.push({ name: 'Command audit', category: 'Commands (Deep)', status: 'pass', message: `All ${declaredCommands.length} commands matched` });
    }
  } catch (e: any) {
    results.push({ name: 'Command audit', category: 'Commands (Deep)', status: 'fail', message: `Failed to read package.json: ${e.message}` });
  }
  return results;
}
