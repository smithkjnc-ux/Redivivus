// [SCOPE] Built-in Tools for the Agentic Architecture.
// These tools are exposed to the Agent LLM so it can read/write files and run commands autonomously.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NETWORK_TOOLS } from './agentToolsNetwork';
import { resolveToolGap } from './toolGapEscalation.js';
import { buildToolGapDeps, noteToolGapOnFailure } from './agentToolGap.js';
import { runShell, trimForModel, IDLE_MS, HARD_MS } from './agentToolsExec.js';

// [PHANTOM-GUARD] A weak model often invents a CONVENTIONAL layout (src/routes/, src/utils/validation.ts,
// controllers/…) that THIS project doesn't use, then edits/reads files that don't exist and gives up. When a
// file isn't found, append the project's REAL file list so the model corrects to reality instead of guessing
// another phantom. Best-effort; returns '' if the lister isn't available.
async function realFilesHint(root: string): Promise<string> {
  try {
    const { listSourceFiles } = await import('../workspace/codebaseSearch.js');
    const files = listSourceFiles(root, false, 30).map((f: any) => f.rel);
    if (files.length) {
      return ` This project's ACTUAL files are: ${files.join(', ')}. Do NOT assume a conventional layout — there is no routes/, controllers/, or utils/ here unless listed above. Read REAL paths only (list_dir / read_file).`;
    }
  } catch { /* lister unavailable — fall back to the plain error */ }
  return '';
}

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
  parameters: string; // [LEGACY] text description kept for fallback rendering
  // [NATIVE] JSON Schema used for native API function calling (Anthropic/Gemini/OpenAI dialects).
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  execute: (args: any, context: AgentContext) => Promise<string>;
}

/** Shared post-write schema/migration guards for BOTH write_file and edit_file (so the two paths can never
 *  drift). `before` is the file's prior content (null for a new file). Logs via ctx.log, sets ctx.schemaChanged,
 *  and returns a note to append to the tool result. Best-effort — never throws. */
async function schemaWriteGuards(ctx: AgentContext, rel: string, before: string | null, after: string): Promise<string> {
  let note = '';
  try {
    const mg = await import('../build/migrationsGuard.js');
    const mh = mg.migrationHook(ctx.root, rel, after, ctx.task);
    if (mh) { ctx.log(mh.log); note += mh.note; ctx.schemaChanged = true; } // [MIGRATION-GUARD]
    // Inverse: code using a Prisma field that's NOT in the schema fails at runtime ("Unknown argument").
    const missing = mg.schemaCodeMismatch(ctx.root, rel, after);
    if (missing.length) {
      const list = missing.map((f: string) => `\`${f}\``).join(', ');
      const plural = missing.length > 1;
      ctx.log(`⚠️ **Schema mismatch** — this code uses ${list}, which ${plural ? 'are' : 'is'} not in your Prisma schema yet.`);
      note += `\n\n⚠️ SCHEMA MISMATCH — your code uses Prisma field(s) ${list} that ${plural ? 'are' : 'is'} not declared in prisma/schema.prisma. Add ${plural ? 'them' : 'it'} to the schema and run \`npx prisma migrate dev\` BEFORE relying on this code, or it fails at runtime with "Unknown argument".`;
    }
    if (/\.prisma$/.test(rel)) {
      // Destructive: a rewrite/edit that REMOVES an existing field → migrate will DROP that column + data.
      const dropped = mg.droppedSchemaFields(before, after);
      if (dropped.length) {
        const list = dropped.map((f: string) => `\`${f}\``).join(', ');
        const plural = dropped.length > 1;
        ctx.log(`🛑 **Destructive schema change** — this change REMOVES existing field(s) ${list}. Migrating will DROP ${plural ? 'those columns' : 'that column'} and all ${plural ? 'their' : 'its'} data.`);
        note += `\n\n🛑 DESTRUCTIVE SCHEMA CHANGE — your new schema REMOVES field(s) ${list} that currently exist in prisma/schema.prisma. Running the migration will DROP ${plural ? 'those columns' : 'that column'} AND ALL ${plural ? 'THEIR' : 'ITS'} DATA. If you only meant to ADD a field, you deleted ${plural ? 'these' : 'this'} by mistake — restore ${plural ? 'them' : 'it'} BEFORE migrating. Only proceed with the removal if the task explicitly asked to delete ${plural ? 'those fields' : 'that field'}.`;
      }
      // Scaffold-doctor: make a project using env("DATABASE_URL") with no working .env runnable.
      const fixed = mg.ensureDatabaseUrl(ctx.root);
      if (fixed) { ctx.log(`🩺 ${fixed}`); note += `\n\nℹ️ DB config: ${fixed}`; }
    }
  } catch { /* guards are best-effort — never block a write */ }
  return note;
}

