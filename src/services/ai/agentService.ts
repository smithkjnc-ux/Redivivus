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
import * as vscode from 'vscode';

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

  let history = `AVAILABLE TOOLS:
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
  const base = require('../api/apiClient.js').getApiBase();
  const token = await require('../api/apiClient.js').getAccountToken();
  const keysPayload = require('../api/apiClient.js').collectKeys();
  const { bestModelForRole } = require('./modelRegistry.js');
  const actualModel = bestModelForRole(supervisor, 'pro')?.modelId || supervisor;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    
    // Use secure backend endpoint for agent iterations
    let res: AIResponse;
    try {
      const fetchFn = (routing as any).fetchWithTimeout;
      const apiRes = await fetchFn(`${base}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: supervisor, // using supervisor AI for agent loop
          model: actualModel,
          keys: keysPayload,
          promptType: 'agent-orchestrator',
          prompt: history,
          maxTokens: 4000,
          temperature: 0.1
        })
      }, 60_000);
      
      const data = await apiRes.json();
      if (!apiRes.ok) throw new Error(data.error || 'Agent execute failed');
      res = { text: data.text, success: true, model: supervisor, inputTokens: data.inputTokens, outputTokens: data.outputTokens };
    } catch (e: any) {
      res = { text: '', success: false, error: e.message, model: supervisor };
    }
    
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
