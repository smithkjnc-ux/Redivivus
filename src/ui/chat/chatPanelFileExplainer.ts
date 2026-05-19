// [SCOPE] File explainer — explains project files in plain English for non-tech users.
// Groups files by purpose: Your Code, CHASSIS Tools, Editor Rules, Version Control.

import * as fs from 'fs';
import * as path from 'path';

const CHASSIS_FILES: Record<string, string> = {
  '.chassis': 'CHASSIS private workspace — tracks your project history, saves progress, stores your blueprint. You never need to edit anything here.',
  'blueprint.md': 'Your project blueprint — answers to the 5 W\'s that keep the AI on task.',
  'build_history.json': 'A log of every file the AI has built or changed. Powers the Undo Build button.',
  'config.json': 'CHASSIS settings for this project — blueprint data, scan results, session info.',
  'debug.log': 'Error logs. Only useful when something goes wrong.',
  'learned.md': 'Things CHASSIS learned about your preferences — colors, patterns, code style.',
  'project_map.md': 'A map of your codebase. CHASSIS updates this when it scans your project.',
  'recommendations.md': 'The AI\'s list of suggested improvements from the last scan.',
  'rules.md': 'Rules the AI must follow in this project. You can add your own here.',
  'fix-snapshots': 'Backup copies of files before the AI edits them. Used for Undo.',
  'phase_snapshots': 'Snapshots taken at each build phase. Safety net.',
  'snapshots': 'Point-in-time copies of your project files.',
};

const EDITOR_RULES: Record<string, string> = {
  'CLAUDE.md': 'Rules for the Claude AI. Keeps it consistent with your project.',
  'GEMINI.md': 'Rules for Gemini AI.',
  '.cursorrules': 'Rules for Cursor editor AI.',
  '.clinerules': 'Rules for Cline (VS Code AI extension).',
  '.windsurfrules': 'Rules for Windsurf editor AI.',
};

const GIT_FILES: Record<string, string> = {
  '.gitignore': 'Tells git what NOT to save — temp files, secrets, and auto-generated folders.',
  '.github': 'GitHub automation folder — runs automatic backups and checks when you push code.',
  'docs': 'Documentation folder — notes and guides about the project.',
};

const EXT_LABELS: Record<string, string> = {
  '.html': 'Web page',
  '.css': 'Visual styles (colors, fonts, layout)',
  '.js': 'JavaScript logic',
  '.ts': 'TypeScript (like JavaScript, but stricter)',
  '.json': 'Settings/data file',
  '.md': 'Documentation (readable text)',
  '.py': 'Python code',
  '.sh': 'Shell script (runs commands)',
};

export async function explainProjectFiles(root: string): Promise<string> {
  let entries: string[];
  try { entries = fs.readdirSync(root); } catch { return 'Could not read project folder.'; }

  const yourCode: string[] = [];
  const chassisTools: string[] = [];
  const editorRules: string[] = [];
  const versionControl: string[] = [];

  for (const entry of entries) {
    const lower = entry.toLowerCase();
    if (CHASSIS_FILES[entry]) { chassisTools.push(`- **\`${entry}\`** — ${CHASSIS_FILES[entry]}`); continue; }
    if (EDITOR_RULES[entry]) { editorRules.push(`- **\`${entry}\`** — ${EDITOR_RULES[entry]}`); continue; }
    if (GIT_FILES[entry]) { versionControl.push(`- **\`${entry}\`** — ${GIT_FILES[entry]}`); continue; }
    if (entry === 'node_modules') { versionControl.push(`- **\`node_modules/\`** — Auto-downloaded code packages. Never edit these. Safe to ignore.`); continue; }
    if (entry.startsWith('.git')) { versionControl.push(`- **\`${entry}\`** — Git internal folder. Tracks your change history.`); continue; }

    const ext = path.extname(lower);
    const extLabel = EXT_LABELS[ext] || '';
    const isDir = (() => { try { return fs.statSync(path.join(root, entry)).isDirectory(); } catch { return false; } })();
    const label = isDir ? 'folder' : (extLabel || 'file');
    yourCode.push(`- **\`${entry}\`** — ${label.charAt(0).toUpperCase() + label.slice(1)}${extLabel && !isDir ? ' — part of your app' : ''}.`);
  }

  const sections: string[] = ['**Here\'s what all these files and folders are:**\n'];

  if (yourCode.length) {
    sections.push('**Your project files** (the app you built):');
    sections.push(...yourCode);
    sections.push('');
  }
  if (chassisTools.length) {
    sections.push('**CHASSIS tools** (AI assistant workspace — you can ignore these):');
    sections.push(...chassisTools);
    sections.push('');
  }
  if (editorRules.length) {
    sections.push('**Editor rules** (keeps AI editors consistent — you don\'t need to edit these):');
    sections.push(...editorRules);
    sections.push('');
  }
  if (versionControl.length) {
    sections.push('**Version control / GitHub** (saves your work history):');
    sections.push(...versionControl);
    sections.push('');
  }

  sections.push('_The only files you need to care about are in **Your project files**. Everything else is support infrastructure._');
  return sections.join('\n');
}