export const BUILT_IN_TOOLS: AgentTool[] = [
  {
    name: 'read_file',
    description: 'Reads the contents of a file in the workspace.',
    parameters: '{ "filePath": "string (relative path)" }',
    inputSchema: { type: 'object', properties: { filePath: { type: 'string', description: 'Relative path to the file within the project' } }, required: ['filePath'] },
    execute: async (args: any, ctx: AgentContext) => {
      const absPath = path.join(ctx.root, args.filePath);
      if (!fs.existsSync(absPath)) { return `Error: File ${args.filePath} does not exist.${await realFilesHint(ctx.root)}`; }
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
    inputSchema: { type: 'object', properties: { filePath: { type: 'string', description: 'Relative path to write the file to' }, content: { type: 'string', description: 'Full content to write to the file' } }, required: ['filePath', 'content'] },
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
        // Schema/migration guards (migration hook, destructive-drop, scaffold-doctor, code↔schema mismatch).
        const migrationNote = await schemaWriteGuards(ctx, args.filePath, prevSchema, contentToWrite);
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
    inputSchema: { type: 'object', properties: { command: { type: 'string', description: 'Shell command to execute in the project root directory' } }, required: ['command'] },
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
    inputSchema: { type: 'object', properties: { question: { type: 'string', description: 'The question or clarification to ask the user' } }, required: ['question'] },
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
    inputSchema: { type: 'object', properties: { dirPath: { type: 'string', description: "Relative directory path to list, e.g. '.' for the project root" } }, required: ['dirPath'] },
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
    inputSchema: { type: 'object', properties: { filePath: { type: 'string', description: 'Relative path to the file' }, startLine: { type: 'number', description: '1-based line number to start reading from' }, endLine: { type: 'number', description: '1-based inclusive line number to stop reading at' } }, required: ['filePath', 'startLine', 'endLine'] },
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
  {
    // [CROSS-AI] edit_file is the PREFERRED way to change an existing file. Asking a model to regurgitate a
    // whole file (write_file) is the hardest thing you can ask it — capable-but-not-frontier models (Gemini,
    // etc.) drop existing fields, truncate, or recreate the file in the wrong place. A small SEARCH/REPLACE
    // can't drop unrelated code and works regardless of model strength. Backed by the build path's fuzzy
    // surgical-edit engine (applySurgicalEdits) so whitespace drift still matches.
    name: 'edit_file',
    description: 'PREFERRED for changing an EXISTING file: replaces one exact snippet with new text (a surgical SEARCH/REPLACE) and leaves the rest of the file untouched. Always use this instead of write_file when the file already exists — it cannot accidentally drop other code and works even for large files. `search` must match the current file text EXACTLY (read the file first; include enough surrounding lines to be unique). To DELETE code, set replace to "". For a brand-NEW file, use write_file.',
    parameters: '{ "filePath": "string (relative path)", "search": "string (exact existing snippet to find)", "replace": "string (text to put in its place; \\"\\" to delete)" }',
    inputSchema: { type: 'object', properties: { filePath: { type: 'string', description: 'Relative path of the existing file to edit' }, search: { type: 'string', description: 'Exact snippet from the current file to find — read the file first, copy character-for-character including indentation' }, replace: { type: 'string', description: 'New text to put in place of the search snippet; empty string to delete the snippet' } }, required: ['filePath', 'search', 'replace'] },
    execute: async (args: any, ctx: AgentContext) => {
      const rel = (args.filePath || '').trim();
      const absPath = path.join(ctx.root, rel);
      if (!rel) { return 'Error: filePath is required.'; }
      if (!fs.existsSync(absPath)) { return `Error: ${rel} does not exist. To create a new file use write_file; edit_file only changes existing files.${await realFilesHint(ctx.root)}`; }
      if (typeof args.search !== 'string' || args.search === '') { return 'Error: "search" must be a non-empty exact snippet copied from the current file (read it first).'; }
      try {
        const before = fs.readFileSync(absPath, 'utf8');
        const { applySurgicalEdits } = await import('../build/surgicalEditService.js');
        const [res] = applySurgicalEdits([{ filePath: rel, searchBlock: args.search, replaceBlock: typeof args.replace === 'string' ? args.replace : '' }], ctx.root);
        if (!res || !res.success) {
          return `Edit failed: ${res?.error || 'the search text was not found'}. Read the file (read_file / read_file_lines) and copy the snippet EXACTLY, including indentation — or if the file is small, use write_file to rewrite it.`;
        }
        ctx.modifiedFiles.add(rel);
        ctx.log(`✏️ Edited \`${rel}\`${res.usedFallback ? ' (fuzzy match)' : ''}`);
        try { const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath)); await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch { /* non-blocking */ }
        const after = fs.readFileSync(absPath, 'utf8');
        const note = await schemaWriteGuards(ctx, rel, before, after);
        return `Successfully edited ${rel}.${note}`;
      } catch (e: any) { return `Error editing file: ${e.message}`; }
    }
  },
  ...NETWORK_TOOLS,
];

export function getToolInstructions(): string {
  return BUILT_IN_TOOLS.map(t => 
    `- **${t.name}**: ${t.description}\n  Args: ${t.parameters}`
  ).join('\n\n');
}
