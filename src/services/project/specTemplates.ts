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

// [TODO] Add more templates as patterns are confirmed working
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
