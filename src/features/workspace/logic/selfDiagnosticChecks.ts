// [SCOPE] Redivivus Self-Diagnostic — workspace, services, and AI provider checks
// Extracted from selfDiagnostic.ts. Imported by runDiagnostic in selfDiagnostic.ts.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface DiagResult {
  name: string;
  category: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  detail?: string;
}

// ── WORKSPACE ──

export function checkWorkspace(): DiagResult {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return { name: 'Workspace', category: 'Workspace', status: 'pass', message: 'Workspace folder open', detail: folders[0].uri.fsPath };
  }
  return { name: 'Workspace', category: 'Workspace', status: 'warn', message: 'No workspace folder open -- some features require a project folder' };
}

export function checkRedivivusDir(): DiagResult {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return { name: '.redivivus dir', category: 'Workspace', status: 'skip', message: 'No workspace -- skipped' }; }
  const redivivusDir = path.join(root, '.redivivus');
  if (fs.existsSync(redivivusDir)) { return { name: '.redivivus dir', category: 'Workspace', status: 'pass', message: 'Found', detail: redivivusDir }; }
  return { name: '.redivivus dir', category: 'Workspace', status: 'warn', message: 'Not found -- project not initialized. Run Redivivus: Initialize Project.' };
}

export function checkConfigFile(): DiagResult {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return { name: 'Config file', category: 'Workspace', status: 'skip', message: 'No workspace -- skipped' }; }
  const configPath = path.join(root, '.redivivus', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { name: 'Config file', category: 'Workspace', status: 'pass', message: 'Valid JSON', detail: configPath };
    } catch (e: any) {
      return { name: 'Config file', category: 'Workspace', status: 'fail', message: 'Config file exists but is invalid JSON', detail: e.message };
    }
  }
  return { name: 'Config file', category: 'Workspace', status: 'warn', message: 'No config.json -- project not initialized' };
}

// ── SERVICES ──

export function checkServiceExists(service: any, serviceName: string, methodName: string): DiagResult {
  if (!service) { return { name: `${serviceName}.${methodName}`, category: 'Services', status: 'fail', message: `${serviceName} not available` }; }
  if (typeof service[methodName] === 'function') { return { name: `${serviceName}.${methodName}`, category: 'Services', status: 'pass', message: 'Method exists' }; }
  return { name: `${serviceName}.${methodName}`, category: 'Services', status: 'fail', message: `Method '${methodName}' not found on ${serviceName}` };
}

export function checkInitState(redivivus: any): DiagResult {
  if (!redivivus) { return { name: 'Init state', category: 'Services', status: 'skip', message: 'RedivivusService not available' }; }
  try {
    const initialized = redivivus.isInitialized();
    if (initialized) { return { name: 'Init state', category: 'Services', status: 'pass', message: 'Project is initialized' }; }
    return { name: 'Init state', category: 'Services', status: 'warn', message: 'Not initialized -- open a project folder or run Redivivus: Initialize' };
  } catch (e: any) {
    return { name: 'Init state', category: 'Services', status: 'fail', message: `isInitialized() threw: ${e.message}` };
  }
}

// ── AI PROVIDERS ──

export async function checkApiKey(providerName: string, configKey: string): Promise<DiagResult> {
  // Read from SecretStorage (where keys are actually stored) instead of old settings
  const { getKeyCached } = await import('../../../shared/ai/infrastructure/secretKeyStore.js');
  const key = getKeyCached(providerName.toLowerCase());
  
  if (key && key.length > 8) {
    return { name: `${providerName} API key`, category: 'AI Providers', status: 'pass', message: `Set (${key.slice(0, 4)}...${key.slice(-4)})` };
  }
  if (key && key.length > 0) { return { name: `${providerName} API key`, category: 'AI Providers', status: 'warn', message: 'Key seems too short -- may be invalid' }; }
  return { name: `${providerName} API key`, category: 'AI Providers', status: 'fail', message: `No API key configured. Use Redivivus: Open Settings to add keys.` };
}

// [DONE] checkProviderReachable + PROVIDER_PING + extractProviderError moved to selfDiagnosticProviders.ts (Rule 9 split)
export { checkProviderReachable } from './selfDiagnosticProviders.js';

// ── SYSTEM PROMPT ──

export function checkSystemPrompt(redivivus: any): DiagResult {
  try {
    const root = __dirname;
    const possiblePaths = [
      path.join(root, '..', 'ui', 'chat', 'chatPanelAIPrompt.js'),
      path.join(root, 'ui', 'chat', 'chatPanelAIPrompt.js'),
      path.join(root, '..', '..', 'out', 'ui', 'chat', 'chatPanelAIPrompt.js'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const mod = require(p);
        if (typeof mod.getSystemPrompt === 'function') {
          const prompt = mod.getSystemPrompt('No blueprint set.');
          if (prompt && prompt.toLowerCase().includes('redivivus')) {
            return { name: 'System prompt', category: 'System Prompt', status: 'pass', message: 'Redivivus identity found in prompt', detail: `Length: ${prompt.length} chars` };
          }
          return { name: 'System prompt', category: 'System Prompt', status: 'fail', message: 'System prompt builds but does NOT contain "redivivus"' };
        }
      }
    }
    return { name: 'System prompt', category: 'System Prompt', status: 'warn', message: 'Could not locate chatPanelAIPrompt.js to verify prompt content' };
  } catch (e: any) {
    return { name: 'System prompt', category: 'System Prompt', status: 'fail', message: `System prompt check failed: ${e.message}` };
  }
}
