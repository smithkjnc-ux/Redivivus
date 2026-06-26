// [SCOPE] Built-in Tools for the Agentic Architecture — types, interfaces, and combined tool array.
// Tool implementations live in: agentToolsFileIO.ts, agentToolsCommands.ts, agentToolsNetwork.ts
// Shared helpers (realFilesHint, schemaWriteGuards) live in: agentToolsHelpers.ts
// [WARN] Always use routing.prompt() here -- routeByComplexity routes simple-looking bug reports
//        to Groq/cheap models which produce thin output and cause silent pipeline failure.

import { FILE_IO_TOOLS } from './agentToolsFileIO.js';
import { COMMAND_TOOLS } from './agentToolsCommands.js';
import { NETWORK_TOOLS } from './agentToolsNetwork.js';

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
  // [TOOL-GAP] Live per-session cost choice for the costlier-alternate tier.
  askUser?: (prompt: string) => Promise<'alternate' | 'wait'>;
  // [MIGRATION-GUARD] Set true when a DB schema/model file is edited (migrationHook fires), and true again
  // once an actual migrate command runs successfully.
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

// [DEAD] realFilesHint + schemaWriteGuards moved to agentToolsHelpers.ts (Rule 9 split)
// [DEAD] Individual tool definitions moved to agentToolsFileIO.ts and agentToolsCommands.ts (Rule 9 split)

export const BUILT_IN_TOOLS: AgentTool[] = [...FILE_IO_TOOLS, ...COMMAND_TOOLS, ...NETWORK_TOOLS];

export function getToolInstructions(): string {
  return BUILT_IN_TOOLS.map(t =>
    `- **${t.name}**: ${t.description}\n  Args: ${t.parameters}`
  ).join('\n\n');
}
