// [SCOPE] Static code validation — programmatic checks that catch known AI failure patterns
// before code is delivered to the user. These are deterministic unlike Guardian (AI review).
// Returns a list of issues found, and a patched version of the code if auto-fixable.

export interface ValidationResult {
  issues: string[];
  autoFixed: boolean;
  code: string; // patched code if autoFixed, original otherwise
}

/**
 * Validate and auto-fix HTML/canvas animation code.
 * Catches the most common AI-generated bugs that produce black screens or wrong behavior.
 */
export function validateAndFixHtmlAnimation(code: string): ValidationResult {
  const issues: string[] = [];
  let fixed = code;
  let autoFixed = false;

  // ── Check 1: ageFactor uses maxTrailLength instead of trail.length ──
  if (/ageFactor\s*=\s*i\s*\/\s*max/i.test(fixed)) {
    issues.push('ageFactor divides by maxTrailLength — must divide by trail.length for correct brightness');
    // Auto-fix: replace i / maxTrailLength (or i / maxXxx) with i / trail.length
    fixed = fixed.replace(/(\bconst\s+ageFactor\s*=\s*i\s*\/\s*)max\w+/g, '$1trail.length');
    fixed = fixed.replace(/(\blet\s+ageFactor\s*=\s*i\s*\/\s*)max\w+/g, '$1trail.length');
    fixed = fixed.replace(/(ageFactor\s*=\s*i\s*\/\s*)max\w+/g, '$1trail.length');
    autoFixed = true;
  }

  // ── Check 2: shadowBlur never reset after trail loop ──
  if (/shadowBlur\s*=\s*(?!0)[0-9]+/.test(fixed) && !/shadowBlur\s*=\s*0/.test(fixed)) {
    issues.push('ctx.shadowBlur is set but never reset to 0 — glow bleeds into background making it colored');
    // Auto-fix: insert ctx.shadowBlur = 0 after the trail for-loop closing brace
    fixed = fixed.replace(/(for\s*\([^)]+\)\s*\{[\s\S]*?\n(\s*)}\s*\n)/g, (match) => {
      if (match.includes('trail') && match.includes('shadowBlur')) {
        return match + '  ctx.shadowBlur = 0;\n';
      }
      return match;
    });
    autoFixed = true;
  }

  // ── Check 3: speed hardcoded, not derived from canvas size ──
  if (/const\s+speed\s*=\s*[0-9]+(\.[0-9]+)?;/.test(fixed) &&
      !/speed\s*=\s*Math\.hypot/.test(fixed)) {
    issues.push('speed is hardcoded — must be Math.hypot(canvas.width, canvas.height) / 180 for screen-size scaling');
    // Cannot reliably auto-fix without knowing context — flag only
  }

  // ── Check 4: fillRect clear uses a colored value instead of rgba(0,0,0,...) ──
  const fillRectMatch = fixed.match(/fillStyle\s*=\s*['"]rgba\(([^)]+)\)['"]/g);
  if (fillRectMatch) {
    for (const m of fillRectMatch) {
      const rgba = m.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgba) {
        const [, r, g, b] = rgba.map(Number);
        if (r > 20 || g > 20 || b > 20) {
          issues.push(`fillRect clear color is rgba(${r},${g},${b},...) — must be near-black rgba(0,0,0,...) to keep background dark`);
        }
      }
    }
  }

  // ── Check 5: canvas size set only via CSS, not JS ──
  if (!(/canvas\.width\s*=/.test(fixed))) {
    issues.push('canvas.width never set in JS — size must be set via canvas.width = window.innerWidth, not CSS only');
  }

  // ── Check 6: requestAnimationFrame called more than once (double loop) ──
  const rafCount = (fixed.match(/requestAnimationFrame/g) || []).length;
  if (rafCount > 1) {
    issues.push(`requestAnimationFrame called ${rafCount} times — must be called exactly once at the end of the animation loop`);
  }

  // ── Check 7: dx/dy/speed declared as const but need to change ──
  if (/const\s+(dx|dy)\s*=/.test(fixed)) {
    issues.push('dx or dy declared as const — must be let since velocity reverses on wall bounce');
  }

  return { issues, autoFixed, code: fixed };
}

/**
 * Dispatch to the right validator based on file extension.
 */
export function validateCode(code: string, ext: string): ValidationResult {
  if (ext === '.html' || ext === '.htm') {
    return validateAndFixHtmlAnimation(code);
  }
  return { issues: [], autoFixed: false, code };
}
