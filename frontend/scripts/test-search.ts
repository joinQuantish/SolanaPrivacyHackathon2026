import { chromium } from 'playwright';

async function testSearch() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Listen to all console messages
  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]:`, msg.text());
  });

  // Listen to network requests
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      console.log('[Request]:', request.method(), request.url());
    }
  });

  page.on('response', response => {
    if (response.url().includes('/api/')) {
      console.log('[Response]:', response.status(), response.url());
    }
  });

  console.log('Opening app...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Count initial events
  const initialEvents = await page.locator('[style*="background-secondary"]').count();
  console.log(`Initial event cards: ${initialEvents}`);

  // Screenshot before search
  await page.screenshot({ path: '/tmp/before-search.png' });

  // Find and fill search
  console.log('\nSearching for "bitcoin"...');
  const searchInput = page.locator('input[placeholder*="Search"]');
  await searchInput.fill('bitcoin');

  // Wait for debounce + API call (MCP API is slow ~6-8 seconds)
  console.log('Waiting for API response (this takes ~8 seconds)...');
  await page.waitForTimeout(10000);

  // Check events after search
  const afterSearchEvents = await page.locator('[style*="background-secondary"]').count();
  console.log(`Events after search: ${afterSearchEvents}`);

  // Get event titles
  const titles = await page.locator('h3').allTextContents();
  console.log('Event titles:', titles);

  // Screenshot after search
  await page.screenshot({ path: '/tmp/after-search.png' });

  // Clear search
  console.log('\nClearing search...');
  await searchInput.fill('');
  await page.waitForTimeout(10000);

  // Screenshot after clear
  await page.screenshot({ path: '/tmp/after-clear.png' });

  const afterClearEvents = await page.locator('[style*="background-secondary"]').count();
  console.log(`Events after clear: ${afterClearEvents}`);

  console.log('\nKeeping browser open for 10 seconds...');
  await page.waitForTimeout(10000);

  await browser.close();
  console.log('Done!');
}

testSearch().catch(console.error);
