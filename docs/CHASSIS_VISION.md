# CHASSIS — Product Vision & Strategy
> [SCOPE] Product vision, monetization strategy, AI provider strategy, and long-term P2P/LLM roadmap.
> See CHASSIS_ROADMAP.md for the index.

---

## What CHASSIS Has Become

CHASSIS evolved from a structure/annotation extension into a full AI coding environment that turns plain VS Code into a vibe editor for pennies. It is NOT competing with Cursor/Windsurf — it is an alternative for the 99% of people who can't afford $20/month subscriptions.

### Proven Results (May 5, 2026)
- Speed test app: 1 sentence → working code, $0.0003
- File lister utility: 1 sentence → working code, $0.0003
- Expense tracker (CLI with budgets, persistence, warnings): 1 sentence → working code, $0.0005
- **Total: 3 working programs for $0.0011**
- Compare: Cursor charges $20/month for the same capability

### Competitive Advantage
1. Vault flywheel — gets cheaper and smarter with every project
2. Cost transparency — shows every token and penny spent
3. Blueprint context — AI knows WHO the app is for, WHAT it does, WHERE it runs
4. Session memory — tracks what was done, what's next, what failed
5. Universal Project Protocol — rules follow the project across editors
6. Measure twice, cut once — clarification questions before building
7. Works in ANY editor — not locked to one platform

### Architecture Principle: Foreman, Not Mechanic
CHASSIS never writes code directly for editing tasks. It manages, tracks, and enforces.
- Build from Vault / Chat builds: CHASSIS calls AI directly (it owns this pipeline)
- Fix This / delegation: CHASSIS generates prompts for the editor AI
- The editor's built-in AI handles code editing, refactoring, debugging
- CHASSIS handles structure, rules, vault, sessions, history

---

## Multi-AI Provider Strategy (Free-First)

### Free Tier AIs (integrate first)
- **Gemini Flash** — generous free tier, fast, good for most tasks ✅ WORKING
- **Groq Llama 3.3** — free API tier, strong at code ✅ WORKING
- **DeepSeek** — free API tier, strong at code
- **Llama (via Ollama)** — completely free, local, zero API costs, fully private
- **Kimi** — free tier available ✅ WORKING
- **Mistral** — free tier available, good at code

### Paid Tier (upgrade path)
- Claude (Anthropic API) ✅ WORKING
- GPT-4o (OpenAI API)
- Gemini Pro (Google)
- Grok (xAI)

### Routing Logic
- CHASSIS tries free AI first
- If free model can't handle it, suggests upgrading with cost estimate
- User never NEEDS to pay. They CAN pay for better results on hard problems.
- Multi-provider: if one raises prices, route to another
- Local models (Ollama): completely free fallback
- Vault reuse: less AI needed over time
- All user data is LOCAL — nothing locked to a provider

---

## Monetization Strategy

### Tier 1: CHASSIS Free (Forever)
**Target:** Hobbyists, students, vibe coders, anyone new to AI-assisted building.
- Single AI routing (user brings their own key)
- Build Narrator, Guardian Health Score, Architecture Map
- Vault (local only)
- Revenue: $0 — this is the adoption engine

### Tier 2: CHASSIS Pro ($5–9/month)
**Target:** Serious builders, non-coders shipping real apps.
- Supervisor/Worker multi-AI orchestration
- Auto-failover when a provider goes down
- Vault Marketplace access (buy/sell vault packs)
- BYOK — user pays their own API costs (pennies)
- Platform fee covers orchestration and session intelligence

### Tier 3: CHASSIS Managed (TBD)
**Target:** Power users, small teams, mission-critical projects.
- CHASSIS provides the AI — no keys needed
- Full 6-agent pool routing by complexity
- Guardian Level 4 (consensus-based cross-examination)
- Priority support

### Pricing Principle
The 99% never need to pay more than pennies per build.
Cursor charges $20/month. CHASSIS Pro costs less and gives more control.
Free users are never locked out of their own projects.

### Vault Marketplace
- Sell vault packs: "Authentication Pack" — 15 tested auth functions, $3
- Sell project templates: "React Native Marketplace Starter", $15
- Community contributions: developers sell vault items, CHASSIS takes 30%
- Verified badge: CHASSIS-scanned compliance-verified code

### Timeline
- Q3 2026: Free tier public launch, community building
- Q4 2026: Pro tier with BYOK
- 2027: Managed tier when infrastructure supports it

