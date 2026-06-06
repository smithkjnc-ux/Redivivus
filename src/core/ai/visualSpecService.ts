// [SCOPE] Visual Spec Service -- establishes a visual contract BEFORE Worker generates any UI code.
// Three sources: extracted (theme/token files) > inferred (existing components) > defaulted (new project).
// Contract is embedded in routedText so Worker has locked visual values; also passed to Visual Contract Editor.

import type { RoutingService } from '../../services/ai/routingService';
import { extractFromProjectFiles, inferFromComponents } from './visualSpecExtractor';

export interface VisualSpec {
  palette: {
    primary:    string;
    secondary:  string;
    background: string;
    surface:    string;
    text:       string;
    accent:     string;
  };
  typography: {
    fontFamily:    string;
    scaleBase:     number;
    weightRegular: number;
    weightBold:    number;
  };
  spacing: {
    unit:         number;
    borderRadius: string;
  };
  feel:                string;
  referenceComponents: string[];
  confidence:          number;
  source:              'extracted' | 'defaulted' | 'user-provided';
}

// Module-level store -- read by Visual Contract Editor after build
let _currentSpec: VisualSpec | null = null;
export function setCurrentSpec(spec: VisualSpec): void { _currentSpec = spec; }
export function getCurrentSpec(): VisualSpec | null { return _currentSpec; }
export function clearCurrentSpec(): void { _currentSpec = null; }

// UI surface keywords -- only run visual spec for requests with a visible UI component
const UI_SURFACE_SIGNALS = /\b(page|screen|component|button|form|modal|card|layout|design|style|color|theme|dashboard|sidebar|nav|header|footer|panel|widget|ui|view|interface)\b/i;
// Skip for non-visual work
const NON_VISUAL_SIGNALS = /\b(api|endpoint|route|middleware|auth|database|query|util|helper|config|env|secret|token|fix.*(bug|error|crash)|refactor|rename|delete)\b/i;

export function shouldRunVisualSpec(text: string, tier: string): boolean {
  if (tier === 'tell-them' || tier === 'look-it-up') { return false; }
  if (NON_VISUAL_SIGNALS.test(text) && !UI_SURFACE_SIGNALS.test(text)) { return false; }
  return UI_SURFACE_SIGNALS.test(text) || tier === 'explore-with-them' || tier === 'offer-choices';
}

const DEFAULT_SPEC: Omit<VisualSpec, 'feel' | 'source' | 'confidence'> = {
  palette:    { primary: '#3b82f6', secondary: '#64748b', background: '#ffffff', surface: '#f8fafc', text: '#0f172a', accent: '#f59e0b' },
  typography: { fontFamily: 'system-ui, sans-serif', scaleBase: 16, weightRegular: 400, weightBold: 600 },
  spacing:    { unit: 8, borderRadius: 'md' },
  referenceComponents: [],
};

/** Infer feel from the build request text via one cheap AI call */
async function inferFeel(text: string, routing: RoutingService): Promise<string> {
  try {
    const res = await routing.promptCheap(
      `Based on this build request, which visual feel fits best? Reply ONE word only: minimal, professional, playful, bold, technical, or elegant.\n\nRequest: "${text.slice(0, 200)}"`,
      6_000,
    );
    const feel = res.text.trim().toLowerCase().replace(/[^a-z]/g, '');
    const valid = new Set(['minimal', 'professional', 'playful', 'bold', 'technical', 'elegant']);
    return valid.has(feel) ? feel : 'professional';
  } catch { return 'professional'; }
}

/** Returns the visual contract block to embed in routedText */
export function formatVisualContractBlock(spec: VisualSpec): string {
  const p = spec.palette;
  const t = spec.typography;
  const s = spec.spacing;
  const refs = spec.referenceComponents.length > 0 ? `\nMatch style of: ${spec.referenceComponents.join(', ')}` : '';
  return `\n\nVISUAL CONTRACT (locked -- do not deviate):
Palette: primary=${p.primary} secondary=${p.secondary} background=${p.background} surface=${p.surface} text=${p.text} accent=${p.accent}
Typography: font=${t.fontFamily} base=${t.scaleBase}px weight-regular=${t.weightRegular} weight-bold=${t.weightBold}
Spacing: unit=${s.unit}px radius=${s.borderRadius}
Feel: ${spec.feel}${refs}
You must use these exact values. Do not introduce new colors, fonts, or spacing values not in this contract.
If a decision is not covered, use the closest matching value and flag with [WARN: visual decision not in spec].`;
}

/** Orchestrates the three-source spec resolution. Returns spec + one-sentence Guardian status message. */
export async function orchestrateVisualSpec(
  text: string,
  projectRoot: string,
  routing: RoutingService,
): Promise<{ spec: VisualSpec; statusMsg: string }> {

  // Strategy 1: extract from theme/token files
  const extracted = extractFromProjectFiles(projectRoot);
  if (extracted && extracted.confidence && extracted.confidence >= 0.7) {
    const feel = extracted.feel || await inferFeel(text, routing);
    const spec: VisualSpec = { ...DEFAULT_SPEC, ...(extracted as Partial<VisualSpec>), feel, referenceComponents: extracted.referenceComponents || [], confidence: extracted.confidence, source: 'extracted' };
    return { spec, statusMsg: 'I found your existing color scheme and style -- building to match.' };
  }

  // Strategy 2: infer from existing UI components
  const inferred = inferFromComponents(projectRoot);
  if (inferred && inferred.confidence && inferred.confidence >= 0.4) {
    const feel = inferred.feel || await inferFeel(text, routing);
    const spec: VisualSpec = { ...DEFAULT_SPEC, ...(inferred as Partial<VisualSpec>), feel, referenceComponents: inferred.referenceComponents || [], confidence: inferred.confidence, source: 'extracted' };
    return { spec, statusMsg: "I picked up your style from existing components -- building to match. If it looks off, I can adjust after." };
  }

  // Strategy 3: defaults + infer feel from request
  const feel = await inferFeel(text, routing);
  const spec: VisualSpec = { palette: DEFAULT_SPEC.palette, typography: DEFAULT_SPEC.typography, spacing: DEFAULT_SPEC.spacing, feel, confidence: 0.4, source: 'defaulted', referenceComponents: [] };
  return { spec, statusMsg: "Using clean defaults for styling — you can tune the look after I build, or describe a style direction now." };
}
