// [SCOPE] CHASSIS Work tab — session controls, start/end forms, action cards

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
    <div class="section-title">Work on This Project</div>
    <div class="cards cols-3">
      ${sessionActive
        ? '<div class="card" data-action="showEndForm"><div class="card-icon">⏹️</div><div class="card-body"><div class="card-title">Done for Now</div><div class="card-desc">Save progress and wrap up.</div></div></div>'
        : '<div class="card" data-action="showStartForm"><div class="card-icon">▶️</div><div class="card-body"><div class="card-title">Start Working</div><div class="card-desc">Name your goal and pick your AI.</div></div></div>'
      }
      <div class="card" data-cmd="chassis.analyzeFile" data-pick="true">
        <div class="card-icon">🔍</div>
        <div class="card-body"><div class="card-title">Check a File</div><div class="card-desc">See current state and planned changes.</div></div>
      </div>
      <div class="card" data-cmd="chassis.reviewFile" data-pick="true">
        <div class="card-icon">💬</div>
        <div class="card-body"><div class="card-title">AI Review</div><div class="card-desc">Get feedback on bugs and suggestions.</div></div>
      </div>
      <div class="card" data-cmd="chassis.restructureFile" data-pick="true">
        <div class="card-icon">✨</div>
        <div class="card-body"><div class="card-title">Clean Up File</div><div class="card-desc">AI adds notes and warnings to code.</div></div>
      </div>
    </div>
    <div class="section-title">Switch Projects</div>
    <div class="cards cols-3">
      <div class="card" data-action="startWizard">
        <div class="card-icon">🚀</div>
        <div class="card-body"><div class="card-title">New Project</div><div class="card-desc">Start a fresh project with CHASSIS.</div></div>
      </div>
      <div class="card" data-action="pickProject">
        <div class="card-icon">📂</div>
        <div class="card-body"><div class="card-title">Open Project</div><div class="card-desc">Switch to a different project folder.</div></div>
      </div>
    </div>`;

  // Start Working inline form (hidden by default)
  html += `
    <div id="start-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 12px 0; font-size:14px;">What are you working on?</h3>
      <input id="start-goal" type="text" placeholder="e.g. Wire WebSocket bridge, Fix auth bug" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
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

  // Done for Now inline form (hidden by default)
  html += `
    <div id="end-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 12px 0; font-size:14px;">What did you get done?</h3>
      <input id="end-completed" type="text" placeholder="e.g. WebSocket bridge connected, mouth sync working" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
      <h3 style="margin:0 0 8px 0; font-size:14px;">Anything still in progress?</h3>
      <input id="end-inprogress" type="text" placeholder="e.g. Eye calibration not finalized" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
      <h3 style="margin:0 0 8px 0; font-size:14px;">Any risks or concerns?</h3>
      <input id="end-risks" type="text" placeholder="e.g. Edge TTS rate limited, model file too large" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
      <h3 style="margin:0 0 8px 0; font-size:14px;">What should you start with next time?</h3>
      <input id="end-nextstart" type="text" placeholder="e.g. Calibrate eye positions, then wire dashboard" style="width:100%; padding:8px; margin-bottom:12px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:13px;" />
      <div style="display:flex; gap:8px;">
        <button id="end-go-btn" style="padding:8px 20px; background:#da3633; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">Wrap It Up</button>
        <button id="end-cancel-btn" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px;">Keep Working</button>
      </div>
    </div>`;

  html += '</div>';
  return html;
}
