// [SCOPE] Extract switch AI and behavior forms for files tab
export function renderSwitchForm(currentAI: string): string {
  // [WARN] Building complex HTML via string concatenation is fragile and error-prone.
  // [WARN] Ensure all user-provided data is properly escaped to prevent XSS.
  let html = `
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

  const THERM_TIPS: Record<string, string> = {
    visual:    'Visual (0-1): Controls creativity in UI, colors, animations and layout. High = more experimental visuals. Low = conventional, safe styling.',
    mechanics: 'Mechanics (0-1): Controls game logic, physics and interaction systems. High = creative approaches. Low = predictable, well-tested patterns.',
    logic:     'Logic (0-1): Controls algorithms, conditions and data flow. Low = more deterministic, reliable code. High = novel but riskier logic.',
    data:      'Data (0-1): Controls data structures and persistence patterns. Low = safer, conventional patterns. High = experimental data design.',
    security:  'Security: Always fixed at 0.00. Security code must be fully deterministic with zero creativity — no exceptions.',
  };

  function renderThermometer(id: string, icon: string, label: string, defaultVal: string, locked: boolean = false): string {
    const lockedStyle = locked ? 'opacity: 0.6; cursor: not-allowed;' : 'cursor: pointer;';
    const tip = THERM_TIPS[id] || '';
    const tooltip = locked ? 'title="Fixed for project safety — security code must be fully deterministic"' : `title="${tip}"`;
    return `
      <div class="thermometer-col" style="display:flex; flex-direction:column; align-items:center; flex:1;" ${tooltip}>
        <div class="thermometer-track" data-domain="${id}" style="position:relative; width:20px; height:150px; background:var(--input-bg, #0d1117); border-radius:10px; border:1px solid var(--border, #334455); overflow:hidden; ${lockedStyle}; margin-bottom:8px;">
          <div class="thermometer-fill" id="therm-${id}" data-val="${defaultVal}" style="position:absolute; bottom:0; left:0; width:100%; height:${parseFloat(defaultVal)*100}%; background:linear-gradient(to top, #3b82f6, #ef4444); transition:height 0.2s ease, background 0.2s ease;"></div>
        </div>
        <div style="font-size:16px; margin-bottom:2px;">${icon}</div>
        <div style="font-size:10px; font-weight:bold;">${label}</div>
        <div style="font-size:9px; color:var(--vscode-descriptionForeground);" id="therm-label-${id}">${defaultVal}</div>
      </div>
    `;
  }

  html += `
    <div id="behavior-panel-form" style="display:none; margin:16px 0; padding:16px; background:var(--card-bg, #1e293b); border-radius:8px; border:1px solid var(--border, #334455);">
      <h3 style="margin:0 0 4px 0; font-size:14px;">🎛️ AI Behavior Panel</h3>
      <p style="margin:0 0 14px 0; font-size:11px; color:var(--vscode-descriptionForeground);">Configure the temperature settings for specific architectural domains. Settings are saved to the project blueprint.</p>
      
      <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:16px; align-items:flex-end;">
        <div style="display:flex; flex-direction:column; justify-content:space-between; height:150px; font-size:9px; color:var(--vscode-descriptionForeground); text-align:right; padding-right:4px; padding-bottom:24px;">
          <div>🔥 Experimental</div>
          <div>Creative</div>
          <div>Balanced</div>
          <div>Stable</div>
          <div>❄️ Consistent</div>
        </div>
        ${renderThermometer('visual', '🎨', 'Visual', '0.75')}
        ${renderThermometer('mechanics', '⚙️', 'Mechanics', '0.5')}
        ${renderThermometer('logic', '🧠', 'Logic', '0.25')}
        ${renderThermometer('data', '🗄️', 'Data', '0.1')}
        ${renderThermometer('security', '🔒', 'Security', '0.0', true)}
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="behavior-save-btn" style="padding:8px 20px; background:#238636; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px; font-weight:bold;">Save Profile</button>
        <button id="behavior-close-btn" style="padding:8px 20px; background:transparent; color:var(--fg, #e6edf3); border:1px solid var(--border, #334455); border-radius:4px; cursor:pointer; font-size:13px;">Close</button>
      </div>
    </div>`;

  return html;
}
