// [SCOPE] Builds the Autonomous Agent's ReAct system prompt (tool list + tool-use protocol + task +
// context). Extracted from agentService.ts to keep that loop under the 200-line limit. Pure string assembly.

import { getToolInstructions } from './agentTools.js';

/** Assemble the agent loop's opening history string: tool docs, how-to-use protocol, the task, and the
 *  project context. `mcpInstructions` is the (already-formatted) external-MCP-tools block, or ''. */
export function buildAgentSystemPrompt(task: string, context: string, mcpInstructions: string): string {
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

DATABASE DISCIPLINE: If the task adds or changes a database-backed field (a column on a model), you MUST edit the schema/model file FIRST (e.g. prisma/schema.prisma, a Django/SQLAlchemy model, a TypeORM entity) and run the migration, BEFORE writing application code that uses the new field. Code that references a column the schema doesn't have fails at runtime. Never add a field only in code.

TASK: ${task}

PROJECT CONTEXT:
${context}

Begin. Think step-by-step.`;
}
