// [SCOPE] Shared Redivivus annotation rules -- injected into every Worker/Supervisor AI prompt.
// Single source of truth. Import Redivivus_WORKER_RULES and append to any prompt that generates code.
// This is why annotation rules were missing from internal pipelines: they were written for
// external AI editors (CLAUDE.md, .windsurfrules) but never wired into Redivivus's own Worker prompts.
// All build and fix pipelines must import this and append it to their Worker prompt.

export const Redivivus_WORKER_RULES = `
Redivivus ANNOTATION RULES -- required in all code you write or modify:
1. [SCOPE] at line 1 of every NEW file you create.
   Format: [SCOPE] What this file does -- one line.
   Correct syntax: // [SCOPE] for JS/TS, <!-- [SCOPE] --> for HTML, # [SCOPE] for Python/Shell/YAML.
2. [WARN] immediately above any fragile, risky, or non-obvious logic.
   Format: // [WARN] What breaks here and why.
3. [DEAD] immediately above every block of code you REMOVE or REPLACE.
   Format: // [DEAD] What was there -- why it fails here.
   Never silently delete code. Always document what you removed and why.
4. Preserve ALL existing [SCOPE] [WARN] [DEAD] [TODO] [NEXT] tags. Never delete them.
5. Keep every file under 200 lines. If a new file exceeds 200 lines, split by responsibility
   into smaller files, each with its own [SCOPE] at line 1.
6. No non-ASCII characters in JavaScript, TypeScript, or HTML script blocks.
   No emoji, no Unicode arrows, no box-drawing chars. ASCII only.
   Use -> not arrows, -- not dashes, [!] not warning symbols.
7. NO FLAT FILES — Every file lives in a folder that matches its responsibility (UI in UI, logic in logic). No exceptions.
8. SCOPE DISCIPLINE — fix ONLY what was asked. Do not rename, refactor, restructure, or "improve"
   anything the user did not specifically request. If you notice something unrelated that needs
   fixing, add a // [TODO] comment noting it, but do NOT change it. The Guardian will revert
   any out-of-scope changes and the user will be asked for approval before anything extra is done.
9. [BROWSER GAMES AND SIMPLE TOOLS]: ALWAYS output a single self-contained index.html file with all CSS and JavaScript inline. Do NOT use external .js or .css files. Do NOT use a src/ directory.
   RAISE THE QUALITY BAR -- bare minimum is NOT acceptable:
   VISUALS: gradient background, styled UI panel outside the canvas (score, buttons), border-radius + box-shadow on canvas, animated CSS overlays for game states (slideIn keyframe). No flat colors. No score drawn on canvas.
   SOUND: Web Audio API oscillator + gain for every interaction (flap, score, death, power-up). Initialize on first user gesture.
   UX: localStorage high score, pause key (P), tab-visibility pause.
   RESPONSIVE: clamp() sizing, mobile media query. canvas max-height: calc(100vh - 140px).
   Layout: body { display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; margin:0; background:linear-gradient(...); overflow:hidden; gap:16px; }
   PLAYABILITY -- IF THIS IS A GAME, ALL OF THESE ARE REQUIRED (missing any = broken build, not complete):
   - requestAnimationFrame game loop that calls update() AND draw() every frame. No loop = no game.
   - Input event listeners: click/mousedown/touchstart for pointer input, keydown for Space and Arrow keys.
   - State machine: at minimum 'start' -> 'playing' -> 'gameover' states with visible overlay transitions.
   - Collision detection for player vs all obstacles and all boundaries (floor/ceiling/walls).
   - Score counter that increments during play and is visible in real-time.
   - Fixed canvas pixel dimensions (e.g. width=360 height=640) set in JavaScript, not just CSS.
   - Game is immediately playable on first open -- a blank canvas or a file that ends after setup() is a build FAILURE.

   CANVAS RENDERING TECHNIQUES -- required for canvas games; flat sprites = build failure:
   - SPRITE SHAPE (most important rule): A sprite is NOT a single fillRect. A gradient applied to a rectangle is still a rectangle -- it fails this rule.
     Every player and enemy entity MUST be drawn as a COMPOSITE SHAPE using multiple drawing operations that form a recognizable figure with distinct body parts.
     Minimum: body + head OR body + limbs + features (eyes, antennae, legs, fins, etc.).
     For classic arcade games (Space Invaders, Galaga, etc.) use PIXEL-ART BITMAPS:
       const SPRITE = [[0,0,1,0,0],[0,1,1,1,0],[1,1,1,1,1],[1,0,1,0,1],[1,1,1,1,1]]; // 5-col pixel grid
       const PX = 4; // pixel size in canvas pixels
       SPRITE.forEach((row,r) => row.forEach((on,c) => { if(on) ctx.fillRect(x + c*PX, y + r*PX, PX, PX); }));
     Bitmap sprites guarantee recognizable shapes at any size. Use a different bitmap per enemy type (squid, crab, octopus).
   - Sprite gradients: const g = ctx.createLinearGradient(x,y,x2,y2); g.addColorStop(0,'#hex'); g.addColorStop(1,'#hex'); ctx.fillStyle=g; -- apply to sprite pixels, not to a bounding box fillRect
   - Glow: ctx.shadowColor='#hex'; ctx.shadowBlur=12; [draw entity]; ctx.shadowColor='transparent'; ctx.shadowBlur=0 -- reset after each entity or glow bleeds to everything
   - Compositing: ctx.save() before each complex entity; ctx.restore() after -- never leave transforms/shadows/alpha dirty on the context
   - Particles: class Particle { constructor(x,y){this.vx=Math.cos(a)*spd; this.vy=Math.sin(a)*spd; this.alpha=1;} update(){this.x+=this.vx; this.y+=this.vy; this.alpha-=0.04;} }
   - Parallax: bgLayer1.x -= PIPE_SPEED*0.3; bgLayer2.x -= PIPE_SPEED*0.6; wrap at canvas width -- 2 layers minimum
   - Screen shake: shakeFrames counter; if(shakeFrames>0){ctx.translate(Math.random()*6-3, Math.random()*6-3); shakeFrames--;} ctx.setTransform(1,0,0,1,0,0) after all draw calls
   - NEVER ctx.fillStyle='var(--anything)' -- CSS variables are invisible to canvas; context silently ignores them and renders transparent

10. SECURITY -- non-negotiable. These are not suggestions:
    - NEVER hardcode secrets, API keys, passwords, tokens, or private URLs. Use environment variables: process.env.X (Node), os.environ.get('X') (Python), import.meta.env.X (Vite/browser).
    - ALWAYS validate user inputs at every boundary (form fields, URL params, API request bodies). Reject or sanitize before use.
    - NEVER concatenate user input into SQL strings. Use parameterized queries (?, $1, etc.) or an ORM.
    - NEVER set innerHTML to user-controlled data without sanitization. Use textContent or a sanitizer (DOMPurify).
    - NEVER use eval(), new Function(), or setTimeout(string) with any external or user-controlled data.
    - Set Content-Security-Policy and X-Content-Type-Options headers on all server responses.
    - Never store sensitive data (tokens, passwords) in localStorage or cookies without encryption and proper expiry.

11. ERROR HANDLING -- no silent failures:
    - NEVER write empty catch blocks (catch {}, catch(e) {}). If you catch an error, log it with context or rethrow.
    - ALWAYS handle I/O errors (file read, network fetch, database query) with a meaningful fallback or user-facing message.
    - Functions that can fail must either return a result type ({ ok: true, data } | { ok: false, error }) or throw with a clear message.
    - No undefined returns from functions that callers expect to always return a value.

12. CODE CLARITY -- readable by humans, not just machines:
    - No single-letter variable names outside loop counters (i, j, k). Names must describe what the value IS.
    - No magic numbers. Define named constants: const MAX_RETRIES = 3 -- not just the number 3 inline.
    - No function longer than 50 lines. If it grows beyond that, split by responsibility.
    - One function, one job. A function that both fetches data AND renders UI AND updates state is three functions.`.trim();
