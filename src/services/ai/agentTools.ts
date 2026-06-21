// [SCOPE] Built-in Tools for the Agentic Architecture.
// These tools are exposed to the Agent LLM so it can read/write files and run commands autonomously.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NETWORK_TOOLS } from './agentToolsNetwork';
import { resolveToolGap } from './toolGapEscalation.js';
import { buildToolGapDeps, noteToolGapOnFailure } from './agentToolGap.js';
import { runShell, trimForModel, IDLE_MS, HARD_MS } from './agentToolsExec.js';

export interface AgentContext {
  root: string;
  task: string;
  log: (msg: string) => void;
  modifiedFiles: Set<string>;
  snapshotId?: string;
  routing?: any; // RoutingService instance
  blueprintContext?: string;
  // [TOOL-GAP] The Supervisor's approved plan/prescription (set by executeAgentTask). run_command
  // checks commands against this; a divergence triggers the Tool-Gap escalation.
  plan?: string;
  // [COMPLETION-GUARD] True for handoffs whose whole purpose is to RUN/verify in the environment. The
  // agent loop refuses to accept a "final answer" from such a task until at least one command has run.
  requiresExecution?: boolean;
  // [TOOL-GAP] Live per-session cost choice for the costlier-alternate tier. Supplied by the chat
  // orchestrator (clarify bridge). If absent, the gap conservatively resolves to "wait".
  askUser?: (prompt: string) => Promise<'alternate' | 'wait'>;
  // [MIGRATION-GUARD] Set true when a DB schema/model file is edited (migrationHook fires), and true again
  // once an actual migrate command runs successfully. The completion guard refuses a "final answer" while a
  // schema was changed but never migrated — the agent must RUN the migration, not claim it ran. (A weaker
  // model failed-over to was fabricating a migration it never executed.)
  schemaChanged?: boolean;
  migrationRan?: boolean;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: string; // JSON schema or description of args
  execute: (args: any, context: AgentContext) => Promise<string>;
}

