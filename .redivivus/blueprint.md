# Blueprint

## WHO
Solo developers and vibe coders using AI editors (Windsurf, Cursor, Claude Code, etc.)

## WHAT
VS Code extension that enforces project structure, tracks sessions, and makes AI-generated code
consistent across editors through a Universal Project Protocol

## WHERE
VS Code / Windsurf / Cursor extension, TypeScript, Node.js, WebView UI

## WHEN
Active development, targeting v1.0 stable release

## WHY
No standard exists for structuring AI-assisted projects. Every AI starts from scratch every session.
Redivivus gives the AI a frame to bolt to so projects stay organized regardless of which AI or
editor is used.

---

## ARCHITECTURE

### Principle: Hybrid Feature-Slice + Layer

Top level: Package by **feature** (what the app does).
Inside each feature: Package by **layer** (what the code is).

```
features/
  <feature-name>/
    ui/      ← panels, HTML generators, webview scripts, styles
    logic/   ← business rules, orchestration, decisions, validation
    data/    ← file I/O, external APIs, cloud storage, adapters
```

**The placement rule:** If you cannot place a new file in under 10 seconds, the feature boundary
is wrong — not the file.

### Layer Definitions

| Layer  | Contains                                                       | Does NOT contain         |
|--------|----------------------------------------------------------------|--------------------------|
| `ui/`  | Webview panels, HTML generators, scripts injected into panels, styles | Business logic, I/O |
| `logic/` | Business rules, orchestration services, validation, decisions | Raw I/O, direct API calls |
| `data/` | File system reads/writes, external API calls, cloud sync, storage adapters | UI, decisions |

Not every feature needs all three layers. A feature with no webview has no `ui/`. A feature with
no external I/O has no `data/`.

### Dependency Rule

```
ui/ → logic/ → data/
```

- `ui/` may import from `logic/` and `data/`
- `logic/` may import from `data/` only
- `data/` imports nothing from within the feature (only external libs / shared/)
- Cross-feature imports go through `logic/` only — never `ui/` importing from another feature's `ui/`

---

## FEATURE REGISTRY

### AI Engine
| Feature | Path | Description |
|---------|------|-------------|
| `ai` | `features/ai/` | Routing engine, provider adapters, guardian, agent service, classification |
| `api` | `features/api/` | Redivivus Cloud backend client, MCP service, auth |
| `logging` | `features/logging/` | Master logger, output channel, fix pipeline logger |

### User-Facing
| Feature | Path | Description |
|---------|------|-------------|
| `chat` | `features/chat/` | Chat panel UI, message router, user memory |
| `build` | `features/build/` | Build pipeline: scaffold, chunked, phased, orchestrator |
| `fix` | `features/fix/` | Fix pipeline: phases, escalation, verification, self-fix |
| `blueprint` | `features/blueprint/` | Blueprint extraction, interview, revision, living blueprint |
| `vault` | `features/vault/` | Snippet storage, browse, dedup, visual contract, cloud sync |
| `project` | `features/project/` | Project CRUD, session, timeline, templates, wizard |
| `workspace` | `features/workspace/` | Code analysis, diagnostics, git backup, lens service |
| `map` | `features/map/` | Architecture map visualization and commands |
| `runtime` | `features/runtime/` | Runtime profiling (Python + JS instrumentors) |

### Platform
| Feature | Path | Description |
|---------|------|-------------|
| `vscode` | `features/vscode/` | Sidebar, status bar, webview provider, rules, guides |
| `onboarding` | `features/onboarding/` | First-run API setup, sign-in, setup hub |
| `settings` | `features/settings/` | Config, editor rules, personality picker |
| `telemetry` | `features/telemetry/` | Usage tracking, cost reporting, usage panel |
| `pwa` | `features/pwa/` | PWA export and publish |

---

## SHARED

`shared/` contains ONLY genuine cross-cutting utilities with no feature identity.
If a file in `shared/` has more than ~3 callers from a single feature, it belongs in that feature.

Current contents (target state):
```
shared/
  utils/
    getNonce.ts     ← webview security nonce
    styles.ts       ← shared webview style constants
```

---

## ENTRY POINTS (src/ root)

VSCode requires `extension.ts` to be resolvable at a known path. Bootstrap files stay at root.

```
src/
  extension.ts                  ← activate() / deactivate()
  extensionCommands.ts          ← registerCommand() wiring
  extensionInlineCommands.ts    ← inline command registrations
  extensionPanelSetup.ts        ← panel initialization on activate
  extensionServices.ts          ← service instantiation and DI
  extensionWorkspaceListener.ts ← workspace event subscriptions
  extensionResumeState.ts       ← restore state after reload
```

---

## MIGRATION STATUS

Track which features have been converted to the `ui/logic/data` layer naming.

| Feature | Status | Old layers removed |
|---------|--------|--------------------|
| `telemetry` | ✅ Migrated | `application/` → `logic/`, `infrastructure/` → `data/` |
| `pwa` | ✅ Migrated | `application/` → `logic/`, `infrastructure/` → `data/` |
| `map` | ✅ Migrated | `application/` → `logic/` |
| `onboarding` | ✅ Migrated | `application/` split into `ui/` + `logic/` |
| `settings` | ✅ Migrated | `application/` → `logic/` |
| `runtime` | ✅ Migrated | `application/` → `logic/`, `infrastructure/` → `data/`, absorbed `src/runtime/` orphans |
| `workspace` | ✅ Migrated | `application/` + `domain/` + `domain/code/` → `logic/`, `infrastructure/` → `data/`, split `ui/analyzer/` |
| `vault` | ✅ Migrated | `application/` + `domain/` → `logic/`, `infrastructure/` → `data/` |
| `project` | ✅ Migrated | `application/` + `domain/` → `logic/` (inspector + retrofit subfolders preserved), `infrastructure/blueprint/` → `data/blueprint/` |
| `blueprint` | ✅ Migrated | Promoted from `project/data/blueprint/` + `project/ui/blueprint/`; split into `logic/` (16) + `data/` (2) + `ui/` (4) |
| `build` | ✅ Migrated | Carved out from `chat/build/`; 77 files (40 root + 37 in services/) moved flat |
| `fix` | ✅ Migrated | Carved out from `chat/routing/` (26 files) + `chat/ui/fixProgressStyle.ts`; 28 files flat |
| `chat` | ✅ Migrated | `application/` + `routing/` (54 files) → `logic/`; `ui/` unchanged |
| `logging` | ✅ Migrated | Promoted from `shared/logging/`; `application/`+`domain/` → `logic/`, `infrastructure/` → `data/` |
| `ai` | ✅ Migrated | Promoted from `shared/ai/`; `domain/`+`domain/providers/` → `logic/`, `infrastructure/` → `data/` |
| `api` | ✅ Migrated | Promoted from `shared/api/`; `infrastructure/` → `data/`, `authHandler` + `mcp/` → `logic/` |
| `vscode` | ✅ Migrated | Promoted from `shared/vscode/`; `application/`+`domain/rules/`+`misc*.ts` → `logic/`, `ui/` → `ui/` |

---

## RULES

1. No file belongs in two features. If it serves two features, it belongs in `shared/` or needs a
   third feature to own it.
2. `logic/` is the public API of a feature. Other features import from `logic/` only.
3. `ui/` is private. No other feature imports from another feature's `ui/`.
4. `data/` is private. No other feature imports from another feature's `data/`.
5. When in doubt about `logic/` vs `data/`: does the file make a decision? → `logic/`. Does it
   just move bytes? → `data/`.
