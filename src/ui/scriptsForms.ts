// [SCOPE] Session form handlers — Start Working, Done for Now, Switch AI
// Called by scripts.ts assembler. No vault, wizard, or settings logic here.

export function getFormsScripts(): string {
  return `
    // ── Start Working form handlers ──
    let selectedAi = '';
    const startForm = document.getElementById('start-form');
    const startCard = document.querySelector('[data-action="showStartForm"]');
    if (startCard) {
      startCard.addEventListener('click', () => {
        if (startForm) startForm.style.display = 'block';
        startCard.style.display = 'none';
      });
    }
    document.querySelectorAll('.ai-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedAi = btn.dataset.ai;
        document.querySelectorAll('.ai-btn').forEach(b => {
          b.style.background = 'var(--input-bg, #0d1117)';
          b.style.borderColor = 'var(--border, #334455)';
        });
        btn.style.background = '#238636';
        btn.style.borderColor = '#238636';
      });
    });
    const goBtn = document.getElementById('start-go-btn');
    if (goBtn) {
      goBtn.addEventListener('click', () => {
        const goal = document.getElementById('start-goal').value.trim();
        if (!goal) { document.getElementById('start-goal').style.borderColor = '#f85149'; return; }
        // [WARN] selectedAi is a closure variable — must be set via .ai-btn click before this fires.
        if (!selectedAi) { return; }
        vscode.postMessage({ type: 'startSession', goal: goal, ai: selectedAi });
      });
    }
    const cancelBtn = document.getElementById('start-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (startForm) startForm.style.display = 'none';
        if (startCard) startCard.style.display = '';
      });
    }

    // ── Done for Now form handlers ──
    const endForm = document.getElementById('end-form');
    const endCard = document.querySelector('[data-action="showEndForm"]');
    if (endCard) {
      endCard.addEventListener('click', () => {
        if (endForm) endForm.style.display = 'block';
        endCard.style.display = 'none';
      });
    }
    const endGoBtn = document.getElementById('end-go-btn');
    if (endGoBtn) {
      endGoBtn.addEventListener('click', () => {
        const data = {
          completed: document.getElementById('end-completed').value.trim(),
          inProgress: document.getElementById('end-inprogress').value.trim(),
          risks: document.getElementById('end-risks').value.trim(),
          nextStart: document.getElementById('end-nextstart').value.trim()
        };
        vscode.postMessage({ type: 'endSession', data: data });
      });
    }
    const endCancelBtn = document.getElementById('end-cancel-btn');
    if (endCancelBtn) {
      endCancelBtn.addEventListener('click', () => {
        if (endForm) endForm.style.display = 'none';
        if (endCard) endCard.style.display = '';
      });
    }

    // ── Switch AI form handlers ──
    let switchAi = '';
    const switchForm = document.getElementById('switch-form');
    const switchCard = document.querySelector('[data-action="showSwitchForm"]');
    if (switchCard) {
      switchCard.addEventListener('click', () => {
        if (switchForm) switchForm.style.display = 'block';
        switchCard.style.display = 'none';
      });
    }
    document.querySelectorAll('.switch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchAi = btn.dataset.ai;
        document.querySelectorAll('.switch-btn').forEach(b => {
          b.style.background = 'var(--input-bg, #0d1117)';
          b.style.borderColor = 'var(--border, #334455)';
        });
        btn.style.background = '#238636';
        btn.style.borderColor = '#238636';
      });
    });
    const switchGoBtn = document.getElementById('switch-go-btn');
    if (switchGoBtn) {
      switchGoBtn.addEventListener('click', () => {
        // [WARN] switchAi is a closure variable — must be set via .switch-btn click before this fires.
        if (!switchAi) return;
        vscode.postMessage({ type: 'switchAI', ai: switchAi });
      });
    }
    const switchCancelBtn = document.getElementById('switch-cancel-btn');
    if (switchCancelBtn) {
      switchCancelBtn.addEventListener('click', () => {
        if (switchForm) switchForm.style.display = 'none';
        if (switchCard) switchCard.style.display = '';
      });
    }
  `;
}
