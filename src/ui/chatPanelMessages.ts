// [SCOPE] CHASSIS Chat Panel message handler — routes all webview → extension messages
// [WARN] This file is 218 lines — exceeds 200-line limit. See [NEXT] marker.
// [NEXT] Split: Extract undo-build + open-file + create-file handlers (~lines 123-165) → chatPanelFileOps.ts when next handler added

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RoutingService } from '../services/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { ChassisService } from '../services/chassisService.js';
import { ChatMessage } from './chatPanelHtml.js';
import { buildAIPrefix, processAIResponse } from './chatPanelAI.js';
import { ProjectOperations } from '../services/projectOperations.js';
import { LearnedMemoryService } from '../services/learnedMemoryService.js';
import { debugLog } from '../services/diagnosticLogger.js';
import { tryRouteToVSCodeCommand } from '../services/commandRouter.js';
import { resolveBuildConfirm, resolvePlacement } from './chatPanelIntent.js';
import { hasPendingScopeQuestion, resolveScopeQuestion, clearPendingScopeQuestion, getScopeQuestionTimestamp } from '../services/templateScopeService.js';
import { resolveVaultHit } from './chatPanelBuild.js';
import { ChatPanel } from './chatPanel.js';

// Lightweight pre-screen — only send to AI if message looks like a preference/decision statement
const PREFERENCE_RE = /\b(i prefer|i want|always use|never use|use only|don'?t use|we decided|we always|entry point is|main file is|i like|i hate|i don'?t like|our stack|our framework|we use|keep it|make sure|remember that|from now on)\b/i;

// [CHASSIS] Explicit build triggers — only these words trigger the build pipeline
// Everything else defaults to chat/answer mode for responsiveness (Windsurf-style)
const BUILD_TRIGGER_RE = /\b(build|create|make|generate|write|add|implement|code|develop|produce)\s+(a|an|the|my|new|some|that|this|those)?\s*(website|app|application|page|site|component|function|class|file|code|script|tool|api|backend|frontend|feature|thing|project|module|library|plugin|extension|html|css|js|ts|python|go|rust|java|component|form|button|handler|utility)/i;

// [CHASSIS] Architect review text store — keyed by reviewId, used by action handlers
const _architectReviews = new Map<string, string>();
// [CHASSIS] Fix-one-at-a-time state — keyed by reviewId
const _architectFixState = new Map<string, { issues: string[]; index: number }>();

export interface MessageHandlerDeps {
  chassis: ChassisService;
  routing: RoutingService;
  usageTracker?: UsageTracker;
  conversation: ChatMessage[];
  panel: vscode.WebviewPanel;
  isBuildRequest: (text: string) => Promise<boolean>;
  classifyIntent?: (text: string) => Promise<{ type: 'build' | 'command' | 'question' | 'offtopic'; command?: string }>;
  handleBuildRequest: (task: string, skipComplex?: boolean, isFixRequest?: boolean) => Promise<void>;
  buildFromVaultPrefill: () => { task?: string; targetFile?: string };
  refresh: () => void;
  setLastModel?: (model: string) => void;
  onStartSession?: (goal: string, ai: string) => Promise<void>;
  onSwitchAI?: (ai: string) => Promise<void>;
  onNewProject?: (name: string, answers: Record<string, string>, folderPath?: string) => Promise<void>;
}

