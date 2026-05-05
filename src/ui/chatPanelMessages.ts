// [SCOPE] CHASSIS Chat Panel message handler — routes all webview → extension messages

import * as vscode from 'vscode';
import * as fs from 'fs';
import { RoutingService } from '../services/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { ChassisService } from '../services/chassisService.js';
import { ChatMessage } from './chatPanelHtml.js';
import { buildAIPrefix, processAIResponse } from './chatPanelAI.js';

export interface MessageHandlerDeps {
  chassis: ChassisService;
  routing: RoutingService;
  usageTracker?: UsageTracker;
  conversation: ChatMessage[];
  panel: vscode.WebviewPanel;
  isBuildRequest: (text: string) => boolean;
  handleBuildRequest: (task: string) => Promise<void>;
  buildFromVaultPrefill: () => { task?: string; targetFile?: string };
  refresh: () => void;
  onStartSession?: (goal: string, ai: string) => Promise<void>;
  onSwitchAI?: (ai: string) => Promise<void>;
  onNewProject?: (name: string, answers: Record<string, string>, folderPath?: string) => Promise<void>;
}

export async function handleChatMessage(msg: any, deps: MessageHandlerDeps): Promise<void> {
  const { chassis, routing, usageTracker, conversation, panel, refresh } = deps;

  if (msg.type === 'send-message') {
    const userText = msg.text?.trim();
    if (!userText) { return; }
    conversation.push({ role: 'user', content: userText, timestamp: Date.now() });
    refresh();

    if (deps.isBuildRequest(userText)) {
      await deps.handleBuildRequest(userText);
      return;
    }

    try {
      const prefix = buildAIPrefix(chassis);
      const aiResponse = await routing.prompt(prefix + userText);
      const estimatedTokens = Math.ceil(aiResponse.text.length / 4);
      const estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
      await usageTracker?.recordUsage(estimatedTokens, estimatedCost, aiResponse.model || 'unknown');
      const { text: processedResponse, executedCommand } = processAIResponse(aiResponse.text || '');
      conversation.push({ role: 'assistant', content: processedResponse, timestamp: Date.now(), tokens: estimatedTokens, cost: estimatedCost });
      if (!executedCommand) { refresh(); }
    } catch (err) {
      conversation.push({ role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, timestamp: Date.now() });
      refresh();
    }

  } else if (msg.type === 'open-file') {
    const filePath = msg.filePath;
    if (filePath && fs.existsSync(filePath)) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc, { preview: false });
    }

  } else if (msg.type === 'create-file') {
    const { code, filename } = msg;
    if (!code || !filename) { return; }
    try {
      const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
      if (!rootPath) { vscode.window.showErrorMessage('No workspace open'); return; }
      const filePath = vscode.Uri.file(`${rootPath}/${filename}`);
      await vscode.workspace.fs.writeFile(filePath, Buffer.from(code));
      await vscode.window.showTextDocument(filePath);
      vscode.window.showInformationMessage(`Created ${filename}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create file: ${err instanceof Error ? err.message : 'unknown'}`);
    }

  } else if (msg.type === 'clear-chat') {
    conversation.length = 0;
    refresh();

  } else if (msg.type === 'run-command') {
    const command = msg.command;
    if (command) {
      try {
        if (command === 'chassis.buildFromVault') {
          await vscode.commands.executeCommand(command, deps.buildFromVaultPrefill());
        } else {
          await vscode.commands.executeCommand(command);
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Command failed: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

  } else if (msg.type === 'start-session') {
    if (deps.onStartSession) { await deps.onStartSession(msg.goal || '', msg.ai || 'Unknown'); }

  } else if (msg.type === 'switch-ai') {
    if (deps.onSwitchAI) { await deps.onSwitchAI(msg.ai || 'gemini'); }

  } else if (msg.type === 'new-project') {
    if (deps.onNewProject) { await deps.onNewProject(msg.name || '', msg.answers || {}, msg.folderPath || undefined); }

  } else if (msg.type === 'browse-folder') {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false, canSelectFolders: true, canSelectFiles: false,
      openLabel: 'Select Project Parent Folder',
      defaultUri: msg.currentPath ? vscode.Uri.file(msg.currentPath) : undefined,
    });
    if (picked && picked.length > 0) {
      panel.webview.postMessage({ type: 'browse-result', folderPath: picked[0].fsPath });
    }
  }
}
