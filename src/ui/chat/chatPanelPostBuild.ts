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

  // HTML — open in browser
  const htmlFile = builtFiles.find(f => f.endsWith('.html'));
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

  return { type: 'unknown', entryFile: null, runCmd: null, needsDeps: false, depsCmd: null };
}

/** Build the "What to do next" markdown section appended after the result card. */
export function buildPostBuildGuidance(root: string, builtFiles: string[]): string {
  const info = detectPostBuildInfo(root, builtFiles);
  const lines: string[] = ['\n---', '**What to do next:**'];

  if (info.type === 'html' && info.entryFile) {
    lines.push(`&#x1F310; Type _"run it"_ to open \`${info.entryFile}\` in your browser.`);
  } else if (info.type === 'node') {
    if (info.needsDeps) {
      lines.push(`&#x26A0; **Dependencies not installed.** Type _"install dependencies"_ or open a terminal and run:`);
      lines.push(`\`\`\`\nnpm install\n\`\`\``);
    }
    if (info.runCmd) {
      lines.push(`&#x25B6; Then run: \`${info.runCmd}\``);
    }
  } else if (info.type === 'python') {
    if (info.needsDeps) {
      lines.push(`&#x26A0; **Dependencies needed.** Type _"install dependencies"_ or run:`);
      lines.push(`\`\`\`\n${info.depsCmd}\n\`\`\``);
    }
    if (info.runCmd) {
      lines.push(`&#x25B6; Run: \`${info.runCmd}\``);
    }
  } else if (info.runCmd) {
    lines.push(`&#x25B6; Run: \`${info.runCmd}\``);
  }

  lines.push('');
  lines.push('_If something doesn\'t work, paste the error here and I\'ll fix it._');
  return lines.join('\n');
}
