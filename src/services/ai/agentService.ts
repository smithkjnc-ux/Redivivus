// [SCOPE] Agentic Execution Service.
// Runs the Supervisor AI in a ReAct (Reasoning and Acting) loop, allowing it to autonomously use tools.

import type { AgentContext } from './agentTools.js';
import { BUILT_IN_TOOLS, getToolInstructions } from './agentTools.js';
import type { RoutingService } from './routingService.js';
import type { AIResponse } from './routingTypes.js';
import { CHASSIS_WORKER_RULES } from './chassisWorkerRules.js';
import { getAllTools, callTool } from '../mcpService.js';
import { BuildLedger } from '../build/buildLedgerService.js';
import { extractAgentThought, narrateTool } from './agentNarrator.js';

export interface AgentExecutionResult {
  success: boolean;
  finalAnswer: string;
  iterations: number;
  error?: string;
  ledger: BuildLedger;
}

export async function executeAgentTask(
  task: string,
  context: string,
  routing: RoutingService,
  agentCtx: AgentContext,
  onUpdate: (msg: string) => void
): Promise<AgentExecutionResult> {
  const { supervisor } = routing.selectSupervisorAndWorker();
  
  const mcpTools = getAllTools();
  let mcpInstructions = '';
  if (mcpTools.length > 0) {
    mcpInstructions = '\nEXTERNAL MCP TOOLS:\n' + mcpTools.map(t => 
      `- **${t.name}** (from ${t.serverName}): ${t.description}\n  Args: ${JSON.stringify(t.inputSchema || {})}`
    ).join('\n\n');
  }

  let history = `You are CHASSIS Agent Mode, a highly capable autonomous software engineer.
You have access to a set of tools to read files, write code, run terminal commands, and ask the user questions.
You must solve the user's task by thinking step-by-step and using these tools.

CRITICAL RULES FOR CHASSIS AGENT:
1. ZERO MANUAL INSTRUCTIONS. You are strictly forbidden from writing "How-To" guides, checklists, or telling the user to "Go to", "Open", or "Run" anything. 
2. AUTOMATE EVERYTHING. If the user asks for something to be runnable, installed, or deployed, YOU MUST use the \`run_command\` tool or write a setup script. You are an autonomous agent, not a chat bot.
3. NO HALLUCINATIONS. Do not claim that files, folders (like 'dist/'), or executables exist unless you have actively verified them or created them yourself using tools.
4. NEVER GUESS FILE PATHS. Always use \`list_dir\` or \`search_code\` to verify the exact path of the files you intend to modify before using \`write_file\`.
5. Be concise in your final answer. The user wants results, not a wall of text.
6. VERIFY YOUR WORK (MANDATORY RUNTIME TESTING). You are strictly forbidden from declaring "the fix is complete" or outputting your final answer unless you have actually executed a command via \`run_command\` that tests and proves the system works. If you wrote or edited code, run a test script, compile script, or start the server. You MUST explicitly cite the exact command you ran and the resulting command output in your final answer as proof. If you do not run a command to verify your work, your solution is incomplete and invalid.
7. DIAGNOSE BEFORE FIXING. Read the relevant files FIRST. Understand the actual root cause before proposing a fix. If the user says "X doesn't work" and you add defensive null checks without finding the real bug, you have failed.
8. BROWSER PROJECTS. If the project uses ES modules (\`<script type="module">\`), it MUST be served via HTTP, not opened from \`file://\`. Use \`run_command\` with \`python3 -m http.server\` or a Node.js server to verify.
9. PROPER WEB STRUCTURE. If you create an \`.html\` file, it MUST contain a valid, fully-formed HTML5 structure (\`<!DOCTYPE html><html><body>...\`). DO NOT just write raw JavaScript or CSS directly into an \`.html\` file.
10. NO FLAT FILES. Every file lives in a folder that matches its responsibility — UI in UI, logic in logic, and so on. This applies to projects CHASSIS builds and to CHASSIS itself. No exceptions.
11. ACTUALLY WRITE THE CODE. If the user asks you to build an app, game, or project, you MUST use the \`write_file\` tool to create the actual source files. Do NOT just output a text description, markdown checkboxes, or a plan of the project in your final answer. The user expects a working, runnable project in their workspace.

AVAILABLE TOOLS:
${getToolInstructions()}${mcpInstructions}

HOW TO USE A TOOL:
To use a tool, output an XML block like this:
<tool_call>
{
  "name": "read_file",
  "args": { "filePath": "index.html" }
}
</tool_call>

You can only use ONE tool at a time. After you use a tool, the system will execute it and provide you with the <tool_result>.
If you do not need to use a tool, simply output your final answer. Do NOT output a <tool_call> block if you are finished.

TASK: ${task}

PROJECT CONTEXT:
${context}

${CHASSIS_WORKER_RULES}

Begin. Think step-by-step.`;

  const ledger = new BuildLedger();
  const MAX_ITERATIONS = 15;
  let iterations = 0;

  onUpdate('🧠 **Autonomous Agent** spinning up — analysing your task and preparing a plan...');

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const res: AIResponse = await routing.prompt(history, 60_000);
    
    // Track tokens for this iteration
    const inTok = res.inputTokens || 0;
    const outTok = res.outputTokens || 0;
    if (inTok > 0 || outTok > 0) {
      ledger.record(res.model || supervisor, 'supervisor', 'built', inTok + outTok, 'Agent Mode iteration');
    }

    if (!res.success || !res.text) {
      return { success: false, finalAnswer: '', iterations, error: res.error || 'Agent failed to respond', ledger };
    }

    const aiText = res.text.trim();
    history += `\n\nAssistant:\n${aiText}`;

    // [CHASSIS] Surface AI's own reasoning as narrator bubble — zero extra tokens
    const thought = extractAgentThought(aiText);
    if (thought) { onUpdate(`\uD83D\uDCAD _Step ${iterations}:_ ${thought}`); }

    // Parse tool call
    const toolMatch = aiText.match(/<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/);
    if (!toolMatch) {
      // No tool call -> final answer
      return { success: true, finalAnswer: aiText, iterations, ledger };
    }

    let toolData: any;
    try {
      toolData = JSON.parse(toolMatch[1]);
    } catch (e) {
      const errorMsg = 'Error parsing tool call JSON. Ensure it is valid JSON.';
      history += `\n\nSystem:\n<tool_result>\n${errorMsg}\n</tool_result>`;
      onUpdate(`\u26A0\uFE0F _Step ${iterations}:_ Had a formatting hiccup \u2014 adjusting and trying again...`);
      continue;
    }

    let result: string = '';
    const builtInTool = BUILT_IN_TOOLS.find(t => t.name === toolData.name);

    if (builtInTool) {
      onUpdate(narrateTool(builtInTool.name, toolData.args || {}, iterations, MAX_ITERATIONS));
      result = await builtInTool.execute(toolData.args || {}, agentCtx);
    } else {
      const mcpTool = mcpTools.find(t => t.name === toolData.name);
      if (mcpTool) {
        onUpdate(`\uD83D\uDD0C _Step ${iterations}:_ **Calling external tool** \`${mcpTool.name}\` from the ${mcpTool.serverName} MCP server...`);
        const mcpResult = await callTool(mcpTool.serverName, mcpTool.name, toolData.args || {});
        result = mcpResult.success ? mcpResult.content || 'MCP Tool execution successful.' : `MCP Tool Error: ${mcpResult.error}`;
      } else {
        const errorMsg = `Tool ${toolData.name} not found.`;
        history += `\n\nSystem:\n<tool_result>\n${errorMsg}\n</tool_result>`;
        onUpdate(`\u26A0\uFE0F _Step ${iterations}:_ Tried an unknown tool (\`${toolData.name}\`) \u2014 correcting course...`);
        continue;
      }
    }
    
    if (result.startsWith('_PAUSE_ASK_USER_')) {
      const question = result.replace('_PAUSE_ASK_USER_', '');
      return { success: true, finalAnswer: question, iterations, ledger };
    }

    // Append result and loop
    history += `\n\nSystem:\n<tool_result>\n${result}\n</tool_result>`;
  }

  return { success: false, finalAnswer: '', iterations, error: 'Max agent iterations reached.', ledger };
}
