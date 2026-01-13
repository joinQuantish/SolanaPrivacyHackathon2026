import { chromium } from 'playwright';

async function scrapeAxiomStyles() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to axiom.trade...');
  await page.goto('https://axiom.trade', { waitUntil: 'networkidle' });

  // Wait for content to load
  await page.waitForTimeout(3000);

  // Extract all CSS custom properties (CSS variables)
  const cssVariables = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const vars: Record<string, string> = {};

    // Get all CSS variables from :root
    for (let i = 0; i < styles.length; i++) {
      const prop = styles[i];
      if (prop.startsWith('--')) {
        vars[prop] = styles.getPropertyValue(prop).trim();
      }
    }
    return vars;
  });

  console.log('\n=== CSS Variables ===');
  console.log(JSON.stringify(cssVariables, null, 2));

  // Extract key element styles
  const elementStyles = await page.evaluate(() => {
    const getStyles = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const computed = getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        borderColor: computed.borderColor,
        borderRadius: computed.borderRadius,
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        padding: computed.padding,
        margin: computed.margin,
        boxShadow: computed.boxShadow,
      };
    };

    return {
      body: getStyles('body'),
      header: getStyles('header, nav, [class*="header"], [class*="nav"]'),
      table: getStyles('table, [class*="table"], [role="table"]'),
      tableRow: getStyles('tr, [class*="row"], [role="row"]'),
      tableCell: getStyles('td, [class*="cell"]'),
      button: getStyles('button, [class*="btn"]'),
      card: getStyles('[class*="card"]'),
      input: getStyles('input'),
    };
  });

  console.log('\n=== Element Styles ===');
  console.log(JSON.stringify(elementStyles, null, 2));

  // Extract all stylesheets
  const allStyles = await page.evaluate(() => {
    const sheets: string[] = [];
    for (const sheet of document.styleSheets) {
      try {
        if (sheet.cssRules) {
          for (const rule of sheet.cssRules) {
            sheets.push(rule.cssText);
          }
        }
      } catch (e) {
        // Cross-origin stylesheets can't be accessed
      }
    }
    return sheets;
  });

  // Extract color palette from the page
  const colorPalette = await page.evaluate(() => {
    const colors = new Set<string>();
    const elements = document.querySelectorAll('*');

    elements.forEach(el => {
      const style = getComputedStyle(el);
      if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        colors.add(style.backgroundColor);
      }
      if (style.color) {
        colors.add(style.color);
      }
      if (style.borderColor && style.borderColor !== 'rgba(0, 0, 0, 0)') {
        colors.add(style.borderColor);
      }
    });

    return Array.from(colors).slice(0, 30);
  });

  console.log('\n=== Color Palette ===');
  console.log(JSON.stringify(colorPalette, null, 2));

  // Take a screenshot
  await page.screenshot({ path: '/tmp/axiom-screenshot.png', fullPage: false });
  console.log('\nScreenshot saved to /tmp/axiom-screenshot.png');

  // Get specific classes used
  const classes = await page.evaluate(() => {
    const classSet = new Set<string>();
    document.querySelectorAll('*').forEach(el => {
      el.classList.forEach(c => classSet.add(c));
    });
    return Array.from(classSet).filter(c =>
      c.includes('bg') || c.includes('text') || c.includes('border') ||
      c.includes('color') || c.includes('dark') || c.includes('table')
    ).slice(0, 50);
  });

  console.log('\n=== Relevant Classes ===');
  console.log(JSON.stringify(classes, null, 2));

  await browser.close();
}

scrapeAxiomStyles().catch(console.error);
