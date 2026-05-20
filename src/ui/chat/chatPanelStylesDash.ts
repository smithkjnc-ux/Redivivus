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
  `;
}
