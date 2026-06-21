// [SCOPE] Builds the Autonomous Agent's ReAct system prompt (tool list + tool-use protocol + task +
// context). Extracted from agentService.ts to keep that loop under the 200-line limit. Pure string assembly.

import { getToolInstructions } from './agentTools.js';

/** Assemble the agent loop's opening history string: tool docs, how-to-use protocol, the task, and the
 *  project context. `mcpInstructions` is the (already-formatted) external-MCP-tools block, or ''.
 *  `pkgManager` is the PACKAGE MANAGER directive (from packageManagerGuidance), or '' for non-Node projects. */
export function buildAgentSystemPrompt(task: string, context: string, mcpInstructions: string, pkgManager = ''): string {
  return `AVAILABLE TOOLS:
${getToolInstructions()}${mcpInstructions}

HOW TO USE A TOOL:
To use a tool, output an XML block like this:
<tool_call>
{
  "name": "read_file",
  "args": { "filePath": "index.html" }
}
</tool_call>

CRITICAL -- write_file with large content: Embedding large files in JSON causes parse errors.
If the file content is longer than 50 lines, use this raw block format INSTEAD of the JSON args:
<write_file path="relative/path/to/file">
[raw file content here -- no JSON escaping needed, no markdown fences, paste code exactly as-is]
</write_file>

You can only use ONE tool at a time. After you use a tool, the system will execute it and provide you with the <tool_result>.
If you do not need to use a tool, simply output your final answer. Do NOT output a <tool_call> block if you are finished.

EDITING EXISTING FILES — use edit_file, NOT write_file: When a file already exists and you only need to change part of it, ALWAYS use edit_file (a small SEARCH/REPLACE). Do NOT rewrite the whole file with write_file — rewriting from memory drops or mangles the parts you didn't mean to touch (e.g. losing an existing column while adding a new one) and risks getting cut off. Read the file first (read_file / read_file_lines), copy the exact snippet you want to change into "search", and put the new version in "replace". Reserve write_file for brand-NEW files only. To add to a model, edit_file the one or two lines — don't reproduce the whole model.

DATABASE DISCIPLINE: If the task adds or changes a database-backed field (a column on a model), you MUST edit the schema/model file FIRST (e.g. prisma/schema.prisma, a Django/SQLAlchemy model, a TypeORM entity) and run the migration, BEFORE writing application code that uses the new field. Code that references a column the schema doesn't have fails at runtime. Never add a field only in code. Add the new field with edit_file so the existing fields stay intact.
${pkgManager ? `\n${pkgManager}\n` : ''}
TASK: ${task}

PROJECT CONTEXT:
${context}

Begin. Think step-by-step.`;
}
