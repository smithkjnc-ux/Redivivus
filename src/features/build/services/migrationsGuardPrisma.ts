// [SCOPE] Prisma schema inspection + migration-command detection helpers.
// Extracted from migrationsGuard.ts (Rule 9 split — was 271 lines).
// Pure functions — no VS Code deps, fully unit-testable.

import * as fs from 'fs';
import * as path from 'path';

const PRISMA_KW = new Set([
  'connect', 'disconnect', 'create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany',
  'set', 'connectOrCreate', 'data', 'where', 'select', 'include', 'orderBy', 'increment', 'decrement',
  'multiply', 'divide', 'push', 'equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte', 'contains',
  'startsWith', 'endsWith', 'mode', 'some', 'every', 'none', 'is', 'isNot', 'AND', 'OR', 'NOT',
]);

/** Field names declared across all `model` blocks in a Prisma schema CONTENT string. */
export function prismaFieldsFromContent(content: string): Set<string> {
  const fields = new Set<string>();
  let inModel = false;
  for (const line of (content || '').split('\n')) {
    if (/^\s*model\s+\w+\s*\{/.test(line)) { inModel = true; continue; }
    if (inModel && /^\s*\}/.test(line)) { inModel = false; continue; }
    if (inModel) { const m = line.match(/^\s*(\w+)\s+\S/); if (m && !m[1].startsWith('@')) { fields.add(m[1]); } }
  }
  return fields;
}

function readSchema(root: string): string | null {
  try { return fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8'); } catch {}
  try { return fs.readFileSync(path.join(root, 'schema.prisma'), 'utf8'); } catch {}
  return null;
}

function prismaSchemaFields(root: string): Set<string> | null {
  const schema = readSchema(root);
  if (!schema) { return null; }
  return prismaFieldsFromContent(schema);
}

/** Fields the incoming schema write would REMOVE vs. the current schema (destructive DROP). Never throws. */
export function droppedSchemaFields(prevContent: string | null | undefined, newContent: string): string[] {
  try {
    if (!prevContent) { return []; }
    const before = prismaFieldsFromContent(prevContent);
    const after = prismaFieldsFromContent(newContent);
    if (before.size === 0 || after.size === 0) { return []; }
    return [...before].filter((f) => !after.has(f));
  } catch { return []; }
}

function dataWhereKeys(code: string): string[] {
  const keys: string[] = [];
  for (const m of code.matchAll(/\b(?:data|where)\s*:\s*\{/g)) {
    let depth = 0;
    const open = m.index! + m[0].length - 1;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '{') { depth++; }
      else if (code[i] === '}') { depth--; if (depth === 0) {
        for (const km of code.slice(open + 1, i).matchAll(/(?:^|[\s,{])(\w+)\s*:/g)) { keys.push(km[1]); }
        break;
      } }
    }
  }
  return keys;
}

/** Code that references a Prisma model field NOT in schema.prisma will fail at runtime.
 *  Returns missing field names (deduped), or [] when safe / not a Prisma file. Best-effort. */
export function schemaCodeMismatch(root: string, filePath: string, content: string): string[] {
  try {
    if (/\.prisma$/.test(filePath) || !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) { return []; }
    if (!/\bprisma\.\w+\.(create|update|upsert|createMany|updateMany)\b/.test(content)) { return []; }
    const fields = prismaSchemaFields(root);
    if (!fields || fields.size === 0) { return []; }
    const used = dataWhereKeys(content);
    return [...new Set(used.filter((k) => !fields.has(k) && !PRISMA_KW.has(k)))];
  } catch { return []; }
}

/** A `prisma migrate dev` invocation that APPLIES changes (not `--create-only` preview form). */
export function isApplyingPrismaMigrate(command: string): boolean {
  return /\bprisma\b[\s\S]*\bmigrate\s+dev\b/.test(command || '') && !/--create-only\b/.test(command || '');
}

/** Does this command APPLY a migration (any common toolchain)? */
export function looksLikeMigrationApply(command: string): boolean {
  const c = command || '';
  return /\bprisma\s+migrate\s+(dev|deploy)\b/.test(c)
    || /manage\.py\s+migrate\b/.test(c)
    || /\balembic\s+upgrade\b/.test(c)
    || /\bdb:migrate\b/.test(c)
    || /\bdrizzle-kit\s+(migrate|push)\b/.test(c)
    || /\btypeorm\s+migration:run\b/.test(c)
    || /\bknex\s+migrate:(latest|up)\b/.test(c)
    || /\bprisma\s+db\s+push\b/.test(c);
}
