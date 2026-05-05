// [SCOPE] Vault browser HTML renderer — user-friendly accordion UI with plain-English descriptions
// Generates rich HTML for the vault browser panel. Split from vaultBrowse.ts to keep files under 200 lines.
// Design goal: a non-coder can look at this and understand what every code piece does.

import { VAULT_CATEGORIES, VaultCategory, VaultItem } from '../services/vaultTypes.js';

interface FriendlyCat {
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}

const FRIENDLY: Record<string, FriendlyCat> = {
  component:  { title: 'Screen Building Blocks', subtitle: 'Ready-made pieces you can drop onto a screen', icon: '🧩', color: '#58a6ff' },
  utility:    { title: 'Handy Helpers',          subtitle: 'Small tools that do one job really well',       icon: '🔧', color: '#7ee787' },
  algorithm:  { title: 'Smart Solutions',        subtitle: 'Clever ways to solve math, search, and data problems', icon: '⚙️', color: '#d2a8ff' },
  pattern:    { title: 'Blueprint Patterns',     subtitle: 'Reusable designs for how code should be organized', icon: '🏗️', color: '#f0883e' },
  config:     { title: 'Settings & Setup',       subtitle: 'Configuration files and environment setup',     icon: '⚙️', color: '#79c0ff' },
  api:        { title: 'Connection Tools',       subtitle: 'Code that talks to other apps and servers',      icon: '🌐', color: '#a5d6ff' },
  database:   { title: 'Data Storage Helpers',   subtitle: 'Code for saving and reading information',       icon: '🗄️', color: '#bc8cff' },
  auth:       { title: 'Login & Security',       subtitle: 'Code that keeps accounts safe',                  icon: '🔐', color: '#ffa657' },
  validation: { title: 'Input Checkers',         subtitle: 'Code that makes sure data entered is correct',   icon: '✅', color: '#56d364' },
  error:      { title: 'Safety Nets',            subtitle: 'Code that catches problems before they crash',   icon: '🚨', color: '#ff7b72' },
  testing:    { title: 'Quality Checkers',       subtitle: 'Code that makes sure other code works',         icon: '🧪', color: '#3fb950' },
  network:    { title: 'Internet Helpers',       subtitle: 'Code for sending data across networks',         icon: '📡', color: '#79c0ff' },
  other:      { title: 'Miscellaneous',          subtitle: 'Code that does not fit neatly into other groups', icon: '📦', color: '#8b949e' },
};

