// [SCOPE] API Setup provider card renderer — extracted from apiSetupHtml.ts (Rule 9 split)

interface ModelEntry {
  label: string; modelId: string; capability: number; costTier: number;
  contextK: number; outputK: number; roles: string[]; thinking?: boolean;
}

interface ProviderDef {
  id: string; icon: string; name: string; badge: string; badgeColor: string;
  desc: string; abilities: string; costDetails: string; link: string; linkLabel: string;
  val: string; model: string; tier: string; models?: ModelEntry[];
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
      ${buildModelsSection(p.models || [])}
    </div>`;
  }).join('');
}

function buildModelsSection(models: ModelEntry[]): string {
  if (!models || models.length === 0) { return ''; }
  const rows = models.map(m => {
    const thinkingBadge = m.thinking ? '<span style="background:#7c3aed22;color:#a78bfa;border:1px solid #7c3aed44;border-radius:3px;padding:1px 5px;font-size:10px;margin-left:4px;" title="Supports extended chain-of-thought reasoning">🧠 thinking</span>' : '';
    const roleLabels = m.roles.map(r =>
      `<span style="background:#1e3a5f;color:#93c5fd;border-radius:3px;padding:1px 5px;font-size:10px;">${r}</span>`
    ).join(' ');
    const capDots = '●'.repeat(Math.round(m.capability / 2)) + '○'.repeat(5 - Math.round(m.capability / 2));
    const costLabel = m.costTier <= 2 ? '💚 cheap' : m.costTier <= 5 ? '💛 mid' : '🔴 premium';
    return `<tr>
      <td style="padding:4px 6px;font-family:monospace;font-size:11px;color:#e2e8f0;white-space:nowrap;">${m.label}${thinkingBadge}</td>
      <td style="padding:4px 6px;font-size:10px;color:#94a3b8;white-space:nowrap;">${roleLabels}</td>
      <td style="padding:4px 6px;font-size:11px;color:#fbbf24;letter-spacing:1px;" title="Capability ${m.capability}/10">${capDots}</td>
      <td style="padding:4px 6px;font-size:10px;white-space:nowrap;">${costLabel}</td>
      <td style="padding:4px 6px;font-size:10px;color:#94a3b8;white-space:nowrap;">${m.contextK}k ctx / ${m.outputK}k out</td>
    </tr>`;
  }).join('');
  return `
  <details style="margin-top:8px;">
    <summary style="cursor:pointer;font-size:11px;color:#93c5fd;user-select:none;list-style:none;display:flex;align-items:center;gap:4px;">
      <span style="font-size:10px;">▶</span> Available Models (${models.length})
    </summary>
    <div style="margin-top:6px;overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr style="border-bottom:1px solid #334155;">
          <th style="padding:3px 6px;text-align:left;color:#64748b;font-weight:600;">Model</th>
          <th style="padding:3px 6px;text-align:left;color:#64748b;font-weight:600;">Roles</th>
          <th style="padding:3px 6px;text-align:left;color:#64748b;font-weight:600;">Capability</th>
          <th style="padding:3px 6px;text-align:left;color:#64748b;font-weight:600;">Cost</th>
          <th style="padding:3px 6px;text-align:left;color:#64748b;font-weight:600;">Context</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </details>`;
}
