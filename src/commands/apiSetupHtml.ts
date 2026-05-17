// [SCOPE] CHASSIS API Setup — HTML template for the API key configuration webview panel
// Imported by ApiSetupPanel._getHtml() in apiSetup.ts.

import * as vscode from 'vscode';

export function getApiSetupHtml(): string {
  const config = vscode.workspace.getConfiguration('chassis');
  const geminiKey = config.get<string>('geminiApiKey') || '';
  const claudeKey  = config.get<string>('claudeApiKey') || '';
  const openaiKey  = config.get<string>('openaiApiKey') || '';
  const groqKey    = config.get<string>('groqApiKey') || '';
  const xaiKey     = config.get<string>('xaiApiKey') || '';
  const kimiKey    = config.get<string>('kimiApiKey') || '';

  const mask = (k: string) => k ? '•'.repeat(Math.min(k.length, 20)) : '';
  const st = (k: string) => k ? 'status-ok">&#x2705; Configured' : 'status-missing">&#x274C; Not set';

  const providers = [
    { id: 'gemini', icon: '&#x1F916;', name: 'Gemini (Google)',        badge: 'FREE tier available', badgeColor: '#1a7a3a', desc: 'Fast, free tier available. Recommended for most users -- great starting point.',           link: 'https://aistudio.google.com/apikey',              linkLabel: 'Get free key', val: geminiKey },
    { id: 'claude', icon: '&#x1F9E0;', name: 'Claude (Anthropic)',      badge: 'Paid',                badgeColor: '#b85c00', desc: 'Best for complex reasoning, long documents, and nuanced code review.',                    link: 'https://console.anthropic.com/settings/keys',     linkLabel: 'Get API key', val: claudeKey },
    { id: 'openai', icon: '&#x26A1;',  name: 'OpenAI (GPT-4o)',         badge: 'Paid',                badgeColor: '#b85c00', desc: 'GPT-4o -- strong all-rounder for code, chat, and analysis.',                             link: 'https://platform.openai.com/api-keys',            linkLabel: 'Get API key', val: openaiKey },
    { id: 'groq',   icon: '&#x1F525;', name: 'Groq (Llama / Mixtral)',  badge: 'FREE tier available', badgeColor: '#1a7a3a', desc: 'Extremely fast inference. Free tier available. Great for quick tasks.',                   link: 'https://console.groq.com/keys',                   linkLabel: 'Get free key', val: groqKey },
    { id: 'xai',    icon: '&#x1F680;', name: 'xAI Grok',                badge: 'Paid',                badgeColor: '#b85c00', desc: 'Grok model -- strong reasoning, real-time data awareness.',                              link: 'https://console.x.ai/',                           linkLabel: 'Get API key', val: xaiKey },
    { id: 'kimi',   icon: '&#x1F52E;', name: 'Kimi (Moonshot AI)',       badge: 'Paid',                badgeColor: '#b85c00', desc: 'Moonshot AI -- very large context window, good for big codebases.',                      link: 'https://platform.moonshot.cn/',                   linkLabel: 'Get API key', val: kimiKey },
  ];

  const providerCards = providers.map(p => `
  <div class="provider">
    <div class="provider-header">
      <span class="provider-name">${p.icon} ${p.name} <span style="font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;background:${p.badgeColor}30;color:${p.badgeColor};vertical-align:middle;">${p.badge}</span></span>
      <span class="provider-status ${st(p.val)}</span>
    </div>
    <div class="provider-desc">${p.desc} <a href="${p.link}" style="color:#4a9eff;font-size:11px;">${p.linkLabel}</a></div>
    <input type="password" id="${p.id}-key" placeholder="Enter ${p.name} API key" value="${mask(p.val)}" data-original="${p.val ? 'set' : ''}">
  </div>`).join('');

  return `<!DOCTYPE html><html><head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; max-width: 640px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 8px; font-size:13px; }
    .free-tip { background: rgba(26,122,58,0.12); border:1px solid #1a7a3a50; border-radius:8px; padding:10px 14px; margin-bottom:18px; font-size:12px; color:var(--vscode-foreground); }
    .free-tip strong { color:#4ec959; }
    .provider { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; }
    .provider-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap:wrap; gap:6px; }
    .provider-name { font-weight: 600; font-size: 13px; }
    .provider-status { font-size: 12px; padding: 2px 8px; border-radius: 12px; white-space:nowrap; }
    .status-ok { background: rgba(78,201,89,0.2); color: #4ec959; }
    .status-missing { background: rgba(255,83,79,0.2); color: #ff534f; }
    .provider-desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; line-height:1.5; }
    input { width: 100%; box-sizing:border-box; padding: 7px 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; color: var(--vscode-input-foreground); font-family: monospace; font-size: 12px; }
    input:focus { outline: none; border-color: var(--vscode-focusBorder); }
    .actions { margin-top: 20px; display: flex; gap: 12px; justify-content: center; }
    button { padding: 9px 22px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
    button:hover { opacity:0.85; }
    button.secondary { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .apply-feedback { margin-top:14px; padding:10px 14px; background:rgba(78,201,89,0.1); border-left:3px solid #4ec959; border-radius:0 4px 4px 0; display:none; font-size:13px; }
    .apply-feedback.show { display:block; }
    .tip { margin-top:20px; padding:10px 14px; background:var(--vscode-input-background); border-radius:6px; font-size:11px; color:var(--vscode-descriptionForeground); }
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
    document.getElementById('apply-btn').addEventListener('click', () => {
      const ids = ['gemini','claude','openai','groq','xai','kimi'];
      const payload = { type: 'save-keys' };
      ids.forEach(id => {
        const el = document.getElementById(id + '-key');
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
  <\/script>
</body></html>`;
}
