// [SCOPE] Redivivus Self-Diagnostic — workspace, services, and AI provider checks
// Extracted from selfDiagnostic.ts. Imported by runDiagnostic in selfDiagnostic.ts.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

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
  const { getKeyCached } = await import('../../services/ai/secretKeyStore.js');
  const key = getKeyCached(providerName.toLowerCase());
  
  if (key && key.length > 8) {
    return { name: `${providerName} API key`, category: 'AI Providers', status: 'pass', message: `Set (${key.slice(0, 4)}...${key.slice(-4)})` };
  }
  if (key && key.length > 0) { return { name: `${providerName} API key`, category: 'AI Providers', status: 'warn', message: 'Key seems too short -- may be invalid' }; }
  return { name: `${providerName} API key`, category: 'AI Providers', status: 'fail', message: `No API key configured. Use Redivivus: Open Settings to add keys.` };
}

// Provider ping config: config key + model-list URL (cheap, auth-only, no tokens consumed)
const PROVIDER_PING: Record<string, { configKey: string; url: (k: string) => string; headers: (k: string) => Record<string, string> }> = {
  Gemini:  { configKey: 'redivivus.geminiApiKey',  url: k => `https://generativelanguage.googleapis.com/v1beta/models?key=${k}&pageSize=1`, headers: () => ({}) },
  OpenAI:  { configKey: 'redivivus.openaiApiKey',  url: () => 'https://api.openai.com/v1/models',    headers: k => ({ Authorization: `Bearer ${k}` }) },
  Claude:  { configKey: 'redivivus.claudeApiKey',  url: () => 'https://api.anthropic.com/v1/models', headers: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }) },
  Groq:    { configKey: 'redivivus.groqApiKey',    url: () => 'https://api.groq.com/openai/v1/models', headers: k => ({ Authorization: `Bearer ${k}` }) },
  xAI:     { configKey: 'redivivus.xaiApiKey',     url: () => 'https://api.x.ai/v1/models',          headers: k => ({ Authorization: `Bearer ${k}` }) },
  Kimi:    { configKey: 'redivivus.kimiApiKey',    url: () => 'https://api.moonshot.cn/v1/models',   headers: k => ({ Authorization: `Bearer ${k}` }) },
  DeepSeek:{ configKey: 'redivivus.deepseekApiKey',url: () => 'https://api.deepseek.com/v1/models',   headers: k => ({ Authorization: `Bearer ${k}` }) },
};

export async function checkProviderReachable(providerName: string): Promise<DiagResult> {
  const cfg = PROVIDER_PING[providerName];
  if (!cfg) { return { name: `${providerName} reachable`, category: 'AI Providers', status: 'skip', message: 'Unknown provider' }; }
  
  // Read from SecretStorage (where keys are actually stored) instead of old settings
  const { getKeyCached } = await import('../../services/ai/secretKeyStore.js');
  const key = getKeyCached(providerName.toLowerCase());
  
  if (!key) { return { name: `${providerName} reachable`, category: 'AI Providers', status: 'skip', message: 'No API key -- skipping ping' }; }
  try {
    const url = cfg.url(key);
    const headers = cfg.headers(key);
    
    // Use Node's https/http module instead of fetch for better compatibility
    const result = await new Promise<{ status: number; data?: string }>((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const req = client.request(url, {
        method: 'GET',
        headers: headers,
        timeout: 5000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode || 0, data }));
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      
      req.end();
    });
    
    if (result.status === 200) { 
      return { name: `${providerName} reachable`, category: 'AI Providers', status: 'pass', message: `Reachable (${result.status})` }; 
    }
    if (result.status === 401 || result.status === 403) { 
      return { name: `${providerName} reachable`, category: 'AI Providers', status: 'fail', message: `Auth error ${result.status} -- API key invalid or missing permissions` }; 
    }
    // Try to get more error details for 400
    if (result.status === 400) {
      const errorText = result.data || 'No error details';
      return { name: `${providerName} reachable`, category: 'AI Providers', status: 'fail', message: `Bad request (400) - ${errorText.substring(0, 100)}` };
    }
    return { name: `${providerName} reachable`, category: 'AI Providers', status: 'warn', message: `Unexpected HTTP ${result.status} from ${providerName}` };
  } catch (e: any) {
    if (e.message === 'Timeout') { return { name: `${providerName} reachable`, category: 'AI Providers', status: 'warn', message: 'Ping timed out (5s) -- network may be slow or blocked' }; }
    return { name: `${providerName} reachable`, category: 'AI Providers', status: 'fail', message: `Network error: ${e.message}` };
  }
}

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
