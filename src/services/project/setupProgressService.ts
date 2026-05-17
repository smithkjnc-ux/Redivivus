// [SCOPE] CHASSIS Setup Progress Service — tracks and checks completion status of 10 setup steps
// Step checker functions -> setupProgressSteps.ts

import * as path from 'path';
import { ChassisService } from '../chassisService.js';
import {
  checkStep1, checkStep2, checkStep3, checkStep4, checkStep5,
  checkStep6, checkStep7, checkStep8, checkStep9, checkStep10,
} from './setupProgressSteps.js';

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
    const ctx = { chassis: this.chassis, root: this.root };
    const steps: SetupStep[] = await Promise.all([
      checkStep1(ctx), checkStep2(ctx), checkStep3(ctx), checkStep4(ctx), checkStep5(ctx),
      checkStep6(ctx), checkStep7(ctx), checkStep8(ctx), checkStep9(ctx), checkStep10(ctx),
    ]);

    const completedCount = steps.filter(s => s.completed).length;
    const totalCount = steps.length;
    const percentage = Math.round((completedCount / totalCount) * 100);

    return { projectName: path.basename(this.root), steps, completedCount, totalCount, percentage };
  }
}
