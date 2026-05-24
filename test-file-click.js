const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  
  await page.goto('file:///home/papajoe/projects/flappy-bird/index.html', { waitUntil: 'networkidle0' });
  
  console.log("Clicking start button on file://...");
  await page.click('#startBtn');
  
  await new Promise(r => setTimeout(r, 1000));
  
  const display = await page.evaluate(() => document.getElementById('startMenu').style.display);
  console.log("Start Menu display is:", display);
  
  await browser.close();
})();
