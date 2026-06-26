// [SCOPE] Architecture Map panel — handles getELI5 messages
import type { MapMsgCtx } from '../mapMessageDispatcher.js';

export async function executeELI5(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { map, guardian, webview } = ctx;

  if (msg.type === 'getELI5' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    if (node) {
      const technical = `File health is ${node.health}. Issues: ${node.todos} TODOs, ${node.warns} WARNs. Lines: ${node.lines}. matchesBlueprint: ${node.matchesBlueprint}`;
      const eli5 = guardian.translateToELI5(technical, 'map-hover');
      webview.postMessage({ type: 'eli5-response', nodeId: msg.nodeId, text: eli5.plainEnglish });
    }
  }
}
