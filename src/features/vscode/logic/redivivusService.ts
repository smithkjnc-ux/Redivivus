// [SCOPE] Redivivus service orchestrator — thin facade over path, config, init, rules, and logging modules
// Split from 427-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import { RedivivusPaths, isInitialized, hasWorkspace } from '../../../features/project/application/redivivusPaths.js';
import { loadConfig, saveConfig } from './redivivusConfig.js';
import { initProject, scaffoldAt } from '../../../features/project/application/redivivusInit.js';
import { generateRules } from '../domain/rules/redivivusRules.js';
import { updateGitignore, appendWorkLog, appendRoadmap, appendDeadEnd } from '../../logging/infrastructure/redivivusLogging.js';

export class RedivivusService {
  private paths: RedivivusPaths;
  private sessionAiTemperature?: any;

  constructor(root?: string) {
    this.paths = new RedivivusPaths(root);
  }

  // ── Session state (in memory)

  setSessionAiTemperature(temp: any) { this.sessionAiTemperature = temp; }
  getSessionAiTemperature() { return this.sessionAiTemperature; }

  // ── path helpers (delegated to RedivivusPaths)

  get redivivusDir(): string { return this.paths.redivivusDir; }
  get configPath(): string { return this.paths.configPath; }
  get blueprintPath(): string { return this.paths.blueprintPath; }
  get worklogPath(): string { return this.paths.worklogPath; }
  get deadendsPath(): string { return this.paths.deadendsPath; }
  get sessionsDir(): string { return this.paths.sessionsDir; }
  get roadmapPath(): string { return this.paths.roadmapPath; }

  // ── state checks (delegated to RedivivusPaths)

  isInitialized(): boolean { return isInitialized(this.paths); }
  hasWorkspace(): boolean { return hasWorkspace(this.paths); }

  /** Returns true if the given folder has already been set up with Redivivus (.redivivus/config.json exists). */
  static hasRedivivusSetup(folderPath: string): boolean {
    return fs.existsSync(path.join(folderPath, '.redivivus', 'config.json'));
  }

  // ── workspace root (for compatibility with guardianService)

  getWorkspaceRoot(): string | undefined { return this.paths.getWorkspaceRoot(); }

  // ── initialization (delegated to redivivusInit)

  async initProject(projectName: string): Promise<void> {
    await initProject(this.paths, projectName);
  }

  async scaffoldAt(targetPath: string, projectName: string, blueprint?: any): Promise<void> {
    await scaffoldAt(targetPath, projectName, blueprint);
  }

  // ── config read/write (delegated to redivivusConfig)

  loadConfig() { return loadConfig(this.paths); }
  saveConfig(config: any) { saveConfig(this.paths, config); }

  // ── rules generation (delegated to redivivusRules)

  generateRules(projectName: string, blueprint: any, targetPath?: string) {
    generateRules(this.paths, projectName, blueprint, targetPath);
  }

  // ── logging (delegated to redivivusLogging)

  async updateGitignore() {
    const root = this.paths.getWorkspaceRoot();
    if (root) {await updateGitignore(root);}
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
