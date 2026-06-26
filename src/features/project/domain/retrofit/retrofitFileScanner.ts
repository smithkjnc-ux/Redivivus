// [SCOPE] Retrofit file scanner — discovers code files, backs up, restores, and deletes dirs
import * as fs from 'fs';
import * as path from 'path';

// [WARN] Never mangle VS Code extension source — if the workspace IS a vscode extension,
// src/ and out/ are skipped to prevent Redivivus from corrupting its own regex/string literals.
export function getCodeFiles(root: string): string[] {
  const files: string[] = [];
  const skipDirs = new Set([
    'node_modules', '.git', '.redivivus', '__pycache__', '.vscode',
    'venv', '.venv', 'dist', 'out', 'build', '.cache',
    'venv_ryppel', 'LivePortrait', 'avatar', 'old files',
  ]);

  try {
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg?.engines?.vscode) {
        skipDirs.add('src');
        skipDirs.add('out');
      }
    }
  } catch { /* skip — non-fatal */ }

  const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css', '.sh']);
  const skipFiles = new Set([
    'basis_transcoder.js', 'three.min.js', 'jquery.min.js',
    'bootstrap.min.js', 'tailwind.min.js', 'vendor.js', 'bundle.js',
  ]);

  const scan = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !skipDirs.has(e.name) && !e.name.startsWith('.')) {
        scan(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (codeExts.has(ext) && !skipFiles.has(e.name) && !e.name.includes('.min.')) {
          files.push(full);
        }
      }
    }
  };
  scan(root);
  return files;
}

export function backupFiles(root: string, backupDir: string, files: string[]): void {
  for (const f of files) {
    const rel = path.relative(root, f);
    const dest = path.join(backupDir, rel);
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) { fs.mkdirSync(destDir, { recursive: true }); }
    fs.copyFileSync(f, dest);
  }
}

export function restoreFiles(root: string, backupDir: string): void {
  const restore = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { restore(full); }
      else {
        const rel = path.relative(backupDir, full);
        const dest = path.join(root, rel);
        fs.copyFileSync(full, dest);
      }
    }
  };
  restore(backupDir);
}

export function deleteDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
