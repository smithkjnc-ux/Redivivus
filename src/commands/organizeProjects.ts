// [SCOPE] One-time (re-runnable) "Organize Projects" command. Classifies the user's flat projects by their
// blueprint and MOVES each into a category folder (~/projects/tetris → ~/projects/games/tetris), and backfills
// the .redivivus/project.json marker into older projects. Opt-in and preview-first — NEVER moves anything
// silently, and refuses to run while files are unsaved (so a folder rename can't lose edits). Nothing is
// deleted; folders can be moved back anytime. See projectResolver (classify/enumerate/marker).

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { enumerateProjects, classifyCategory, writeProjectMarker } from '../services/project/projectResolver.js';
import { isProtectedProject } from '../core/project/activeProjectWatcher.js';

function projectsDir(): string {
  return vscode.workspace.getConfiguration('redivivus').get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
}

function blueprintOf(projectPath: string): { what?: string; why?: string } {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(projectPath, '.redivivus', 'config.json'), 'utf8'));
    return { what: cfg?.blueprint?.what, why: cfg?.blueprint?.why };
  } catch { return {}; }
}

interface Move { name: string; from: string; to: string; category: string; }

function planOrganize(home: string): { moves: Move[]; backfill: string[] } {
  const moves: Move[] = [];
  const backfill: string[] = [];
  for (const p of enumerateProjects(home)) {
    // [PARADOX GUARD] Never touch protected folders — Redivivus's own source repos (redivivus, redivivus-*).
    // Organize must not move/mark them, the same way build/fix refuse to target them.
    if (isProtectedProject(p.path)) { continue; }
    if (!fs.existsSync(path.join(p.path, '.redivivus', 'project.json'))) { backfill.push(p.path); }
    if (p.category) { continue; } // already in a category — leave it
    const cat = classifyCategory(blueprintOf(p.path));
    if (!cat) { continue; } // can't classify confidently — leave it flat
    const to = path.join(home, cat, p.name);
    if (fs.existsSync(to)) { continue; } // name collision in the target category — skip
    moves.push({ name: p.name, from: p.path, to, category: cat });
  }
  return { moves, backfill };
}

export function registerOrganizeProjects(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.organizeProjects', async () => {
    const home = projectsDir();
    if (!fs.existsSync(home)) { vscode.window.showInformationMessage('No projects folder found.'); return; }

    // Don't move folders out from under unsaved edits.
    const dirty = vscode.workspace.textDocuments.filter(d => d.isDirty && d.uri.fsPath.startsWith(home));
    if (dirty.length) { vscode.window.showWarningMessage('Save or close your open project files first, then run Organize again.'); return; }

    const { moves, backfill } = planOrganize(home);
    for (const p of backfill) { writeProjectMarker(p, path.basename(p)); } // non-destructive marker backfill

    if (moves.length === 0) {
      const note = backfill.length ? ` (added the project marker to ${backfill.length} older project${backfill.length !== 1 ? 's' : ''})` : '';
      vscode.window.showInformationMessage(`Nothing to reorganize — your projects are already organized${note}.`);
      return;
    }

    const byCat = new Map<string, number>();
    for (const m of moves) { byCat.set(m.category, (byCat.get(m.category) || 0) + 1); }
    const catSummary = [...byCat.entries()].map(([c, n]) => `${c} (${n})`).join(', ');
    const sample = moves.slice(0, 12).map(m => `  ${m.name}  →  ${m.category}/${m.name}`).join('\n');
    const more = moves.length > 12 ? `\n  …and ${moves.length - 12} more` : '';
    const choice = await vscode.window.showInformationMessage(
      `Organize ${moves.length} project${moves.length !== 1 ? 's' : ''} into: ${catSummary}?`,
      { modal: true, detail: `${sample}${more}\n\nThis moves the project folders on disk. Nothing is deleted — you can move them back anytime.` },
      'Organize',
    );
    if (choice !== 'Organize') { return; }

    let activeRoot: string | undefined;
    try { activeRoot = require('../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider.instance?.getRoot(); } catch { /* */ }
    let moved = 0; let activeMovedTo: string | undefined;
    for (const m of moves) {
      try {
        fs.mkdirSync(path.dirname(m.to), { recursive: true });
        fs.renameSync(m.from, m.to);
        moved++;
        if (activeRoot && path.resolve(activeRoot) === path.resolve(m.from)) { activeMovedTo = m.to; }
      } catch { /* skip this one, keep going */ }
    }

    if (activeMovedTo) { try { require('../core/project/activeProjectWatcher.js').activateProject(activeMovedTo); } catch { /* */ } }
    try { require('../core/project/projectFolderDecorations.js').refreshProjectFolderDecorations(); } catch { /* */ }
    vscode.window.showInformationMessage(`✅ Organized ${moved} project${moved !== 1 ? 's' : ''} into ${byCat.size} categor${byCat.size !== 1 ? 'ies' : 'y'}. Category folders now show their counts.`);
  }));
}
