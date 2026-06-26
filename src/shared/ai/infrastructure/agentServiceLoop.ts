// [SCOPE] Agent execution loop — the ReAct while-loop body extracted from agentService.ts.
// Runs up to MAX_ITERATIONS turns: calls the provider, executes tool calls, applies guard nudges,
// and returns when the model emits a final text answer that passes all completion guards.
// [WARN] `messages` is mutated in place — callers must not share the array across concurrent runs.

import type { AgentContext } from './agentTools.js';
import { BUILT_IN_TOOLS } from './agentTools.js';
import { getAllTools, callTool } from '../../../services/mcpService.js';
import { BuildLedger } from '../../../features/chat/build/services/buildLedgerService.js';
import { extractAgentThought, narrateTool, friendlyModelName } from './agentNarrator.js';
import { executionNudge, budgetNudge, ceilingMessage, proactiveTestNudge } from './agentCompletionGuard.js';
import { detectTestFramework } from '../../../features/chat/build/services/testFramework.js';
import { describeProviderError, isSustainedFailure } from './agentFailoverReason.js';
import { synthesizeCompletion, parseTestSummary, isNoOpFabrication } from './agentCompletionSynthesis.js';
import { nativeAgentCall, appendUserNote } from './agentNativeCall.js';
import type { AgentMessage, ToolSchema } from './agentNativeCall.js';
import type { AgentExecutionResult } from './agentService.js';

export interface AgentLoopParams {
  task: string;
  systemPrompt: string;
  messages: AgentMessage[];
  toolSchemas: ToolSchema[];
  chain: Array<{ provider: string; model: string; thinkingBudget: number }>;
  msgsFor: (modelId: string) => AgentMessage[];
  ledger: BuildLedger;
  agentCtx: AgentContext;
  alog: { log: (tag: string, detail?: string) => void; done: (summary: string) => void };
  onUpdate: (msg: string) => void;
  keysPayload: Record<string, string>;
}

