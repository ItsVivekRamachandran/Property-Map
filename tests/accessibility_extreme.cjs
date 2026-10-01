const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium} = modules ? require(modules + '/playwright') : require('playwright');
const axePath = require.resolve('axe-core/axe.min.js', modules ? {paths: [modules]} : undefined);
const {spawn} = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');

(async () => {
  const root = path.resolve(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-a11y-'));
  const server = spawn(process.env.PYTHON || 'python3', [root + '/server.py', '--port', '8003'], {
    env: {...process.env, PROPERTY_MAP_DATA: tmp}, stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((resolve, reject) => {server.stdout.once('data', resolve); server.once('error', reject)});
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/tmp/pm-chromium/chromium', headless: true});
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, bypassCSP: true});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8003');
    await page.waitForSelector('#mapSvg .region');
    assert.equal(await page.locator('.nav [aria-current=page]').count(), 1, 'one navigation item is current');
    assert.equal(await page.locator('[data-action=mapmode][aria-pressed=true]').count(), 1, 'one map mode is pressed');
    assert.equal(await page.locator('#mapSvg .region[tabindex="0"]').count(), 1, 'map uses roving tabindex');

    await page.addScriptTag({path: axePath});
    const axe = await page.evaluate(async () => await axe.run(document, {resultTypes: ['violations']}));
    const serious = axe.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    if (serious.length) console.error(JSON.stringify(serious.map(v => ({id: v.id, nodes: v.nodes.map(n => ({target: n.target, summary: n.failureSummary}))})), null, 2));
    assert.deepEqual(serious.map(v => ({id: v.id, nodes: v.nodes.length})), [], 'no serious or critical axe violations');

    const bootstrap = await (await fetch('http://127.0.0.1:8003/api/bootstrap')).json(), project = bootstrap.projects[0];
    project.properties = project.properties.slice(0, 9);
    await fetch('http://127.0.0.1:8003/api/projects/' + project.id, {method: 'PUT', headers: {'Content-Type': 'application/json', 'X-Property-Map': '1'}, body: JSON.stringify(project)});
    await page.reload(); await page.waitForSelector('#mapSvg .region'); await page.locator('[data-action=next]').click();
    await page.locator('.table [data-action=property]').first().click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-action=delete-property]').click();
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    assert((await page.locator('.table-footer').textContent()).includes('1 / 1'), 'page clamps after deleting the final row');
    assert(!(await page.locator('.table-footer').textContent()).includes('9–8'), 'range remains valid');

    await page.setViewportSize({width: 320, height: 800});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, 'no 320px horizontal overflow');
    await page.locator('[data-view=projects]').click();
    while (await page.locator('[data-action=edit-project]').count()) {
      await page.locator('[data-action=edit-project]').first().click();
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-action=delete-project]').click();
      await page.waitForSelector('#overlay:empty', {state: 'attached'});
    }
    await page.locator('[data-view=settings]').click();
    await page.locator('[data-action=add-field]').click();
    assert.equal(await page.locator('#fieldForm').count(), 1, 'account field editor works with no projects');
    await page.fill('#fieldForm input[name=label]', 'Unsaved field');
    let discardPrompted = false;
    page.once('dialog', async dialog => {discardPrompted = true; assert(dialog.message().includes('Discard')); await dialog.dismiss()});
    await page.getByRole('button', {name: 'Close panel'}).click();
    assert(discardPrompted && await page.locator('#fieldForm').count() === 1, 'dirty forms warn before closing');
    page.once('dialog', async dialog => await dialog.accept());
    await page.getByRole('button', {name: 'Close panel'}).click();
    assert.deepEqual(errors, [], 'no browser page errors');
    console.log('PASS: axe serious/critical, semantics, roving map focus, pagination deletion, 320px layout, empty-workspace settings, and unsaved-change warning.');
  } finally {
    await browser?.close(); server.kill(); fs.rmSync(tmp, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1});
