// [SCOPE] Rules Service orchestrator — thin facade over content and wrappers modules
// Split from 276-line monolith. Each responsibility now lives in its own file under 200 lines.

import type { RedivivusService } from '../../application/redivivusService.js';
import { buildRules } from './rulesContent.js';
import { writeEnabledShims, getEnabledEditorKeys } from './editorRuleFiles.js';

export class RulesService {
  constructor(private redivivus: RedivivusService) {}

  // ── generate enabled rule files (orchestrator-only — delegates to content + editorRuleFiles)

  /** Write the shim files for the editors the user opted into. Pass explicit keys to override the setting. */
  generateAll(root: string, projectName: string, keys: string[] = getEnabledEditorKeys()): string[] {
    const rules = buildRules(projectName);
    const created = writeEnabledShims(root, rules, projectName, keys);

    this.redivivus.appendWorkLog(
      '- Action: Generated AI editor rules\n' +
      '- Files created: ' + (created.length ? created.join(', ') : '(none enabled)')
    );

    return created;
  }
}
