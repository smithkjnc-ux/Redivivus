// [SCOPE] File I/O agent tools — read_file and write_file.
// Extracted from agentTools.ts (Rule 9 split — was 361 lines).
// Guardian AI oversight runs on write_file to review content before it lands on disk.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentTool, AgentContext } from './agentTools.js';
import { realFilesHint, schemaWriteGuards } from './agentToolsHelpers.js';

export const FILE_IO_TOOLS: AgentTool[] = [
  {
    name: 'read_file',
    description: 'Reads the contents of a file in the workspace.',
    parameters: '{ "filePath": "string (relative path)" }',
    inputSchema: { type: 'object', properties: { filePath: { type: 'string', description: 'Relative path to the file within the project' } }, required: ['filePath'] },
    execute: async (args: any, ctx: AgentContext) => {
      const absPath = path.join(ctx.root, args.filePath);
      if (!fs.existsSync(absPath)) { return `Error: File ${args.filePath} does not exist.${await realFilesHint(ctx.root)}`; }
      try {
        return fs.readFileSync(absPath, 'utf8');
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
          const { createSnapshot } = await import('../../../features/chat/build/chatPanelBuildWriter.js');
          ctx.snapshotId = createSnapshot(ctx.root, `Agent task: ${ctx.task.substring(0, 50)}`, args.filePath);
        }
        let contentToWrite = args.content || '';
        // [FIX] Strip markdown fences: AIs frequently wrap write_file content in ```lang\n...\n```.
        if (contentToWrite.trimStart().startsWith('```')) {
          const { extractCodeFromResponse } = await import('../../../features/chat/build/chatPanelBuildInference.js');
          contentToWrite = extractCodeFromResponse(contentToWrite);
        }
        // [Redivivus] Guardian AI Oversight
        if (ctx.routing && ctx.routing.isGuardianActive()) {
          ctx.log(`🛡️ **Guardian AI** reviewing proposed write to \`${args.filePath}\`...`);
          try {
            const review = await ctx.routing.guardianReview(ctx.task, contentToWrite, 'agent', ctx.blueprintContext || '');
            if (review && !review.passed && review.correctedText) {
              const issues = review.issues && review.issues.length ? review.issues.join('; ') : 'Quality/correctness improvements';
              ctx.log(`⚠️ **Guardian AI** corrected proposed write to \`${args.filePath}\` (Issues: ${issues})`);
              const { extractCodeFromResponse } = await import('../../../features/chat/build/chatPanelBuildInference.js');
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
        try { const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath)); await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch { /* non-blocking */ }
        const migrationNote = await schemaWriteGuards(ctx, args.filePath, prevSchema, contentToWrite);
        return `Successfully wrote to ${args.filePath}.${migrationNote}`;
      } catch (e: any) {
        return `Error writing file: ${e.message}`;
      }
    }
  },
];
