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
  aiKeys?: { gemini: boolean; claude: boolean; openai: boolean; groq: boolean; xai: boolean; kimi: boolean }
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
          <div class="card-desc">${aiKeys ? [aiKeys.gemini?'Gemini ✓':'', aiKeys.claude?'Claude ✓':'', aiKeys.openai?'OpenAI ✓':'', aiKeys.groq?'Groq ✓':'', aiKeys.xai?'Grok ✓':'', aiKeys.kimi?'Kimi ✓':''].filter(Boolean).join(' · ') || 'No keys set' : 'Set your AI keys'}</div>
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
      <p style="margin:0 0 14px 0; font-size:11px; color:var(--vscode-descriptionForeground);">Keys are saved to your editor settings and never shared. Set one or more — CHASSIS will fall back automatically.</p>

      ${keyRow('gemini', 'Gemini 2.5 Flash', 'Free', 'AIza...', 'https://aistudio.google.com/apikey', aiKeys?.gemini)}
      ${keyRow('groq',   'Groq (Llama 3)',    'Free', 'gsk_...', 'https://console.groq.com/keys', aiKeys?.groq)}
      ${keyRow('claude', 'Claude 3.5 Haiku',  'Paid', 'sk-ant-...', 'https://console.anthropic.com/settings/keys', aiKeys?.claude)}
      ${keyRow('openai', 'OpenAI GPT-4o Mini','Paid', 'sk-...', 'https://platform.openai.com/api-keys', aiKeys?.openai)}
      ${keyRow('xai',    'xAI Grok 3 Mini',   'Paid', 'xai-...', 'https://console.x.ai', aiKeys?.xai)}
      ${keyRow('kimi',   'Moonshot Kimi',      'Paid', 'sk-...', 'https://platform.moonshot.cn/console/api-keys', aiKeys?.kimi)}

      <button id="api-keys-close-btn" style="padding:7px 18px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:12px; margin-top:4px;">Close</button>
    </div>`;

  function keyRow(id: string, label: string, tier: string, placeholder: string, link: string, hasKey?: boolean): string {
    const isFree = tier === 'Free';
    const tierBg    = isFree ? '#1a3a1a' : '#3a2a0a';
    const tierColor = isFree ? '#4ec959' : '#f5a623';
    const tierIcon  = isFree ? '🟢' : '🟡';
    const tierNote  = isFree ? 'FREE — no credit card needed' : 'PAID — requires billing account';
    const borderColor = hasKey ? '#4ec959' : 'var(--border,#334455)';
    return `
      <div style="margin-bottom:14px; padding:12px; background:var(--input-bg,#0d1117); border-radius:6px; border:1px solid ${borderColor};">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:13px; font-weight:bold;">${label}</span>
            ${hasKey ? '<span style="background:#1a3a1a; color:#4ec959; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:bold;">✓ Connected</span>' : ''}
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="background:${tierBg}; color:${tierColor}; padding:3px 10px; border-radius:10px; font-size:11px; font-weight:bold;">${tierIcon} ${tierNote}</span>
            <a class="ai-key-link" data-url="${link}" href="#" style="padding:4px 10px; background:#1f6feb; color:#fff; border-radius:4px; font-size:11px; font-weight:bold; text-decoration:none; white-space:nowrap;">🔗 Sign up / Get key</a>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <input id="key-${id}" type="password" placeholder="${placeholder}" style="flex:1; padding:7px 10px; background:var(--card-bg,#1e293b); color:var(--fg,#e6edf3); border:1px solid var(--border,#334455); border-radius:4px; font-size:12px; font-family:monospace;" />
          <button class="api-key-save-btn" data-ai="${id}" style="padding:6px 16px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">Save</button>
          ${hasKey ? `<button class="api-key-clear-btn" data-ai="${id}" style="padding:6px 10px; background:transparent; color:#f85149; border:1px solid #f85149; border-radius:4px; cursor:pointer; font-size:12px;">Remove</button>` : ''}
        </div>
        ${!hasKey ? `<p style="margin:6px 0 0 0; font-size:10px; color:var(--vscode-descriptionForeground);">Paste your API key above and click Save. Your key stays on this computer only.</p>` : ''}
      </div>`;
  }

  html += '</div>';
  return html;
}

export function renderSwitchForm(currentAI: string): string {
  return `
    <div id="switch-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 8px 0; font-size:14px;">Pick your AI engine</h3>
      <p style="margin:0 0 12px 0; font-size:12px; color:var(--vscode-descriptionForeground);">Currently using: <strong>${(currentAI || 'gemini').toUpperCase()}</strong></p>
      <div id="switch-picker" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
        <button class="switch-btn" data-ai="gemini" style="padding:8px 14px; border-radius:4px; border:1px solid var(--border,#334455); background:var(--input-bg,#0d1117); color:var(--fg,#e6edf3); cursor:pointer; font-size:12px;">Gemini 2.5 Flash <span style="opacity:0.5; font-size:10px;">Free</span></button>
        <button class="switch-btn" data-ai="groq" style="padding:8px 14px; border-radius:4px; border:1px solid var(--border,#334455); background:var(--input-bg,#0d1117); color:var(--fg,#e6edf3); cursor:pointer; font-size:12px;">Groq Llama 3 <span style="opacity:0.5; font-size:10px;">Free</span></button>
        <button class="switch-btn" data-ai="claude" style="padding:8px 14px; border-radius:4px; border:1px solid var(--border,#334455); background:var(--input-bg,#0d1117); color:var(--fg,#e6edf3); cursor:pointer; font-size:12px;">Claude 3.5 Haiku <span style="opacity:0.5; font-size:10px;">Paid</span></button>
        <button class="switch-btn" data-ai="openai" style="padding:8px 14px; border-radius:4px; border:1px solid var(--border,#334455); background:var(--input-bg,#0d1117); color:var(--fg,#e6edf3); cursor:pointer; font-size:12px;">GPT-4o Mini <span style="opacity:0.5; font-size:10px;">Paid</span></button>
        <button class="switch-btn" data-ai="xai" style="padding:8px 14px; border-radius:4px; border:1px solid var(--border,#334455); background:var(--input-bg,#0d1117); color:var(--fg,#e6edf3); cursor:pointer; font-size:12px;">Grok 3 Mini <span style="opacity:0.5; font-size:10px;">Paid</span></button>
        <button class="switch-btn" data-ai="kimi" style="padding:8px 14px; border-radius:4px; border:1px solid var(--border,#334455); background:var(--input-bg,#0d1117); color:var(--fg,#e6edf3); cursor:pointer; font-size:12px;">Kimi <span style="opacity:0.5; font-size:10px;">Paid</span></button>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="switch-go-btn" style="padding:8px 20px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">Switch</button>
        <button id="switch-cancel-btn" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px;">Cancel</button>
      </div>
    </div>`;
}
