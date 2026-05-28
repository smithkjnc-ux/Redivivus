// [SCOPE] Cloud build client — thin client: gets routing instructions from backend, executes AI calls client-side, sends results back
// Backend provides secret sauce, client handles AI API calls with user keys

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getAccountToken, getApiBase, collectKeys, getPreferred } from '../api/apiClient.js';
import { collectBuildContext } from './buildContextCollector.js';
import { writeBuiltFile, createSnapshot, openBuiltFile } from '../../core/build/chatPanelBuildWriter.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';
import type { VaultService } from '../vault/vaultService';
import { callProvider } from '../../core/ai/providers/providerFactory.js';

export interface CloudBuildResult {
  success: boolean
  files?: Array<{ path: string; content: string; isNew: boolean }>
  narration?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  error?: string
}

export async function callCloudBuild(
  task: string,
  root: string,
  deps: BuildRequestDeps,
  opts: { targetFile?: string; isFix?: boolean } = {},
): Promise<CloudBuildResult> {
  const token = await getAccountToken();
  if (!token) {
    return { success: false, error: 'NOT_AUTHENTICATED' };
  }

  const vault = (deps as any).vault as VaultService | undefined;
  const context = await collectBuildContext(root, task, vault, opts.targetFile, opts.isFix);
  const keys = collectKeys();

  try {
    // Step 1: Get routing instructions from backend (SECRET SAUCE)
    const instructionRes = await fetch(`${getApiBase()}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        task,
        context,
        keys,
        preferred: getPreferred(),
        tier: 'pro' as const,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (instructionRes.status === 401) {
      const { clearAccountToken } = await import('../api/apiClient.js');
      await clearAccountToken();
      vscode.commands.executeCommand('redivivus.refreshChat');
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }
    if (!instructionRes.ok) {
      const err = await instructionRes.json().catch(() => ({ error: instructionRes.statusText })) as any;
      return { success: false, error: err.error || `Build API ${instructionRes.status}` };
    }

    const instructions = await instructionRes.json() as {
      instructions: {
        routing: {
          selectedProvider: string;
          fallbackProviders: string[];
          systemMessage: string;
          temperature: number;
          maxTokens: number;
          model: string;
        };
        prompt: string;
        context: any;
      };
      requiresClientExecution: boolean;
    };

    if (!instructions.requiresClientExecution) {
      // Fallback to old behavior if backend doesn't require client execution
      return await handleLegacyBuild(instructionRes, task, root, deps);
    }

    // Step 2: Execute AI call client-side using backend routing instructions
    const aiResponse = await executeClientAI(
      instructions.instructions.routing,
      instructions.instructions.prompt,
      keys
    );

    if (!aiResponse.success) {
      return { success: false, error: aiResponse.error || 'AI call failed' };
    }

    // Step 3: Send AI response back to backend for processing
    const completionRes = await fetch(`${getApiBase()}/build/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        task,
        aiResponse: aiResponse.text,
        model: aiResponse.model,
        context: instructions.instructions.context,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!completionRes.ok) {
      if (completionRes.status === 401) {
        const { clearAccountToken } = await import('../api/apiClient.js');
        await clearAccountToken();
        vscode.commands.executeCommand('redivivus.refreshChat');
      }
      const err = await completionRes.json().catch(() => ({ error: completionRes.statusText })) as any;
      return { success: false, error: err.error || `Build completion API ${completionRes.status}` };
    }

    const data = await completionRes.json() as {
      files: Array<{ path: string; content: string; isNew: boolean }>
      narration: string
      model: string
      inputTokens: number
      outputTokens: number
    };

    // Step 4: Write returned files to disk (same as before)
    return await processBuildResults(data, task, root, deps);

  } catch (err: any) {
    if (err?.name === 'TimeoutError') return { success: false, error: 'Build timed out — try a simpler request.' };
    return { success: false, error: err?.message ?? 'Network error' };
  }
}

// Helper: Execute AI call client-side using backend routing instructions
async function executeClientAI(
  routing: any,
  prompt: string,
  keys: Record<string, string>
): Promise<{ success: boolean; text: string; model: string; error?: string }> {
  try {
    const response = await callProvider(
      routing.selectedProvider,
      prompt,
      createFetchWithTimeout(),
      undefined, // geminiModel
      undefined, // imageBase64
      undefined, // imageType
      routing.systemMessage
    );

    return {
      success: true,
      text: response.text,
      model: response.model || routing.model
    };
  } catch (error: any) {
    // Try fallback providers if primary fails
    for (const fallbackProvider of routing.fallbackProviders) {
      if (!keys[fallbackProvider]) continue;
      
      try {
        const response = await callProvider(
          fallbackProvider,
          prompt,
          createFetchWithTimeout(),
          undefined,
          undefined,
          undefined,
          routing.systemMessage
        );

        return {
          success: true,
          text: response.text,
          model: response.model || fallbackProvider
        };
      } catch (fallbackError) {
        continue;
      }
    }

    return {
      success: false,
      text: '',
      model: '',
      error: error?.message || 'All AI providers failed'
    };
  }
}

// Helper: Create fetch with timeout for AI calls
function createFetchWithTimeout() {
  return async (url: string, options: RequestInit, timeoutMs?: number) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 60000);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };
}

// Helper: Process build results (extracted from original function)
async function processBuildResults(
  data: any,
  task: string,
  root: string,
  deps: BuildRequestDeps
): Promise<CloudBuildResult> {
  // Ensure .redivivus/ structure exists — always, even for single-file builds.
  // scaffoldAt is idempotent: it skips files that already exist.
  if (!fs.existsSync(path.join(root, '.redivivus', 'config.json'))) {
    try {
      const { scaffoldAt } = await import('../project/redivivusInit.js');
      const slug = path.basename(root);
      await scaffoldAt(root, slug);
    } catch { /* non-fatal — build continues even if scaffold fails */ }
  }

  const writtenPaths: string[] = [];

  for (const file of data.files) {
    const absPath = path.join(root, file.path);
    const snapshotId = createSnapshot(root, task, file.path);
    writeBuiltFile(absPath, file.content, { root, task });
    writtenPaths.push(absPath);
    // Open the file beside current editor
    openBuiltFile(absPath).catch(() => {});
    // Track snapshot for undo
    if (snapshotId) {
      try {
        const { BuildHistoryService } = await import('../build/buildHistoryService.js');
        new BuildHistoryService(root).record({
          id: snapshotId,
          timestamp: new Date().toISOString(),
          task,
          files: [file.path],
          tokensUsed: data.outputTokens ?? 0,
          costUSD: 0,
          source: 'ai',
          supervisor: data.model,
          worker: null,
          resultCardToken: '',
        });
      } catch {}
    }
  }

  // Record usage
  if (deps.usageTracker) {
    deps.usageTracker.recordUsage(0, 0, data.model, data.inputTokens, data.outputTokens, 'solo',
      path.basename(root));
  }

  // Signal build finished (opens workspace, captures vault, etc.)
  const { ChatPanel } = await import('../../ui/panels/chat/chatPanel.js');
  ChatPanel.onBuildFinished?.(task, writtenPaths, root);

  return { success: true, files: data.files, narration: data.narration, model: data.model, inputTokens: data.inputTokens, outputTokens: data.outputTokens };
}

// Helper: Handle legacy build responses (fallback)
async function handleLegacyBuild(
  res: Response,
  task: string,
  root: string,
  deps: BuildRequestDeps
): Promise<CloudBuildResult> {
  const data = await res.json() as any;
  return await processBuildResults(data, task, root, deps);
}
