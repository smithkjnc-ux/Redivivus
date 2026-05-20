// [SCOPE] Agentic Execution Service.
// Runs the Supervisor AI in a ReAct (Reasoning and Acting) loop, allowing it to autonomously use tools.

import { BUILT_IN_TOOLS, getToolInstructions, AgentContext } from './agentTools.js';
import { RoutingService } from './routingService.js';
import { AIResponse } from './routingTypes.js';
import { getAllTools, callTool } from '../mcpService.js';
import { BuildLedger } from '../build/buildLedgerService.js';

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

Begin. Think step-by-step.`;

  const ledger = new BuildLedger();
  const MAX_ITERATIONS = 15;
  let iterations = 0;

  onUpdate('🧠 Agent is thinking...');

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
      onUpdate(`⚠️ Agent formatting error, retrying...`);
      continue;
    }

    let result: string = '';
    const builtInTool = BUILT_IN_TOOLS.find(t => t.name === toolData.name);
    
    if (builtInTool) {
      onUpdate(`🛠️ Agent using built-in tool: **${builtInTool.name}**...`);
      result = await builtInTool.execute(toolData.args || {}, agentCtx);
    } else {
      const mcpTool = mcpTools.find(t => t.name === toolData.name);
      if (mcpTool) {
        onUpdate(`🔌 Agent using MCP tool: **${mcpTool.name}**...`);
        const mcpResult = await callTool(mcpTool.serverName, mcpTool.name, toolData.args || {});
        result = mcpResult.success ? mcpResult.content || 'MCP Tool execution successful.' : `MCP Tool Error: ${mcpResult.error}`;
      } else {
        const errorMsg = `Tool ${toolData.name} not found.`;
        history += `\n\nSystem:\n<tool_result>\n${errorMsg}\n</tool_result>`;
        onUpdate(`⚠️ Agent tried to use unknown tool: ${toolData.name}`);
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
