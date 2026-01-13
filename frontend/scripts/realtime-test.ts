import { chromium } from 'playwright';

async function realtimeTest() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on('console', msg => {
    if (msg.text().includes('[Store]')) {
      console.log('[Browser]', msg.text());
    }
  });

  console.log('Opening app...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000); // Wait for initial load

  console.log('\n=== INITIAL STATE ===');
  const initialTitles = await page.locator('h3').allTextContents();
  console.log('Events:', initialTitles.length);
  await page.screenshot({ path: '/tmp/rt-1-initial.png' });

  // Type "trump" character by character with delays
  const searchInput = page.locator('input[placeholder*="Search"]');
  await searchInput.click();

  console.log('\n=== TYPING "trump" ===');
  for (const char of 'trump') {
    await searchInput.press(char);
    console.log(`Typed: "${char}"`);
    await page.waitForTimeout(200);
  }

  // Now wait for the debounce (500ms) + API call (~8 seconds)
  console.log('\nWaiting 12 seconds for search results...');
  for (let i = 1; i <= 12; i++) {
    await page.waitForTimeout(1000);
    const titles = await page.locator('h3').allTextContents();
    console.log(`${i}s: ${titles.length} events - ${titles.slice(0, 2).join(', ')}...`);
  }

  await page.screenshot({ path: '/tmp/rt-2-after-search.png' });

  console.log('\n=== FINAL STATE ===');
  const finalTitles = await page.locator('h3').allTextContents();
  console.log('Events:', finalTitles);

  console.log('\nDone! Browser stays open for 15 seconds...');
  await page.waitForTimeout(15000);
  await browser.close();
}

realtimeTest().catch(console.error);
