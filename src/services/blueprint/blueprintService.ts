// [SCOPE] Blueprint Service orchestrator — thin facade over questions, health, and writer modules
// Split from 215-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import type { Blueprint } from '../../types/index.js';
import type { ChassisService } from '../chassisService.js';
import { QUESTIONS } from './blueprintQuestions.js';
import { calculateHealth } from './blueprintHealth.js';
import { writeBlueprintMd } from './blueprintWriter.js';

export class BlueprintService {
  constructor(private chassis: ChassisService) {}

  async runInterview(): Promise<Blueprint | null> {
    const blueprint: Partial<Blueprint> = {};

    // show intro
    const proceed = await vscode.window.showInformationMessage(
      'CHASSIS Blueprint Interview — 5 questions that shape everything. Ready?',
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
        title: `CHASSIS Blueprint — ${q.key.toUpperCase()}`,
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

    const fullBlueprint: Blueprint = {
      who: blueprint.who || '',
      what: blueprint.what || '',
      where: blueprint.where || '',
      when: blueprint.when || '',
      why: blueprint.why || '',
      health,
      locked: false,
      version: '1.0',
    };

    // ask to lock
    if (health.confidence === 'high') {
      const lock = await vscode.window.showInformationMessage(
        `Blueprint Complete!`,
        {
          modal: true,
          detail: `Health: ✅ ${health.confirmed} Confirmed · 🔶 ${health.assumed} Assumed · ❓ ${health.unknown} Unknown\n\nConfidence: HIGH — Ready to build.`
        },
        'Lock Blueprint', 'Keep Editing'
      );
      if (lock === 'Lock Blueprint') {
        fullBlueprint.locked = true;
        fullBlueprint.lockedAt = new Date().toISOString();
      }
    } else {
      await vscode.window.showWarningMessage(
        `Blueprint Needs Work`,
        {
          modal: true,
          detail: `Health: ✅ ${health.confirmed} Confirmed · 🔶 ${health.assumed} Assumed · ❓ ${health.unknown} Unknown\n\nConfidence: ${health.confidence.toUpperCase()} — Consider adding more detail before building.`
        },
        'OK'
      );
    }

    // save to config
    const config = this.chassis.loadConfig();
    if (config) {
      config.blueprint = fullBlueprint;
      this.chassis.saveConfig(config);
    }

    // write blueprint.md (delegated to writer module)
    writeBlueprintMd(fullBlueprint, this.chassis.blueprintPath, config?.projectName || 'Unknown');

    // log it
    this.chassis.appendWorkLog(
      `- Action: Blueprint Interview completed\n` +
      `- Health: ✅ ${health.confirmed} · 🔶 ${health.assumed} · ❓ ${health.unknown}\n` +
      `- Confidence: ${health.confidence}\n` +
      `- Locked: ${fullBlueprint.locked ? 'YES' : 'no'}`
    );

    return fullBlueprint;
  }
}