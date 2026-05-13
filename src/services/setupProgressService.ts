// [SCOPE] CHASSIS Setup Progress Service — tracks and checks completion status of 10 setup steps
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ChassisService } from './chassisService.js';

export interface SetupStep {
  id: number;
  title: string;
  completed: boolean;
  inProgress: boolean;
  subItems?: string[];
  action?: string;
}

export interface SetupProgress {
  projectName: string;
  steps: SetupStep[];
  completedCount: number;
  totalCount: number;
  percentage: number;
}

export class SetupProgressService {
  private chassis: ChassisService;
  private root: string;

  constructor(chassis: ChassisService, root: string) {
    this.chassis = chassis;
    this.root = root;
  }

  async getProgress(): Promise<SetupProgress> {
    const projectName = path.basename(this.root);
    const steps: SetupStep[] = [
      await this.checkStep1(),
      await this.checkStep2(),
      await this.checkStep3(),
      await this.checkStep4(),
      await this.checkStep5(),
      await this.checkStep6(),
      await this.checkStep7(),
      await this.checkStep8(),
      await this.checkStep9(),
      await this.checkStep10(),
    ];

    const completedCount = steps.filter(s => s.completed).length;
    const totalCount = steps.length;
    const percentage = Math.round((completedCount / totalCount) * 100);

    return { projectName, steps, completedCount, totalCount, percentage };
  }

  private async checkStep1(): Promise<SetupStep> {
    // 1. Project initialized (.chassis/ created)
    const chassisPath = path.join(this.root, '.chassis');
    const exists = await this.pathExists(chassisPath);
    return {
      id: 1,
      title: 'Project initialized (.chassis/ created)',
      completed: exists,
      inProgress: false,
      action: exists ? undefined : 'Run "new project" or "retrofit project" to initialize',
    };
  }

  private async checkStep2(): Promise<SetupStep> {
    // 2. Blueprint completed (5 W's answered)
    if (!this.chassis.isInitialized()) {
      return { id: 2, title: 'Blueprint completed (5 W\'s answered)', completed: false, inProgress: false };
    }
    const config = this.chassis.loadConfig();
    const hasBlueprint = !!config?.blueprint;
    return {
      id: 2,
      title: 'Blueprint completed (5 W\'s answered)',
      completed: hasBlueprint,
      inProgress: false,
      action: hasBlueprint ? undefined : 'Run "open blueprint" to complete the 5 W\'s interview',
    };
  }

  private async checkStep3(): Promise<SetupStep> {
    // 3. Blueprint locked
    if (!this.chassis.isInitialized()) {
      return { id: 3, title: 'Blueprint locked', completed: false, inProgress: false };
    }
    const config = this.chassis.loadConfig();
    const locked = config?.blueprint?.locked === true;
    return {
      id: 3,
      title: 'Blueprint locked',
      completed: locked,
      inProgress: false,
      action: locked ? undefined : 'Run "lock blueprint" to lock your blueprint',
    };
  }

  private async checkStep4(): Promise<SetupStep> {
    // 4. Editor rules generated (.cursorrules, CLAUDE.md, etc.)
    const ruleFiles = ['.cursorrules', '.windsurfrules', 'CLAUDE.md', 'GEMINI.md', '.clinerules'];
    const allExist = await Promise.all(
      ruleFiles.map(f => this.pathExists(path.join(this.root, f)))
    );
    const completed = allExist.every(e => e);
    return {
      id: 4,
      title: 'Editor rules generated (.cursorrules, CLAUDE.md, etc.)',
      completed,
      inProgress: false,
      action: completed ? undefined : 'Run "generate rules" to create editor shim files',
    };
  }

