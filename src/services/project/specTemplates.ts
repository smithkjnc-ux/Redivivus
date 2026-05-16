// [SCOPE] Deterministic spec templates for well-known task patterns.
// When a task matches a known pattern, return a pinned spec instead of asking the Supervisor AI to generate one.
// This eliminates output variability for tasks where the correct implementation is well-defined.
// [WARN] Keep templates under 300 words — Worker prompt has token limits.

export interface SpecTemplate {
  name: string;
  match: (task: string) => boolean;
  spec: string;
  // If set, skip Worker AI entirely — deliver this verified code directly. Zero variance.
  codeTemplate?: string;
}

// [DONE] Added: todo-list, calculator, markdown-preview, color-picker
const TEMPLATES: SpecTemplate[] = [
  {
    name: 'canvas-trail-animation',
    match: (task) => {
      const t = task.toLowerCase();
      return (
        (t.includes('canvas') || t.includes('animation') || t.includes('animate')) &&
        (t.includes('trail') || t.includes('glow') || t.includes('bounce') || t.includes('pong') || t.includes('snake')) &&
        t.includes('html')
      );
    },
    codeTemplate: `<!DOCTYPE html>
<html>
<head>
<title>Animation</title>
<style>
body { margin:0; overflow:hidden; background:#0a0a0f; }
canvas { display:block; background:#0a0a0f; }
</style>
</head>
<body>
<canvas></canvas>
<script>
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const segmentRadius = 5, minRadius = 1, maxTrailLength = 200;
let x, y, dx, dy, speed, hue = 200;
const trail = [];

function setup() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  speed = Math.hypot(canvas.width, canvas.height) / 180;
  x = canvas.width / 2;
  y = canvas.height / 2;
  const angle = Math.random() * Math.PI * 2;
  dx = Math.cos(angle) * speed;
  dy = Math.sin(angle) * speed;
}
window.addEventListener('resize', setup);
setup();

function animate() {
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  x += dx; y += dy;
  if (x < segmentRadius) { x = segmentRadius; dx = Math.abs(dx); }
  else if (x > canvas.width - segmentRadius) { x = canvas.width - segmentRadius; dx = -Math.abs(dx); }
  if (y < segmentRadius) { y = segmentRadius; dy = Math.abs(dy); }
  else if (y > canvas.height - segmentRadius) { y = canvas.height - segmentRadius; dy = -Math.abs(dy); }

  trail.push({ x, y, hue });
  if (trail.length > maxTrailLength) { trail.shift(); }
  hue = (hue + 1) % 360;

  for (let i = 0; i < trail.length; i++) {
    const ageFactor = i / trail.length;
    const alpha = ageFactor * 0.8 + 0.1;
    const radius = ageFactor * segmentRadius + minRadius;
    ctx.shadowBlur = 15;
    ctx.shadowColor = \`hsla(\${trail[i].hue},100%,60%,\${alpha})\`;
    ctx.fillStyle = \`hsla(\${trail[i].hue},100%,60%,\${alpha})\`;
    ctx.beginPath();
    ctx.arc(trail[i].x, trail[i].y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  requestAnimationFrame(animate);
}
animate();
</script>
</body>
</html>`,
    spec: `Single HTML file. No external dependencies.

CSS: body { margin:0; overflow:hidden; background:#0a0a0f; } canvas { display:block; }

JS structure — in this exact order:
1. Declare: let x, y, dx, dy, hue=200; const trail=[], maxTrailLength=200, segmentRadius=5, minRadius=1;
2. setup(): canvas.width=window.innerWidth; canvas.height=window.innerHeight; speed=Math.hypot(canvas.width,canvas.height)/180; x=canvas.width/2; y=canvas.height/2; const angle=Math.random()*Math.PI*2; dx=Math.cos(angle)*speed; dy=Math.sin(angle)*speed; window.onresize=setup;
3. animate(): 
   a. ctx.fillStyle='rgba(0,0,0,0.12)'; ctx.fillRect(0,0,canvas.width,canvas.height);
   b. x+=dx; y+=dy;
   c. Wall bounce with clamp: if(x<segmentRadius){x=segmentRadius;dx=Math.abs(dx);} if(x>canvas.width-segmentRadius){x=canvas.width-segmentRadius;dx=-Math.abs(dx);} same for y/dy;
   d. trail.push({x,y,hue}); if(trail.length>maxTrailLength)trail.shift(); hue++;
   e. Trail loop: for(let i=0;i<trail.length;i++){ const ageFactor=i/trail.length; ctx.shadowBlur=15; ctx.shadowColor=ctx.fillStyle=\`hsla(\${trail[i].hue},100%,60%,\${ageFactor*0.8+0.1})\`; ctx.beginPath(); ctx.arc(trail[i].x,trail[i].y,ageFactor*segmentRadius+minRadius,0,Math.PI*2); ctx.fill(); }
   f. AFTER trail loop: ctx.shadowBlur=0; (prevents glow bleeding into background)
   g. requestAnimationFrame(animate); — ONE call, at the end only
4. setup(); animate();

CRITICAL: ageFactor uses trail.length (not maxTrailLength). speed derived from Math.hypot, not hardcoded. shadowBlur reset to 0 after loop. No classes, no split files.`,
  },
  {
    name: 'todo-list-html',
    match: (task) => {
      const t = task.toLowerCase();
      return (t.includes('todo') || t.includes('to-do') || t.includes('task list')) && t.includes('html') && !t.includes('react') && !t.includes('vue');
    },
    spec: `Single HTML file. localStorage persistence. No frameworks, no external deps.
CSS: dark background (#1a1a2e), card container, input row with text field + Add button, list items with checkbox + text + Delete button. Completed items get line-through + muted color.
JS: load tasks from localStorage on DOMContentLoaded. addTask(): trim input, push {id:Date.now(),text,done:false} to array, save, render. toggleTask(id): flip done flag, save, render. deleteTask(id): filter out, save, render. save(): localStorage.setItem('todos', JSON.stringify(tasks)). render(): clear list, forEach task → create li with checkbox (checked=task.done, onchange=toggleTask), span with text, delete button.
CRITICAL: Enter key on input triggers addTask. Empty input is ignored. Tasks persist across page reload.`,
  },
  {
    name: 'calculator-html',
    match: (task) => {
      const t = task.toLowerCase();
      return (t.includes('calculator') || t.includes('calc')) && t.includes('html') && !t.includes('scientific') && !t.includes('react');
    },
    spec: `Single HTML file. CSS Grid layout. No external deps.
CSS: body centered dark bg. Calculator card 320px wide, display div (right-aligned text, large font, #0d0d0d bg, #00ff88 color), button grid 4 columns. Buttons: digit buttons gray, operator buttons orange (#ff9500), equals button green (#00ff88 text on dark), clear button red-tinted. All buttons same height ~60px, font-size 1.4rem.
JS: let display='', pendingOp='', pendingVal=null. pressDigit(d): display+=d, show. pressDot(): if no dot yet, display+='.', show. pressOp(op): pendingVal=parseFloat(display), pendingOp=op, display=''. pressEquals(): compute result based on pendingOp (+,-,*,/), display=String(result), pendingOp='', pendingVal=null. pressClear(): display='',pendingOp='',pendingVal=null,show.
CRITICAL: Division by zero shows 'Error'. Chained operations work (3+4*2 computes left-to-right as typed). Display shows '0' when empty.`,
  },
  {
    name: 'markdown-preview-html',
    match: (task) => {
      const t = task.toLowerCase();
      return (t.includes('markdown') || t.includes('md preview') || t.includes('markdown preview')) && t.includes('html');
    },
    spec: `Single HTML file. Uses marked.js from CDN (https://cdn.jsdelivr.net/npm/marked/marked.min.js). Split-pane layout.
CSS: full-height flex row. Left pane: dark textarea 50% width, monospace font, no resize. Right pane: 50% width, white bg, padding 20px, overflow-y auto, standard prose styles (h1-h6, p, code, pre, blockquote). Divider: 2px solid #333.
JS: const md = document.getElementById('editor'), preview = document.getElementById('preview'); function update() { preview.innerHTML = marked.parse(md.value); } md.addEventListener('input', update); update() on load with starter markdown text showing h1, paragraphs, code block, list.
CRITICAL: Live update on every keystroke. Starter text must be valid markdown. Code blocks must be visually distinct (dark bg, monospace).`,
  },
  {
    name: 'color-picker-html',
    match: (task) => {
      const t = task.toLowerCase();
      return (t.includes('color picker') || t.includes('colour picker') || (t.includes('color') && t.includes('picker'))) && t.includes('html');
    },
    spec: `Single HTML file. No external deps. Shows HEX, RGB, and HSL values simultaneously.
CSS: centered card, large color swatch (200x200px, border-radius 12px), native <input type="color"> picker, three read-only text outputs labeled HEX / RGB / HSL, copy button per output.
JS: const picker = document.getElementById('color'), swatch = document.getElementById('swatch'). function hexToRgb(hex): parse r,g,b. function rgbToHsl(r,g,b): compute h,s,l. function update(): swatch.style.background=picker.value, set HEX=picker.value, set RGB=rgb(r,g,b), set HSL=hsl(h,s%,l%). Copy buttons: navigator.clipboard.writeText(value) then show 'Copied!' for 1.5s. picker.addEventListener('input', update); update() on load with #6366f1.
CRITICAL: All three formats update on every color change. Copy feedback must auto-reset.`,
  },
];

/**
 * Returns a pinned deterministic spec if the task matches a known pattern.
 * Returns null if no template matches — fall through to Supervisor AI.
 */
export function getSpecTemplate(task: string): string | null {
  for (const t of TEMPLATES) {
    if (t.match(task)) { return t.spec; }
  }
  return null;
}

/**
 * Returns verified working code for a matched pattern — bypasses Worker AI entirely.
 * Returns null if no code template matches.
 */
export function getCodeTemplate(task: string): string | null {
  for (const t of TEMPLATES) {
    if (t.match(task) && t.codeTemplate) { return t.codeTemplate; }
  }
  return null;
}
