// [SCOPE] Intent Service — manages user-confirmed architectural justifications
// Stores choices in .redivivus/intent.json so the Guardian stops nagging about approved complexity.

import * as fs from 'fs';
import * as path from 'path';

export interface UserIntent {
  confirmedScenicRoutes: string[]; // array of node ID chains or edge keys
  confirmedComplexFiles: string[]; // array of node IDs
}

export class IntentService {
  private filePath: string;
  private data: UserIntent;

  constructor(root: string) {
    this.filePath = path.join(root, '.redivivus', 'intent.json');
    this.data = this.load();
  }

  private load(): UserIntent {
    if (!fs.existsSync(this.filePath)) {
      return { confirmedScenicRoutes: [], confirmedComplexFiles: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return { confirmedScenicRoutes: [], confirmedComplexFiles: [] };
    }
  }

  private save(): void {
    try {
      if (!fs.existsSync(path.dirname(this.filePath))) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('[Redivivus] Failed to save intent.json:', e);
    }
  }

  confirmComplexFile(nodeId: string): void {
    if (!this.data.confirmedComplexFiles.includes(nodeId)) {
      this.data.confirmedComplexFiles.push(nodeId);
      this.save();
    }
  }

  confirmScenicRoute(edgeKey: string): void {
    if (!this.data.confirmedScenicRoutes.includes(edgeKey)) {
      this.data.confirmedScenicRoutes.push(edgeKey);
      this.save();
    }
  }

  isConfirmedFile(nodeId: string): boolean {
    return this.data.confirmedComplexFiles.includes(nodeId);
  }

  isConfirmedRoute(edgeKey: string): boolean {
    return this.data.confirmedScenicRoutes.includes(edgeKey);
  }

  clearIntent(nodeId: string): void {
    this.data.confirmedComplexFiles = this.data.confirmedComplexFiles.filter(id => id !== nodeId);
    this.data.confirmedScenicRoutes = this.data.confirmedScenicRoutes.filter(id => !id.includes(nodeId));
    this.save();
  }
}
