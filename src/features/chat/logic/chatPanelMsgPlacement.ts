// [SCOPE] Handlers for placement actions: adding to current file, new project, or cancelling.
// Extracted from chatPanelMessages.ts.

import { resolvePlacement } from '../../../shared/ai/domain/chatPanelResolvers.js';

export async function handlePlacementAction(msg: any): Promise<void> {
  if (msg.type === 'placement-add-here' && msg.placementId) {
    resolvePlacement(msg.placementId, 'here');
  } else if (msg.type === 'placement-new-project' && msg.placementId) {
    resolvePlacement(msg.placementId, 'new-project');
  } else if (msg.type === 'placement-cancel' && msg.placementId) {
    resolvePlacement(msg.placementId, 'cancel');
  }
}