  private async checkStep5(): Promise<SetupStep> {
    // 5. Project scanned
    if (!this.chassis.isInitialized()) {
      return { id: 5, title: 'Project scanned', completed: false, inProgress: false };
    }
    const config = this.chassis.loadConfig();
    const lastScan = config?.lastScan;
    const hasScan = !!lastScan;
    
    // Count issues from last scan
    const subItems: string[] = [];
    if (hasScan) {
      const largeFiles = config?.scanResults?.largeFiles?.length || 0;
      const todos = config?.scanResults?.todos?.length || 0;
      const uncommented = config?.scanResults?.uncommented?.length || 0;
      if (largeFiles > 0) subItems.push(`📋 ${largeFiles} oversized files — click to fix`);
      if (todos > 0) subItems.push(`📋 ${todos} TODOs to convert`);
      if (uncommented > 0) subItems.push(`📋 ${uncommented} files need [SCOPE] tags`);
    }

    return {
      id: 5,
      title: 'Project scanned',
      completed: hasScan && subItems.length === 0,
      inProgress: false,
      subItems: subItems.length > 0 ? subItems : undefined,
      action: hasScan ? undefined : 'Run "scan project" to analyze your codebase',
    };
  }

  private async checkStep6(): Promise<SetupStep> {
    // 6. All files under 200 lines
    if (!this.chassis.isInitialized()) {
      return { id: 6, title: 'All files under 200 lines', completed: false, inProgress: false };
    }
    const config = this.chassis.loadConfig();
    const largeFiles = config?.scanResults?.largeFiles?.length || 0;
    const completed = largeFiles === 0;
    return {
      id: 6,
      title: 'All files under 200 lines',
      completed,
      inProgress: false,
      action: completed ? undefined : `Split ${largeFiles} large file${largeFiles > 1 ? 's' : ''} into smaller files`,
    };
  }

  private async checkStep7(): Promise<SetupStep> {
    // 7. All files have [SCOPE] tags
    if (!this.chassis.isInitialized()) {
      return { id: 7, title: 'All files have [SCOPE] tags', completed: false, inProgress: false };
    }
    const config = this.chassis.loadConfig();
    const uncommented = config?.scanResults?.uncommented?.length || 0;
    const completed = uncommented === 0;
    return {
      id: 7,
      title: 'All files have [SCOPE] tags',
      completed,
      inProgress: false,
      action: completed ? undefined : `Add [SCOPE] tags to ${uncommented} file${uncommented > 1 ? 's' : ''}`,
    };
  }

  private async checkStep8(): Promise<SetupStep> {
    // 8. All TODOs converted to CHASSIS format
    if (!this.chassis.isInitialized()) {
      return { id: 8, title: 'All TODOs converted to CHASSIS format', completed: false, inProgress: false };
    }
    const config = this.chassis.loadConfig();
    const todos = config?.scanResults?.todos?.length || 0;
    const completed = todos === 0;
    return {
      id: 8,
      title: 'All TODOs converted to CHASSIS format',
      completed,
      inProgress: false,
      action: completed ? undefined : `Convert ${todos} TODO${todos > 1 ? 's' : ''} to CHASSIS format`,
    };
  }

  private async checkStep9(): Promise<SetupStep> {
    // 9. First session completed
    if (!this.chassis.isInitialized()) {
      return { id: 9, title: 'First session completed', completed: false, inProgress: false };
    }
    const config = this.chassis.loadConfig();
    const hasSessions = config?.sessions && config.sessions.length > 0;
    return {
      id: 9,
      title: 'First session completed',
      completed: !!hasSessions,
      inProgress: false,
      action: hasSessions ? undefined : 'Run "start session" to begin tracking your work',
    };
  }

  private async checkStep10(): Promise<SetupStep> {
    // 10. First save point created
    if (!this.chassis.isInitialized()) {
      return { id: 10, title: 'First save point created', completed: false, inProgress: false };
    }
    const config = this.chassis.loadConfig();
    const hasSavePoints = config?.savePoints && config.savePoints.length > 0;
    return {
      id: 10,
      title: 'First save point created',
      completed: !!hasSavePoints,
      inProgress: false,
      action: hasSavePoints ? undefined : 'Run "create save point" to save your progress',
    };
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
