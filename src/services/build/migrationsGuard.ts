// [SCOPE] Migrations Guard — "don't let the AI edit your DB schema directly." Detects (a) the project's
// migration toolchain and (b) whether a file being written IS a schema/model file. When a schema is edited,
// we don't block the write — we DIRECT a proper migration follow-up (ordered, reversible, keeps local + prod
// in sync) via the toolchain's CLI, instead of leaving the schema silently edited. Heuristic + a couple of fs
// existence checks; no VS Code deps → unit-testable. The author of the "120 apps" post calls this the single
// most important backend habit; this makes it automatic instead of a thing the founder must remember.

import * as fs from 'fs';
import * as path from 'path';

export interface Toolchain { id: string; label: string; migrate: (name: string) => string; autogen: boolean; }
export interface MigrationAdvice { toolchain: string; command: string; autogen: boolean; note: string; }

const NONE: Toolchain = { id: 'none', label: '', migrate: () => '', autogen: false };

function has(root: string, rel: string): boolean { try { return fs.existsSync(path.join(root, rel)); } catch { return false; } }
function read(root: string, rel: string): string | null { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; } }
function pkgHas(root: string, dep: string): boolean {
  try {
    const p = path.join(root, 'package.json');
    if (!fs.existsSync(p)) { return false; }
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return !!((j.dependencies && j.dependencies[dep]) || (j.devDependencies && j.devDependencies[dep]));
  } catch { return false; }
}
/** A short, file-safe migration name derived from the change description. */
function slug(s: string): string {
  return (s || 'change').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'change';
}

/** Identify the project's migration toolchain from its files/deps. `autogen` = the tool can produce the
 *  migration from the schema diff automatically (vs. the dev hand-writing the migration body). */
export function detectToolchain(root: string): Toolchain {
  if (has(root, 'prisma/schema.prisma') || has(root, 'schema.prisma') || pkgHas(root, 'prisma')) {
    return { id: 'prisma', label: 'Prisma', autogen: true, migrate: (n) => `npx prisma migrate dev --name ${slug(n)}` };
  }
  if (has(root, 'manage.py')) {
    return { id: 'django', label: 'Django', autogen: true, migrate: () => `python manage.py makemigrations && python manage.py migrate` };
  }
  if (has(root, 'alembic.ini')) {
    return { id: 'alembic', label: 'Alembic', autogen: true, migrate: (n) => `alembic revision --autogenerate -m "${slug(n)}" && alembic upgrade head` };
  }
  if (has(root, 'bin/rails') || (has(root, 'Gemfile') && has(root, 'config/application.rb'))) {
    return { id: 'rails', label: 'Rails', autogen: false, migrate: (n) => `bin/rails generate migration ${slug(n)} && bin/rails db:migrate` };
  }
  if (pkgHas(root, 'drizzle-orm') || pkgHas(root, 'drizzle-kit')) {
    return { id: 'drizzle', label: 'Drizzle', autogen: true, migrate: () => `npx drizzle-kit generate && npx drizzle-kit migrate` };
  }
  if (pkgHas(root, 'typeorm')) {
    return { id: 'typeorm', label: 'TypeORM', autogen: true, migrate: (n) => `npx typeorm migration:generate migrations/${slug(n)}` };
  }
  if (pkgHas(root, 'sequelize') || pkgHas(root, 'sequelize-cli')) {
    return { id: 'sequelize', label: 'Sequelize', autogen: false, migrate: (n) => `npx sequelize-cli migration:generate --name ${slug(n)}` };
  }
  if (pkgHas(root, 'knex')) {
    return { id: 'knex', label: 'Knex', autogen: false, migrate: (n) => `npx knex migrate:make ${slug(n)}` };
  }
  return NONE;
}

