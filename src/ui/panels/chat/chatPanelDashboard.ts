// [SCOPE] CHASSIS project dashboard — idle screen shown when a project is loaded
// Renders blueprint summary, recent build activity, and project stats instead of bare "Ready to Build".

import * as fs from 'fs';
import * as path from 'path';
import type { SetupProgress } from '../../../services/project/setupProgressService';
import type { ChatHeaderInfo } from './chatPanelHtml';

export interface DashboardData {
  blueprint?: { who?: string; what?: string; why?: string; where?: string; when?: string };
  recentBuilds: Array<{ timestamp: string; task: string; files: string[]; costUSD: number; tokensUsed: number }>;
  fileCount: number;
  deadEndCount: number;
  buildCount: number;
}

export function readDashboardData(root: string, config: any): DashboardData {
  const blueprint = config?.blueprint;
  let recentBuilds: DashboardData['recentBuilds'] = [];
  let buildCount = 0;
  try {
    const histPath = path.join(root, '.chassis', 'build_history.json');
    if (fs.existsSync(histPath)) {
      const hist: any[] = JSON.parse(fs.readFileSync(histPath, 'utf-8'));
      buildCount = hist.length;
      recentBuilds = hist.slice(-5).reverse().map(b => ({
        timestamp: b.timestamp, task: b.task, files: b.files || [],
        costUSD: b.costUSD || 0, tokensUsed: b.tokensUsed || 0,
      }));
    }
  } catch {}
  let deadEndCount = 0;
  try {
    const dePath = path.join(root, '.chassis', 'dead_ends.md');
    if (fs.existsSync(dePath)) { deadEndCount = (fs.readFileSync(dePath, 'utf-8').match(/^## /gm) || []).length; }
  } catch {}
  let fileCount = 0;
  try {
    const countFiles = (dir: string): number => {
      let c = 0;
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('.') || f === 'node_modules') {continue;}
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {c += countFiles(full);}
        else if (/\.(ts|js|py|html|css|jsx|tsx|go|rs|rb|java|c|cpp|swift|kt)$/.test(f)) {c++;}
      }
      return c;
    };
    fileCount = countFiles(root);
  } catch {}
  return { blueprint, recentBuilds, fileCount, deadEndCount, buildCount };
}

export function buildProjectDashboard(header: ChatHeaderInfo, progress: SetupProgress | undefined, data?: DashboardData): string {
  const name = h(header.projectName || 'Project');
  // Stats pills
  const stats = [
    data?.fileCount ? `&#x1F4C4; ${data.fileCount} file${data.fileCount !== 1 ? 's' : ''}` : '',
    data?.buildCount ? `&#x1F528; ${data.buildCount} build${data.buildCount !== 1 ? 's' : ''}` : '',
    data?.deadEndCount ? `&#x1F6AB; ${data.deadEndCount} dead end${data.deadEndCount !== 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  const statsRow = stats.length ? `<div class="dash-stats">${stats.map(s => `<span class="dash-stat">${s}</span>`).join('')}</div>` : '';
  // Blueprint card
  const bp = data?.blueprint;
  const bpRows = [bp?.what ? `<div class="dash-bp-row"><span class="dash-bp-key">WHAT</span>${h(bp.what)}</div>` : '', bp?.who ? `<div class="dash-bp-row"><span class="dash-bp-key">WHO</span>${h(bp.who)}</div>` : '', bp?.why ? `<div class="dash-bp-row"><span class="dash-bp-key">WHY</span>${h(bp.why)}</div>` : ''].filter(Boolean).join('');
  const bpCard = bpRows ? `<div class="dash-section"><div class="dash-section-label">&#x1F4CB; Blueprint</div><div class="dash-bp-card">${bpRows}</div></div>` : `<div class="dash-section"><div class="dash-section-label">&#x1F4CB; Blueprint</div><div class="dash-bp-empty">No blueprint yet &mdash; <span class="dash-link" data-cmd="chassis.blueprintInterview">create one</span></div></div>`;
  // Recent activity
  const actRows = data?.recentBuilds.length ? data.recentBuilds.slice(0, 3).map(b => { const ago = _ago(b.timestamp); return `<div class="dash-act-row" title="${h(b.task)}"><div class="dash-act-task">${h(b.task.slice(0, 50))}${b.task.length > 50 ? '...' : ''}</div><div class="dash-act-meta">${b.files.length} file${b.files.length !== 1 ? 's' : ''} &middot; $${b.costUSD.toFixed(4)} &middot; ${ago}</div></div>`; }).join('') : `<div class="dash-act-empty">No builds yet &mdash; type a request to start</div>`;
  const actCard = `<div class="dash-section"><div class="dash-section-label">&#x1F552; Recent Activity</div>${actRows}</div>`;
  // Progress bar (inline compact)
  const progBar = progress && progress.percentage < 100 ? `<div class="dash-progress" data-cmd="chassis.showSetupProgress" title="Setup ${progress.percentage}% complete -- click for checklist"><div class="dash-progress-label">Setup ${progress.percentage}%</div><div class="dash-progress-track"><div class="dash-progress-fill" style="width:${progress.percentage}%"></div></div></div>` : '';
  // Show Edit Visually pill when any recent build produced HTML or CSS
  const hasVisualFiles = data?.recentBuilds.some(b => b.files.some(f => /\.(html|css)$/i.test(f)));
  const editVisuallyPill = hasVisualFiles
    ? `<button class="dash-action-pill dash-action-visual" data-cmd="chassis.openVisualEditor" title="Open the Visual Contract Editor to change colors, text, and layout">&#x270F;&#xFE0F; Edit Visually</button>`
    : '';
  // Actions
  const actions = `<div class="dash-actions">
    <button class="dash-action-pill" data-cmd="chassis.startSession" title="Start a focused work session with goals and tracking">&#x25B6;&#xFE0F; Start Session</button>
    <button class="dash-action-pill" data-cmd="chassis.buildFromVault" title="Build new code using your saved Vault snippets">&#x1F3D7;&#xFE0F; Build from Vault</button>
    ${editVisuallyPill}
    <button class="dash-action-pill" data-action="start-new-project" data-mode="direct" title="Start a different project">&#x2795; New Project</button>
    <button class="dash-action-pill dash-action-close" data-cmd="workbench.action.closeFolder" title="Close this project and return to the launcher">&#x2716; Close Project</button>
  </div>`;
  return `<div class="empty-state dash-root">
    <div class="dash-hero"><span class="dash-hero-icon">&#x1F680;</span><div class="dash-hero-text"><div class="onboarding-title" style="font-size:18px;font-weight:700;">${name}</div>${statsRow}</div></div>
    ${progBar}
    <div class="dash-grid">${bpCard}${actCard}</div>
    ${actions}
    <div class="onboarding-hint">Or just type your request below</div>
  </div>`;
}

function h(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _ago(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) {return 'just now';} if (d < 3600000) {return Math.floor(d/60000) + 'm ago';}
  if (d < 86400000) {return Math.floor(d/3600000) + 'h ago';}
  if (d < 604800000) {return Math.floor(d/86400000) + 'd ago';}
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
