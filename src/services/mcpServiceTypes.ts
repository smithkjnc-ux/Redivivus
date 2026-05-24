// [SCOPE] MCP Service type definitions — extracted from mcpService.ts (Rule 9 split)

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
