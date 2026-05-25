// [SCOPE] Redivivus project scanner — finds Redivivus projects in common directories
// Extracted from chatPanelMsgSendMessage.ts

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function _scanRedivivusProjects(): { name: string; fullPath: string }[] {
  const homeDir = os.homedir();
  const projects: { name: string; fullPath: string }[] = [];
  for (const dir of [path.join(homeDir, 'projects'), path.join(homeDir, 'Projects'), path.join(homeDir, 'dev'), path.join(homeDir, 'workspace'), path.join(homeDir, 'code'), path.join(homeDir, 'src')]) {
    if (fs.existsSync(dir)) {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            const pp = path.join(dir, entry.name);
            if (fs.existsSync(path.join(pp, '.redivivus'))) { projects.push({ name: entry.name, fullPath: pp }); }
          }
        }
      } catch { /* ignore */ }
    }
  }
  return projects;
}
