// [SCOPE] External Service Templates — detect intent and write Firebase, Supabase, Stripe, OpenAI config.
// Template constants extracted to chatPanelServiceTemplatesA.ts + chatPanelServiceTemplatesB.ts.

import * as fs from 'fs';
import * as path from 'path';
import { ServiceTemplate, FIREBASE_TEMPLATE, SUPABASE_TEMPLATE } from './chatPanelServiceTemplatesA.js';
import { STRIPE_TEMPLATE, OPENAI_TEMPLATE } from './chatPanelServiceTemplatesB.js';

export type { ServiceTemplate };

export const SERVICE_TEMPLATES: Record<string, ServiceTemplate> = {
  firebase: FIREBASE_TEMPLATE,
  supabase: SUPABASE_TEMPLATE,
  stripe: STRIPE_TEMPLATE,
  openai: OPENAI_TEMPLATE,
};

export const SERVICE_KEYWORDS = [
  'set up', 'add', 'integrate', 'connect', 'configure', 'install',
  'firebase', 'supabase', 'stripe', 'openai', 'auth', 'database', 'payment'
];

export function detectServiceIntent(text: string): { type: string; template: ServiceTemplate } | null {
  const t = text.toLowerCase();
  if (!SERVICE_KEYWORDS.some(kw => t.includes(kw.toLowerCase()))) { return null; }
  if (t.includes('firebase')) { return { type: 'firebase', template: FIREBASE_TEMPLATE }; }
  if (t.includes('supabase')) { return { type: 'supabase', template: SUPABASE_TEMPLATE }; }
  if (t.includes('stripe')) { return { type: 'stripe', template: STRIPE_TEMPLATE }; }
  if (t.includes('openai') || t.includes('gpt') || t.includes('chatgpt')) { return { type: 'openai', template: OPENAI_TEMPLATE }; }
  return null;
}

export async function runServiceSetup(serviceType: string, root: string): Promise<{ files: string[]; notes: string }> {
  const template = SERVICE_TEMPLATES[serviceType];
  if (!template) { throw new Error(`Unknown service type: ${serviceType}`); }
  const writtenFiles: string[] = [];
  for (const [relPath, content] of Object.entries(template.files)) {
    const absPath = path.join(root, relPath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(absPath, content, 'utf8');
    writtenFiles.push(relPath);
  }
  return { files: writtenFiles, notes: template.postSetupNotes };
}

export function formatServiceSetupResult(serviceType: string, files: string[], notes: string): string {
  return [
    `**${serviceType.charAt(0).toUpperCase() + serviceType.slice(1)} Setup Complete**`,
    '',
    'Created files:',
    ...files.map(f => `- \`${f}\``),
    '',
    '**Setup notes:**',
    notes,
  ].join('\n');
}
