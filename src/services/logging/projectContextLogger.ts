// [SCOPE] Project Context Logger — tracks all project switches and new project creation
// This prevents silent project switching bugs

import * as fs from 'fs';
import * as path from 'path';

interface ProjectContextEvent {
  timestamp: string;
  type: 'workspace_opened' | 'workspace_switched' | 'new_project_created' | 'project_switch_blocked';
  previousRoot?: string | null;
  newRoot: string;
  trigger: string;
  userRequest?: string;
  blocked?: boolean;
  reason?: string;
}

let currentProjectRoot: string | null = null;
let contextLogFile: string | null = null;

/** Initialize project context tracking */
export function initProjectContextLogger(root: string): void {
  if (currentProjectRoot === root) {return;} // Already tracking this project
  
  const logsDir = path.join(root, '.redivivus', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  contextLogFile = path.join(logsDir, 'project-context.log');
  
  const event: ProjectContextEvent = {
    timestamp: new Date().toISOString(),
    type: 'workspace_opened',
    newRoot: root,
    trigger: 'extension_activate'
  };
  
  appendContextLog(event);
  currentProjectRoot = root;
}

/** Log a project context switch attempt */
export function logProjectContextSwitch(
  newRoot: string,
  trigger: string,
  userRequest?: string
): { allowed: boolean; reason?: string } {
  const previousRoot = currentProjectRoot;
  
  // Validation: Prevent switching to a different project during a fix/build request
  if (previousRoot && previousRoot !== newRoot) {
    const event: ProjectContextEvent = {
      timestamp: new Date().toISOString(),
      type: 'project_switch_blocked',
      previousRoot,
      newRoot,
      trigger,
      userRequest,
      blocked: true,
      reason: 'CRITICAL: Attempted to switch projects during active session. User was in one project but Redivivus tried to work in another. This is a bug.'
    };
    appendContextLog(event);
    
    // Also log to the main Redivivus log
    const redivivusLog = {
      timestamp: new Date().toISOString(),
      operation: 'system',
      message: 'PROJECT SWITCH BLOCKED',
      data: {
        previousProject: previousRoot,
        attemptedNewProject: newRoot,
        trigger,
        userRequest,
        action: 'Switch prevented. Redivivus should not change projects without explicit user request.'
      }
    };
    
    if (contextLogFile) {
      fs.appendFileSync(contextLogFile, JSON.stringify(redivivusLog) + '\n', 'utf-8');
    }
    
    return { allowed: false, reason: event.reason };
  }
  
  // Log the switch
  const event: ProjectContextEvent = {
    timestamp: new Date().toISOString(),
    type: previousRoot ? 'workspace_switched' : 'new_project_created',
    previousRoot,
    newRoot,
    trigger,
    userRequest
  };
  appendContextLog(event);
  
  currentProjectRoot = newRoot;
  return { allowed: true };
}

/** Check if we're trying to work in the wrong project */
export function validateProjectContext(expectedRoot: string, operation: string): boolean {
  if (!currentProjectRoot) {
    const event: ProjectContextEvent = {
      timestamp: new Date().toISOString(),
      type: 'project_switch_blocked',
      newRoot: expectedRoot,
      trigger: operation,
      blocked: true,
      reason: 'No project context initialized - cannot validate'
    };
    appendContextLog(event);
    return false;
  }
  
  if (currentProjectRoot !== expectedRoot) {
    const event: ProjectContextEvent = {
      timestamp: new Date().toISOString(),
      type: 'project_switch_blocked',
      previousRoot: currentProjectRoot,
      newRoot: expectedRoot,
      trigger: operation,
      blocked: true,
      reason: `Context mismatch: Expected ${expectedRoot} but current context is ${currentProjectRoot}`
    };
    appendContextLog(event);
    return false;
  }
  
  return true;
}

/** Get current tracked project root */
export function getCurrentProjectContext(): string | null {
  return currentProjectRoot;
}

function appendContextLog(event: ProjectContextEvent): void {
  if (!contextLogFile) {return;}
  
  try {
    fs.appendFileSync(contextLogFile, JSON.stringify(event) + '\n', 'utf-8');
  } catch (e) {
    console.error('[Redivivus] Failed to write context log:', e);
  }
}
