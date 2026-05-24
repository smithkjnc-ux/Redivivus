const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 800, height: 800 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  await page.click('#startBtn');
  
  // Wait 1 second for game to run
  await new Promise(r => setTimeout(r, 1000));
  
  // Take screenshot
  await page.screenshot({ path: 'game-after-start.png' });
  
  // Check bird Y position
  const state = await page.evaluate(() => {
    return window.gameState ? window.gameState.state : 'No gameState exposed';
  });
  console.log("Game state after 1 second:", state);
  
  await browser.close();
})();
