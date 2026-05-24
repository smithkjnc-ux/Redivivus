const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 100));
  
  // Track bird Y position via a DOM element or canvas pixel?
  // We can't access `bird` directly because it's in a module and not exposed to window.
  // We'll evaluate a script that imports bird.js!
  const birdY = await page.evaluate(async () => {
    try {
      const birdModule = await import('./src/entities/bird.js');
      return birdModule.bird.y;
    } catch(e) {
      return e.toString();
    }
  });
  console.log("Bird Y after start:", birdY);
  
  await browser.close();
})();
