const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  console.log("Clicking start button...");
  await page.click('#startBtn');
  
  // Wait a moment to see if anything changes or errors occur
  await new Promise(r => setTimeout(r, 1000));
  
  // Evaluate if startMenu is hidden
  const display = await page.evaluate(() => document.getElementById('startMenu').style.display);
  console.log("Start Menu display is:", display);
  
  await browser.close();
})();
