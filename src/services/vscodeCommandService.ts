// [SCOPE] VS Code Command Discovery & Execution Service
// Allows CHASSIS to discover and execute ANY VS Code command dynamically
// This gives the AI access to "anything VS Code can do"

import * as vscode from 'vscode';

export interface VSCodeCommand {
  command: string;
  title: string;
  category?: string;
  description?: string;
}

export interface CommandExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Get all available VS Code commands
 * This queries the VS Code command registry at runtime
 */
export async function getAllVSCodeCommands(): Promise<VSCodeCommand[]> {
  // Get all command IDs from VS Code
  const allCommands = await vscode.commands.getCommands(true);
  
  // Filter to relevant categories and format
  const commands: VSCodeCommand[] = allCommands
    .filter(cmd => {
      // Include CHASSIS commands
      if (cmd.startsWith('chassis.')) return true;
      // Include workbench actions
      if (cmd.startsWith('workbench.action.')) return true;
      // Include editor actions
      if (cmd.startsWith('editor.action.')) return true;
      // Include file operations
      if (cmd.includes('file') || cmd.includes('folder')) return true;
      // Include git commands
      if (cmd.startsWith('git.')) return true;
      // Include terminal commands
      if (cmd.includes('terminal')) return true;
      // Include debug commands
      if (cmd.startsWith('debug.')) return true;
      // Include testing commands
      if (cmd.includes('test')) return true;
      // Include search commands
      if (cmd.includes('search')) return true;
      return false;
    })
    .map(cmd => ({
      command: cmd,
      title: formatCommandTitle(cmd),
      category: getCommandCategory(cmd),
    }));

  return commands;
}

/**
 * Execute any VS Code command dynamically
 */
export async function executeVSCodeCommand(
  commandId: string,
  ...args: any[]
): Promise<CommandExecutionResult> {
  try {
    const result = await vscode.commands.executeCommand(commandId, ...args);
    return { success: true, result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Search for commands by keyword
 */
export async function searchCommands(keyword: string): Promise<VSCodeCommand[]> {
  const allCommands = await getAllVSCodeCommands();
  const lowerKeyword = keyword.toLowerCase();
  
  return allCommands.filter(cmd => 
    cmd.command.toLowerCase().includes(lowerKeyword) ||
    cmd.title.toLowerCase().includes(lowerKeyword) ||
    (cmd.category?.toLowerCase().includes(lowerKeyword) ?? false)
  );
}

/**
 * Get commands by category
 */
export async function getCommandsByCategory(category: string): Promise<VSCodeCommand[]> {
  const allCommands = await getAllVSCodeCommands();
  return allCommands.filter(cmd => cmd.category === category);
}

/**
 * Common command categories for quick access
 */
export const COMMAND_CATEGORIES = {
  FILE: ['workbench.action.files', 'explorer.', 'file'],
  EDIT: ['editor.action.', 'workbench.action.editor'],
  VIEW: ['workbench.action.toggle', 'workbench.view'],
  GIT: ['git.'],
  DEBUG: ['debug.', 'workbench.action.debug'],
  TERMINAL: ['workbench.action.terminal'],
  SEARCH: ['workbench.action.search', 'actions.find'],
  CHASSIS: ['chassis.'],
};

/**
 * Format command ID into readable title
 */
function formatCommandTitle(command: string): string {
  // Remove common prefixes
  let title = command
    .replace('workbench.action.', '')
    .replace('editor.action.', '')
    .replace('chassis.', 'CHASSIS: ')
    .replace('git.', 'Git: ')
    .replace('debug.', 'Debug: ');
  
  // Convert camelCase/snake_case to spaces
  title = title
    .replace(/([A-Z])/g, ' $1')
    .replace(/-/g, ' ')
    .replace(/_/g, ' ');
  
  // Capitalize first letter
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * Determine command category from command ID
 */
function getCommandCategory(command: string): string {
  if (command.startsWith('chassis.')) return 'CHASSIS';
  if (command.includes('git.')) return 'Git';
  if (command.includes('debug.')) return 'Debug';
  if (command.includes('terminal')) return 'Terminal';
  if (command.includes('search') || command.includes('find')) return 'Search';
  if (command.includes('file') || command.includes('explorer')) return 'File';
  if (command.includes('editor')) return 'Edit';
  if (command.startsWith('workbench.view')) return 'View';
  if (command.includes('toggle')) return 'View';
  return 'Other';
}

/**
 * Check if a command exists
 */
export async function commandExists(commandId: string): Promise<boolean> {
  const allCommands = await vscode.commands.getCommands(true);
  return allCommands.includes(commandId);
}

/**
 * Get recently used commands (tracked by CHASSIS)
 */
const recentCommands: string[] = [];
const MAX_RECENT = 10;

export function recordCommandUsage(commandId: string): void {
  // Remove if already exists
  const index = recentCommands.indexOf(commandId);
  if (index > -1) {
    recentCommands.splice(index, 1);
  }
  // Add to front
  recentCommands.unshift(commandId);
  // Trim to max
  if (recentCommands.length > MAX_RECENT) {
    recentCommands.pop();
  }
}

export function getRecentCommands(): string[] {
  return [...recentCommands];
}
