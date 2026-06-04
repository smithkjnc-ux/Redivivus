// [SCOPE] API Setup provider card renderer — extracted from apiSetupHtml.ts (Rule 9 split)

interface ProviderDef {
  id: string; icon: string; name: string; badge: string; badgeColor: string;
  desc: string; abilities: string; costDetails: string; link: string; linkLabel: string;
  val: string; model: string; tier: string;
}

export function buildProviderCards(
  providers: ProviderDef[],
  disabledProviders: string[],
  roster: { supervisor: string; workers: string[]; guardian: string | null }
): string {
  return providers.map(p => {
    const isKeySet = p.val && p.val.length > 0;
    const isDisabled = disabledProviders.includes(p.id);
    const isActive = isKeySet && !isDisabled && (roster.supervisor === p.id || roster.workers.includes(p.id) || roster.guardian === p.id);

    let statusClass = 'status-missing';
    let statusText = '&#x274C; Not set';
    let toggleBtnHtml = '';
    let rolesHtml = '';

    if (isKeySet) {
      if (isDisabled) {
        statusClass = 'status-disabled';
        statusText = '&#x26A0;&#xFE0F; Disabled';
        toggleBtnHtml = `<button type="button" class="btn-toggle btn-enable" onclick="toggleProvider('${p.id}')">🔓 Enable AI</button>`;
      } else {
        statusClass = 'status-ok';
        statusText = '&#x2705; Configured';
        toggleBtnHtml = `<button type="button" class="btn-toggle btn-disable" onclick="toggleProvider('${p.id}')">🔒 Disable AI</button>`;
        const roles: string[] = [];
        if (roster.supervisor === p.id) {
          // Supervisor and Guardian are always the same AI — show as one combined role
          roles.push('<span class="badge badge-supervisor" title="Plans every build AND reviews the result. Guardian = Supervisor by rule — both require the same depth of reasoning.">&#x1F3AF; Supervisor &amp; Guardian &mdash; plans, delegates, and reviews</span>');
        }
        if (roster.workers.includes(p.id)) { roles.push('<span class="badge badge-worker" title="Executes specific steps assigned by the Supervisor.">&#x2699;&#xFE0F; Worker &mdash; executes Supervisor instructions</span>'); }
        if (roles.length > 0) { rolesHtml = `<div class="provider-roles">${roles.join('')}</div>`; }
      }
    }

    const dotHtml = isActive ? `<span class="active-dot" title="Active Team Member"></span>` : '';

    return `
    <div class="provider ${isDisabled ? 'provider-disabled' : ''} ${isActive ? 'provider-active' : ''}">
      <div class="provider-header">
        <span class="provider-name">${p.icon} ${p.name} <span class="provider-type-badge" style="background:${p.badgeColor}30;color:${p.badgeColor};">${p.badge}</span></span>
        <div style="display:flex;align-items:center;gap:8px;">
          ${dotHtml}
          <span class="provider-status ${statusClass}" id="${p.id}-status">${statusText}</span>
          ${toggleBtnHtml}
        </div>
      </div>
      <div class="provider-desc">
        <div style="margin-bottom: 6px;">${p.desc}</div>
        <div style="margin-bottom: 6px; font-size: 12px; color: #aaa;"><strong>Abilities:</strong> ${p.abilities}</div>
        <div style="margin-bottom: 6px; font-size: 12px; color: #aaa;"><strong>Cost:</strong> ${p.costDetails}</div>
        <div><a href="${p.link}" style="color:#4a9eff;font-size:11px;">${p.linkLabel}</a></div>
      </div>
      <input type="password" id="${p.id}-key" placeholder="Enter ${p.name} API key" value="${p.val ? '•'.repeat(Math.min(p.val.length, 20)) : ''}" data-original="${p.val ? 'set' : ''}" ${isDisabled ? 'disabled' : ''}>
      <div id="${p.id}-err" style="color: #ff534f; font-size: 12px; margin-top: 4px; display: none;"></div>
      ${rolesHtml}
      <div class="provider-meta">
        <span>🤖 Active Model: <code>${p.model}</code></span>
        <span>${p.tier}</span>
      </div>
    </div>`;
  }).join('');
}
