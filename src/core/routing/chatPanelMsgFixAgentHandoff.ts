// [SCOPE] Handlers for dynamic handoff from Simple (Direct Mode) to Agent Pipeline.

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages';

export async function executeAgentHandoff(
    deps: MessageHandlerDeps,
    root: string,
    userText: string,
    written: string[],
    fixSnapId: string | undefined,
    conversation: any[]
): Promise<void> {
    // [TOOL-GAP] Two entry points: the Guardian-time handoff (Worker already applied edits → Agent VERIFIES;
    // written is non-empty), and the diagnosis-time handoff (Worker never ran → Agent does the FULL task;
    // written is empty). The empty-written check distinguishes them without threading a new flag.
    const fromDiagnosis = written.length === 0;
    conversation.push({
        role: 'assistant',
        content: fromDiagnosis
            ? `> 🔄 **Agent Handoff Initiated:** The Supervisor determined up-front that this task needs to run and verify in the environment (building, installing, starting a server, running checks) — something the direct editor can't do. Routing straight to the Agent, with no throwaway code first...`
            : `> 🔄 **Agent Handoff Initiated:** Simple Pipeline applied the code edits, but the Guardian AI detected that this task requires environment testing (e.g. compiling, starting a server, running checks). Handing off to the Agent to complete verification...`,
        timestamp: Date.now()
    });
    deps.refresh();
    deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });

    try {
        const { executeAgentTask } = await import('../../services/ai/agentService.js');
        const agentCtx: any = {
            root: root,
            task: fromDiagnosis
                ? `The user requested: "${userText}". No code has been written yet — you own the WHOLE task. Write any files needed, then ACTUALLY RUN the terminal commands to do it and verify the result (e.g. build the artifact and confirm it exists, start the server and check it responds, run the tests). When the task depends on an external CLI tool (a converter, compiler, packager), INVOKE THAT TOOL DIRECTLY as its own run_command first (e.g. \`pandoc ...\`, then if it fails \`wkhtmltopdf ...\`) BEFORE wrapping the attempts inside a helper script you run via python/bash — burying a tool inside a script hides which one is missing and stops the gap from being recorded. You may still write a helper script in addition. If a required tool isn't installed, try the alternatives in your plan; if none are available, say exactly which are missing. Cite the commands you ran and their output.`
                : `[HANDOFF] The user requested: "${userText}". The code files have already been modified by a surgical worker. Your ONLY task is to run the necessary terminal commands (e.g. 'npm run build', starting a server, or running tests) to verify the system works. Do NOT rewrite the code unless the verification fails. Cite your verification commands.`,
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
                const { encodeClarifyToken } = await import('../../ui/panels/chat/chatPanelClarify.js');
                const { setPendingClarifyResolve } = await import('../../ui/panels/chat/chatPanelClarifyBridge.js');
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
        
        await executeAgentTask(agentCtx.task, projectContext, deps.routing, agentCtx, agentCtx.log);
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
