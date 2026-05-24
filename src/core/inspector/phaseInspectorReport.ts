// [SCOPE] Phase Inspector Report Formatter — formats PhaseInspection results for chat display
// Extracted from phaseInspector.ts

import type { PhaseInspection } from './phaseInspector';

// Format inspection results for chat display
export function formatInspectionReport(inspection: PhaseInspection): string {
  const icon = inspection.status === 'pass' ? '✅' : inspection.status === 'warning' ? '⚠️' : '❌';
  
  let report = `${icon} **Phase Inspection: ${inspection.phase}**\n`;
  report += `Score: ${inspection.score}/100 | Status: ${inspection.status.toUpperCase()}\n\n`;

  if (inspection.issues.length > 0) {
    report += `**Issues Found:**\n`;
    const errors = inspection.issues.filter(i => i.type === 'error');
    const warnings = inspection.issues.filter(i => i.type === 'warning');
    
    if (errors.length > 0) {
      report += `❌ **Errors (${errors.length}):**\n`;
      errors.forEach(e => report += `  • ${e.file}${e.line ? `:${e.line}` : ''} — ${e.message}\n`);
    }
    
    if (warnings.length > 0) {
      report += `⚠️ **Warnings (${warnings.length}):**\n`;
      warnings.forEach(w => report += `  • ${w.file}${w.line ? `:${w.line}` : ''} — ${w.message}\n`);
    }
    report += '\n';
  }

  if (inspection.tests.length > 0) {
    const passed = inspection.tests.filter(t => t.passed).length;
    report += `**Tests:** ${passed}/${inspection.tests.length} passed\n\n`;
  }

  if (inspection.forwardCompatibility.concerns.length > 0) {
    report += `**Forward Compatibility Concerns:**\n`;
    inspection.forwardCompatibility.concerns.forEach(c => report += `  ⚠️ ${c}\n`);
    report += '\n';
  }

  if (inspection.forwardCompatibility.recommendations.length > 0) {
    report += `**Recommendations:**\n`;
    inspection.forwardCompatibility.recommendations.forEach(r => report += `  💡 ${r}\n`);
    report += '\n';
  }

  if (inspection.status === 'fail') {
    report += `**⛔ Cannot proceed to next phase until issues are resolved.**\n`;
    report += `__ACTION_CARD__chassis.fixPhaseIssues|||🔧 Fix These Issues|||END__\n`;
  } else if (inspection.status === 'warning') {
    report += `**⚠️ Proceed with caution — address warnings before they become errors.**\n`;
    report += `__ACTION_CARD__chassis.proceedToNextPhase|||▶️ Proceed Anyway|||END__\n`;
    report += `__ACTION_CARD__chassis.fixPhaseIssues|||🔧 Fix Warnings First|||END__\n`;
  } else {
    report += `**✅ Phase complete and ready for next phase.**\n`;
    report += `__ACTION_CARD__chassis.proceedToNextPhase|||▶️ Proceed to Next Phase|||END__`;
  }

  return report;
}
