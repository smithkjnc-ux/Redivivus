// [SCOPE] Dashboard CSS — styles for the project-open dashboard (dash-root, dash-grid, etc.)
// Split from chatPanelStylesMid.ts to stay under 200 lines.

export function buildChatCssDash(): string {
  return `
    /* ── Dashboard: project-open compact view ── */
    .dash-root { padding: 14px 18px 10px !important; gap: 10px !important; justify-content: flex-start !important; }
    .dash-hero { display: flex; align-items: center; gap: 10px; }
    .dash-hero-icon { font-size: 28px; filter: drop-shadow(0 3px 10px rgba(77,158,255,0.3)); }
    .dash-hero-text { text-align: left; }
    .dash-stats { display: flex; gap: 10px; margin-top: 3px; }
    .dash-stat { font-size: 10px; color: var(--c-text-faint); }

    .dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 480px; }
    .dash-section { text-align: left; }
    .dash-section-label { font-size: 10px; font-weight: 700; color: var(--c-text-faint); letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 5px; padding-left: 2px; }

    .dash-bp-card {
      background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 8px;
      padding: 8px 10px; font-size: 11px; color: var(--c-text-dim); line-height: 1.45;
    }
    .dash-bp-row { margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .dash-bp-row:last-child { margin-bottom: 0; }
    .dash-bp-key { font-size: 9px; font-weight: 700; color: var(--c-text-faint); letter-spacing: 0.4px; text-transform: uppercase; margin-right: 6px; }
    .dash-bp-empty { font-size: 11px; color: var(--c-text-faint); font-style: italic; padding: 6px 0; }
    .dash-link { color: var(--c-accent); cursor: pointer; text-decoration: none; font-style: normal; }
    .dash-link:hover { text-decoration: underline; }

    .dash-act-row {
      background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 6px;
      padding: 5px 8px; margin-bottom: 3px; cursor: default;
    }
    .dash-act-row:last-child { margin-bottom: 0; }
    .dash-act-task { font-size: 11px; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dash-act-meta { font-size: 10px; color: var(--c-text-faint); margin-top: 1px; }
    .dash-act-empty { font-size: 11px; color: var(--c-text-faint); font-style: italic; padding: 6px 0; }

    .dash-progress {
      display: flex; align-items: center; gap: 8px; width: 100%; max-width: 480px;
      cursor: pointer; padding: 4px 2px; border-radius: 4px; transition: background 0.15s;
    }
    .dash-progress:hover { background: var(--c-accent-lo); }
    .dash-progress-label { font-size: 10px; font-weight: 600; color: var(--c-accent); white-space: nowrap; }
    .dash-progress-track { flex: 1; height: 4px; background: var(--c-border); border-radius: 2px; overflow: hidden; }
    .dash-progress-fill { height: 100%; background: var(--c-accent); border-radius: 2px; transition: width 0.3s; }

    .dash-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; max-width: 480px; width: 100%; }
    .dash-action-pill {
      background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 16px;
      padding: 5px 12px; font-size: 11px; font-weight: 600; color: var(--c-text-dim);
      cursor: pointer; transition: all 0.15s; font-family: inherit;
    }
    .dash-action-pill:hover { border-color: var(--c-accent); background: var(--c-accent-lo); color: var(--c-text); }
    .dash-action-close { color: var(--c-text-faint); }
    .dash-action-close:hover { border-color: #f44336; color: #f44336; background: rgba(244,67,54,0.08); }
    .dash-action-visual { border-color: #89b4fa55; color: #89b4fa; }
    .dash-action-visual:hover { border-color: #89b4fa; background: rgba(137,180,250,0.1); color: #89b4fa; }
    /* ── Embedded Visual Editor drawer ── */
    #ve-drawer { width: 250px; flex-shrink: 0; background: #13131f; border-left: 1px solid #313244; display: none; flex-direction: column; overflow: hidden; }
    #ve-drawer.open { display: flex; }
    .ve-hdr { display: flex; align-items: center; gap: 5px; padding: 5px 6px; border-bottom: 1px solid #313244; flex-shrink: 0; flex-wrap: wrap; }
    .ve-mtoggle { display: flex; border: 1px solid #45475a; border-radius: 4px; overflow: hidden; }
    .ve-mtoggle button { padding: 1px 7px; font-size: 10px; background: transparent; color: #a6adc8; border: none; cursor: pointer; }
    .ve-mtoggle button.active { background: #89b4fa; color: #1e1e2e; font-weight: 600; }
    #ve-apply { padding: 2px 8px; background: #a6e3a1; color: #1e1e2e; border: none; border-radius: 4px; font-size: 10px; font-weight: 700; cursor: pointer; }
    #ve-apply:disabled { background: #313244; color: #6c7086; cursor: not-allowed; }
    #ve-close { margin-left: auto; background: transparent; border: none; color: #6c7086; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; }
    #ve-close:hover { color: #cdd6f4; }
    .ve-tabs { display: flex; flex-wrap: wrap; gap: 1px; padding: 3px 3px 0; background: #13131f; flex-shrink: 0; }
    .ve-tabs button { padding: 2px 7px; font-size: 10px; background: transparent; color: #a6adc8; border: 1px solid transparent; border-radius: 3px 3px 0 0; cursor: pointer; }
    .ve-tabs button.active { background: #1e1e2e; color: #cdd6f4; border-color: #313244; }
    .ve-canvas { flex: 1; overflow-y: auto; padding: 2px; }
    .ve-status { font-size: 10px; color: #a6e3a1; opacity: 0; transition: opacity 0.3s; flex: 1; }
    .ve-status.show { opacity: 1; }
    .ve-empty { padding: 10px; font-size: 11px; color: #6c7086; }
    .ve-list { display: flex; flex-direction: column; gap: 1px; }
    .ve-row { display: flex; align-items: center; gap: 5px; padding: 0 5px; background: #181825; height: 24px; overflow: hidden; border-bottom: 1px solid #23243a; cursor: pointer; }
    .ve-row:hover { background: #1e1e2e; }
    .ve-row.active { background: #0d1f2d; outline: 1px solid #89b4fa; outline-offset: -1px; }
    .ve-row label { flex: 1; font-size: 11px; color: #a6adc8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; cursor: default; }
    .ve-row input[type=color] { width: 20px; height: 16px; border: none; border-radius: 2px; cursor: pointer; background: transparent; padding: 0; flex-shrink: 0; }
    .ve-row input[type=text] { flex: 1; padding: 1px 4px; background: #313244; border: 1px solid #45475a; border-radius: 3px; color: #cdd6f4; font-size: 11px; min-width: 0; }
    .ve-row input[type=range] { flex: 1; accent-color: #89b4fa; min-width: 0; }
    .ve-row .ve-num { width: 36px; padding: 1px 3px; background: #313244; border: 1px solid #45475a; border-radius: 3px; color: #cdd6f4; font-size: 10px; text-align: right; flex-shrink: 0; }
    .ve-row .ve-unit { font-size: 10px; color: #6c7086; width: 18px; flex-shrink: 0; }
  `;
}
