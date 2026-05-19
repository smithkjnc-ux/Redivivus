// [SCOPE] CHASSIS Retrofit Blueprint Command — scan project, auto-generate 5 W's, save to config

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RetrofitBlueprintService } from '../services/retrofitBlueprint.js';
import { RoutingService } from '../services/ai/routingService.js';
import { ChassisService } from '../services/chassisService.js';
import { openBlueprintPanel } from '../ui/views/blueprintInterviewPanel.js';
import { Blueprint5W } from '../services/retrofitBlueprint.js';

export function registerRetrofitBlueprintCommand(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  routing: RoutingService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.retrofitBlueprint', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('Open a project folder first.'); return; }

      const confirm = await vscode.window.showInformationMessage(
        'CHASSIS will look at your project and figure out what it does, who it\'s for, and why it exists. Takes about 30 seconds.',
        'Scan my project',
        'Cancel'
      );
      if (confirm !== 'Scan my project') { return; }

      const service = new RetrofitBlueprintService(root, routing);
      const ref: { blueprint: Blueprint5W | null } = { blueprint: null };

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'CHASSIS is reading your project...', cancellable: false },
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
        'Got it — here\'s what CHASSIS found about your project:',
        { modal: true, detail: detail + '\n\nThis is now saved. You can edit it anytime.' },
        'Looks right',
        'Edit it now'
      );

      // Both "Looks right" and "Edit it now" confirm acceptance — finalize the conversion
      if (next === 'Looks right' || next === 'Edit it now') {
        // Remove .chassis-assist to promote from Assist Mode → Full CHASSIS
        const assistFile = path.join(root, '.chassis-assist');
        if (fs.existsSync(assistFile)) { try { fs.unlinkSync(assistFile); } catch { /* ignore */ } }

        // Create CHASSIS_ROADMAP.md at project root if missing
        const roadmapPath = path.join(root, 'CHASSIS_ROADMAP.md');
        if (!fs.existsSync(roadmapPath)) {
          const projName = path.basename(root);
          const today = new Date().toISOString().slice(0, 10);
          fs.writeFileSync(roadmapPath,
            `# CHASSIS Roadmap — ${projName}\n\n*Last updated: ${today}* — Converted from Assist Mode to Full CHASSIS\n\n## Recent Fixes\n\n_No changes logged yet._\n`,
            'utf-8');
        }

        // Write blueprint.md to .chassis/ if missing
        const bpMdPath = path.join(root, '.chassis', 'blueprint.md');
        if (!fs.existsSync(bpMdPath)) {
          try { fs.writeFileSync(bpMdPath, service.formatMarkdown(blueprint), 'utf-8'); } catch { /* ignore */ }
        }

        // Create work_log.md if missing (required by sessionService.appendWorkLog)
        const wlPath = path.join(root, '.chassis', 'work_log.md');
        if (!fs.existsSync(wlPath)) {
          const projName = path.basename(root);
          fs.writeFileSync(wlPath, `# Work Log — ${projName}\n\n`, 'utf-8');
        }

        // Refresh chat panel to show Full CHASSIS screen
        vscode.commands.executeCommand('chassis.openChatPanel');

        if (next === 'Edit it now') { openBlueprintPanel(context, chassis, routing); }
      }
    })
  );
}
