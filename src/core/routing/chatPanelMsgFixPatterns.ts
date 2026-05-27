// [SCOPE] Known failure pattern database for fix pipeline validation.
// Pre-flight: detectPatterns() scans source → drives prompt injection.
// Post-write: validateOutputFiles() catches fixes that ignored guidance.
// Extend KNOWN_PATTERNS to teach Redivivus new failure modes without touching pipeline code.

export interface FailurePattern {
  id: string;
  name: string;
  relevanceTest?: RegExp;      // if set, pattern only activates when userText matches — prevents cross-topic pollution
  detect: RegExp[];            // any match in source -> pattern is present
  outputFail: RegExp[];        // any match in output -> fix did NOT resolve it
  suppressOutputWhen?: RegExp[]; // if any match in output -> skip outputFail check (correct fix for a different context)
  supervisorNote: string;
  workerRule: string;
  triedWhat: string;
  whyFails: string;
  doInstead: string;
}

export const KNOWN_PATTERNS: FailurePattern[] = [
  {
    id: 'web-audio-linux',
    name: 'Web Audio API (silent failure on Linux/file://)',
    relevanceTest: /sound|audio|music|silent|no.sound|beep|sfx|volume|hear|noise/i,
    detect: [
      /new\s*(window\.)?AudioContext\s*\(/,
      /createOscillator\s*\(/,
      /createGain\s*\(/,
      /\.connect\s*\(\s*\w*[Aa]udio[Cc]ontext\w*\.destination/,
    ],
    outputFail: [
      /new\s*(window\.)?AudioContext\s*\(/,
      /createOscillator\s*\(/,
      /\.connect\s*\(\s*\w+\.destination/,
    ],
    supervisorNote:
`- Web Audio API / no sound (CRITICAL -- switch approach entirely): On Linux Chrome and file:// URLs,
  AudioContext.destination silently routes to a null device -- no error is thrown, code runs, zero audio.
  This is invisible from source code; it is a runtime environment problem not fixable by adjusting AudioContext.
  CORRECT FIX: abandon Web Audio API output entirely. Generate PCM samples in JS, write a WAV blob,
  play with new Audio(url).play(). This uses the HTML5 Audio pipeline which works on all systems.
  Diagnose ANY use of AudioContext / OscillatorNode / createGain as CRITICAL when the bug is "no sound".
  The WAV blob pattern:
    function playSound(name) { var url = buildWAV(name); new Audio(url).play(); }
    function buildWAV(name) { /* generate Float32Array samples, write 44-byte WAV header, return createObjectURL */ }`,
    workerRule:
`AUDIO HARD RULE (non-negotiable): DO NOT use AudioContext, OscillatorNode, createGain, webkitAudioContext,
  or any Web Audio API node in any form. AudioContext.destination outputs silence on Linux Chrome -- no error thrown.
  REQUIRED pattern -- use this exactly:
    function playSound(name){new Audio(buildWAV(name)).play();}
    buildWAV(name): allocate Float32Array, fill segments with phase accumulator (phase+=2*PI*freq/sr),
    apply envelope (Math.min(t*30,1)*Math.min((dur-t)*20,1)), write 44-byte WAV header
    (RIFF/WAVE/fmt /data chunks, sr=44100, 16-bit mono), return URL.createObjectURL(new Blob([buf],{type:'audio/wav'})).`,
    triedWhat: 'Web Audio API (AudioContext / OscillatorNode / createGain / .connect(destination))',
    whyFails: 'AudioContext.destination silently routes to a null audio device on Linux Chrome and file:// URLs. No error is thrown, code executes normally, zero audio output. Invisible from source inspection.',
    doInstead: 'WAV blob + HTML5 Audio element: generate PCM in Float32Array, write 44-byte WAV header, return URL.createObjectURL(blob), play with new Audio(url).play()',
  },
  {
    id: 'fixed-canvas-overflow-screen',
    name: 'Fixed canvas dimensions cause overflow on small screens',
    relevanceTest: /fit.*screen|screen.*fit|cut.*off|overflow|scroll|responsive|all.*size|any.*size|resize|adjust/i,
    detect: [/CANVAS_WIDTH\s*=\s*\d+/, /CANVAS_HEIGHT\s*=\s*\d+/],
    outputFail: [/min-height:\s*100vh[\s\S]{0,200}overflow:\s*auto/],
    supervisorNote:
`- Canvas game not fitting screen (CRITICAL — CSS-only fix, no JS changes needed):
  The canvas has fixed intrinsic dimensions (width/height attributes) used by game logic for coordinates.
  CSS max-height + width:auto visually scales the canvas without changing its internal coordinate system.
  Game logic (collisions, positions) still uses the original pixel constants — only the rendering scales.
  CORRECT FIX (CSS only, 3 rules):
  1. body: change min-height:100vh to height:100vh, change overflow:auto to overflow:hidden
  2. .game-container: add max-height:100vh; padding:clamp(6px,1vh,16px) 0; change gap to clamp(6px,1.5vh,20px)
  3. canvas CSS rule: add max-height:calc(100vh - 140px); width:auto; max-width:100%`,
    workerRule:
`CANVAS RESPONSIVE RULE (CSS only — do NOT change JS constants or canvas HTML attributes):
  Make these EXACT changes to the CSS in the <style> block:
  1. body rule: replace min-height:100vh with height:100vh; replace overflow:auto with overflow:hidden
  2. .game-container rule: add  max-height:100vh;  and change gap:20px to gap:clamp(6px,1.5vh,20px)  and add padding:clamp(6px,1vh,16px) 0;
  3. canvas CSS rule (NOT the <canvas> HTML tag): add these properties:
       max-height: calc(100vh - 140px);
       width: auto;
       max-width: 100%;
  Do NOT touch CANVAS_WIDTH, CANVAS_HEIGHT constants or the canvas width/height HTML attributes.`,
    triedWhat: 'Canvas game with fixed CANVAS_WIDTH/CANVAS_HEIGHT constants and fixed canvas HTML attributes',
    whyFails: 'canvas width/height attributes set the coordinate system used by all game logic. CSS max-height+width:auto scales the rendered output without breaking game coordinates.',
    doInstead: 'CSS only: body{height:100vh;overflow:hidden} .game-container{max-height:100vh;gap:clamp(6px,1.5vh,20px)} canvas{max-height:calc(100vh - 140px);width:auto;max-width:100%}',
  },
  {
    id: 'body-height-100vh-clips-content',
    name: 'body height:100vh clips content taller than viewport',
    relevanceTest: /cut.?off|clipped|not visible|can'?t see|top.*miss|miss.*top|hidden|being cut|overflow|scroll|off.screen/i,
    detect: [/(?<!min-)height:\s*100vh/],
    outputFail: [/(?<!min-)height:\s*100vh/],
    suppressOutputWhen: [/<canvas[\s>]/], // canvas games correctly use height:100vh+overflow:hidden — not a clip bug
    supervisorNote:
`- CSS content clipping / top cut off (CRITICAL -- one-line fix): body height:100vh is a hard viewport cap.
  When content is taller than the viewport, overflow:hidden silently clips the top. overflow:auto adds scrollbars
  but the user can only scroll DOWN — the top is already cut. This is NOT a flex or align-items problem.
  CORRECT FIX: change body height:100vh → min-height:100vh. Change overflow:hidden → overflow:auto.
  Do NOT touch flex-direction, justify-content, or align-items. The centering is fine — only the height cap is wrong.`,
    workerRule:
`CSS HEIGHT CLIPPING RULE (exact change, nothing else): body has height:100vh which hard-caps the container
  and cuts off content taller than the viewport. Make ONLY these two changes to the body CSS rule:
  1. Change  height: 100vh  →  min-height: 100vh
  2. Change  overflow: hidden  →  overflow: auto  (or remove overflow if not present)
  Do NOT change display, flex-direction, justify-content, align-items, or any other property.
  Do NOT add padding as a substitute. Just change height to min-height.`,
    triedWhat: 'body { height: 100vh; overflow: hidden } with flex centering',
    whyFails: 'height:100vh is a hard cap at exactly one viewport height. Content taller than the viewport overflows, and overflow:hidden clips it. The top portion disappears with no way to scroll to it.',
    doInstead: 'body { min-height: 100vh; overflow: auto } — lets the body grow while keeping flex centering intact',
  },
  {
    id: 'responsive-vw-only-forgets-vh',
    name: 'Responsive layout uses vw units but forgets vh constraint',
    relevanceTest: /fit.*screen|screen.*fit|cut.*off|overflow|responsive|all.*size|any.*size|resize|autosize|scale|viewport/i,
    detect: [/width:\s*clamp\([^)]+vw/i, /width:\s*\d+(?:\.\d+)?vw/i, /width:\s*\d+%/i],
    outputFail: [/width:\s*clamp\([^)]*vw[^)]*\)[\s\S]{0,300}height:\s*clamp\([^)]*vw[^)]*\)/i],
    supervisorNote:
`- Responsive layout using vw-only (CRITICAL -- must constrain BOTH width and height):
  The AI fixed fixed-pixel widths/heights by switching to viewport-width units (vw), but forgot that
  on short screens the element can still exceed viewport HEIGHT. The game/tool gets cut off at the bottom.
  CORRECT FIX: the element's width AND height must BOTH be constrained by the SMALLER of width and height space.
  Use CSS custom property: --max-size: min(80vw, calc(100vh - 160px), 314px);
  Then width: max(240px, var(--max-size)); height: max(240px, var(--max-size));
  The 160px offset accounts for title, status, button, and padding above/below the element.
  For mobile: --max-size: min(90vw, calc(100vh - 140px), 280px);`,
    workerRule:
`RESPONSIVE SIZING RULE (must use BOTH vw AND vh, not vw alone):
  When making a layout element responsive to fit any screen, NEVER use vw units for height.
  The element must fit within BOTH viewport width AND viewport height.
  CORRECT pattern:
    --max-size: min(80vw, calc(100vh - 160px), ORIGINAL_PX);
    width: max(MIN_PX, var(--max-size));
    height: max(MIN_PX, var(--max-size));
  Where ORIGINAL_PX is the old fixed pixel value (e.g., 314px) and MIN_PX is the minimum size (e.g., 240px).
  The 160px accounts for title + status + button + padding. Adjust to 140px for mobile media queries.
  WRONG pattern (do NOT do this): height: clamp(240px, 80vw, 314px) — this uses vw for height!`,
    triedWhat: 'width/height: clamp(240px, 80vw, 314px) — vw units used for both dimensions',
    whyFails: 'On short screens, 80vw can exceed viewport height, so the element overflows vertically and gets cut off at the bottom. vw only considers width; height needs vh consideration too.',
    doInstead: 'Use --max-size: min(80vw, calc(100vh - 160px), 314px) so the element is constrained by whichever dimension is smaller.',
  },
];

/** Returns patterns whose detect regexes match the source AND whose relevanceTest (if any) matches userText. */
export function detectPatterns(sourceText: string, userText?: string): FailurePattern[] {
  return KNOWN_PATTERNS.filter(p => {
    if (userText && p.relevanceTest && !p.relevanceTest.test(userText)) { return false; }
    return p.detect.some(rx => rx.test(sourceText));
  });
}

/** Returns patterns still present in written output files, filtered by relevance to userText. */
export function validateOutputFiles(
  fixes: { rel: string; content: string }[],
  userText?: string,
): { pattern: FailurePattern; files: string[] }[] {
  return KNOWN_PATTERNS
    .filter(p => !userText || !p.relevanceTest || p.relevanceTest.test(userText))
    .map(p => ({
      pattern: p,
      files: fixes
        .filter(f => !(p.suppressOutputWhen?.some(rx => rx.test(f.content))))
        .filter(f => p.outputFail.some(rx => rx.test(f.content)))
        .map(f => f.rel),
    }))
    .filter(r => r.files.length > 0);
}

/** Appended to Supervisor "Known patterns" section when patterns are detected in source. */
export function buildSupervisorNotes(patterns: FailurePattern[]): string {
  if (patterns.length === 0) { return ''; }
  return '\n\nKnown patterns:\n' + patterns.map(p => p.supervisorNote).join('\n\n');
}

/** Appended to Worker RULES section starting at ruleIndex. */
export function buildWorkerRules(patterns: FailurePattern[], ruleIndex: number): string {
  if (patterns.length === 0) { return ''; }
  return '\n' + patterns.map((p, i) => `${ruleIndex + i}. ${p.workerRule}`).join('\n');
}
