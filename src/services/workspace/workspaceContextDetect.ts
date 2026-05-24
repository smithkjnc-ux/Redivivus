// [SCOPE] Workspace Context Service — project structure detection and summary generation
import type { FileInfo, ProjectStructure } from './workspaceContext.js';

export function detectProjectStructure(files: FileInfo[]): ProjectStructure {
  const hasSrc = files.some(f => f.relativePath.startsWith('src/'));
  const hasTests = files.some(f => f.isTest);
  const hasDocs = files.some(f => f.isDocumentation);
  const hasConfig = files.some(f => f.isConfig);

  const extensions: Record<string, number> = {};
  for (const f of files) {
    if (!f.isConfig && !f.isDocumentation) {
      extensions[f.extension] = (extensions[f.extension] || 0) + 1;
    }
  }
  const mainExt = Object.entries(extensions).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const languageMap: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript (React)',
    '.js': 'JavaScript', '.jsx': 'JavaScript (React)',
    '.py': 'Python', '.rs': 'Rust', '.go': 'Go',
    '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS',
  };
  const mainLanguage = languageMap[mainExt] || mainExt || 'Unknown';

  const hasReact = files.some(f => f.extension === '.tsx' || f.extension === '.jsx');
  const hasVue = files.some(f => f.extension === '.vue');
  const hasAngular = files.some(f => f.relativePath.includes('.component.ts'));
  const framework = hasReact ? 'React' : hasVue ? 'Vue' : hasAngular ? 'Angular' : 'None/Vanilla';

  let projectType: ProjectStructure['projectType'] = 'unknown';
  if (files.some(f => f.extension === '.html')) {projectType = 'web';}
  if (files.some(f => f.relativePath === 'package.json')) {projectType = 'node';}
  if (files.some(f => f.extension === '.py')) {projectType = 'python';}
  if (files.some(f => f.extension === '.rs')) {projectType = 'rust';}
  if (files.some(f => f.extension === '.go')) {projectType = 'go';}
  if (new Set(files.map(f => f.extension)).size > 3) {projectType = 'mixed';}

  return { hasSrc, hasTests, hasDocs, hasConfig, mainLanguage, framework, projectType };
}

export function findMainEntryPoint(files: FileInfo[], structure: ProjectStructure): string | null {
  const candidates = [
    'index.html', 'src/index.html', 'src/index.ts', 'src/index.tsx',
    'src/main.ts', 'src/main.tsx', 'src/App.tsx', 'src/app.ts',
    'main.py', 'app.py', 'src/main.rs', 'main.go',
  ];
  for (const candidate of candidates) {
    const found = files.find(f => f.relativePath === candidate);
    if (found) {return found.relativePath;}
  }
  return files.find(f => f.isEntryPoint)?.relativePath || null;
}

export function generateSummary(
  files: FileInfo[],
  structure: ProjectStructure,
  recentlyModified: string[],
  mainEntry: string | null
): string {
  const codeFiles = files.filter(f => !f.isConfig && !f.isDocumentation && !f.isTest);
  let summary = `WORKSPACE: ${structure.projectType} project with ${codeFiles.length} code files (${structure.mainLanguage})`;
  if (structure.framework !== 'None/Vanilla') { summary += ` using ${structure.framework}`; }
  summary += `. Structure: ${structure.hasSrc ? 'src/' : 'flat'} ${structure.hasTests ? '+ tests' : ''} ${structure.hasDocs ? '+ docs' : ''}.`;
  if (mainEntry) { summary += ` Entry point: ${mainEntry}.`; }
  if (recentlyModified.length > 0) { summary += ` Recently active: ${recentlyModified.slice(0, 3).join(', ')}.`; }
  return summary;
}
