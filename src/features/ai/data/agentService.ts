// [SCOPE] Agentic Execution Service — sets up the agent run and delegates to agentServiceLoop.ts.
// Builds the provider chain, system prompt, tool schemas, and msgsFor() closure, then calls runAgentLoop().
// [DONE 2026-06-22] Replaced text-based <tool_call> XML protocol + /execute server proxy with
//   native function calling via agentNativeCall.ts. All guards preserved; message arrays replace history string.
// [DONE 2026-06-22] Split loop body into agentServiceLoop.ts (Rule 9 — file was 254 lines).

import type { AgentContext } from './agentTools.js';
import { BUILT_IN_TOOLS } from './agentTools.js';
import type { RoutingService } from './routingService.js';
import { getAllTools } from '../../api/mcp/mcpService.js';
import { BuildLedger } from '../../../features/chat/build/services/buildLedgerService.js';
import { friendlyModelName } from './agentNarrator.js';
import { runSupervisorPreplanning } from './agentSupervisor.js';
import { clearToolGapFlag } from './toolGapEscalation.js';
import { buildAgentSystemPrompt } from './agentPrompt.js';
import { createAgentLogger } from './agentActionLog.js';
import { packageManagerGuidance } from './agentPackageManager.js';
import { pruneMessages } from './agentNativeCall.js';
import type { AgentMessage, ToolSchema } from './agentNativeCall.js';
import { runAgentLoop } from './agentServiceLoop.js';

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

  clearToolGapFlag(require('fs'));

  const mcpTools = getAllTools();
  const mcpInstructions = mcpTools.length > 0
    ? mcpTools.map(t => `- **${t.name}** (from ${t.serverName}): ${t.description}`).join('\n')
    : '';

  const toolSchemas: ToolSchema[] = [
    ...BUILT_IN_TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
    ...mcpTools.map(t => ({ name: t.name, description: t.description, parameters: { type: 'object' as const, properties: {} } })),
  ];

  const ledger = new BuildLedger();
  const alog = createAgentLogger(agentCtx.root, task);

  const supervisorPrescription = await runSupervisorPreplanning(task, context, agentCtx, routing, onUpdate);
  agentCtx.plan = supervisorPrescription || '';
  const baseSystemPrompt = buildAgentSystemPrompt(task, context, mcpInstructions, packageManagerGuidance(agentCtx.root));
  const systemPrompt = supervisorPrescription
    ? baseSystemPrompt.replace('Begin. Think step-by-step.', `SUPERVISOR PRESCRIPTION:\n${supervisorPrescription}\n\nBegin. Implement the prescription. Think step-by-step.`)
    : baseSystemPrompt;

  const messages: AgentMessage[] = [{ role: 'user', content: `TASK: ${task}\n\nPROJECT CONTEXT:\n${context}` }];

  onUpdate('Brain **Autonomous Agent** spinning up -- analysing your task and preparing a plan...');

  const keysPayload = require('../api/apiClient.js').collectKeys();
  const { bestModelForRole, MODEL_REGISTRY } = require('./modelRegistry.js');
  const { isProviderUnavailable, unavailableReason } = require('./providerTierState.js');
  const _roster = routing.buildRoster();
  const _order = [supervisor, ..._roster.workers, _roster.supervisor].filter((p: string, i: number, a: string[]) => p && a.indexOf(p) === i);
  const _usable = _order.filter((p: string) => !isProviderUnavailable(p));
  const _chainOrder = _usable.length ? _usable : _order;
  const _skipped = _order.filter((p: string) => !_usable.includes(p));
  if (_usable.length && _skipped.length) {
    onUpdate(`Info: Skipping ${_skipped.map((p: string) => friendlyModelName(p)).join(', ')} this session (${unavailableReason(_skipped[0]) || 'unavailable'}) -- using ${friendlyModelName(_chainOrder[0])}.`);
  }
  const chain: Array<{ provider: string; model: string; thinkingBudget: number }> = _chainOrder.map((p: string) => {
    const m = bestModelForRole(p, 'pro');
    const reg = (MODEL_REGISTRY as any[]).find((r: any) => r.modelId === m?.modelId);
    return { provider: p, model: m?.modelId || p, thinkingBudget: reg?.thinking ? 8000 : 0 };
  });

  // [CONTEXT-PRUNE] For models with contextK <= 32, trim history before each API call.
  // The original `messages` array is never mutated — failover to larger-context providers gets full history.
  const msgsFor = (modelId: string): AgentMessage[] => {
    const entry = (MODEL_REGISTRY as any[]).find((m: any) => m.modelId === modelId);
    if (!entry || entry.contextK > 32) return messages;
    return pruneMessages(messages, systemPrompt, (entry.contextK - entry.outputK) * 1000);
  };

  return runAgentLoop({ task, systemPrompt, messages, toolSchemas, chain, msgsFor, ledger, agentCtx, alog, onUpdate, keysPayload });
}
