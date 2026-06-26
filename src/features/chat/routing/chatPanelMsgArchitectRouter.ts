// [SCOPE] Message router delegate for handling 'architect-*' prefixed actions from the Chat Panel
import { handleArchitectExplain, handleArchitectAddTodos, handleArchitectFixAll, handleArchitectFixOne, handleArchitectPerAction, handleArchitectActionConfirm } from '../ui/chatPanelMsgArchitect.js';

export async function routeArchitectMessage(msg: any, deps: any): Promise<boolean> {
  const { routing, conversation, refresh, panel } = deps;

  if (msg.type === 'architect-explain') {
    await handleArchitectExplain(msg, routing, conversation, refresh);
    return true;
  } else if (msg.type === 'architect-add-todos') {
    handleArchitectAddTodos(msg, conversation, refresh);
    return true;
  } else if (msg.type === 'architect-fix-all') {
    await handleArchitectFixAll(msg, conversation, refresh, panel, deps);
    return true;
  } else if (msg.type === 'architect-deep-fix') {
    const { handleArchitectDeepFix } = await import('../ui/chatPanelMsgArchitectDeepFix.js');
    await handleArchitectDeepFix(msg, conversation, refresh, deps, panel);
    return true;
  } else if (msg.type === 'architect-fix-one') {
    await handleArchitectFixOne(msg, conversation, refresh, panel, deps);
    return true;
  } else if (msg.type === 'architect-per-action') {
    await handleArchitectPerAction(msg, conversation, refresh);
    return true;
  } else if (msg.type === 'architect-action-confirm') {
    await handleArchitectActionConfirm(msg, conversation, refresh);
    return true;
  } else if (msg.type === 'architect-action-cancel') {
    conversation.push({ role: 'assistant', content: 'Cancelled.', timestamp: Date.now() });
    refresh();
    return true;
  }
  return false;
}
