// [SCOPE] Rules Service orchestrator — thin facade over content and wrappers modules
// Split from 276-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import type { ChassisService } from './chassisService.js';
import { buildRules } from './rulesContent.js';
import { wrapForClaude, wrapForGemini } from './rulesWrappers.js';

export class RulesService {
  constructor(private chassis: ChassisService) {}

  // ── generate all rule files (orchestrator-only — delegates to content and wrappers)

  generateAll(root: string, projectName: string): string[] {
    const rules = buildRules(projectName);
    const created: string[] = [];

    const targets: { file: string; content: string }[] = [
      { file: 'CLAUDE.md', content: wrapForClaude(rules, projectName) },
      { file: 'GEMINI.md', content: wrapForGemini(rules, projectName) },
      { file: '.cursorrules', content: rules },
      { file: '.windsurfrules', content: rules },
      { file: '.clinerules', content: rules },
    ];

    // .github/copilot-instructions.md
    const ghDir = path.join(root, '.github');
    if (!fs.existsSync(ghDir)) { fs.mkdirSync(ghDir, { recursive: true }); }
    targets.push({
      file: '.github/copilot-instructions.md',
      content: rules,
    });

    for (const t of targets) {
      const fullPath = path.join(root, t.file);
      fs.writeFileSync(fullPath, t.content);
      created.push(t.file);
    }

    this.chassis.appendWorkLog(
      '- Action: Generated AI editor rules\n' +
      '- Files created: ' + created.join(', ')
    );

    return created;
  }
}
