// [SCOPE] CHASSIS Chat Panel AI helpers — system prompt builder, command card renderer, response processor
// Extracted from chatPanelHtml.ts. Keep under 200 lines.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { LearnedMemoryService } from '../services/learnedMemoryService.js';
import { getSystemPrompt } from './chatPanelAIPrompt.js';

export function buildAIPrefix(chassis: ChassisService, recentMessages: string[] = [], routing?: any, fullConversation?: Array<{role: string; content: string}>, userText?: string): string {
  const config = chassis.isInitialized() ? chassis.loadConfig() : null;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'none';
  const bp = config?.blueprint;

  let bpStr = 'No blueprint set.';
  if (bp) {
    bpStr = ['who','what','where','when','why'].map(f => `${f.toUpperCase()}: ${String(bp[f as keyof typeof bp] || '(not set)').trim()}`).join('\n');
  }

  let activeFileContext = '';
  try {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const filePath = editor.document.uri.fsPath;
      const relPath = workspaceRoot !== 'none' ? path.relative(workspaceRoot, filePath) : filePath;
      const lines = editor.document.getText().split('\n');
      activeFileContext = `\n--- ACTIVE FILE: ${relPath} ---\n\`\`\`\n${lines.slice(0, 150).join('\n')}\n\`\`\`\n`;
    }
  } catch {}

  let conversationContext = '';
  if (fullConversation) {
    conversationContext = '\n--- HISTORY ---\n' + fullConversation.slice(-10).map(m => `${m.role}: ${m.content.slice(0, 300)}`).join('\n') + '\n';
  }

  const prompt = getSystemPrompt(bpStr);
  return `${prompt}\n${activeFileContext}${conversationContext}\nUser:`;
}

export function commandLabel(command: string): string {
  const labels: Record<string, string> = {
    'chassis.startSession': '🚀 Start Session', 'chassis.endSession': '🏁 End Session',
    'chassis.wizardRetrofit': '🆕 New Project', 'chassis.analyze': '🔍 Analyze',
    'chassis.openVault': '💾 Vault', 'chassis.savePoint': '💾 Save Point'
  };
  return labels[command] || `▶ Run: ${command}`;
}

const SAFE_COMMANDS = ['chassis.showMap', 'chassis.viewUsageInChat', 'chassis.log', 'chassis.deadends', 'chassis.openVault'];

export function processAIResponse(text: string): { text: string; executedCommand: boolean } {
  const match = text.match(/\[\[COMMAND:(\w+(?:\.\w+)*)\]\]/);
  if (match) {
    const cmd = match[1];
    if (SAFE_COMMANDS.includes(cmd)) {
      vscode.commands.executeCommand(cmd).then(() => {}, () => {});
      return { text: text.replace(match[0], '').trim(), executedCommand: true };
    }
    return { text: text.replace(match[0], `__ACTION_CARD__${cmd}|||${commandLabel(cmd)}|||END__`).trim(), executedCommand: false };
  }
  return { text, executedCommand: false };
}