---

## Planned: CHASSIS Audit Mode
> To be designed after current build features are stable.

A dedicated mode where the Supervisor/Worker pool audits existing code rather than builds new code. Supervisor generates the audit plan, Workers probe by specialty (logic, security, performance, syntax), findings are cross-checked and ranked by Supervisor into a single unified report. Works on any project — not just CHASSIS-managed ones.

---

## Phase 4 — P2P AI Network & CHASSIS LLM (2027 Target)

### Vision
CHASSIS becomes fully independent of commercial AI providers. A code-specialized LLM runs locally and across a P2P network of CHASSIS users, delivering frontier-level coding assistance at zero API cost.

### The CHASSIS LLM

**Why a specialist beats a generalist:**
General LLMs split capacity across every human domain. A code-only model dedicates 100% of parameters to software development — potentially more capable than frontier models on coding tasks despite being smaller and cheaper to run.

**Foundation:**
- Base: Code Llama 70B or DeepSeek Coder as starting point
- Target hardware: 64GB+ RAM, RTX 4090 or equivalent
- First node: September 2026 LLM machine

**Training pipeline:**
1. Start with code-specialized base model
2. Fine-tune on CHASSIS build history (real prompts → real outputs)
3. Fine-tune on vault contents (verified working, reusable code)
4. RLHF from Guardian correction pairs
5. CHASSIS-specific instruction tuning (5W blueprint context, Supervisor/Worker roles)
6. Deploy as local model + P2P node
7. Continuous improvement from new builds

### P2P Network Architecture

**Tiered peer selection (solves latency):**
- Tier 0 — Local vault hit: zero latency
- Tier 1 — Local CHASSIS LLM: 50-200ms, completely private
- Tier 2 — Nearby peer (low ping): 200-500ms
- Tier 3 — Regional peer: 500ms-1s
- Tier 4 — Distant peer: 1-2s
- Tier 5 — Cloud fallback (Gemini/Kimi/Claude): 1-3s, user pays API cost

**Peer selection scoring:** GPU capability, current load, geographic proximity, historical reliability, connection speed. Re-scored every 60 seconds.

**Privacy guarantee:** Code never stored on peer machines beyond inference. Requests encrypted in transit. Same WebRTC DataChannel architecture as Ryppel. No central server ever sees user code.

**Incentive model:** Fast, accurate peers earn reputation → priority routing → vault access credits. Network self-optimizes toward quality.

### Implementation Timeline
- **September 2026** — First LLM machine (64GB+ RAM, RTX 4090), Code Llama 70B base, begin fine-tuning
- **Q4 2026** — Wire CHASSIS to local model as Tier 1 provider, benchmark vs Gemini/Kimi
- **Q1 2027** — P2P Network Alpha (2-3 trusted nodes), peer scoring, parallel execution
- **Q2 2027** — P2P Network Beta, open to Pro users with qualifying hardware, reputation system
- **Q3 2027** — Full independence: P2P handles majority, cloud APIs become backup only

### The End State
A user opens CHASSIS. Types what they want to build. Request goes to local model (free, instant, private). Vault has seen this pattern — answers in 0ms. Total cost: $0. Total privacy: complete. No OpenAI, Google, Anthropic, or central server. Just CHASSIS users helping each other build software.

---

## Distribution Strategy

### Path 1: CHASSIS Extension (.vsix)
Install into any VS Code derivative (VSCodium, Cursor, Windsurf, plain VS Code).
Current deployment: VSCodium only (`/home/papajoe/.vscode-oss/extensions/papajoe.chassis-0.3.4/`).

### Path 2: CHASSIS IDE (VSCodium fork) ← PRIMARY TARGET
Fork VSCodium, bake CHASSIS in as a first-class feature — not a plugin.
- No extension to install, no permission prompts
- CHASSIS panels built into the activity bar by default
- Custom splash screen, custom welcome flow
- Distributed as a standalone installer
- Can ship with pre-loaded free AI keys (Gemini, Groq)

### Why this matters
VSCodium fork = total control over the UX. Can eliminate the "install extension" friction entirely. CHASSIS IS the editor, not a bolt-on.

### Implementation path
1. Fork VSCodium repo
2. Bake extension into `extensions/` as a bundled default
3. Modify welcome flow to launch CHASSIS onboarding
4. Custom branding (`product.json`)
5. Build + package as installable binary
