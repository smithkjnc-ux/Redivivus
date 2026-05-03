// [SCOPE] CHASSIS New Project Wizard — step-by-step project setup flow

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

export type WizardStep = 'welcome' | 'blueprint' | 'nameLocation' | 'creating';

export interface WizardData {
  blueprint?: any;
  projectName?: string;
  folder?: string;
  parentFolder?: string;
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function renderWizardStep(step: WizardStep, data: WizardData): string {
  switch (step) {
    case 'blueprint': return renderBlueprintWizard(data);
    case 'nameLocation': return renderNameLocationWizard(data);
    case 'creating': return renderCreating(data);
    default: return '';
  }
}

function renderBlueprintWizard(data: WizardData): string {
  const bp = data.blueprint || {};
  return `
    <div style="margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h2 style="margin:0 0 4px 0; font-size:18px;">Let's plan your project</h2>
      <p style="margin:0 0 16px 0; font-size:12px; color:var(--vscode-descriptionForeground);">Answer these 5 questions. Don't overthink it — you can change them later.</p>

      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHO is going to use this?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">Picture the person — skill level, context.</p>
      <textarea id="wiz-bp-who" rows="2" placeholder="e.g. Non-technical users who want to sell locally" style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;">${esc(bp.who || '')}</textarea>

      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHAT does it need to do?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">Not the dream list — the minimum useful thing.</p>
      <textarea id="wiz-bp-what" rows="2" placeholder="e.g. Let users post and find local listings via P2P" style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;">${esc(bp.what || '')}</textarea>

      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHERE does this live and run?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">This determines your entire tech stack.</p>
      <textarea id="wiz-bp-where" rows="2" placeholder="e.g. React Native, Firebase, Android first" style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;">${esc(bp.where || '')}</textarea>

      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHEN does this need to work?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">Timeline and responsiveness requirements.</p>
      <textarea id="wiz-bp-when" rows="2" placeholder="e.g. MVP in 2 months, real-time messaging" style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;">${esc(bp.when || '')}</textarea>

      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHY does this need to exist?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">The gut check. If this is weak, know it before coding.</p>
      <textarea id="wiz-bp-why" rows="2" placeholder="e.g. No marketplace lets you sell locally without tracking" style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;">${esc(bp.why || '')}</textarea>

      <div style="display:flex; gap:8px; margin-top:16px;">
        <button id="wiz-bp-next" style="padding:8px 20px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">Next</button>
        <button id="wiz-bp-back" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px;">Back</button>
      </div>
    </div>`;
}

function renderNameLocationWizard(data: WizardData): string {
  const home = os.homedir();
  const defaultParent = fs.existsSync(path.join(home, 'projects')) ? path.join(home, 'projects') : home;
  const parent = data.parentFolder || defaultParent;
  const name = data.projectName || '';
  const sanitized = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
  const fullPath = sanitized ? path.join(parent, sanitized) : '';

  return `
    <div style="margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h2 style="margin:0 0 4px 0; font-size:18px;">Name your project</h2>
      <p style="margin:0 0 16px 0; font-size:12px; color:var(--vscode-descriptionForeground);">Pick a name — we'll make the folder for you.</p>

      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">Project name</label>
      <input id="wiz-project-name" type="text" placeholder="e.g. Hello World" style="width:100%; padding:8px; margin-bottom:4px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" value="${name.replace(/"/g, '&quot;')}" data-parent="${parent.replace(/"/g, '&quot;')}" />
      <p id="wiz-folder-display" style="font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:12px; min-height:16px;">${sanitized ? 'Folder: <code>' + sanitized + '</code>' : ''}</p>

      <p id="wiz-folder-path" style="font-size:12px; color:var(--vscode-descriptionForeground); min-height:18px; margin-bottom:4px;">${fullPath ? 'Project will be created at: <strong>' + fullPath + '</strong>' : ''}</p>
      <p style="font-size:11px; margin:0 0 12px 0;"><a id="wiz-change-parent" href="#" style="color:#58a6ff;">Change location</a></p>

      <div style="display:flex; gap:8px; margin-top:16px;">
        <button id="wiz-create-btn" style="padding:8px 20px; background:${name ? '#238636' : '#333'}; color:${name ? '#fff' : '#aaa'}; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;" ${!name ? 'disabled' : ''}>Create Project</button>
        <button id="wiz-name-back" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px;">Back</button>
      </div>
    </div>`;
}

function renderCreating(data: WizardData): string {
  const name = data.projectName || 'your project';
  return `
    <div style="margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455); text-align:center;">
      <div style="font-size:36px; margin-bottom:12px;">⏳</div>
      <h2 style="margin:0 0 8px 0; font-size:18px;">Creating ${name}...</h2>
      <p style="margin:0 0 12px 0; font-size:13px; color:var(--vscode-descriptionForeground);">Building the foundation</p>
      <div style="text-align:left; display:inline-block; background:rgba(0,0,0,0.2); padding:12px 16px; border-radius:6px; font-size:12px; color:var(--vscode-descriptionForeground); line-height:1.8;">
        <div>📁 src/</div>
        <div>📁 tests/</div>
        <div>📁 docs/</div>
        <div>📄 README.md</div>
        <div>⚙️ .gitignore</div>
        <div>🔧 .chassis/rules.md</div>
        <div>🔗 .cursorrules / .windsurfrules / CLAUDE.md</div>
      </div>
    </div>`;
}
