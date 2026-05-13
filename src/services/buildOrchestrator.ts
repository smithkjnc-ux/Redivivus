// [SCOPE] Build Orchestrator Service — break complex builds into phased assembly
// Like building a car: blueprint → parts → frame → drivetrain → body → polish → deliver

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ComplexityResult, ComplexityTier } from './complexityAssessment.js';

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
  estimatedPercent: number; // Of total build effort
  dependencies: BuildPhase[];
  outputs: string[]; // File patterns expected
}

// The "car assembly line" phases
export const BUILD_PHASES: PhaseDefinition[] = [
  {
    id: 'foundation',
    name: 'Foundation',
    icon: '🏗️',
    description: 'Project structure, entry points, configuration, dependencies',
    estimatedPercent: 10,
    dependencies: [],
    outputs: ['package.json', 'tsconfig.json', 'src/index.*', 'README.md'],
  },
  {
    id: 'data',
    name: 'Data Layer',
    icon: '🗄️',
    description: 'Data models, schemas, database, state management, types',
    estimatedPercent: 15,
    dependencies: ['foundation'],
    outputs: ['src/models/*', 'src/types/*', 'src/schema/*', 'src/store/*'],
  },
  {
    id: 'core',
    name: 'Core Engine',
    icon: '⚙️',
    description: 'Business logic, algorithms, game engine, core services',
    estimatedPercent: 25,
    dependencies: ['foundation', 'data'],
    outputs: ['src/engine/*', 'src/services/*', 'src/logic/*', 'src/utils/*'],
  },
  {
    id: 'interface',
    name: 'Interface',
    icon: '🎨',
    description: 'UI components, screens, layout, styling',
    estimatedPercent: 20,
    dependencies: ['foundation', 'data'],
    outputs: ['src/components/*', 'src/ui/*', 'src/screens/*', 'src/pages/*'],
  },
  {
    id: 'integration',
    name: 'Integration',
    icon: '🔗',
    description: 'API connections, external services, webhooks, auth',
    estimatedPercent: 15,
    dependencies: ['core', 'data'],
    outputs: ['src/api/*', 'src/hooks/*', 'src/clients/*'],
  },
  {
    id: 'features',
    name: 'Features',
    icon: '✨',
    description: 'User-facing features, workflows, interactions',
    estimatedPercent: 20,
    dependencies: ['interface', 'core'],
    outputs: ['src/features/*', 'src/workflows/*'],
  },
  {
    id: 'polish',
    name: 'Polish',
    icon: '✨',
    description: 'Error handling, validation, tests, optimization, edge cases',
    estimatedPercent: 15,
    dependencies: ['features', 'integration'],
    outputs: ['src/tests/*', 'src/validation/*', '*.test.*', '*.spec.*'],
  },
  {
    id: 'delivery',
    name: 'Delivery',
    icon: '🚀',
    description: 'Build config, deployment, documentation, final checks',
    estimatedPercent: 5,
    dependencies: ['polish'],
    outputs: ['.github/workflows/*', 'Dockerfile', 'docker-compose.yml', 'DEPLOY.md'],
  },
];

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
  expanded: Record<string, string[]>; // Expanded 5W answers for deep interviews
  techStack: string[];
  dataModel: string[];
  keyFeatures: string[];
  risks: string[];
}

export class BuildOrchestrator {
  private plans: Map<string, BuildPlan> = new Map();
  private storageKey = 'chassis_build_plans';

  constructor(private context: vscode.ExtensionContext) {
    this.loadPlans();
  }

  // Create a build plan from complexity assessment and blueprint
  createPlan(task: string, complexity: ComplexityResult, blueprint: BuildBlueprint): BuildPlan {
    // Determine which phases are needed based on blueprint
    const phases = this.determinePhases(complexity, blueprint);

    const plan: BuildPlan = {
      task,
      tier: complexity.tier,
      phases,
      currentPhase: 0,
      completedPhases: [],
      blueprint,
      state: 'planning',
    };

    // Store plan
    const planId = this.generatePlanId(task);
    this.plans.set(planId, plan);
    this.savePlans();

    return plan;
  }

