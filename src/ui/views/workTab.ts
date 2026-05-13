// [SCOPE] CHASSIS Work tab — session controls, start/end forms, action cards

// [WARN] HTML generation via string concatenation is fragile and hard to maintain. Consider using a templating engine or a UI framework for better maintainability and error handling.
export function renderWorkTab(
  sessionActive: boolean,
  session: any,
  hasBlueprint: boolean,
  isActive: boolean
): string {
  let html = `<div id="tab-work" class="tab-content ${isActive ? 'active' : ''}">`;

  if (sessionActive) {
    html += `
      <div class="session-bar">
        <span class="pulse-dot"></span>
        <span>Working: <strong>${session?.goal || ''}</strong> (${session?.ai || ''})</span>
      </div>`;
  }

  html += `
    <div class="section-title">Your Session</div>
    <div class="cards">
      ${sessionActive
        ? '<div class="card primary" data-action="showEndForm"><div class="card-icon">⏹️</div><div class="card-body"><div class="card-title">Done for Now</div><div class="card-sub">Save your progress and wrap up this session</div></div></div>'
        : '<div class="card primary" data-action="showStartForm"><div class="card-icon">▶️</div><div class="card-body"><div class="card-title">Start Working</div><div class="card-sub">Tell CHASSIS what you\'re doing today</div></div></div>'
      }
    </div>
    <div class="section-title">Tools</div>
    <div class="cards">
      <div class="card" data-cmd="chassis.checkFileHealth" data-pick="true">
        <span class="icon">�</span>
        <div class="card-title">Check File Health</div>
        <div class="card-desc">Count tags, show health report</div>
      </div>
      <div class="card" data-cmd="chassis.cleanUpFile" data-pick="true">
        <div class="card-icon">✨</div><div class="card-body"><div class="card-title">Clean Up File</div><div class="card-sub">Add organization notes to a messy file</div></div>
      </div>
      <div class="card" data-cmd="chassis.buildFromVault">
        <div class="card-icon">🏗️</div><div class="card-body"><div class="card-title">Build from Vault</div><div class="card-sub">Reuse saved code snippets in this project</div></div>
      </div>
    </div>
    <div class="section-title">Projects</div>
    <div class="cards">
      <div class="card" data-action="startWizard">
        <div class="card-icon">🚀</div><div class="card-body"><div class="card-title">New Project</div><div class="card-sub">Set up a brand new project with CHASSIS</div></div>
      </div>
      <div class="card" data-action="pickProject">
        <div class="card-icon">📂</div><div class="card-body"><div class="card-title">Open Project</div><div class="card-sub">Switch to a different folder or project</div></div>
      </div>
    </div>`;

  // [WARN] Extensive inline styling makes this form fragile and hard to maintain.
  // Start Working inline form (hidden by default)
  html += `
    <div id="start-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 12px 0; font-size:14px;">What are you working on?</h3>
      <input id="start-goal" type="text" placeholder="e.g. Build the login screen, Fix the save button" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
      <h3 style="margin:0 0 8px 0; font-size:14px;">Which AI are you using?</h3>
      <div id="ai-picker" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
        <button class="ai-btn" data-ai="Claude" style="padding:6px 12px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">Claude</button>
        <button class="ai-btn" data-ai="Gemini" style="padding:6px 12px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">Gemini</button>
        <button class="ai-btn" data-ai="DeepSeek" style="padding:6px 12px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">DeepSeek</button>
        <button class="ai-btn" data-ai="Llama" style="padding:6px 12px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">Llama</button>
        <button class="ai-btn" data-ai="Windsurf" style="padding:6px 12px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">Windsurf</button>
        <button class="ai-btn" data-ai="Cursor" style="padding:6px 12px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">Cursor</button>
        <button class="ai-btn" data-ai="Manual" style="padding:6px 12px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">Manual</button>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="start-go-btn" style="padding:8px 20px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">Let's Go</button>
        <button id="start-cancel-btn" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px;">Cancel</button>
      </div>
    </div>`;

  // [WARN] Extensive inline styling makes this form fragile and hard to maintain.
  // Done for Now inline form (hidden by default)
  html += `
    <div id="end-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 4px 0; font-size:14px;">What did you finish today?</h3>
      <p style="margin:0 0 8px 0; font-size:11px; color:var(--vscode-descriptionForeground);">Even small wins count — "got the button working" is a finish.</p>
      <input id="end-completed" type="text" placeholder="e.g. Main menu is working — or — Fixed the score display" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
      <h3 style="margin:0 0 4px 0; font-size:14px;">Anything still in progress?</h3>
      <p style="margin:0 0 8px 0; font-size:11px; color:var(--vscode-descriptionForeground);">Things you started but didn't finish yet.</p>
      <input id="end-inprogress" type="text" placeholder="e.g. Game over screen is half built — or — Nothing, all done!" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
      <h3 style="margin:0 0 4px 0; font-size:14px;">Anything broken or worrying?</h3>
      <p style="margin:0 0 8px 0; font-size:11px; color:var(--vscode-descriptionForeground);">No worries? Leave it blank. Honest notes here save headaches later.</p>
      <input id="end-risks" type="text" placeholder="e.g. Saving doesn't work yet — or — Crashes if you click too fast" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
      <h3 style="margin:0 0 4px 0; font-size:14px;">What will you start with next time?</h3>
      <p style="margin:0 0 8px 0; font-size:11px; color:var(--vscode-descriptionForeground);">Your future self will thank you for this one.</p>
      <input id="end-nextstart" type="text" placeholder="e.g. Finish the game over screen — or — Add sound effects" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
      <div style="display:flex; gap:8px;">
        <button id="end-go-btn" style="padding:8px 20px; background:#da3633; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">Wrap It Up</button>
        <button id="end-cancel-btn" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px;">Keep Working</button>
      </div>
    </div>`;

  html += '</div>';
  return html;
}