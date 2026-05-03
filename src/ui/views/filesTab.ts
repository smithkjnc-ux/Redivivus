// [SCOPE] CHASSIS Files & AI tab — project tools, blueprint editor, AI switcher

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function renderFilesTab(
  projectName: string,
  blueprintLocked: boolean,
  hasBlueprint: boolean,
  blueprint: any,
  isActive: boolean,
  aiKeys?: { gemini: boolean; claude: boolean; kimi: boolean }
): string {
  let html = `<div id="tab-files" class="tab-content ${isActive ? 'active' : ''}">`;
  html += `
    <div class="cards cols-2">
      <div class="card" data-cmd="chassis.retrofit">
        <div class="card-icon">🔧</div>
        <div class="card-body"><div class="card-title">Restructure Project</div><div class="card-desc">Clean up all files. Backed up first.</div></div>
      </div>
      <div class="card" data-cmd="chassis.analyze">
        <div class="card-icon">📊</div>
        <div class="card-body"><div class="card-title">Scan Project</div><div class="card-desc">File counts, problems, recommendations.</div></div>
      </div>
      <div class="card" data-action="showSwitchForm">
        <div class="card-icon">🤖</div>
        <div class="card-body"><div class="card-title">Switch AI</div><div class="card-desc">Change which AI does the work.</div></div>
      </div>
      <div class="card" data-action="showApiKeysForm">
        <div class="card-icon">🔑</div>
        <div class="card-body">
          <div class="card-title">API Keys</div>
          <div class="card-desc">${aiKeys ? [aiKeys.gemini?'Gemini ✓':'Gemini —', aiKeys.claude?'Claude ✓':'Claude —', aiKeys.kimi?'Kimi ✓':'Kimi —'].join(' &middot; ') : 'Set your AI keys'}</div>
        </div>
      </div>
      <div class="card" data-action="showBlueprintForm">
        <div class="card-icon">📋</div>
        <div class="card-body"><div class="card-title">Blueprint</div><div class="card-desc">Your project's 5 W's.</div></div>
      </div>
      <div class="card" data-cmd="chassis.log">
        <div class="card-icon">📜</div>
        <div class="card-body"><div class="card-title">Work Log</div><div class="card-desc">Session history and changes.</div></div>
      </div>
      <div class="card" data-cmd="chassis.deadends">
        <div class="card-icon">🚫</div>
        <div class="card-body"><div class="card-title">Dead Ends</div><div class="card-desc">Things that didn't work.</div></div>
      </div>
      <div class="card" data-cmd="chassis.guide">
        <div class="card-icon">📖</div>
        <div class="card-body"><div class="card-title">Help</div><div class="card-desc">How to use CHASSIS.</div></div>
      </div>
    </div>

    <div id="blueprint-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 4px 0; font-size:14px;">Blueprint &mdash; ${esc(projectName || 'Your Project')}</h3>
      <p style="margin:0 0 8px 0; font-size:11px; color:var(--vscode-descriptionForeground);">These answers shape every decision. Be specific.</p>
      ${blueprintLocked ? '<div class="alert" style="background:rgba(78,201,89,0.08); border-color:rgba(78,201,89,0.3); margin-bottom:12px;"><div class="alert-icon">🔒</div><div class="alert-text">This blueprint is locked. No more edits.</div></div>' : hasBlueprint ? '<div class="alert" style="margin-bottom:12px;"><div class="alert-icon">⚠️</div><div class="alert-text">Changing the blueprint mid-project may shift your direction. Be intentional.</div></div>' : ''}
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHO is going to use this?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">Picture the person &mdash; skill level, context.</p>
      <textarea id="bp-who" rows="2" placeholder="e.g. Non-technical users who want to sell locally" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.who || '')}</textarea>
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHAT does it need to do?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">Not the dream list &mdash; the minimum useful thing.</p>
      <textarea id="bp-what" rows="2" placeholder="e.g. Let users post and find local listings via P2P" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.what || '')}</textarea>
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHERE does this live and run?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">This determines your entire tech stack.</p>
      <textarea id="bp-where" rows="2" placeholder="e.g. React Native, Firebase, Android first" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.where || '')}</textarea>
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHEN does this need to work?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">Timeline and responsiveness requirements.</p>
      <textarea id="bp-when" rows="2" placeholder="e.g. MVP in 2 months, real-time messaging" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.when || '')}</textarea>
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">WHY does this need to exist?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">The gut check. If this is weak, know it before coding.</p>
      <textarea id="bp-why" rows="2" placeholder="e.g. No marketplace lets you sell locally without tracking" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.why || '')}</textarea>
      <div style="display:flex; gap:8px; align-items:center;">
        ${blueprintLocked ? '' : '<button id="bp-save-btn" style="padding:8px 20px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">Save Blueprint</button><label style="font-size:12px; cursor:pointer;"><input id="bp-lock" type="checkbox" style="margin-right:4px;" />Lock it (no more edits)</label>'}
        <button id="bp-cancel-btn" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px; margin-left:auto;">${blueprintLocked ? 'Close' : 'Cancel'}</button>
      </div>
    </div>`;

  html += `
    <div id="api-keys-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 4px 0; font-size:14px;">🔑 AI API Keys</h3>
      <p style="margin:0 0 14px 0; font-size:11px; color:var(--vscode-descriptionForeground);">Keys are saved to your editor settings. Never shared or uploaded.</p>

      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">Gemini <span style="font-weight:normal; opacity:0.6;">— <a href="https://aistudio.google.com/apikey" style="color:#4ec959;">Get free key</a></span></label>
      <div style="display:flex; gap:6px; margin-bottom:12px;">
        <input id="key-gemini" type="password" placeholder="AIza..." style="flex:1; padding:7px 10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:monospace;" />
        <button class="api-key-save-btn" data-ai="gemini" style="padding:6px 14px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">Save</button>
        <button class="api-key-clear-btn" data-ai="gemini" style="padding:6px 10px; background:transparent; color:#f85149; border:1px solid #f85149; border-radius:4px; cursor:pointer; font-size:12px;">Clear</button>
      </div>

      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">Claude <span style="font-weight:normal; opacity:0.6;">— <a href="https://console.anthropic.com/settings/keys" style="color:#4ec959;">Get key</a></span></label>
      <div style="display:flex; gap:6px; margin-bottom:12px;">
        <input id="key-claude" type="password" placeholder="sk-ant-..." style="flex:1; padding:7px 10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:monospace;" />
        <button class="api-key-save-btn" data-ai="claude" style="padding:6px 14px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">Save</button>
        <button class="api-key-clear-btn" data-ai="claude" style="padding:6px 10px; background:transparent; color:#f85149; border:1px solid #f85149; border-radius:4px; cursor:pointer; font-size:12px;">Clear</button>
      </div>

      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">Kimi <span style="font-weight:normal; opacity:0.6;">— <a href="https://platform.moonshot.cn/console/api-keys" style="color:#4ec959;">Get key</a></span></label>
      <div style="display:flex; gap:6px; margin-bottom:14px;">
        <input id="key-kimi" type="password" placeholder="sk-..." style="flex:1; padding:7px 10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:monospace;" />
        <button class="api-key-save-btn" data-ai="kimi" style="padding:6px 14px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">Save</button>
        <button class="api-key-clear-btn" data-ai="kimi" style="padding:6px 10px; background:transparent; color:#f85149; border:1px solid #f85149; border-radius:4px; cursor:pointer; font-size:12px;">Clear</button>
      </div>

      <button id="api-keys-close-btn" style="padding:7px 18px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:12px;">Close</button>
    </div>`;

  html += '</div>';
  return html;
}

export function renderSwitchForm(currentAI: string): string {
  return `
    <div id="switch-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 8px 0; font-size:14px;">Pick your AI engine</h3>
      <p style="margin:0 0 12px 0; font-size:12px; color:var(--vscode-descriptionForeground);">Currently using: <strong>${(currentAI || 'gemini').toUpperCase()}</strong></p>
      <div id="switch-picker" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
        <button class="switch-btn" data-ai="gemini" style="padding:8px 14px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">Gemini <span style="opacity:0.5; font-size:10px;">Free, fast</span></button>
        <button class="switch-btn" data-ai="claude" style="padding:8px 14px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">Claude <span style="opacity:0.5; font-size:10px;">Deep reasoning</span></button>
        <button class="switch-btn" data-ai="kimi" style="padding:8px 14px; border-radius:4px; border:1px solid var(--border, #334455); background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); cursor:pointer; font-size:12px;">Kimi <span style="opacity:0.5; font-size:10px;">Bulk annotations</span></button>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="switch-go-btn" style="padding:8px 20px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">Switch</button>
        <button id="switch-cancel-btn" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px;">Cancel</button>
      </div>
    </div>`;
}