function humanizeName(name: string): string {
  const cleaned = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderVaultBrowser(allItems: VaultItem[]): string {
  const catCounts: Record<string, number> = {};
  VAULT_CATEGORIES.forEach(c => catCounts[c] = 0);
  allItems.forEach(item => {
    const cat = item.category;
    if (cat && VAULT_CATEGORIES.includes(cat as any)) { catCounts[cat]++; }
    else { catCounts['other']++; }
  });

  const totalCats = VAULT_CATEGORIES.filter(c => catCounts[c] > 0).length;

  // ── Action buttons ──
  const actions = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
      <button data-cmd="chassis.saveToVault" style="flex:1;min-width:100px;padding:8px 10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:12px;">💾 Save Code</button>
      <button data-cmd="chassis.scanVaultCodebase" style="flex:1;min-width:100px;padding:8px 10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:12px;">📁 Scan Project</button>
      <button data-cmd="chassis.buildFromVault" style="flex:1;min-width:100px;padding:8px 10px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;border-radius:6px;cursor:pointer;font-size:12px;opacity:0.9;">🏗️ Build From Vault</button>
      <button data-cmd="chassis.validateVault" style="flex:1;min-width:100px;padding:8px 10px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;border-radius:6px;cursor:pointer;font-size:12px;opacity:0.9;">✅ Validate</button>
    </div>`;

  // ── Accordion categories ──
  const categoryHtml = VAULT_CATEGORIES.map(cat => {
    const count = catCounts[cat] || 0;
    if (count === 0) { return ''; }
    const f = FRIENDLY[cat] || FRIENDLY['other'];
    const catItems = allItems.filter(i => i.category === cat);

    const itemsHtml = catItems.map(item => {
      const niceName = humanizeName(item.name);
      const desc = item.description || 'A reusable piece of code.';
      const lineCount = item.lineCount || item.code.split('\n').length;
      const fileName = item.sourceFile.split(/[\\/]/).pop() || 'unknown';
      return `
        <div class="vault-item" style="margin-bottom:8px;padding:10px;background:var(--vscode-editor-background);border:1px solid var(--vscode-input-border);border-radius:6px;">
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <span style="font-size:16px;margin-top:2px;">${f.icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:13px;color:var(--vscode-editor-foreground);">${esc(niceName)}</div>
              <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:3px;line-height:1.4;">${esc(desc)}</div>
              <div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:6px;opacity:0.7;">
                📄 ${esc(fileName)} · ${lineCount} lines · ${esc(item.language.toUpperCase())} · From: ${esc(item.sourceProject || 'Unknown Project')}
              </div>
            </div>
          </div>
          <details style="margin-top:8px;">
            <summary style="font-size:11px;color:var(--vscode-textLink-foreground);cursor:pointer;user-select:none;list-style:none;">
              <span style="display:inline-flex;align-items:center;gap:4px;">
                <span style="font-size:10px;">▶</span> View the Code
              </span>
            </summary>
            <pre style="margin-top:8px;padding:10px;background:var(--vscode-textBlockQuote-background);border:1px solid var(--vscode-input-border);border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre;max-height:300px;overflow-y:auto;line-height:1.5;"><code>${esc(item.code)}</code></pre>
          </details>
        </div>`;
    }).join('');

    return `
      <details class="cat-details" style="margin-bottom:10px;">
        <summary class="cat-summary" style="list-style:none;cursor:pointer;padding:12px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:8px;transition:background 0.15s;display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">${f.icon}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;color:${f.color};display:flex;align-items:center;gap:8px;">
              ${f.title}
              <span style="background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;">${count}</span>
            </div>
            <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px;">${f.subtitle}</div>
          </div>
          <span class="cat-arrow" style="font-size:12px;color:var(--vscode-descriptionForeground);transition:transform 0.2s;">▼</span>
        </summary>
        <div style="padding:10px;background:var(--vscode-editor-background);border:1px solid var(--vscode-input-border);border-top:none;border-radius:0 0 8px 8px;">
          <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:10px;padding:8px;background:var(--vscode-input-background);border-radius:4px;">
            <strong>💡 What you will find here:</strong> ${f.subtitle} Tap any item to see the actual code inside.
          </div>
          ${itemsHtml}
        </div>
      </details>`;
  }).join('');

  return `<style>
    .cat-summary:hover { background: var(--vscode-list-hoverBackground) !important; }
    .cat-details[open] .cat-arrow { transform: rotate(180deg); }
    .vault-item { transition: border-color 0.15s; }
    .vault-item:hover { border-color: ${FRIENDLY['component'].color}40 !important; }
  </style>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:16px;max-width:900px;">
    <div style="padding-bottom:12px;border-bottom:1px solid var(--vscode-editorGroup-border);margin-bottom:16px;">
      <div style="font-size:18px;font-weight:700;letter-spacing:0.5px;">💾 Code Vault</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-top:4px;">
        ${allItems.length} saved code pieces across ${totalCats} categories — reusable across all your projects
      </div>
    </div>
    ${actions}
    <div style="margin-bottom:8px;font-size:11px;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:0.5px;">
      📂 Tap a category below to explore what is inside
    </div>
    ${categoryHtml || '<div style="padding:40px;text-align:center;color:var(--vscode-descriptionForeground);font-size:14px;">Your vault is empty.<br><br>Use <strong>Save Code</strong> or <strong>Scan Project</strong> above to add reusable code.</div>'}
    <div style="margin-top:20px;padding:12px;background:var(--vscode-input-background);border-radius:6px;font-size:12px;color:var(--vscode-descriptionForeground);opacity:0.9;">
      <strong>🤔 New here?</strong> The vault stores your best code so you never have to write the same thing twice.
      Scan a project to automatically find and save useful pieces.
    </div>
  </div>`;
}
