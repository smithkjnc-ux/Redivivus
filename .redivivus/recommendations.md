# Redivivus Recommendations

*Based on project analysis*

---

## Priority Actions

### 1. Add Entry Point Comments

Every main file should have a `// [SCOPE]` tag explaining what it does and what it connects to. This is the single most valuable annotation for cold-read handoff.

### 2. Establish File Size Discipline

Going forward, aim for **200 lines max per file**. When a file exceeds this, split it by responsibility. Redivivus will flag violations automatically in future versions.

---

*These recommendations are structural. Deep code analysis requires Redivivus Phase 2 (AI routing).*
