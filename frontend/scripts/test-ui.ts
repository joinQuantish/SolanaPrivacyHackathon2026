import { chromium } from 'playwright';

async function testUI() {
  const browser = await chromium.launch({ headless: false }); // Show browser
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Capture console messages
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warn') {
      console.log(`Console ${type}:`, msg.text());
    }
  });

  // Capture network failures
  page.on('requestfailed', request => {
    console.log('Request failed:', request.url(), request.failure()?.errorText);
  });

  console.log('Opening app...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Take initial screenshot
  await page.screenshot({ path: '/tmp/ui-initial.png' });
  console.log('Initial screenshot saved to /tmp/ui-initial.png');

  // Check background color
  const bodyBg = await page.evaluate(() => {
    return getComputedStyle(document.body).backgroundColor;
  });
  console.log('Body background color:', bodyBg);

  // Now search for markets (should work without connecting)
  console.log('Looking for search input...');
  const searchInput = page.locator('input[placeholder*="Search"]');
  if (await searchInput.count() > 0) {
    console.log('Found search input, searching for "trump"...');
    await searchInput.fill('trump');
    await page.waitForTimeout(5000); // Wait for debounce and API call

    // Take screenshot after search
    await page.screenshot({ path: '/tmp/ui-search-results.png' });
    console.log('Search results screenshot saved to /tmp/ui-search-results.png');

    // Check table structure
    const table = page.locator('table.market-table');
    if (await table.count() > 0) {
      console.log('Market table found!');

      const rows = await page.locator('table.market-table tbody tr').count();
      console.log(`Table has ${rows} rows`);

      // Count buttons
      const buyButtons = await page.locator('button.btn-buy').count();
      const sellButtons = await page.locator('button.btn-sell').count();
      console.log(`Buy buttons: ${buyButtons}, Sell buttons: ${sellButtons}`);
    } else {
      console.log('No market table found yet, checking for loading...');
      const loading = await page.locator('.animate-pulse').count();
      console.log(`Loading elements: ${loading}`);
    }
  } else {
    console.log('No search input found!');
    // Debug: check what elements exist
    const inputs = await page.locator('input').all();
    console.log(`Found ${inputs.length} inputs total`);
  }

  // Wait for user to see the result
  console.log('\nKeeping browser open for 15 seconds...');
  await page.waitForTimeout(15000);

  await browser.close();
  console.log('Done!');
}

testUI().catch(console.error);