export const BUILT_IN_TOOLS: AgentTool[] = [
  {
    name: 'read_file',
    description: 'Reads the contents of a file in the workspace.',
    parameters: '{ "filePath": "string (relative path)" }',
    execute: async (args: any, ctx: AgentContext) => {
      const absPath = path.join(ctx.root, args.filePath);
      if (!fs.existsSync(absPath)) { return `Error: File ${args.filePath} does not exist.`; }
      try {
        const content = fs.readFileSync(absPath, 'utf8');
        return content;
      } catch (e: any) {
        return `Error reading file: ${e.message}`;
      }
    }
  },
  {
    name: 'write_file',
    description: 'Writes or overwrites a file in the workspace with new content. Use this to create new files or completely replace existing ones.',
    parameters: '{ "filePath": "string (relative path)", "content": "string (file content)" }',
    execute: async (args: any, ctx: AgentContext) => {
      const absPath = path.join(ctx.root, args.filePath);
      try {
        if (!ctx.snapshotId) {
          const { createSnapshot } = await import('../../core/build/chatPanelBuildWriter.js');
          ctx.snapshotId = createSnapshot(ctx.root, `Agent task: ${ctx.task.substring(0, 50)}`, args.filePath);
        }
        
        let contentToWrite = args.content || '';

        // [FIX] Strip markdown fences: AIs frequently wrap write_file content in ```lang\n...\n```.
        // extractCodeFromResponse handles closed/unclosed fences; is a no-op for fence-free content.
        if (contentToWrite.trimStart().startsWith('```')) {
          const { extractCodeFromResponse } = await import('../../core/build/chatPanelBuildInference.js');
          contentToWrite = extractCodeFromResponse(contentToWrite);
        }

        // [Redivivus] Guardian AI Oversight
        if (ctx.routing && ctx.routing.isGuardianActive()) {
          ctx.log(`🛡️ **Guardian AI** reviewing proposed write to \`${args.filePath}\`...`);
          try {
            const review = await ctx.routing.guardianReview(
              ctx.task,
              contentToWrite,
              'agent',
              ctx.blueprintContext || ''
            );
            if (review && !review.passed && review.correctedText) {
              const issues = review.issues && review.issues.length ? review.issues.join('; ') : 'Quality/correctness improvements';
              ctx.log(`⚠️ **Guardian AI** corrected proposed write to \`${args.filePath}\` (Issues: ${issues})`);
              
              // Extract the code block safely if it is wrapped in markdown formatting by the Guardian
              const { extractCodeFromResponse } = await import('../../core/build/chatPanelBuildInference.js');
              contentToWrite = extractCodeFromResponse(review.correctedText);
            } else {
              ctx.log(`🟢 **Guardian AI** approved proposed write to \`${args.filePath}\``);
            }
          } catch (e: any) {
            ctx.log(`⚠️ **Guardian AI** review skipped due to an error: ${e.message}`);
          }
        }

        const dir = path.dirname(absPath);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        // [MIGRATIONS-GUARD] Capture the PREVIOUS schema before we overwrite it, so we can detect a write that
        // silently REMOVES an existing field (a destructive DROP COLUMN). Must read before writeFileSync.
        const prevSchema = (/\.prisma$/.test(args.filePath) && fs.existsSync(absPath))
          ? (() => { try { return fs.readFileSync(absPath, 'utf8'); } catch { return null; } })() : null;
        fs.writeFileSync(absPath, contentToWrite, 'utf8');
        ctx.modifiedFiles.add(args.filePath);
        ctx.log(`✅ Wrote \`${args.filePath}\``);
        // [Redivivus] Live preview: open written file beside the chat immediately.
        try { const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath)); await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch { /* non-blocking */ }
        // [MIGRATIONS-GUARD] If this write is a DB schema change, don't leave the schema edited directly —
        // direct the agent to follow up with a proper migration (ordered, reversible, keeps local+prod in
        // sync) via run_command. Rides on the tool result so the agent acts on it next. Best-effort.
        let migrationNote = '';
        try {
          const { migrationHook, schemaCodeMismatch, droppedSchemaFields } = await import('../build/migrationsGuard.js');
          const mh = migrationHook(ctx.root, args.filePath, contentToWrite, ctx.task);
          if (mh) { ctx.log(mh.log); migrationNote = mh.note; ctx.schemaChanged = true; } // [MIGRATION-GUARD]
          // [MIGRATIONS-GUARD] Destructive-change guard: a schema rewrite that DROPS an existing field will,
          // on migrate, drop that column AND its data. The usual cause is the AI rewriting the whole model
          // from a stale copy and accidentally omitting a column (e.g. adding `priority` but losing `dueDate`).
          // Warn loudly + direct the agent to restore it BEFORE migrating. (Doesn't block the write — the
          // earliest safe intervention is to tell the agent to fix the schema before it runs the migration.)
          const dropped = droppedSchemaFields(prevSchema, contentToWrite);
          if (dropped.length) {
            const list = dropped.map((f: string) => `\`${f}\``).join(', ');
            const plural = dropped.length > 1;
            ctx.log(`🛑 **Destructive schema change** — this rewrite REMOVES existing field(s) ${list}. Migrating will DROP ${plural ? 'those columns' : 'that column'} and all ${plural ? 'their' : 'its'} data.`);
            migrationNote += `\n\n🛑 DESTRUCTIVE SCHEMA CHANGE — your new schema REMOVES field(s) ${list} that currently exist in prisma/schema.prisma. Running the migration will DROP ${plural ? 'those columns' : 'that column'} AND ALL ${plural ? 'THEIR' : 'ITS'} DATA. If you only meant to ADD a field, you deleted ${plural ? 'these' : 'this'} by mistake — put ${plural ? 'them' : 'it'} back in the model and rewrite the file BEFORE migrating. Only proceed with the removal if the task explicitly asked to delete ${plural ? 'those fields' : 'that field'}.`;
          }
          // [SCAFFOLD-DOCTOR] A Prisma schema that uses env("DATABASE_URL") with no working .env is broken out
          // of the box (migrate/test/run fail on the missing var). Make it runnable: hardcode the SQLite url,
          // or drop a .env placeholder for other providers. Idempotent — no-op once it's already fine.
          if (/\.prisma$/.test(args.filePath)) {
            const fixed = (await import('../build/migrationsGuard.js')).ensureDatabaseUrl(ctx.root);
            if (fixed) { ctx.log(`🩺 ${fixed}`); migrationNote += `\n\nℹ️ DB config: ${fixed}`; }
          }
          // [MIGRATIONS-GUARD] Inverse: code using a DB field that's NOT in the schema fails at runtime — the
          // "added it in code but forgot the schema/migration" mistake. Nudge to fix the schema first.
          const missing = schemaCodeMismatch(ctx.root, args.filePath, contentToWrite);
          if (missing.length) {
            const list = missing.map((f: string) => `\`${f}\``).join(', ');
            const plural = missing.length > 1;
            ctx.log(`⚠️ **Schema mismatch** — this code uses ${list}, which ${plural ? 'are' : 'is'} not in your Prisma schema yet.`);
            migrationNote += `\n\n⚠️ SCHEMA MISMATCH — your code uses Prisma field(s) ${list} that ${plural ? 'are' : 'is'} not declared in prisma/schema.prisma. Add ${plural ? 'them' : 'it'} to the schema and run \`npx prisma migrate dev\` BEFORE relying on this code, or it fails at runtime with "Unknown argument".`;
          }
        } catch { /* guard is best-effort — never block a write */ }
        return `Successfully wrote to ${args.filePath}.${migrationNote}`;
      } catch (e: any) {
        return `Error writing file: ${e.message}`;
      }
    }
  },
  {
    name: 'run_command',
    description: 'Executes a shell command in the project directory and returns the output (e.g. npm install, gcc).',
    parameters: '{ "command": "string (shell command)" }',
    execute: async (args: any, ctx: AgentContext) => {
      const requested: string = args.command || '';
      // [TOOL-GAP] Before running, check the command against the Supervisor's approved plan. In-plan →
      // run as-is. Out-of-plan → escalate: Supervisor re-prescription → live user cost-choice → owner flag.
      const outcome = await resolveToolGap(requested, ctx.plan || '', ctx.task, buildToolGapDeps(ctx));
      if (outcome.kind === 'blocked') {
        ctx.log(outcome.message);
        return `_PAUSE_ASK_USER_${outcome.message}`; // end the loop — owner must resolve the gap
      }
      if (outcome.kind === 'wait') {
        const msg = '⏸️ Holding — you chose to wait rather than spend extra tokens on an alternate approach.';
        ctx.log(msg);
        return `_PAUSE_ASK_USER_${msg}`;
      }
      let command = (outcome.kind === 'proceed' || outcome.kind === 'proceed-costly') ? outcome.command : requested;
      if (command !== requested) {
        // [ALT-GUARD] The Supervisor re-prescription (especially weaker models) keeps rewriting the agent's
        // perfectly-good commands into worse ones: `npm test` → `npx jest`, `npm install dotenv` → `npm
        // install`, `rm f` → `python -c …`, `yarn install` on an npm project, etc. A re-prescription is only
        // worth honouring when the AGENT'S ORIGINAL command is actually BLOCKED by a missing tool — that's the
        // one case where an installed alternate genuinely helps. So:
        //   • original runnable (all tools present) → run the ORIGINAL; ignore the swap entirely.
        //   • original blocked, alternate runnable  → use the alternate (it unblocks).
        //   • original blocked, alternate also blocked → keep the original and let it fail honestly so the
        //     real missing tool is recorded (don't mask it behind a second broken command).
        try {
          const { extractMissingCapabilities } = await import('./agentToolGapExtract.js');
          const reqMissing = extractMissingCapabilities(requested).filter((c: any) => c && c.name);
          if (reqMissing.length === 0) {
            ctx.log(`↪️ Keeping \`${requested}\` — it runs as-is, so the suggested alternate \`${command}\` isn't needed.`);
            command = requested;
          } else {
            const altMissing = extractMissingCapabilities(command).filter((c: any) => c && c.name);
            if (altMissing.length) {
              ctx.log(`↪️ Ignoring suggested alternate \`${command}\` — it needs ${altMissing.map((c: any) => `\`${c.name}\``).join(', ')} which isn't installed. Keeping \`${requested}\`.`);
              command = requested;
            }
          }
        } catch { /* best-effort — if the probe fails, fall through to the alternate as before */ }
      }
      if (command !== requested) { ctx.log(`↪️ Using an alternate approach: \`${command}\``); }
      // [MIGRATIONS-GUARD] Destructive-migration backstop. `prisma migrate dev` auto-applies a DROP
      // COLUMN/TABLE non-interactively (a spawned shell has no confirm prompt), so a data-losing migration
      // can run SILENTLY. PREVIEW it with --create-only, scan the generated SQL, and if it drops data: discard
      // the preview and PAUSE for the user instead of applying. A clean migration falls through and applies
      // normally below. Best-effort — any error here just proceeds to the normal run.
      try {
        const mg = await import('../build/migrationsGuard.js');
        if (mg.isApplyingPrismaMigrate(command)) {
          const before = mg.newestMigrationSqlPath(ctx.root);
          await runShell(`${command} --create-only`, ctx.root);
          const after = mg.newestMigrationSqlPath(ctx.root);
          if (after && after !== before) {
            const sql = fs.readFileSync(after, 'utf8');
            const loss = mg.migrationDataLoss(sql);
            try { fs.rmSync(path.dirname(after), { recursive: true, force: true }); } catch { /* */ }
            if (loss.length) {
              const what = loss.join(', ');
              ctx.log(`🛑 **Migration would lose data** — it drops ${what}. I previewed it, saw the data loss, and did NOT apply it.`);
              return `_PAUSE_ASK_USER_🛑 The migration for \`${command}\` would DROP ${what} AND LOSE THAT DATA. I did NOT apply it. If this is a MISTAKE (you only meant to add/keep fields), fix prisma/schema.prisma to keep ${what}, then retry. If dropping ${what} is genuinely intended, say so explicitly and I'll proceed.`;
            }
          }
        }
      } catch { /* preview is best-effort — fall through to the normal run */ }
      ctx.log(`🖥️ Running: \`${command}\``);
      // [EXEC] Streamed run: no 1MB buffer cap, and an INACTIVITY timeout (not a 15s wall-clock guillotine)
      // so real installs/builds/tests that keep printing can finish. See agentToolsExec.
      const { stdout, stderr, code, timedOut } = await runShell(command, ctx.root);
      if (timedOut) {
        const why = timedOut === 'idle'
          ? `produced no output for ${IDLE_MS / 1000}s (it looks hung)`
          : `ran past the ${Math.round(HARD_MS / 60000)}-minute ceiling`;
        return `Command timed out — ${why} — and was killed.\nSTDOUT:\n${trimForModel(stdout)}\nSTDERR:\n${trimForModel(stderr)}\nIf you are starting a server or long-running process, run it detached, e.g.: \`python3 -m http.server > server.log 2>&1 &\``;
      }
      if (code !== 0) {
        // A planned command can still fail because its tool isn't installed — log that one tool as a dead end.
        const gapNote = noteToolGapOnFailure(ctx, command, { code, stdout, stderr, message: `exited with code ${code}` });
        return `Command failed (exit ${code}):\nSTDOUT:\n${trimForModel(stdout)}\nSTDERR:\n${trimForModel(stderr)}${gapNote}`;
      }
      // [MIGRATION-GUARD] Record that an actual migration command ran (exit 0) — so the completion guard can
      // tell a real migration from a fabricated one. See looksLikeMigrationApply + agentService.
      try {
        const { looksLikeMigrationApply } = await import('../build/migrationsGuard.js');
        if (looksLikeMigrationApply(command)) { ctx.migrationRan = true; }
      } catch { /* best-effort flag */ }
      let result = '';
      if (stdout) { result += `STDOUT:\n${trimForModel(stdout)}\n`; }
      if (stderr) { result += `STDERR:\n${trimForModel(stderr)}\n`; }
      return result || 'Command completed successfully with no output.';
    }
  },
  {
    name: 'ask_user',
    description: 'Pauses the agent loop and asks the user for clarification or permission.',
    parameters: '{ "question": "string" }',
    execute: async (args: any, ctx: AgentContext) => {
      // This is a special tool. In the real agent loop, this might just yield the question back to chat.
      // For now, we return a system message indicating the loop should pause.
      return `_PAUSE_ASK_USER_${args.question}`;
    }
  },
  {
    name: 'list_dir',
    description: 'Lists all files and subdirectories in a directory.',
    parameters: '{ "dirPath": "string (relative path, e.g. \'.\' for root)" }',
    execute: async (args: any, ctx: AgentContext) => {
      const absPath = path.join(ctx.root, args.dirPath || '.');
      if (!fs.existsSync(absPath)) { return `Error: Directory ${args.dirPath} does not exist.`; }
      try {
        const files = fs.readdirSync(absPath, { withFileTypes: true });
        const list = files.map(f => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n');
        return list || 'Directory is empty.';
      } catch (e: any) {
        return `Error listing directory: ${e.message}`;
      }
    }
  },
  {
    name: 'read_file_lines',
    description: 'Reads a specific range of lines from a file. Use this instead of cat|tail when a file is large and you only need part of it.',
    parameters: '{ "filePath": "string (relative path)", "startLine": "number (1-based)", "endLine": "number (1-based, inclusive)" }',
    execute: async (args: any, ctx: AgentContext) => {
      const absPath = path.join(ctx.root, args.filePath);
      if (!fs.existsSync(absPath)) { return `Error: File ${args.filePath} does not exist.`; }
      try {
        const lines = fs.readFileSync(absPath, 'utf8').split('\n');
        const start = Math.max(0, (args.startLine || 1) - 1);
        const end = Math.min(lines.length, args.endLine || lines.length);
        return `Lines ${start + 1}-${end} of ${lines.length} total:\n${lines.slice(start, end).join('\n')}`;
      } catch (e: any) { return `Error reading file: ${e.message}`; }
    }
  },
  ...NETWORK_TOOLS,
];

export function getToolInstructions(): string {
  return BUILT_IN_TOOLS.map(t => 
    `- **${t.name}**: ${t.description}\n  Args: ${t.parameters}`
  ).join('\n\n');
}
