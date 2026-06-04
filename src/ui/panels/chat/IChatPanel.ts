// [SCOPE] IChatPanel interface re-export — the canonical definition lives in src/types/IChatPanel.ts
// so that core/ and services/ can import it without crossing into the ui/ layer.
// UI code can import from here or from types/ directly — both are the same interface.
export { IChatPanel, asChatPanel } from '../../../types/IChatPanel';
