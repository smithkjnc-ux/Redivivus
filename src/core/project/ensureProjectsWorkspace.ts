// [SCOPE] Model A workspace foundation — establish the projects parent (~/projects) as the open workspace
// root ONCE, at first run (right after AI-key setup, conceptually). Every project is then a SUBFOLDER of it,
// and the extension host never reloads mid-build: the reload is triggered by the 0-folders -> 1-folder
// transition, and with ~/projects always open we are never at zero, so a build (which creates a subfolder)
// never trips it. The single establish reload happens here while IDLE; VS Code then remembers ~/projects, so
// every later launch/host-restart starts here with NO reload at all.
// First-run only: gated by a one-time flag so closing to the launcher later never bounces the user back.
// See docs/REDIVIVUS_ADAPTIVE_PLANNING.md Section 8 (workspace model).

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { isProjectsContainer } from '../../services/project/redivivusPaths.js';

const ESTABLISHED_KEY = 'redivivus.projectsHomeEstablished';
const NOTE_PENDING_KEY = 'redivivus.projectsHomeNotePending';

/**
 * Establishes ~/projects as the workspace root the first time Redivivus runs with no folder open.
 * Fire-and-forget from activation. Causes at most one idle reload, then is a permanent no-op.
 */
export function ensureProjectsWorkspace(context: vscode.ExtensionContext): void {
  // ── Post-reload step: show the one-line "your projects live here" note exactly once. ──
  // Runs on the activation AFTER the establish reload (folder is now open), then clears itself.
  if (context.globalState.get<boolean>(NOTE_PENDING_KEY)) {
    context.globalState.update(NOTE_PENDING_KEY, undefined);
    vscode.window.showInformationMessage(
      'Redivivus: your projects live in ~/projects — every build you create lands here. Change it anytime in Redivivus Settings.'
    );
  }

  // ── Self-heal: collapse a multi-root "Untitled (Workspace)" back to single-root ~/projects. ──
  // A subfolder got added as its own workspace root (old "Open Project in Explorer" behavior), turning the
  // single ~/projects workspace into an untitled multi-root with the project shown twice. Fires only when
  // EVERY root is ~/projects or a subfolder of it, so a deliberate multi-root with external folders is safe.
  if (healUntitledProjectsWorkspace()) { return; } // reload incoming — collapses to single-root ~/projects

  // Already established once — never fire again (so a deliberate close-to-launcher does not bounce back).
  if (context.globalState.get<boolean>(ESTABLISHED_KEY)) { return; }
  // A folder is already open (user opened a specific project, or ~/projects from a prior session).
  // Wait for a genuine no-folder moment to establish; do not override their choice.
  if (vscode.workspace.workspaceFolders?.length) { return; }

  const projectsDir = vscode.workspace.getConfiguration('redivivus')
    .get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());

  // The parent must exist before we can open it as the workspace.
  try {
    if (!fs.existsSync(projectsDir)) { fs.mkdirSync(projectsDir, { recursive: true }); }
  } catch {
    return; // can't create the projects home — leave the launcher as-is rather than thrash a reload
  }

  // Mark established + queue the note BEFORE the reload (globalState survives the host restart; in-memory
  // state does not). The reload re-enters activation, where the note block above fires once.
  context.globalState.update(ESTABLISHED_KEY, true);
  context.globalState.update(NOTE_PENDING_KEY, true);
  // forceNewWindow:false reloads THIS window into the ~/projects workspace (the single idle reload).
  vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectsDir), { forceNewWindow: false });
}

/**
 * If the workspace is an UNTITLED multi-root containing the projects container AND only subfolders of it,
 * reopen ~/projects as a single folder (collapsing the duplicate roots). Returns true if a reload was
 * triggered. No-op for a single-folder workspace, a saved .code-workspace, or a multi-root with any folder
 * outside ~/projects (a deliberate setup we must not clobber).
 */
function healUntitledProjectsWorkspace(): boolean {
  const wf = vscode.workspace.workspaceFolders || [];
  // ANY untitled workspace that is just the projects container (or container + its subfolders) — including a
  // SINGLE-folder untitled workspace (VS keeps "Untitled (Workspace)" when a folder is ADDED to an empty
  // window, or after roots are removed down to one) — collapses to a clean single-FOLDER "projects" workspace.
  if (vscode.workspace.workspaceFile?.scheme !== 'untitled' || wf.length < 1) { return false; }
  const container = wf.find(f => isProjectsContainer(f.uri.fsPath));
  if (!container) { return false; }
  const onlyContainerAndItsSubfolders = wf.every(f =>
    isProjectsContainer(f.uri.fsPath) || f.uri.fsPath.startsWith(container.uri.fsPath + path.sep));
  if (!onlyContainerAndItsSubfolders) { return false; }
  // [VSCodium quirk] openFolder in the SAME window from an untitled workspace KEEPS it "Untitled (Workspace)"
  // (that was this very bug). The proven pattern — same as open-existing/open-recent (chatPanelMsgProjectOps)
  // — is a NEW window + close the old one, which yields a clean single-FOLDER "projects" workspace.
  vscode.commands.executeCommand('vscode.openFolder', container.uri, { forceNewWindow: true });
  setTimeout(() => vscode.commands.executeCommand('workbench.action.closeWindow'), 1000);
  return true;
}
