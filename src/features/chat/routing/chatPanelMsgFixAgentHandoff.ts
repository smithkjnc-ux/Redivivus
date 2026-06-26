// [SCOPE] Handlers for dynamic handoff from Simple (Direct Mode) to Agent Pipeline.

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages.js';
import { confirmAgentRun } from '../../../shared/ai/infrastructure/agentPermissionSummary.js';

export async function executeAgentHandoff(
    deps: MessageHandlerDeps,
    root: string,
    userText: string,
    written: string[],
    fixSnapId: string | undefined,
    conversation: any[],
    approvedPlan?: string,
    diagnosis?: string
): Promise<void> {
    // [PLAN-GATE] If the user reviewed/edited a plan at the gate, fold it into the agent's instructions so
    // their edits actually drive the run (the handoff is otherwise built from the raw request).
    const planNote = (approvedPlan && approvedPlan.trim() && approvedPlan.trim() !== userText.trim())
        ? ` The user reviewed and APPROVED this plan — follow it exactly: ${approvedPlan.trim()}`
        : (diagnosis ? `\n\nThe Supervisor diagnosed the task and prescribed this approach:\n${diagnosis}\n` : '');
    // [TOOL-GAP] Two entry points: the Guardian-time handoff (Worker already applied edits → Agent VERIFIES;
    // written is non-empty), and the diagnosis-time handoff (Worker never ran → Agent does the FULL task;
    // written is empty). The empty-written check distinguishes them without threading a new flag.
    const fromDiagnosis = written.length === 0;
    deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });

    // [AGENT-CONFIRM] Show plain English summary of what the Agent plans to do and wait for approval.
    const { approved } = await confirmAgentRun(userText, deps, conversation, deps.refresh, fromDiagnosis);
    if (!approved) {
        conversation.push({
            role: 'assistant',
            content: `**Cancelled.** The code edits${written.length > 0 ? ` to ${written.map(f => `\`${f}\``).join(', ')} were already saved` : ' were not applied'}. To complete the task manually, run your project's dev/build command in the terminal.`,
            timestamp: Date.now()
        });
        deps.refresh();
        deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
        return;
    }

    conversation.push({
        role: 'assistant',
        content: fromDiagnosis
            ? `> 🔄 **Agent running...** Writing files and executing commands now.`
            : `> 🔄 **Agent running...** Verifying the applied fix in your environment.`,
        timestamp: Date.now()
    });
    deps.refresh();

    try {
        const { executeAgentTask } = await import('../../../shared/ai/infrastructure/agentService.js');
        const agentCtx: any = {
            root: root,
            task: fromDiagnosis
                ? `The user requested: "${userText}".${planNote} No code has been written yet — you own the WHOLE task. Write any files needed, then ACTUALLY RUN the terminal commands to do it and verify the result (e.g. build the artifact and confirm it exists, start the server and check it responds, run the tests). When starting a web server or dev server, you MUST run it detached in the background (e.g. \`npx serve . &\` or \`npm run dev &\`) so it frees up your terminal to run curl tests. When the task depends on an external CLI tool (a converter, compiler, packager), INVOKE THAT TOOL DIRECTLY as its own run_command first (e.g. \`pandoc ...\`, then if it fails \`wkhtmltopdf ...\`) BEFORE wrapping the attempts inside a helper script you run via python/bash — burying a tool inside a script hides which one is missing and stops the gap from being recorded. You may still write a helper script in addition. If a required tool isn't installed, try the alternatives in your plan; if none are available, say exactly which are missing. Cite the commands you ran and their output.`
                : `[HANDOFF] The user requested: "${userText}". The code files have already been modified by a surgical worker. Your ONLY task is to run the necessary terminal commands (e.g. 'npm run build', starting a server, or running tests) to verify the system works. When starting a web server or dev server, you MUST run it detached in the background (e.g. \`npx serve . &\` or \`npm run dev &\`) so it frees up your terminal to run curl tests. Do NOT rewrite the code unless the verification fails. Cite your verification commands.`,
            log: (msg: string) => { conversation.push({ role: 'assistant', content: msg, timestamp: Date.now() }); deps.refresh(); },
            modifiedFiles: new Set<string>(written),
            snapshotId: fixSnapId,
            // [COMPLETION-GUARD] Both handoff types exist to RUN/verify in the environment — the agent loop
            // must not accept a final answer until it has actually executed a command.
            requiresExecution: true,
            routing: deps.routing,
            blueprintContext: deps.redivivus.isInitialized() ? JSON.stringify(deps.redivivus.loadConfig()?.blueprint || {}) : '',
            // [TOOL-GAP] Live per-session cost choice when run_command hits a costlier out-of-plan
            // alternate. This is the LIVE agent path (the run_command Tool-Gap pilot), so wire it here.
            askUser: async (prompt: string): Promise<'alternate' | 'wait'> => {
                const { encodeClarifyToken } = await import('../ui/chatPanelClarify.js');
                const { setPendingClarifyResolve } = await import('../ui/chatPanelClarifyBridge.js');
                const q = { id: 'toolgap_cost_choice', question: prompt,
                    options: [{ label: 'Try alternate approach (uses extra tokens)' }, { label: 'Wait' }] };
                conversation.push({ role: 'assistant', content: encodeClarifyToken([q]), timestamp: Date.now() });
                deps.refresh();
                const answers = await new Promise<Record<string, string>>((resolve) => {
                    setPendingClarifyResolve(resolve);
                    setTimeout(() => resolve({ toolgap_cost_choice: 'Wait' }), 300_000);
                });
                return (answers['toolgap_cost_choice'] || 'Wait').startsWith('Try alternate') ? 'alternate' : 'wait';
            },
        };
        
        const config = deps.redivivus.isInitialized() ? deps.redivivus.loadConfig() : null;
        let projectContext = config?.blueprint ? `Blueprint: ${JSON.stringify(config.blueprint)}` : 'No blueprint available.';
        
        const agentResult = await executeAgentTask(agentCtx.task, projectContext, deps.routing, agentCtx, agentCtx.log);
        // [FIX] ALWAYS surface the agent's closing message. On SUCCESS it's the "here's what I did + the
        // verification I ran (tests passed)" summary; on a non-success exit (e.g. step ceiling) it carries a
        // Retry button to continue. Previously this only fired on failure, so a COMPLETED run rendered no
        // closing bubble and looked identical to a silent hang — the last thing the user saw was "Running:
        // npm test" even though the run had finished green. (Fixed 2026-06-21.)
        if (agentResult && agentResult.finalAnswer) {
            conversation.push({ role: 'assistant', content: agentResult.finalAnswer, timestamp: Date.now() });
            deps.refresh();
        } else if (agentResult && agentResult.success) {
            conversation.push({ role: 'assistant', content: '✅ **Done.** The agent completed the task and verified it in the environment.', timestamp: Date.now() });
            deps.refresh();
        }

        // [TOOL-GAP] If the agent hit a wall the USER must clear (a tool/module that needs installing), the
        // structured flag is present. Surface a user-facing card: plain-English purpose + the exact install
        // command for their OS + Copy / Open-in-terminal / Retry. We never auto-install. The flag stays as the
        // owner's telemetry signal and clears itself when the user retries (executeAgentTask clears it on run).
        try {
            const fs = require('fs'); const os = require('os'); const path = require('path');
            const flagPath = path.join(os.homedir(), '.redivivus', 'pending_toolgap.json');
            if (fs.existsSync(flagPath)) {
                const flag = JSON.parse(fs.readFileSync(flagPath, 'utf-8'));
                const items = Array.isArray(flag.missing) ? flag.missing : [];
                if (items.length) {
                    const retry = Buffer.from(userText, 'utf-8').toString('base64');
                    const payload = Buffer.from(JSON.stringify({ items, retry }), 'utf-8').toString('base64');
                    conversation.push({ role: 'assistant', content: `__TOOLGAP__${payload}__END_TOOLGAP__`, timestamp: Date.now() });
                    deps.refresh();
                }
            }
        } catch { /* best-effort: the agent already explained the gap in prose */ }
    } catch (e) {
        const _b64h = Buffer.from(userText, 'utf8').toString('base64');
        conversation.push({
            role: 'assistant',
            content: `⚠️ **Agent handoff failed.** This is usually a temporary glitch — your code edits were already applied.\n\n` +
              `__RETRY_FIX__:${_b64h}__END_RETRY__`,
            timestamp: Date.now()
        });
        deps.refresh();
    }
    deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
}
