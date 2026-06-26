// [SCOPE] Memory Panel HTML builder — renders global user profile + per-project knowledge.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getActiveProjectRoot } from '../../project/application/activeProjectRoot.js';
import { getMemoryPanelScript } from './memoryPanelHtmlScripts.js';
import { getMemoryPanelStyles } from './memoryPanelHtmlStyles.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function deleteBtn(type: string, extra: string): string {
  return `<button class="del-btn" data-type="${type}" ${extra} title="Remove">✕</button>`;
}

export function getMemoryPanelHtml(): string {
  // --- Global memory ---
  const { loadUserMemory } = require('../../../services/userMemoryService.js') as typeof import('../application/userMemoryService');
  const mem = loadUserMemory();
  const topLangs = Object.entries(mem.stack.languages).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5);

  const styleRows = [
    `<tr><td>Indent</td><td>${esc(mem.style.indent)}</td></tr>`,
    `<tr><td>Quotes</td><td>${esc(mem.style.quotes)}</td></tr>`,
    `<tr><td>Semicolons</td><td>${mem.style.semicolons ? 'Yes' : 'No'}</td></tr>`,
    `<tr><td>Trailing comma</td><td>${mem.style.trailingComma ? 'Yes' : 'No'}</td></tr>`,
  ].join('');

  const stackRows = [
    topLangs.length ? `<tr><td>Languages</td><td>${topLangs.map(([l, c]) => `${esc(l)} <span class="count">(${c} files)</span>`).join(', ')}</td></tr>` : '',
    mem.stack.frameworks.length ? `<tr><td>Frameworks</td><td>${mem.stack.frameworks.map(esc).join(', ')}</td></tr>` : '',
    mem.stack.css ? `<tr><td>CSS</td><td>${esc(mem.stack.css)}</td></tr>` : '',
  ].filter(Boolean).join('');

  const explicitItems = mem.explicit.length
    ? mem.explicit.map((e, i) => `<li class="entry-row">${esc(e)} ${deleteBtn('explicit', `data-index="${i}"`)}</li>`).join('')
    : `<li class="empty-note">None yet — type "remember that X" in the chat, or use the field below.</li>`;

  const statsRows = [
    `<tr><td>Builds</td><td>${mem.stats.totalBuilds}</td></tr>`,
    `<tr><td>Fixes</td><td>${mem.stats.totalFixes}</td></tr>`,
    `<tr><td>First seen</td><td>${mem.stats.firstSeen ? mem.stats.firstSeen.slice(0, 10) : '—'}</td></tr>`,
    `<tr><td>Last seen</td><td>${mem.stats.lastSeen ? mem.stats.lastSeen.slice(0, 10) : '—'}</td></tr>`,
  ].join('');

  // --- Per-project memory ---
  const root = getActiveProjectRoot();
  let projectHtml = '';

  if (!root) {
    projectHtml = `<div class="empty-note" style="padding:16px 0;">No project open — open a Redivivus project to see project memory.</div>`;
  } else {
    const projectName = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, '.redivivus', 'config.json'), 'utf-8')).projectName || path.basename(root); } catch { return path.basename(root); } })();

    let knowledgeEntries: any[] = [];
    try {
      const { readKnowledge } = require('../../../services/learnedMemoryServiceIO.js') as typeof import('../application/learnedMemoryServiceIO');
      knowledgeEntries = readKnowledge(root).entries || [];
    } catch {}

    const permanent = knowledgeEntries.filter((e: any) => e.permanent && e.type !== 'never_do');
    const neverDo = knowledgeEntries.filter((e: any) => e.type === 'never_do');
    const recent = knowledgeEntries.filter((e: any) => !e.permanent);

    const permanentItems = permanent.length
      ? permanent.map((e: any, i: number) => `<li class="entry-row">${esc(e.description)} ${deleteBtn('knowledge', `data-root="${esc(root)}" data-index="${knowledgeEntries.indexOf(e)}"`)}</li>`).join('')
      : `<li class="empty-note">None yet — will be learned from your conversations.</li>`;

    const neverDoItems = neverDo.length
      ? neverDo.map((e: any) => `<li class="entry-row neverdo-row">
          <span class="neverdo-label">DO NOT:</span> ${esc(e.description)}
          ${e.count > 1 ? `<span class="count">[seen ${e.count}×]</span>` : ''}
          ${deleteBtn('knowledge', `data-root="${esc(root)}" data-index="${knowledgeEntries.indexOf(e)}"`)}</li>`).join('')
      : `<li class="empty-note">None recorded yet — the Guardian logs mistakes here automatically.</li>`;

    const recentItems = recent.length
      ? recent.map((e: any) => `<li class="entry-row recent-row">${esc(e.description)} <span class="count">(expires in 30 days)</span></li>`).join('')
      : `<li class="empty-note">Nothing from recent sessions.</li>`;

    const rulesPath = path.join(root, '.redivivus', 'rules.md');
    const rulesContent = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf-8').trim() : '';
    const rulesHtml = rulesContent
      ? `<pre class="rules-block">${esc(rulesContent)}</pre>`
      : `<div class="empty-note">No rules file found at <code>.redivivus/rules.md</code>.</div>`;

    projectHtml = `
      <div class="section">
        <div class="section-header">📁 ${esc(projectName)} — Learned Facts</div>
        <div class="section-sub">Permanent decisions the AI has learned about this project.</div>
        <ul class="entry-list">${permanentItems}</ul>
      </div>
      <div class="section">
        <div class="section-header">🚫 Never-Do Entries</div>
        <div class="section-sub">Approaches the Guardian caught failing in this project. Injected into every fix to prevent repeats.</div>
        <ul class="entry-list">${neverDoItems}</ul>
      </div>
      <div class="section">
        <div class="section-header">🕐 Recent Session Facts
          ${recent.length ? `<button class="secondary-btn" id="clear-recent-btn" data-root="${esc(root)}">Clear all recent</button>` : ''}
        </div>
        <div class="section-sub">Auto-expire after 30 days.</div>
        <ul class="entry-list">${recentItems}</ul>
      </div>
      <div class="section">
        <div class="section-header">📋 Project Rules
          <button class="secondary-btn" id="open-rules-btn" data-path="${esc(rulesPath)}">Open file</button>
        </div>
        <div class="section-sub">Hard rules injected into every AI call for this project. Edit the file directly to change them.</div>
        ${rulesHtml}
      </div>`;
  }

  const SCRIPT = getMemoryPanelScript();
  const STYLES = getMemoryPanelStyles();

  return `<!DOCTYPE html><html><head><style>
    ${STYLES}
  </style></head><body>
  <h1>🧠 Memory</h1>
  <div class="page-sub">Everything Redivivus has learned about you and your projects. Delete anything that's wrong.</div>

  <div class="section">
    <div class="section-header">👤 About You — Code Style</div>
    <div class="section-sub">Detected by passively reading your files. Injected into every AI call (~5 tokens).</div>
    <table>${styleRows}</table>
  </div>

  <div class="section">
    <div class="section-header">🛠 Your Stack</div>
    <div class="section-sub">Languages and frameworks seen across your projects.</div>
    ${stackRows ? `<table>${stackRows}</table>` : '<div class="empty-note">Nothing detected yet.</div>'}
  </div>

  <div class="section">
    <div class="section-header">📌 Your Explicit Preferences</div>
    <div class="section-sub">Things you've told Redivivus to always remember. Injected into every AI call across all projects.</div>
    <ul class="entry-list">${explicitItems}</ul>
    <div class="add-row">
      <input type="text" id="new-pref-input" placeholder="e.g. always add unit tests" />
      <button class="add-btn" id="add-pref-btn">+ Remember this</button>
    </div>
  </div>

  <div class="section">
    <div class="section-header">📊 Your Stats</div>
    <table>${statsRows}</table>
  </div>

  ${projectHtml}

  <script>${SCRIPT}</script>
</body></html>`;
}


