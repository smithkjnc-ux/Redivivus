// [SCOPE] Logic for interacting with the AI Behavior Panel UI (5 domains)
export function buildBehaviorPanelScript(): string {
  return `
    const behaviorPanelForm = document.getElementById('behavior-panel-form');
    const behaviorPanelCard = document.querySelector('[data-action="showBehaviorPanel"]');
    
    if (behaviorPanelCard) {
      behaviorPanelCard.addEventListener('click', () => {
        if (behaviorPanelForm) behaviorPanelForm.style.display = 'block';
        behaviorPanelCard.style.display = 'none';
      });
    }

    const behaviorCloseBtn = document.getElementById('behavior-close-btn');
    if (behaviorCloseBtn) {
      behaviorCloseBtn.addEventListener('click', () => {
        if (behaviorPanelForm) behaviorPanelForm.style.display = 'none';
        if (behaviorPanelCard) behaviorPanelCard.style.display = '';
      });
    }

    // Thermometer Drag & Click Handlers
    let isDraggingTherm = false;
    let activeTherm = null;

    function updateThermometer(track, clientY) {
      if (track.style.cursor === 'not-allowed') return;
      const rect = track.getBoundingClientRect();
      let pos = rect.bottom - clientY;
      pos = Math.max(0, Math.min(rect.height, pos));
      
      const pct = pos / rect.height;
      const fill = track.querySelector('.thermometer-fill');
      const domain = track.getAttribute('data-domain');
      const label = document.getElementById('therm-label-' + domain);
      
      // Stop values to snap to the nearest 0.05
      const snappedPct = Math.round(pct * 20) / 20;
      
      if (fill) {
        fill.style.height = (snappedPct * 100) + '%';
        fill.dataset.val = snappedPct.toFixed(2);
      }
      if (label) {
        label.innerText = snappedPct.toFixed(2);
      }
    }

    document.querySelectorAll('.thermometer-track').forEach(track => {
      track.addEventListener('mousedown', (e) => {
        if (track.style.cursor === 'not-allowed') return;
        isDraggingTherm = true;
        activeTherm = track;
        updateThermometer(activeTherm, e.clientY);
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (isDraggingTherm && activeTherm) {
        // Only trigger update if mouse moved enough to change value or prevent massive events
        updateThermometer(activeTherm, e.clientY);
      }
    });

    document.addEventListener('mouseup', () => {
      isDraggingTherm = false;
      activeTherm = null;
    });

    const behaviorSaveBtn = document.getElementById('behavior-save-btn');
    if (behaviorSaveBtn) {
      behaviorSaveBtn.addEventListener('click', () => {
        const payload = {};
        document.querySelectorAll('.thermometer-fill').forEach(fill => {
          const domain = fill.id.replace('therm-', '');
          payload[domain] = parseFloat(fill.dataset.val);
        });
        vscode.postMessage({ type: 'save-ai-temperature', temperature: payload });
        
        behaviorSaveBtn.innerText = 'Saved!';
        setTimeout(() => { behaviorSaveBtn.innerText = 'Save Profile'; }, 2000);
      });
    }
  `;
}
