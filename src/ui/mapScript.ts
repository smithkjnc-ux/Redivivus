// [SCOPE] Architecture Map Script — assembler. Concatenates mapScriptActions + mapScriptEngine into MAP_SCRIPT.
// Split complete: actions/UI → mapScriptActions.ts, engine/physics → mapScriptEngine.ts
import { MAP_SCRIPT_ACTIONS } from './mapScriptActions.js';
import { MAP_SCRIPT_ENGINE } from './mapScriptEngine.js';

export const MAP_SCRIPT = `
(function() {
${MAP_SCRIPT_ACTIONS}
${MAP_SCRIPT_ENGINE}
})();
`;
