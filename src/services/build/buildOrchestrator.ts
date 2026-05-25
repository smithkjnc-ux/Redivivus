// [SCOPE] Build Orchestrator Service — break complex builds into phased assembly
// Like building a car: blueprint → parts → frame → drivetrain → body → polish → deliver

import type * as vscode from 'vscode';
import type { ComplexityResult, ComplexityTier as _ComplexityTier } from '../../core/ai/complexityAssessment';
export type ComplexityTier = _ComplexityTier;
import { BUILD_PHASES } from './buildPhaseDefinitions.js';

export type BuildPhase = 
  | 'foundation'      // Project structure, entry point, config
  | 'data'           // Data models, schemas, state management
  | 'core'           // Business logic, algorithms, engines
  | 'interface'      // UI components, screens, layout
  | 'integration'    // APIs, external services, connections
  | 'features'       // User-facing features, workflows
  | 'polish'         // Error handling, validation, tests, optimization
  | 'delivery';      // Build config, deployment, docs

export interface PhaseDefinition {
  id: BuildPhase;
  name: string;
  icon: string;
  description: string;
  dependencies: BuildPhase[];
  outputs: string[];
  durationEstimate: number; // minutes
  estimatedPercent?: number;
}

export interface BuildPlan {
  task: string;
  tier: ComplexityTier;
  phases: BuildPhase[];
  currentPhase: number;
  completedPhases: BuildPhase[];
  blueprint: BuildBlueprint;
  state: 'planning' | 'building' | 'paused' | 'complete' | 'failed';
}

export interface BuildBlueprint {
  who: string;
  what: string;
  where: string;
  when: string;
  why: string;
  techStack: string[];
  dataModel: string[];
  features: string[];
  risks: string[];
}

export class BuildOrchestrator {
  private plans: Map<string, BuildPlan> = new Map();
  private storageKey = 'redivivus_build_plans';

  constructor(private context: vscode.ExtensionContext) {
    this.loadPlans();
  }

  createPlan(task: string, complexity: ComplexityResult, blueprint: BuildBlueprint): BuildPlan {
    const phases = this.determinePhases(complexity, blueprint);
    const plan: BuildPlan = {
      task, tier: complexity.tier, phases,
      currentPhase: 0, completedPhases: [],
      blueprint, state: 'planning',
    };
    const id = this.generatePlanId(task);
    this.plans.set(id, plan);
    this.savePlans();
    return plan;
  }

  private determinePhases(complexity: ComplexityResult, blueprint: BuildBlueprint): BuildPhase[] {
    const phases: BuildPhase[] = [];
    // Nano: just foundation + core
    if (complexity.tier === 'nano') {
      phases.push('foundation', 'core');
      return this.orderPhases(phases);
    }
    // Standard: foundation → data → core → interface → polish
    if (complexity.tier === 'standard') {
      phases.push('foundation', 'data', 'core', 'interface');
      if (blueprint.features.length > 0) { phases.push('features'); }
      phases.push('polish');
      return this.orderPhases(phases);
    }
    // Deep: all phases
    phases.push('foundation', 'data', 'core', 'interface', 'integration');
    if (blueprint.features.length > 0) { phases.push('features'); }
    phases.push('polish', 'delivery');
    return this.orderPhases(phases);
  }

  private orderPhases(phases: BuildPhase[]): BuildPhase[] {
    const ordered: BuildPhase[] = [];
    const remaining = new Set(phases);
    while (remaining.size > 0) {
      const available = Array.from(remaining).filter(phase => {
        const def = BUILD_PHASES.find(p => p.id === phase)!;
        return def.dependencies.every(dep => ordered.includes(dep) || !phases.includes(dep));
      });
      if (available.length === 0) {
        ordered.push(...Array.from(remaining));
        break;
      }
      for (const phase of available) {
        ordered.push(phase);
        remaining.delete(phase);
      }
    }
    return [...new Set(ordered)];
  }

  private generatePlanId(task: string): string {
    return `${Date.now()}-${task.slice(0, 20).replace(/\s+/g, '-')}`;
  }

  public savePlans(): void {
    const data = JSON.stringify(Array.from(this.plans.entries()));
    this.context.globalState.update(this.storageKey, data);
  }

  private loadPlans(): void {
    const data = this.context.globalState.get<string>(this.storageKey);
    if (data) {
      try {
        const entries = JSON.parse(data);
        this.plans = new Map(entries);
      } catch {
        this.plans = new Map();
      }
    }
  }

  getCurrentPhase(planId: string): PhaseDefinition | null {
    const plan = this.plans.get(planId);
    if (!plan || plan.currentPhase >= plan.phases.length) {return null;}
    const phaseId = plan.phases[plan.currentPhase];
    return BUILD_PHASES.find(p => p.id === phaseId) || null;
  }

  completeCurrentPhase(planId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan) {return false;}
    const currentPhaseId = plan.phases[plan.currentPhase];
    plan.completedPhases.push(currentPhaseId);
    plan.currentPhase++;
    if (plan.currentPhase >= plan.phases.length) {
      plan.state = 'complete';
    }
    this.savePlans();
    return true;
  }

  getPlanSummary(planId: string): string {
    const { getPlanSummaryImpl } = require('./buildOrchestratorPrompt.js');
    return getPlanSummaryImpl(this, planId);
  }

  generatePhasePrompt(planId: string, vaultContext: string): string {
    const { generatePhasePromptImpl } = require('./buildOrchestratorPrompt.js');
    return generatePhasePromptImpl(this, planId, vaultContext);
  }

  getAllPlans(): BuildPlan[] { return Array.from(this.plans.values()); }
  getPlan(id: string): BuildPlan | undefined { return this.plans.get(id); }
  pausePlan(planId: string): void {
    const plan = this.plans.get(planId);
    if (plan) { plan.state = 'paused'; this.savePlans(); }
  }
  resumePlan(planId: string): void {
    const plan = this.plans.get(planId);
    if (plan) { plan.state = 'building'; this.savePlans(); }
  }
  cancelPlan(planId: string): void {
    const plan = this.plans.get(planId);
    if (plan) { plan.state = 'failed'; this.savePlans(); }
  }
  deletePlan(planId: string): void {
    this.plans.delete(planId);
    this.savePlans();
  }
  getActivePlan(task: string): BuildPlan | undefined {
    for (const [, plan] of this.plans) {
      if (plan.task === task && plan.state !== 'complete' && plan.state !== 'failed') {
        return plan;
      }
    }
    return undefined;
  }
  clearCompleted(): void {
    for (const [id, plan] of this.plans) {
      if (plan.state === 'complete' || plan.state === 'failed') {
        this.plans.delete(id);
      }
    }
    this.savePlans();
  }
}