// [SCOPE] Vault tab main renderer — renderVaultTab for categories, subcategories, items views
// Called by vaultTab. No scan summary rendering logic here.

import type { VaultService, VaultCategory, VaultItem} from '../../services/vault/vaultService.js';
import { VAULT_CATEGORIES } from '../../services/vault/vaultService.js';
import { getVaultCategoryCounts, esc } from './vaultDataUtils.js';

const CAT_ICONS: Record<string, string> = {
  component: '🧩', utility: '🔧', algorithm: '⚙️', pattern: '🏗️',
  config: '⚙️', api: '🌐', database: '🗄️', auth: '🔐',
  validation: '✅', error: '🚨', testing: '🧪', other: '📦',
};

export function renderVaultTab(
  vaultItems: VaultItem[],
  vaultView: 'categories' | 'subcategories' | 'items' | 'detail',
  vaultCategory: VaultCategory | null,
  vaultGlobal: boolean,
  vaultService: VaultService,
  isActive: boolean,
  vaultSubcategory?: string | null
): string {
  const counts = getVaultCategoryCounts(vaultService);
  const totalAll = vaultService.listItems().length;

  let html = `<div id="tab-vault" class="tab-content ${isActive ? 'active' : ''}">`;

  // Header
  html += `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <div>
        <div class="section-title" style="margin:0;">Code Vault</div>
        <p style="margin:4px 0 0 0; font-size:12px; color:var(--vscode-descriptionForeground);">
          ${totalAll} saved item${totalAll === 1 ? '' : 's'} — reusable across all projects
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="vault-scan-btn" style="padding:6px 12px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">📂 Scan Codebase</button>
        <button id="vault-recategorize-btn" style="padding:6px 12px; background:transparent; color:var(--fg,#e6edf3); border:1px solid var(--border,#334455); border-radius:4px; cursor:pointer; font-size:12px;" title="Use AI to re-assign categories for all items tagged as 'other'">🤖 Fix Categories</button>
        <button id="vault-save-btn" style="padding:6px 12px; background:transparent; color:var(--fg,#e6edf3); border:1px solid var(--border,#334455); border-radius:4px; cursor:pointer; font-size:12px;">💾 Save from Project</button>
      </div>
    </div>`;

  // ── Level 3: Items list ──
  if (vaultView === 'items' && vaultCategory) {
    const breadcrumb = vaultSubcategory
      ? `${CAT_ICONS[vaultCategory] || '📦'} ${vaultCategory} › ${vaultSubcategory}`
      : `${CAT_ICONS[vaultCategory] || '📦'} ${vaultCategory}`;
    const backView = vaultSubcategory ? 'subcategories' : 'categories';
    html += `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <button id="vault-back-btn" data-backview="${backView}" data-category="${vaultCategory}" style="padding:4px 10px; background:transparent; color:var(--fg,#e6edf3); border:1px solid var(--border,#334455); border-radius:4px; cursor:pointer; font-size:12px;">← Back</button>
        <span style="font-size:14px; font-weight:600;">${breadcrumb} — ${vaultItems.length} item${vaultItems.length === 1 ? '' : 's'}</span>
      </div>
      <div class="list">`;
    for (const item of vaultItems) {
      html += `
        <div class="list-item" data-vaultid="${esc(item.id)}" data-vaultglobal="${vaultGlobal}" style="display:flex; justify-content:space-between; align-items:flex-start; cursor:pointer;">
          <div style="flex:1; min-width:0; cursor:inherit;">
            <div style="font-weight:600; font-size:13px; margin-bottom:2px;">${esc(item.name)}</div>
            <div style="font-size:11px; color:var(--vscode-descriptionForeground); line-height:1.4;">${esc(item.sourceFile)}</div>
            <div style="font-size:10px; color:var(--vscode-descriptionForeground); margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">
              <span>${esc(item.language)}</span>
              <span>•</span>
              <span>${esc(item.category)}${item.tags.length > 1 ? ` › ${esc(item.tags.slice(1).join(', '))}` : ''}</span>
            </div>
          </div>
          <div style="display:flex; gap:4px; flex-shrink:0; margin-left:8px;">
            <button class="vault-open-btn" data-itemid="${esc(item.id)}" data-global="${vaultGlobal}" style="padding:4px 10px; background:#1f6feb; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Open</button>
            <button class="vault-import-btn" data-itemid="${esc(item.id)}" data-global="${vaultGlobal}" style="padding:4px 10px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">Import</button>
            <button class="vault-delete-btn" data-itemid="${esc(item.id)}" data-global="${vaultGlobal}" style="padding:4px 8px; background:transparent; color:#f85149; border:1px solid #f85149; border-radius:4px; cursor:pointer; font-size:11px;">×</button>
          </div>
        </div>`;
    }
    if (vaultItems.length === 0) {
      html += `<div style="padding:24px; text-align:center; color:var(--vscode-descriptionForeground); font-size:13px;">No items in this area yet.</div>`;
    }
    html += '</div>';

  // ── Level 2: Subcategory grid ──
  } else if (vaultView === 'subcategories' && vaultCategory) {
    const subcats = vaultService.getCategories().filter(c => c.name === vaultCategory);
    const catCount = counts[vaultCategory] || 0;
    html += `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <button id="vault-back-btn" data-backview="categories" data-category="" style="padding:4px 10px; background:transparent; color:var(--fg,#e6edf3); border:1px solid var(--border,#334455); border-radius:4px; cursor:pointer; font-size:12px;">← Back</button>
        <span style="font-size:14px; font-weight:600;">${CAT_ICONS[vaultCategory] || '📦'} ${vaultCategory}</span>
        <span style="font-size:11px; color:var(--vscode-descriptionForeground);">${catCount} item${catCount === 1 ? '' : 's'}</span>
      </div>`;
    html += '<div class="cards cols-3">';
    for (const sub of subcats) {
      html += `
        <div class="card vault-subcat-card" data-category="${vaultCategory}" data-subcategory="${esc(sub.name)}" style="cursor:pointer;">
          <div class="card-icon">🗂️</div>
          <div class="card-body">
            <div class="card-title">${esc(sub.name)}</div>
            <div class="card-desc">(${sub.count})</div>
          </div>
        </div>`;
    }
    // "All" tile to see everything in this category without subcategory filter
    html += `
        <div class="card vault-subcat-card" data-category="${vaultCategory}" data-subcategory="" style="cursor:pointer; opacity:0.8;">
          <div class="card-icon">📋</div>
          <div class="card-body">
            <div class="card-title">All ${vaultCategory}</div>
            <div class="card-desc">(${catCount})</div>
          </div>
        </div>`;
    html += '</div>';

  // ── Level 1: Category grid ──
  } else {
    html += '<div class="cards cols-3">';
    for (const cat of VAULT_CATEGORIES) {
      const count = counts[cat] || 0;
      html += `
        <div class="card vault-cat-card" data-category="${cat}" style="${count === 0 ? 'opacity:0.4;' : 'cursor:pointer;'}">
          <div class="card-icon">${CAT_ICONS[cat] || '📦'}</div>
          <div class="card-body">
            <div class="card-title">${cat}</div>
            <div class="card-desc">(${count})</div>
          </div>
        </div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}
