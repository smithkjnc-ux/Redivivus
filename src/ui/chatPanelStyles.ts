// [SCOPE] Chat Panel CSS — all styles for the chat webview, injected via nonce-tagged <style> block
// Extracted from chatPanelHtml.ts (was lines 174-328). Keep under 200 lines.

export function buildChatCss(): string {
  // [CHASSIS] CHASSIS brand colors — dark professional, light + airy feel
  // Primary surface: #1a2035 (deep blue-slate)
  // Raised surface:  #1e2740 (card/input bg)
  // Border:          #2d3a55 (subtle blue-tinted border)
  // Accent:          #4d9eff (electric blue)
  // Accent glow:     rgba(77,158,255,0.15)
  // Success:         #34d399
  // Warning:         #fbbf24
  // Error:           #f87171
  // Text primary:    #e8edf8 (near-white, blue tinted)
  // Text secondary:  #8899bb (muted blue-gray)
  return `
    :root {
      --c-bg:        #1a2035;
      --c-surface:   #1e2740;
      --c-raised:    #24304e;
      --c-border:    #2d3a55;
      --c-border-hi: #3d4f6e;
      --c-accent:    #4d9eff;
      --c-accent-lo: rgba(77,158,255,0.14);
      --c-accent-md: rgba(77,158,255,0.28);
      --c-text:      #e8edf8;
      --c-text-dim:  #8899bb;
      --c-text-faint:#4a5a7a;
      --c-green:     #34d399;
      --c-amber:     #fbbf24;
      --c-red:       #f87171;
      --c-purple:    #a78bfa;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--c-bg);
      color: var(--c-text);
      display: flex; flex-direction: column; height: 100vh; overflow: hidden;
      font-size: 13px; line-height: 1.5;
    }
    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--c-border-hi); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--c-text-faint); }

    /* ── Header ── */
    .header {
      padding: 10px 14px 8px;
      border-bottom: 1px solid var(--c-border);
      display: flex; flex-direction: column; gap: 7px; flex-shrink: 0;
      background: linear-gradient(180deg, #1c2540 0%, var(--c-bg) 100%);
    }
    .header > div:first-child { display: flex; align-items: center; justify-content: space-between; }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .header-right { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .header-top { display: flex; align-items: center; justify-content: space-between; }
    .header-title { font-size: 13px; font-weight: 600; color: var(--c-text); }
    .header-actions { display: flex; gap: 8px; align-items: center; }

    /* ── Header brand text ── */
    .header strong {
      background: linear-gradient(90deg, #7bc4ff 0%, #4d9eff 60%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: 2px;
      font-size: 14px;
      font-weight: 700;
    }

    /* ── Header buttons ── */
    .header-btn, .clear-btn, .map-btn {
      background: var(--c-raised);
      border: 1px solid var(--c-border);
      color: var(--c-text-dim);
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .header-btn:hover, .clear-btn:hover, .map-btn:hover {
      background: var(--c-border);
      color: var(--c-text);
      border-color: var(--c-border-hi);
    }
    .header-btn.capabilities-btn {
      border-color: var(--c-accent);
      color: var(--c-accent);
      background: var(--c-accent-lo);
    }
    .header-btn.capabilities-btn:hover {
      background: var(--c-accent-md);
      color: #fff;
    }
    .save-point-btn, .blueprint-btn {
      background: var(--c-accent-lo);
      border: 1px solid var(--c-accent);
      color: var(--c-accent);
      padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;
      transition: all 0.15s; font-family: inherit;
    }
    .save-point-btn:hover { background: var(--c-accent-md); color: #fff; }
    .blueprint-btn { border-color: var(--c-purple); color: var(--c-purple); background: rgba(167,139,250,0.12); }
    .blueprint-btn:hover { background: rgba(167,139,250,0.24); color: #fff; }

    /* ── Badges ── */
    .header-badges { display: flex; flex-wrap: wrap; gap: 5px; font-size: 11px; padding: 0 2px; }
    .badge {
      padding: 3px 8px; border-radius: 20px; font-size: 11px;
      border: 1px solid transparent; font-weight: 500;
    }
    .badge.ai.green  { background: rgba(52,211,153,0.12); color: var(--c-green);  border-color: rgba(52,211,153,0.3); }
    .badge.ai.yellow { background: rgba(251,191,36,0.12);  color: var(--c-amber);  border-color: rgba(251,191,36,0.3); }
    .badge.ai.red    { background: rgba(248,113,113,0.12); color: var(--c-red);    border-color: rgba(248,113,113,0.3); }
    .badge.project   { background: var(--c-accent-lo);     color: var(--c-accent); border-color: rgba(77,158,255,0.3); }
    .badge.roster.supervisor { background: var(--c-accent-lo); color: var(--c-accent); border-color: rgba(77,158,255,0.3); }
    .badge.roster.worker     { background: rgba(100,116,139,0.15); color: #94a3b8; border-color: rgba(100,116,139,0.3); }
    .badge.roster.guardian   { background: rgba(251,191,36,0.12);  color: var(--c-amber); border-color: rgba(251,191,36,0.3); }
    .badge.blueprint { background: rgba(167,139,250,0.12); color: var(--c-purple); border-color: rgba(167,139,250,0.3); }
    .badge.session   { background: rgba(52,211,153,0.12);  color: var(--c-green);  border-color: rgba(52,211,153,0.3); }
    .badge.time { opacity: 0.5; }
    .badge.clickable { cursor: pointer; }
    .badge.clickable:hover { opacity: 0.8; filter: brightness(1.1); }

    /* ── Conversation ── */
    #conversation {
      flex: 1; overflow-y: auto; padding: 18px 16px;
      display: flex; flex-direction: column; gap: 14px;
      background: var(--c-bg);
    }

    /* ── Message bubbles ── */
    .message-bubble { display: flex; flex-direction: column; gap: 4px; max-width: 82%; word-wrap: break-word; }
    .user-bubble {
      align-self: flex-end;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #fff;
      border-radius: 16px 16px 4px 16px;
      padding: 10px 15px;
      box-shadow: 0 2px 12px rgba(37,99,235,0.35);
    }
    .assistant-bubble {
      align-self: flex-start;
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 4px 16px 16px 16px;
      padding: 11px 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .message-content { line-height: 1.6; white-space: pre-wrap; word-break: break-word; font-size: 13px; }
    .message-meta { font-size: 10px; color: var(--c-text-faint); margin-top: 5px; }

    /* ── Story panel ── */
    .story-panel { display: flex; flex-direction: column; gap: 5px; padding: 2px 0; }
    .story-header {
      font-size: 11px; font-weight: 700; color: var(--c-accent);
      margin-bottom: 6px; letter-spacing: 0.8px; text-transform: uppercase;
    }
    .story-line {
      display: flex; align-items: flex-start; gap: 9px;
      padding: 6px 10px; border-radius: 8px; font-size: 13px; line-height: 1.5;
      color: var(--c-text-dim); transition: all 0.2s;
    }
    .story-line.story-line-active {
      background: var(--c-accent-lo);
      border-left: 3px solid var(--c-accent);
      color: var(--c-text);
      font-weight: 500; padding-left: 8px;
    }
    .story-dot { flex-shrink: 0; font-size: 14px; margin-top: 1px; }

    /* ── Code blocks ── */
    .code-block {
      background: #111827;
      border: 1px solid var(--c-border);
      border-radius: 10px; margin: 10px 0; overflow: hidden;
    }
    .code-block pre { padding: 14px; overflow-x: auto; font-family: 'JetBrains Mono','Fira Code','Monaco','Courier New',monospace; font-size: 12px; }
    .code-block code { color: #c9d1d9; }

    /* ── Buttons inside messages ── */
    .create-file-btn {
      background: var(--c-accent-lo); color: var(--c-accent);
      border: 1px solid var(--c-accent);
      padding: 5px 13px; margin: 7px 12px 11px 12px;
      border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;
      transition: all 0.15s; font-family: inherit;
    }
    .create-file-btn:hover { background: var(--c-accent-md); color: #fff; }

    /* ── Empty state / onboarding ── */
    .empty-state {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 12px; padding: 24px; text-align: center;
    }
    .empty-state .icon { font-size: 44px; margin-bottom: 4px; filter: drop-shadow(0 4px 16px rgba(77,158,255,0.4)); }
    .onboarding-title {
      font-size: 20px; font-weight: 700; color: var(--c-text);
      background: linear-gradient(90deg, #7bc4ff, #e8edf8);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .onboarding-sub { font-size: 13px; color: var(--c-text-dim); margin-bottom: 4px; max-width: 280px; }
    .onboarding-examples { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 10px 0; }
    .onboarding-setup-btn {
      margin: 14px auto 4px; padding: 11px 26px;
      background: linear-gradient(135deg, #2563eb, #4d9eff);
      color: #fff; border-radius: 10px; font-size: 14px; font-weight: 700;
      cursor: pointer; display: inline-block; transition: opacity 0.15s;
      box-shadow: 0 4px 18px rgba(77,158,255,0.35); border: none; font-family: inherit;
    }
    .onboarding-setup-btn:hover { opacity: 0.9; }
    .onboarding-divider { font-size: 11px; opacity: 0.45; margin: 8px 0 5px; text-transform: uppercase; letter-spacing: 0.8px; }
    .onboarding-pill {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 20px; padding: 7px 15px;
      font-size: 12px; cursor: pointer; color: var(--c-text-dim);
      transition: all 0.15s; user-select: none; font-family: inherit;
    }
    .onboarding-pill:hover {
      background: var(--c-accent-lo);
      border-color: var(--c-accent);
      color: var(--c-text);
    }
    .onboarding-hint { font-size: 11px; color: var(--c-text-faint); margin-top: 6px; }

    /* ── Input area ── */
    #input-area {
      padding: 10px 14px 13px;
      background: var(--c-bg);
      border-top: 1px solid var(--c-border);
      flex-shrink: 0;
    }
    #input-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 14px; overflow: hidden;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    #input-card:focus-within {
      border-color: var(--c-accent);
      box-shadow: 0 0 0 3px var(--c-accent-lo);
    }
    #input-top { padding: 11px 15px 4px; }
    #message-input {
      width: 100%; background: transparent; color: var(--c-text);
      border: none; outline: none; font-family: inherit; font-size: 13px; resize: none;
      line-height: 1.5; min-height: 22px; max-height: 160px; overflow-y: auto;
      display: block; box-sizing: border-box;
    }
    #message-input::placeholder { color: var(--c-text-faint); }
    #input-bottom {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 9px 8px; gap: 6px;
    }
    #input-left { display: flex; align-items: center; gap: 4px; }
    #input-right { display: flex; align-items: center; gap: 6px; }

    /* ── Input pills ── */
    .input-pill {
      display: flex; align-items: center; gap: 4px; padding: 4px 10px;
      background: transparent; color: var(--c-text-dim);
      border: 1px solid var(--c-border);
      border-radius: 20px; font-size: 11px; font-family: inherit;
      cursor: pointer; white-space: nowrap; transition: all 0.15s;
    }
    .input-pill:hover {
      background: var(--c-accent-lo);
      border-color: var(--c-accent);
      color: var(--c-text);
    }
    .input-pill--ai { color: var(--c-accent); border-color: rgba(77,158,255,0.3); background: var(--c-accent-lo); }
    .input-pill--ai:hover { background: var(--c-accent-md); }
    .input-pill[data-cmd] { cursor: pointer; }

    /* ── Send button ── */
    #send-btn {
      width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
      background: linear-gradient(135deg, #2563eb, #4d9eff);
      color: #fff; font-size: 15px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; flex-shrink: 0;
      box-shadow: 0 2px 10px rgba(77,158,255,0.4);
    }
    #send-btn:hover { transform: scale(1.08); box-shadow: 0 4px 16px rgba(77,158,255,0.55); }
    #send-btn:disabled { opacity: 0.3; cursor: default; transform: none; box-shadow: none; }

    #stats { font-size: 10px; color: var(--c-text-faint); white-space: nowrap; cursor: default; user-select: none; }

    /* ── Dynamic / Getting Started panels ── */
    #getting-started, .dynamic-panel {
      background: var(--c-surface);
      border-bottom: 1px solid var(--c-border);
      flex-shrink: 0;
    }
    .gs-header, .dp-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 11px 16px;
      background: var(--c-raised);
      border-bottom: 1px solid var(--c-border);
    }
    .gs-title, .dp-title { font-weight: 700; font-size: 13px; color: var(--c-text); }
    .gs-close, .dp-close {
      background: transparent; border: none; color: var(--c-text-dim);
      font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1;
      transition: color 0.15s;
    }
    .gs-close:hover, .dp-close:hover { color: var(--c-text); }
    .gs-content, .dp-content { padding: 16px; max-height: 350px; overflow-y: auto; font-size: 13px; line-height: 1.5; }
    .gs-section { margin-bottom: 18px; }
    .gs-section h3 { font-size: 13px; font-weight: 700; margin-bottom: 8px; color: var(--c-text); }
    .gs-section p { font-size: 12px; line-height: 1.6; color: var(--c-text-dim); margin-bottom: 10px; }
    .gs-section ul, .gs-section ol { margin: 8px 0; padding-left: 18px; font-size: 12px; color: var(--c-text-dim); }
    .gs-section li { margin-bottom: 6px; line-height: 1.5; }
    .gs-section strong { color: var(--c-text); }
    .gs-tip {
      background: rgba(52,211,153,0.08);
      border-left: 3px solid var(--c-green);
      padding: 10px 13px; font-size: 12px;
      border-radius: 0 6px 6px 0;
      color: var(--c-text-dim);
    }

    /* ── Functions panel ── */
    #chassis-functions {
      border-top: 1px solid var(--c-border);
      padding: 11px 15px;
      background: var(--c-surface);
      flex-shrink: 0;
    }
    .func-section { margin-bottom: 10px; }
    .func-section:last-child { margin-bottom: 0; }
    .func-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px;
      color: var(--c-text-faint); margin-bottom: 6px; display: block;
    }
    .func-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
    .func-btn {
      background: var(--c-accent-lo); color: var(--c-accent);
      border: 1px solid rgba(77,158,255,0.3);
      border-radius: 6px; padding: 6px 11px; font-size: 11px;
      cursor: pointer; display: flex; align-items: center; gap: 4px;
      transition: all 0.15s; font-family: inherit;
    }
    .func-btn:hover { background: var(--c-accent-md); color: #fff; border-color: var(--c-accent); }
    .func-btn.secondary {
      background: var(--c-raised); color: var(--c-text-dim);
      border: 1px solid var(--c-border);
    }
    .func-btn.secondary:hover { background: var(--c-border); color: var(--c-text); }

    /* ── Working status spinner ── */
    #chassis-status { font-size: 11px; color: var(--c-text-faint); }
    #chassis-status.chassis-working { color: var(--c-accent) !important; font-weight: 600; letter-spacing: 0.3px; }
    #chassis-status.chassis-working::before {
      content: ''; display: inline-block; width: 9px; height: 9px;
      border: 2px solid var(--c-accent-md); border-top-color: var(--c-accent);
      border-radius: 50%; animation: chassis-spin 0.7s linear infinite;
      margin-right: 5px; vertical-align: middle;
    }
    @keyframes chassis-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `;
}
