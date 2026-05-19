// [SCOPE] CHASSIS project dashboard — idle screen shown when a project is loaded
// Renders blueprint summary, recent build activity, and project stats instead of bare "Ready to Build".

import * as fs from 'fs';
import * as path from 'path';
import { SetupProgress } from '../../services/project/setupProgressService.js';
import { ChatHeaderInfo } from './chatPanelHtml.js';

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
        if (f.startsWith('.') || f === 'node_modules') continue;
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) c += countFiles(full);
        else if (/\.(ts|js|py|html|css|jsx|tsx|go|rs|rb|java|c|cpp|swift|kt)$/.test(f)) c++;
      }
      return c;
    };
    fileCount = countFiles(root);
  } catch {}
  return { blueprint, recentBuilds, fileCount, deadEndCount, buildCount };
}

export function buildProjectDashboard(header: ChatHeaderInfo, progress: SetupProgress | undefined, data?: DashboardData): string {
  const name = h(header.projectName || 'Project');
  const modeToggle = !header.buildMode ? `<div style="text-align:center;margin-bottom:10px;"><button class="mode-btn" data-action="set-mode" data-mode="direct" style="background:none;border:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:12px;opacity:0.8;padding:3px 8px;">&#x26A1; Skip questions &mdash; Just Build</button></div>` : '';
  const bp = data?.blueprint;
  const blueprintHtml = (bp?.what || bp?.who) ? `<div style="background:var(--vscode-editor-inactiveSelectionBackground);border:1px solid var(--vscode-panel-border);border-radius:6px;padding:10px 14px;margin:0 auto 12px;max-width:480px;font-size:12px;text-align:left;">${bp?.what ? `<div style="margin-bottom:4px;"><span style="opacity:0.5;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;">WHAT</span> &mdash; ${h(bp.what)}</div>` : ''}${bp?.who ? `<div style="margin-bottom:4px;"><span style="opacity:0.5;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;">WHO</span> &mdash; ${h(bp.who)}</div>` : ''}${bp?.why ? `<div><span style="opacity:0.5;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;">WHY</span> &mdash; ${h(bp.why)}</div>` : ''}</div>` : '';
  const si = [
    data?.fileCount ? `&#x1F4C4; ${data.fileCount} file${data.fileCount !== 1 ? 's' : ''}` : '',
    data?.buildCount ? `&#x1F528; ${data.buildCount} build${data.buildCount !== 1 ? 's' : ''}` : '',
    data?.deadEndCount ? `&#x1F6AB; ${data.deadEndCount} dead end${data.deadEndCount !== 1 ? 's' : ''}` : '',
    header.usageReport?.session.tokens ? `&#x1F4B0; ${header.usageReport.session.tokens.toLocaleString()} tokens today` : '',
  ].filter(Boolean);
  const statsHtml = si.length ? `<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;font-size:11px;opacity:0.6;margin-bottom:12px;">${si.map(s => `<span>${s}</span>`).join('')}</div>` : '';
  const recentHtml = data?.recentBuilds.length ? `<div style="max-width:480px;margin:0 auto 12px;background:var(--vscode-editor-inactiveSelectionBackground);border:1px solid var(--vscode-panel-border);border-radius:6px;overflow:hidden;"><div style="padding:5px 10px;font-size:10px;font-weight:700;opacity:0.5;border-bottom:1px solid var(--vscode-panel-border);letter-spacing:0.5px;">RECENT ACTIVITY</div>${data.recentBuilds.slice(0, 4).map(b => { const d = new Date(b.timestamp); const dt = d.toLocaleDateString() + ' ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); return `<div style="padding:6px 10px;border-bottom:1px solid var(--vscode-panel-border);font-size:12px;"><div style="opacity:0.45;font-size:10px;">${dt}</div><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:2px 0;">${h(b.task.slice(0, 90))}</div><div style="opacity:0.45;font-size:10px;">${b.files.length} file${b.files.length !== 1 ? 's' : ''} &middot; $${b.costUSD.toFixed(4)} &middot; ${b.tokensUsed.toLocaleString()} tokens</div></div>`; }).join('')}</div>` : '';
  const progressHtml = progress ? `<div style="margin:0 auto 12px;max-width:480px;padding:10px 14px;background:var(--vscode-editor-inactiveSelectionBackground);border-radius:6px;border:1px solid var(--vscode-panel-border);"><div style="display:flex;justify-content:space-between;margin-bottom:5px;"><strong style="font-size:12px;">Setup Progress</strong><span style="font-size:11px;opacity:0.7;">${progress.percentage}%</span></div><div style="width:100%;height:4px;background:var(--vscode-editorWidget-background);border-radius:2px;overflow:hidden;margin-bottom:8px;"><div style="height:100%;width:${progress.percentage}%;background:${progress.percentage===100?'#4ec959':'#3b9dff'};"></div></div><div style="text-align:center;"><button class="onboarding-pill" data-cmd="chassis.showSetupProgress" style="display:inline-block;padding:4px 10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer;border-radius:4px;font-size:11px;">&#x1F4CA; View Checklist</button></div></div>` : '';
  return `<div class="empty-state" style="padding:18px 24px;">${modeToggle}<div class="icon" style="font-size:32px;margin-bottom:6px;">&#x1F680;</div><div class="onboarding-title" style="font-size:18px;margin-bottom:12px;">${name}</div>${blueprintHtml}${statsHtml}${recentHtml}${progressHtml}<div class="onboarding-examples"><div class="onboarding-pill" data-cmd="chassis.startSession">&#x25B6;&#xFE0F; Start Session</div><div class="onboarding-pill" data-cmd="chassis.buildFromVault">&#x1F3D7;&#xFE0F; Build from Vault</div><div class="onboarding-pill" data-action="start-new-project" data-mode="direct">&#x2795; New Project</div></div><div class="onboarding-hint">Or just type your request and hit Enter.</div></div>`;
}

function h(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
