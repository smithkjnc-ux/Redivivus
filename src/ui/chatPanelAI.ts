// [SCOPE] CHASSIS Chat Panel AI helpers — system prompt builder, command card renderer, response processor

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';

/** Builds the system prompt prefix injected before every non-build user question */
export function buildAIPrefix(chassis: ChassisService): string {
  const config = chassis.isInitialized() ? chassis.loadConfig() : null;
  const projectName = config?.projectName || vscode.workspace.workspaceFolders?.[0]?.name || 'No project open';
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'none';
  const bp = config?.blueprint;
  const bpContext = bp ? `\nBlueprint — Who: ${bp.who || '?'}, What: ${bp.what || '?'}, Where: ${bp.where || '?'}` : '';

  return `You are CHASSIS, an AI coding assistant embedded in VS Code. Answer questions directly and helpfully. Keep responses concise.

Project: ${projectName}
Workspace: ${workspaceRoot}
CHASSIS initialized: ${chassis.isInitialized()}${bpContext}

--- YOUR ROLE ---
You answer questions about this project, explain code, discuss architecture, and help the user understand what to do next.
Build/create/write requests are handled automatically by a separate system — you will NOT see them here.

--- WHEN TO SUGGEST A COMMAND ---
Only suggest a command when the user explicitly asks for an action that maps to one below.
Format: one sentence explaining what you'll do, then EXACTLY ONE token on its own line: [[COMMAND:chassis.commandName]]

start session / begin session → [[COMMAND:chassis.startSession]]
end session → [[COMMAND:chassis.endSession]]
start new project / create project → [[COMMAND:chassis.wizardRetrofit]]
open project / switch project → [[COMMAND:chassis.openProject]]
initialize chassis / add chassis here → [[COMMAND:chassis.init]]
analyze project / scan project → [[COMMAND:chassis.analyze]]
review code / code review → [[COMMAND:chassis.reviewFile]]
blueprint / update blueprint → [[COMMAND:chassis.blueprint]]
open blueprint → [[COMMAND:chassis.openBlueprint]]
generate rules → [[COMMAND:chassis.generateRules]]
open vault / browse vault → [[COMMAND:chassis.openVault]]
scan codebase to vault → [[COMMAND:chassis.scanVaultCodebase]]
work log / show log → [[COMMAND:chassis.log]]
switch AI / change AI → [[COMMAND:chassis.switchAI]]
usage / tokens spent → [[COMMAND:chassis.viewUsageInChat]]
settings / api key → [[COMMAND:chassis.openSettings]]

--- DO NOT ---
- Do NOT suggest chassis.buildFromVault — builds are handled directly.
- Do NOT suggest commands for questions that are just asking for information.
- Do NOT use [[COMMAND:chassis.init]] when user says "new project".

User question: `;
}

/** Human-readable label for each known command */
export function commandLabel(command: string): string {
  const labels: Record<string, string> = {
    'chassis.startSession':      '🚀 Start Session',
    'chassis.endSession':        '🏁 End Session',
    'chassis.openProject':       '📂 Open Project Folder',
    'chassis.wizardRetrofit':    '🆕 Start New Project Setup',
    'chassis.init':              '🆕 Initialize CHASSIS Here',
    'chassis.blueprint':         '📋 Run Blueprint Interview',
    'chassis.openBlueprint':     '📄 Open Blueprint File',
    'chassis.generateRules':     '📜 Generate AI Rules',
    'chassis.analyze':           '🔍 Analyze Project',
    'chassis.analyzeFile':       '🔍 Analyze Current File',
    'chassis.reviewFile':        '🤖 AI Code Review',
    'chassis.retrofit':          '🔧 Retrofit Project',
    'chassis.restructureFile':   '✂️ Clean Up File',
    'chassis.openVault':         '💾 Open Vault',
    'chassis.saveToVault':       '💾 Save to Vault',
    'chassis.scanVaultCodebase': '🔎 Scan Project to Vault',
    'chassis.buildFromVault':    '🏗️ Build from Vault',
    'chassis.validateVault':     '✅ Validate Vault',
    'chassis.log':               '📋 Show Work Log',
    'chassis.deadends':          '💀 Show Dead Ends',
    'chassis.switchAI':          '🤖 Switch AI',
    'chassis.viewUsageInChat':   '📊 View Usage Stats',
    'chassis.openSettings':      '⚙️ Open Settings',
  };
  return labels[command] || `▶ Run: ${command}`;
}

/** Detects [[COMMAND:id]] tokens in AI response and converts to action card format */
export function processAIResponse(text: string): { text: string; executedCommand: boolean } {
  const commandMatch = text.match(/\[\[COMMAND:(\w+(?:\.\w+)*)\]\]/);
  if (commandMatch) {
    const command = commandMatch[1];
    const label = commandLabel(command);
    const card = `__ACTION_CARD__${command}|||${label}|||END__`;
    return { text: text.replace(commandMatch[0], card).trim(), executedCommand: false };
  }
  return { text, executedCommand: false };
}
