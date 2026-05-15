// [SCOPE] Vault browser HTML renderer — friendly bookshelf UI for non-technical users.
// Card-based layout with search, plain-English category labels, warm colors, and "What is a Vault?" explainer.
// [WARN] Keep non-technical friendly — no raw code visible by default. Code only shows on explicit "View Code" click.

import { VAULT_CATEGORIES, VaultItem } from '../../services/vault/vaultTypes.js';

const FRIENDLY: Record<string, { title: string; subtitle: string; plainEnglish: string; icon: string; bg: string; accent: string }> = {
  component:  { title: 'Screen Pieces',    subtitle: 'Ready-made UI parts',              plainEnglish: 'Things that appear on screen — buttons, forms, menus, cards.',        icon: '🧩', bg: '#e8f4fd', accent: '#1a6fb8' },
  utility:    { title: 'Handy Tools',      subtitle: 'Small helpers, one job each',      plainEnglish: 'Little workers that do one thing really well — like formatting a date or checking an email address.', icon: '🔧', bg: '#edfaf2', accent: '#1a7a3a' },
  algorithm:  { title: 'Smart Logic',      subtitle: 'Math & data processing',           plainEnglish: 'The clever thinking parts — sorting lists, calculating scores, searching through data.',              icon: '⚡', bg: '#f3eeff', accent: '#6b3ac2' },
  pattern:    { title: 'Blueprints',       subtitle: 'Reusable structures',              plainEnglish: 'Common ways of organizing code that have been proven to work well.',                                   icon: '🏗️', bg: '#fff4e8', accent: '#b85c00' },
  config:     { title: 'Settings',         subtitle: 'App configuration',                plainEnglish: 'The knobs and dials — things like which server to use, what the app is called, and feature toggles.', icon: '⚙️', bg: '#e8f4fd', accent: '#1a5fa0' },
  api:        { title: 'Connections',      subtitle: 'Talks to other apps',              plainEnglish: 'The phone lines — code that reaches out to weather apps, payment systems, maps, and other services.',  icon: '🌐', bg: '#eaf6ff', accent: '#0e6da8' },
  database:   { title: 'Data Storage',     subtitle: 'Save and retrieve information',    plainEnglish: 'The filing cabinet — puts things in, gets things out, keeps everything organized.',                   icon: '🗄️', bg: '#f0ebff', accent: '#5a2da8' },
  auth:       { title: 'Login & Security', subtitle: 'Who can use the app',              plainEnglish: 'The bouncer — checks passwords, manages who is logged in, keeps things private.',                     icon: '🔐', bg: '#fff3e8', accent: '#b85c00' },
  validation: { title: 'Input Checks',     subtitle: 'Makes sure data is correct',       plainEnglish: 'The spell-checker — makes sure emails look like emails, numbers are numbers, nothing is left blank.',  icon: '✅', bg: '#edfaf2', accent: '#1a7a3a' },
  error:      { title: 'Safety Nets',      subtitle: 'Catches things when they go wrong',plainEnglish: 'The crash mat — catches problems before they break everything and shows a friendly message instead.',   icon: '🛡️', bg: '#fff0f0', accent: '#c0392b' },
  testing:    { title: 'Quality Checks',   subtitle: 'Makes sure other code works',      plainEnglish: 'The test drive — runs through everything to make sure nothing is broken before users see it.',         icon: '🧪', bg: '#edfaf2', accent: '#1a6b3a' },
  network:    { title: 'Web Traffic',      subtitle: 'HTTP requests & responses',        plainEnglish: 'The road system — manages data traveling between your app and the internet.',                          icon: '📡', bg: '#e8f4fd', accent: '#1a5fa0' },
  other:      { title: 'Everything Else',  subtitle: 'Miscellaneous saved pieces',       plainEnglish: 'A catch-all drawer for pieces that don\'t fit neatly into a single category.',                        icon: '📦', bg: '#f5f5f5', accent: '#555' },
};

