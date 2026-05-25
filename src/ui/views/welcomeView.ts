// [SCOPE] Provides UI rendering functions for the initial welcome screen and retrofit pending status.

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