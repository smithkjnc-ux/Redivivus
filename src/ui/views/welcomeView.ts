// [SCOPE] CHASSIS Welcome views — uninitialized dashboard + retrofit pending

export function renderWelcomeView(): string {
  return `
    <div class="section-title">Welcome! What brings you here?</div>
    <div class="cards">
      <div class="card primary" data-action="startWizard">
        <div class="card-icon">🚀</div>
        <div class="card-body">
          <div class="card-title">Start a New Project</div>
          <div class="card-desc">I'll help you set up your project with a simple interview about what you're building.</div>
        </div>
      </div>
      <div class="card" data-action="pickProject">
        <div class="card-icon">📂</div>
        <div class="card-body">
          <div class="card-title">Open Existing Project</div>
          <div class="card-desc">Already have a project? Open its folder and CHASSIS will detect your setup.</div>
        </div>
      </div>
      <div class="card" data-cmd="chassis.wizardRetrofit">
        <div class="card-icon">🔧</div>
        <div class="card-body">
          <div class="card-title">Organize Existing Code</div>
          <div class="card-desc">Got messy code? I'll scan it, show you what needs fixing, and clean it up for you.</div>
        </div>
      </div>
      <div class="card" data-cmd="chassis.guide">
        <div class="card-icon">📖</div>
        <div class="card-body">
          <div class="card-title">What is CHASSIS?</div>
          <div class="card-desc">New here? Learn what this tool does and how it can help you.</div>
        </div>
      </div>
    </div>`;
}

export function renderRetrofitPendingView(): string {
  return `
    <div class="alert">
      <div class="alert-icon">⏳</div>
      <div class="alert-text">Your project was just restructured. Test your code, then choose below.</div>
    </div>
    <div class="cards cols-2">
      <div class="card" data-cmd="chassis.confirmRetrofit">
        <div class="card-icon">✅</div>
        <div class="card-body">
          <div class="card-title">Everything Works</div>
          <div class="card-desc">Keep the changes, delete the backup.</div>
        </div>
      </div>
      <div class="card" data-cmd="chassis.revertRetrofit">
        <div class="card-icon">↩️</div>
        <div class="card-body">
          <div class="card-title">Undo Changes</div>
          <div class="card-desc">Restore original files from backup.</div>
        </div>
      </div>
    </div>`;
}
