// [SCOPE] CHASSIS Build Orchestrator — prompt generation helpers.
// Extracted from buildOrchestrator.ts to keep source files under 200 lines.

import { BuildOrchestrator, BuildPlan, PhaseDefinition, BuildPhase } from './buildOrchestrator.js';
import { BUILD_PHASES } from './buildPhaseDefinitions.js';
import { CHASSIS_WORKER_RULES } from '../ai/chassisWorkerRules.js';

  export function getPlanSummaryImpl(orch: BuildOrchestrator, planId: string): string {
    const plan = (orch as any).plans.get(planId);
    if (!plan) return 'No active build plan.';
    const current = (orch as any).getCurrentPhase(planId);
    const progress = Math.round((plan.completedPhases.length / plan.phases.length) * 100);
    let summary = `## 🏗️ Build Plan: ${plan.task}\n\n`;
    summary += `**Complexity:** ${plan.tier.toUpperCase()} | **Progress:** ${progress}%\n\n`;
    plan.phases.forEach((phaseId: BuildPhase, idx: number) => {
      const def = BUILD_PHASES.find(p => p.id === phaseId)!;
      const isComplete = plan.completedPhases.includes(phaseId);
      const isCurrent = idx === plan.currentPhase;
      const status = isComplete ? '✅' : isCurrent ? '▶️' : '⏸️';
      summary += `${status} ${def.icon} **${def.name}** — ${def.description}\n`;
    });
    if (current) {
      summary += `\n**Current Phase:** ${current.icon} ${current.name}\n`;
    }
    return summary;
  }

  export function generatePhasePromptImpl(orch: BuildOrchestrator, planId: string, vaultContext: string): string {
    const plan = (orch as any).plans.get(planId);
    const phase = (orch as any).getCurrentPhase(planId);
    if (!plan || !phase) return '';
    const isFirstPhase = plan.currentPhase === 0;
    const isLastPhase = plan.currentPhase === plan.phases.length - 1;
    let prompt = `You are building: ${plan.blueprint.what}\n\n`;
    prompt += `## Current Phase: ${phase.name}\n`;
    prompt += `${phase.description}\n\n`;
    if (isFirstPhase) {
      prompt += `This is the FOUNDATION phase. Set up the project structure, entry points, and configuration.\n`;
      prompt += `Think of this as laying the foundation of a building.\n\n`;
    }
    prompt += `### 5W Blueprint Context:\n`;
    prompt += `- WHO: ${plan.blueprint.who}\n`;
    prompt += `- WHAT: ${plan.blueprint.what}\n`;
    prompt += `- WHERE: ${plan.blueprint.where}\n`;
    prompt += `- WHEN: ${plan.blueprint.when}\n`;
    prompt += `- WHY: ${plan.blueprint.why}\n\n`;
    if (plan.blueprint.techStack.length > 0) {
      prompt += `### Tech Stack:\n${plan.blueprint.techStack.join(', ')}\n\n`;
    }
    if (plan.blueprint.dataModel.length > 0) {
      prompt += `### Data Model:\n${plan.blueprint.dataModel.join(', ')}\n\n`;
    }
    if (vaultContext) {
      prompt += `### Vault Context:\n${vaultContext}\n\n`;
    }
    prompt += `### Phase Instructions:\n`;
    prompt += `1. Build ONLY the ${phase.name} phase\n`;
    prompt += `2. Expected outputs: ${phase.outputs.join(', ')}\n`;
    prompt += `3. Focus on: ${phase.description}\n`;
    if (!isFirstPhase) {
      prompt += `4. Build upon previous phases (do not recreate existing code)\n`;
    }
    if (!isLastPhase) {
      prompt += `5. Leave hooks/extension points for next phases\n`;
    }
    prompt += `\n6. NO placeholders — generate working code\n`;
    prompt += `7. NO markdown fences in response\n`;
    prompt += `\n${CHASSIS_WORKER_RULES}\n`;
    return prompt;
  }
