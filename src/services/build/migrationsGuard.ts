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
