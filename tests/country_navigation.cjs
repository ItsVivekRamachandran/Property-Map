const {chromium} = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') : require('playwright');
const assert = require('assert'), path = require('path');

(async () => {
  const browser = await chromium.launch({executablePath: require('./chromium_path.cjs'), headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1512, height: 1050}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + path.resolve(__dirname, '../Property-Map.html'));
    await page.waitForSelector('#mapSvg .region');
    await page.locator('[data-view=projects]').click();
    await page.locator('.project-card').filter({hasText: 'Demo Property Portfolio'}).locator('[data-action=open-project]').click();

    // Use real pointer clicks inside the painted geometry, not a path's bounding-box center.
    async function clickRegion(selector) {
      const point = await page.locator(selector).evaluate(node => {
        const box = node.getBoundingClientRect();
        for (let row = 1; row < 30; row++) for (let col = 1; col < 30; col++) {
          const x = box.left + box.width * col / 30, y = box.top + box.height * row / 30;
          if (document.elementFromPoint(x, y) === node) return {x, y};
        }
      });
      assert(point, 'region has a clickable visible area: ' + selector);
      await page.mouse.click(point.x, point.y);
    }
    async function assertCountry(code) {
      await page.waitForFunction(code => document.querySelector('#countryFilter')?.value === code && !!document.querySelector('#stateFilter'), code);
      assert.equal(await page.locator('#stateFilter').inputValue(), '');
      assert.equal(await page.locator('#districtFilter').inputValue(), '');
      assert(await page.locator('#districtFilter').isDisabled());
      assert.equal(await page.locator('#propertySearch').inputValue(), '');
      assert(await page.locator('#mapSvg .region').evaluateAll((nodes, code) => nodes.length > 0 && nodes.every(node => node.dataset.country === code), code));
      assert.equal(await page.evaluate(() => S.page), 1);
    }
    for (const [scope, code, region] of [
      ['WORLD', 'BRA', 'BRA'],
      ['CONTINENT_NORTH_AMERICA', 'USA', 'USA:Nevada'],
      ['CONTINENT_SOUTH_AMERICA', 'BRA', 'BRA:Amazonas'],
      ['CONTINENT_EUROPE', 'FRA', 'FRA:Gironde'],
      ['CONTINENT_AFRICA', 'ZAF', 'ZAF:Northern Cape'],
      ['CONTINENT_ASIA', 'IND', 'IND:Rajasthan'],
      ['CONTINENT_OCEANIA', 'AUS', 'AUS:Western Australia']
    ]) {
      await page.selectOption('#countryFilter', scope);
      await page.waitForSelector(`#mapSvg .region[data-state="${region}"]`);
      await page.fill('#propertySearch', 'no matching properties');
      await page.waitForTimeout(250);
      await clickRegion(`#mapSvg .region[data-state="${region}"]`);
      await assertCountry(code);
    }

    // Keyboard activation follows the same country navigation path.
    for (const [scope, region, key] of [['WORLD', 'USA', 'Enter'], ['CONTINENT_NORTH_AMERICA', 'USA:Nevada', 'Space']]) {
      await page.selectOption('#countryFilter', scope);
      await page.locator(`#mapSvg .region[data-state="${region}"]`).focus();
      await page.keyboard.press(key);
      await assertCountry('USA');
      assert.equal(await page.locator('.stats .num').first().textContent(), '44');
    }
    // Country-level clicks still filter states, and both dropdowns open the full country.
    await clickRegion('#mapSvg .region[data-state="Nevada"]');
    await page.waitForFunction(() => document.querySelector('#stateFilter')?.value === 'Nevada');
    await page.selectOption('#countryFilter', 'WORLD');
    const badge = page.locator('#mapSvg .world-country[data-state="USA"] + .map-label rect');
    assert.equal(await badge.evaluate(node => getComputedStyle(node).pointerEvents), 'none', 'count badge does not intercept country clicks');
    await page.selectOption('#worldCountryFilter', 'USA');
    await assertCountry('USA');
    assert.deepEqual(errors, []);
    console.log('PASS: real country clicks across World and all six continents, dropdown synchronization, cleared filters, keyboard navigation, and country-level state selection.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1});
