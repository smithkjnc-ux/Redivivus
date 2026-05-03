// [SCOPE] Blueprint Interview — Five W's with preambles

import * as vscode from 'vscode';
import * as fs from 'fs';
import { Blueprint, BlueprintHealth } from '../types/index.js';
import { ChassisService } from './chassisService.js';

interface InterviewQuestion {
  key: keyof Pick<Blueprint, 'who' | 'what' | 'where' | 'when' | 'why'>;
  preamble: string;
  prompt: string;
  placeholder: string;
}

const QUESTIONS: InterviewQuestion[] = [
  {
    key: 'who',
    preamble: 'This shapes every decision about complexity, UI, and assumptions.',
    prompt: 'WHO is going to use this? Picture the person — their skill level, their context.',
    placeholder: 'e.g., Non-technical users who want to sell stuff locally without an account',
  },
  {
    key: 'what',
    preamble: 'Not the dream feature list — the minimum thing that makes this useful.',
    prompt: 'WHAT does it need to do? One sentence that describes success.',
    placeholder: 'e.g., Let users post and find local listings anonymously via P2P',
  },
  {
    key: 'where',
    preamble: 'This determines the entire tech stack and deployment model.',
    prompt: 'WHERE does this live and run? Web? Mobile? Desktop? Local? Cloud?',
    placeholder: 'e.g., React Native mobile app, Firebase backend, Android first',
  },
  {
    key: 'when',
    preamble: 'Not just timeline — also: real-time? Batch? On-demand? This shapes architecture.',
    prompt: 'WHEN does this need to work? Timeline and responsiveness requirements.',
    placeholder: 'e.g., MVP in 2 months, real-time P2P messaging, 24hr listing lifetime',
  },
  {
    key: 'why',
    preamble: 'The gut check. If the answer is weak, we should know before writing code.',
    prompt: 'WHY does this need to exist? What problem isn\'t already solved?',
    placeholder: 'e.g., No marketplace lets you sell locally without creating a tracked account',
  },
];

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

    // calculate health
    const health = this.calculateHealth(blueprint as Pick<Blueprint, 'who' | 'what' | 'where' | 'when' | 'why'>);

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

    // write blueprint.md
    this.writeBlueprintMd(fullBlueprint, config?.projectName || 'Unknown');

    // log it
    this.chassis.appendWorkLog(
      `- Action: Blueprint Interview completed\n` +
      `- Health: ✅ ${health.confirmed} · 🔶 ${health.assumed} · ❓ ${health.unknown}\n` +
      `- Confidence: ${health.confidence}\n` +
      `- Locked: ${fullBlueprint.locked ? 'YES' : 'no'}`
    );

    return fullBlueprint;
  }

  private calculateHealth(answers: Pick<Blueprint, 'who' | 'what' | 'where' | 'when' | 'why'>): BlueprintHealth {
    let confirmed = 0;
    let assumed = 0;
    let unknown = 0;

    for (const key of ['who', 'what', 'where', 'when', 'why'] as const) {
      const val = answers[key].trim();
      if (val.length > 20) {
        confirmed++;
      } else if (val.length > 0) {
        assumed++;  // short answer = probably not fully thought through
      } else {
        unknown++;
      }
    }

    let confidence: 'high' | 'medium' | 'low';
    if (unknown === 0 && assumed <= 1) { confidence = 'high'; }
    else if (unknown <= 1) { confidence = 'medium'; }
    else { confidence = 'low'; }

    return { confirmed, assumed, unknown, confidence };
  }

  private writeBlueprintMd(bp: Blueprint, projectName: string): void {
    const status = bp.locked ? '🔒 LOCKED' : '🔶 DRAFT';
    const content = `# Blueprint — ${projectName}

**Status:** ${status}
${bp.lockedAt ? `**Locked at:** ${bp.lockedAt}` : ''}

---

## WHO
${bp.who || '❓ Not answered'}

## WHAT
${bp.what || '❓ Not answered'}

## WHERE
${bp.where || '❓ Not answered'}

## WHEN
${bp.when || '❓ Not answered'}

## WHY
${bp.why || '❓ Not answered'}

---

## Health
- ✅ Confirmed: ${bp.health.confirmed}
- 🔶 Assumed: ${bp.health.assumed}
- ❓ Unknown: ${bp.health.unknown}
- **Confidence:** ${bp.health.confidence.toUpperCase()}

---

*Generated by CHASSIS v${bp.version}*
`;
    fs.writeFileSync(this.chassis.blueprintPath, content);
  }
}
