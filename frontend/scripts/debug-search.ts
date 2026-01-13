import { chromium } from 'playwright';

async function debugSearch() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Intercept API responses
  page.on('response', async response => {
    if (response.url().includes('/api/markets/events')) {
      const url = response.url();
      try {
        const json = await response.json();
        console.log('\n=== API RESPONSE ===');
        console.log('URL:', url);
        console.log('Event count:', json.events?.length);
        console.log('Event titles:', json.events?.map((e: any) => e.title));
        console.log('====================\n');
      } catch (e) {
        console.log('Could not parse response');
      }
    }
  });

  console.log('Opening app...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  console.log('Waiting for initial load...');
  await page.waitForTimeout(10000);

  // Get initial titles
  const initialTitles = await page.locator('h3').allTextContents();
  console.log('\n=== INITIAL UI TITLES ===');
  console.log(initialTitles);

  await page.screenshot({ path: '/tmp/debug-1-initial.png' });

  // Now search for trump
  console.log('\n=== SEARCHING FOR "trump" ===');
  const searchInput = page.locator('input[placeholder*="Search"]');
  await searchInput.fill('trump');

  console.log('Waiting for search results (10 seconds)...');
  await page.waitForTimeout(10000);

  // Get titles after search
  const afterSearchTitles = await page.locator('h3').allTextContents();
  console.log('\n=== AFTER SEARCH UI TITLES ===');
  console.log(afterSearchTitles);

  await page.screenshot({ path: '/tmp/debug-2-after-search.png' });

  // Check if they're the same
  console.log('\n=== COMPARISON ===');
  console.log('Initial count:', initialTitles.length);
  console.log('After search count:', afterSearchTitles.length);
  console.log('Are they the same?', JSON.stringify(initialTitles) === JSON.stringify(afterSearchTitles));

  console.log('\nKeeping browser open for 30 seconds to inspect...');
  await page.waitForTimeout(30000);

  await browser.close();
}

debugSearch().catch(console.error);
