// [SCOPE] Template Wizard — detects template intent, shows centered WebView modal (not top QuickPick),
// collects user answers, fetches base template from registry, hands off enriched prompt to AI.
// [WARN] fetchTemplate may fail (offline / registry not set up) — always fall through to normal build.
// [WARN] Wizard runs inside the build pipeline — postToWebview MUST be passed in for the modal to appear.
//        If postToWebview is not available, bail immediately so the build continues normally.

import { TEMPLATE_CATEGORIES, TemplateDef, matchTaskToTemplate, fetchTemplate } from './templateRegistry.js';

export interface TemplateWizardResult {
  handled: boolean;
  templateContent?: string;
  customizationPrompt?: string;
  templateDef?: TemplateDef;
}

// [WARN] One pending wizard resolver at a time — cleared on submit or cancel
let _pendingWizardResolve: ((result: { subId: string; registryPath: string; label: string; answers: Record<string, string> } | null) => void) | null = null;

/**
 * Called by chatPanel message handler when WebView sends template-wizard-submit or template-wizard-cancel.
 */
export function resolveTemplateWizard(msg: { type: string; subId?: string; registryPath?: string; label?: string; answers?: Record<string, string> }): boolean {
  if (!_pendingWizardResolve) { return false; }
  const resolver = _pendingWizardResolve;
  _pendingWizardResolve = null;
  if (msg.type === 'template-wizard-submit' && msg.subId) {
    resolver({ subId: msg.subId, registryPath: msg.registryPath || '', label: msg.label || msg.subId, answers: msg.answers || {} });
  } else {
    resolver(null);
  }
  return true;
}

/**
 * Detect if a task is a template-type request and run the centered WebView wizard if so.
 * postToWebview is required — if absent, returns { handled: false } immediately.
 */
export async function runTemplateWizard(task: string, postToWebview?: (msg: any) => void): Promise<TemplateWizardResult> {
  // Can't show WebView modal without postToWebview — bail cleanly
  if (!postToWebview) { return { handled: false }; }

  // Quick bail — if task is clearly a small code unit, skip wizard
  const isSmallUnit = /function|snippet|utility|helper|class|method|hook|component|script/i.test(task)
    && !/website|web site|game|app|dashboard|landing|portfolio|api|backend|server/i.test(task);
  if (isSmallUnit) { return { handled: false }; }

  // Check for explicit template trigger words
  // [WARN] Allow adjectives between article and type word — e.g. "Build a medium portfolio website"
  const isTemplateRequest =
    /build\s+(me\s+)?(a|an)\s+([\w\s]{0,30}?)(website|web site|game|app|dashboard|portfolio|landing page|api|backend|blog|tool|cli)/i.test(task) ||
    /create\s+(a|an)\s+([\w\s]{0,20}?)(website|game|app|dashboard|portfolio)/i.test(task) ||
    /make\s+(a|an)\s+([\w\s]{0,20}?)(website|game|app|dashboard|portfolio)/i.test(task) ||
    /\b(website|portfolio|dashboard|blog|game|landing page)\b/i.test(task);

  if (!isTemplateRequest) { return { handled: false }; }

  // Auto-detect category+sub to pre-select in the modal
  const autoMatch = matchTaskToTemplate(task);

  // Show centered WebView modal — send all category data, modal handles 3-step UI
  const wizardResult = await new Promise<{ subId: string; registryPath: string; label: string; answers: Record<string, string> } | null>((resolve) => {
    _pendingWizardResolve = resolve;
    postToWebview({
      type: 'show-template-wizard',
      categories: TEMPLATE_CATEGORIES,
      preselect: autoMatch
        ? { catId: autoMatch.category.id, subId: autoMatch.template.id }
        : null,
    });
    // Safety timeout — if user doesn't respond in 5 minutes, bail
    setTimeout(() => {
      if (_pendingWizardResolve === resolve) { _pendingWizardResolve = null; resolve(null); }
    }, 300000);
  });

  if (!wizardResult) { return { handled: false }; }

  // Find the template def from the registry for metadata
  let templateDef: TemplateDef | undefined;
  for (const cat of TEMPLATE_CATEGORIES) {
    const found = cat.subcategories.find(s => s.id === wizardResult.subId);
    if (found) { templateDef = found; break; }
  }

  // Fetch base template from registry — 5s timeout so a missing registry never stalls
  const templateContent = await Promise.race([
    fetchTemplate(wizardResult.registryPath),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
  ]);

  const answerLines = Object.entries(wizardResult.answers)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const customizationPrompt = templateContent
    ? `You are customizing a base template. Here is the base template:\n\n${templateContent}\n\nCustomize it with these user-specified values:\n${answerLines}\n\nOriginal request: "${task}"\n\nReturn the complete customized file. Preserve the template structure. Only change values specified by the user.`
    : `Build a ${wizardResult.label} with these specifications:\n${answerLines}\n\nOriginal request: "${task}"`;

  return {
    handled: true,
    templateContent: templateContent || undefined,
    customizationPrompt,
    templateDef,
  };
}
