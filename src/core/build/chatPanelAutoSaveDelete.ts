// [SCOPE] Chat Panel Auto-Save Delete — file deletion helpers for chat delete requests
// Extracted from chatPanelAutoSave.ts to comply with 200-line Rule 9.

import * as fs from 'fs';
import * as path from 'path';
import type { RoutingService } from '../../services/ai/routingService';

const FILE_EXT_RE = /\b(\w+\.\w{2,5})\b/g;

/** Check if user is asking to delete files from the project */
export async function shouldDeleteFiles(userText: string, routing: RoutingService): Promise<boolean> {
  // Fast-path: if no deletion-adjacent word appears at all, skip AI call
  if (!/\b(delete|remove|clean|trash|wipe|erase|get rid)\b/i.test(userText)) { return false; }
  // [RULE 18] AI classifier — "remove the button" ≠ "remove the file"
  try {
    const prompt = `User message: "${userText.slice(0, 200)}"\nIs the user asking to delete or remove project files? Reply with one word: yes or no`;
    const res = await routing.prompt(prompt, 12_000);
    return res.success && !!res.text && res.text.trim().toLowerCase().startsWith('yes');
  } catch {
    return false; // never accidentally delete on AI failure
  }
}

/** Delete files matching user request */
export async function deleteRequestedFiles(userText: string, root: string): Promise<string> {
  const matches: string[] = [];
  let m;
  while ((m = FILE_EXT_RE.exec(userText)) !== null) {
    const filename = m[1];
    // Only delete files that exist in the project
    const absPath = path.join(root, filename);
    if (fs.existsSync(absPath)) { matches.push(filename); }
  }
  if (matches.length === 0) {
    // Try to find files by extension mentioned in the message
    const extMatch = userText.match(/\b(html|js|ts|css|json)\b.*files?/i);
    if (extMatch) {
      const ext = '.' + extMatch[1].toLowerCase();
      const files = fs.readdirSync(root).filter(f => f.endsWith(ext) && !f.startsWith('.'));
      matches.push(...files);
    }
  }
  if (matches.length === 0) { return ''; }
  const deleted: string[] = [];
  for (const file of matches) {
    try {
      fs.unlinkSync(path.join(root, file));
      deleted.push(file);
    } catch { /* skip */ }
  }
  if (deleted.length === 0) { return ''; }
  return `🗑️ Deleted: ${deleted.map(f => `\`${f}\``).join(', ')}`;
}
