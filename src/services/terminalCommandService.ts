// [SCOPE] Terminal Command Service -- proposes, approves, and executes terminal commands.
// AI can suggest commands; user must approve before execution. Output is captured.
// [WARN] NEVER auto-run destructive commands (rm, drop, reset, force push).

import * as vscode from 'vscode';

export interface ProposedCommand {
  id: string;
  command: string;
  description: string;
  isSafe: boolean;
  cwd?: string;
}

export interface CommandResult {
  id: string;
  command: string;
  exitCode: number | undefined;
  output: string;
  error?: string;
}

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf?\b/i,
  /\bgit\s+(push\s+--force|reset\s+--hard|clean\s+-fd)/i,
  /\bdrop\s+(table|database)\b/i,
  /\bformat\b.*\b(disk|drive|partition)\b/i,
  /\bsudo\s+rm\b/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
];

const _pendingCommands = new Map<string, ProposedCommand>();
let _commandCounter = 0;

/**
 * Propose a command for user approval.
 * Returns the proposal ID for tracking.
 */
export function proposeCommand(command: string, description: string, cwd?: string): ProposedCommand {
  const id = `cmd-${++_commandCounter}-${Date.now()}`;
  const isSafe = !DESTRUCTIVE_PATTERNS.some(p => p.test(command));
  const proposal: ProposedCommand = { id, command, description, isSafe, cwd };
  _pendingCommands.set(id, proposal);
  return proposal;
}

/**
 * Execute an approved command in the integrated terminal.
 * Returns captured output via a task execution.
 */
export async function executeApprovedCommand(id: string): Promise<CommandResult> {
  const proposal = _pendingCommands.get(id);
  if (!proposal) {
    return { id, command: '', exitCode: -1, output: '', error: 'Command not found or already executed' };
  }
  _pendingCommands.delete(id);

  try {
    const cwd = proposal.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || undefined;
    const task = new vscode.Task(
      { type: 'chassis-cmd', id },
      vscode.TaskScope.Workspace,
      `CHASSIS: ${proposal.description.slice(0, 40)}`,
      'CHASSIS',
      new vscode.ShellExecution(proposal.command, { cwd })
    );
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Shared };

    const execution = await vscode.tasks.executeTask(task);
    // Wait for task to complete
    const result = await new Promise<CommandResult>((resolve) => {
      const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.execution === execution) {
          disposable.dispose();
          resolve({
            id,
            command: proposal.command,
            exitCode: e.exitCode,
            output: '', // Terminal output not directly accessible via task API
          });
        }
      });
      // Timeout after 60 seconds
      setTimeout(() => {
        disposable.dispose();
        resolve({ id, command: proposal.command, exitCode: undefined, output: '', error: 'Timed out after 60s' });
      }, 60_000);
    });
    return result;
  } catch (err) {
    return { id, command: proposal.command, exitCode: -1, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reject a proposed command -- removes it from pending.
 */
export function rejectCommand(id: string): boolean {
  return _pendingCommands.delete(id);
}

/**
 * Get all pending commands awaiting approval.
 */
export function getPendingCommands(): ProposedCommand[] {
  return [..._pendingCommands.values()];
}

/**
 * Check if a command string looks destructive.
 */
export function isDestructive(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some(p => p.test(command));
}

/**
 * Format a command proposal as a chat message card.
 */
export function formatCommandCard(proposal: ProposedCommand): string {
  const safetyBadge = proposal.isSafe
    ? '[SAFE]'
    : '[DESTRUCTIVE -- requires explicit approval]';
  return `**Proposed command** ${safetyBadge}\n\`\`\`\n${proposal.command}\n\`\`\`\n${proposal.description}\n\n__CMD_APPROVE__${proposal.id}|||${proposal.command}|||END_CMD__`;
}
