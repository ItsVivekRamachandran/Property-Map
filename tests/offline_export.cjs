const {chromium} = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') : require('playwright');
const path = require('path'), assert = require('assert');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/tmp/pm-chromium/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader']
  });
  try {
    const page = await browser.newPage({acceptDownloads: true});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '../Property-Map.html'));
    await page.waitForSelector('#mapSvg .region');
    await page.locator('[data-action=export]').click();
    assert.equal(await page.locator('#exportCount').textContent(), '44 of 44 project properties included');
    assert.equal(await page.locator('#exportRecords .export-record').count(), 44);
    const download = page.waitForEvent('download');
    await page.locator('[form=exportForm]').click();
    const file = await download;
    assert(file.suggestedFilename().endsWith('.pdf'));
    assert((await file.path()).length > 0);
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    await page.locator('[data-action=export]').click();
    await page.selectOption('#exportForm select[name=format]', 'PNG');
    await page.selectOption('#exportForm select[name=pngLayout]', 'poster');
    assert((await page.locator('#exportEstimate').textContent()).includes('One PNG image'));
    const imageDownload = page.waitForEvent('download');
    await page.locator('[form=exportForm]').click();
    const image = await imageDownload;
    assert(image.suggestedFilename().endsWith('.png'));
    await image.saveAs(path.resolve(__dirname, 'export-poster-sample.png'));
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    await page.locator('[data-view=projects]').click();
    assert.equal(await page.locator('[data-action=download-export]').count(), 2);
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('[data-view=workspace]').click();
    await page.locator('[data-action=export]').click();
    await page.selectOption('#exportForm select[name=format]', 'PNG');
    await page.selectOption('#exportForm select[name=pngLayout]', 'poster');
    await page.locator('.drawer').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    const mobile = await page.evaluate(() => ({pageOverflow: document.documentElement.scrollWidth > innerWidth,
      drawer: document.querySelector('.drawer').getBoundingClientRect().toJSON(), width: innerWidth}));
    assert.equal(mobile.pageOverflow, false);
    assert(mobile.drawer.left >= 0 && mobile.drawer.right <= mobile.width, 'Drawer stays inside the mobile viewport');
    await page.screenshot({path: path.resolve(__dirname, 'export-poster-mobile.png')});
    assert.deepEqual(errors, []);
    console.log('PASS: offline HTML maps, 44-row PDF and single-image PNG downloads, project history, and mobile export layout.');
  } finally {await browser.close()}
})().catch(e => {console.error(e); process.exitCode = 1});
