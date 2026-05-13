// [SCOPE] Natural language → VS Code command router. Checks user input against a phrase dictionary before sending to AI.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface CommandEntry {
  phrases: string[];
  command: string;
}

let _dict: CommandEntry[] | undefined;

/** Loads and caches the commands.json dictionary from the extension's out/data folder */
function getDict(): CommandEntry[] {
  if (!_dict) {
    try {
      const ext = vscode.extensions.getExtension('papajoe.chassis');
      const extPath = ext?.extensionPath || path.join(__dirname, '..', '..');
      const jsonPath = path.join(extPath, 'out', 'data', 'commands.json');
      _dict = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as CommandEntry[];
    } catch {
      _dict = [];
    }
  }
  return _dict;
}

/**
 * Checks if the input matches a known VS Code command phrase.
 * Returns the matched command ID, or undefined if no match.
 */
export function matchVSCodeCommand(input: string): string | undefined {
  if (!input) { return undefined; }
  const normalized = input.toLowerCase().trim().replace(/[!?.]+$/, '');
  console.log('[DEBUG COMMAND ROUTER] Checking input:', normalized);
  const dict = getDict();
  for (const entry of dict) {
    for (const phrase of entry.phrases) {
      if (normalized === phrase || normalized.startsWith(phrase) || normalized.endsWith(phrase)) {
        console.log('[DEBUG COMMAND ROUTER] Matched phrase:', phrase, '→ command:', entry.command);
        return entry.command;
      }
    }
  }
  console.log('[DEBUG COMMAND ROUTER] No match found');
  return undefined;
}

/**
 * Attempts to execute a matched VS Code command from plain-English input.
 * Returns true if a command was matched and executed, false otherwise.
 */
export async function tryRouteToVSCodeCommand(input: string): Promise<boolean> {
  const commandId = matchVSCodeCommand(input);
  if (!commandId) { return false; }

  // [WARN] gotoLine needs special handling — extract the line number from input
  if (commandId === 'workbench.action.gotoLine') {
    const match = input.match(/\d+/);
    if (match) {
      await vscode.commands.executeCommand(commandId);
    } else {
      await vscode.commands.executeCommand(commandId);
    }
    return true;
  }

  try {
    await vscode.commands.executeCommand(commandId);
    return true;
  } catch {
    return false;
  }
}
