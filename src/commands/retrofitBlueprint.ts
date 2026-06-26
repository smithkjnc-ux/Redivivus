// [SCOPE] Redivivus Retrofit Blueprint Command — scan project, auto-generate 5 W's, save to config

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RetrofitBlueprintService } from '../core/retrofit/retrofitBlueprint.js';
import type { RoutingService } from '../shared/ai/infrastructure/routingService.js';
import type { RedivivusService } from '../services/redivivusService.js';
import { openBlueprintPanel } from '../ui/views/blueprintInterviewPanel.js';
import type { Blueprint5W } from '../core/retrofit/retrofitBlueprint.js';

export function registerRetrofitBlueprintCommand(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  routing: RoutingService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.retrofitBlueprint', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('Open a project folder first.'); return; }

      const confirm = await vscode.window.showInformationMessage(
        'Redivivus will look at your project and figure out what it does, who it\'s for, and why it exists. Takes about 30 seconds.',
        'Scan my project',
        'Cancel'
      );
      if (confirm !== 'Scan my project') { return; }

      const service = new RetrofitBlueprintService(root, routing);
      const ref: { blueprint: Blueprint5W | null } = { blueprint: null };

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Redivivus is reading your project...', cancellable: false },
        async () => { ref.blueprint = await service.generateBlueprint(); }
      );

      const blueprint = ref.blueprint;
      if (!blueprint) {
        vscode.window.showErrorMessage('Couldn\'t read your project — check your AI key and try again.');
        return;
      }

      service.saveToConfig(blueprint);

      const detail = [
        `What it does: ${blueprint.what}`,
        `Who it's for: ${blueprint.who}`,
        `Where it runs: ${blueprint.where}`,
        `Why it exists: ${blueprint.why}`,
      ].join('\n');

      const next = await vscode.window.showInformationMessage(
        'Got it — here\'s what Redivivus found about your project:',
        { modal: true, detail: detail + '\n\nThis is now saved. You can edit it anytime.' },
        'Looks right',
        'Edit it now'
      );

      // Both "Looks right" and "Edit it now" confirm acceptance — finalize the conversion
      if (next === 'Looks right' || next === 'Edit it now') {
        // Remove .redivivus-assist to promote from Assist Mode → Full Redivivus
        const assistFile = path.join(root, '.redivivus-assist');
        if (fs.existsSync(assistFile)) { try { fs.unlinkSync(assistFile); } catch { /* ignore */ } }

        // Create REDIVIVUS_ROADMAP.md at project root if missing
        const roadmapPath = path.join(root, 'REDIVIVUS_ROADMAP.md');
        if (!fs.existsSync(roadmapPath)) {
          const projName = path.basename(root);
          const today = new Date().toISOString().slice(0, 10);
          fs.writeFileSync(roadmapPath,
            `# Redivivus Roadmap — ${projName}\n\n*Last updated: ${today}* — Converted from Assist Mode to Full Redivivus\n\n## Recent Fixes\n\n_No changes logged yet._\n`,
            'utf-8');
        }

        // Write blueprint.md to .redivivus/ if missing
        const bpMdPath = path.join(root, '.redivivus', 'blueprint.md');
        if (!fs.existsSync(bpMdPath)) {
          try { fs.writeFileSync(bpMdPath, service.formatMarkdown(blueprint), 'utf-8'); } catch { /* ignore */ }
        }

        // Create work_log.md if missing (required by sessionService.appendWorkLog)
        const wlPath = path.join(root, '.redivivus', 'work_log.md');
        if (!fs.existsSync(wlPath)) {
          const projName = path.basename(root);
          fs.writeFileSync(wlPath, `# Work Log — ${projName}\n\n`, 'utf-8');
        }

        // Refresh chat panel to show Full Redivivus screen
        vscode.commands.executeCommand('redivivus.openChatPanel');

        if (next === 'Edit it now') { openBlueprintPanel(context, redivivus, routing); }
      }
    })
  );
}
