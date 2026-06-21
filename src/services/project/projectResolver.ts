// [SCOPE] Project resolution — the single source of truth for "is this folder a project?", "what project does
// this file belong to?", and "what projects exist (including category subfolders)?". A project root is marked
// by .redivivus/project.json (the MARKER) — falling back to .redivivus/config.json so projects created before
// the marker are still recognised. Categories are NOT stored: a project's category is simply the folder it
// lives in under the projects home (~/projects/games/tetris → category "games"). The filesystem IS the
// organisation. No VS Code deps → unit-testable. Detection rule:
//   walk up from the open file to the nearest folder with the marker → that's the project; any folder between
//   it and the projects home → that's a category.

import * as fs from 'fs';
import * as path from 'path';

export const PROJECT_MARKER = path.join('.redivivus', 'project.json');
const LEGACY_MARKER = path.join('.redivivus', 'config.json');

export interface ProjectEntry { path: string; name: string; category: string; }

/** True if `dir` is a Redivivus project root — has the marker, or the legacy config (older projects). */
export function isProjectRoot(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, PROJECT_MARKER)) || fs.existsSync(path.join(dir, LEGACY_MARKER));
  } catch { return false; }
}

/** Write the project marker. Called FIRST in scaffolding so a new folder is recognised as a project the
 *  instant it exists — before the rest of the scaffold (config, blueprint, src…) is written. Best-effort. */
export function writeProjectMarker(dir: string, name: string): void {
  try {
    const p = path.join(dir, PROJECT_MARKER);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, JSON.stringify({ redivivus: true, name, created: new Date().toISOString() }, null, 2), 'utf8');
    }
  } catch { /* best-effort */ }
}

/** Walk up from a file/dir to the nearest project root, stopping at (and excluding) the container. Returns
 *  undefined if the path isn't under the container, or no project marker is found on the way up. Works for
 *  both flat (~/projects/tetris) and nested (~/projects/games/tetris) layouts. */
export function nearestProjectRoot(target: string, container: string): string | undefined {
  const cont = path.resolve(container);
  let dir = path.resolve(target);
  try { if (fs.existsSync(dir) && fs.statSync(dir).isFile()) { dir = path.dirname(dir); } } catch { dir = path.dirname(dir); }
  const rel = path.relative(cont, dir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { return undefined; } // not under the container
  while (path.resolve(dir) !== cont && dir.startsWith(cont)) {
    if (isProjectRoot(dir)) { return dir; }
    const parent = path.dirname(dir);
    if (parent === dir) { break; }
    dir = parent;
  }
  return undefined;
}

/** The category for a project = the path segment(s) between the container and the project, or '' when the
 *  project sits directly under the container (uncategorised). */
export function categoryOf(projectPath: string, container: string): string {
  const rel = path.relative(path.resolve(container), path.resolve(projectPath));
  if (rel.startsWith('..') || path.isAbsolute(rel)) { return ''; }
  const segs = rel.split(path.sep).filter(Boolean);
  return segs.length > 1 ? segs.slice(0, -1).join('/') : '';
}

/** Enumerate every project under the container — direct children AND projects one level inside a category
 *  folder (a config-less folder that contains projects). Each entry carries its derived category. */
export function enumerateProjects(container: string): ProjectEntry[] {
  const out: ProjectEntry[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(container, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) { continue; }
    const full = path.join(container, e.name);
    if (isProjectRoot(full)) { out.push({ path: full, name: e.name, category: '' }); continue; }
    // Not a project itself → maybe a category: look one level down for projects.
    try {
      for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
        if (sub.isDirectory() && !sub.name.startsWith('.')) {
          const subFull = path.join(full, sub.name);
          if (isProjectRoot(subFull)) { out.push({ path: subFull, name: sub.name, category: e.name }); }
        }
      }
    } catch { /* not readable — skip */ }
  }
  return out;
}
