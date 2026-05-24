import fs from 'fs';

const rule13Text = `\n### Rule 13: NO FLAT FILES
Every file lives in a folder that matches its responsibility — UI in UI, logic in logic, and so on. This applies to projects CHASSIS builds and to CHASSIS itself. No exceptions, no matter what vibe editor is being used.`;

const files = [
  'CLAUDE.md',
  '.cursorrules',
  '.windsurf/rules.md',
  'src/services/rulesContent.ts',
  'src/services/chassisRules.ts'
];

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  // Find Rule 12 block and append Rule 13 before Rule 20 or the end.
  // We can just append it right after the text of Rule 12.
  // In CLAUDE.md, .cursorrules, etc., Rule 12 looks like:
  // ### Rule 12: No Orphan Code
  // Every file must trace...
  //
  // We can just find "### Rule 12: No Orphan Code\n[^\n]+\n" and replace.
  const regex = /(### Rule 12: No Orphan Code[\s\S]*?(?=\n###|\n##|\n\*|$))/;
  content = content.replace(regex, `$1${rule13Text}\n\n`);
  fs.writeFileSync(f, content, 'utf8');
}

// Now GEMINI.md
let gemini = fs.readFileSync('GEMINI.md', 'utf8');
gemini = gemini.replace(
  '12. No orphan code — every file traces to the blueprint', 
  '12. No orphan code — every file traces to the blueprint\n13. **NO FLAT FILES** — Every file lives in a folder that matches its responsibility (UI in UI, logic in logic). No exceptions.'
);
fs.writeFileSync('GEMINI.md', gemini, 'utf8');

// Now chassisWorkerRules.ts
let workerRules = fs.readFileSync('src/services/ai/chassisWorkerRules.ts', 'utf8');
workerRules = workerRules.replace(
  '7. SCOPE DISCIPLINE', 
  '7. NO FLAT FILES — Every file lives in a folder that matches its responsibility (UI in UI, logic in logic). No exceptions.\n8. SCOPE DISCIPLINE'
);
fs.writeFileSync('src/services/ai/chassisWorkerRules.ts', workerRules, 'utf8');

// Now agentService.ts
let agentService = fs.readFileSync('src/services/ai/agentService.ts', 'utf8');
agentService = agentService.replace(
  '10. ACTUALLY WRITE THE CODE',
  '10. NO FLAT FILES. Every file lives in a folder that matches its responsibility — UI in UI, logic in logic, and so on. This applies to projects CHASSIS builds and to CHASSIS itself. No exceptions.\n11. ACTUALLY WRITE THE CODE'
);
fs.writeFileSync('src/services/ai/agentService.ts', agentService, 'utf8');

console.log('Rule 13 added to all locations!');
