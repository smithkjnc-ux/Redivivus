// [SCOPE] redivivus.configureEditorRules — checklist to choose which AI-editor rule files (CLAUDE.md,
// .cursorrules, etc.) Redivivus writes. Default is none; this lets the user opt into the editors they
// use. Persists to the `redivivus.editorRuleFiles` setting and optionally applies to the active project.

import * as vscode from 'vscode';
import type { RedivivusService } from '../../../services/redivivusService.js';
import type { RulesService } from '../../../services/rulesService.js';
import { getActiveProjectRoot } from '../../project/application/activeProjectRoot.js';
import { EDITOR_RULE_FILES, getEnabledEditorKeys, setEnabledEditorKeys, removeDisabledShims } from '../../../services/editorRuleFiles.js';

export function registerConfigureEditorRules(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  rulesService: RulesService,
  refreshAll: () => void,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.configureEditorRules', async () => {
      const enabled = new Set(getEnabledEditorKeys());
      const picks = await vscode.window.showQuickPick(
        EDITOR_RULE_FILES.map(e => ({ label: e.label, key: e.key, picked: enabled.has(e.key) })),
        {
          canPickMany: true,
          title: 'Editor Rule Files',
          placeHolder: 'Select the AI editors to generate rule files for (none selected = .redivivus/rules.md only)',
        },
      );
      if (picks === undefined) { return; } // cancelled — leave setting unchanged

      const keys = picks.map(p => (p as any).key as string);
      await setEnabledEditorKeys(keys);

      // Offer to apply to the current project immediately (write enabled, remove disabled Redivivus files).
      const root = getActiveProjectRoot();
      if (root) {
        const apply = await vscode.window.showInformationMessage(
          keys.length
            ? `Editor rule files set: ${keys.join(', ')}. Apply to the current project now?`
            : 'Editor rule files turned off. Remove the generated shim files from the current project?',
          'Apply', 'Just Save Setting',
        );
        if (apply === 'Apply') {
          const name = redivivus.loadConfig()?.projectName || require('path').basename(root);
          const created = keys.length ? rulesService.generateAll(root, name, keys) : [];
          const removed = removeDisabledShims(root, keys);
          const parts: string[] = [];
          if (created.length) { parts.push(`wrote ${created.join(', ')}`); }
          if (removed.length) { parts.push(`removed ${removed.join(', ')}`); }
          vscode.window.showInformationMessage(`Redivivus editor rules updated${parts.length ? ': ' + parts.join('; ') : ''}.`);
        }
      } else {
        vscode.window.showInformationMessage(
          keys.length ? `Editor rule files set: ${keys.join(', ')}. New projects will include them.` : 'Editor rule files turned off. New projects will only use .redivivus/rules.md.',
        );
      }
      refreshAll();
    }),
  );
}
