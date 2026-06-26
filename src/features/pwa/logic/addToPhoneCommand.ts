// [SCOPE] "Add to Phone" command — generates the active project as an installable PWA, publishes it to the ephemeral
// host, and opens the panel (URL + QR + countdown + install steps). Wires Phase 0 (generate) + Phase 2 (publish) +
// the panel. See docs/REDIVIVUS_ADD_TO_PHONE.md.
import * as vscode from 'vscode';
import * as path from 'path';
import { getActiveProjectRoot } from '../../project/application/activeProjectRoot.js';
import { publishPwa } from '../infrastructure/pwaPublish.js';
import { showAddToPhonePanel } from '../ui/addToPhonePanel.js';

const DEFAULT_HOST = 'https://redivivus-pwa-host.smithkjnc.workers.dev';

// Title-case a folder/project name: "frogger-arcade-game" -> "Frogger Arcade Game".
function titleFromName(name: string): string {
  return name.replace(/[-_]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function handleAddToPhone(): Promise<void> {
  const root = getActiveProjectRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('Open a project first — "Convert to PWA" turns the current project into an installable app.');
    return;
  }

  const cfg = vscode.workspace.getConfiguration('redivivus');
  const hostUrl = (cfg.get<string>('pwaHostUrl') || DEFAULT_HOST).trim();
  const ttlMinutes = (cfg.get<number>('pwaInstallWindowMinutes') as 15 | 60 | 240) || 60;
  const title = titleFromName(path.basename(root));
  // v1: gate publishing on a stable per-install token (the Worker requires a non-empty Redivivus app token).
  const appToken = `rdv-${vscode.env.machineId}`;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Convert to PWA: packaging ${title}...`, cancellable: false },
    async () => {
      try {
        const result = await publishPwa(root, { title, hostUrl, appToken, ttlMinutes });
        showAddToPhonePanel(result, title);
        if (result.warnings.length) {
          vscode.window.showWarningMessage(
            `Installed app may be missing ${result.warnings.length} local file(s): ${result.warnings.slice(0, 3).join(', ')}.`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Convert to PWA failed: ${msg}`);
      }
    },
  );
}
