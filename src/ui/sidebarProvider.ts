// [SCOPE] Minimal sidebar — just wizard launcher + project status

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';

type TreeItemType = 'header' | 'status' | 'action' | 'divider';

interface ChassisTreeItem {
  label: string;
  type: TreeItemType;
  icon?: string;
  command?: string;
  description?: string;
}

export class SidebarProvider implements vscode.TreeDataProvider<ChassisTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChassisTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private _refreshing = false;

  constructor(
    private chassis: ChassisService,
    private sessions: SessionService
  ) {}

  refresh(): void {
    if (this._refreshing) { return; }
    this._refreshing = true;
    this._onDidChangeTreeData.fire(undefined);
    // [WARN] This timeout might lead to race conditions if refresh takes longer than 100ms, potentially causing inconsistent UI state or missed refreshes.
    setTimeout(() => { this._refreshing = false; }, 100);
  }

  getTreeItem(element: ChassisTreeItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label);
    if (element.type === 'divider') { item.label = '─────────────'; return item; }
    if (element.icon) { item.iconPath = new vscode.ThemeIcon(element.icon); }
    if (element.description) { item.description = element.description; }
    if (element.command) {
      item.command = { command: element.command, title: element.label };
    }
    return item;
  }

  getChildren(): ChassisTreeItem[] {
    const items: ChassisTreeItem[] = [];

    // Main launcher
    items.push({
      label: 'Open CHASSIS',
      type: 'action',
      icon: 'dashboard',
      command: 'chassis.wizard',
      description: '',
    });

    items.push({ label: '', type: 'divider' });

    if (!this.chassis.isInitialized()) {
      items.push({ label: 'No project', type: 'status', icon: 'circle-outline', description: 'Open wizard to start' });
      return items;
    }

    const config = this.chassis.loadConfig();
    items.push({
      label: config?.projectName || 'Project',
      type: 'status',
      icon: 'project',
      description: 'v' + (config?.version || '0.1.0'),
    });

    const bp = config?.blueprint;
    items.push({
      label: 'Blueprint',
      type: 'status',
      icon: bp?.locked ? 'lock' : 'unlock',
      description: bp?.locked ? 'Locked' : bp?.who ? 'Draft' : 'Empty',
    });

    if (this.sessions.isActive) {
      items.push({
        label: 'Session',
        type: 'status',
        icon: 'pulse',
        description: this.sessions.session?.ai || 'Active',
      });
    }

    const currentAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';
    items.push({
      label: 'AI',
      type: 'action',
      icon: 'sparkle',
      command: 'chassis.switchAI',
      description: currentAI.toUpperCase(),
    });

    return items;
  }
}