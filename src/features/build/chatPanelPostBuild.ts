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
  detectedJsEntry?: string | null;
}

/** Detect the project type and runnable entry point from built files + root scan. */
export function detectPostBuildInfo(root: string, builtFiles: string[]): PostBuildInfo {
  const all = builtFiles.map(f => f.toLowerCase());

  // HTML — open in browser (check built files first, then scan root for index.html, then any .html)
  const htmlFile = builtFiles.find(f => f.endsWith('.html'))
    || ['index.html', 'src/index.html', 'public/index.html'].find(f => fs.existsSync(path.join(root, f)))
    || (() => { try { return fs.readdirSync(root).find(f => f.endsWith('.html') && fs.statSync(path.join(root, f)).isFile()) || null; } catch { return null; } })()
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
    let pkgMain: string | null = null;
    let scriptEntry: string | null = null;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
      if (pkg.scripts?.start) {
        runCmd = 'npm start';
        const m = pkg.scripts.start.match(/\bnode\s+([\w./\\-]+\.js\b)/);
        if (m) { scriptEntry = m[1]; }
      } else if (pkg.scripts?.dev) { runCmd = 'npm run dev'; }
      else if (pkg.main) { runCmd = `node ${pkg.main}`; pkgMain = pkg.main; }
    } catch { /* use default */ }
    // If the entry point is browser/canvas code, it will crash in Node — detect and redirect to html type
    const BROWSER_RE = /\b(document\.|window\.|navigator\.|AudioContext|HTMLCanvas|getContext\(|requestAnimationFrame)\b/;
    const htmlEntry = () => ['index.html', 'dist/index.html', 'src/index.html', 'public/index.html'].find(f => fs.existsSync(path.join(root, f))) || null;
    const jsToScan = pkgMain || scriptEntry || nodeEntry || builtFiles.find(f => /\.js$/.test(f) && !f.includes('node_modules')) || null;
    if (jsToScan) {
      try {
        const abs = path.isAbsolute(jsToScan) ? jsToScan : path.join(root, jsToScan);
        if (fs.existsSync(abs) && BROWSER_RE.test(fs.readFileSync(abs, 'utf-8').slice(0, 6000))) {
          return { type: 'html', entryFile: htmlEntry(), runCmd: null, needsDeps: false, depsCmd: null, detectedJsEntry: jsToScan };
        }
      } catch { /* ignore */ }
    }
    // Fallback: scan TS source files in builtFiles (JS dist may not be in build history)
    const tsToScan = builtFiles.find(f => /\.tsx?$/.test(f));
    if (tsToScan) {
      try {
        const abs = path.join(root, tsToScan);
        if (fs.existsSync(abs) && BROWSER_RE.test(fs.readFileSync(abs, 'utf-8').slice(0, 6000))) {
          // Derive the likely dist JS path from the TS source name
          const derivedJs = tsToScan.replace(/^src\//, 'dist/').replace(/\.tsx?$/, '.js');
          const jsEntry = fs.existsSync(path.join(root, derivedJs)) ? derivedJs : null;
          return { type: 'html', entryFile: htmlEntry(), runCmd: null, needsDeps: false, depsCmd: null, detectedJsEntry: jsEntry };
        }
      } catch { /* ignore */ }
    }
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
  const lines: string[] = ['\n---', '**▶ How to run your project:**'];

  if (info.type === 'html') {
    if (!info.entryFile) {
      lines.push(`This is **browser code** — it needs an HTML page to run. Type _"create an index.html for this"_ and I'll build a runnable wrapper, then click **▶ Run**.`);
    } else if (info.entryFile.endsWith('.ts') || info.entryFile.endsWith('.tsx')) {
      lines.push(`This is a **browser component** — it needs an HTML page to run. Type _"make a test page for this"_ and I'll wrap it in a runnable HTML file, then click **▶ Run**.`);
    } else {
      lines.push(`Click **▶ Run** — it will open \`${info.entryFile}\` directly in your browser. No install needed.`);
    }
  } else if (info.type === 'node') {
    if (info.needsDeps) {
      lines.push(`Click **▶ Run** — it will automatically install packages then start the app:`);
      lines.push(`\`\`\`\nnpm install && ${info.runCmd || 'npm start'}\n\`\`\``);
      lines.push(`_(First run takes a moment to install — subsequent runs are instant.)_`);
    } else {
      lines.push(`Click **▶ Run** to start the app (\`${info.runCmd || 'npm start'}\`).`);
    }
  } else if (info.type === 'python') {
    if (info.needsDeps) {
      lines.push(`Click **▶ Run** — it will install Python packages then start the app:`);
      lines.push(`\`\`\`\n${info.depsCmd}\n${info.runCmd || 'python main.py'}\n\`\`\``);
    } else {
      lines.push(`Click **▶ Run** to start the app (\`${info.runCmd}\`).`);
    }
  } else if (info.type === 'go') {
    lines.push(`Click **▶ Run** to compile and start (\`go run .\`).`);
  } else if (info.type === 'rust') {
    lines.push(`Click **▶ Run** to compile and start (\`cargo run\`). First compile takes ~30 seconds.`);
  } else if (info.type === 'shell') {
    lines.push(`Click **▶ Run** to execute (\`bash ${info.entryFile}\`).`);
  } else {
    lines.push(`Type _"how do I run this?"_ and I'll walk you through it.`);
  }

  lines.push('');
  lines.push('**If something goes wrong:** paste the error message here and I\'ll fix it.');
  lines.push('');
  lines.push('> **Your program is the file(s) listed above.** The `.redivivus/` folder is Redivivus\'s internal workbench — it\'s invisible to your users and adds nothing to your app.');
  return lines.join('\n');
}

/**
 * Auto-create a minimal index.html that loads the given JS entry for browser code.
 * Scans the JS file for getElementById calls to add matching canvas/div elements.
 * Returns the relative path 'index.html' on success, null on failure.
 */
export function createHtmlWrapperIfNeeded(root: string, jsEntry: string): string | null {
  try {
    const absJs = path.isAbsolute(jsEntry) ? jsEntry : path.join(root, jsEntry);
    const canvasIds: string[] = [];
    if (fs.existsSync(absJs)) {
      const sample = fs.readFileSync(absJs, 'utf-8').slice(0, 12000);
      const idRe = /getElementById\(['"]([^'"]+)['"]\)/g;
      let m: RegExpExecArray | null;
      while ((m = idRe.exec(sample)) !== null) { if (!canvasIds.includes(m[1])) { canvasIds.push(m[1]); } }
    }
    const canvasElements = canvasIds.map(id => `  <canvas id="${id}"></canvas>`).join('\n');
    const scriptSrc = jsEntry.replace(/\\/g, '/');
    const name = path.basename(root);
    const html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${name}</title>\n  <style>*{margin:0;padding:0;}body{background:#000;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:100vh;}</style>\n</head>\n<body>\n${canvasElements ? canvasElements + '\n' : ''}  <script src="${scriptSrc}"></script>\n</body>\n</html>`;
    fs.writeFileSync(path.join(root, 'index.html'), html, 'utf-8');
    return 'index.html';
  } catch { return null; }
}
