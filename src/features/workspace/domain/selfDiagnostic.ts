// [SCOPE] Redivivus Self-Diagnostic — main runner, output channel, and check orchestration
// Register via: vscode.commands.registerCommand('redivivus.selfDiagnostic', () => runDiagnostic(context, redivivus))
// Checks split into: selfDiagnosticChecks.ts (workspace/AI) and selfDiagnosticBuildChecks.ts (commands/build/vault)

import * as vscode from 'vscode';
import type { DiagResult} from './selfDiagnosticChecks.js';
import { checkWorkspace, checkRedivivusDir, checkConfigFile, checkServiceExists, checkInitState, checkApiKey, checkProviderReachable, checkSystemPrompt } from './selfDiagnosticChecks.js';
import { checkCommandRegistered, checkExtensionResources, checkOutDir, checkVaultDir, checkRoutingService, checkGuardianService, checkBuildFreshness } from './selfDiagnosticBuildChecks.js';

export { checkAllCommandsRegistered } from './selfDiagnosticBuildChecks.js';
export type { DiagResult } from './selfDiagnosticChecks.js';

type DiagCheck = () => Promise<DiagResult> | DiagResult;

let outputChannel: vscode.OutputChannel | null = null;
function getChannel(): vscode.OutputChannel {
  if (!outputChannel) { outputChannel = vscode.window.createOutputChannel('Redivivus Diagnostic'); }
  return outputChannel;
}

export async function runDiagnostic(
  context: vscode.ExtensionContext,
  redivivus?: any
): Promise<DiagResult[]> {
  const ch = getChannel();
  ch.clear(); ch.show(true);
  ch.appendLine('============================================');
  ch.appendLine('  Redivivus Self-Diagnostic');
  ch.appendLine(`  ${new Date().toISOString()}`);
  ch.appendLine('============================================');
  ch.appendLine('');

  const checks: DiagCheck[] = [
    () => checkWorkspace(),
    () => checkRedivivusDir(),
    () => checkConfigFile(),
    () => checkServiceExists(redivivus, 'RedivivusService', 'isInitialized'),
    () => checkServiceExists(redivivus, 'RedivivusService', 'loadConfig'),
    () => checkInitState(redivivus),
    () => checkApiKey('Gemini', 'redivivus.geminiApiKey'),
    () => checkApiKey('Kimi (Moonshot)', 'redivivus.kimiApiKey'),
    () => checkApiKey('Groq', 'redivivus.groqApiKey'),
    () => checkProviderReachable('Gemini'),
    () => checkProviderReachable('Kimi'),
    () => checkProviderReachable('Groq'),
    () => checkSystemPrompt(redivivus),
    () => checkCommandRegistered('redivivus.openChat'),
    () => checkCommandRegistered('redivivus.init'),
    () => checkCommandRegistered('redivivus.createFile'),
    () => checkCommandRegistered('redivivus.saveAllFiles'),
    () => checkCommandRegistered('redivivus.openProject'),
    () => checkCommandRegistered('redivivus.vaultBrowser'),
    () => checkCommandRegistered('redivivus.selfDiagnostic'),
    () => checkExtensionResources(context),
    () => checkOutDir(),
    () => checkVaultDir(),
    () => checkRoutingService(),
    () => checkGuardianService(),
    () => checkBuildFreshness(),
  ];

  const results: DiagResult[] = [];
  let currentCategory = '';

  for (const check of checks) {
    try {
      const result = await check();
      results.push(result);
      if (result.category !== currentCategory) {
        currentCategory = result.category;
        ch.appendLine(`> ${currentCategory}`);
      }
      const icon = result.status === 'pass' ? '[OK]' : result.status === 'fail' ? '[FAIL]' : result.status === 'warn' ? '[WARN]' : '[SKIP]';
      ch.appendLine(`  ${icon} ${result.name}: ${result.message}`);
      if (result.detail) { ch.appendLine(`     -- ${result.detail}`); }
    } catch (err: any) {
      results.push({ name: 'Check Error', category: 'Internal', status: 'fail', message: `Check threw: ${err.message}` });
      ch.appendLine(`  [FAIL] Internal error: ${err.message}`);
    }
  }

  ch.appendLine('');
  ch.appendLine('============================================');
  const passes = results.filter(r => r.status === 'pass').length;
  const fails = results.filter(r => r.status === 'fail').length;
  const warns = results.filter(r => r.status === 'warn').length;
  const skips = results.filter(r => r.status === 'skip').length;

  if (fails === 0) {
    ch.appendLine(`  ALL CLEAR -- ${passes} passed, ${warns} warning(s), ${skips} skipped`);
  } else {
    ch.appendLine(`  ${fails} FAILED -- ${passes} passed, ${warns} warning(s), ${skips} skipped`);
    ch.appendLine('');
    ch.appendLine('== PASTE TO AI ==');
    ch.appendLine(`Redivivus diagnostic: ${fails} errors, ${warns} warnings.`);
    for (const r of results.filter(r => r.status === 'fail')) {
      ch.appendLine(`[FAIL] ${r.name}: ${r.message}${r.detail ? ' -- ' + r.detail : ''}`);
    }
    for (const r of results.filter(r => r.status === 'warn')) {
      ch.appendLine(`[WARN] ${r.name}: ${r.message}${r.detail ? ' -- ' + r.detail : ''}`);
    }
    ch.appendLine('== END ==');
  }
  ch.appendLine('============================================');

  if (fails > 0) {
    vscode.window.showWarningMessage(`Redivivus Diagnostic: ${fails} issue(s) found. See Output -> Redivivus Diagnostic.`);
  } else {
    vscode.window.showInformationMessage(`Redivivus Diagnostic: All clear! ${passes} checks passed.`);
  }
  return results;
}
