// [SCOPE] CHASSIS Misc commands — status display, guides, AI switching, file viewers, panel refresh

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';
import { GuideService } from '../services/guideService.js';
import { RulesService } from '../services/rulesService.js';
import { autoCaptureFile } from '../services/vaultAutoCapture.js';
import { getPhaseUndoService } from '../services/phaseUndoService.js';
import { ChassisWebviewProvider } from '../ui/chassisWebviewProvider.js';
import { ChatPanel } from '../ui/chatPanel.js';

export function registerMiscCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  sessions: SessionService,
  guideService: GuideService,
  rulesService: RulesService,
  provider: ChassisWebviewProvider,
  refreshAll: () => void
): void {
  // Show Progress
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.progress', async () => {
      if (!chassis.isInitialized()) {
        vscode.window.showErrorMessage('Run "CHASSIS: Initialize Project" first.');
        return;
      }
      const config = chassis.loadConfig();
      if (!config) { return; }

      const bp = config.blueprint;
      const healthLine = `✅ ${bp.health.confirmed} Confirmed · 🔶 ${bp.health.assumed} Assumed · ❓ ${bp.health.unknown} Unknown`;
      const statusLine = bp.locked ? '🔒 Blueprint LOCKED' : '🔶 Blueprint DRAFT';
      const sessionsLine = `📊 ${config.sessions.length} sessions logged`;

      vscode.window.showInformationMessage(
        `${config.projectName} — ${statusLine}\n${healthLine}\n${sessionsLine}`
      );
    })
  );

  // Getting Started panel — show inside chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showChatGettingStarted', async () => {
      ChatPanel.show(undefined as any, undefined as any);
      setTimeout(() => {
        if (ChatPanel.currentPanel) {
          ChatPanel.currentPanel.showGettingStarted();
        }
      }, 100);
    })
  );

  // Guide — show full guide webview
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.guide', async () => {
      await guideService.showGuide();
    })
  );

  // Switch AI — show selector inside chat panel
  ChatPanel.onSwitchAI = async (ai: string) => {
    const config = vscode.workspace.getConfiguration('chassis');
    await config.update('defaultAI', ai, true);
    vscode.window.showInformationMessage('CHASSIS now using ' + ai.toUpperCase());
    refreshAll();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.switchAI', async () => {
      const config = vscode.workspace.getConfiguration('chassis');
      const current = config.get<string>('defaultAI') || 'gemini';
      const ais = [
        { id: 'gemini', label: 'Gemini', desc: 'Free tier — fast, good for most tasks', icon: '✨' },
        { id: 'claude', label: 'Claude', desc: 'Paid — deep reasoning, best for complex files', icon: '🤖' },
        { id: 'kimi', label: 'Kimi', desc: 'Fast — great for bulk annotations', icon: '⚡' },
        { id: 'openai', label: 'GPT-4o', desc: 'OpenAI — versatile and widely supported', icon: '🧠' },
        { id: 'groq', label: 'Groq', desc: 'Ultra-fast inference', icon: '🚀' },
        { id: 'xai', label: 'Grok', desc: 'xAI — experimental, web-aware', icon: '🌐' },
      ];
      const cardsHtml = ais.map(a => {
        const isActive = a.id === current;
        const border = isActive ? 'var(--vscode-focusBorder)' : 'var(--vscode-input-border)';
        const badge = isActive ? '<span style="float:right;font-size:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:2px 6px;border-radius:10px;">Active</span>' : '';
        return `<button data-ai="${a.id}" style="display:block;width:100%;text-align:left;margin-bottom:8px;padding:10px 12px;background:var(--vscode-editor-background);border:1px solid ${border};border-radius:6px;cursor:pointer;color:var(--vscode-editor-foreground);">${badge}<span style="font-size:16px;margin-right:8px;">${a.icon}</span><strong>${a.label}</strong><br><span style="font-size:11px;color:var(--vscode-descriptionForeground);margin-left:28px;">${a.desc}</span></button>`;
      }).join('');
      const html = `<div id="ai-switch-panel" style="padding:4px 0">${cardsHtml}</div>`;
      if (!ChatPanel.currentPanel) {
        vscode.commands.executeCommand('chassis.openChatPanel');
        setTimeout(() => ChatPanel.currentPanel?.showPanel('switch-ai', '🤖 Switch AI', html), 300);
      } else {
        ChatPanel.currentPanel.showPanel('switch-ai', '🤖 Switch AI', html);
      }
    })
  );

  // Generate AI Editor Rules
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.generateRules', async () => {
      try {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { vscode.window.showErrorMessage('No workspace open.'); return; }
        const config = chassis.loadConfig();
        const name = config?.projectName || 'Project';
        const created = rulesService.generateAll(root, name);
        vscode.window.showInformationMessage(
          'CHASSIS rules generated: ' + created.join(', ')
        );
        refreshAll();
      } catch (err) {
        vscode.window.showErrorMessage('Generate Rules failed: ' + (err instanceof Error ? err.message : String(err)));
        throw err;
      }
    })
  );

  // Wizard Panel — focus the sidebar webview
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.wizard', async () => {
      await vscode.commands.executeCommand('chassisSidebar.focus');
    })
  );

  // Auto-commit on successful build
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.autoCommit', async () => {
      const config = chassis.loadConfig();
      if (!config) {
        vscode.window.showErrorMessage('CHASSIS not initialized');
        return;
      }
      const mode = config.autoCommit || 'prompt';
      if (mode === 'off') {
        vscode.window.showInformationMessage('Auto-commit is off. Commit manually.');
        return;
      }

      // [WARN] Using synchronous child_process.execSync which can block the event loop and has security implications.
      // Check if there are changes to commit
      const { execSync } = require('child_process');
      try {
        // [WARN] Using synchronous child_process.execSync.
        const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
        if (!status.trim()) {
          vscode.window.showInformationMessage('No changes to commit.');
          return;
        }
      } catch (e) {
        vscode.window.showErrorMessage('Git check failed: ' + (e as Error).message);
        return;
      }

      // Generate commit message
      const timestamp = new Date().toISOString();
      const sessionService = new SessionService(chassis);
      const sessionGoal = sessionService.isActive ? sessionService.session?.goal || 'no session' : 'no session';
      const commitMessage = `CHASSIS checkpoint: ${timestamp} — ${sessionGoal}`;

      if (mode === 'auto') {
        try {
          // [WARN] Using synchronous child_process.execSync.
          execSync(`git add -A`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
          // [WARN] Using synchronous child_process.execSync.
          execSync(`git commit -m "${commitMessage}"`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
          vscode.window.showInformationMessage('Auto-committed successfully.');
        } catch (e) {
          vscode.window.showErrorMessage('Auto-commit failed: ' + (e as Error).message);
        }
      } else if (mode === 'prompt') {
        const result = await vscode.window.showInputBox({
          prompt: 'Commit message (CHASSIS checkpoint)',
          value: commitMessage,
          ignoreFocusOut: true,
        });
        if (result) {
          try {
            // [WARN] Using synchronous child_process.execSync.
            execSync(`git add -A`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
            // [WARN] Using synchronous child_process.execSync.
            execSync(`git commit -m "${result}"`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
            vscode.window.showInformationMessage('Committed successfully.');
          } catch (e) {
            vscode.window.showErrorMessage('Commit failed: ' + (e as Error).message);
          }
        }
      }
    })
  );

  // Open current file (or specified file) in browser
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openInBrowser', async (filePath?: string) => {
      const targetPath = filePath || vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!targetPath) {
        vscode.window.showErrorMessage('No file specified and no active editor.');
        return;
      }
      if (!fs.existsSync(targetPath)) {
        vscode.window.showErrorMessage(`File not found: ${targetPath}`);
        return;
      }
      const uri = vscode.Uri.file(targetPath);
      try {
        await vscode.commands.executeCommand('simpleBrowser.show', uri.toString());
      } catch {
        await vscode.env.openExternal(uri);
      }
    })
  );

  // Undo a specific build phase
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.undoPhase', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('No workspace open.');
        return;
      }

      const phaseUndo = getPhaseUndoService(root);
      const builds = phaseUndo.listBuilds();

      if (builds.length === 0) {
        vscode.window.showInformationMessage('No phased builds to undo.');
        return;
      }

      // Show builds with phases
      const buildItems = builds.map(b => ({
        label: `${new Date(parseInt(b.buildId)).toLocaleString()}`,
        description: `${b.phaseCount} phases — ${b.task.substring(0, 40)}${b.task.length > 40 ? '...' : ''}`,
        detail: b.buildId,
      }));

      const selectedBuild = await vscode.window.showQuickPick(buildItems, {
        placeHolder: 'Select a build to undo a phase from',
      });

      if (!selectedBuild) return;

      const buildId = selectedBuild.detail;
      const undoablePhases = phaseUndo.getUndoablePhases(buildId);

      if (undoablePhases.length === 0) {
        vscode.window.showInformationMessage('No undoable phases in this build.');
        return;
      }

      // Show phases that can be undone (newest first)
      const phaseItems = undoablePhases.map(p => ({
        label: `Phase ${p.phaseNumber}: ${p.phaseName}`,
        description: `${p.files.length} file(s)`,
        detail: p.phaseNumber.toString(),
      }));

      const selectedPhase = await vscode.window.showQuickPick(phaseItems, {
        placeHolder: 'Select phase to undo (newest first)',
      });

      if (!selectedPhase) return;

      const phaseNumber = parseInt(selectedPhase.detail!);
      const success = phaseUndo.undoPhase(buildId, phaseNumber);

      if (success) {
        vscode.window.showInformationMessage(`✅ Undid Phase ${phaseNumber}`);
      } else {
        vscode.window.showErrorMessage(`❌ Failed to undo Phase ${phaseNumber}`);
      }
    })
  );

  // Show CHASSIS capabilities in chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showCapabilities', async () => {
      const caps = [
        '🏗️ **Build** — Generate code from natural language',
        '📋 **Blueprint** — Define project scope with 5W framework',
        '🗺️ **Map** — Visual architecture diagram',
        '🔍 **Analyze** — Project health & recommendations',
        '💾 **Vault** — Save & reuse code snippets',
        '🤖 **AI Review** — Code review by AI',
        '🧪 **Tests** — Auto-detect & run test frameworks',
        '↩️ **Undo Phase** — Rollback individual build phases',
        '📦 **All VS Code Commands** — Terminal, Git, settings, etc.',
        '',
        'Just ask me to do anything!',
      ].join('\n');

      vscode.window.showInformationMessage(
        'CHASSIS Capabilities: Build code, Blueprint, Map, Vault, AI Review, Tests, Undo Phase, VS Code commands',
        'Got it'
      );
    })
  );

  // List available projects (scans home directory for CHASSIS projects)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.listProjects', async () => {
      const os = require('os');
      const homeDir = os.homedir();
      const projectsDir = path.join(homeDir, 'projects');

      const projects: { name: string; path: string }[] = [];

      // Check common project directories
      const dirsToCheck = [
        projectsDir,
        path.join(homeDir, 'Projects'),
        path.join(homeDir, 'dev'),
        path.join(homeDir, 'workspace'),
        path.join(homeDir, 'code'),
        path.join(homeDir, 'src'),
      ];

      for (const dir of dirsToCheck) {
        if (fs.existsSync(dir)) {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const projectPath = path.join(dir, entry.name);
                // Check if it's a CHASSIS project (has .chassis directory)
                if (fs.existsSync(path.join(projectPath, '.chassis'))) {
                  projects.push({ name: entry.name, path: projectPath });
                }
              }
            }
          } catch { /* ignore permission errors */ }
        }
      }

      if (projects.length === 0) {
        vscode.window.showInformationMessage('No CHASSIS projects found. Create one with "Start New Project Setup"');
        return;
      }

      const items = projects.map(p => ({
        label: p.name,
        description: p.path,
        detail: p.path,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a CHASSIS project to open',
      });

      if (selected) {
        const uri = vscode.Uri.file(selected.detail!);
        vscode.commands.executeCommand('vscode.openFolder', uri);
      }
    })
  );
}