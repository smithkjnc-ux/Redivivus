// [SCOPE] CHASSIS service orchestrator — thin facade over path, config, init, rules, and logging modules
// Split from 427-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import { ChassisPaths, isInitialized, hasWorkspace } from './chassisPaths.js';
import { loadConfig, saveConfig } from './chassisConfig.js';
import { initProject, scaffoldAt } from './chassisInit.js';
import { generateRules } from './chassisRules.js';
import { updateGitignore, appendWorkLog, appendRoadmap, appendDeadEnd } from './chassisLogging.js';

export class ChassisService {
  private paths: ChassisPaths;

  constructor(root?: string) {
    this.paths = new ChassisPaths(root);
  }

  // ── path helpers (delegated to ChassisPaths)

  get chassisDir(): string { return this.paths.chassisDir; }
  get configPath(): string { return this.paths.configPath; }
  get blueprintPath(): string { return this.paths.blueprintPath; }
  get worklogPath(): string { return this.paths.worklogPath; }
  get deadendsPath(): string { return this.paths.deadendsPath; }
  get sessionsDir(): string { return this.paths.sessionsDir; }
  get roadmapPath(): string { return this.paths.roadmapPath; }

  // ── state checks (delegated to ChassisPaths)

  isInitialized(): boolean { return isInitialized(this.paths); }
  hasWorkspace(): boolean { return hasWorkspace(this.paths); }

  /** Returns true if the given folder has already been set up with CHASSIS (.chassis/config.json exists). */
  static hasChassisSetup(folderPath: string): boolean {
    return fs.existsSync(path.join(folderPath, '.chassis', 'config.json'));
  }

  // ── workspace root (for compatibility with guardianService)

  getWorkspaceRoot(): string | undefined { return this.paths.getWorkspaceRoot(); }

  // ── initialization (delegated to chassisInit)

  async initProject(projectName: string): Promise<void> {
    await initProject(this.paths, projectName);
  }

  async scaffoldAt(targetPath: string, projectName: string, blueprint?: any): Promise<void> {
    await scaffoldAt(targetPath, projectName, blueprint);
  }

  // ── config read/write (delegated to chassisConfig)

  loadConfig() { return loadConfig(this.paths); }
  saveConfig(config: any) { saveConfig(this.paths, config); }

  // ── rules generation (delegated to chassisRules)

  generateRules(projectName: string, blueprint: any, targetPath?: string) {
    generateRules(this.paths, projectName, blueprint, targetPath);
  }

  // ── logging (delegated to chassisLogging)

  async updateGitignore() {
    const root = this.paths.getWorkspaceRoot();
    if (root) await updateGitignore(root);
  }

  appendWorkLog(text: string) {
    appendWorkLog(this.paths, text);
  }

  appendRoadmap(sessionGoal: string, completed: string[], inProgress: string[], nextStart: string) {
    appendRoadmap(this.paths, sessionGoal, completed, inProgress, nextStart);
  }

  appendDeadEnd(attempted: string, failedBecause: string, lesson: string) {
    appendDeadEnd(this.paths, attempted, failedBecause, lesson);
  }
}
