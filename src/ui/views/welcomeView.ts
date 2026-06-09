// [SCOPE] Provides UI rendering functions for the initial welcome screen and retrofit pending status.

export function renderNoKeyView(): string {
  return `
    <div style="margin: 12px 4px 16px 4px; padding: 16px; background: rgba(255,165,0,0.08); border: 1px solid rgba(255,165,0,0.3); border-radius: 8px;">
      <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">🔑 Step 1: Add an AI key to get started</div>
      <div style="font-size: 12px; color: var(--vscode-descriptionForeground); line-height: 1.7;">
        Redivivus uses your own AI keys — no markup, no middleman.<br/>
        Pick one free option to start right now:
      </div>
    </div>
    <div class="cards">
      <div class="card primary" data-url="https://aistudio.google.com/apikey">
        <div class="card-icon">✨</div>
        <div class="card-body">
          <div class="card-title">Google Gemini — Free tier</div>
          <div class="card-sub">1,500 requests/day free. No credit card needed. Best way to start.</div>
        </div>
      </div>
      <div class="card" data-url="https://console.anthropic.com/settings/keys">
        <div class="card-icon">🤖</div>
        <div class="card-body">
          <div class="card-title">Anthropic Claude</div>
          <div class="card-sub">The most capable model. ~$5 goes a very long way.</div>
        </div>
      </div>
      <div class="card" data-url="https://platform.openai.com/api-keys">
        <div class="card-icon">⚡</div>
        <div class="card-body">
          <div class="card-title">OpenAI GPT-4o</div>
          <div class="card-sub">Reliable and fast. Pay as you go.</div>
        </div>
      </div>
    </div>
    <div style="margin-top: 16px; padding: 12px; background: rgba(59,157,255,0.06); border: 1px solid rgba(59,157,255,0.2); border-radius: 8px; font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.6;">
      Once you have a key → go to the <strong>Files &amp; AI</strong> tab → paste it in → click Save.<br/>
      Then come back here and start building.
    </div>
    <div style="text-align:center; margin-top:16px;">
      <span data-action="dismissWelcome" style="font-size:11px; color:var(--vscode-descriptionForeground); cursor:pointer; text-decoration:underline; opacity:0.7;">I already have a key saved</span>
    </div>`;
}

export function renderWelcomeView(): string {
  return `
    <div style="margin: 12px 4px 16px 4px; padding: 14px; background: rgba(59,157,255,0.06); border: 1px solid rgba(59,157,255,0.2); border-radius: 8px;">
      <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">👋 Welcome to Redivivus</div>
      <div style="font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.6;">
        Redivivus keeps your AI coding organized. Pick one to get started:
      </div>
    </div>
    <div class="section-title">What would you like to do?</div>
    <div class="cards">
      <div class="card primary" data-action="startWizard">
        <div class="card-icon">🚀</div>
        <div class="card-body">
          <div class="card-title">I'm starting a new project</div>
          <div class="card-sub">Answer 5 quick questions and Redivivus sets everything up for you</div>
        </div>
      </div>
      <div class="card" data-action="pickProject">
        <div class="card-icon">📂</div>
        <div class="card-body">
          <div class="card-title">I have an existing project</div>
          <div class="card-sub">Open a folder you're already working on — Redivivus will pick up from there</div>
        </div>
      </div>
      <div class="card" data-cmd="redivivus.wizardRetrofit">
        <div class="card-icon">🔧</div>
        <div class="card-body">
          <div class="card-title">My code is a mess — help me clean it up</div>
          <div class="card-sub">Redivivus will scan your files and add organization notes your AI can understand</div>
        </div>
      </div>
      <div class="card" data-cmd="redivivus.guide">
        <div class="card-icon">📖</div>
        <div class="card-body">
          <div class="card-title">What is Redivivus? How does it work?</div>
          <div class="card-sub">New here? Read the plain English guide before you start</div>
        </div>
      </div>
    </div>
    <div style="text-align:center; margin-top:20px; padding-top:14px; border-top:1px solid var(--vscode-input-border,#334455);">
      <span data-action="dismissWelcome" style="font-size:11px; color:var(--vscode-descriptionForeground); cursor:pointer; text-decoration:underline; opacity:0.7;">Not now — just let me look around</span>
    </div>`;
}

export function renderRetrofitPendingView(): string {
  return `
    <div class="alert">
      <div class="alert-icon">⏳</div>
      <div class="alert-text">Your project was just restructured. Test your code, then choose below.</div>
    </div>
    <div class="cards cols-2">
      <div class="card" data-cmd="redivivus.confirmRetrofit">
        <div class="card-icon">✅</div>
        <div class="card-body">
          <div class="card-title">Everything Works</div>
          <div class="card-desc">Keep the changes, delete the backup.</div>
        </div>
      </div>
      <div class="card" data-cmd="redivivus.revertRetrofit">
        <div class="card-icon">↩️</div>
        <div class="card-body">
          <div class="card-title">Undo Changes</div>
          <div class="card-desc">Restore original files from backup.</div>
        </div>
      </div>
    </div>`;
}