// [SCOPE] Structured sidebar — section headers + action items for all CHASSIS commands

import * as vscode from 'vscode';
import { ChassisService } from '../../services/chassisService.js';
import { SessionService } from '../../services/sessionService.js';

type NodeType = 'section' | 'action' | 'disabled';

interface SidebarNode {
  id: string;
  label: string;
  type: NodeType;
  icon?: string;
  command?: string;
  description?: string;
  tooltip?: string;
  children?: SidebarNode[];
}

export class SidebarProvider implements vscode.TreeDataProvider<SidebarNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SidebarNode | undefined>();
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
    // [WARN] Debounce guard — prevents rapid consecutive refreshes causing flicker
    setTimeout(() => { this._refreshing = false; }, 100);
  }

  getTreeItem(element: SidebarNode): vscode.TreeItem {
    if (element.type === 'section') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'section';
      if (element.description) { item.description = element.description; }
      return item;
    }

    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    if (element.icon) { item.iconPath = new vscode.ThemeIcon(element.icon); }
    if (element.description) { item.description = element.description; }
    if (element.tooltip) { item.tooltip = element.tooltip; }
    if (element.command && element.type !== 'disabled') {
      item.command = { command: element.command, title: element.label, arguments: [] };
    }
    return item;
  }

  getChildren(element?: SidebarNode): SidebarNode[] {
    if (element) { return element.children || []; }

    const currentAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';
    const COMING_SOON = 'Coming Soon -- not yet implemented';

    return [
      // [NEXT] Profile section — re-add when user preferences are implemented
      {
        id: 'sec-setup', label: '-- SETUP', type: 'section',
        children: [
          { id: 'setup-guide',  label: 'Getting Started', type: 'action', icon: 'question',   command: 'chassis.guide' },
          { id: 'setup-api',    label: 'AI API Setup',    type: 'action', icon: 'key',        command: 'chassis.openSettings' },
          { id: 'setup-rules',  label: 'Generate Rules',  type: 'action', icon: 'file-code',  command: 'chassis.generateRules' },
          { id: 'setup-retro',  label: 'Retrofit',        type: 'action', icon: 'tools',      command: 'chassis.retrofit' },
        ],
      },
      {
        id: 'sec-session', label: '-- SESSION', type: 'section',
        children: [
          { id: 'sess-start',  label: 'Start Session', type: 'action', icon: 'play',         command: 'chassis.startSession' },
          { id: 'sess-end',    label: 'End Session',   type: 'action', icon: 'stop-circle',  command: 'chassis.endSession' },
          { id: 'sess-ai',     label: 'Switch AI',     type: 'action', icon: 'sparkle',      command: 'chassis.switchAI',  description: currentAI.toUpperCase() },
          { id: 'sess-usage',  label: 'View Usage',    type: 'action', icon: 'graph',        command: 'chassis.viewUsage' },
        ],
      },
      {
        id: 'sec-project', label: '-- PROJECT', type: 'section',
        children: [
          { id: 'proj-new',  label: 'New Project',       type: 'action', icon: 'new-file',       command: 'chassis.wizard' },
          { id: 'proj-open', label: 'Open Project',      type: 'action', icon: 'folder-opened',  command: 'chassis.openProject' },
          { id: 'proj-bp',   label: 'Blueprint',         type: 'action', icon: 'book',           command: 'chassis.blueprint' },
          { id: 'proj-map',  label: 'Architecture Map',  type: 'action', icon: 'type-hierarchy', command: 'chassis.showMap' },
        ],
      },
      {
        id: 'sec-build', label: '-- BUILD & VAULT', type: 'section',
        children: [
          { id: 'build-chat',     label: 'Open Chat',        type: 'action', icon: 'comment-discussion', command: 'chassis.openChat',       description: '* primary' },
          { id: 'build-vault',    label: 'Open Vault',       type: 'action', icon: 'database',           command: 'chassis.openVault' },
          { id: 'build-bfv',      label: 'Build from Vault', type: 'action', icon: 'package',            command: 'chassis.buildFromVault' },
          { id: 'build-validate', label: 'Validate Vault',   type: 'action', icon: 'check-all',          command: 'chassis.validateVault' },
          { id: 'build-github',   label: 'GitHub Backup',    type: 'action', icon: 'github',             command: 'chassis.configureGitHubBackup' },
        ],
      },
      {
        id: 'sec-review', label: '-- REVIEW', type: 'section',
        children: [
          { id: 'rev-scan',  label: 'Scan Project', type: 'action', icon: 'search',    command: 'chassis.analyze' },
          { id: 'rev-check', label: 'Check File',   type: 'action', icon: 'file-text', command: 'chassis.checkFileHealth' },
          { id: 'rev-clean', label: 'Clean File',   type: 'action', icon: 'wand',      command: 'chassis.cleanUpFile' },
        ],
      },
      {
        id: 'sec-history', label: '-- HISTORY', type: 'section',
        children: [
          { id: 'hist-save', label: 'Save Points', type: 'action', icon: 'history',  command: 'chassis.savePoint' },
          { id: 'hist-log',  label: 'Work Log',    type: 'action', icon: 'notebook', command: 'chassis.log' },
          { id: 'hist-dead', label: 'Dead Ends',   type: 'action', icon: 'warning',  command: 'chassis.deadends' },
        ],
      },
    ];
  }
}