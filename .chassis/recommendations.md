# CHASSIS Recommendations

*Based on project analysis*

---

## Priority Actions

### 1. Split Large Files

15 files exceed 200 lines. Large files are harder for AI coders to hold in context and more prone to merge conflicts.

- `package-lock.json` (3286 lines) — consider splitting by function/responsibility
- `src/services/vaultService.ts` (514 lines) — consider splitting by function/responsibility
- `src/services/retrofitService.ts` (448 lines) — consider splitting by function/responsibility
- `src/services/analyzerService.ts` (413 lines) — consider splitting by function/responsibility
- `src/services/guardianService.ts` (327 lines) — consider splitting by function/responsibility

### 2. Convert TODOs to CHASSIS Annotations

Found 52 existing TODO/FIXME markers. Convert them:

| Old Style | CHASSIS Style |
|-----------|---------------|
| `// TODO:` | `// [TODO] description` |
| `// FIXME:` | `// [WARN] description` |
| `// HACK:` | `// [WARN] hacky — description` |
| `// XXX:` | `// [TODO] needs attention — description` |

### 3. Add Entry Point Comments

Every main file should have a `// [SCOPE]` tag explaining what it does and what it connects to. This is the single most valuable annotation for cold-read handoff.

### 4. Establish File Size Discipline

Going forward, aim for **200 lines max per file**. When a file exceeds this, split it by responsibility. CHASSIS will flag violations automatically in future versions.

---

*These recommendations are structural. Deep code analysis requires CHASSIS Phase 2 (AI routing).*
