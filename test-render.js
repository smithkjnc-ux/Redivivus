const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Inject script to track render calls
  await page.evaluate(() => {
    window.renderCount = 0;
    // We can't easily hook internal render unless we override Canvas API
    const origFillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(...args) {
      window.renderCount++;
      return origFillRect.apply(this, args);
    };
  });
  
  await page.click('#startBtn');
  
  await new Promise(r => setTimeout(r, 1000));
  
  const count = await page.evaluate(() => window.renderCount);
  console.log("FillRect called", count, "times in 1 second");
  
  await browser.close();
})();
