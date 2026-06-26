// [SCOPE] Project Scaffolding — detect intent and write starter templates for React, Flask, Go, Express.
// Template constants extracted to chatPanelScaffoldReact.ts + chatPanelScaffoldBackend.ts.

import * as fs from 'fs';
import * as path from 'path';
import type { BuildContext } from './chatPanelBuild.js';
import { detectPostBuildInfo } from './chatPanelPostBuild.js';
import { REACT_SCAFFOLD } from './chatPanelScaffoldReact.js';
import { PYTHON_FLASK_SCAFFOLD, GO_API_SCAFFOLD, NODE_EXPRESS_SCAFFOLD } from './chatPanelScaffoldBackend.js';

export interface ScaffoldTemplate {
  name: string;
  files: Record<string, string>;
  postBuildGuidance: string;
}

export const SCAFFOLDS: Record<string, ScaffoldTemplate> = {
  react: REACT_SCAFFOLD,
  'python-flask': PYTHON_FLASK_SCAFFOLD,
  'flask': PYTHON_FLASK_SCAFFOLD,
  'go-api': GO_API_SCAFFOLD,
  'go': GO_API_SCAFFOLD,
  'node-express': NODE_EXPRESS_SCAFFOLD,
  'express': NODE_EXPRESS_SCAFFOLD,
  'node': NODE_EXPRESS_SCAFFOLD
};

export const SCAFFOLD_KEYWORDS = [
  'scaffold', 'set up', 'new react app', 'new flask app', 'new go app', 'new express app',
  'init a', 'create a react', 'create a flask', 'create a go', 'create a node',
  'start a react', 'start a flask', 'start a go', 'start a node', 'start an express'
];

export function detectScaffoldIntent(text: string): { type: string; template: ScaffoldTemplate } | null {
  const t = text.toLowerCase();
  if (!SCAFFOLD_KEYWORDS.some(kw => t.includes(kw.toLowerCase()))) { return null; }
  if (t.includes('react')) { return { type: 'react', template: REACT_SCAFFOLD }; }
  if (t.includes('flask')) { return { type: 'python-flask', template: PYTHON_FLASK_SCAFFOLD }; }
  if (t.includes('go') || t.includes('golang')) { return { type: 'go-api', template: GO_API_SCAFFOLD }; }
  if (t.includes('express') || (t.includes('node') && !t.includes('react'))) { return { type: 'node-express', template: NODE_EXPRESS_SCAFFOLD }; }
  return null;
}

export async function runScaffold(ctx: BuildContext, scaffoldType: string, root: string): Promise<{ files: string[]; guidance: string }> {
  const scaffold = SCAFFOLDS[scaffoldType];
  if (!scaffold) { throw new Error(`Unknown scaffold type: ${scaffoldType}`); }
  const writtenFiles: string[] = [];
  for (const [relPath, content] of Object.entries(scaffold.files)) {
    const absPath = path.join(root, relPath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(absPath, content, 'utf8');
    writtenFiles.push(relPath);
  }
  detectPostBuildInfo(root, writtenFiles);
  return { files: writtenFiles, guidance: scaffold.postBuildGuidance };
}
