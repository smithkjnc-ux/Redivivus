// [SCOPE] CHASSIS Chat Panel HTML builder — generates the full WebView HTML for the chat interface

import { getNonce } from './getNonce.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokens?: number;
  cost?: number;
}

export interface ChatHeaderInfo {
  projectName?: string;
  aiName: string;
  aiLabel: string;
  isFallback: boolean;
  hasKey: boolean;
  blueprintLocked: boolean;
  hasBlueprint: boolean;
  sessionActive: boolean;
  sessionGoal?: string;
  currentTime: string;
  isInitialized: boolean;
  usageReport?: import('../services/usageTracker.js').UsageReport;
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

function encodeBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

function renderMessages(conversation: ChatMessage[]): string {
  return conversation.map((msg) => {
    const isUser = msg.role === 'user';
    const bubbleClass = isUser ? 'message-bubble user-bubble' : 'message-bubble assistant-bubble';
    const timeStr = new Date(msg.timestamp).toLocaleTimeString();
    const costStr = msg.cost ? ` · $${msg.cost.toFixed(4)}` : '';
    const tokensStr = msg.tokens ? `${msg.tokens} tokens${costStr}` : '';

    let contentHtml = escapeHtml(msg.content);
    // Render action cards from AI command suggestions (format: __ACTION_CARD__command|||label|||END__)
    contentHtml = contentHtml.replace(/__ACTION_CARD__([^|]+)\|\|\|([^|]+)\|\|\|END__/g, (_match, command, label) => {
      return `<div style="margin:10px 0;padding:10px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:8px;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;" data-cmd="${command}"><span style="font-size:14px;flex:1;">${label}</span><span style="font-size:11px;opacity:0.75;white-space:nowrap;">Tap to run \u25b6</span></div>`;
    });
    // Render build result action buttons (format: __BUILD_RESULT__relPath|||absPath|||END__)
    contentHtml = contentHtml.replace(/__BUILD_RESULT__([^|]+)\|\|\|([^|]+)\|\|\|END__/g, (_match, relPath, absPath) => {
      return `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">`
        + `<button style="padding:7px 14px;border:none;border-radius:5px;background:#0078d4;color:#fff;cursor:pointer;font-size:12px;font-weight:600;" data-open-file="${absPath}">📂 Open File</button>`
        + `<button style="padding:7px 14px;border:1px solid var(--vscode-input-border);border-radius:5px;background:transparent;color:var(--vscode-foreground);cursor:pointer;font-size:12px;" data-cmd="chassis.scanVaultCodebase">Save to Vault</button>`
        + `</div>`;
    });
    contentHtml = contentHtml.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      const encodedCode = encodeBase64(code.trim());
      const ext = lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang === 'typescript' ? 'ts' : 'txt';
      return `<div class="code-block"${langAttr}><pre><code>${escapeHtml(code.trim())}</code></pre><button class="create-file-btn" data-code="${encodedCode}" data-ext="${ext}">Create File</button></div>`;
    });

    const metadata = isUser ? '' : `<div class="message-meta">${tokensStr} · ${timeStr}</div>`;
    return `<div class="${bubbleClass}"><div class="message-content">${contentHtml}</div>${metadata}</div>`;
  }).join('');
}