export async function runAgentLoop(p: AgentLoopParams): Promise<AgentExecutionResult> {
  const { task, systemPrompt, messages, toolSchemas, chain, msgsFor, ledger, agentCtx, alog, onUpdate, keysPayload } = p;
  const mcpTools = getAllTools();
  const testFw = detectTestFramework(agentCtx.root);
  const { isProviderUnavailable, markProviderUnavailable, unavailableReason } = require('./providerTierState.js');
  const MAX_ITERATIONS = 40;
  let iterations = 0;
  let ranCommands = 0; let guardNudges = 0; let wroteUnrunScript = false; let budgetWarned = false;
  const synthActivity: { commands: { command: string; ok: boolean }[]; testSummary?: string } = { commands: [] };
  let testNudges = 0; let migrationNudges = 0; let failingTestNudges = 0;
  let providerIdx = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    if (!budgetWarned && iterations >= MAX_ITERATIONS - 8) {
      budgetWarned = true;
      appendUserNote(messages, budgetNudge(iterations, MAX_ITERATIONS));
    }

    let callResult = await nativeAgentCall(chain[providerIdx].provider, chain[providerIdx].model, systemPrompt, msgsFor(chain[providerIdx].model), toolSchemas, keysPayload, chain[providerIdx].thinkingBudget);
    if (callResult.type === 'error') {
      let recovered = false;
      for (let fi = providerIdx + 1; fi < chain.length; fi++) {
        const { provider, model, thinkingBudget } = chain[fi];
        const errMsg = callResult.type === 'error' ? callResult.error : '';
        if (isSustainedFailure(errMsg)) { markProviderUnavailable(chain[providerIdx].provider, describeProviderError(errMsg)); }
        onUpdate(`Warning: ${friendlyModelName(chain[providerIdx].provider)} unavailable (${describeProviderError(errMsg)}) -- switching to ${friendlyModelName(provider)}...`);
        callResult = await nativeAgentCall(provider, model, systemPrompt, msgsFor(model), toolSchemas, keysPayload, thinkingBudget);
        if (callResult.type !== 'error') { providerIdx = fi; recovered = true; break; }
      }
      if (!recovered) {
        const finalErr = callResult.type === 'error' ? callResult.error : 'unknown';
        return { success: false, finalAnswer: '', iterations, error: `All providers unavailable: ${describeProviderError(finalErr)}`, ledger };
      }
    }

    const _cr = callResult as any;
    if (_cr.usage && (_cr.usage.inputTokens > 0 || _cr.usage.outputTokens > 0)) {
      ledger.record(_cr.model || chain[providerIdx].model, 'supervisor', 'built', _cr.usage.inputTokens + _cr.usage.outputTokens, 'Agent Mode iteration');
    }
    const modelLabel = _cr.model ? friendlyModelName(_cr.model) : '';
    const stepTag = `_Step ${iterations}${modelLabel ? ` · ${modelLabel}` : ''}_`;

    if (callResult.type === 'tool_call') {
      const { name: toolName, args: toolArgs, id: toolId, thinkingText } = callResult;
      alog.log(`step ${iterations} tool_call (${modelLabel})`, `${toolName}(${JSON.stringify(toolArgs)})`);
      if (thinkingText) { const thought = extractAgentThought(thinkingText); if (thought) { onUpdate(`${stepTag}: ${thought}`); } }

      if (toolName === 'run_command') { ranCommands++; wroteUnrunScript = false; }
      else if (toolName === 'write_file' && /\.(sh|py|js|ts|mjs|cjs|rb|go|rs|java|php|pl|bash)$/i.test(toolArgs?.filePath || '')) { wroteUnrunScript = true; }

      let result = '';
      const builtInTool = BUILT_IN_TOOLS.find(t => t.name === toolName);
      if (builtInTool) {
        onUpdate(narrateTool(toolName, toolArgs || {}, iterations, MAX_ITERATIONS));
        result = await builtInTool.execute(toolArgs || {}, agentCtx);
        alog.log('result', String(result).slice(0, 400));
        if (toolName === 'run_command') {
          const ok = !/^Command (failed|timed out)/.test(result);
          synthActivity.commands.push({ command: String(toolArgs?.command || '').trim(), ok });
          const ts = parseTestSummary(result); if (ts) { synthActivity.testSummary = ts; }
        }
      } else {
        const mcpTool = mcpTools.find((t: any) => t.name === toolName);
        if (mcpTool) {
          onUpdate(`${stepTag}: **Calling external tool** \`${mcpTool.name}\` from ${mcpTool.serverName}...`);
          const mcpResult = await callTool(mcpTool.serverName, mcpTool.name, toolArgs || {});
          result = mcpResult.success ? mcpResult.content || 'MCP Tool execution successful.' : `MCP Tool Error: ${mcpResult.error}`;
        } else {
          messages.push({ role: 'assistant', toolCall: { id: toolId, name: toolName, args: toolArgs } });
          messages.push({ role: 'tool', toolCallId: toolId, name: toolName, content: `Tool "${toolName}" not found. Available tools: ${BUILT_IN_TOOLS.map(t => t.name).join(', ')}` });
          onUpdate(`Warning: ${stepTag}: Tried an unknown tool (\`${toolName}\`) -- correcting course...`);
          continue;
        }
      }

      if (result.startsWith('_PAUSE_ASK_USER_')) {
        alog.done(`paused for user after ${iterations} step(s)`);
        return { success: true, finalAnswer: result.replace('_PAUSE_ASK_USER_', ''), iterations, ledger };
      }
      // [THINKING] _anthropicBlocks carries thinking + tool_use blocks for round-trip on next turn.
      // Other providers leave rawBlocks undefined — the field is simply omitted from the message.
      messages.push({ role: 'assistant', toolCall: { id: toolId, name: toolName, args: toolArgs }, _anthropicBlocks: (callResult as any).rawBlocks });
      messages.push({ role: 'tool', toolCallId: toolId, name: toolName, content: result });
      continue;
    }

    // type === 'text' — model giving its final answer (no tool call)
    const aiText = callResult.type === 'text' ? callResult.content : '';
    alog.log(`step ${iterations} text (${modelLabel})`, aiText);
    const thought = extractAgentThought(aiText);
    if (thought) { onUpdate(`${stepTag}: ${thought}`); }
    messages.push({ role: 'assistant', content: aiText, _anthropicBlocks: (callResult as any).rawBlocks });

    const filesTouched = agentCtx.modifiedFiles?.size ?? 0;
    const nudge = executionNudge(!!agentCtx.requiresExecution, ranCommands, wroteUnrunScript, guardNudges, filesTouched);
    if (nudge) {
      guardNudges++;
      alog.log(`completion-guard nudge #${guardNudges} (${ranCommands === 0 ? (filesTouched === 0 ? 'nothing-touched' : 'nothing-run') : 'unrun-script'})`);
      onUpdate(`Warning: The agent tried to finish without running anything -- sending it back (nudge ${guardNudges}/2).`);
      appendUserNote(messages, nudge); continue;
    }

    if (agentCtx.schemaChanged && !agentCtx.migrationRan && migrationNudges < 3) {
      migrationNudges++;
      let cmd = 'the migration command for your toolchain';
      try { const tc = require('../build/migrationsGuard.js').detectToolchain(agentCtx.root); if (tc?.id !== 'none') { cmd = `\`${tc.migrate('the_change')}\``; } } catch { /* */ }
      alog.log(`migration-guard nudge #${migrationNudges} (schema changed, not migrated)`);
      onUpdate('Schema changed but migration has not run -- sending the agent back to migrate.');
      appendUserNote(messages, `You edited the database schema but have NOT run the migration yet. RUN it now with run_command (${cmd}) and wait for the real result before giving your final answer.`);
      continue;
    }

    if (/\b[1-9]\d*\s+failed/.test(synthActivity.testSummary || '') && failingTestNudges < 3) {
      failingTestNudges++;
      alog.log(`failing-tests nudge #${failingTestNudges} (${synthActivity.testSummary})`);
      onUpdate(`Tests are still failing (${synthActivity.testSummary}) -- sending the agent back to fix them.`);
      appendUserNote(messages, `Your last test run FAILED (${synthActivity.testSummary}). Do NOT describe the fix in prose -- APPLY it now with edit_file, then re-run the tests with run_command. Keep going until tests genuinely pass.`);
      continue;
    }

    const tNudge = proactiveTestNudge([...(agentCtx.modifiedFiles || [])], testFw, testNudges);
    if (tNudge) { testNudges++; alog.log('proactive-test nudge'); appendUserNote(messages, tNudge); continue; }

    alog.done(`final answer after ${iterations} step(s), ${ranCommands} command(s) run`);
    const fs = require('fs'); const path = require('path');
    const existsOnDisk = (rel: string) => { try { return fs.existsSync(path.join(agentCtx.root, rel)); } catch { return false; } };
    const _activity = { filesModified: [...(agentCtx.modifiedFiles || [])], commands: synthActivity.commands, migrationRan: !!agentCtx.migrationRan, testSummary: synthActivity.testSummary };
    const finalAnswer = synthesizeCompletion(_activity, aiText, existsOnDisk);
    const fabricated = isNoOpFabrication(_activity, aiText, existsOnDisk);
    if (fabricated) { alog.done(`no-op fabrication after ${iterations} step(s) -- reported as failure`); }
    return { success: !fabricated, finalAnswer, iterations, ledger };
  }

  alog.done(`hit step ceiling (${MAX_ITERATIONS}) without a final answer`);
  return { success: false, iterations, error: 'Max agent iterations reached.', ledger, finalAnswer: ceilingMessage(task, MAX_ITERATIONS) };
}
