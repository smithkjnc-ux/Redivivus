// [SCOPE] Structured sidebar — section headers + action items for all Redivivus commands

import * as vscode from 'vscode';
import type { RedivivusService } from '../../application/redivivusService.js';
import type { SessionService } from '../../../../features/project/application/sessionService.js';

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
    private redivivus: RedivivusService,
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

    const currentAI = vscode.workspace.getConfiguration('redivivus').get<string>('defaultAI') || '';
    const COMING_SOON = 'Coming Soon -- not yet implemented';

    return [
      // [DONE] Profile section activated -- user memory + web search
      {
        id: 'sec-profile', label: '-- PROFILE', type: 'section',
        children: [
          { id: 'prof-view',   label: 'User Profile',  type: 'action', icon: 'account',        command: 'redivivus.openProfile' },
          { id: 'prof-search', label: 'Web Search',    type: 'action', icon: 'search',         command: 'redivivus.webSearch' },
        ],
      },
      {
        id: 'sec-setup', label: '-- SETUP', type: 'section',
        children: [
          { id: 'setup-guide',  label: 'Getting Started', type: 'action', icon: 'question',   command: 'redivivus.guide' },
          { id: 'setup-api',    label: 'AI API Setup',    type: 'action', icon: 'key',        command: 'redivivus.openSettings' },
          { id: 'setup-rules',  label: 'Generate Rules',  type: 'action', icon: 'file-code',  command: 'redivivus.generateRules' },
          { id: 'setup-retro',  label: 'Retrofit',        type: 'action', icon: 'tools',      command: 'redivivus.retrofit' },
        ],
      },
      {
        id: 'sec-session', label: '-- SESSION', type: 'section',
        children: [
          { id: 'sess-start',  label: 'Start Session', type: 'action', icon: 'play',         command: 'redivivus.startSession' },
          { id: 'sess-end',    label: 'End Session',   type: 'action', icon: 'stop-circle',  command: 'redivivus.endSession' },
          { id: 'sess-ai',     label: 'Switch AI',     type: 'action', icon: 'sparkle',      command: 'redivivus.switchAI',  description: currentAI.toUpperCase() },
          { id: 'sess-usage',  label: 'View Usage',    type: 'action', icon: 'graph',        command: 'redivivus.viewUsage' },
        ],
      },
      {
        id: 'sec-project', label: '-- PROJECT', type: 'section',
        children: [
          { id: 'proj-new',  label: 'New Project',       type: 'action', icon: 'new-file',       command: 'redivivus.wizard' },
          { id: 'proj-open', label: 'Open Project',      type: 'action', icon: 'folder-opened',  command: 'redivivus.openProject' },
          { id: 'proj-bp',   label: 'Blueprint',         type: 'action', icon: 'book',           command: 'redivivus.blueprint' },
          { id: 'proj-map',  label: 'Architecture Map',  type: 'action', icon: 'type-hierarchy', command: 'redivivus.showMap' },
        ],
      },
      {
        id: 'sec-build', label: '-- BUILD & VAULT', type: 'section',
        children: [
          { id: 'build-chat',     label: 'Open Chat',        type: 'action', icon: 'comment-discussion', command: 'redivivus.openChat',       description: '* primary' },
          { id: 'build-vault',    label: 'Open Vault',       type: 'action', icon: 'database',           command: 'redivivus.openVault' },
          { id: 'build-bfv',      label: 'Build from Vault', type: 'action', icon: 'package',            command: 'redivivus.buildFromVault' },
          { id: 'build-validate', label: 'Validate Vault',   type: 'action', icon: 'check-all',          command: 'redivivus.validateVault' },
          { id: 'build-github',   label: 'GitHub Backup',    type: 'action', icon: 'github',             command: 'redivivus.configureGitHubBackup' },
        ],
      },
      {
        id: 'sec-review', label: '-- REVIEW', type: 'section',
        children: [
          { id: 'rev-scan',    label: 'Scan Project',    type: 'action', icon: 'search',    command: 'redivivus.analyze' },
          { id: 'rev-profile', label: 'Profile Runtime', type: 'action', icon: 'zap',       command: 'redivivus.profileRuntime' },
          { id: 'rev-check',   label: 'Check File',      type: 'action', icon: 'file-text', command: 'redivivus.checkFileHealth' },
          { id: 'rev-clean',   label: 'Clean File',      type: 'action', icon: 'wand',      command: 'redivivus.cleanUpFile' },
        ],
      },
      {
        id: 'sec-history', label: '-- HISTORY', type: 'section',
        children: [
          { id: 'hist-save', label: 'Save Points', type: 'action', icon: 'history',  command: 'redivivus.savePoint' },
          { id: 'hist-log',  label: 'Work Log',    type: 'action', icon: 'notebook', command: 'redivivus.log' },
          { id: 'hist-dead', label: 'Dead Ends',   type: 'action', icon: 'warning',  command: 'redivivus.deadends' },
        ],
      },
    ];
  }
}