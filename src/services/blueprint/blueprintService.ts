// [SCOPE] Blueprint Service orchestrator — thin facade over questions, health, and writer modules
// Split from 215-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import type { Blueprint } from '../../types/index.js';
import type { RedivivusService } from '../redivivusService.js';
import { QUESTIONS } from './blueprintQuestions.js';
import { calculateHealth } from './blueprintHealth.js';
import { writeBlueprintMd } from './blueprintWriter.js';

export class BlueprintService {
  constructor(private redivivus: RedivivusService) {}

  async runInterview(): Promise<Blueprint | null> {
    const blueprint: Partial<Blueprint> = {};

    // show intro
    const proceed = await vscode.window.showInformationMessage(
      'Redivivus Blueprint Interview — 5 questions that shape everything. Ready?',
      { modal: true },
      'Let\'s go'
    );
    if (proceed !== 'Let\'s go') { return null; }

    for (const q of QUESTIONS) {
      // show preamble as modal for center-screen visibility
      const cont = await vscode.window.showInformationMessage(
        `── ${q.key.toUpperCase()} ──\n\n${q.preamble}`,
        { modal: true, detail: q.prompt },
        'Answer'
      );

      if (cont !== 'Answer') {
        vscode.window.showWarningMessage('Blueprint Interview cancelled.');
        return null;
      }

      // get answer
      const answer = await vscode.window.showInputBox({
        title: `Redivivus Blueprint — ${q.key.toUpperCase()}`,
        prompt: q.prompt,
        placeHolder: q.placeholder,
        ignoreFocusOut: true,
      });

      if (answer === undefined) {
        vscode.window.showWarningMessage('Blueprint Interview cancelled.');
        return null;
      }

      blueprint[q.key] = answer || '';
    }

    // calculate health (delegated to health module)
    const health = calculateHealth(blueprint as Pick<Blueprint, 'who' | 'what' | 'where' | 'when' | 'why'>);

    // [REVISIONS] If a blueprint already exists, snapshot it before overwriting.
    // Previous revisions are locked; the current is always open for editing.
    const config = this.redivivus.loadConfig();
    const existing = config?.blueprint;

    let fullBlueprint: Blueprint = {
      who: blueprint.who || '',
      what: blueprint.what || '',
      where: blueprint.where || '',
      when: blueprint.when || '',
      why: blueprint.why || '',
      health,
      locked: false,
      version: '1.0',
      revision: 1,
    };

    if (existing && existing.who) {
      // Snapshot the existing blueprint as a locked revision
      const { snapshotBeforeUpdate } = await import('./blueprintRevisions.js');
      const withHistory = snapshotBeforeUpdate(existing, 'Updated via Blueprint Interview');
      fullBlueprint.revision = withHistory.revision;
      fullBlueprint.revisions = withHistory.revisions;
    }

    // Show health summary (informational — no lock prompt)
    if (health.confidence === 'high') {
      await vscode.window.showInformationMessage(
        `Blueprint Complete!`,
        {
          modal: true,
          detail: `Health: ✅ ${health.confirmed} Confirmed · 🔶 ${health.assumed} Assumed · ❓ ${health.unknown} Unknown\n\nConfidence: HIGH — Ready to build.\n\nRevision: ${fullBlueprint.revision}${fullBlueprint.revisions?.length ? ` (${fullBlueprint.revisions.length} previous version${fullBlueprint.revisions.length !== 1 ? 's' : ''} preserved)` : ' (original)'}`
        },
        'OK'
      );
    } else {
      await vscode.window.showWarningMessage(
        `Blueprint Needs Work`,
        {
          modal: true,
          detail: `Health: ✅ ${health.confirmed} Confirmed · 🔶 ${health.assumed} Assumed · ❓ ${health.unknown} Unknown\n\nConfidence: ${health.confidence.toUpperCase()} — Consider adding more detail before building.\n\nRevision: ${fullBlueprint.revision}`
        },
        'OK'
      );
    }

    // save to config
    if (config) {
      config.blueprint = fullBlueprint;
      this.redivivus.saveConfig(config);
    }

    // write blueprint.md (delegated to writer module)
    writeBlueprintMd(fullBlueprint, this.redivivus.blueprintPath, config?.projectName || 'Unknown');

    // log it
    this.redivivus.appendWorkLog(
      `- Action: Blueprint Interview completed\n` +
      `- Health: ✅ ${health.confirmed} · 🔶 ${health.assumed} · ❓ ${health.unknown}\n` +
      `- Confidence: ${health.confidence}\n` +
      `- Revision: ${fullBlueprint.revision}`
    );

    return fullBlueprint;
  }
}