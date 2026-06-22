// [SCOPE] Agentic Execution Service — ReAct loop using native function calling.
// Each provider speaks its own dialect (Anthropic: tool_use, Gemini: functionCall, OpenAI: tool_calls).
// Tools are sent via the API `tools:` parameter; the loop processes structured responses — no text parsing.
// [DONE 2026-06-22] Replaced text-based <tool_call> XML protocol + /execute server proxy with
// native function calling via agentNativeCall.ts. All guards preserved; message arrays replace history string.

import type { AgentContext } from './agentTools.js';
import { BUILT_IN_TOOLS } from './agentTools.js';
import type { RoutingService } from './routingService.js';
import { getAllTools, callTool } from '../mcpService.js';
import { BuildLedger } from '../build/buildLedgerService.js';
import { extractAgentThought, narrateTool, friendlyModelName } from './agentNarrator.js';
import { runSupervisorPreplanning } from './agentSupervisor.js';
import { clearToolGapFlag } from './toolGapEscalation.js';
import { buildAgentSystemPrompt } from './agentPrompt.js';
import { createAgentLogger } from './agentActionLog.js';
import { executionNudge, budgetNudge, ceilingMessage, proactiveTestNudge } from './agentCompletionGuard.js';
import { detectTestFramework } from '../build/testFramework.js';
import { describeProviderError, isSustainedFailure } from './agentFailoverReason.js';
import { packageManagerGuidance } from './agentPackageManager.js';
import { synthesizeCompletion, parseTestSummary, isNoOpFabrication } from './agentCompletionSynthesis.js';
import { nativeAgentCall, appendUserNote } from './agentNativeCall.js';
import type { AgentMessage, ToolSchema } from './agentNativeCall.js';

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

  clearToolGapFlag(require('fs')); // [TOOL-GAP] new run = retry → clear stale flag

  const mcpTools = getAllTools();
  const mcpInstructions = mcpTools.length > 0
    ? mcpTools.map(t => `- **${t.name}** (from ${t.serverName}): ${t.description}`).join('\n')
    : '';

  // [NATIVE] Tool schemas sent via API — not embedded in the prompt text.
  // MCP tools get a minimal schema (their args are opaque); built-in tools have full JSON schemas.
  const toolSchemas: ToolSchema[] = [
    ...BUILT_IN_TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
    ...mcpTools.map(t => ({ name: t.name, description: t.description, parameters: { type: 'object' as const, properties: {} } })),
  ];

  const ledger = new BuildLedger();
  const MAX_ITERATIONS = 40;
  let iterations = 0;
  let ranCommands = 0; let guardNudges = 0; let wroteUnrunScript = false; let budgetWarned = false;
  const synthActivity: { commands: { command: string; ok: boolean }[]; testSummary?: string } = { commands: [] };
  const testFw = detectTestFramework(agentCtx.root); let testNudges = 0;
  let migrationNudges = 0;
  let failingTestNudges = 0;
  const alog = createAgentLogger(agentCtx.root, task);

  // [Redivivus] Supervisor prescription (from pre-planning) injected into the system prompt.
  const supervisorPrescription = await runSupervisorPreplanning(task, context, agentCtx, routing, onUpdate);
  agentCtx.plan = supervisorPrescription || '';
  const baseSystemPrompt = buildAgentSystemPrompt(task, context, mcpInstructions, packageManagerGuidance(agentCtx.root));
  const systemPrompt = supervisorPrescription
    ? baseSystemPrompt.replace('Begin. Think step-by-step.', `SUPERVISOR PRESCRIPTION:\n${supervisorPrescription}\n\nBegin. Implement the prescription. Think step-by-step.`)
    : baseSystemPrompt;

  // [NATIVE] Conversation as structured messages — provider converters handle dialect differences.
  const messages: AgentMessage[] = [{ role: 'user', content: `TASK: ${task}\n\nPROJECT CONTEXT:\n${context}` }];

  onUpdate('🧠 **Autonomous Agent** spinning up — analysing your task and preparing a plan...');

  const keysPayload = require('../api/apiClient.js').collectKeys();
  const { bestModelForRole } = require('./modelRegistry.js');
  const { isProviderUnavailable, markProviderUnavailable, unavailableReason } = require('./providerTierState.js');
  const _roster = routing.buildRoster();
  const _order = [supervisor, ..._roster.workers, _roster.supervisor].filter((p: string, i: number, a: string[]) => p && a.indexOf(p) === i);
  const _usable = _order.filter((p: string) => !isProviderUnavailable(p));
  const _chainOrder = _usable.length ? _usable : _order;
  const _skipped = _order.filter((p: string) => !_usable.includes(p));
  if (_usable.length && _skipped.length) {
    onUpdate(`ℹ️ Skipping ${_skipped.map((p: string) => friendlyModelName(p)).join(', ')} this session (${unavailableReason(_skipped[0]) || 'unavailable'}) — using ${friendlyModelName(_chainOrder[0])}.`);
  }
  const chain: Array<{ provider: string; model: string }> = _chainOrder.map((p: string) => ({ provider: p, model: bestModelForRole(p, 'pro')?.modelId || p }));
  let providerIdx = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // [BUDGET] Soft landing: tell the agent once to converge when nearing the step ceiling.
    if (!budgetWarned && iterations >= MAX_ITERATIONS - 8) {
      budgetWarned = true;
      appendUserNote(messages, budgetNudge(iterations, MAX_ITERATIONS));
    }

    // [NATIVE] Call the current provider with native function calling; failover on error.
    let callResult = await nativeAgentCall(chain[providerIdx].provider, chain[providerIdx].model, systemPrompt, messages, toolSchemas, keysPayload);
    if (callResult.type === 'error') {
      // Try remaining providers in chain
      let recovered = false;
      for (let fi = providerIdx + 1; fi < chain.length; fi++) {
        const { provider, model } = chain[fi];
        const errMsg = callResult.type === 'error' ? callResult.error : '';
        if (isSustainedFailure(errMsg)) { markProviderUnavailable(chain[providerIdx].provider, describeProviderError(errMsg)); }
        onUpdate(`⚠️ ${friendlyModelName(chain[providerIdx].provider)} unavailable (${describeProviderError(errMsg)}) — switching to ${friendlyModelName(provider)}…`);
        callResult = await nativeAgentCall(provider, model, systemPrompt, messages, toolSchemas, keysPayload);
        if (callResult.type !== 'error') { providerIdx = fi; recovered = true; break; }
      }
      if (!recovered) {
        const finalErr = callResult.type === 'error' ? callResult.error : 'unknown';
        return { success: false, finalAnswer: '', iterations, error: `All providers unavailable: ${describeProviderError(finalErr)}`, ledger };
      }
    }

    // [LEDGER] Record real token usage from the provider response — covers all three dialects including
    // Gemini thinking tokens (thoughtsTokenCount), which previously burned silently with no record.
    const _cr = callResult as any;
    if (_cr.usage && (_cr.usage.inputTokens > 0 || _cr.usage.outputTokens > 0)) {
      ledger.record(_cr.model || chain[providerIdx].model, 'supervisor', 'built', _cr.usage.inputTokens + _cr.usage.outputTokens, 'Agent Mode iteration');
    }
    const modelLabel = _cr.model ? friendlyModelName(_cr.model) : '';
    const stepTag = `_Step ${iterations}${modelLabel ? ` · ${modelLabel}` : ''}_`;

    if (callResult.type === 'tool_call') {
      const { name: toolName, args: toolArgs, id: toolId, thinkingText } = callResult;
      // [AUDIT] Log every tool call with its args so runs are auditable from disk.
      alog.log(`step ${iterations} tool_call (${modelLabel})`, `${toolName}(${JSON.stringify(toolArgs)})`);
      if (thinkingText) {
        const thought = extractAgentThought(thinkingText);
        if (thought) { onUpdate(`💬 ${stepTag}: ${thought}`); }
      }

      // [COMPLETION-GUARD] Track script writes so the guard can catch write-then-quit.
      if (toolName === 'run_command') { ranCommands++; wroteUnrunScript = false; }
      else if (toolName === 'write_file' && /\.(sh|py|js|ts|mjs|cjs|rb|go|rs|java|php|pl|bash)$/i.test(toolArgs?.filePath || '')) { wroteUnrunScript = true; }

      let result = '';
      const builtInTool = BUILT_IN_TOOLS.find(t => t.name === toolName);
      if (builtInTool) {
        onUpdate(narrateTool(toolName, toolArgs || {}, iterations, MAX_ITERATIONS));
        result = await builtInTool.execute(toolArgs || {}, agentCtx);
        alog.log('result', String(result).slice(0, 400));
        // [COMPLETION-SYNTH] Record real command outcomes (not model narration) for the final bubble.
        if (toolName === 'run_command') {
          const ok = !/^Command (failed|timed out)/.test(result);
          synthActivity.commands.push({ command: String(toolArgs?.command || '').trim(), ok });
          const ts = parseTestSummary(result);
          if (ts) { synthActivity.testSummary = ts; }
        }
      } else {
        const mcpTool = mcpTools.find((t: any) => t.name === toolName);
        if (mcpTool) {
          onUpdate(`🔌 ${stepTag}: **Calling external tool** \`${mcpTool.name}\` from ${mcpTool.serverName}…`);
          const mcpResult = await callTool(mcpTool.serverName, mcpTool.name, toolArgs || {});
          result = mcpResult.success ? mcpResult.content || 'MCP Tool execution successful.' : `MCP Tool Error: ${mcpResult.error}`;
        } else {
          // Unknown tool — tell the model and continue
          messages.push({ role: 'assistant', toolCall: { id: toolId, name: toolName, args: toolArgs } });
          messages.push({ role: 'tool', toolCallId: toolId, name: toolName, content: `Tool "${toolName}" not found. Available tools: ${BUILT_IN_TOOLS.map(t => t.name).join(', ')}` });
          onUpdate(`⚠️ ${stepTag}: Tried an unknown tool (\`${toolName}\`) — correcting course...`);
          continue;
        }
      }

      if (result.startsWith('_PAUSE_ASK_USER_')) {
        alog.done(`paused for user after ${iterations} step(s)`);
        return { success: true, finalAnswer: result.replace('_PAUSE_ASK_USER_', ''), iterations, ledger };
      }

      // Add tool call + result to message history
      messages.push({ role: 'assistant', toolCall: { id: toolId, name: toolName, args: toolArgs } });
      messages.push({ role: 'tool', toolCallId: toolId, name: toolName, content: result });
      continue;
    }

    // type === 'text' — model giving its final answer (no tool call)
    const aiText = callResult.type === 'text' ? callResult.content : '';
    alog.log(`step ${iterations} text (${modelLabel})`, aiText);
    const thought = extractAgentThought(aiText);
    if (thought) { onUpdate(`💬 ${stepTag}: ${thought}`); }

    // Add the assistant's text to history before guard checks (guards may add user nudge after it)
    messages.push({ role: 'assistant', content: aiText });

    // [COMPLETION-GUARD] Refuse premature final answers on execution-required tasks.
    const filesTouched = agentCtx.modifiedFiles?.size ?? 0;
    const nudge = executionNudge(!!agentCtx.requiresExecution, ranCommands, wroteUnrunScript, guardNudges, filesTouched);
    if (nudge) {
      guardNudges++;
      alog.log(`completion-guard nudge #${guardNudges} (${ranCommands === 0 ? (filesTouched === 0 ? 'nothing-touched' : 'nothing-run') : 'unrun-script'})`);
      onUpdate(`⚠️ The agent tried to finish without actually running anything — sending it back to do the real work (nudge ${guardNudges}/2).`);
      appendUserNote(messages, nudge);
      continue;
    }

    // [MIGRATION-GUARD] Schema changed but migration never ran — don't accept the final answer.
    if (agentCtx.schemaChanged && !agentCtx.migrationRan && migrationNudges < 3) {
      migrationNudges++;
      let cmd = 'the migration command for your toolchain';
      try { const tc = require('../build/migrationsGuard.js').detectToolchain(agentCtx.root); if (tc?.id !== 'none') { cmd = `\`${tc.migrate('the_change')}\``; } } catch { /* */ }
      alog.log(`migration-guard nudge #${migrationNudges} (schema changed, not migrated)`);
      onUpdate(`🗄️ Schema changed but migration hasn't run — sending the agent back to migrate.`);
      appendUserNote(messages, `You edited the database schema but have NOT run the migration yet. RUN it now with run_command (${cmd}) and wait for the real result before giving your final answer.`);
      continue;
    }

    // [FAILING-TESTS-GUARD] Tests failed — don't accept "I'll fix it" prose, make it actually fix.
    if (/\b[1-9]\d*\s+failed/.test(synthActivity.testSummary || '') && failingTestNudges < 3) {
      failingTestNudges++;
      alog.log(`failing-tests nudge #${failingTestNudges} (${synthActivity.testSummary})`);
      onUpdate(`🔴 Tests are still failing (${synthActivity.testSummary}) — sending the agent back to FIX them.`);
      appendUserNote(messages, `Your last test run FAILED (${synthActivity.testSummary}). Do NOT describe the fix in prose — APPLY it now with edit_file, then re-run the tests with run_command. Keep going until tests genuinely pass.`);
      continue;
    }

    // [PROACTIVE-TEST] Code changed but no test run — nudge to add + verify coverage.
    const tNudge = proactiveTestNudge([...(agentCtx.modifiedFiles || [])], testFw, testNudges);
    if (tNudge) {
      testNudges++;
      alog.log('proactive-test nudge');
      appendUserNote(messages, tNudge);
      continue;
    }

    // All guards passed — this is the real final answer.
    alog.done(`final answer after ${iterations} step(s), ${ranCommands} command(s) run`);
    const fs = require('fs'); const path = require('path');
    const existsOnDisk = (rel: string) => { try { return fs.existsSync(path.join(agentCtx.root, rel)); } catch { return false; } };
    const _activity = { filesModified: [...(agentCtx.modifiedFiles || [])], commands: synthActivity.commands, migrationRan: !!agentCtx.migrationRan, testSummary: synthActivity.testSummary };
    // [COMPLETION-SYNTH] Build the bubble from observed facts, not the model's self-report.
    const finalAnswer = synthesizeCompletion(_activity, aiText, existsOnDisk);
    const fabricated = isNoOpFabrication(_activity, aiText, existsOnDisk);
    if (fabricated) { alog.done(`no-op fabrication after ${iterations} step(s) — reported as failure`); }
    return { success: !fabricated, finalAnswer, iterations, ledger };
  }

  alog.done(`hit step ceiling (${MAX_ITERATIONS}) without a final answer`);
  return { success: false, iterations, error: 'Max agent iterations reached.', ledger, finalAnswer: ceilingMessage(task, MAX_ITERATIONS) };
}
