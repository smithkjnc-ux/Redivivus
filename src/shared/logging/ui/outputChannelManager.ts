// [SCOPE] VS Code Output Channels per layer — live visibility during development and debugging.
// Registers as a log listener (services layer) and routes entries to named Output Channels.
// One channel per layer + one master "All" channel. Call initOutputChannels() from extensionCommands.ts.

import * as vscode from 'vscode';
import type { StructuredLogEntry, LayerName } from '../infrastructure/logListeners.js';
import { addLogListener } from '../infrastructure/logListeners.js';

const LAYER_LABELS: Record<LayerName | 'all', string> = {
  commands: 'Commands',
  ui:       'UI',
  core:     'Core',
  services: 'Services',
  system:   'System',
  all:      'All',
};

const LEVEL_ICONS: Record<string, string> = {
  debug: '  ',
  info:  '  ',
  warn:  '[!]',
  error: '[X]',
};

const channels = new Map<string, vscode.OutputChannel>();

function getOrCreate(key: string): vscode.OutputChannel {
  if (!channels.has(key)) {
    const label = LAYER_LABELS[key as LayerName | 'all'] ?? key;
    channels.set(key, vscode.window.createOutputChannel(`Redivivus - ${label}`));
  }
  return channels.get(key)!;
}

function formatEntry(entry: StructuredLogEntry): string {
  const time = entry.ts.split('T')[1]?.split('.')[0] ?? entry.ts;
  const icon = LEVEL_ICONS[entry.level] ?? '   ';
  const loc  = `${entry.module}/${entry.fn}`;
  const bid  = entry.buildId ? ` <${String(entry.buildId).slice(-6)}>` : '';
  const data = entry.data ? ` | ${JSON.stringify(entry.data).slice(0, 120)}` : '';
  return `[${time}] ${icon} ${loc}${bid}: ${entry.msg}${data}`;
}

function onLogEntry(entry: StructuredLogEntry): void {
  const line = formatEntry(entry);
  // Layer-specific channel
  getOrCreate(entry.layer).appendLine(line);
  // Master "All" channel with layer prefix
  getOrCreate('all').appendLine(`[${entry.layer.toUpperCase().padEnd(8)}] ${line}`);
}

let _initialized = false;

export function initOutputChannels(): void {
  if (_initialized) { return; }
  _initialized = true;
  // Pre-create all channels so they appear in the Output picker from startup
  for (const key of Object.keys(LAYER_LABELS)) { getOrCreate(key); }
  addLogListener(onLogEntry);
}

/** Show a specific layer channel in the VS Code Output panel. */
export function showOutputChannel(layer: LayerName | 'all'): void {
  getOrCreate(layer).show(true);
}

export function disposeOutputChannels(): void {
  for (const ch of channels.values()) { ch.dispose(); }
  channels.clear();
  _initialized = false;
}
