// [SCOPE] WebView script assembler — joins all dashboard script modules into a single injectable string
// Split from 457-line monolith. Each responsibility now lives in its own file under 200 lines.
// [WARN] All sub-modules share the same webview JS scope — variable names must not collide across files.
import { getCoreScripts } from './scriptsCore.js';
import { getFormsScripts } from './scriptsForms.js';
import { getSettingsScripts } from './scriptsSettings.js';
import { getWizardScripts } from './scriptsWizard.js';
import { getVaultScripts } from './scriptsVault.js';

export function getScripts(): string {
  return [
    getCoreScripts(),
    getFormsScripts(),
    getSettingsScripts(),
    getWizardScripts(),
    getVaultScripts(),
  ].join('\n');
}