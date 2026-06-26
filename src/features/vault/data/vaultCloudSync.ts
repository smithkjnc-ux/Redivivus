// [SCOPE] Cloud vault sync — push local vault items to Supabase, pull community items
// Additive: local vault still works as before. Cloud sync is optional background operation.

import { getApiBase, getAccountToken } from '../../../features/api/data/apiClient.js';
import type { VaultItem } from './vaultTypes.js';
import type { VaultService } from './vaultService.js';

// ── Push local vault items to cloud ──

export async function syncVaultToCloud(vaultService: VaultService): Promise<{ synced: number; error?: string }> {
  const token = await getAccountToken();
  if (!token) return { synced: 0, error: 'Not signed in' };

  const localItems = vaultService.getAllItems();
  if (localItems.length === 0) return { synced: 0 };

  // Map local VaultItem to cloud format
  const cloudItems = localItems.slice(0, 50).map(item => ({
    title: item.name,
    language: item.language,
    code: item.code,
    tags: item.tags,
  }));

  try {
    const res = await fetch(`${getApiBase()}/vault`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ items: cloudItems }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        const { clearAccountToken } = await import('../../../features/api/data/apiClient.js');
        await clearAccountToken();
        const vscode = require('vscode');
        vscode.commands.executeCommand('redivivus.refreshChat');
      }
      const err = await res.json().catch(() => ({ error: res.statusText })) as any;
      return { synced: 0, error: err.error || `API ${res.status}` };
    }

    const result = await res.json() as { synced: number };
    return { synced: result.synced };
  } catch (err: any) {
    return { synced: 0, error: err.message };
  }
}

// ── Pull community vault items from cloud ──

export interface CloudVaultItem {
  id: string;
  title: string;
  language: string;
  code: string;
  tags: string[];
  source: string;
  is_public: boolean;
  downloads: number;
}

export async function fetchCommunityVault(language?: string): Promise<{ items: CloudVaultItem[]; error?: string }> {
  const token = await getAccountToken();
  if (!token) return { items: [], error: 'Not signed in' };

  try {
    const params = new URLSearchParams({ source: 'community' });
    if (language) params.set('language', language);

    const res = await fetch(`${getApiBase()}/vault?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        const { clearAccountToken } = await import('../../../features/api/data/apiClient.js');
        await clearAccountToken();
        const vscode = require('vscode');
        vscode.commands.executeCommand('redivivus.refreshChat');
      }
      const err = await res.json().catch(() => ({ error: res.statusText })) as any;
      return { items: [], error: err.error || `API ${res.status}` };
    }

    const result = await res.json() as { items: CloudVaultItem[] };
    return { items: result.items || [] };
  } catch (err: any) {
    return { items: [], error: err.message };
  }
}

// ── Pull user's own cloud vault items ──

export async function fetchMyCloudVault(): Promise<{ items: CloudVaultItem[]; error?: string }> {
  const token = await getAccountToken();
  if (!token) return { items: [], error: 'Not signed in' };

  try {
    const res = await fetch(`${getApiBase()}/vault?source=mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        const { clearAccountToken } = await import('../../../features/api/data/apiClient.js');
        await clearAccountToken();
        const vscode = require('vscode');
        vscode.commands.executeCommand('redivivus.refreshChat');
      }
      const err = await res.json().catch(() => ({ error: res.statusText })) as any;
      return { items: [], error: err.error || `API ${res.status}` };
    }

    const result = await res.json() as { items: CloudVaultItem[] };
    return { items: result.items || [] };
  } catch (err: any) {
    return { items: [], error: err.message };
  }
}

// ── Merge cloud items into local vault ──

export function mergeCloudIntoLocal(
  vaultService: VaultService,
  cloudItems: CloudVaultItem[]
): { added: number; skipped: number } {
  let added = 0;
  let skipped = 0;

  for (const ci of cloudItems) {
    // Check if we already have this code locally (by content hash or title match)
    const existing = vaultService.getAllItems().find(
      item => item.name === ci.title && item.language === ci.language
    );

    if (existing) {
      skipped++;
      continue;
    }

    // Create a local VaultItem from cloud data
    const crypto = require('crypto');
    const contentHash = crypto.createHash('sha256').update(ci.code.trim()).digest('hex');

    if (vaultService.isDuplicate(contentHash)) {
      skipped++;
      continue;
    }

    const localItem: VaultItem = {
      id: ci.id || contentHash.slice(0, 16),
      name: ci.title,
      code: ci.code,
      language: ci.language,
      category: ci.tags?.[0] || 'other',
      description: `Community vault item: ${ci.title}`,
      sourceProject: 'community',
      sourceFile: '',
      tags: ci.tags || [],
      lineCount: ci.code.split('\n').length,
      importCount: 0,
      createdAt: new Date().toISOString(),
      contentHash,
    };

    vaultService.saveItem(localItem);
    added++;
  }

  return { added, skipped };
}
