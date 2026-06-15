// [SCOPE] Redivivus Files & AI tab — project tools, blueprint editor, AI switcher

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
  // [WARN] Building complex HTML via string concatenation is fragile and error-prone.
  // [WARN] Ensure all user-provided data is properly escaped to prevent XSS.
  let html = `<div id="tab-files" class="tab-content ${isActive ? 'active' : ''}">`;
  html += `
    <div class="section-title">Project Health</div>
    <div class="cards">
      <div class="card" data-cmd="redivivus.analyze">
        <div class="card-icon">�</div><div class="card-body"><div class="card-title">Scan Project</div><div class="card-sub">Find messy files, unfinished TODOs, and things that need attention</div></div>
      </div>
      <div class="card" data-cmd="redivivus.retrofit">
        <div class="card-icon">�</div><div class="card-body"><div class="card-title">Add Notes to Existing Code</div><div class="card-sub">Have Redivivus label and organize your existing files</div></div>
      </div>
      <div class="card" data-action="showBlueprintForm">
        <div class="card-icon">📋</div><div class="card-body"><div class="card-title">My Project Plan</div><div class="card-sub">View or update what you're building and why</div></div>
      </div>
    </div>
    <div class="section-title">AI Settings</div>
    <div class="cards">
      <div class="card" data-action="showSwitchForm">
        <div class="card-icon">🤖</div><div class="card-body"><div class="card-title">Switch AI</div><div class="card-sub">Choose which AI assistant Redivivus talks to</div></div>
      </div>
      <div class="card" data-action="showApiKeysForm">
        <div class="card-icon">🔑</div><div class="card-body"><div class="card-title">API Keys</div><div class="card-sub">Connect your AI accounts (Gemini is free to start)</div></div>
      </div>
    </div>
    <div class="section-title">History & Help</div>
    <div class="cards">
      <div class="card" data-cmd="redivivus.log">
        <div class="card-icon">📜</div><div class="card-body"><div class="card-title">Work Log</div><div class="card-sub">See everything you've done in this project</div></div>
      </div>
      <div class="card" data-cmd="redivivus.deadends">
        <div class="card-icon">🚫</div><div class="card-body"><div class="card-title">Dead Ends</div><div class="card-sub">Things you tried that didn't work — so you don't repeat them</div></div>
      </div>
      <div class="card" data-cmd="redivivus.guide">
        <div class="card-icon">📖</div><div class="card-body"><div class="card-title">Help & Guide</div><div class="card-sub">How to use Redivivus — a plain English walkthrough</div></div>
      </div>
    </div>`;
  html += `
    <div id="blueprint-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 4px 0; font-size:14px;">My Project Plan &mdash; ${esc(projectName || 'Your Project')}</h3>
      <p style="margin:0 0 8px 0; font-size:11px; color:var(--vscode-descriptionForeground);">Your AI reads these answers every session. The more honest you are, the better it helps.</p>
      ${blueprintLocked ? '<div class="alert" style="background:rgba(78,201,89,0.08); border-color:rgba(78,201,89,0.3); margin-bottom:12px;"><div class="alert-icon">🔒</div><div class="alert-text">This blueprint is locked. No more edits.</div></div>' : hasBlueprint ? '<div class="alert" style="margin-bottom:12px;"><div class="alert-icon">⚠️</div><div class="alert-text">Changing the blueprint mid-project may shift your direction. Be intentional.</div></div>' : ''}
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">Who is going to use this?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">Just you? Friends? Anyone specific?</p>
      <textarea id="bp-who" rows="2" placeholder="e.g. Just me, for fun — or — My friends who like card games" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.who || '')}</textarea>
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">What does it do?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">Describe it like you'd tell a friend — one sentence is fine.</p>
      <textarea id="bp-what" rows="2" placeholder="e.g. A simple card game where two players take turns" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.what || '')}</textarea>
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">Where does it run?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">In a browser? On a phone? On your computer? Not sure is fine too.</p>
      <textarea id="bp-where" rows="2" placeholder="e.g. In a web browser — or — On my PC — or — Not sure yet" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.where || '')}</textarea>
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">What's your timeline?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">No deadline? That's fine. Weekend project or something bigger?</p>
      <textarea id="bp-when" rows="2" placeholder="e.g. Just for fun, no deadline — or — Want something working this weekend" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.when || '')}</textarea>
      <label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">Why do you want to build it?</label>
      <p style="margin:0 0 4px; font-size:10px; color:var(--vscode-descriptionForeground);">"Because it sounds fun" is a great answer. Honest beats impressive.</p>
      <textarea id="bp-why" rows="2" placeholder="e.g. I want to learn — or — My kid asked for it — or — Just for fun" ${blueprintLocked ? 'readonly' : ''} style="width:100%; padding:8px; margin-bottom:10px; background:var(--input-bg, #0d1117); color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; font-size:12px; font-family:inherit; resize:vertical;${blueprintLocked ? ' opacity:0.6;' : ''}">${esc(blueprint?.why || '')}</textarea>
      <div style="display:flex; gap:8px; align-items:center;">
        ${blueprintLocked ? '' : '<button id="bp-save-btn" style="padding:8px 20px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">Save My Plan</button><label style="font-size:12px; cursor:pointer;"><input id="bp-lock" type="checkbox" style="margin-right:4px;" />Lock this plan (prevent accidental changes)</label>'}
        <button id="bp-cancel-btn" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px; margin-left:auto;">${blueprintLocked ? 'Close' : 'Cancel'}</button>
      </div>
    </div>`;

  html += `
    <div id="api-keys-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 4px 0; font-size:14px;">🔑 AI API Keys</h3>
      <p style="margin:0 0 14px 0; font-size:11px; color:var(--vscode-descriptionForeground);">Keys are saved to your editor settings and never shared. Set one or more — Redivivus will fall back automatically.</p>

      ${keyRow('gemini', 'Gemini 2.5 Flash', 'Free', 'AIza...', 'https://aistudio.google.com/apikey', aiKeys?.gemini)}
      ${keyRow('groq',   'Groq (Llama 3)',    'Free', 'gsk_...', 'https://console.groq.com/keys', aiKeys?.groq)}
      ${keyRow('claude', 'Claude 3.5 Haiku',  'Paid', 'sk-ant-...', 'https://console.anthropic.com/settings/keys', aiKeys?.claude)}
      ${keyRow('openai', 'OpenAI GPT-4o Mini','Paid', 'sk-...', 'https://platform.openai.com/api-keys', aiKeys?.openai)}
      ${keyRow('xai',    'xAI Grok 3 Mini',   'Paid', 'xai-...', 'https://console.x.ai', aiKeys?.xai)}
      ${keyRow('kimi',   'Moonshot Kimi',      'Paid', 'sk-...', 'https://platform.moonshot.ai/console/api-keys', aiKeys?.kimi)}

      <button id="api-keys-close-btn" style="padding:7px 18px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:12px; margin-top:4px;">Close</button>
    </div>`;

  // [WARN] Building complex HTML via string concatenation is fragile and error-prone.
  // [WARN] Ensure all user-provided data is properly escaped to prevent XSS.
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
  // [WARN] Building complex HTML via string concatenation is fragile and error-prone.
  // [WARN] Ensure all user-provided data is properly escaped to prevent XSS.
  return `
    <div id="switch-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 8px 0; font-size:14px;">Pick your AI engine</h3>
      <p style="margin:0 0 12px 0; font-size:12px; color:var(--vscode-descriptionForeground);">Currently using: <strong>${(currentAI || 'None').toUpperCase()}</strong></p>
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