/** Is this write a DB schema/model file for the detected toolchain? Heuristic by path + content. */
export function isSchemaFile(filePath: string, content: string, tc: Toolchain): boolean {
  const p = filePath.replace(/\\/g, '/').toLowerCase();
  const base = p.split('/').pop() || '';
  const c = content || '';
  switch (tc.id) {
    case 'prisma': return p.endsWith('.prisma');
    case 'django': return base === 'models.py' || /\/models\//.test(p);
    case 'alembic': return base === 'models.py' || /\/models?\//.test(p) || /\bclass\s+\w+\((?:base|db\.model)\b/i.test(c);
    case 'rails': return base === 'schema.rb' || (/\/app\/models\//.test(p) && /(ApplicationRecord|ActiveRecord::Base)/.test(c));
    case 'drizzle': return /\b(pgTable|sqliteTable|mysqlTable)\s*\(/.test(c) || /(^|\/)schema\.(ts|js)$/.test(p);
    case 'typeorm': return /@Entity\s*\(/.test(c) || /\/entit(?:y|ies)\//.test(p);
    case 'sequelize': return /sequelize\.define\s*\(|extends\s+Model\b|Model\.init\s*\(/.test(c) || /\/models?\//.test(p);
    case 'knex': return /(schema|model)/.test(p) && /(createTable|table\.\w+\()/.test(c) && !/\/migrations?\//.test(p);
    default: return false;
  }
}

/** A raw .sql file that creates/alters tables — schema-as-code with no ORM. */
export function looksLikeRawSqlSchema(filePath: string, content: string): boolean {
  const base = (filePath.split(/[\\/]/).pop() || '').toLowerCase();
  return base.endsWith('.sql') && /\b(create\s+table|alter\s+table|drop\s+table)\b/i.test(content || '')
    && !/[\\/]migrations?[\\/]/i.test(filePath);
}

/** Migration follow-up advice for a confirmed schema write: the command + plain-English why. */
export function migrationAdvice(tc: Toolchain, changeName: string): MigrationAdvice {
  const command = tc.migrate(changeName);
  const note = tc.autogen
    ? `This is a database **schema change**. Don't leave the schema edited directly — generate a migration so the change is ordered, reversible, and keeps every database (local + production) in sync. Run: \`${command}\``
    : `This is a database **schema change**. ${tc.label} doesn't auto-generate from the model, so put the change in a migration file (ordered + reversible) rather than only editing the schema. Start it with: \`${command}\``;
  return { toolchain: tc.label, command, autogen: tc.autogen, note };
}

// Prisma operators / nesting keywords that appear as object keys but are NOT model fields.
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

/** Field names declared across all `model` blocks in the on-disk Prisma schema. */
function prismaSchemaFields(root: string): Set<string> | null {
  const schema = read(root, 'prisma/schema.prisma') ?? read(root, 'schema.prisma');
  if (!schema) { return null; }
  return prismaFieldsFromContent(schema);
}

/** Fields the incoming schema write would REMOVE vs. the current schema — i.e. a DESTRUCTIVE change (the
 *  migration will DROP that column and its data). This is the #1 way an "add a field" task silently regresses:
 *  the AI rewrites the whole model from a stale copy, omits an existing column, and `prisma migrate dev` drops
 *  it WITHOUT anyone noticing (non-interactive run = auto-confirm the data-loss warning). Compares two content
 *  strings (the previous on-disk schema vs. the about-to-be-written one) so it's pure/testable. Prisma-only
 *  (the toolchain we can parse reliably); [] when either side has no model block. Never throws. */
export function droppedSchemaFields(prevContent: string | null | undefined, newContent: string): string[] {
  try {
    if (!prevContent) { return []; }
    const before = prismaFieldsFromContent(prevContent);
    const after = prismaFieldsFromContent(newContent);
    if (before.size === 0 || after.size === 0) { return []; } // couldn't parse one side — don't guess
    return [...before].filter((f) => !after.has(f));
  } catch { return []; }
}

/** Object keys used inside `data:{…}` / `where:{…}` blocks (balanced-brace scan, so spreads count too). */
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

/** Inverse of the schema guard: code that references a Prisma model field NOT in schema.prisma will fail at
 *  runtime ("Unknown argument") — the classic "AI added the field in code but forgot the schema + migration".
 *  Returns the missing field names (deduped), or [] when fine / not a Prisma file. Conservative + best-effort. */
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

/** A `prisma migrate dev` invocation that will APPLY changes (not the preview `--create-only` form). This is
 *  the command that can apply a destructive DROP non-interactively (a spawned shell has no confirm prompt). */
export function isApplyingPrismaMigrate(command: string): boolean {
  return /\bprisma\b[\s\S]*\bmigrate\s+dev\b/.test(command || '') && !/--create-only\b/.test(command || '');
}

/** Does this command APPLY a migration (any common toolchain)? Used to confirm the agent actually ran the
 *  migration after a schema change, instead of just claiming it did. Broader than isApplyingPrismaMigrate. */
export function looksLikeMigrationApply(command: string): boolean {
  const c = command || '';
  return /\bprisma\s+migrate\s+(dev|deploy)\b/.test(c)
    || /manage\.py\s+migrate\b/.test(c)               // Django
    || /\balembic\s+upgrade\b/.test(c)                // Alembic
    || /\bdb:migrate\b/.test(c)                       // Rails / Sequelize
    || /\bdrizzle-kit\s+(migrate|push)\b/.test(c)     // Drizzle
    || /\btypeorm\s+migration:run\b/.test(c)          // TypeORM
    || /\bknex\s+migrate:(latest|up)\b/.test(c)       // Knex
    || /\bprisma\s+db\s+push\b/.test(c);              // Prisma db push (no migration file, but applies schema)
}

/** Data-loss items named in a generated migration's SQL. Prisma writes a `Warnings:` header AND uses
 *  RedefineTables on SQLite (so a dropped column never appears as a literal `DROP COLUMN`) — so we key on the
 *  human warning text first, then explicit DROPs. Returns [] for a safe migration. */
export function migrationDataLoss(sql: string): string[] {
  const s = sql || '';
  const hits: string[] = [];
  for (const m of s.matchAll(/about to drop the (column|table)\s+`?(\w+)`?/gi)) { hits.push(`${m[1]} \`${m[2]}\``); }
  for (const m of s.matchAll(/\bDROP\s+(COLUMN|TABLE)\b\s+"?(\w+)"?/gi)) { hits.push(`${m[1].toLowerCase()} \`${m[2]}\``); }
  if (!hits.length && /\bwill be lost\b/i.test(s)) { hits.push('existing data'); }
  return [...new Set(hits)];
}

/** Path to the most-recently-created migration.sql under the project's prisma/migrations, or null. */
export function newestMigrationSqlPath(root: string): string | null {
  try {
    const dir = path.join(root, 'prisma', 'migrations');
    if (!fs.existsSync(dir)) { return null; }
    const subs = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d/.test(e.name)).map((e) => e.name).sort();
    if (!subs.length) { return null; }
    const sql = path.join(dir, subs[subs.length - 1], 'migration.sql');
    return fs.existsSync(sql) ? sql : null;
  } catch { return null; }
}

/** Make a scaffolded Prisma project actually runnable when its schema uses `env("DATABASE_URL")`. A schema
 *  with `url = env("DATABASE_URL")` but no working .env is broken out of the box: migrate/test/run all fail
 *  on the missing var (vitest doesn't load .env; @prisma/client doesn't auto-load it at runtime there). For
 *  SQLite we hardcode the standard local path (zero env machinery → works in CLI, app, AND tests). For other
 *  providers we leave a clearly-marked .env placeholder (the real URL can't be guessed). Idempotent: once the
 *  schema is hardcoded / the var is present, it does nothing. Returns a human summary if it changed something,
 *  else null. Best-effort, never throws. */
export function ensureDatabaseUrl(root: string): string | null {
  try {
    const schemaPath = has(root, 'prisma/schema.prisma') ? path.join(root, 'prisma', 'schema.prisma')
      : has(root, 'schema.prisma') ? path.join(root, 'schema.prisma') : null;
    if (!schemaPath) { return null; }
    let schema = fs.readFileSync(schemaPath, 'utf8');
    if (!/url\s*=\s*env\(\s*["']DATABASE_URL["']\s*\)/.test(schema)) { return null; } // not using env() → fine
    const provider = (schema.match(/provider\s*=\s*["'](\w+)["']/) || [])[1] || '';
    if (provider === 'sqlite') {
      schema = schema.replace(/url\s*=\s*env\(\s*["']DATABASE_URL["']\s*\)/, 'url      = "file:./dev.db"');
      fs.writeFileSync(schemaPath, schema);
      return 'Set the SQLite database URL directly in schema.prisma (it was env("DATABASE_URL") with no .env, which breaks migrate and tests).';
    }
    const envPath = path.join(root, '.env');
    const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (/^\s*DATABASE_URL\s*=/m.test(existing)) { return null; } // already defined
    const placeholder = `DATABASE_URL="" # TODO: set your ${provider || 'database'} connection string\n`;
    fs.writeFileSync(envPath, existing ? existing.replace(/\s*$/, '') + '\n' + placeholder : placeholder);
    return `Added .env with a DATABASE_URL placeholder for ${provider || 'your database'} (schema uses env("DATABASE_URL")).`;
  } catch { return null; }
}

/** Convenience for a write hook: returns the user-facing `log` line + the `note` directive to append to the
 *  tool result (so the agent generates the migration next), or null when this isn't a schema change. */
export function migrationHook(root: string, filePath: string, content: string, changeName: string): { log: string; note: string } | null {
  const adv = guardSchemaWrite(root, filePath, content, changeName);
  if (!adv) { return null; }
  return {
    log: `🗄️ **Database schema change detected** (${adv.toolchain}). I'll generate a migration instead of editing the database directly — keeps it reversible and your databases in sync.`,
    note: `\n\n⚠️ MIGRATION REQUIRED — ${adv.note} Run that now with run_command BEFORE you finish; do not leave the schema edited without a migration.`,
  };
}

/** Hook entry: returns migration advice if this write is a schema change that should route through a
 *  migration, else null (not a schema file / no toolchain). Best-effort, never throws. */
export function guardSchemaWrite(root: string, filePath: string, content: string, changeName: string): MigrationAdvice | null {
  try {
    const tc = detectToolchain(root);
    if (tc.id !== 'none' && isSchemaFile(filePath, content, tc)) { return migrationAdvice(tc, changeName); }
    if (tc.id === 'none' && looksLikeRawSqlSchema(filePath, content)) {
      const name = slug(changeName);
      return {
        toolchain: 'SQL', autogen: false,
        command: `mkdir -p migrations && touch "migrations/$(date +%Y%m%d%H%M%S)_${name}.sql"`,
        note: `This looks like a raw SQL **schema change**. Keep schema changes in ordered \`migrations/NNNN_name.sql\` files (reversible, run in order) instead of editing one schema file, so local and production stay in sync.`,
      };
    }
    return null;
  } catch { return null; }
}