export function buildChatHtml(conversation: ChatMessage[], header?: ChatHeaderInfo): string {
  const nonce = getNonce();
  const totalTokens = conversation.reduce((s, m) => s + (m.tokens || 0), 0);
  const totalCost = conversation.reduce((s, m) => s + (m.cost || 0), 0);
  const messagesHtml = renderMessages(conversation);
  const totalStr = totalTokens > 0 ? `${totalTokens} tokens · $${totalCost.toFixed(4)}` : 'No tokens yet';

  // Build header badges
  const badges: string[] = [];
  if (header) {
    if (header.isInitialized && header.projectName) {
      badges.push(`<span class="badge project">📁 ${header.projectName}</span>`);
    }
    const aiColor = !header.hasKey ? 'red' : (header.isFallback ? 'yellow' : 'green');
    const aiIcon = !header.hasKey ? '⚠️' : '🤖';
    const report = header.usageReport;
    const statsTooltip = report ? 
      `Session: ${report.session.messages} msgs, ${report.session.tokens.toLocaleString()} tokens, $${report.session.cost.toFixed(4)}\n` +
      `Today: ${report.day.tokens.toLocaleString()} tokens, $${report.day.cost.toFixed(4)}\n` +
      `Week: ${report.week.tokens.toLocaleString()} tokens, $${report.week.cost.toFixed(4)}\n` +
      `Month: ${report.month.tokens.toLocaleString()} tokens, $${report.month.cost.toFixed(4)}\n` +
      `All Time: ${report.lifetimeUnresettable.tokens.toLocaleString()} tokens, $${report.lifetimeUnresettable.cost.toFixed(4)}` : '';
    badges.push(`<span class="badge ai ${aiColor} clickable" data-cmd="chassis.openSettings" title="${statsTooltip || 'Click to configure AI'}">${aiIcon} ${header.aiLabel}</span>`);
    if (header.hasBlueprint) {
      const bpIcon = header.blueprintLocked ? '🔒' : '📝';
      const bpText = header.blueprintLocked ? 'Locked' : 'Draft';
      badges.push(`<span class="badge blueprint">${bpIcon} ${bpText}</span>`);
    }
    if (header.sessionActive) {
      badges.push(`<span class="badge session">🟢 Session</span>`);
    }
    badges.push(`<span class="badge time">🕐 ${header.currentTime}</span>`);
  }

  const headerHtml = header ? `<div class="header-badges">${badges.join('')}</div>` : '';

  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
      display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    .header { padding: 12px 16px; border-bottom: 1px solid var(--vscode-editorGroup-border);
      display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
    .header-top { display: flex; justify-content: space-between; align-items: center; }
    .header-title { font-weight: 600; font-size: 14px; letter-spacing: 1px; }
    .clear-btn { background: transparent; color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-input-border); border-radius: 4px;
      padding: 4px 10px; cursor: pointer; font-size: 12px; }
    .clear-btn:hover { color: var(--vscode-editor-foreground); }
    .header-badges { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; }
    .badge { padding: 2px 6px; border-radius: 3px; font-size: 11px; }
    .badge.ai.green { background: rgba(78,201,89,0.2); color: #4ec959; }
    .badge.ai.yellow { background: rgba(255,193,7,0.2); color: #ffc107; }
    .badge.ai.red { background: rgba(255,83,79,0.2); color: #ff534f; }
    .badge.project { background: rgba(59,130,246,0.2); color: #3b82f6; }
    .badge.blueprint { background: rgba(147,51,234,0.2); color: #9333ea; }
    .badge.session { background: rgba(34,197,94,0.2); color: #22c55e; }
    .badge.time { opacity: 0.6; }
    .badge.clickable { cursor: pointer; text-decoration: underline; }
    .badge.clickable:hover { opacity: 0.8; }
    #conversation { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .message-bubble { display: flex; flex-direction: column; gap: 4px; max-width: 80%; word-wrap: break-word; }
    .user-bubble { align-self: flex-end; background: var(--vscode-button-background);
      color: var(--vscode-button-foreground); border-radius: 12px 12px 2px 12px; padding: 10px 14px; }
    .assistant-bubble { align-self: flex-start; background: var(--vscode-input-background);
      border-radius: 12px 12px 12px 2px; padding: 10px 14px;
      border: 1px solid var(--vscode-input-border); }
    .message-content { line-height: 1.5; white-space: pre-wrap; word-break: break-word; font-size: 13px; }
    .message-meta { font-size: 11px; opacity: 0.6; margin-top: 4px; }
    .code-block { background: var(--vscode-textCodeBlock-background, #1e1e1e);
      border: 1px solid var(--vscode-editorGroup-border); border-radius: 6px; margin: 8px 0; overflow: hidden; }
    .code-block pre { padding: 12px; overflow-x: auto; font-family: 'Monaco','Courier New',monospace; font-size: 12px; }
    .code-block code { color: var(--vscode-editor-foreground); }
    .create-file-btn { background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground); border: none;
      padding: 5px 12px; margin: 6px 12px 10px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; }
    .create-file-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; opacity: 0.5; gap: 8px; }
    .empty-state .icon { font-size: 32px; }
    .empty-state .hint { font-size: 13px; }
    #input-area { border-top: 1px solid var(--vscode-editorGroup-border); padding: 16px;
      background: var(--vscode-editor-background); flex-shrink: 0; }
    #message-input { width: 100%; padding: 10px 14px;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border); border-radius: 6px;
      font-family: inherit; font-size: 13px; resize: none; max-height: 120px; line-height: 1.4; }
    #message-input:focus { outline: none; border-color: var(--vscode-focusBorder); }
    #stats { font-size: 11px; opacity: 0.5; margin-top: 8px; text-align: right; }
    #getting-started { 
      background: var(--vscode-editor-background); 
      border-bottom: 1px solid var(--vscode-editorGroup-border);
      flex-shrink: 0;
    }
    .gs-header { 
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; 
      background: var(--vscode-input-background);
      border-bottom: 1px solid var(--vscode-input-border);
    }
    .gs-title { font-weight: 600; font-size: 14px; }
    .gs-close { 
      background: transparent; border: none; color: var(--vscode-descriptionForeground);
      font-size: 18px; cursor: pointer; padding: 0 4px;
    }
    .gs-close:hover { color: var(--vscode-editor-foreground); }
    .gs-content { 
      padding: 16px; 
      max-height: 350px;
      overflow-y: auto;
    }
    .gs-section { margin-bottom: 20px; }
    .gs-section h3 { 
      font-size: 14px; 
      font-weight: 600; 
      margin-bottom: 8px;
      color: var(--vscode-editor-foreground);
    }
    .gs-section p { 
      font-size: 12px; 
      line-height: 1.5;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 10px;
    }
    .gs-section ul, .gs-section ol { 
      margin: 8px 0; 
      padding-left: 20px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .gs-section li { margin-bottom: 6px; line-height: 1.4; }
    .gs-section strong { color: var(--vscode-editor-foreground); }
    .gs-tip { 
      background: rgba(78,201,89,0.1); 
      border-left: 3px solid #4ec959;
      padding: 10px 12px; font-size: 12px; border-radius: 0 4px 4px 0;
    }
    #chassis-functions { border-top: 1px solid var(--vscode-editorGroup-border); padding: 12px 16px; background: var(--vscode-editor-background); flex-shrink: 0; }
    .func-section { margin-bottom: 10px; }
    .func-section:last-child { margin-bottom: 0; }
    .func-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; display: block; }
    .func-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
    .func-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 6px 10px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px; }
    .func-btn:hover { background: var(--vscode-button-hoverBackground); }
    .func-btn.secondary { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
    .func-btn.secondary:hover { background: var(--vscode-input-hoverBackground, var(--vscode-input-background)); }
    .dynamic-panel {
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-editorGroup-border);
      flex-shrink: 0;
    }
    .dp-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px;
      background: var(--vscode-input-background);
      border-bottom: 1px solid var(--vscode-input-border);
    }
    .dp-title { font-weight: 600; font-size: 14px; }
    .dp-close {
      background: transparent; border: none; color: var(--vscode-descriptionForeground);
      font-size: 18px; cursor: pointer; padding: 0 4px;
    }
    .dp-close:hover { color: var(--vscode-editor-foreground); }
    .dp-content {
      padding: 16px;
      max-height: 350px;
      overflow-y: auto;
      font-size: 13px;
      line-height: 1.5;
    }
  </style>
</head><body>
  <div class="header">
    <div class="header-top">
      <span class="header-title">C H A S S I S  —  Chat</span>
      <button class="clear-btn" id="clear-btn">Clear</button>
    </div>
    ${headerHtml}
  </div>
  <div id="conversation">
    ${messagesHtml || '<div class="empty-state"><div class="icon">💬</div><div class="hint">Ask about your code, blueprint, or anything else.</div></div>'}
  </div>
  <div id="input-area">
    <textarea id="message-input" placeholder="Ask about your code, the blueprint, or anything else…" rows="3"></textarea>
    <div id="stats">${totalStr}</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('message-input');
    const conv = document.getElementById('conversation');
    const clearBtn = document.getElementById('clear-btn');
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value;
        if (text.trim()) { vscode.postMessage({ type: 'send-message', text }); input.value = ''; }
      }
    });
    clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clear-chat' }));
    
    // Getting Started panel - dynamically inserted when requested
    const gettingStartedHtml = \`<div id="getting-started">
    <div class="gs-header">
      <span class="gs-title">📖 Getting Started with CHASSIS</span>
      <button class="gs-close" id="gs-close">×</button>
    </div>
    <div class="gs-content">
      <div class="gs-section">
        <h3>What is CHASSIS?</h3>
        <p>CHASSIS is your AI coding organizer. It keeps your projects structured, tracked, and documented so AI assistants (and you) always know what's going on.</p>
      </div>
      <div class="gs-section">
        <h3>🚀 Quick Start</h3>
        <ol>
          <li><strong>New Project:</strong> Click "New Project" in the sidebar to set up CHASSIS on a fresh project</li>
          <li><strong>Open Project:</strong> Use "Open Project" to add CHASSIS to existing code</li>
          <li><strong>Blueprint:</strong> Answer 5 simple questions (Who, What, Where, When, Why) to create your project blueprint</li>
          <li><strong>Start Coding:</strong> Use the chat below to ask AI for help with your code</li>
        </ol>
      </div>
      <div class="gs-section">
        <h3>💡 Key Features</h3>
        <ul>
          <li><strong>Blueprint:</strong> Your project's 5 Ws — keeps AI aligned with your goals</li>
          <li><strong>Sessions:</strong> Track what you're working on with start/end workflow</li>
          <li><strong>Vault:</strong> Save and reuse code blocks across projects</li>
          <li><strong>Scan & Clean:</strong> AI analyzes your code and adds CHASSIS annotations</li>
          <li><strong>Work Log:</strong> Automatic record of everything that happens</li>
        </ul>
      </div>
      <div class="gs-section">
        <h3>🤖 AI Integration</h3>
        <p>CHASSIS works with multiple AI providers:</p>
        <ul>
          <li><strong>Gemini</strong> (free) — Fast, great for most coding tasks</li>
          <li><strong>Claude</strong> (paid) — Deep reasoning for complex problems</li>
          <li><strong>Kimi</strong> — Good for bulk annotations</li>
        </ul>
        <p>Use "Switch AI" in the sidebar to change providers.</p>
      </div>
      <div class="gs-tip">
        <strong>💡 Pro Tip:</strong> Just type what you want to build in the chat below! CHASSIS will use your blueprint to guide the AI.
      </div>
    </div>
  </div>\`;
    
    function showGettingStarted() {
      let gsPanel = document.getElementById('getting-started');
      if (!gsPanel) {
        const header = document.querySelector('.header');
        if (header) {
          header.insertAdjacentHTML('afterend', gettingStartedHtml);
          gsPanel = document.getElementById('getting-started');
          // Attach close handler
          const gsClose = document.getElementById('gs-close');
          if (gsClose) {
            gsClose.addEventListener('click', () => {
              if (gsPanel) gsPanel.remove();
            });
          }
        }
      }
    }
    
    function showNewProjectPanel(suggestedParent) {
      const questions = [
        { key: 'who',   label: 'WHO',   preamble: 'This shapes every decision about complexity and UI.',       prompt: 'Who is going to use this?\\nPicture the person — their skill level and context.',  placeholder: 'e.g., Non-technical users who want to sell locally without an account' },
        { key: 'what',  label: 'WHAT',  preamble: 'Not the dream feature list — the minimum thing that works.', prompt: 'What does it need to do?\\nOne sentence that describes success.',                 placeholder: 'e.g., Let users post and find local listings anonymously' },
        { key: 'where', label: 'WHERE', preamble: 'This determines the entire tech stack.',                      prompt: 'Where does this live and run?\\nWeb? Mobile? Desktop? Local? Cloud?',            placeholder: 'e.g., React Native mobile app, Firebase backend, Android first' },
        { key: 'when',  label: 'WHEN',  preamble: 'Timeline and responsiveness requirements.',                   prompt: 'When does this need to work?\\nTimeline and how fast does it need to respond?', placeholder: 'e.g., MVP in 2 months, real-time messaging, 24hr listing lifetime' },
        { key: 'why',   label: 'WHY',   preamble: 'The gut check. If the answer is weak, we should know now.',  prompt: 'Why does this need to exist?\\nWhat problem isn\\'t already solved?',           placeholder: 'e.g., No marketplace lets you sell locally without a tracked account' },
      ];
      let step = 0;
      const answers = {};
      let projectName = '';

      // Remove any existing modal
      const existing = document.getElementById('np-modal-overlay');
      if (existing) existing.remove();

      // Create full-screen overlay
      const overlay = document.createElement('div');
      overlay.id = 'np-modal-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

      const card = document.createElement('div');
      card.id = 'np-modal-card';
      card.style.cssText = 'background:#ffffff;color:#1e1e1e;border-radius:8px;padding:28px 32px;width:520px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      function renderStep() {
        card.innerHTML = '';

        // Title
        const title = document.createElement('div');
        title.style.cssText = 'font-size:17px;font-weight:600;color:#1e1e1e;margin-bottom:6px;';
        title.textContent = 'CHASSIS — New Project Setup';
        card.appendChild(title);

        // Step counter
        const counter = document.createElement('div');
        counter.style.cssText = 'font-size:12px;color:#666;margin-bottom:18px;';
        counter.textContent = step < questions.length ? \`Question \${step + 1} of \${questions.length}\` : 'Final step';
        card.appendChild(counter);

        // Progress dots
        const dots = document.createElement('div');
        dots.style.cssText = 'display:flex;gap:6px;margin-bottom:20px;';
        questions.forEach((_, i) => {
          const d = document.createElement('div');
          d.style.cssText = \`width:32px;height:5px;border-radius:3px;background:\${i < step ? '#0078d4' : i === step ? '#0078d4' : '#d0d0d0'};\${i === step ? 'opacity:1' : i < step ? 'opacity:1' : 'opacity:0.4'}\`;
          dots.appendChild(d);
        });
        card.appendChild(dots);

        if (step < questions.length) {
          const q = questions[step];

          const preamble = document.createElement('div');
          preamble.style.cssText = 'font-size:12px;color:#555;margin-bottom:10px;background:#f5f5f5;border-radius:4px;padding:8px 12px;';
          preamble.textContent = q.preamble;
          card.appendChild(preamble);

          const label = document.createElement('label');
          label.style.cssText = 'display:block;font-weight:600;font-size:14px;color:#1e1e1e;margin-bottom:10px;white-space:pre-line;';
          label.textContent = q.prompt;
          card.appendChild(label);

          const textarea = document.createElement('textarea');
          textarea.id = 'np-input';
          textarea.rows = 3;
          textarea.placeholder = q.placeholder;
          textarea.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:5px;font-size:13px;resize:vertical;font-family:inherit;color:#1e1e1e;background:#fff;outline:none;';
          if (answers[q.key]) textarea.value = answers[q.key];
          card.appendChild(textarea);
          setTimeout(() => textarea.focus(), 30);
          textarea.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); doNext(); } });

          const btns = document.createElement('div');
          btns.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:18px;';

          if (step > 0) {
            const back = document.createElement('button');
            back.textContent = '← Back';
            back.style.cssText = 'padding:8px 18px;border:1px solid #ccc;border-radius:5px;background:#fff;color:#1e1e1e;cursor:pointer;font-size:13px;';
            back.addEventListener('click', () => { answers[q.key] = textarea.value.trim(); step--; renderStep(); });
            btns.appendChild(back);
          }

          const cancel = document.createElement('button');
          cancel.textContent = 'Cancel';
          cancel.style.cssText = 'padding:8px 18px;border:1px solid #ccc;border-radius:5px;background:#fff;color:#666;cursor:pointer;font-size:13px;';
          cancel.addEventListener('click', () => overlay.remove());
          btns.appendChild(cancel);

          const next = document.createElement('button');
          next.textContent = step < questions.length - 1 ? 'Next →' : 'Continue →';
          next.style.cssText = 'padding:8px 20px;border:none;border-radius:5px;background:#0078d4;color:#fff;cursor:pointer;font-size:13px;font-weight:600;';
          next.addEventListener('click', doNext);
          btns.appendChild(next);
          card.appendChild(btns);

          function doNext() {
            answers[q.key] = textarea.value.trim();
            step++;
            renderStep();
          }

        } else {
          // Name + location step
          const nameLabel = document.createElement('label');
          nameLabel.style.cssText = 'display:block;font-weight:600;font-size:14px;color:#1e1e1e;margin-bottom:8px;';
          nameLabel.textContent = 'Project name';
          card.appendChild(nameLabel);

          const nameInput = document.createElement('input');
          nameInput.id = 'np-name';
          nameInput.type = 'text';
          nameInput.placeholder = 'e.g., Do AI Dream, Ryppel, TorqGrid';
          nameInput.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:5px;font-size:14px;color:#1e1e1e;background:#fff;outline:none;margin-bottom:16px;';
          if (projectName) nameInput.value = projectName;
          card.appendChild(nameInput);
          setTimeout(() => nameInput.focus(), 30);

          const locLabel = document.createElement('label');
          locLabel.style.cssText = 'display:block;font-weight:600;font-size:14px;color:#1e1e1e;margin-bottom:6px;';
          locLabel.textContent = 'Save location';
          card.appendChild(locLabel);

          const locHint = document.createElement('div');
          locHint.style.cssText = 'font-size:11px;color:#666;margin-bottom:6px;';
          locHint.textContent = 'A folder with the project name will be created here.';
          card.appendChild(locHint);

          const locRow = document.createElement('div');
          locRow.style.cssText = 'display:flex;gap:6px;align-items:center;';

          const pathInput = document.createElement('input');
          pathInput.id = 'np-folder-path';
          pathInput.type = 'text';
          pathInput.style.cssText = 'flex:1;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:5px;font-size:12px;color:#1e1e1e;background:#fff;outline:none;font-family:monospace;';
          // Compute suggested path: suggestedParent / project-name-slug
          function getSlug() { return (nameInput.value.trim() || 'my-project').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase(); }
          pathInput.value = suggestedParent ? suggestedParent + '/' + getSlug() : '';
          // Keep path in sync as user types name (only if they haven't manually changed it)
          let pathManuallyChanged = false;
          pathInput.addEventListener('input', () => { pathManuallyChanged = true; });
          nameInput.addEventListener('input', () => {
            if (!pathManuallyChanged && suggestedParent) {
              pathInput.value = suggestedParent + '/' + getSlug();
            }
          });
          locRow.appendChild(pathInput);

          const browseBtn = document.createElement('button');
          browseBtn.textContent = 'Browse…';
          browseBtn.style.cssText = 'padding:9px 14px;border:1px solid #ccc;border-radius:5px;background:#fff;color:#1e1e1e;cursor:pointer;font-size:13px;white-space:nowrap;';
          browseBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'browse-folder', currentPath: pathInput.value });
          });
          locRow.appendChild(browseBtn);
          card.appendChild(locRow);

          const btns = document.createElement('div');
          btns.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:18px;';

          const back = document.createElement('button');
          back.textContent = '← Back';
          back.style.cssText = 'padding:8px 18px;border:1px solid #ccc;border-radius:5px;background:#fff;color:#1e1e1e;cursor:pointer;font-size:13px;';
          back.addEventListener('click', () => { projectName = nameInput.value.trim(); step--; renderStep(); });
          btns.appendChild(back);

          const cancel = document.createElement('button');
          cancel.textContent = 'Cancel';
          cancel.style.cssText = 'padding:8px 18px;border:1px solid #ccc;border-radius:5px;background:#fff;color:#666;cursor:pointer;font-size:13px;';
          cancel.addEventListener('click', () => overlay.remove());
          btns.appendChild(cancel);

          const create = document.createElement('button');
          create.textContent = '🆕 Create Project';
          create.style.cssText = 'padding:8px 20px;border:none;border-radius:5px;background:#0078d4;color:#fff;cursor:pointer;font-size:13px;font-weight:600;';
          create.addEventListener('click', doCreate);
          btns.appendChild(create);
          card.appendChild(btns);

          function doCreate() {
            projectName = nameInput.value.trim();
            if (!projectName) { nameInput.focus(); return; }
            const folderPath = pathInput.value.trim() || (suggestedParent + '/' + getSlug());
            vscode.postMessage({ type: 'new-project', answers, name: projectName, folderPath });
            overlay.remove();
          }
        }
      }

      renderStep();
    }

    // Listen for messages from extension
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'browse-result') {
        // Extension resolved a folder picker — update the path field in the modal
        const pathInput = document.getElementById('np-folder-path');
        if (pathInput && msg.folderPath) { pathInput.value = msg.folderPath; }
      } else if (msg.type === 'show-panel') {
        if (msg.panelType === 'getting-started') {
          showGettingStarted();
        } else if (msg.panelType === 'start-session') {
          showStartSessionPanel();
        } else if (msg.panelType === 'new-project') {
          showNewProjectPanel(msg.suggestedParent || '');
        } else {
          // Generic content panel
          showContentPanel(msg.title, msg.content);
        }
      }
    });
    
    function showStartSessionPanel() {
      const existing = document.getElementById('ss-modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ss-modal-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

      const card = document.createElement('div');
      card.style.cssText = 'background:#ffffff;color:#1e1e1e;border-radius:8px;padding:28px 32px;width:480px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

      const title = document.createElement('div');
      title.style.cssText = 'font-size:17px;font-weight:600;color:#1e1e1e;margin-bottom:4px;';
      title.textContent = '🚀 Start Session';
      card.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'font-size:12px;color:#666;margin-bottom:20px;';
      subtitle.textContent = 'Define your goal so CHASSIS can track progress.';
      card.appendChild(subtitle);

      const goalLabel = document.createElement('label');
      goalLabel.style.cssText = 'display:block;font-weight:600;font-size:13px;color:#1e1e1e;margin-bottom:8px;';
      goalLabel.textContent = 'What is your goal for this session?';
      card.appendChild(goalLabel);

      const goalInput = document.createElement('input');
      goalInput.id = 'ss-goal';
      goalInput.type = 'text';
      goalInput.placeholder = 'e.g., Wire WebSocket bridge, Fix auth flow';
      goalInput.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:5px;font-size:13px;color:#1e1e1e;background:#fff;outline:none;margin-bottom:16px;';
      card.appendChild(goalInput);
      setTimeout(() => goalInput.focus(), 30);

      const aiLabel = document.createElement('label');
      aiLabel.style.cssText = 'display:block;font-weight:600;font-size:13px;color:#1e1e1e;margin-bottom:8px;';
      aiLabel.textContent = 'Which AI are you working with?';
      card.appendChild(aiLabel);

      const aiSelect = document.createElement('select');
      aiSelect.id = 'ss-ai';
      aiSelect.style.cssText = 'width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:5px;font-size:13px;color:#1e1e1e;background:#fff;outline:none;margin-bottom:20px;';
      ['Claude','Gemini','DeepSeek','Llama','Windsurf','Cursor','Manual','Other'].forEach(a => {
        const opt = document.createElement('option');
        opt.value = a; opt.textContent = a;
        aiSelect.appendChild(opt);
      });
      card.appendChild(aiSelect);

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';

      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.style.cssText = 'padding:8px 18px;border:1px solid #ccc;border-radius:5px;background:#fff;color:#666;cursor:pointer;font-size:13px;';
      cancel.addEventListener('click', () => overlay.remove());
      btns.appendChild(cancel);

      const start = document.createElement('button');
      start.textContent = '▶ Start Session';
      start.style.cssText = 'padding:8px 20px;border:none;border-radius:5px;background:#0078d4;color:#fff;cursor:pointer;font-size:13px;font-weight:600;';
      btns.appendChild(start);
      card.appendChild(btns);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      function doSubmit() {
        const goal = goalInput.value.trim();
        if (!goal) { goalInput.focus(); goalInput.style.borderColor = '#f85149'; return; }
        vscode.postMessage({ type: 'start-session', goal, ai: aiSelect.value });
        overlay.remove();
      }
      start.addEventListener('click', doSubmit);
      goalInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doSubmit(); });
    }
    
    function showContentPanel(title, content) {
      // Remove any existing panel
      const existing = document.getElementById('dynamic-panel');
      if (existing) existing.remove();
      
      const header = document.querySelector('.header');
      if (header) {
        const panelHtml = \`<div id="dynamic-panel" class="dynamic-panel">
          <div class="dp-header">
            <span class="dp-title">\${title}</span>
            <button class="dp-close" id="dp-close">×</button>
          </div>
          <div class="dp-content">\${content}</div>
        </div>\`;
        header.insertAdjacentHTML('afterend', panelHtml);
        
        const dpClose = document.getElementById('dp-close');
        const dpPanel = document.getElementById('dynamic-panel');
        if (dpClose) {
          dpClose.addEventListener('click', () => {
            if (dpPanel) dpPanel.remove();
          });
        }
      }
    }
    
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      // open-file button from build results
      const openFileEl = target.closest ? target.closest('[data-open-file]') : (target.getAttribute && target.getAttribute('data-open-file') ? target : null);
      if (openFileEl) {
        const filePath = openFileEl.getAttribute('data-open-file');
        if (filePath) { vscode.postMessage({ type: 'open-file', filePath }); }
        return;
      }
      // create-file button (must be the direct target)
      if (target.classList && target.classList.contains('create-file-btn')) {
        const code = atob(target.getAttribute('data-code') || '');
        const ext = target.getAttribute('data-ext') || 'txt';
        const filename = prompt('Filename:', 'file.' + ext);
        if (filename) { vscode.postMessage({ type: 'create-file', code, filename }); }
        return;
      }
      // data-cmd on any element or its ancestor (handles action cards where click lands on a child span)
      const cmdEl = target.closest ? target.closest('[data-cmd]') : (target.getAttribute('data-cmd') ? target : null);
      if (cmdEl) {
        const cmd = cmdEl.getAttribute('data-cmd');
        if (cmd) { vscode.postMessage({ type: 'run-command', command: cmd }); }
        return;
      }
      // data-ai on Switch AI panel buttons
      const aiBtn = target.closest ? target.closest('[data-ai]') : null;
      if (aiBtn) {
        const aiVal = aiBtn.getAttribute('data-ai');
        if (aiVal) {
          vscode.postMessage({ type: 'switch-ai', ai: aiVal });
          const panel = document.getElementById('dynamic-panel');
          if (panel) panel.remove();
        }
      }
    });
    conv.scrollTop = conv.scrollHeight;
  </script>
</body></html>`;
}
