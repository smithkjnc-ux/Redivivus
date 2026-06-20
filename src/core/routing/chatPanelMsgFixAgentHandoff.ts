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
    conversation.push({
        role: 'assistant',
        content: `> 🔄 **Agent Handoff Initiated:** Simple Pipeline applied the code edits, but the Guardian AI detected that this task requires environment testing (e.g. compiling, starting a server, running checks). Handing off to the Agent to complete verification...`,
        timestamp: Date.now()
    });
    deps.refresh();
    deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });

    try {
        const { executeAgentTask } = await import('../../services/ai/agentService.js');
        const agentCtx: any = {
            root: root,
            task: `[HANDOFF] The user requested: "${userText}". The code files have already been modified by a surgical worker. Your ONLY task is to run the necessary terminal commands (e.g. 'npm run build', starting a server, or running tests) to verify the system works. Do NOT rewrite the code unless the verification fails. Cite your verification commands.`,
            log: (msg: string) => { conversation.push({ role: 'assistant', content: msg, timestamp: Date.now() }); deps.refresh(); },
            modifiedFiles: new Set<string>(written),
            snapshotId: fixSnapId,
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
