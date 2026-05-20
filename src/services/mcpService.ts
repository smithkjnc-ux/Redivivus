// [SCOPE] MCP (Model Context Protocol) Server Integration -- connects to external tool servers.
// Allows CHASSIS to use external resources, databases, APIs, and tools via MCP protocol.
// [WARN] MCP servers run as child processes. Always validate server paths before spawning.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: any;
  serverName: string;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverName: string;
}

export interface McpCallResult {
  success: boolean;
  content?: string;
  error?: string;
}

interface McpConnection {
  config: McpServerConfig;
  process: ChildProcess;
  tools: McpTool[];
  resources: McpResource[];
  requestId: number;
  pendingRequests: Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>;
}

const _connections = new Map<string, McpConnection>();

/**
 * Load MCP server configurations from .chassis/mcp.json or workspace settings.
 */
export function loadMcpConfigs(root: string): McpServerConfig[] {
  const configPath = path.join(root, '.chassis', 'mcp.json');
  if (!fs.existsSync(configPath)) { return []; }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.servers) ? parsed.servers : [];
  } catch { return []; }
}

/**
 * Connect to an MCP server.
 */
export async function connectServer(config: McpServerConfig): Promise<boolean> {
  if (_connections.has(config.name)) { return true; } // Already connected
  try {
    const proc = spawn(config.command, config.args || [], {
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const conn: McpConnection = {
      config, process: proc, tools: [], resources: [],
      requestId: 0, pendingRequests: new Map(),
    };

    // Handle stdout (JSON-RPC responses)
    let buffer = '';
    proc.stdout?.on('data', (data) => {
      buffer += data.toString();
      // Parse JSON-RPC messages (newline-delimited)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) { continue; }
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && conn.pendingRequests.has(msg.id)) {
            const pending = conn.pendingRequests.get(msg.id)!;
            conn.pendingRequests.delete(msg.id);
            if (msg.error) { pending.reject(msg.error); }
            else { pending.resolve(msg.result); }
          }
        } catch {}
      }
    });

    proc.on('exit', () => { _connections.delete(config.name); });
    _connections.set(config.name, conn);

    // Initialize the server
    await sendRequest(config.name, 'initialize', { capabilities: {} });
    // Discover tools
    try {
      const toolsResult = await sendRequest(config.name, 'tools/list', {});
      conn.tools = (toolsResult?.tools || []).map((t: any) => ({ ...t, serverName: config.name }));
    } catch {}
    // Discover resources
    try {
      const resourcesResult = await sendRequest(config.name, 'resources/list', {});
      conn.resources = (resourcesResult?.resources || []).map((r: any) => ({ ...r, serverName: config.name }));
    } catch {}

    return true;
  } catch { return false; }
}

/**
 * Call a tool on an MCP server.
 */
export async function callTool(serverName: string, toolName: string, args: any): Promise<McpCallResult> {
  try {
    const result = await sendRequest(serverName, 'tools/call', { name: toolName, arguments: args });
    const content = result?.content?.map((c: any) => c.text || JSON.stringify(c)).join('\n') || '';
    return { success: true, content };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Read a resource from an MCP server.
 */
export async function readResource(serverName: string, uri: string): Promise<McpCallResult> {
  try {
    const result = await sendRequest(serverName, 'resources/read', { uri });
    const content = result?.contents?.map((c: any) => c.text || JSON.stringify(c)).join('\n') || '';
    return { success: true, content };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Get all available tools across all connected servers.
 */
export function getAllTools(): McpTool[] {
  const tools: McpTool[] = [];
  for (const conn of _connections.values()) {
    tools.push(...conn.tools);
  }
  return tools;
}

/**
 * Get all available resources across all connected servers.
 */
export function getAllResources(): McpResource[] {
  const resources: McpResource[] = [];
  for (const conn of _connections.values()) {
    resources.push(...conn.resources);
  }
  return resources;
}

/**
 * Disconnect all MCP servers.
 */
export function disconnectAll(): void {
  for (const conn of _connections.values()) {
    try { conn.process.kill(); } catch {}
  }
  _connections.clear();
}

/**
 * Get connected server names.
 */
export function getConnectedServers(): string[] {
  return [..._connections.keys()];
}

// --- Internal ---

function sendRequest(serverName: string, method: string, params: any): Promise<any> {
  const conn = _connections.get(serverName);
  if (!conn) { return Promise.reject(new Error(`Server "${serverName}" not connected`)); }
  const id = ++conn.requestId;
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  return new Promise((resolve, reject) => {
    conn.pendingRequests.set(id, { resolve, reject });
    conn.process.stdin?.write(msg);
    // Timeout after 30 seconds
    setTimeout(() => {
      if (conn.pendingRequests.has(id)) {
        conn.pendingRequests.delete(id);
        reject(new Error('MCP request timed out'));
      }
    }, 30_000);
  });
}
