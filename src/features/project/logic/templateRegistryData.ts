// [SCOPE] Template Registry data — interfaces and TEMPLATE_CATEGORIES constant
// Imported by templateRegistry.ts. Extracted to keep it under 200 lines.

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
  registryPath: string;
  wizardQuestions: WizardQuestion[];
}

export interface WizardQuestion {
  id: string;
  prompt: string;
  placeholder: string;
  required: boolean;
}

// [DONE] Added: script category (Python data script, shell automation script, Node.js CLI)
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: 'web', label: 'Website', description: 'Static and dynamic websites', icon: '[WEB]',
    subcategories: [
      { id: 'web-portfolio', label: 'Portfolio / Personal Site', description: 'Clean single-page portfolio with hero, about, projects, contact sections', tags: ['html', 'css', 'js', 'portfolio', 'personal'], registryPath: 'web/portfolio/index.html',
        wizardQuestions: [
          { id: 'name', prompt: 'Your name or brand', placeholder: 'Jane Smith', required: true },
          { id: 'tagline', prompt: 'One-line tagline', placeholder: 'Full-stack developer & designer', required: true },
          { id: 'primaryColor', prompt: 'Primary color (hex)', placeholder: '#6366f1', required: false },
        ] },
      { id: 'web-business', label: 'Business Landing Page', description: 'Professional landing page with hero, features, pricing, CTA', tags: ['html', 'css', 'js', 'business', 'landing'], registryPath: 'web/business/index.html',
        wizardQuestions: [
          { id: 'businessName', prompt: 'Business name', placeholder: 'Acme Corp', required: true },
          { id: 'headline', prompt: 'Main headline', placeholder: 'The fastest way to do X', required: true },
          { id: 'cta', prompt: 'Call to action text', placeholder: 'Get Started Free', required: false },
        ] },
      { id: 'web-blog', label: 'Blog / Content Site', description: 'Minimal blog with article list, post view, dark mode', tags: ['html', 'css', 'js', 'blog', 'content'], registryPath: 'web/blog/index.html',
        wizardQuestions: [
          { id: 'blogName', prompt: 'Blog name', placeholder: 'My Tech Blog', required: true },
          { id: 'author', prompt: 'Author name', placeholder: 'Jane Smith', required: true },
        ] },
      { id: 'web-dashboard', label: 'Admin Dashboard', description: 'Dark-theme dashboard with sidebar, stats cards, charts', tags: ['html', 'css', 'js', 'dashboard', 'admin'], registryPath: 'web/dashboard/index.html',
        wizardQuestions: [
          { id: 'appName', prompt: 'App name', placeholder: 'My Dashboard', required: true },
        ] },
    ],
  },
  {
    id: 'game', label: 'Game', description: 'Browser-based games', icon: '[GAME]',
    subcategories: [
      { id: 'game-arcade', label: 'Arcade / Canvas Game', description: 'Canvas-based arcade game with score, lives, levels', tags: ['html', 'canvas', 'js', 'game', 'arcade'], registryPath: 'games/arcade/index.html',
        wizardQuestions: [
          { id: 'gameName', prompt: 'Game name', placeholder: 'Space Blaster', required: true },
          { id: 'theme', prompt: 'Theme / setting', placeholder: 'space, underwater, forest...', required: false },
        ] },
      { id: 'game-puzzle', label: 'Puzzle Game', description: 'Grid-based puzzle game (match-3, sliding, maze)', tags: ['html', 'canvas', 'js', 'game', 'puzzle'], registryPath: 'games/puzzle/index.html',
        wizardQuestions: [
          { id: 'gameName', prompt: 'Game name', placeholder: 'Color Matcher', required: true },
          { id: 'gridSize', prompt: 'Grid size', placeholder: '6x6', required: false },
        ] },
    ],
  },
  {
    id: 'app', label: 'App / Tool', description: 'Utility apps and tools', icon: '[APP]',
    subcategories: [
      { id: 'app-crud', label: 'CRUD App', description: 'Create/Read/Update/Delete app with local storage or API backend', tags: ['html', 'js', 'crud', 'app', 'storage'], registryPath: 'apps/crud/index.html',
        wizardQuestions: [
          { id: 'appName', prompt: 'App name', placeholder: 'Task Manager', required: true },
          { id: 'entityName', prompt: 'What are you managing?', placeholder: 'tasks, contacts, products...', required: true },
        ] },
      { id: 'app-cli', label: 'CLI Tool (Node.js)', description: 'Command-line tool with argument parsing, help text, colorized output', tags: ['node', 'js', 'cli', 'terminal'], registryPath: 'apps/cli/index.js',
        wizardQuestions: [
          { id: 'toolName', prompt: 'Tool name', placeholder: 'my-tool', required: true },
          { id: 'description', prompt: 'What does it do?', placeholder: 'Converts files from X to Y', required: true },
        ] },
    ],
  },
  {
    id: 'api', label: 'API / Backend', description: 'Server-side APIs and backends', icon: '[API]',
    subcategories: [
      { id: 'api-express', label: 'Express REST API', description: 'Node.js Express API with routes, middleware, error handling', tags: ['node', 'js', 'express', 'rest', 'api'], registryPath: 'api/express/server.js',
        wizardQuestions: [
          { id: 'apiName', prompt: 'API name', placeholder: 'My API', required: true },
          { id: 'resource', prompt: 'Main resource', placeholder: 'users, products, orders...', required: true },
          { id: 'port', prompt: 'Port', placeholder: '3000', required: false },
        ] },
      { id: 'api-python', label: 'Python FastAPI', description: 'FastAPI with routes, Pydantic models, auto docs', tags: ['python', 'fastapi', 'rest', 'api'], registryPath: 'api/fastapi/main.py',
        wizardQuestions: [
          { id: 'apiName', prompt: 'API name', placeholder: 'My API', required: true },
          { id: 'resource', prompt: 'Main resource', placeholder: 'users, products, orders...', required: true },
        ] },
    ],
  },
  {
    id: 'script', label: 'Script / Automation', description: 'Python scripts, shell automation, Node.js CLI tools', icon: '[SCRIPT]',
    subcategories: [
      { id: 'script-python-data', label: 'Python Data Script', description: 'Python script to read, process, and output data (CSV, JSON, files)', tags: ['python', 'script', 'data', 'csv', 'json'], registryPath: 'scripts/python-data/script.py',
        wizardQuestions: [
          { id: 'scriptName', prompt: 'What does this script do?', placeholder: 'Parse sales CSV and output summary JSON', required: true },
          { id: 'inputFormat', prompt: 'Input format', placeholder: 'CSV, JSON, text file, stdin...', required: false },
          { id: 'outputFormat', prompt: 'Output format', placeholder: 'JSON, CSV, printed table...', required: false },
        ] },
      { id: 'script-shell', label: 'Shell Automation Script', description: 'Bash script for file operations, system automation, batch processing', tags: ['bash', 'shell', 'automation', 'script'], registryPath: 'scripts/shell/script.sh',
        wizardQuestions: [
          { id: 'scriptName', prompt: 'What should this script automate?', placeholder: 'Backup files, deploy to server, cleanup logs...', required: true },
        ] },
      { id: 'script-node-cli', label: 'Node.js CLI Tool', description: 'Command-line tool with arguments, help text, colored output', tags: ['node', 'js', 'cli', 'terminal', 'commander'], registryPath: 'scripts/node-cli/index.js',
        wizardQuestions: [
          { id: 'toolName', prompt: 'CLI tool name', placeholder: 'my-tool', required: true },
          { id: 'description', prompt: 'What does it do?', placeholder: 'Converts files from X to Y format', required: true },
          { id: 'mainArg', prompt: 'Main argument', placeholder: 'input file, search term, URL...', required: false },
        ] },
    ],
  },
];
