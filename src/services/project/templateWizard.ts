// [SCOPE] Template Wizard — detects template intent, shows centered WebView modal (not top QuickPick),
// collects user answers, fetches base template from registry, hands off enriched prompt to AI.
// [WARN] fetchTemplate may fail (offline / registry not set up) — always fall through to normal build.
// [WARN] Wizard runs inside the build pipeline — postToWebview MUST be passed in for the modal to appear.
//        If postToWebview is not available, bail immediately so the build continues normally.

import type { TemplateDef} from './templateRegistry.js';
import { TEMPLATE_CATEGORIES, matchTaskToTemplate, fetchTemplate } from './templateRegistry.js';
import type { RoutingService } from '../../services/ai/routingService.js';

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
// [DONE] Rule 18 fix: both isSmallUnit and isTemplateRequest now use AI classifier calls, not regex.
export async function runTemplateWizard(task: string, postToWebview?: (msg: any) => void, routing?: RoutingService): Promise<TemplateWizardResult> {
  // Can't show WebView modal without postToWebview — bail cleanly
  if (!postToWebview) { return { handled: false }; }

  if (routing) {
    try {
      // [RULE 18] 50-token classifier: is this a small snippet or a full project?
      const unitRes = await routing.prompt(`Task: "${task.slice(0, 200)}"\nIs this a small code snippet/utility/function, or a full standalone app/project?\nReply with one word: snippet or project`, 12_000);
      if (unitRes.success && unitRes.text?.trim().toLowerCase().startsWith('snippet')) { return { handled: false }; }
      // [RULE 18] 50-token classifier: is this a template-type project (website/game/dashboard/app)?
      const tmplRes = await routing.prompt(`Task: "${task.slice(0, 200)}"\nIs this requesting a full-project template like a website, game, dashboard, app, portfolio, or blog? Reply: yes or no`, 12_000);
      if (!tmplRes.success || !tmplRes.text?.trim().toLowerCase().startsWith('yes')) { return { handled: false }; }
    } catch { return { handled: false }; }
  } else {
    // Keyword fallback when no routing service is available
    if (/\b(function|snippet|utility|helper|class|method|hook|component)\b/i.test(task) &&
        !/\b(website|game|app|dashboard|landing|portfolio|api|backend|blog)\b/i.test(task)) { return { handled: false }; }
    if (!/\b(website|portfolio|dashboard|blog|game|landing page|app)\b/i.test(task)) { return { handled: false }; }
  }

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
