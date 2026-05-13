// [SCOPE] Template Registry — fetches project templates from the remote CHASSIS registry on GitHub.
// Templates are NOT bundled with the extension — pulled on demand to keep extension lean.
// Registry URL: https://raw.githubusercontent.com/smithkjnc-ux/chassis-templates/main/
// [WARN] Network calls here — always wrap in try/catch, never block builds on failure.
// [NEXT] Add more categories as templates are added to the registry repo.

import * as vscode from 'vscode';
const log = vscode.window.createOutputChannel('CHASSIS Templates');

export interface TemplateCategory {
  id: string;
  label: string;
  description: string;
  icon: string;
  subcategories: TemplateDef[];
}

export interface TemplateDef {
  id: string;
  label: string;
  description: string;
  tags: string[];
  registryPath: string; // path in chassis-templates repo
  wizardQuestions: WizardQuestion[];
}

export interface WizardQuestion {
  id: string;
  prompt: string;
  placeholder: string;
  required: boolean;
}

const REGISTRY_BASE = 'https://raw.githubusercontent.com/smithkjnc-ux/chassis-templates/main';

// [TODO] Expand as templates are added to the registry repo
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: 'web',
    label: 'Website',
    description: 'Static and dynamic websites',
    icon: '[WEB]',
    subcategories: [
      {
        id: 'web-portfolio',
        label: 'Portfolio / Personal Site',
        description: 'Clean single-page portfolio with hero, about, projects, contact sections',
        tags: ['html', 'css', 'js', 'portfolio', 'personal'],
        registryPath: 'web/portfolio/index.html',
        wizardQuestions: [
          { id: 'name', prompt: 'Your name or brand', placeholder: 'Jane Smith', required: true },
          { id: 'tagline', prompt: 'One-line tagline', placeholder: 'Full-stack developer & designer', required: true },
          { id: 'primaryColor', prompt: 'Primary color (hex)', placeholder: '#6366f1', required: false },
        ],
      },
      {
        id: 'web-business',
        label: 'Business Landing Page',
        description: 'Professional landing page with hero, features, pricing, CTA',
        tags: ['html', 'css', 'js', 'business', 'landing'],
        registryPath: 'web/business/index.html',
        wizardQuestions: [
          { id: 'businessName', prompt: 'Business name', placeholder: 'Acme Corp', required: true },
          { id: 'headline', prompt: 'Main headline', placeholder: 'The fastest way to do X', required: true },
          { id: 'cta', prompt: 'Call to action text', placeholder: 'Get Started Free', required: false },
        ],
      },
      {
        id: 'web-blog',
        label: 'Blog / Content Site',
        description: 'Minimal blog with article list, post view, dark mode',
        tags: ['html', 'css', 'js', 'blog', 'content'],
        registryPath: 'web/blog/index.html',
        wizardQuestions: [
          { id: 'blogName', prompt: 'Blog name', placeholder: 'My Tech Blog', required: true },
          { id: 'author', prompt: 'Author name', placeholder: 'Jane Smith', required: true },
        ],
      },
      {
        id: 'web-dashboard',
        label: 'Admin Dashboard',
        description: 'Dark-theme dashboard with sidebar, stats cards, charts',
        tags: ['html', 'css', 'js', 'dashboard', 'admin'],
        registryPath: 'web/dashboard/index.html',
        wizardQuestions: [
          { id: 'appName', prompt: 'App name', placeholder: 'My Dashboard', required: true },
        ],
      },
    ],
  },
  {
    id: 'game',
    label: 'Game',
    description: 'Browser-based games',
    icon: '[GAME]',
    subcategories: [
      {
        id: 'game-arcade',
        label: 'Arcade / Canvas Game',
        description: 'Canvas-based arcade game with score, lives, levels',
        tags: ['html', 'canvas', 'js', 'game', 'arcade'],
        registryPath: 'games/arcade/index.html',
        wizardQuestions: [
          { id: 'gameName', prompt: 'Game name', placeholder: 'Space Blaster', required: true },
          { id: 'theme', prompt: 'Theme / setting', placeholder: 'space, underwater, forest...', required: false },
        ],
      },
      {
        id: 'game-puzzle',
        label: 'Puzzle Game',
        description: 'Grid-based puzzle game (match-3, sliding, maze)',
        tags: ['html', 'canvas', 'js', 'game', 'puzzle'],
        registryPath: 'games/puzzle/index.html',
        wizardQuestions: [
          { id: 'gameName', prompt: 'Game name', placeholder: 'Color Matcher', required: true },
          { id: 'gridSize', prompt: 'Grid size', placeholder: '6x6', required: false },
        ],
      },
    ],
  },
  {
    id: 'app',
    label: 'App / Tool',
    description: 'Utility apps and tools',
    icon: '[APP]',
    subcategories: [
      {
        id: 'app-crud',
        label: 'CRUD App',
        description: 'Create/Read/Update/Delete app with local storage or API backend',
        tags: ['html', 'js', 'crud', 'app', 'storage'],
        registryPath: 'apps/crud/index.html',
        wizardQuestions: [
          { id: 'appName', prompt: 'App name', placeholder: 'Task Manager', required: true },
          { id: 'entityName', prompt: 'What are you managing?', placeholder: 'tasks, contacts, products...', required: true },
        ],
      },
      {
        id: 'app-cli',
        label: 'CLI Tool (Node.js)',
        description: 'Command-line tool with argument parsing, help text, colorized output',
        tags: ['node', 'js', 'cli', 'terminal'],
        registryPath: 'apps/cli/index.js',
        wizardQuestions: [
          { id: 'toolName', prompt: 'Tool name', placeholder: 'my-tool', required: true },
          { id: 'description', prompt: 'What does it do?', placeholder: 'Converts files from X to Y', required: true },
        ],
      },
    ],
  },
  {
    id: 'api',
    label: 'API / Backend',
    description: 'Server-side APIs and backends',
    icon: '[API]',
    subcategories: [
      {
        id: 'api-express',
        label: 'Express REST API',
        description: 'Node.js Express API with routes, middleware, error handling',
        tags: ['node', 'js', 'express', 'rest', 'api'],
        registryPath: 'api/express/server.js',
        wizardQuestions: [
          { id: 'apiName', prompt: 'API name', placeholder: 'My API', required: true },
          { id: 'resource', prompt: 'Main resource', placeholder: 'users, products, orders...', required: true },
          { id: 'port', prompt: 'Port', placeholder: '3000', required: false },
        ],
      },
      {
        id: 'api-python',
        label: 'Python FastAPI',
        description: 'FastAPI with routes, Pydantic models, auto docs',
        tags: ['python', 'fastapi', 'rest', 'api'],
        registryPath: 'api/fastapi/main.py',
        wizardQuestions: [
          { id: 'apiName', prompt: 'API name', placeholder: 'My API', required: true },
          { id: 'resource', prompt: 'Main resource', placeholder: 'users, products, orders...', required: true },
        ],
      },
    ],
  },
];

/**
 * Detect if a user's task sounds like a template request.
 * Returns matching category + subcategory if found.
 */
export function matchTaskToTemplate(task: string): { category: TemplateCategory; template: TemplateDef } | null {
  const t = task.toLowerCase();
  for (const cat of TEMPLATE_CATEGORIES) {
    for (const tmpl of cat.subcategories) {
      const tagHits = tmpl.tags.filter(tag => t.includes(tag)).length;
      const labelHit = t.includes(cat.label.toLowerCase()) || t.includes(tmpl.label.toLowerCase().split(' ')[0]);
      if (tagHits >= 2 || labelHit) {
        return { category: cat, template: tmpl };
      }
    }
  }
  return null;
}

/**
 * Fetch a template file from the remote registry.
 * Returns the raw template content or null on failure.
 */
export async function fetchTemplate(registryPath: string): Promise<string | null> {
  const url = `${REGISTRY_BASE}/${registryPath}`;
  log.appendLine(`[FETCH] Attempting: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CHASSIS-VSCode-Extension' },
    });
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
