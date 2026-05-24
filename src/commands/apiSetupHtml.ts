// [SCOPE] CHASSIS API Setup — HTML template for the API key configuration webview panel
// Imported by ApiSetupPanel._getHtml() in apiSetup.ts.

import * as vscode from 'vscode';
import { RoutingService } from '../services/ai/routingService.js';
import { API_SETUP_CSS } from './apiSetupStyles.js';
import { buildProviderCards } from './apiSetupHtmlCards.js';

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

  const providers = [
    { id: 'gemini', icon: '🤖', name: 'Gemini (Google)',        badge: 'FREE tier available', badgeColor: '#1a7a3a', 
      desc: 'Recommended for most users. Fast, capable, and extremely generous free tier.', 
      abilities: 'Excels at general coding, high-speed UI generation, and large context windows.', 
      costDetails: 'Free tier: 15 requests/minute. Paid: ~$0.07 per 1M tokens (extremely cheap).',
      link: 'https://aistudio.google.com/apikey',              linkLabel: 'Get free key', val: geminiKey, model: 'gemini-2.5-flash', tier: '🚀 Ultra-Fast (Free / Low Cost)' },
    { id: 'claude', icon: '🧠', name: 'Claude (Anthropic)',      badge: 'Paid',                badgeColor: '#b85c00', 
      desc: 'The industry gold standard for complex coding tasks.', 
      abilities: 'Best-in-class reasoning. Perfect for deep architectural refactoring, subtle bug hunting, and massive codebase analysis.', 
      costDetails: 'No free tier. Paid: $3.00 per 1M input tokens. (Premium pricing).',
      link: 'https://console.anthropic.com/settings/keys',     linkLabel: 'Get API key', val: claudeKey, model: 'claude-3-5-sonnet', tier: '🧠 Deep Reasoning (Premium Paid)' },
    { id: 'openai', icon: '⚡', name: 'OpenAI (GPT-4o)',         badge: 'Paid',                badgeColor: '#b85c00', 
      desc: 'Strong all-rounder for code, chat, and analysis.', 
      abilities: 'Highly reliable and consistent formatting. Excellent at following strict system rules and JSON schema generation.', 
      costDetails: 'No free tier. Paid: $0.150 per 1M input tokens (GPT-4o-mini).',
      link: 'https://platform.openai.com/api-keys',            linkLabel: 'Get API key', val: openaiKey, model: 'gpt-4o-mini', tier: '⚖️ Strong Generalist (Low Cost)' },
    { id: 'groq',   icon: '🔥', name: 'Groq (Llama / Mixtral)',  badge: 'FREE tier available', badgeColor: '#1a7a3a', 
      desc: 'Extremely fast inference powered by LPU hardware.', 
      abilities: 'Near-instant responses. Best used as a secondary "Worker" AI for rapid, small-scope component generation.', 
      costDetails: 'Free tier available with rate limits. Paid: ~$0.59 per 1M tokens.',
      link: 'https://console.groq.com/keys',                   linkLabel: 'Get free key', val: groqKey, model: 'llama-3.3-70b-versatile', tier: '⚡ Sub-second (Free Tier)' },
    { id: 'xai',    icon: '🚀', name: 'xAI Grok',                badge: 'Paid',                badgeColor: '#b85c00', 
      desc: 'Dynamic reasoning model with aggressive inference.', 
      abilities: 'Strong analytical capabilities. Will challenge assumptions and provide alternative architectural viewpoints.', 
      costDetails: 'No free tier. Paid: $2.00 per 1M input tokens.',
      link: 'https://console.x.ai/',                           linkLabel: 'Get API key', val: xaiKey, model: 'grok-2-1212', tier: '💬 Smart & Dynamic (Paid)' },
    { id: 'kimi',   icon: '🔮', name: 'Kimi (Moonshot AI)',       badge: 'Paid',                badgeColor: '#b85c00', 
      desc: 'Specialized in processing massive amounts of context.', 
      abilities: 'Can ingest up to 200k tokens reliably. Ideal for reading entire framework documentation or huge monolithic files.', 
      costDetails: 'No free tier. Paid: ~$0.02 per 1M input tokens.',
      link: 'https://platform.moonshot.cn/',                   linkLabel: 'Get API key', val: kimiKey, model: 'moonshot-v1-32k', tier: '📂 Mass Context (Paid)' },
  ];

  const getRank = (pId: string, val: string) => {
    const isKeySet = val && val.length > 0;
    const isDisabled = disabledProviders.includes(pId);
    if (!isKeySet) {return 6;}
    if (isDisabled) {return 5;}
    if (roster.supervisor === pId) {return 1;}
    if (roster.guardian === pId && roster.guardian !== roster.supervisor) {return 2;}
    if (roster.workers.includes(pId)) {return 3;}
    return 4;
  };

  providers.sort((a, b) => getRank(a.id, a.val) - getRank(b.id, b.val));
  const providerCards = buildProviderCards(providers, disabledProviders, roster);

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
      const btn = document.getElementById('apply-btn');
      btn.innerHTML = '&#8987; Verifying Keys...';
      btn.style.opacity = '0.7';
      btn.style.pointerEvents = 'none';
      
      const ids = ['gemini','claude','openai','groq','xai','kimi'];
      const payload = { type: 'save-keys' };
      ids.forEach(id => {
        document.getElementById(id + '-err').style.display = 'none'; // reset errors
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
        const btn = document.getElementById('apply-btn');
        btn.innerHTML = '&#x2705; Apply Changes';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';

        if (e.data.errors && e.data.errors.length > 0) {
            e.data.errors.forEach(err => {
                const errDiv = document.getElementById(err.id + '-err');
                if (errDiv) {
                    errDiv.textContent = '❌ ' + err.msg;
                    errDiv.style.display = 'block';
                }
                const statusDiv = document.getElementById(err.id + '-status');
                if (statusDiv) {
                    statusDiv.className = 'provider-status status-missing';
                    statusDiv.innerHTML = '❌ Invalid Key';
                }
            });
            const fb = document.getElementById('apply-feedback');
            fb.innerHTML = '&#x26A0;&#xFE0F; <strong>Saved with errors.</strong> Some keys failed validation.<br><span id="apply-time" style="font-size:11px;opacity:0.7;">' + 'Applied at ' + e.data.timestamp + '</span>';
            fb.style.borderLeft = '4px solid #b85c00';
            fb.classList.add('show');
            setTimeout(() => { fb.classList.remove('show'); fb.style.borderLeft = '4px solid #4ec959'; }, 8000);
        } else {
            const fb = document.getElementById('apply-feedback');
            fb.innerHTML = '&#x2705; <strong>Keys verified and applied!</strong> CHASSIS is ready to build.<br><span id="apply-time" style="font-size:11px;opacity:0.7;">' + 'Applied at ' + e.data.timestamp + '</span>';
            fb.classList.add('show');
            setTimeout(() => fb.classList.remove('show'), 5000);
        }
      }
    });
  </script>
</body></html>`;
}
