// [SCOPE] Chat Panel Story — re-exports build output formatters for UI consumers.
// The actual implementations live in core/build/buildOutput.ts (UI-agnostic layer).
// UI code that needs these functions imports from here; core/services import from buildOutput.ts directly.
//
// [WARN] Do NOT add UI-specific logic here that would cause circular imports.
//        If you need to extend buildResultCard with UI-specific tokens (workspace open, visual editor),
//        do it in the calling code AFTER the card is built, not inside buildResultCard itself.

export {
  extractNarrator,
  extractAllNarrators,
  encodeStoryToken,
  buildResultCard,
} from '../../../core/build/buildOutput';
