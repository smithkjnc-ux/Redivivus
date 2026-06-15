// [SCOPE] Redivivus API Setup — HTML template for the API key configuration webview panel
// Imported by ApiSetupPanel._getHtml() in apiSetup.ts.

import * as vscode from 'vscode';
import { RoutingService } from '../services/ai/routingService.js';
import { API_SETUP_CSS } from './apiSetupStyles.js';
import { buildProviderCards } from './apiSetupHtmlCards.js';
import { API_SETUP_SCRIPT } from './apiSetupScript.js';

export function getApiSetupHtml(): string {
  const { getKeyCached } = require('../services/ai/secretKeyStore.js') as typeof import('../services/ai/secretKeyStore.js');
  const config = vscode.workspace.getConfiguration('redivivus');
  const [geminiKey, claudeKey, openaiKey, groqKey, xaiKey, kimiKey, deepseekKey] =
    ['gemini', 'claude', 'openai', 'groq', 'xai', 'kimi', 'deepseek'].map(p => getKeyCached(p) || '');

  const disabledProviders = config.get<string[]>('disabledProviders') || [];
  const routing = new RoutingService();
  const roster = routing.buildRoster();

  const providers = [
    { id: 'gemini', icon: '🤖', name: 'Gemini (Google)',        badge: 'FREE tier available', badgeColor: '#1a7a3a',
      desc: 'Recommended for most users. Fast, capable, and extremely generous free tier.',
      abilities: 'Excels at general coding, high-speed UI generation, and large context windows.',
      costDetails: 'Free tier: 15 requests/minute. Paid: ~$1.25 per 1M tokens. As Supervisor, uses gemini-2.5-pro.',
      link: 'https://aistudio.google.com/apikey',              linkLabel: 'Get free key', val: geminiKey, model: 'gemini-2.5-pro', tier: '🚀 Fast + Capable (Free / Low Cost)' },
    { id: 'claude', icon: '🧠', name: 'Claude (Anthropic)',      badge: 'Paid',                badgeColor: '#b85c00',
      desc: 'The industry gold standard for complex coding tasks.',
      abilities: 'Best-in-class reasoning. Perfect for deep architectural refactoring, subtle bug hunting, and massive codebase analysis.',
      costDetails: 'No free tier. Paid: ~$3.00 per 1M input tokens (Sonnet). As Supervisor, uses claude-sonnet-4-6.',
      link: 'https://console.anthropic.com/settings/keys',     linkLabel: 'Get API key', val: claudeKey, model: 'claude-sonnet-4-6', tier: '🧠 Deep Reasoning (Premium Paid)' },
    { id: 'openai', icon: '⚡', name: 'OpenAI (GPT-4o)',         badge: 'Paid',                badgeColor: '#b85c00',
      desc: 'Strong all-rounder for code, chat, and analysis.',
      abilities: 'Highly reliable and consistent formatting. Excellent at following strict system rules and JSON schema generation.',
      costDetails: 'No free tier. Paid: ~$2.50 per 1M input tokens (GPT-4o). As Supervisor, uses gpt-4o.',
      link: 'https://platform.openai.com/api-keys',            linkLabel: 'Get API key', val: openaiKey, model: 'gpt-4o', tier: '⚖️ Strong Generalist (Paid)' },
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
    { id: 'deepseek', icon: '🐋', name: 'DeepSeek',              badge: 'LOW COST',            badgeColor: '#1a7a3a',
      desc: 'Strong reasoning at a fraction of the cost of premium models.',
      abilities: 'DeepSeek R1 is a powerful chain-of-thought reasoner for math, algorithms, and step-by-step logic. DeepSeek V3 handles fast general coding.',
      costDetails: 'No free tier, but very cheap. Paid: ~$0.14-$0.55 per 1M input tokens. As Supervisor, uses deepseek-reasoner (R1).',
      link: 'https://platform.deepseek.com/api_keys',          linkLabel: 'Get API key', val: deepseekKey, model: 'deepseek-reasoner', tier: '🐋 Deep Reasoning (Low Cost)' },
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
  <h1>&#x1F510; Redivivus API Setup</h1>
  <div class="subtitle">Configure your AI provider API keys -- you only need ONE to get started.</div>
  <div class="free-tip">&#x1F4A1; <strong>Free options:</strong> Gemini (Google) and Groq both have free tiers -- no credit card needed. Start with either one and add others later.</div>

  <div class="how-it-works">
    <div class="how-header">&#x1F3AF; How Redivivus uses your AI keys</div>
    <div class="how-grid">
      <div class="how-item">
        <div class="how-role">&#x1F3AF; Supervisor</div>
        <div class="how-desc">Your <strong>highest-ranked available AI</strong> is always the Supervisor. It plans every build, writes the implementation contract, and reviews the result. Always uses the most capable model from that provider -- never the cheap/fast one.</div>
      </div>
      <div class="how-item">
        <div class="how-role">&#x2699;&#xFE0F; Worker</div>
        <div class="how-desc">When you have 2+ AIs configured, the Supervisor delegates build steps to Workers. Each Worker executes exactly what the Supervisor specifies -- no interpretation, no shortcuts.</div>
      </div>
      <div class="how-item">
        <div class="how-role">&#x1F6E1;&#xFE0F; Guardian = Supervisor</div>
        <div class="how-desc">The Guardian is <strong>always the same AI as the Supervisor</strong> &mdash; no exceptions. Both roles require the same depth of reasoning. A weaker Guardian would miss what the Supervisor intended.</div>
      </div>
    </div>

    <div class="quality-box">
      <div class="quality-header">&#x1F4C8; Your AI is your build quality ceiling</div>
      <div class="quality-body">
        The Supervisor AI determines how deeply a project is planned, how well edge cases are anticipated, and how architecturally sound the output is. <strong>A better Supervisor produces fundamentally better builds</strong> -- not just stylistically different ones.<br><br>
        <div class="quality-tiers">
          <div class="quality-tier tier-top">
            <span class="tier-label">&#x1F947; Best results</span>
            <span class="tier-models">Claude (Sonnet 4.6) &mdash; Most thorough planning, strongest architectural reasoning, best at multi-file coordination and catching subtle bugs.</span>
          </div>
          <div class="quality-tier tier-mid">
            <span class="tier-label">&#x1F948; Great results</span>
            <span class="tier-models">Gemini (2.5 Pro) &mdash; Excellent broad capability, massive context window, best value. OpenAI (GPT-4o) &mdash; Reliable, consistent, strong at structured tasks.</span>
          </div>
          <div class="quality-tier tier-base">
            <span class="tier-label">&#x1F949; Good results</span>
            <span class="tier-models">Groq (Llama 3.3) &mdash; Fastest inference, solid for simple and mid-complexity builds. Less consistent on complex multi-file architecture.</span>
          </div>
        </div>
        <div class="quality-note">
          &#x1F4A1; <strong>This is Bring Your Own AI.</strong> Your AI choice shapes what you build, how it&apos;s structured, and how far you can push it. Users with different AI keys will build the same thing differently. That&apos;s not a bug -- it&apos;s the point.
        </div>
      </div>
    </div>

    <div class="how-rank">
      <strong>Supervisor priority order (automatic):</strong> Claude &gt; Gemini &gt; OpenAI &gt; xAI &gt; Kimi &gt; Groq
    </div>
  </div>

  ${providerCards}
  <div class="actions">
    <button id="apply-btn">&#x2705; Apply Changes</button>
    <button id="test-all-btn" class="secondary">&#x1F50D; Test All Keys</button>
    <button id="export-all-btn" class="secondary">&#x1F510; Export Keys (encrypted)</button>
    <button id="import-keys-btn" class="secondary">&#x1F4E5; Import Keys</button>
    <button id="vscode-settings-btn" class="secondary">&#x2699;&#xFE0F; Open VS Code Settings</button>
  </div>
  <div id="apply-feedback" class="apply-feedback">
    &#x2705; <strong>Keys applied!</strong> Redivivus will use your configured provider automatically.<br>
    <span id="apply-time" style="font-size:11px;opacity:0.7;"></span>
  </div>
  <div id="test-feedback" class="test-feedback" style="display:none;">
    <div id="test-results"></div>
  </div>
  <div class="tip">
    &#x1F4A1; You can also set keys via environment variables: <code>GEMINI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GROQ_API_KEY</code>, <code>XAI_API_KEY</code>, <code>MOONSHOT_API_KEY</code>
  </div>
  <script>${API_SETUP_SCRIPT}</script>
</body></html>`;
}
