// [SCOPE] Shared helpers for agent tool execute functions.
// realFilesHint — appended to "file not found" errors so the model corrects to reality instead of guessing.
// schemaWriteGuards — post-write schema/migration guards shared by write_file and edit_file.
// Extracted from agentTools.ts (Rule 9 split — was 361 lines).

import type { AgentContext } from './agentTools.js';

// [PHANTOM-GUARD] When a file isn't found, append the project's REAL file list so the model corrects
// to reality instead of inventing a conventional layout (src/routes/, controllers/, etc.).
export async function realFilesHint(root: string): Promise<string> {
  try {
    const { listSourceFiles } = await import('../../../features/workspace/data/codebaseSearch.js');
    const files = listSourceFiles(root, false, 30).map((f: any) => f.rel);
    if (files.length) {
      return ` This project's ACTUAL files are: ${files.join(', ')}. Do NOT assume a conventional layout — there is no routes/, controllers/, or utils/ here unless listed above. Read REAL paths only (list_dir / read_file).`;
    }
  } catch { /* lister unavailable — fall back to the plain error */ }
  return '';
}

/** Shared post-write schema/migration guards for BOTH write_file and edit_file (so the two paths
 *  can never drift). Logs via ctx.log, sets ctx.schemaChanged, returns a note to append. Best-effort. */
export async function schemaWriteGuards(ctx: AgentContext, rel: string, before: string | null, after: string): Promise<string> {
  let note = '';
  try {
    const mg = await import('../../../features/build/services/migrationsGuard.js');
    const mh = mg.migrationHook(ctx.root, rel, after, ctx.task);
    if (mh) { ctx.log(mh.log); note += mh.note; ctx.schemaChanged = true; }
    const missing = mg.schemaCodeMismatch(ctx.root, rel, after);
    if (missing.length) {
      const list = missing.map((f: string) => `\`${f}\``).join(', ');
      const plural = missing.length > 1;
      ctx.log(`⚠️ **Schema mismatch** — this code uses ${list}, which ${plural ? 'are' : 'is'} not in your Prisma schema yet.`);
      note += `\n\n⚠️ SCHEMA MISMATCH — your code uses Prisma field(s) ${list} that ${plural ? 'are' : 'is'} not declared in prisma/schema.prisma. Add ${plural ? 'them' : 'it'} to the schema and run \`npx prisma migrate dev\` BEFORE relying on this code, or it fails at runtime with "Unknown argument".`;
    }
    if (/\.prisma$/.test(rel)) {
      const dropped = mg.droppedSchemaFields(before, after);
      if (dropped.length) {
        const list = dropped.map((f: string) => `\`${f}\``).join(', ');
        const plural = dropped.length > 1;
        ctx.log(`🛑 **Destructive schema change** — this change REMOVES existing field(s) ${list}. Migrating will DROP ${plural ? 'those columns' : 'that column'} and all ${plural ? 'their' : 'its'} data.`);
        note += `\n\n🛑 DESTRUCTIVE SCHEMA CHANGE — your new schema REMOVES field(s) ${list} that currently exist in prisma/schema.prisma. Running the migration will DROP ${plural ? 'those columns' : 'that column'} AND ALL ${plural ? 'THEIR' : 'ITS'} DATA. If you only meant to ADD a field, you deleted ${plural ? 'these' : 'this'} by mistake — restore ${plural ? 'them' : 'it'} BEFORE migrating. Only proceed with the removal if the task explicitly asked to delete ${plural ? 'those fields' : 'that field'}.`;
      }
      const fixed = mg.ensureDatabaseUrl(ctx.root);
      if (fixed) { ctx.log(`🩺 ${fixed}`); note += `\n\nℹ️ DB config: ${fixed}`; }
    }
  } catch { /* guards are best-effort — never block a write */ }
  return note;
}