  // Determine which phases are needed
  private determinePhases(complexity: ComplexityResult, blueprint: BuildBlueprint): BuildPhase[] {
    const phases: BuildPhase[] = [];

    // Foundation always needed
    phases.push('foundation');

    // Data layer needed if we have models or database mentioned
    if (blueprint.dataModel.length > 0 || 
        /database|storage|state|model/i.test(blueprint.what)) {
      phases.push('data');
    }

    // Core always needed for anything substantial
    if (complexity.tier !== 'nano') {
      phases.push('core');
    }

    // Interface always needed unless it's pure backend
    if (!/api only|backend only|no ui/i.test(blueprint.where)) {
      phases.push('interface');
    }

    // Integration if external services mentioned
    if (blueprint.techStack.some(t => /api|service|integration|auth|payment/i.test(t))) {
      phases.push('integration');
    }

    // Features always for standard and deep
    if (complexity.tier !== 'nano') {
      phases.push('features');
    }

    // Polish for standard and deep
    if (complexity.tier !== 'nano') {
      phases.push('polish');
    }

    // Delivery for deep builds
    if (complexity.tier === 'deep') {
      phases.push('delivery');
    }

    // Ensure dependencies are met
    return this.orderPhases(phases);
  }

  // Order phases respecting dependencies
  private orderPhases(phases: BuildPhase[]): BuildPhase[] {
    const ordered: BuildPhase[] = [];
    const remaining = new Set(phases);

    while (remaining.size > 0) {
      const available = Array.from(remaining).filter(phase => {
        const def = BUILD_PHASES.find(p => p.id === phase)!;
        return def.dependencies.every(dep => ordered.includes(dep) || !phases.includes(dep));
      });

      if (available.length === 0) {
        // Dependency issue — add remaining in definition order
        ordered.push(...Array.from(remaining));
        break;
      }

      for (const phase of available) {
        ordered.push(phase);
        remaining.delete(phase);
      }
    }

    return [...new Set(ordered)]; // Deduplicate
  }

  // Get current phase info
  getCurrentPhase(planId: string): PhaseDefinition | null {
    const plan = this.plans.get(planId);
    if (!plan || plan.currentPhase >= plan.phases.length) return null;
    
    const phaseId = plan.phases[plan.currentPhase];
    return BUILD_PHASES.find(p => p.id === phaseId) || null;
  }

  // Advance to next phase
  completeCurrentPhase(planId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan) return false;

    const currentPhaseId = plan.phases[plan.currentPhase];
    plan.completedPhases.push(currentPhaseId);
    plan.currentPhase++;

    if (plan.currentPhase >= plan.phases.length) {
      plan.state = 'complete';
    }

    this.savePlans();
    return true;
  }

  // Get plan summary for display
  getPlanSummary(planId: string): string {
    const plan = this.plans.get(planId);
    if (!plan) return 'No active build plan.';

    const current = this.getCurrentPhase(planId);
    const progress = Math.round((plan.completedPhases.length / plan.phases.length) * 100);

    let summary = `## 🏗️ Build Plan: ${plan.task}\n\n`;
    summary += `**Complexity:** ${plan.tier.toUpperCase()} | **Progress:** ${progress}%\n\n`;

    plan.phases.forEach((phaseId, idx) => {
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

  // Generate prompt for current phase
  generatePhasePrompt(planId: string, vaultContext: string): string {
    const plan = this.plans.get(planId);
    const phase = this.getCurrentPhase(planId);
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

    return prompt;
  }

  private generatePlanId(task: string): string {
    return `${Date.now()}-${task.slice(0, 20).replace(/\s+/g, '-')}`;
  }

  // [CHASSIS] Public so build can be paused and resumed across sessions
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

  // Check if there's an active plan for a task
  getActivePlan(task: string): BuildPlan | undefined {
    for (const [, plan] of this.plans) {
      if (plan.task === task && plan.state !== 'complete' && plan.state !== 'failed') {
        return plan;
      }
    }
    return undefined;
  }

  // Clear completed plans
  clearCompleted(): void {
    for (const [id, plan] of this.plans) {
      if (plan.state === 'complete' || plan.state === 'failed') {
        this.plans.delete(id);
      }
    }
    this.savePlans();
  }
}