function humanize(name: string): string {
  return name.replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2')
    .toLowerCase().split(/\s+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
}

function esc(s: string): string {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Renders a single item card — friendly name, plain-English description, "View Code" hidden by default */
function renderItemCard(item: VaultItem, accent: string, icon: string): string {
  const name = humanize(item.name);
  const desc = item.description || 'A reusable piece of code saved from a previous build.';
  const proj = item.sourceProject ? `Saved from: ${item.sourceProject}` : 'Saved to your vault';
  const used = item.importCount || 0;
  const usedBadge = used > 0 ? `<span style="background:${accent}20;color:${accent};padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;">Used ${used}×</span>` : '';
  return `<div data-vitem="1" style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:14px 16px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <span style="font-size:20px;line-height:1.2;flex-shrink:0;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;color:#1e1e1e;margin-bottom:3px;">${esc(name)}</div>
        <div style="font-size:12px;color:#555;line-height:1.5;margin-bottom:6px;">${esc(desc)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:10px;color:#999;">${esc(proj)}</span>
          ${usedBadge}
        </div>
      </div>
    </div>
    <details style="margin-top:10px;">
      <summary style="list-style:none;font-size:11px;color:${accent};cursor:pointer;user-select:none;font-weight:600;">▶ View Code</summary>
      <pre style="margin:8px 0 0;padding:10px;background:#f6f8fa;border:1px solid #e0e0e0;border-radius:6px;font-size:10px;overflow-x:auto;max-height:220px;overflow-y:auto;white-space:pre;line-height:1.5;color:#1e1e1e;"><code>${esc(item.code)}</code></pre>
    </details>
  </div>`;
}

export function renderVaultBrowser(allItems: VaultItem[]): string {
  const totalCats = new Set(allItems.map(i => i.category || 'other')).size;
  const totalLines = allItems.reduce((s, i) => s + (i.lineCount || i.code.split('\n').length), 0);
  const mostUsed = [...allItems].sort((a, b) => (b.importCount||0) - (a.importCount||0))[0];
  const linesStr = totalLines > 1000 ? (totalLines/1000).toFixed(1)+'k' : String(totalLines);

  const catMap: Record<string, VaultItem[]> = {};
  allItems.forEach(i => {
    const c = (i.category || 'other') as string;
    if (!catMap[c]) catMap[c] = [];
    catMap[c].push(i);
  });

  // ── Category shelves ──
  const shelves = VAULT_CATEGORIES.map(cat => {
    const items = catMap[cat];
    if (!items || items.length === 0) { return ''; }
    const f = FRIENDLY[cat] || FRIENDLY['other'];
    const cards = items.map(item => renderItemCard(item, f.accent, f.icon)).join('');
    return `<div data-vshelf="${cat}" style="margin-bottom:6px;">
      <div data-toggle-shelf="${cat}" style="display:flex;cursor:pointer;user-select:none;align-items:center;gap:12px;padding:12px 16px;background:${f.bg};border:2px solid ${f.accent}30;border-radius:12px;cursor:pointer;user-select:none;">
        <span style="font-size:26px;line-height:1;">${f.icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:${f.accent};">${f.title}</div>
          <div style="font-size:11px;color:#666;margin-top:1px;">${f.plainEnglish}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:20px;font-weight:800;color:${f.accent};line-height:1;">${items.length}</div>
          <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.3px;">saved</div>
        </div>
        <span id="arr-${cat}" style="font-size:14px;color:${f.accent};">▼</span>
      </div>
      <div id="items-${cat}" style="display:none;padding:10px 4px 4px;">${cards}</div>
    </div>`;
  }).join('');

  // ── Empty state ──
  const emptyState = `
    <div style="text-align:center;padding:48px 20px;">
      <div style="font-size:52px;margin-bottom:12px;">🏦</div>
      <div style="font-size:17px;font-weight:700;color:#333;margin-bottom:8px;">Your Vault is empty</div>
      <div style="font-size:13px;color:#666;line-height:1.6;max-width:280px;margin:0 auto 20px;">Every time CHASSIS builds something for you, it automatically saves the best parts here so they can be reused.</div>
      <button data-cmd="chassis.scanVaultCodebase" style="padding:10px 24px;background:#1a6fb8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;">📁 Scan My Project to Fill the Vault</button>
    </div>`;

  // Stats cells — fully inline, no classes
  const statsCells = [
    ['🧩', String(allItems.length), 'Saved pieces'],
    ['📚', String(totalCats),       'Categories'],
    ['📏', linesStr,                'Lines of code'],
  ].map(([icon, val, lbl]) =>
    `<div style="background:#fff;padding:10px;text-align:center;flex:1;">` +
    `<div style="font-size:18px;line-height:1.2;">${icon}</div>` +
    `<div style="font-size:15px;font-weight:800;color:#1a3a5c;margin:2px 0;">${val}</div>` +
    `<div style="font-size:10px;color:#888;">${lbl}</div>` +
    `</div>`
  ).join('<div style="width:1px;background:#e0e0e0;"></div>');

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f7f8;color:#1e1e1e;padding-bottom:32px;">

    <div style="background:linear-gradient(135deg,#1a3a5c 0%,#1a6fb8 100%);padding:18px 16px;color:#fff;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:26px;line-height:1;">🏦</span>
        <div>
          <div style="font-size:17px;font-weight:800;letter-spacing:-0.3px;color:#fff;">Your Code Vault</div>
          <div style="font-size:11px;opacity:0.75;margin-top:2px;color:#fff;">Your private code home — safe, local, always yours</div>
        </div>
      </div>
    </div>

    <div style="display:flex;border-bottom:1px solid #ddd;background:#e0e0e0;gap:1px;">
      ${statsCells}
    </div>

    <div style="padding:12px 14px 6px;">
      <input id="vault-search" type="text" placeholder="🔍  Search your saved code..."
        style="width:100%;box-sizing:border-box;padding:9px 12px;border:2px solid #e0e0e0;border-radius:10px;font-size:13px;background:#fff;color:#1e1e1e;font-family:inherit;outline:none;" />
    </div>

    <div style="display:flex;gap:8px;padding:4px 14px 10px;">
      <button data-cmd="chassis.buildFromVault" style="flex:1;padding:9px 8px;background:#1a6fb8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;">🏗️ Build From Vault</button>
      <button data-cmd="chassis.scanVaultCodebase" style="flex:1;padding:9px 8px;background:#fff;color:#1a6fb8;border:2px solid #1a6fb8;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;">📁 Scan Project</button>
    </div>

    <details style="margin:0 14px 12px;background:#fffbea;border:1px solid #f0d060;border-radius:10px;overflow:hidden;">
      <summary style="list-style:none;padding:10px 14px;cursor:pointer;font-size:12px;font-weight:700;color:#7a5c00;user-select:none;">💡 What is a Vault? Tap to learn more</summary>
      <div style="padding:4px 14px 12px;">
        <p style="font-size:12px;color:#555;line-height:1.7;margin:4px 0;">
          <strong>A Vault is like a secure drawer on your own computer.</strong> Every time CHASSIS builds something for you, it automatically saves the best parts — small tools, screen pieces, logic — right here.
        </p>
        <p style="font-size:12px;color:#555;line-height:1.7;margin:0 0 4px;">
          The next time you need something similar, CHASSIS checks your Vault first and reuses what's already there. <strong>Faster builds, lower cost, consistent code.</strong>
        </p>
        <p style="font-size:12px;color:#555;line-height:1.7;margin:0;">
          Your data stays on your own machine. No cloud. No one else can see it.
        </p>
      </div>
    </details>

    <div id="vault-shelves" style="padding:0 14px;">
      ${allItems.length ? shelves : emptyState}
    </div>
    <div id="vault-no-results" style="display:none;text-align:center;padding:32px;color:#888;font-size:13px;">No saved pieces match your search.</div>

  </div>
  `;
}
