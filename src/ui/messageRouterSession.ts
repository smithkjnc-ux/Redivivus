// [SCOPE] Session and AI config message handlers — start/end session, switch AI, save API keys
// Called by messageRouter orchestrator. No wizard or vault logic here.

import * as vscode from 'vscode';
import { SessionService } from '../services/sessionService.js';

export async function handleSessionMessage(
  msg: any,
  sessions: SessionService,
  refresh: () => void
): Promise<boolean> {
  switch (msg.type) {
    case 'startSession':
      await sessions.startSession(msg.goal, msg.ai);
      refresh();
      return true;
    case 'endSession':
      await sessions.endSessionWithData(msg.data);
      refresh();
      return true;
    case 'openExternal':
      if (msg.url) vscode.env.openExternal(vscode.Uri.parse(msg.url));
      return true;
    case 'switchAI': {
      const aiCfg = vscode.workspace.getConfiguration('chassis');
      await aiCfg.update('defaultAI', msg.ai, true);
      vscode.window.showInformationMessage('CHASSIS now using ' + msg.ai.toUpperCase());
      refresh();
      return true;
    }
    case 'saveApiKey': {
      const keyCfg = vscode.workspace.getConfiguration('chassis');
      const keyMap: Record<string, string> = { gemini: 'geminiApiKey', claude: 'claudeApiKey', openai: 'openaiApiKey', groq: 'groqApiKey', xai: 'xaiApiKey', kimi: 'kimiApiKey' };
      const setting = keyMap[msg.ai];
      if (!setting) return false;
      await keyCfg.update(setting, msg.key || '', vscode.ConfigurationTarget.Global);
      if (msg.key) {
        vscode.window.showInformationMessage(`✓ ${msg.ai.charAt(0).toUpperCase() + msg.ai.slice(1)} API key saved.`);
      } else {
        vscode.window.showInformationMessage(`${msg.ai.charAt(0).toUpperCase() + msg.ai.slice(1)} API key cleared.`);
      }
      refresh();
      return true;
    }
    case 'getState':
      refresh();
      return true;
    default:
      return false;
  }
}
