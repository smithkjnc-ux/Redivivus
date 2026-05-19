// [SCOPE] Post-build guidance — detects entry point, missing deps, and generates "What to do next" text.
// Appended to the result card message after every successful build. Closes the build→run→error→fix loop.

import * as fs from 'fs';
import * as path from 'path';

export interface PostBuildInfo {
  type: 'html' | 'node' | 'python' | 'go' | 'rust' | 'shell' | 'unknown';
  entryFile: string | null;
  runCmd: string | null;
  needsDeps: boolean;
  depsCmd: string | null;
}

/** Detect the project type and runnable entry point from built files + root scan. */
export function detectPostBuildInfo(root: string, builtFiles: string[]): PostBuildInfo {
  const all = builtFiles.map(f => f.toLowerCase());

  // HTML — open in browser (check built files first, then scan root for index.html)
  const htmlFile = builtFiles.find(f => f.endsWith('.html'))
    || ['index.html', 'src/index.html', 'public/index.html'].find(f => fs.existsSync(path.join(root, f)))
    || null;
  if (htmlFile) {
    return { type: 'html', entryFile: htmlFile, runCmd: null, needsDeps: false, depsCmd: null };
  }

  // Node.js — check for package.json (built or existing)
  const hasPkg = all.some(f => f.endsWith('package.json')) || fs.existsSync(path.join(root, 'package.json'));
  if (hasPkg) {
    const needsDeps = !fs.existsSync(path.join(root, 'node_modules'));
    // Detect entry: index.js, server.js, main.js, app.js, or "main" in package.json
    const nodeEntry = ['index.js', 'server.js', 'app.js', 'main.js'].find(f =>
      builtFiles.some(b => b.endsWith(f)) || fs.existsSync(path.join(root, f))
    ) || null;
    // Check for start script
    let runCmd = nodeEntry ? `node ${nodeEntry}` : 'npm start';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
      if (pkg.scripts?.start) { runCmd = 'npm start'; }
      else if (pkg.scripts?.dev) { runCmd = 'npm run dev'; }
      else if (pkg.main) { runCmd = `node ${pkg.main}`; }
    } catch { /* use default */ }
    return { type: 'node', entryFile: nodeEntry, runCmd, needsDeps, depsCmd: needsDeps ? 'npm install' : null };
  }

  // Python
  const pyEntry = builtFiles.find(f => f.endsWith('.py')) ||
    ['main.py', 'app.py', 'run.py', 'server.py'].find(f => fs.existsSync(path.join(root, f))) || null;
  if (pyEntry || all.some(f => f.endsWith('.py'))) {
    const hasReqs = fs.existsSync(path.join(root, 'requirements.txt'));
    const hasVenv = fs.existsSync(path.join(root, 'venv')) || fs.existsSync(path.join(root, '.venv'));
    const needsDeps = hasReqs && !hasVenv;
    return {
      type: 'python', entryFile: pyEntry,
      runCmd: pyEntry ? `python ${pyEntry}` : null,
      needsDeps, depsCmd: needsDeps ? 'pip install -r requirements.txt' : null,
    };
  }

  // Go
  if (all.some(f => f.endsWith('.go')) || fs.existsSync(path.join(root, 'go.mod'))) {
    return { type: 'go', entryFile: null, runCmd: 'go run .', needsDeps: false, depsCmd: null };
  }

  // Rust
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
    return { type: 'rust', entryFile: null, runCmd: 'cargo run', needsDeps: false, depsCmd: null };
  }

  // Shell script
  const shFile = builtFiles.find(f => f.endsWith('.sh'));
  if (shFile) {
    return { type: 'shell', entryFile: shFile, runCmd: `bash ${shFile}`, needsDeps: false, depsCmd: null };
  }

  // TypeScript (standalone, no package.json)
  const tsFile = builtFiles.find(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  if (tsFile) {
    // Detect browser-only TypeScript — needs an HTML wrapper, not ts-node
    try {
      const absTs = path.join(root, tsFile);
      const tsContent = fs.existsSync(absTs) ? fs.readFileSync(absTs, 'utf-8') : '';
      const isBrowserCode = /\b(window|document|navigator|AudioContext|MediaRecorder|MediaStream|fetch\(|WebSocket|localStorage|sessionStorage|HTMLElement)\b/.test(tsContent);
      if (isBrowserCode) {
        return { type: 'html', entryFile: tsFile, runCmd: null, needsDeps: false, depsCmd: null };
      }
    } catch { /* ignore read errors */ }
    return { type: 'node', entryFile: tsFile, runCmd: `npx ts-node ${tsFile}`, needsDeps: false, depsCmd: null };
  }

  return { type: 'unknown', entryFile: null, runCmd: null, needsDeps: false, depsCmd: null };
}

/** Build the "What to do next" markdown section appended after the result card. */
export function buildPostBuildGuidance(root: string, builtFiles: string[]): string {
  const info = detectPostBuildInfo(root, builtFiles);
  const lines: string[] = ['\n---', '**What to do next:**'];

  if (info.type === 'html') {
    if (info.entryFile && (info.entryFile.endsWith('.ts') || info.entryFile.endsWith('.tsx'))) {
      lines.push(`This is a **browser module** (uses Web APIs). Type _"make a test page for this"_ to create an HTML wrapper you can open in your browser.`);
    } else if (info.entryFile) {
      lines.push(`Type _"run it"_ to open \`${info.entryFile}\` in your browser.`);
    }
  } else if (info.type === 'node') {
    if (info.needsDeps) {
      lines.push(`**Dependencies not installed.** Type _"install dependencies"_ or open a terminal and run:`);
      lines.push(`\`\`\`\nnpm install\n\`\`\``);
    }
    if (info.runCmd) {
      lines.push(`**Run:** \`${info.runCmd}\``);
    }
  } else if (info.type === 'python') {
    if (info.needsDeps) {
      lines.push(`**Dependencies needed.** Type _"install dependencies"_ or run:`);
      lines.push(`\`\`\`\n${info.depsCmd}\n\`\`\``);
    }
    if (info.runCmd) {
      lines.push(`**Run:** \`${info.runCmd}\``);
    }
  } else if (info.runCmd) {
    lines.push(`**Run:** \`${info.runCmd}\``);
  }

  lines.push('');
  lines.push('_If something doesn\'t work, paste the error here and I\'ll fix it._');
  lines.push('');
  lines.push('> **Your program is just the file(s) above.** The `.chassis/` folder is CHASSIS\'s workbench — snapshots, rules, vault. It adds zero weight to your program and is invisible to your users. Share or deploy only the files listed.');
  return lines.join('\n');
}
