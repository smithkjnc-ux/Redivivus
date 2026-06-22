// [SCOPE] Builds the system prompt for the autonomous agent loop. Tool schemas are sent via the
// API `tools:` parameter in each provider's native dialect — NOT embedded here as text. This file
// only contains behavioral guidance: editing strategy, DB discipline, and runtime context.
// [DEAD] Previously embedded "AVAILABLE TOOLS / HOW TO USE A TOOL / <tool_call> XML protocol" here.
// That custom text protocol caused cross-AI divergence (each model has its own native tool format).
// Removed 2026-06-22 — tools now sent via API-native function calling. See agentNativeCall.ts.

/** Build the agent's system prompt. Tool descriptions go in the API `tools:` parameter — NOT here.
 *  Only behavioral rules, DB discipline, and project context belong in this prompt. */
export function buildAgentSystemPrompt(task: string, context: string, mcpInstructions: string, pkgManager = ''): string {
  return `You are an autonomous coding agent. Use the provided tools to complete the task.

EDITING FILES: Always prefer edit_file over write_file for files that already exist. A surgical SEARCH/REPLACE cannot accidentally drop unrelated code, no matter how large the file. Read the file first with read_file or read_file_lines, copy the exact snippet you want to change into "search", and put the replacement in "replace". Reserve write_file for brand-new files only.

DATABASE DISCIPLINE: When a task adds or changes a database-backed field, ALWAYS edit the schema file first (e.g. prisma/schema.prisma), run the migration, THEN write application code that uses the new field. Code that references a column that isn't in the schema yet fails at runtime.
${pkgManager ? `\n${pkgManager}\n` : ''}${mcpInstructions ? `\nEXTERNAL TOOLS AVAILABLE:\n${mcpInstructions}\n` : ''}
TASK: ${task}

PROJECT CONTEXT:
${context}

Begin. Think step-by-step.`;
}
