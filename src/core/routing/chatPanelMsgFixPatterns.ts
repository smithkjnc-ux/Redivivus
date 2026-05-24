// [SCOPE] Known failure pattern database for fix pipeline validation.
// Pre-flight: detectPatterns() scans source → drives prompt injection.
// Post-write: validateOutputFiles() catches fixes that ignored guidance.
// Extend KNOWN_PATTERNS to teach CHASSIS new failure modes without touching pipeline code.

export interface FailurePattern {
  id: string;
  name: string;
  detect: RegExp[];      // any match in source -> pattern is present
  outputFail: RegExp[];  // any match in output -> fix did NOT resolve it
  supervisorNote: string;
  workerRule: string;
  triedWhat: string;     // human-readable: what the source was doing (for dead_ends.md)
  whyFails: string;      // human-readable: why it silently fails (for dead_ends.md)
  doInstead: string;     // human-readable: the correct replacement (for dead_ends.md)
}

export const KNOWN_PATTERNS: FailurePattern[] = [
  {
    id: 'web-audio-linux',
    name: 'Web Audio API (silent failure on Linux/file://)',
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
];

/** Returns patterns whose detect regexes match anywhere in the combined source text. */
export function detectPatterns(sourceText: string): FailurePattern[] {
  return KNOWN_PATTERNS.filter(p => p.detect.some(rx => rx.test(sourceText)));
}

/** Returns patterns still present in any written output file. Caller gets explicit warning list. */
export function validateOutputFiles(
  fixes: { rel: string; content: string }[],
): { pattern: FailurePattern; files: string[] }[] {
  return KNOWN_PATTERNS
    .map(p => ({
      pattern: p,
      files: fixes.filter(f => p.outputFail.some(rx => rx.test(f.content))).map(f => f.rel),
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
