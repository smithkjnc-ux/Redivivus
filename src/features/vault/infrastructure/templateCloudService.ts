// [SCOPE] Cloud template service — fetch templates from Supabase instead of GitHub raw
// Replaces the GitHub-based template fetching with Supabase-backed API

import { getApiBase } from '../../../services/api/apiClient.js';

export interface CloudTemplate {
  id: string;
  slug: string;
  category: string;
  label: string;
  description: string;
  entry_file: string;
  files: Record<string, string>;
  tags: string[];
  author: string;
  downloads: number;
}

export interface TemplateListItem {
  id: string;
  slug: string;
  category: string;
  label: string;
  description: string;
  entry_file: string;
  tags: string[];
  author: string;
  downloads: number;
}

// ── List all available templates (no auth required) ──

export async function listCloudTemplates(category?: string): Promise<{ templates: TemplateListItem[]; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (category) params.set('category', category);

    const res = await fetch(`${getApiBase()}/templates?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as any;
      return { templates: [], error: err.error || `API ${res.status}` };
    }

    const result = await res.json() as { templates: TemplateListItem[] };
    return { templates: result.templates || [] };
  } catch (err: any) {
    return { templates: [], error: err.message };
  }
}

// ── Fetch a single template by slug (includes file contents) ──

export async function fetchCloudTemplate(slug: string): Promise<{ template: CloudTemplate | null; error?: string }> {
  try {
    const res = await fetch(`${getApiBase()}/templates?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as any;
      return { template: null, error: err.error || `API ${res.status}` };
    }

    const result = await res.json() as { template: CloudTemplate };
    return { template: result.template || null };
  } catch (err: any) {
    return { template: null, error: err.message };
  }
}

// ── Get templates grouped by category ──

export async function getTemplateCategories(): Promise<Record<string, TemplateListItem[]>> {
  const { templates, error } = await listCloudTemplates();
  if (error || !templates.length) return {};

  const categories: Record<string, TemplateListItem[]> = {};
  for (const t of templates) {
    if (!categories[t.category]) categories[t.category] = [];
    categories[t.category].push(t);
  }
  return categories;
}
