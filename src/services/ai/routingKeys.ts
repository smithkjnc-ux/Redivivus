// [SCOPE] Routing API key getters — retrieves API keys from VSCode settings or environment variables
// Called by routingService and routingProviders. No provider calling logic here.

import * as vscode from 'vscode';

function isDisabled(providerId: string): boolean {
  const config = vscode.workspace.getConfiguration('chassis');
  const disabled = config.get<string[]>('disabledProviders') || [];
  return disabled.includes(providerId);
}

export function getGeminiKey(): string | null {
  if (isDisabled('gemini')) {return null;}
  const config = vscode.workspace.getConfiguration('chassis');
  const key = config.get<string>('geminiApiKey') || process.env.GEMINI_API_KEY || '';
  return key || null;
}

export function getClaudeKey(): string | null {
  if (isDisabled('claude')) {return null;}
  const config = vscode.workspace.getConfiguration('chassis');
  return config.get<string>('claudeApiKey') || process.env.ANTHROPIC_API_KEY || null;
}

export function getOpenAIKey(): string | null {
  if (isDisabled('openai')) {return null;}
  const config = vscode.workspace.getConfiguration('chassis');
  return config.get<string>('openaiApiKey') || process.env.OPENAI_API_KEY || null;
}

export function getGroqKey(): string | null {
  if (isDisabled('groq')) {return null;}
  const config = vscode.workspace.getConfiguration('chassis');
  return config.get<string>('groqApiKey') || process.env.GROQ_API_KEY || null;
}

export function getXAIKey(): string | null {
  if (isDisabled('xai')) {return null;}
  const config = vscode.workspace.getConfiguration('chassis');
  return config.get<string>('xaiApiKey') || process.env.XAI_API_KEY || null;
}

export function getKimiKey(): string | null {
  if (isDisabled('kimi')) {return null;}
  const config = vscode.workspace.getConfiguration('chassis');
  return config.get<string>('kimiApiKey') || process.env.MOONSHOT_API_KEY || null;
}
