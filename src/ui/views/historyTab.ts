// [SCOPE] CHASSIS History tab — past sessions and file reviews

import * as path from 'path';
import * as fs from 'fs';
import { ChassisService } from '../../services/chassisService.js';

export function getSessionHistory(chassis: ChassisService): {html:string,path:string}[] {
  if (!chassis.isInitialized()) return [];
  const sessDir = chassis.sessionsDir;
  if (!fs.existsSync(sessDir)) return [];
  try {
    const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 10);
    return files.map(f => {
      try {
        // [WARN] Parsing external JSON data can be fragile; gracefully handled by the surrounding try/catch.
        const data = JSON.parse(fs.readFileSync(path.join(sessDir, f), 'utf-8'));
        const date = data.startedAt ? new Date(data.startedAt).toLocaleDateString() : '';
        return {
          html: '<strong>' + date + '</strong> — ' + (data.ai || '') + ' — ' + (data.goal || '').substring(0, 60),
          path: path.join(sessDir, f)
        };
      } catch { return { html: f, path: path.join(sessDir, f) }; }
    });
  } catch { return []; }
}

export function getReviews(chassis: ChassisService): {html:string,path:string}[] {
  if (!chassis.isInitialized()) return [];
  const revDir = path.join(chassis.chassisDir, 'reviews');
  if (!fs.existsSync(revDir)) return [];
  try {
    return fs.readdirSync(revDir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 10)
      .map(f => ({
        html: f.replace('_review.md', '').replace(/_/g, '.'),
        path: path.join(revDir, f)
      }));
  } catch { return []; }
}

export function renderHistoryTab(
  sessions: {html:string,path:string}[],
  reviews: {html:string,path:string}[],
  isActive: boolean
): string {
  let html = `<div id="tab-history" class="tab-content ${isActive ? 'active' : ''}">`;
  if (sessions.length === 0 && reviews.length === 0) {
    html += '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">No history yet. Start a session or review a file to see it here.</div></div>';
  } else {
    if (sessions.length > 0) {
      html += '<div class="section-title">Past Sessions</div><div class="list">';
      for (const s of sessions) { html += '<div class="list-item" data-openfile="' + s.path + '" style="cursor:pointer;">' + s.html + '</div>'; }
      html += '</div>';
    }
    if (reviews.length > 0) {
      html += '<div class="section-title">File Reviews</div><div class="list">';
      for (const r of reviews) { html += '<div class="list-item" data-openfile="' + r.path + '" style="cursor:pointer;">' + r.html + '</div>'; }
      html += '</div>';
    }
  }
  html += '</div>';
  return html;
}