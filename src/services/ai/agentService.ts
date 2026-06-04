// [SCOPE] Agentic Execution Service.
// Runs the Supervisor AI in a ReAct (Reasoning and Acting) loop, allowing it to autonomously use tools.

import type { AgentContext } from './agentTools.js';
import { BUILT_IN_TOOLS, getToolInstructions } from './agentTools.js';
import type { RoutingService } from './routingService.js';
import type { AIResponse } from './routingTypes.js';
import { Redivivus_WORKER_RULES } from './redivivusWorkerRules.js';
import { getAllTools, callTool } from '../mcpService.js';
import { BuildLedger } from '../build/buildLedgerService.js';
import { extractAgentThought, narrateTool, friendlyModelName } from './agentNarrator.js';
import { runSupervisorPreplanning } from './agentSupervisor.js';

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

  let history = `You are Redivivus Agent Mode, a highly capable autonomous software engineer.
You have access to a set of tools to read files, write code, run terminal commands, and ask the user questions.
You must solve the user's task by thinking step-by-step and using these tools.

CRITICAL RULES FOR Redivivus AGENT:
1. ZERO MANUAL INSTRUCTIONS. You are strictly forbidden from writing "How-To" guides, checklists, or telling the user to "Go to", "Open", or "Run" anything. 
2. AUTOMATE EVERYTHING. If the user asks for something to be runnable, installed, or deployed, YOU MUST use the \`run_command\` tool or write a setup script. You are an autonomous agent, not a chat bot.
3. NO HALLUCINATIONS. Do not claim that files, folders (like 'dist/'), or executables exist unless you have actively verified them or created them yourself using tools.
4. NEVER GUESS FILE PATHS. Always use \`list_dir\` or \`search_code\` to verify the exact path of the files you intend to modify before using \`write_file\`.
5. Be concise in your final answer. The user wants results, not a wall of text.
6. VERIFY YOUR WORK (MANDATORY RUNTIME TESTING). You are strictly forbidden from declaring "the fix is complete" or outputting your final answer unless you have actually executed a command via \`run_command\` that tests and proves the system works. If you wrote or edited code, run a test script, compile script, or start the server. You MUST explicitly cite the exact command you ran and the resulting command output in your final answer as proof. If you do not run a command to verify your work, your solution is incomplete and invalid.
7. DIAGNOSE BEFORE FIXING. Read the relevant files FIRST. Understand the actual root cause before proposing a fix. If the user says "X doesn't work" and you add defensive null checks without finding the real bug, you have failed.
8. BROWSER PROJECTS. If the project uses ES modules (\`<script type="module">\`), it MUST be served via HTTP, not opened from \`file://\`. If you run a server (e.g. \`python3 -m http.server\`), you MUST run it in the background and detach output to prevent freezing your session: \`python3 -m http.server 8000 > server.log 2>&1 &\`.
9. PROPER WEB STRUCTURE. If you create an \`.html\` file, it MUST contain a valid, fully-formed HTML5 structure (\`<!DOCTYPE html><html><body>...\`). DO NOT just write raw JavaScript or CSS directly into an \`.html\` file.
10. NO FLAT FILES. Every file lives in a folder that matches its responsibility — UI in UI, logic in logic, and so on. This applies to projects Redivivus builds and to Redivivus itself. No exceptions.
11. ACTUALLY WRITE THE CODE. If the user asks you to build an app, game, or project, you MUST use the \`write_file\` tool to create the actual source files. Do NOT just output a text description, markdown checkboxes, or a plan of the project in your final answer. The user expects a working, runnable project in their workspace.
12. DO NOT USE ask_user WHEN A SUPERVISOR PRESCRIPTION IS PROVIDED. The prescription already resolves all ambiguity. If you see "SUPERVISOR PRESCRIPTION" below, implement it directly -- no questions, no choices presented to the user.

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

CRITICAL -- write_file with large content: Embedding large files in JSON causes parse errors.
If the file content is longer than 50 lines, use this raw block format INSTEAD of the JSON args:
<write_file path="relative/path/to/file">
[raw file content here -- no JSON escaping needed, no markdown fences, paste code exactly as-is]
</write_file>

You can only use ONE tool at a time. After you use a tool, the system will execute it and provide you with the <tool_result>.
If you do not need to use a tool, simply output your final answer. Do NOT output a <tool_call> block if you are finished.

TASK: ${task}

PROJECT CONTEXT:
${context}

${Redivivus_WORKER_RULES}

Begin. Think step-by-step.`;

  const ledger = new BuildLedger();
  const MAX_ITERATIONS = 15;
  let iterations = 0;

  // [Redivivus] Supervisor reads current project files THEN generates a prescription.
  // Agent implements the prescription exactly -- no re-analysis, no deviation.
  const supervisorPrescription = await runSupervisorPreplanning(task, context, agentCtx, routing, onUpdate);
  if (supervisorPrescription) {
    history = history.replace('Begin. Think step-by-step.', `${supervisorPrescription}\nBegin. Implement the prescription above. Think step-by-step.`);
  }

  onUpdate('🧠 **Autonomous Agent** spinning up — analysing your task and preparing a plan...');

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const res: AIResponse = await routing.prompt(history, 60_000, undefined, undefined, undefined, `agent-iter-${iterations}`);
    
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

    // [Redivivus] Surface AI's own reasoning as narrator bubble — zero extra tokens
    const thought = extractAgentThought(aiText);
    const modelTag = res.model ? ` \u00B7 ${friendlyModelName(res.model)}` : '';
    if (thought) { onUpdate(`\uD83D\uDCAD _Step ${iterations}${modelTag}:_ ${thought}`); }

    // [WARN] Priority: raw <write_file> block MUST be checked before <tool_call>.
    // AI often outputs both in one response (write block + run_command verification call).
    // If we match tool_call first we execute the verification and skip the file write entirely.
    const rawWriteMatch = aiText.match(/<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/);
    const toolMatch = !rawWriteMatch ? aiText.match(/<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/) : null;
    if (!rawWriteMatch && !toolMatch) {
      // No tool call -> final answer
      return { success: true, finalAnswer: aiText, iterations, ledger };
    }

    let toolData: any;
    if (rawWriteMatch) {
      // Raw block format: content between tags, no JSON encoding needed
      toolData = { name: 'write_file', args: { filePath: rawWriteMatch[1].trim(), content: rawWriteMatch[2] } };
    } else {
      try {
        toolData = JSON.parse(toolMatch![1]);
      } catch (e) {
        // [WARN] JSON parse fails on large write_file content -- the full file is too big to encode as a JSON string.
        // Last-chance fallback: re-check for raw block (handles AI that put it after a broken tool_call).
        const fallbackRaw = aiText.match(/<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/);
        if (fallbackRaw) {
          toolData = { name: 'write_file', args: { filePath: fallbackRaw[1].trim(), content: fallbackRaw[2] } };
        } else {
          const errorMsg = 'Error parsing tool call JSON. Ensure it is valid JSON.';
          history += `\n\nSystem:\n<tool_result>\n${errorMsg}\n</tool_result>`;
          onUpdate(`\u26A0\uFE0F _Step ${iterations}:_ Had a formatting hiccup \u2014 adjusting and trying again...`);
          continue;
        }
      }
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
