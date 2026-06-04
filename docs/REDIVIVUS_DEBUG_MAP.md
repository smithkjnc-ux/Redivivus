# Redivivus — Debug Map (symptom → subsystem → files)

> [SCOPE] Triage index for fixing bugs FAST without reading the whole codebase.
> Workflow: read the bug report's **Copy-for-AI** bundle (verbatim report + session logs + env + recent builds),
> find the matching symptom row below, open only the listed files. Per Rule 17, the most recent build is the prime suspect.
> Two repos: **IDE** = `~/projects/redivivus` (the extension), **WEB** = `~/projects/redivivus-web` (redivivus.dev, Next.js on Cloudflare).

---

## IDE (extension) — `~/projects/redivivus/src`

| Symptom | Subsystem | Start here |
|---|---|---|
| Build produces nothing / "Built 0 files" / files not written | Cloud build pipeline | `services/build/cloudBuildClient.ts`, `cloudBuildMultiFile.ts`, `cloudBuildResultProcessor.ts` |
| Wrong file paths / project-name prefix in output | Result processing | `cloudBuildResultProcessor.ts` (`stripSlug`) |
| Cloud down / building with local key | Local fallback | `cloudBuildLocalFallback.ts` |
| Context too big / "trimmed to fit" / model overflow | Token budgeting | `services/ai/tokenBudget.ts`, `services/build/buildContextCollector.ts` (`budgetContext`) |
| Build context wrong (blueprint/vault/git/map) | Context collection | `services/build/buildContextCollector.ts` |
| Compile/test/runtime errors after build, auto-fix loops | Auto-fix | `services/build/compileAutoFix.ts`, `testAutoFix.ts`, `runAutoFix.ts`, `runtimeRunner.ts` |
| Runtime check fails on fresh project (missing deps) | Runtime runner | `runtimeRunner.ts` (`needsNodeInstall`/`installNodeDeps`) |
| Security warnings after build | Security scan | `services/build/securityScanner.ts` |
| **Previous project "stuck in queue" / layout stays on old project after exiting a session or opening a project** | **Project-context guard** | `services/logging/projectContextLogger.ts`, `ui/messageRouterSession.ts` (endSession reset), `commands/init.ts` (onNewProject), `extension.ts` (onDidChangeWorkspaceFolders), `ui/panels/chat/chatPanelPublicAPI.ts` (resumeBuildTask) |
| New project not created / "switch blocked" error | New-project flow | `commands/init.ts`, `core/project/chatPanelMsgProjectOps.ts` |
| Vague task built wrong / no clarifying questions | Clarify triage | `ui/panels/chat/chatPanelClarify.ts` |
| Questionnaire / blueprint interview issues | Blueprint | `services/blueprint/*`, `ui/panels/chat/chatPanelPlanInterview.ts` |
| Chat panel layout/rendering wrong | Chat UI | `ui/panels/chat/chatPanelRenderer.ts`, `chatPanelShow.ts`, `chatPanel.ts` (state) |
| Wrong AI model / routing | Routing | `services/ai/routingService*.ts`, `routingClassifier.ts` |
| Cost estimate wrong | Estimator | `core/ai/costEstimatorService.ts` (uses `tokenBudget.estimateTokens`) |
| Logs missing / session log empty | Logging | `services/logging/redivivusLogger.ts`, `redivivusLoggerOps.ts`, `core/logging/masterLogger.ts` |
| Bug report missing info / no logs/env | Report builder | `commands/reportIssueHandler.ts`, `commands/reportDiagnostics.ts` |
| Vault capture / reuse issues | Vault | `services/vault/*` |

## WEB (redivivus.dev) — `~/projects/redivivus-web/src`

| Symptom | Subsystem | Start here |
|---|---|---|
| Sign-in fails / "auth failed" / can't get in | Auth (6-digit code flow) | `app/login/page.tsx`, `app/auth/callback/route.ts` (multi-type verifyOtp) |
| Approved user can't download / IDE won't connect | Beta gate | `lib/approval.ts` (`isUserAllowed`), `app/download/page.tsx`, `app/auth/ide/route.ts` |
| New user not on waitlist after verifying / "pending" wrong | Onboarding funnel | `app/auth/callback/route.ts` (`finishSignIn` → `ensurePendingWaitlist`), `lib/approval.ts`, `app/pending/page.tsx` |
| Waitlist actions (approve/invite/add/archive) | Waitlist admin | `app/admin/waitlist/*`, `app/api/admin/waitlist/{update,add,invite,delete}/route.ts` |
| Approved+signed-in users clutter waitlist | Graduated split | `app/admin/waitlist/page.tsx` (cross-refs auth users) |
| Emails not sending (invite/welcome/admin) | Resend | `app/api/admin/waitlist/invite/route.ts`, `app/api/admin/users/welcome/route.ts`, `app/api/admin/email/route.ts` (all need `RESEND_API_KEY`) |
| Report content truncated / logs/screenshots missing | Feedback storage + render | `app/api/feedback/route.ts` (stores verbatim, no AI rewrite), `app/admin/reports/page.tsx` (`renderMd`) |
| Trophy Room empty / leaderboard blank | Trophy room | `app/trophy-room/page.tsx` (reads `feedback` directly; leaderboard needs reporter `user_id`) |
| Reporter shows "anonymous" | Reporter identity | `app/api/feedback/route.ts` (accepts `userId`); IDE must send it (`reportIssueHandler`) |

---

## Key cross-cutting facts
- **Beta gate is provider-agnostic** — it only checks for a Supabase session + an approved waitlist email; GitHub vs magic-link doesn't matter.
- **Magic link is a 6-digit CODE, not a clickable link** (links get prefetched and consume the single-use token). Email template must contain `{{ .Token }}` and no link.
- **Reports store everything verbatim** (no AI rewrite, no truncation) — the AI is dedup-only.
- **Deploys:** WEB = `npm run deploy` (OpenNext→Cloudflare). IDE = `npm run compile` (compiles + copies `out/` to the baked IDE; reload the IDE window to apply; auto-commit is prepared, run separately).
- **Supabase config (dashboard, not code):** Email provider enabled, custom SMTP = Resend, redirect URL `https://redivivus.dev/auth/callback`, magic-link template uses `{{ .Token }}`.
