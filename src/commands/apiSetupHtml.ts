// [SCOPE] CHASSIS API Setup — HTML template for the API key configuration webview panel
// Imported by ApiSetupPanel._getHtml() in apiSetup.ts.

import * as vscode from 'vscode';
import { RoutingService } from '../services/ai/routingService.js';
import { API_SETUP_CSS } from './apiSetupStyles.js';

export function getApiSetupHtml(): string {
  const config = vscode.workspace.getConfiguration('chassis');
  const geminiKey = config.get<string>('geminiApiKey') || '';
  const claudeKey  = config.get<string>('claudeApiKey') || '';
  const openaiKey  = config.get<string>('openaiApiKey') || '';
  const groqKey    = config.get<string>('groqApiKey') || '';
  const xaiKey     = config.get<string>('xaiApiKey') || '';
  const kimiKey    = config.get<string>('kimiApiKey') || '';

  const disabledProviders = config.get<string[]>('disabledProviders') || [];
  const routing = new RoutingService();
  const roster = routing.buildRoster();

  const mask = (k: string) => k ? '•'.repeat(Math.min(k.length, 20)) : '';

  const providers = [
    { id: 'gemini', icon: '🤖', name: 'Gemini (Google)',        badge: 'FREE tier available', badgeColor: '#1a7a3a', desc: 'Fast, free tier available. Recommended for most users -- great starting point.',           link: 'https://aistudio.google.com/apikey',              linkLabel: 'Get free key', val: geminiKey, model: 'gemini-2.5-flash', tier: '🚀 Ultra-Fast (Free / Low Cost)' },
    { id: 'claude', icon: '🧠', name: 'Claude (Anthropic)',      badge: 'Paid',                badgeColor: '#b85c00', desc: 'Best for complex reasoning, long documents, and nuanced code review.',                    link: 'https://console.anthropic.com/settings/keys',     linkLabel: 'Get API key', val: claudeKey, model: 'claude-3-5-sonnet', tier: '🧠 Deep Reasoning (Premium Paid)' },
    { id: 'openai', icon: '⚡', name: 'OpenAI (GPT-4o)',         badge: 'Paid',                badgeColor: '#b85c00', desc: 'GPT-4o -- strong all-rounder for code, chat, and analysis.',                             link: 'https://platform.openai.com/api-keys',            linkLabel: 'Get API key', val: openaiKey, model: 'gpt-4o-mini', tier: '⚖️ Strong Generalist (Low Cost)' },
    { id: 'groq',   icon: '🔥', name: 'Groq (Llama / Mixtral)',  badge: 'FREE tier available', badgeColor: '#1a7a3a', desc: 'Extremely fast inference. Free tier available. Great for quick tasks.',                   link: 'https://console.groq.com/keys',                   linkLabel: 'Get free key', val: groqKey, model: 'llama-3.3-70b-versatile', tier: '⚡ Sub-second (Free Tier)' },
    { id: 'xai',    icon: '🚀', name: 'xAI Grok',                badge: 'Paid',                badgeColor: '#b85c00', desc: 'Grok model -- strong reasoning, real-time data awareness.',                              link: 'https://console.x.ai/',                           linkLabel: 'Get API key', val: xaiKey, model: 'grok-2-1212', tier: '💬 Smart & Dynamic (Paid)' },
    { id: 'kimi',   icon: '🔮', name: 'Kimi (Moonshot AI)',       badge: 'Paid',                badgeColor: '#b85c00', desc: 'Moonshot AI -- very large context window, good for big codebases.',                      link: 'https://platform.moonshot.cn/',                   linkLabel: 'Get API key', val: kimiKey, model: 'moonshot-v1-32k', tier: '📂 Mass Context (Paid)' },
  ];

  const getRank = (pId: string, val: string) => {
    const isKeySet = val && val.length > 0;
    const isDisabled = disabledProviders.includes(pId);
    if (!isKeySet) return 6;
    if (isDisabled) return 5;
    if (roster.supervisor === pId) return 1;
    if (roster.guardian === pId && roster.guardian !== roster.supervisor) return 2;
    if (roster.workers.includes(pId)) return 3;
    return 4;
  };

  providers.sort((a, b) => getRank(a.id, a.val) - getRank(b.id, b.val));

  const providerCards = providers.map(p => {
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

        // Compute current team roles
        const roles: string[] = [];
        if (roster.supervisor === p.id) {
          roles.push('<span class="badge badge-supervisor">🎯 Supervisor</span>');
        }
        if (roster.workers.includes(p.id)) {
          roles.push('<span class="badge badge-worker">⚙️ Worker</span>');
        }
        if (roster.guardian === p.id && roster.guardian !== roster.supervisor) {
          roles.push('<span class="badge badge-guardian">🛡️ Guardian</span>');
        }
        if (roles.length > 0) {
          rolesHtml = `<div class="provider-roles">${roles.join('')}</div>`;
        }
      }
    }

    const dotHtml = isActive ? `<span class="active-dot" title="Active Team Member"></span>` : '';

    return `
    <div class="provider ${isDisabled ? 'provider-disabled' : ''} ${isActive ? 'provider-active' : ''}">
      <div class="provider-header">
        <span class="provider-name">${p.icon} ${p.name} <span class="provider-type-badge" style="background:${p.badgeColor}30;color:${p.badgeColor};">${p.badge}</span></span>
        <div style="display:flex;align-items:center;gap:8px;">
          ${dotHtml}
          <span class="provider-status ${statusClass}">${statusText}</span>
          ${toggleBtnHtml}
        </div>
      </div>
      <div class="provider-desc">${p.desc} <a href="${p.link}" style="color:#4a9eff;font-size:11px;">${p.linkLabel}</a></div>
      <input type="password" id="${p.id}-key" placeholder="Enter ${p.name} API key" value="${mask(p.val)}" data-original="${p.val ? 'set' : ''}" ${isDisabled ? 'disabled' : ''}>
      ${rolesHtml}
      <div class="provider-meta">
        <span>🤖 Active Model: <code>${p.model}</code></span>
        <span>${p.tier}</span>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head>
  <style>
    ${API_SETUP_CSS}
  </style></head><body>
  <h1>&#x1F510; CHASSIS API Setup</h1>
  <div class="subtitle">Configure your AI provider API keys -- you only need ONE to get started.</div>
  <div class="free-tip">&#x1F4A1; <strong>Free options:</strong> Gemini (Google) and Groq both have free tiers -- no credit card needed. Start with either one and add others later.</div>
  ${providerCards}
  <div class="actions">
    <button id="apply-btn">&#x2705; Apply Changes</button>
    <button id="vscode-settings-btn" class="secondary">&#x2699;&#xFE0F; Open VS Code Settings</button>
  </div>
  <div id="apply-feedback" class="apply-feedback">
    &#x2705; <strong>Keys applied!</strong> CHASSIS will use your configured provider automatically.<br>
    <span id="apply-time" style="font-size:11px;opacity:0.7;"></span>
  </div>
  <div class="tip">
    &#x1F4A1; You can also set keys via environment variables: <code>GEMINI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GROQ_API_KEY</code>, <code>XAI_API_KEY</code>, <code>MOONSHOT_API_KEY</code>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    
    function toggleProvider(id) {
      vscode.postMessage({ type: 'toggle-provider', providerId: id });
    }

    document.getElementById('apply-btn').addEventListener('click', () => {
      const ids = ['gemini','claude','openai','groq','xai','kimi'];
      const payload = { type: 'save-keys' };
      ids.forEach(id => {
        const el = document.getElementById(id + '-key');
        if (!el) return;
        const v = el.value;
        payload[id + 'Key'] = (v.includes('•') && el.dataset.original === 'set') ? undefined : v;
      });
      vscode.postMessage(payload);
    });

    document.getElementById('vscode-settings-btn').addEventListener('click', () => { vscode.postMessage({ type: 'open-vscode-settings' }); });
    
    window.addEventListener('message', e => {
      if (e.data.type === 'saved') {
        const fb = document.getElementById('apply-feedback');
        document.getElementById('apply-time').textContent = 'Applied at ' + e.data.timestamp;
        fb.classList.add('show');
        setTimeout(() => fb.classList.remove('show'), 5000);
      }
    });
  </script>
</body></html>`;
}
