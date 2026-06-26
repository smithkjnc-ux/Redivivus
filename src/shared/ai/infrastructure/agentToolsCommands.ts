// [SCOPE] Runtime/command agent tools — run_command, ask_user, list_dir, read_file_lines, edit_file.
// Extracted from agentTools.ts (Rule 9 split — was 361 lines).
// run_command includes Tool-Gap escalation and migrations-guard pre-flight checks.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentTool, AgentContext } from './agentTools.js';
import { realFilesHint, schemaWriteGuards } from './agentToolsHelpers.js';
import { resolveToolGap } from './toolGapEscalation.js';
import { buildToolGapDeps, noteToolGapOnFailure } from './agentToolGap.js';
import { runShell, trimForModel, IDLE_MS, HARD_MS } from './agentToolsExec.js';

export const COMMAND_TOOLS: AgentTool[] = [
  {
    name: 'run_command',
    description: 'Executes a shell command in the project directory and returns the output (e.g. npm install, gcc).',
    parameters: '{ "command": "string (shell command)" }',
    inputSchema: { type: 'object', properties: { command: { type: 'string', description: 'Shell command to execute in the project root directory' } }, required: ['command'] },
    execute: async (args: any, ctx: AgentContext) => {
      const requested: string = args.command || '';
      // [TOOL-GAP] Before running, check the command against the Supervisor's approved plan.
      const outcome = await resolveToolGap(requested, ctx.plan || '', ctx.task, buildToolGapDeps(ctx));
      if (outcome.kind === 'blocked') { ctx.log(outcome.message); return `_PAUSE_ASK_USER_${outcome.message}`; }
      if (outcome.kind === 'wait') {
        const msg = '⏸️ Holding — you chose to wait rather than spend extra tokens on an alternate approach.';
        ctx.log(msg); return `_PAUSE_ASK_USER_${msg}`;
      }
      let command = (outcome.kind === 'proceed' || outcome.kind === 'proceed-costly') ? outcome.command : requested;
      if (command !== requested) {
        // [ALT-GUARD] Only honour a re-prescription when the ORIGINAL command is actually BLOCKED.
        // If the original runs as-is, ignore the swap entirely.
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
      // [MIGRATIONS-GUARD] Preview prisma migrate dev with --create-only, scan for data loss, discard if found.
      try {
        const mg = await import('../../../features/chat/build/services/migrationsGuard.js');
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
      const { stdout, stderr, code, timedOut } = await runShell(command, ctx.root);
      if (timedOut) {
        const why = timedOut === 'idle'
          ? `produced no output for ${IDLE_MS / 1000}s (it looks hung)`
          : `ran past the ${Math.round(HARD_MS / 60000)}-minute ceiling`;
        return `Command timed out — ${why} — and was killed.\nSTDOUT:\n${trimForModel(stdout)}\nSTDERR:\n${trimForModel(stderr)}\nIf you are starting a server or long-running process, run it detached, e.g.: \`python3 -m http.server > server.log 2>&1 &\``;
      }
      if (code !== 0) {
        const gapNote = noteToolGapOnFailure(ctx, command, { code, stdout, stderr, message: `exited with code ${code}` });
        return `Command failed (exit ${code}):\nSTDOUT:\n${trimForModel(stdout)}\nSTDERR:\n${trimForModel(stderr)}${gapNote}`;
      }
      try {
        const { looksLikeMigrationApply } = await import('../../../features/chat/build/services/migrationsGuard.js');
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
    execute: async (args: any, _ctx: AgentContext) => `_PAUSE_ASK_USER_${args.question}`
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
        return files.map(f => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n') || 'Directory is empty.';
      } catch (e: any) { return `Error listing directory: ${e.message}`; }
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
    // whole file (write_file) drops existing fields on weaker models. A small SEARCH/REPLACE can't drop
    // unrelated code and works regardless of model strength. Backed by the build path's fuzzy surgical-edit engine.
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
        const { applySurgicalEdits } = await import('../../../features/chat/build/services/surgicalEditService.js');
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
];