export async function handleChatMessage(msg: any, deps: MessageHandlerDeps): Promise<void> {
  const { chassis, routing, usageTracker, conversation, panel, refresh } = deps;
  const projectOps = new ProjectOperations();

  if (msg.type === 'send-message') {
    const userText = msg.text?.trim();
    if (!userText) { return; }
    const _lastSm = conversation[conversation.length - 1];
    if (!_lastSm || _lastSm.role !== 'user' || _lastSm.content !== userText) {
      conversation.push({ role: 'user', content: userText, timestamp: Date.now() });
    }
    refresh();

    // If CHASSIS asked a scope clarification question, check if this reply is likely the answer
    // [WARN] Only intercept if: (1) question was asked < 2 min ago, (2) reply is short (< 100 chars)
    // Stale or long messages should flow through as normal chat — never silently consumed
    if (hasPendingScopeQuestion()) {
      const scopeAge = Date.now() - getScopeQuestionTimestamp();
      const isRecent = scopeAge < 120_000; // 2 minutes
      const isShort = userText.length < 100;
      if (isRecent && isShort) {
        resolveScopeQuestion(userText);
        return;
      }
      // Stale or long message — clear the pending question and continue as normal chat
      clearPendingScopeQuestion();
    }

    const lowerText = userText.toLowerCase();

    // What templates do you have / show me templates
    if (/what\s+templates|show.*templates|list.*templates|templates.*available|templates.*do\s+you\s+have|what\s+can\s+you\s+build|what\s+types.*build|what.*project.*types/i.test(lowerText)) {
      try {
        const { TEMPLATE_CATEGORIES } = await import('../services/templateRegistry.js');
        const lines: string[] = ['**CHASSIS Template Library** — here\'s what I can build:\n'];
        for (const cat of TEMPLATE_CATEGORIES) {
          lines.push(`**${cat.label}** — ${cat.description}`);
          for (const sub of cat.subcategories) {
            const tags = sub.tags?.slice(0, 3).join(', ') || '';
            lines.push(`  - **${sub.label}**: ${sub.description}${tags ? ' (' + tags + ')' : ''}`);
          }
        }
        lines.push('\nJust say **"build me a [type]"** and I\'ll walk you through it.');
        conversation.push({ role: 'assistant', content: lines.join('\n'), timestamp: Date.now() });
      } catch {
        conversation.push({ role: 'assistant', content: 'I have templates for **Websites** (portfolio, landing page, blog, dashboard), **Games** (arcade, puzzle), **Apps/Tools** (CRUD app, utility), and **APIs/Backends** (Express REST, Python Flask). Just say "build me a [type]" to start.', timestamp: Date.now() });
      }
      refresh();
      return;
    }

    // Scan / analyze project for problems
    if (/scan.*for\s+(problems?|issues?|errors?|bugs?|warnings?)|analyze\s+(the\s+)?project|check\s+(my\s+|the\s+)?project|find.*problems|project.*health|run\s+scan|scan\s+project/i.test(lowerText)) {
      conversation.push({ role: 'assistant', content: 'Running project scan now — opening the Recommendations panel...', timestamp: Date.now() });
      refresh();
      await vscode.commands.executeCommand('chassis.analyze');
      return;
    }

    // What am I working on / current project
    if (/what\s+(am\s+i\s+working|project\s+is\s+this)/i.test(lowerText)) {
      const info = await projectOps.getCurrentProjectInfo();
      const response = `**Current project:** ${info || 'No project info available'}`;
      conversation.push({ role: 'assistant', content: response, timestamp: Date.now() });
      refresh();
      return;
    }

    // How's my setup going / setup progress
    if (/how'?s\s+my\s+setup|setup\s+progress|what'?s\s+left|what\s+to\s+do\s+next/i.test(lowerText)) {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root && chassis) {
        const { SetupProgressService } = await import('../services/setupProgressService.js');
        const { showSetupProgressPanel } = await import('../services/setupProgressPanel.js');
        const progressService = new SetupProgressService(chassis, root);
        const progress = await progressService.getProgress();
        showSetupProgressPanel(progress, () => progressService.getProgress());
        const response = `I've opened the setup progress panel for you. You're **${progress.percentage}% complete** (${progress.completedCount} of ${progress.totalCount} steps done).`;
        conversation.push({ role: 'assistant', content: response, timestamp: Date.now() });
        refresh();
        return;
      }
    }

    // --- List CHASSIS projects (show centered webview modal, never QuickPick) ---
    if (/list.*project|show.*project|available.*project|my.*project/i.test(lowerText)) {
      const homeDir = os.homedir();
      const projects: { name: string; fullPath: string }[] = [];
      const dirsToCheck = [
        path.join(homeDir, 'projects'), path.join(homeDir, 'Projects'),
        path.join(homeDir, 'dev'), path.join(homeDir, 'workspace'),
        path.join(homeDir, 'code'), path.join(homeDir, 'src'),
      ];
      for (const dir of dirsToCheck) {
        if (fs.existsSync(dir)) {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const projectPath = path.join(dir, entry.name);
                if (fs.existsSync(path.join(projectPath, '.chassis'))) {
                  projects.push({ name: entry.name, fullPath: projectPath });
                }
              }
            }
          } catch { /* ignore */ }
        }
      }
      const reply = projects.length
        ? `Found **${projects.length} CHASSIS project${projects.length === 1 ? '' : 's'}** — opening the picker now.`
        : 'No CHASSIS projects found in ~/projects, ~/dev, or ~/workspace.';
      conversation.push({ role: 'assistant', content: reply, timestamp: Date.now() });
      refresh();
      if (projects.length) { panel.webview.postMessage({ type: 'show-projects-modal', projects }); }
      return;
    }

    // --- VS Code command intercept (zero AI cost) ---
    console.log('[DEBUG CHAT MESSAGES] Checking VS Code command for:', userText);
    const vsCodeHandled = await tryRouteToVSCodeCommand(userText);
    console.log('[DEBUG CHAT MESSAGES] VS Code handled:', vsCodeHandled);
    if (vsCodeHandled) {
      conversation.push({ role: 'assistant', content: `✅ Done — executed: *${userText}*`, timestamp: Date.now() });
      refresh();
      return;
    }

    // --- Hardcoded offtopic pre-screen (zero tokens, zero AI cost) ---
    const OFFTOPIC_KEYWORDS = /\b(weather|forecast|temperature|recipe|cook(ing)?|sports score|nba|nfl|mlb|joke|funny|travel|vacation|celebrity|movie review|song lyrics|restaurant|food delivery|news today|politics|stock price|crypto|bitcoin|horoscope|dating tip)\b/i;
    const DEV_OVERRIDE = /\b(api|debug|code|build|deploy|server|database|function|component|script|project|file|test|error|bug|fix|performance|architecture|framework|library)\b/i;
    if (OFFTOPIC_KEYWORDS.test(userText) && !DEV_OVERRIDE.test(userText)) {
      conversation.push({ role: 'assistant', content: "I'm a coding assistant — I can help you build, fix, explain, or review code and projects. For anything else, I'm not the right tool. What are you building today?", timestamp: Date.now() });
      refresh();
      return;
    }

    // --- Hardcoded command pre-screen (zero tokens, deterministic — Rule 18) ---
    // openProject: "open the doaidream project", "switch to ryppel project", "load chassis project"
    const openProjectMatch = userText.match(/\b(?:open|switch\s+to|load|go\s+to)\s+(?:the\s+)?(\w[\w-]*)\s+project\b/i);
    if (openProjectMatch) {
      const projectName = openProjectMatch[1];
      conversation.push({ role: 'assistant', content: `Opening project: ${projectName}...`, timestamp: Date.now() });
      refresh();
      const opened = await projectOps.openProject(projectName);
      if (!opened) {
        const homeDir = os.homedir();
        const projects: { name: string; fullPath: string }[] = [];
        for (const dir of [path.join(homeDir, 'projects'), path.join(homeDir, 'dev'), path.join(homeDir, 'workspace')]) {
          if (fs.existsSync(dir)) {
            try {
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                  const pp = path.join(dir, entry.name);
                  if (fs.existsSync(path.join(pp, '.chassis'))) {
                    projects.push({ name: entry.name, fullPath: pp });
                  }
                }
              }
            } catch { /* ignore */ }
          }
        }
        conversation.push({ role: 'assistant', content: `Project "${projectName}" not found. Here are your available CHASSIS projects:`, timestamp: Date.now() });
        refresh();
        panel.webview.postMessage({ type: 'show-projects-modal', projects });
      }
      return;
    }

    // showMap: "show me the architecture map", "open the map", "view dependency map", etc.
    if (/\b(?:show|open|view|display)\s+(?:me\s+)?(?:the\s+)?(?:architecture\s+|dependency\s+|project\s+)?map\b/i.test(userText) ||
        /\barchitecture\s+(?:map|view|diagram)\b/i.test(userText)) {
      const hasWorkspace = !!vscode.workspace.workspaceFolders?.[0];
      if (!hasWorkspace) {
        conversation.push({ role: 'assistant', content: 'No project is open — open a project first, then I can show you the architecture map.', timestamp: Date.now() });
        refresh();
      } else {
        conversation.push({ role: 'assistant', content: 'Opening architecture map...', timestamp: Date.now() });
        refresh();
        try { await vscode.commands.executeCommand('chassis.showMap'); } catch { /* ignore */ }
      }
      return;
    }

    // --- Project info request — reads blueprint, never guesses ---
    const currentProjectName = chassis?.loadConfig?.()?.projectName
      || vscode.workspace.workspaceFolders?.[0]?.name || '';
    const isProjectInfoRequest = currentProjectName && (
      new RegExp(`\\b(?:what\\s+is|tell\\s+me\\s+(?:what|about)|what\\s+does|describe|explain)\\s+(?:the\\s+)?${currentProjectName}\\b`, 'i').test(userText) ||
      /\b(?:what\s+is\s+this\s+project|tell\s+me\s+about\s+this\s+(?:project|app|program)|what\s+does\s+this\s+(?:project|app|program)\s+do)\b/i.test(userText)
    );
    if (isProjectInfoRequest) {
      const config = chassis?.loadConfig?.();
      const bp = config?.blueprint;
      const hasBlueprint = bp && (bp.who || bp.what || bp.where || bp.why);
      if (!hasBlueprint) {
        conversation.push({
          role: 'assistant',
          content: `CHASSIS hasn't analyzed **${currentProjectName}** yet — the blueprint is empty, so I can't give you a qualified answer.\n\nWould you like to run the Blueprint Interview? Once complete, I'll know exactly what this project does, who it's for, and how it's structured.\n\n\n__ACTION_CARD__chassis.openBlueprint|||Run Blueprint Interview|||END__`,
          timestamp: Date.now()
        });
        refresh();
        return;
      }
      // Blueprint exists — build context and answer from real data
      let bpContext = `Project name: ${currentProjectName}\n`;
      if (bp.who) { bpContext += `Who it's for: ${bp.who}\n`; }
      if (bp.what) { bpContext += `What it does: ${bp.what}\n`; }
      if (bp.where) { bpContext += `Where it runs: ${bp.where}\n`; }
      if (bp.why) { bpContext += `Why it exists: ${bp.why}\n`; }
      const prompt = `You are CHASSIS AI. The user asked what the project "${currentProjectName}" is. Answer clearly and concisely using ONLY the blueprint data below. Do not guess or add information not in the blueprint.\n\n${bpContext}\nAnswer in 3-5 sentences max.`;
      try {
        const aiResponse = await routing.prompt(prompt);
        conversation.push({ role: 'assistant', content: aiResponse.text || '', timestamp: Date.now() });
      } catch {
        conversation.push({ role: 'assistant', content: `Based on the blueprint: ${bpContext}`, timestamp: Date.now() });
      }
      refresh();
      return;
    }

    // --- Intent routing: Windsurf-style fast-path ---
    // [CHASSIS] Check explicit build triggers first (zero AI latency)
    // Everything else defaults to chat mode - no AI classification needed
    let intent: { type: 'build' | 'command' | 'question' | 'offtopic'; command?: string };
    if (BUILD_TRIGGER_RE.test(userText)) {
      intent = { type: 'build' };
    } else {
      // Default to chat for responsiveness - let the AI figure it out organically
      intent = { type: 'question' };
    }

    if (intent.type === 'command' && intent.command) {
      // Execute locally — no AI call needed
      const { commandLabel } = await import('./chatPanelAI.js');
      const label = commandLabel(intent.command);
      // Special pre-messages for project-switching commands
      if (intent.command === 'chassis.openProject') {
        const projectNameMatch = userText.match(/\b(?:open|switch\s+(?:over\s+)?to|load|go\s+to|launch|start)\s+(?:the\s+)?(\w[\w-]*)\s+project\b/i);
        let projectName = projectNameMatch?.[1];
        // Fallback: scan known projects and find any name mentioned in the message
        if (!projectName) {
          const homeDir = os.homedir();
          for (const dir of [path.join(homeDir, 'projects'), path.join(homeDir, 'dev')]) {
            if (fs.existsSync(dir)) {
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory() && userText.toLowerCase().includes(entry.name.toLowerCase())) {
                  projectName = entry.name;
                  break;
                }
              }
            }
            if (projectName) { break; }
          }
        }
        if (projectName) {
          conversation.push({ role: 'assistant', content: `Opening project: ${projectName}...`, timestamp: Date.now() });
          refresh();
          // Rule 18: Code executes — no AI in this path
          const opened = await projectOps.openProject(projectName);
          if (!opened) {
            // Not found — fall back to showing picker
            const { chassis: _c, routing: _r, ...rest } = deps;
            const homeDir = os.homedir();
            const projects: { name: string; fullPath: string }[] = [];
            for (const dir of [path.join(homeDir, 'projects'), path.join(homeDir, 'dev')]) {
              if (fs.existsSync(dir)) {
                try {
                  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (entry.isDirectory()) {
                      const pp = path.join(dir, entry.name);
                      if (fs.existsSync(path.join(pp, '.chassis'))) {
                        projects.push({ name: entry.name, fullPath: pp });
                      }
                    }
                  }
                } catch { /* ignore */ }
              }
            }
            conversation.push({ role: 'assistant', content: `Project "${projectName}" not found — here are your CHASSIS projects:`, timestamp: Date.now() });
            refresh();
            panel.webview.postMessage({ type: 'show-projects-modal', projects });
          }
        } else {
          conversation.push({ role: 'assistant', content: 'Opening project picker...', timestamp: Date.now() });
          refresh();
          try { await vscode.commands.executeCommand(intent.command); } catch { /* ignore */ }
        }
      } else if (intent.command === 'workbench.action.closeFolder') {
        conversation.push({ role: 'assistant', content: 'Closing current project...', timestamp: Date.now() });
        refresh();
        try {
          const folders = vscode.workspace.workspaceFolders;
          if (folders && folders.length > 0) {
            await vscode.workspace.updateWorkspaceFolders(0, folders.length);
          } else {
            await vscode.commands.executeCommand(intent.command);
          }
        } catch { /* ignore */ }
      } else {
        conversation.push({ role: 'assistant', content: `Running: ${label}\n\n__ACTION_CARD__${intent.command}|||${label}|||END__`, timestamp: Date.now() });
        refresh();
        try { await vscode.commands.executeCommand(intent.command); } catch { /* ignore */ }
      }
      return;
    }

    // Handle offtopic messages with hardcoded response — NO AI call
    if (intent.type === 'offtopic') {
      conversation.push({ role: 'assistant', content: "I'm a coding assistant — I can help you build, fix, explain, or review code and projects. For anything else, I'm not the right tool. What are you building today?", timestamp: Date.now() });
      refresh();
      return;
    }

    // [FIX] Hardcoded intercept: if user says "yes" and last assistant asked about file picker, open file dialog directly
    const lastAssistantMsg = conversation.filter(m => m.role === 'assistant').pop();
    if (/\b(yes|yeah|sure|ok|please|go ahead)\b/i.test(userText) &&
        lastAssistantMsg &&
        /file picker|open (a|the) file|select a file|browse for (a|the) file/i.test(lastAssistantMsg.content)) {
      conversation.push({ role: 'assistant', content: 'Opening file dialog...', timestamp: Date.now() });
      refresh();
      // Use showOpenDialog with safe default (home) instead of built-in which remembers stale paths
      const defaultUri = vscode.Uri.file(require('os').homedir());
      vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Select File',
        defaultUri
      }).then(files => {
        if (files && files.length > 0) {
          vscode.workspace.openTextDocument(files[0]).then(doc => {
            vscode.window.showTextDocument(doc);
          });
        }
      });
      return;
    }

    if (intent.type === 'build') {
      require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[handleBuildRequest] calling with task=${userText.slice(0,60)}\n`);
      await deps.handleBuildRequest(userText);
      require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[handleBuildRequest] returned\n`);
      return;
    }
    require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[intent] type=${intent.type} — not build, going to question/AI path\n`);

    console.log('[CHASSIS] Chat handler: starting AI call for:', userText.slice(0, 50));
    try {
      deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });
      // Tier 2: pass last 3 user messages (excluding current) for conversation context
      const recentUserMsgs = conversation
        .filter(m => m.role === 'user')
        .slice(-4, -1)
        .map(m => m.content);
      const prefix = buildAIPrefix(chassis, recentUserMsgs, routing, conversation.slice(-14), userText);
      console.log('[CHASSIS] Chat handler: calling routing.prompt...');
      const aiResponse = await routing.prompt(prefix + userText);
      console.log('[CHASSIS] Chat handler: AI response received, success=', aiResponse.success);

      // Check if AI call failed
      if (!aiResponse.success) {
        conversation.push({ role: 'assistant', content: `❌ AI Error: ${aiResponse.error || 'Unknown error'}`, timestamp: Date.now() });
        refresh();
        return;
      }

      const estimatedTokens = Math.ceil(aiResponse.text.length / 4);
      const estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
      const aiId = routing.getAvailableAI().ai;
      await usageTracker?.recordUsage(estimatedTokens, estimatedCost, aiId);
      console.log('[CHASSIS] Chat handler: AI text length=', aiResponse.text.length, 'text=', aiResponse.text.slice(0, 100));
      // Guardian AI review — only for code/build outputs, not chat
      let finalText = aiResponse.text || '';
      const hasCodeBlock = /```[a-z]*\n/i.test(finalText) || /`[^`]+`/.test(finalText);
      const isBuildQuestion = BUILD_TRIGGER_RE.test(userText);
      if (routing.isGuardianActive() && (hasCodeBlock || isBuildQuestion)) {
        const workerAI = routing.getAvailableAI().ai;
        const blueprintCtx = chassis.isInitialized() ? (chassis.loadConfig()?.blueprint ? JSON.stringify(chassis.loadConfig()!.blueprint) : '') : '';
        const review = await routing.guardianReview(userText, finalText, workerAI, blueprintCtx).catch(() => null);
        if (review && !review.passed && review.correctedText) {
          finalText = review.correctedText + `\n\n---\n*\u{1F6E1}\uFE0F Guardian (${review.guardianAI}) reviewed and corrected this response.*`;
        }
      }
      const { text: processedResponse, executedCommand } = processAIResponse(finalText);
      console.log('[CHASSIS] Chat handler: processedResponse length=', processedResponse.length, 'executedCommand=', executedCommand);
      conversation.push({ role: 'assistant', content: processedResponse, timestamp: Date.now(), tokens: estimatedTokens, cost: estimatedCost });
      console.log('[CHASSIS] Chat handler: pushed to conversation, refreshing...');
      refresh(); // [FIX] Always refresh to show the message, even if command was executed
      // Background: check if user message is a preference/decision — write to learned.md immediately
      if (PREFERENCE_RE.test(userText)) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root) {
          LearnedMemoryService.extractFacts([userText], routing).then(({ permanent }) => {
            if (permanent.length > 0) {
              const learned = new LearnedMemoryService(root);
              permanent.forEach(fact => learned.addPermanent(fact));
            }
          }).catch(() => { /* never surface memory errors to user */ });
        }
      }
    } catch (err) {
      console.error('[CHASSIS] Chat handler: ERROR caught:', err);
      conversation.push({ role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, timestamp: Date.now() });
      refresh();
    } finally {
      setTimeout(() => {
        deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
      }, 800);
    }

  } else if (msg.type === 'map-context') {
    // [CHASSIS] Sent by Architecture Map "Chat About This" — Q&A only, never triggers build pipeline
    const { nodeId, label, lines, health, todos } = msg;
    const prompt = msg._explainPrompt
      || ('You are a code reviewer. Answer concisely about this file.\n\nFile: ' + nodeId + '\nDescription: ' + (label || 'No description') + '\nLines: ' + lines + ', Health: ' + health + ', TODOs: ' + todos + '\n\nExplain what this file does, any concerns, and what a developer should know about it. Keep it under 150 words.');
    const displayMsg = msg._displayLabel ? msg._displayLabel + ' `' + nodeId + '`' : (msg._explainPrompt ? 'Explain `' + nodeId + '`' : 'Tell me about `' + nodeId + '`');
    const prefix = buildAIPrefix(chassis, [], routing);
    conversation.push({ role: 'user', content: displayMsg, timestamp: Date.now() });
    refresh();
    try {
      deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });
      const aiResponse = await routing.prompt(prefix + prompt);
      const estimatedTokens = Math.ceil(aiResponse.text.length / 4);
      const estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
      const aiId = routing.getAvailableAI().ai;
      await usageTracker?.recordUsage(estimatedTokens, estimatedCost, aiId);
      let mapText = aiResponse.text || '';
      if (routing.isGuardianActive()) {
        const workerAI = routing.getAvailableAI().ai;
        const review = await routing.guardianReview(displayMsg, mapText, workerAI, '').catch(() => null);
        if (review && !review.passed && review.correctedText) {
          mapText = review.correctedText + `\n\n---\n*\u{1F6E1}\uFE0F Guardian (${review.guardianAI}) reviewed this response.*`;
        }
      }
      const { text: processedResponse } = processAIResponse(mapText);
      let finalContent = processedResponse;
      // Append action menu after Architect Review responses only
      if (msg._displayLabel === 'Architect Review') {
        const reviewId = 'ar-' + Date.now();
        _architectReviews.set(reviewId, mapText);
        finalContent += '\n\n__ARCHITECT_ACTIONS__' + reviewId + '|||END_ARCH_ACTIONS__';
      }
      conversation.push({ role: 'assistant', content: finalContent, timestamp: Date.now(), tokens: estimatedTokens, cost: estimatedCost });
    } catch (err) {
      conversation.push({ role: 'assistant', content: 'Error: ' + (err instanceof Error ? err.message : 'Unknown error'), timestamp: Date.now() });
    } finally {
      setTimeout(() => {
        deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
      }, 800);
    }
    refresh();

  } else if (msg.type === 'undo-build') {
    const { snapshotId } = msg;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root || !snapshotId) {
      conversation.push({ role: 'assistant', content: '❌ Undo failed — no workspace or snapshot ID.', timestamp: Date.now() });
      refresh(); return;
    }
    try {
      const { SnapshotService } = await import('../services/snapshotService.js');
      const snap = new SnapshotService(root);
      const { restored, deleted, error } = snap.restore(snapshotId);
      if (error) {
        conversation.push({ role: 'assistant', content: `❌ Undo failed — ${error}`, timestamp: Date.now() });
      } else {
        conversation.push({ role: 'assistant', content: `↩ **Undone.** Restored ${restored} file${restored !== 1 ? 's' : ''}, deleted ${deleted} new file${deleted !== 1 ? 's' : ''}.`, timestamp: Date.now() });
        try { const { BuildHistoryService } = await import('../services/buildHistoryService.js'); new BuildHistoryService(root).markUndone(snapshotId); } catch { /* best-effort */ }
      }
    } catch (err) {
      conversation.push({ role: 'assistant', content: `❌ Undo error — ${err instanceof Error ? err.message : 'Unknown'}`, timestamp: Date.now() });
    }
    refresh();

  } else if (msg.type === 'build-feedback') {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root && msg.rating === 'bad') {
      try {
        const { LearnedMemoryService } = await import('../services/learnedMemoryService.js');
        const learned = new LearnedMemoryService(root);
        const note = msg.note?.trim();
        if (note && note.length > 5) {
          learned.addNeverDo(note, 'user-reported');
        } else {
          learned.addNeverDo(`User reported build failure for task: ${msg.feedbackId || 'unknown'}`, 'user-reported');
        }
      } catch { /* best-effort */ }

      // [CHASSIS] If user clicked "Try Again with Fix", re-run the build with the note as context
      if (msg.retry && msg.feedbackId) {
        const fbNote = msg.note?.trim();
        const retryTask = fbNote && fbNote.length > 3
          ? `Fix the issue with the last build: ${fbNote}`
          : `The last build had a problem. Review the current file and fix it.`;
        conversation.push({ role: 'user', content: retryTask, timestamp: Date.now() });
        // [CHASSIS] Show the retrying message before the build starts
        conversation.push({ role: 'assistant', content: 'Got it -- retrying with your notes...', timestamp: Date.now() });
        refresh();
        // [WARN] skipComplex=true: retry builds MUST bypass vault/placement/cost gates
        // Root cause of Bug 2: without this, the retry stalls on modals the user never sees
        await deps.handleBuildRequest(retryTask, true, true);
        return;
      }
    }

  } else if (msg.type === 'open-file') {
    const filePath = msg.filePath;
    if (filePath && fs.existsSync(filePath)) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc, { preview: false });
    }

  } else if (msg.type === 'open-in-browser') {
    const filePath = msg.filePath;
    if (filePath && fs.existsSync(filePath)) {
      const uri = vscode.Uri.file(filePath);
      // Try VS Code's built-in simple browser first, fall back to external
      try {
        await vscode.commands.executeCommand('simpleBrowser.show', uri.toString());
      } catch {
        await vscode.env.openExternal(uri);
      }
    }

  } else if (msg.type === 'create-file') {
    const { code, filename } = msg;
    if (!code || !filename) { return; }
    try {
      const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
      if (!rootPath) { vscode.window.showErrorMessage('No workspace open'); return; }
      const filePath = vscode.Uri.file(`${rootPath}/${filename}`);
      await vscode.workspace.fs.writeFile(filePath, Buffer.from(code));
      await vscode.window.showTextDocument(filePath);
      vscode.window.showInformationMessage(`Created ${filename}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create file: ${err instanceof Error ? err.message : 'unknown'}`);
    }

  } else if (msg.type === 'clear-chat') {
    conversation.length = 0;
    refresh();

  } else if (msg.type === 'run-command') {
    const command = msg.command;
    const _root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    debugLog(_root, 'run-command', `received: ${command}`);
    if (command) {
      try {
        if (command === 'chassis.buildFromVault') {
          await vscode.commands.executeCommand(command, deps.buildFromVaultPrefill());
        } else if (command === 'chassis.openVault' && msg.vaultItem) {
          await vscode.commands.executeCommand(command, msg.vaultItem);
          debugLog(_root, 'run-command', `executed OK: ${command} → ${msg.vaultItem}`);
        } else if (command === 'chassis.listProjects') {
          // Scan filesystem and show centered modal in webview
          const homeDir = os.homedir();
          const projects: { name: string; fullPath: string }[] = [];
          const dirsToCheck = [
            path.join(homeDir, 'projects'),
            path.join(homeDir, 'Projects'),
            path.join(homeDir, 'dev'),
            path.join(homeDir, 'workspace'),
            path.join(homeDir, 'code'),
            path.join(homeDir, 'src'),
          ];
          for (const dir of dirsToCheck) {
            if (fs.existsSync(dir)) {
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                  if (entry.isDirectory()) {
                    const projectPath = path.join(dir, entry.name);
                    if (fs.existsSync(path.join(projectPath, '.chassis'))) {
                      projects.push({ name: entry.name, fullPath: projectPath });
                    }
                  }
                }
              } catch { /* ignore permission errors */ }
            }
          }
          panel.webview.postMessage({ type: 'show-projects-modal', projects });
          debugLog(_root, 'run-command', `listed ${projects.length} CHASSIS projects`);
        } else if (command === 'workbench.action.closeFolder') {
          // VSCodium opens a file picker after closeFolder — use removeFromWorkspace instead
          const folders = vscode.workspace.workspaceFolders;
          if (folders && folders.length > 0) {
            await vscode.workspace.updateWorkspaceFolders(0, folders.length);
          } else {
            await vscode.commands.executeCommand(command);
          }
          debugLog(_root, 'run-command', `executed OK: ${command}`);
        } else {
          await vscode.commands.executeCommand(command);
          debugLog(_root, 'run-command', `executed OK: ${command}`);
        }
      } catch (err) {
        debugLog(_root, 'run-command', `ERROR executing ${command}: ${err instanceof Error ? err.message : String(err)}`);
        vscode.window.showErrorMessage(`Command failed: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

  } else if (msg.type === 'start-session') {
    if (deps.onStartSession) { await deps.onStartSession(msg.goal || '', msg.ai || 'Unknown'); }

  } else if (msg.type === 'switch-ai') {
    if (deps.onSwitchAI) { await deps.onSwitchAI(msg.ai || 'gemini'); }

  } else if (msg.type === 'new-project') {
    require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[chatPanelMessages] new-project received name=${msg.name} hasCallback=${!!deps.onNewProject}\n`);
    if (deps.onNewProject) {
      const answers = msg.answers || {};
      // [CHASSIS] Preserve original prompt for pendingBuildTask replay after project creation
      if (msg.originalTask) { answers._originalTask = msg.originalTask; }
      await deps.onNewProject(msg.name || '', answers, msg.folderPath || undefined);
    }

  } else if (msg.type === 'open-project') {
    if (msg.folderPath) {
      const folderPath = msg.folderPath;
      const folderName = path.basename(folderPath);
      // Add to recent projects
      const ctx = ChatPanel.extensionContext;
      if (ctx) {
        const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
        const existing = recent.findIndex((p: {path: string}) => p.path === folderPath);
        if (existing >= 0) { recent.splice(existing, 1); }
        recent.unshift({ path: folderPath, name: folderName, timestamp: Date.now() });
        ctx.globalState.update('chassis.recentProjects', recent.slice(0, 10));
      }
      const wsFile = path.join(folderPath, `${folderName}.code-workspace`);
      if (!fs.existsSync(wsFile)) {
        try { fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2)); } catch { /* best-effort */ }
      }
      const wsUri = vscode.Uri.file(wsFile);
      vscode.commands.executeCommand('vscode.openWorkspace', wsUri, false);
    }

  // LAUNCHER: Start New Project — triggers the wizard
  } else if (msg.type === 'start-new-project') {
    vscode.commands.executeCommand('chassis.wizardRetrofit');

  // LAUNCHER: Open Existing Project — shows folder picker
  } else if (msg.type === 'open-existing-project') {
    console.log('[CHASSIS] open-existing-project handler started');
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFolders: true,
      canSelectFiles: false,
      openLabel: 'Open Project Folder',
      defaultUri: vscode.Uri.file(require('os').homedir()),
    });
    console.log('[CHASSIS] showOpenDialog returned:', picked);
    if (picked && picked.length > 0) {
      const folderPath = picked[0].fsPath;
      const folderName = path.basename(folderPath);
      console.log('[CHASSIS] Selected folder:', folderPath);
      // Check if this is a CHASSIS project
      const chassisDir = path.join(folderPath, '.chassis');
      if (!fs.existsSync(chassisDir)) {
        // Not a CHASSIS project — ask if user wants to initialize it
        const choice = await vscode.window.showInformationMessage(
          `"${folderName}" doesn't have CHASSIS initialized. Initialize it now?`,
          'Yes, Initialize',
          'Cancel'
        );
        if (choice !== 'Yes, Initialize') {
          conversation.push({ role: 'assistant', content: `Opened "${folderName}" without CHASSIS initialization. You can initialize later with "Initialize CHASSIS" command.`, timestamp: Date.now() });
          refresh();
          // Still open the folder
          const wsFile = path.join(folderPath, `${folderName}.code-workspace`);
          if (!fs.existsSync(wsFile)) {
            try { fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2)); } catch { }
          }
          console.log('[CHASSIS] Opening workspace (non-CHASSIS):', wsFile);
          vscode.commands.executeCommand('vscode.openWorkspace', vscode.Uri.file(wsFile), false);
          return;
        }
      }
      // Add to recent projects
      const ctx = ChatPanel.extensionContext;
      if (ctx) {
        const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
        const existing = recent.findIndex((p: {path: string}) => p.path === folderPath);
        if (existing >= 0) { recent.splice(existing, 1); }
        recent.unshift({ path: folderPath, name: folderName, timestamp: Date.now() });
        ctx.globalState.update('chassis.recentProjects', recent.slice(0, 10));
      }
      // Open the project
      const wsFile = path.join(folderPath, `${folderName}.code-workspace`);
      console.log('[CHASSIS] Creating/opening workspace file:', wsFile);
      if (!fs.existsSync(wsFile)) {
        try { fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2)); } catch { }
      }
      console.log('[CHASSIS] Executing vscode.openWorkspace with:', wsFile);
      vscode.commands.executeCommand('vscode.openWorkspace', vscode.Uri.file(wsFile), false);
    } else {
      console.log('[CHASSIS] No folder selected (picked was empty or undefined)');
    }

  // LAUNCHER: Open Recent Project
  } else if (msg.type === 'open-recent-project') {
    if (msg.folderPath && fs.existsSync(msg.folderPath)) {
      const folderPath = msg.folderPath;
      const folderName = path.basename(folderPath);
      // Update recent projects order
      const ctx = ChatPanel.extensionContext;
      if (ctx) {
        const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
        const existing = recent.findIndex((p: {path: string}) => p.path === folderPath);
        if (existing >= 0) {
          const item = recent.splice(existing, 1)[0];
          item.timestamp = Date.now();
          recent.unshift(item);
        }
        ctx.globalState.update('chassis.recentProjects', recent.slice(0, 10));
      }
      // Open the project
      const wsFile = path.join(folderPath, `${folderName}.code-workspace`);
      if (!fs.existsSync(wsFile)) {
        try { fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2)); } catch { }
      }
      vscode.commands.executeCommand('vscode.openWorkspace', vscode.Uri.file(wsFile), false);
    } else {
      conversation.push({ role: 'assistant', content: 'That project folder no longer exists. It has been removed from recent projects.', timestamp: Date.now() });
      refresh();
      // Remove from recent
      const ctx = ChatPanel.extensionContext;
      if (ctx && msg.folderPath) {
        const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
        const filtered = recent.filter((p: {path: string}) => p.path !== msg.folderPath);
        ctx.globalState.update('chassis.recentProjects', filtered);
      }
    }

  // LAUNCHER: Toggle setting from checkbox
  } else if (msg.type === 'toggle-setting') {
    if (msg.setting === 'startupBehavior' && msg.value) {
      await vscode.workspace.getConfiguration('chassis').update('startupBehavior', msg.value, true);
      // Update conversation to confirm the change
      const behaviorText = msg.value === 'lastProject' ? 'always open your last project' : 'show the launcher screen';
      conversation.push({ role: 'assistant', content: `Setting saved: CHASSIS will ${behaviorText} on startup.`, timestamp: Date.now() });
      refresh();
    }

  } else if (msg.type === 'browse-folder') {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false, canSelectFolders: true, canSelectFiles: false,
      openLabel: 'Select Project Parent Folder',
      defaultUri: msg.currentPath ? vscode.Uri.file(msg.currentPath) : undefined,
    });
    if (picked && picked.length > 0) {
      panel.webview.postMessage({ type: 'browse-result', folderPath: picked[0].fsPath });
    }

  } else if (msg.type === 'confirm-build') {
    // [CHASSIS] User clicked "Let's Go" on the cost estimate modal
    if (msg.buildId) { resolveBuildConfirm(msg.buildId, true); }

  } else if (msg.type === 'cancel-build') {
    // [CHASSIS] User clicked "Cancel" on the cost estimate modal
    if (msg.buildId) { resolveBuildConfirm(msg.buildId, false); }

  } else if (msg.type === 'use-vault') {
    // [CHASSIS] User chose "Use Vault" on the vault-hit modal
    if (msg.hitId) { resolveVaultHit(msg.hitId, true); }

  } else if (msg.type === 'build-anyway') {
    // [CHASSIS] User chose "Build Anyway" on the vault-hit modal
    if (msg.hitId) { resolveVaultHit(msg.hitId, false); }

  } else if (msg.type === 'placement-add-here') {
    // [CHASSIS] User chose to build into the current project
    if (msg.placementId) { resolvePlacement(msg.placementId, 'here'); }

  } else if (msg.type === 'placement-new-project') {
    // [CHASSIS] User chose to start a new project instead
    if (msg.placementId) { resolvePlacement(msg.placementId, 'new-project'); }

  } else if (msg.type === 'placement-cancel') {
    // [CHASSIS] User dismissed the placement modal
    if (msg.placementId) { resolvePlacement(msg.placementId, 'cancel'); }

  } else if (msg.type === 'template-wizard-submit' || msg.type === 'template-wizard-cancel') {
    // [CHASSIS] Template wizard modal submitted or cancelled — resolve the pending wizard promise
    try {
      const { resolveTemplateWizard } = await import('../services/templateWizard.js');
      resolveTemplateWizard(msg);
    } catch { /* ignore — wizard may have already timed out */ }

  } else if (msg.type === 'architect-dismiss') {
    // Nothing for Now — no-op, action row already hidden by renderer

  } else if (msg.type === 'architect-explain') {
    // Explain This to Me — rewrite findings in plain English via AI
    const reviewText = _architectReviews.get(msg.reviewId || '');
    if (!reviewText) { return; }
    const explainPrompt = 'You are explaining a code review to a non-technical person. Rewrite the following architect review in plain English.\n\n'
      + 'Rules:\n- Use real-world analogies.\n- No technical jargon.\n- Every point must be understandable by someone who has never coded.\n'
      + '- End with: "Ready to fix these? I can walk you through them one at a time."\n\nReview:\n' + reviewText;
    conversation.push({ role: 'user', content: 'Explain this review in plain English', timestamp: Date.now() });
    refresh();
    try {
      const aiRes = await routing.prompt(explainPrompt);
      conversation.push({ role: 'assistant', content: aiRes.text || 'Could not generate explanation.', timestamp: Date.now() });
    } catch (err) {
      conversation.push({ role: 'assistant', content: 'Error generating explanation: ' + (err instanceof Error ? err.message : String(err)), timestamp: Date.now() });
    }
    refresh();

  } else if (msg.type === 'architect-add-todos') {
    // Add as TODOs — write findings to .chassis/blueprint.md
    const reviewText = _architectReviews.get(msg.reviewId || '');
    if (!reviewText) { return; }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      conversation.push({ role: 'assistant', content: 'No workspace open.', timestamp: Date.now() });
      refresh(); return;
    }
    const bpPath = path.join(root, '.chassis', 'blueprint.md');
    const dateStr = new Date().toISOString().slice(0, 10);
    const lines = reviewText.split('\n').filter(l => l.trim().startsWith('-') || /^\d+\./.test(l.trim()) || /^\*\*/.test(l.trim()));
    const todoLines = lines.slice(0, 20).map(l => '- [ ] ' + l.replace(/^[-*]+\s*/, '').replace(/^\d+\.\s*/, '').replace(/^\*\*([^*]+)\*\*:?/, '$1:').trim());
    const section = '\n\n## Architect Review TODOs -- ' + dateStr + '\n\n' + (todoLines.length > 0 ? todoLines.join('\n') : '- [ ] Review architect findings') + '\n';
    try {
      if (fs.existsSync(bpPath)) {
        fs.appendFileSync(bpPath, section, 'utf8');
      } else {
        fs.mkdirSync(path.join(root, '.chassis'), { recursive: true });
        fs.writeFileSync(bpPath, '# Blueprint\n' + section, 'utf8');
      }
      conversation.push({ role: 'assistant', content: 'Added ' + todoLines.length + ' TODOs to `.chassis/blueprint.md` under **Architect Review TODOs -- ' + dateStr + '**.', timestamp: Date.now() });
    } catch (err) {
      conversation.push({ role: 'assistant', content: 'Could not write TODOs: ' + (err instanceof Error ? err.message : String(err)), timestamp: Date.now() });
    }
    refresh();

  } else if (msg.type === 'architect-fix-all') {
    // Fix All Issues — extract unhealthy/large/violation file findings, run chassis.runEditFix per file
    const reviewText = _architectReviews.get(msg.reviewId || '');
    if (!reviewText) { return; }
    // Parse file paths from the review text (lines containing src/... or similar paths with extensions)
    const fileMatches = [...reviewText.matchAll(/\b((?:[\w./\-]+\/)?[\w.\-]+\.(?:ts|js|py|md|json|go|rs|rb|html|css|tsx|jsx|vue|svelte|c|cpp|h))\b/g)];
    const seen = new Set<string>();
    const files: string[] = [];
    for (const m of fileMatches) { const f = m[1]; if (!seen.has(f)) { seen.add(f); files.push(f); } }
    if (files.length === 0) {
      conversation.push({ role: 'assistant', content: 'No specific files identified in the review. Use **Fix One at a Time** to step through issues manually.', timestamp: Date.now() });
      refresh(); return;
    }
    // Filter to only files that actually exist — review may mention files it wants created, not existing ones
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fs2 = require('fs');
    const path2 = require('path');
    const existingFiles = files.filter(f => fs2.existsSync(path2.join(root, f)));
    const missingFiles = files.filter(f => !fs2.existsSync(path2.join(root, f)));
    if (missingFiles.length > 0) {
      conversation.push({ role: 'assistant', content: `⚠️ Skipping ${missingFiles.length} file(s) that don't exist yet: \`${missingFiles.join('`, `')}\`\n\nThe architect review suggested creating these, but Fix All only repairs existing files.`, timestamp: Date.now() });
      refresh();
    }
    if (existingFiles.length === 0) {
      conversation.push({ role: 'assistant', content: 'No existing files to fix. The review only suggested new files to create — use the build command to create them instead.', timestamp: Date.now() });
      refresh(); return;
    }
    conversation.push({ role: 'assistant', content: 'Fixing ' + existingFiles.length + ' file' + (existingFiles.length !== 1 ? 's' : '') + ' identified in the review...', timestamp: Date.now() });
    refresh();
    for (let i = 0; i < existingFiles.length; i++) {
      const f = existingFiles[i];
      const task = 'Fix issues identified in architect review for ' + f + ': address health problems, reduce complexity, and improve code quality.';
      try {
        await vscode.commands.executeCommand('chassis.runEditFix', task, f, 'refactor');
        const progress = conversation[conversation.length - 1];
        if (progress && progress.content.startsWith('Fixing ')) { progress.content = 'Fixing ' + existingFiles.length + ' files: ' + (i + 1) + ' done...'; refresh(); }
      } catch { /* continue on individual failures */ }
    }
    conversation.push({ role: 'assistant', content: 'All ' + existingFiles.length + ' fixes applied.', timestamp: Date.now() });
    refresh();

  } else if (msg.type === 'architect-fix-one') {
    // Fix One at a Time — step through issues one by one
    const reviewId = msg.reviewId || '';
    const reviewText = _architectReviews.get(reviewId);
    if (!reviewText) { return; }
    if (!_architectFixState.has(reviewId)) {
      // Initialize: extract files from review text, only include files that exist on disk
      const fileMatches = [...reviewText.matchAll(/\b((?:[\w./\-]+\/)?[\w.\-]+\.(?:ts|js|py|md|json|go|rs|rb|html|css|tsx|jsx|vue|svelte|c|cpp|h))\b/g)];
      const seen = new Set<string>();
      const allFiles: string[] = [];
      for (const m of fileMatches) { const f = m[1]; if (!seen.has(f)) { seen.add(f); allFiles.push(f); } }
      const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fsCheck = require('fs'); const pathCheck = require('path');
      const files = allFiles.filter(f => fsCheck.existsSync(pathCheck.join(rootDir, f)));
      const skipped = allFiles.filter(f => !fsCheck.existsSync(pathCheck.join(rootDir, f)));
      if (skipped.length > 0) {
        conversation.push({ role: 'assistant', content: `⚠️ Skipping \`${skipped.join('`, `')}\` — file(s) don't exist yet.`, timestamp: Date.now() });
        refresh();
      }
      if (files.length === 0) {
        conversation.push({ role: 'assistant', content: 'No existing files to step through.', timestamp: Date.now() });
        refresh(); return;
      }
      _architectFixState.set(reviewId, { issues: files, index: 0 });
    }
    const state = _architectFixState.get(reviewId)!;
    if (msg.action === 'skip') { state.index++; }
    if (msg.action === 'apply' && state.index > 0) { state.index++; } // already applied, advance
    if (state.index >= state.issues.length) {
      _architectFixState.delete(reviewId);
      conversation.push({ role: 'assistant', content: 'All issues reviewed.', timestamp: Date.now() });
      refresh(); return;
    }
    const currentFile = state.issues[state.index];
    const progress = (state.index + 1) + ' of ' + state.issues.length;
    if (msg.action === 'apply') {
      const task = 'Fix issues identified in architect review for ' + currentFile + ': address health problems, reduce complexity, and improve code quality.';
      await vscode.commands.executeCommand('chassis.runEditFix', task, currentFile, 'refactor');
    }
    const nextFile = state.issues[state.index];
    const nextProgress = (state.index + 1) + ' of ' + state.issues.length;
    conversation.push({
      role: 'assistant',
      content: '**Issue ' + nextProgress + ':** `' + nextFile + '`\n\nApply a refactor fix to this file?\n\n'
        + '__ARCH_STEP__' + reviewId + '|||' + state.index + '|||' + state.issues.length + '|||' + nextFile + '|||END_ARCH_STEP__',
      timestamp: Date.now(),
    });
    refresh();
  }
}
