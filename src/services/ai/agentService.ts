// [SCOPE] Agentic Execution Service.
// Runs the Supervisor AI in a ReAct (Reasoning and Acting) loop, allowing it to autonomously use tools.

import type { AgentContext } from './agentTools.js';
import { BUILT_IN_TOOLS } from './agentTools.js';
import type { RoutingService } from './routingService.js';
import { Redivivus_WORKER_RULES } from './redivivusWorkerRules.js';
import { getAllTools, callTool } from '../mcpService.js';
import { BuildLedger } from '../build/buildLedgerService.js';
import { extractAgentThought, narrateTool, friendlyModelName } from './agentNarrator.js';
import { runSupervisorPreplanning } from './agentSupervisor.js';
import { clearToolGapFlag } from './toolGapEscalation.js';
import { buildAgentSystemPrompt } from './agentPrompt.js';
import { createAgentLogger } from './agentActionLog.js';
import { executionNudge, budgetNudge, ceilingMessage, proactiveTestNudge } from './agentCompletionGuard.js';
import { detectTestFramework } from '../build/testFramework.js';
import { callExecuteWithFailover } from './agentExecuteFailover.js';
import { describeProviderError } from './agentFailoverReason.js';
import { packageManagerGuidance } from './agentPackageManager.js';
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

  clearToolGapFlag(require('fs')); // [TOOL-GAP] new run = retry → clear stale flag (re-written if gap recurs)

  const mcpTools = getAllTools();
  let mcpInstructions = '';
  if (mcpTools.length > 0) {
    mcpInstructions = '\nEXTERNAL MCP TOOLS:\n' + mcpTools.map(t => 
      `- **${t.name}** (from ${t.serverName}): ${t.description}\n  Args: ${JSON.stringify(t.inputSchema || {})}`
    ).join('\n\n');
  }

  let history = buildAgentSystemPrompt(task, context, mcpInstructions, packageManagerGuidance(agentCtx.root));

  const ledger = new BuildLedger();
  // [BUDGET] 15 was far too tight for a real multi-file task (read several files, write several, then run +
  // verify burns it in one pass). 40 gives room for genuine work; a soft "wrap up" nudge near the end (see
  // budgetWarned below) keeps cost bounded and lets the agent converge instead of getting cut off mid-task.
  const MAX_ITERATIONS = 40;
  let iterations = 0;
  // [COMPLETION-GUARD] Track real execution so an environment/verify task can't finish without running —
  // and can't write a script then quit without running it. Nudges capped so a genuinely-impossible task
  // (all tools missing) still gets to finish with its gap report.
  let ranCommands = 0; let guardNudges = 0; let wroteUnrunScript = false; let budgetWarned = false;
  // [PROACTIVE-TEST] Detect the test runner once; nudge (capped) to leave a test behind for code changes.
  const testFw = detectTestFramework(agentCtx.root); let testNudges = 0;
  const alog = createAgentLogger(agentCtx.root, task);

  // [Redivivus] Supervisor reads current project files THEN generates a prescription.
  // Agent implements the prescription exactly -- no re-analysis, no deviation.
  const supervisorPrescription = await runSupervisorPreplanning(task, context, agentCtx, routing, onUpdate);
  if (supervisorPrescription) {
    history = history.replace('Begin. Think step-by-step.', `${supervisorPrescription}\nBegin. Implement the prescription above. Think step-by-step.`);
  }
  agentCtx.plan = supervisorPrescription || ''; // [TOOL-GAP] expose plan for run_command plan-match

  onUpdate('🧠 **Autonomous Agent** spinning up — analysing your task and preparing a plan...');
  const base = require('../api/apiClient.js').getApiBase();
  const token = await require('../api/apiClient.js').getAccountToken();
  const keysPayload = require('../api/apiClient.js').collectKeys();
  const { bestModelForRole } = require('./modelRegistry.js');
  // [FAILOVER] Build the provider chain: the chosen supervisor first, then every other configured provider in
  // rank order. The loop walks this chain on error and STAYS on whichever answers (providerIdx), so a quota
  // outage mid-run continues on the next provider instead of halting the whole task. See agentExecuteFailover.
  const _roster = routing.buildRoster();
  const _order = [supervisor, ..._roster.workers, _roster.supervisor].filter((p, i, a) => p && a.indexOf(p) === i);
  const chain = _order.map((p: string) => ({ provider: p, model: bestModelForRole(p, 'pro')?.modelId || p }));
  let providerIdx = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    // [BUDGET] Soft landing: once inside the last 8 steps, tell the agent ONCE to converge — finish the core
    // task, run its verification, and answer — rather than starting new work it can't finish before the cap.
    if (!budgetWarned && iterations >= MAX_ITERATIONS - 8) {
      budgetWarned = true;
      history += `\n\nSystem:\n<tool_result>\n${budgetNudge(iterations, MAX_ITERATIONS)}\n</tool_result>`;
    }

    // Use the secure /execute endpoint WITH provider failover (sticky to whichever answers).
    const { turn, usedIndex } = await callExecuteWithFailover({
      base, token, keys: keysPayload, prompt: history, chain, startAt: providerIdx,
      fetchFn: (routing as any).fetchWithTimeout,
      onFailover: (from, to, reason) => onUpdate(`⚠️ ${friendlyModelName(from)} unavailable (${describeProviderError(reason)}) — switching to ${friendlyModelName(to)} and continuing…`),
    });
    providerIdx = usedIndex; // stick to the provider that worked
    const res = turn;

    // Track tokens for this iteration
    const inTok = res.inputTokens || 0;
    const outTok = res.outputTokens || 0;
    if (inTok > 0 || outTok > 0) {
      ledger.record(res.model || supervisor, 'supervisor', 'built', inTok + outTok, 'Agent Mode iteration');
    }

    if (!res.success || !res.text) {
      return { success: false, finalAnswer: '', iterations, error: res.error ? `All providers unavailable (${describeProviderError(res.error)})` : 'Agent failed to respond', ledger };
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
      // [COMPLETION-GUARD] Refuse a premature "final answer" on an environment/verify task — nothing run, or
      // a script written but never run. See agentCompletionGuard (capped so an impossible task still finishes).
      const nudge = executionNudge(!!agentCtx.requiresExecution, ranCommands, wroteUnrunScript, guardNudges);
      if (nudge) {
        guardNudges++;
        alog.log(`completion-guard nudge #${guardNudges} (${ranCommands === 0 ? 'nothing-run' : 'unrun-script'})`);
        history += `\n\nSystem:\n<tool_result>\n${nudge}\n</tool_result>`;
        continue;
      }
      // [PROACTIVE-TEST] Code changed in a test-capable project but no test was left behind → nudge once to
      // add + run one, so coverage accretes. Offers an out, so a genuinely test-less change still finishes.
      const tNudge = proactiveTestNudge([...(agentCtx.modifiedFiles || [])], testFw, testNudges);
      if (tNudge) {
        testNudges++;
        alog.log('proactive-test nudge');
        history += `\n\nSystem:\n<tool_result>\n${tNudge}\n</tool_result>`;
        continue;
      }
      alog.done(`final answer after ${iterations} step(s), ${ranCommands} command(s) run`);
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
      alog.log(`tool: ${toolData.name}`, toolData.args);
      // Track for the completion guard: a command counts as "ran" (and clears any unrun-script flag); a
      // write to a script/program file sets the flag so the agent can't write-then-quit without running it.
      if (toolData.name === 'run_command') { ranCommands++; wroteUnrunScript = false; }
      else if (toolData.name === 'write_file' && /\.(sh|py|js|ts|mjs|cjs|rb|go|rs|java|php|pl|bash)$/i.test(toolData.args?.filePath || '')) { wroteUnrunScript = true; }
      result = await builtInTool.execute(toolData.args || {}, agentCtx);
      alog.log('result', String(result).slice(0, 400));
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
      alog.done(`paused for user after ${iterations} step(s), ${ranCommands} command(s) run`);
      return { success: true, finalAnswer: question, iterations, ledger };
    }

    // Append result and loop
    history += `\n\nSystem:\n<tool_result>\n${result}\n</tool_result>`;
  }

  // [BUDGET] Hit the ceiling without a final answer. Don't dump a bare error — ceilingMessage tells the user
  // plainly that work landed but verification didn't finish, with a Retry to continue from here.
  alog.done(`hit step ceiling (${MAX_ITERATIONS}) without a final answer`);
  return { success: false, iterations, error: 'Max agent iterations reached.', ledger, finalAnswer: ceilingMessage(task, MAX_ITERATIONS) };
}
