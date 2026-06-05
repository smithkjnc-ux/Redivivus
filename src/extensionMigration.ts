// [SCOPE] One-time settings migration: copies chassis.* keys to redivivus.* namespace.
// Called early in activate() before any service reads API keys.
// Safe to call on every activation -- no-op when chassis.* keys don't exist or redivivus.* already has values.

import * as vscode from 'vscode';

const KEYS_TO_MIGRATE = [
  'geminiApiKey', 'claudeApiKey', 'openaiApiKey',
  'groqApiKey', 'kimiApiKey', 'xaiApiKey',
  'buildMode', 'defaultAI', 'modelRankOverrides',
];

/** Copies chassis.* settings to redivivus.* if redivivus.* is empty. Silent, no popups. */
export async function migrateChassisSettings(_ctx: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  let migrated = 0;
  for (const key of KEYS_TO_MIGRATE) {
    const oldValue = config.get(`chassis.${key}`);
    const newValue = config.get(`redivivus.${key}`);
    if (oldValue !== undefined && oldValue !== '' && (newValue === undefined || newValue === '')) {
      try {
        await config.update(`redivivus.${key}`, oldValue, vscode.ConfigurationTarget.Global);
        migrated++;
      } catch { /* skip if setting is not writable (e.g. workspace-only setting) */ }
    }
  }
  if (migrated > 0) {
    console.log(`[Redivivus] Migrated ${migrated} settings from chassis.* to redivivus.*`);
  }
}
