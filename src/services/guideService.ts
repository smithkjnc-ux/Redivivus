// [SCOPE] Guide Service orchestrator — thin facade over content and markdown modules
// Split from 202-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import type { ChassisService } from './chassisService.js';
import type { SessionService } from './sessionService.js';
import { buildGuide } from './guideContent.js';
import { mdToHtml } from './guideMarkdown.js';

export class GuideService {
  constructor(
    private chassis: ChassisService,
    private sessions: SessionService
  ) {}

  async showGuide(): Promise<void> {
    const content = buildGuide();
    const panel = vscode.window.createWebviewPanel(
      'chassisGuide',
      'What is CHASSIS?',
      vscode.ViewColumn.Two,
      { enableScripts: false }
    );
    panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #e6edf3; background: #0d1117; line-height: 1.6; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 16px; color: #58a6ff; }
  h2 { font-size: 16px; font-weight: 600; margin-top: 20px; margin-bottom: 8px; color: #e6edf3; }
  p  { margin-bottom: 10px; font-size: 13px; }
  ul, ol { margin-bottom: 12px; padding-left: 20px; }
  li { margin-bottom: 4px; font-size: 13px; }
  code { background: #21262d; padding: 2px 6px; border-radius: 4px; font-size: 12px; font-family: 'SF Mono', monospace; }
  pre { background: #21262d; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 12px; font-size: 12px; }
  th, td { border: 1px solid #30363d; padding: 6px 10px; text-align: left; }
  th { background: #161b22; font-weight: 600; }
  hr { border: none; border-top: 1px solid #30363d; margin: 16px 0; }
</style>
</head>
<body>
${mdToHtml(content)}
</body>
</html>`;
  }
}
