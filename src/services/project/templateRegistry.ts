// [SCOPE] Template Registry — fetches project templates from the remote CHASSIS registry on GitHub.
// Templates are NOT bundled with the extension — pulled on demand to keep extension lean.
// Registry URL: https://raw.githubusercontent.com/smithkjnc-ux/chassis-templates/main/
// [WARN] Network calls here — always wrap in try/catch, never block builds on failure.
// [NEXT] Add more categories as templates are added to the registry repo.
// Category data + interfaces -> templateRegistryData.ts

import * as vscode from 'vscode';
export { TemplateCategory, TemplateDef, WizardQuestion, TEMPLATE_CATEGORIES } from './templateRegistryData.js';
import { TemplateCategory, TemplateDef, TEMPLATE_CATEGORIES } from './templateRegistryData.js';

const log = vscode.window.createOutputChannel('CHASSIS Templates');
const REGISTRY_BASE = 'https://raw.githubusercontent.com/smithkjnc-ux/chassis-templates/main';

/** Detect if a user's task sounds like a template request. Returns matching category + template if found. */
export function matchTaskToTemplate(task: string): { category: TemplateCategory; template: TemplateDef } | null {
  const t = task.toLowerCase();
  for (const cat of TEMPLATE_CATEGORIES) {
    for (const tmpl of cat.subcategories) {
      const tagHits = tmpl.tags.filter(tag => t.includes(tag)).length;
      const labelHit = t.includes(cat.label.toLowerCase()) || t.includes(tmpl.label.toLowerCase().split(' ')[0]);
      if (tagHits >= 2 || labelHit) { return { category: cat, template: tmpl }; }
    }
  }
  return null;
}

/** Fetch a template file from the remote registry. Returns raw content or null on failure. */
export async function fetchTemplate(registryPath: string): Promise<string | null> {
  const url = `${REGISTRY_BASE}/${registryPath}`;
  log.appendLine(`[FETCH] Attempting: ${url}`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'CHASSIS-VSCode-Extension' } });
    if (!res.ok) {
      log.appendLine(`[FETCH] Failed (${res.status}): ${url}`);
      return null;
    }
    const content = await res.text();
    log.appendLine(`[FETCH] Got template (${content.length} bytes): ${registryPath}`);
    return content;
  } catch (err) {
    log.appendLine(`[FETCH] Network error: ${err}`);
    return null;
  }
}
