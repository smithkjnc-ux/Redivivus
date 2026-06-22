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
import { describeProviderError, isSustainedFailure } from './agentFailoverReason.js';
import { packageManagerGuidance } from './agentPackageManager.js';
import { synthesizeCompletion, parseTestSummary, isNoOpFabrication } from './agentCompletionSynthesis.js';
import { matchToolCall } from './agentToolCallParse.js';
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
  // [COMPLETION-SYNTH] Factual ledger of what truly happened (commands + their exit status, parsed test count)
  // so the final bubble is built from observed actions, not the model's (often confabulated) self-report.
  const synthActivity: { commands: { command: string; ok: boolean }[]; testSummary?: string } = { commands: [] };
  // [PROACTIVE-TEST] Detect the test runner once; nudge (capped) to leave a test behind for code changes.
  const testFw = detectTestFramework(agentCtx.root); let testNudges = 0;
  // [TRUNCATION-GUARD] A write_file cut off by the output cap leaves an unclosed tag the loop can't parse —
  // nudge the model to re-write more concisely instead of dying silently. Capped to avoid an endless retry.
  let truncationNudges = 0;
  // [MIGRATION-GUARD] Refuse to finish a schema-change task whose migration never actually ran (the model
  // fabricated it). Capped so a genuinely-blocked migration still lets the run end.
  let migrationNudges = 0;
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
  const { isProviderUnavailable, markProviderUnavailable, unavailableReason } = require('./providerTierState.js');
  const _roster = routing.buildRoster();
  const _order = [supervisor, ..._roster.workers, _roster.supervisor].filter((p, i, a) => p && a.indexOf(p) === i);
  // [STICKY-SKIP] Drop providers already flagged out-of-credits/bad-key this session so we don't lead with a
  // dead provider and waste a failover hop on every fix/edit. If ALL are flagged (maybe one recovered), keep
  // the full order rather than ending up with an empty chain. See providerTierState.isProviderUnavailable.
  const _usable = _order.filter((p: string) => !isProviderUnavailable(p));
  const _chainOrder = _usable.length ? _usable : _order;
  const _skipped = _order.filter((p: string) => !_usable.includes(p));
  if (_usable.length && _skipped.length) {
    onUpdate(`ℹ️ Skipping ${_skipped.map((p: string) => friendlyModelName(p)).join(', ')} this session (${unavailableReason(_skipped[0]) || 'unavailable'}) — using ${friendlyModelName(_chainOrder[0])}.`);
  }
  const chain = _chainOrder.map((p: string) => ({ provider: p, model: bestModelForRole(p, 'pro')?.modelId || p }));
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
      // [STICKY-SKIP] A sustained outage (out of credits / bad key) won't recover this session — flag the
      // provider so the chain above skips it on the next iteration AND subsequent fix/edit/build runs.
      onProviderError: (provider, reason) => { if (isSustainedFailure(reason)) { markProviderUnavailable(provider, describeProviderError(reason)); } },
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
    // [AUDIT] Log the RAW model output each turn — the action log otherwise records only parsed tool calls, so a
    // model that emits prose-only (no tool call) and confabulates is invisible. With this, every run is fully
    // auditable from disk instead of inferred from a screenshot. See agentActionLog.
    alog.log(`step ${iterations} raw (${friendlyModelName(res.model || '')})`, aiText);

    // [Redivivus] Surface AI's own reasoning as narrator bubble — zero extra tokens
    const thought = extractAgentThought(aiText);
    const modelTag = res.model ? ` \u00B7 ${friendlyModelName(res.model)}` : '';
    if (thought) { onUpdate(`\uD83D\uDCAD _Step ${iterations}${modelTag}:_ ${thought}`); }

    // [TRUNCATION-GUARD] A turn that OPENED a raw <write_file> but never CLOSED it was cut off by the output
    // cap (a very large file). With no closing tag the write can't be parsed, so the run would otherwise end
    // silently with nothing saved. Tell the model the write was truncated and to re-emit it more concisely,
    // then continue. Capped so a genuinely-too-big file can't loop forever.
    const openWrite = /<write_file\s+path="([^"]+)">/.exec(aiText);
    if (openWrite && !/<\/write_file>/.test(aiText)) {
      if (truncationNudges < 2) {
        truncationNudges++;
        const tf = openWrite[1];
        alog.log(`truncation-guard nudge #${truncationNudges} on ${tf}`);
        onUpdate(`\u2702\uFE0F The write to \`${tf}\` was cut off (file too long for one response) \u2014 asking the agent to re-write it more concisely.`);
        history += `\n\nSystem:\n<tool_result>\nYour previous <write_file> for "${tf}" was CUT OFF \u2014 it exceeded the output limit so the closing </write_file> tag is missing and NOTHING was saved. Re-write that file now but make it more COMPACT so it fits in one response and you can close </write_file>: drop redundant comments and trim verbose/duplicated test cases to the essential ones. Keep it correct and complete, just leaner.\n</tool_result>`;
        continue;
      }
      alog.log(`truncation-guard exhausted on ${openWrite[1]} \u2014 proceeding`);
    }

    // [WARN] Priority: raw <write_file> block MUST be checked before <tool_call>.
    // AI often outputs both in one response (write block + run_command verification call).
    // If we match tool_call first we execute the verification and skip the file write entirely.
    const rawWriteMatch = aiText.match(/<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/);
    // [TOOLCALL-PARSE] Accept <tool_call> AND <tool_code>/fenced variants — other models (Gemini/Gemma) emit
    // their native wrapper, which was being silently dropped. See agentToolCallParse.
    const toolMatch = !rawWriteMatch ? matchToolCall(aiText) : null;
    if (!rawWriteMatch && !toolMatch) {
      // [COMPLETION-GUARD] Refuse a premature "final answer" on an environment/verify task — nothing run, or
      // a script written but never run. See agentCompletionGuard (capped so an impossible task still finishes).
      const filesTouched = agentCtx.modifiedFiles?.size ?? 0;
      const nudge = executionNudge(!!agentCtx.requiresExecution, ranCommands, wroteUnrunScript, guardNudges, filesTouched);
      if (nudge) {
        guardNudges++;
        alog.log(`completion-guard nudge #${guardNudges} (${ranCommands === 0 ? (filesTouched === 0 ? 'nothing-touched' : 'nothing-run') : 'unrun-script'})`);
        // [COMPLETION-SYNTH] Surface the nudge so a model that CLAIMS done without running anything is visible —
        // otherwise the run looks like "one step then finished" and hides the model ignoring the guard.
        onUpdate(`⚠️ The agent tried to finish without actually running anything — sending it back to do the real work (nudge ${guardNudges}/2).`);
        history += `\n\nSystem:\n<tool_result>\n${nudge}\n</tool_result>`;
        continue;
      }
      // [MIGRATION-GUARD] The agent edited a DB schema but never RAN the migration — the exact case where a
      // weaker model fabricates a migration it didn't execute. Don't accept the final answer: make it run the
      // real migrate command (which also subjects it to the destructive-data-loss preview). Capped.
      if (agentCtx.schemaChanged && !agentCtx.migrationRan && migrationNudges < 3) {
        migrationNudges++;
        let cmd = 'the migration command for your toolchain';
        try { const tc = require('../build/migrationsGuard.js').detectToolchain(agentCtx.root); if (tc?.id !== 'none') { cmd = `\`${tc.migrate('the_change')}\``; } } catch { /* */ }
        alog.log(`migration-guard nudge #${migrationNudges} (schema changed, not migrated)`);
        onUpdate(`🗄️ You changed the database schema but haven't run the migration yet — running it now before finishing.`);
        history += `\n\nSystem:\n<tool_result>\nYou edited the database schema but have NOT actually run the migration in this session. Do NOT claim it ran or describe its output — RUN it now with a run_command tool call (${cmd}) and wait for the real result. Only after the migration command actually executes and succeeds may you give your final answer.\n</tool_result>`;
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
      // [COMPLETION-SYNTH] Don't surface the model's free-text answer verbatim — build the bubble from the
      // observed ledger and fact-check the prose against files actually touched / present on disk. This kills
      // confabulated "I edited X / added test Y" reports on weak models. See agentCompletionSynthesis.
      const fs = require('fs'); const path = require('path');
      const existsOnDisk = (rel: string) => { try { return fs.existsSync(path.join(agentCtx.root, rel)); } catch { return false; } };
      const _activity = { filesModified: [...(agentCtx.modifiedFiles || [])], commands: synthActivity.commands, migrationRan: !!agentCtx.migrationRan, testSummary: synthActivity.testSummary };
      const finalAnswer = synthesizeCompletion(_activity, aiText, existsOnDisk);
      // [COMPLETION-SYNTH] A run that observed NO real actions but claimed success is a fabrication — report it
      // as a FAILURE so retries/telemetry don't count a phantom success. The synthesizer wrote the honest bubble.
      const fabricated = isNoOpFabrication(_activity, aiText, existsOnDisk);
      if (fabricated) { alog.done(`no-op fabrication after ${iterations} step(s) — reported as failure`); }
      return { success: !fabricated, finalAnswer, iterations, ledger };
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
      // [COMPLETION-SYNTH] Record run_command outcomes from the REAL result string so the completion bubble
      // reflects commands that actually ran (and their pass/fail), not the model's narration of them.
      if (toolData.name === 'run_command') {
        const ok = !/^Command (failed|timed out)/.test(result);
        synthActivity.commands.push({ command: String(toolData.args?.command || '').trim(), ok });
        const ts = parseTestSummary(result);
        if (ts) { synthActivity.testSummary = ts; }
      }
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
