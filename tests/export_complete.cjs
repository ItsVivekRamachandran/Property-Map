const {chromium} = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') : require('playwright');
const {spawn} = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');

(async () => {
  const root = path.resolve(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-complete-export-'));
  const server = spawn(process.env.PYTHON || 'python3', [root + '/server.py', '--port', '8002'], {
    env: {...process.env, PROPERTY_MAP_DATA: tmp}, stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((resolve, reject) => {server.stdout.once('data', resolve); server.once('error', reject)});
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: require('./chromium_path.cjs'), headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader']
    });
    const context = await browser.newContext({viewport: {width: 1512, height: 1050}, acceptDownloads: true});
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: 'http://127.0.0.1:8002'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8002');
    await page.waitForSelector('#mapSvg .region');

    // The 44-property sample fits one slide and can be copied straight to the clipboard.
    await page.locator('[data-action=export]').click();
    await page.waitForSelector('#exportPreview canvas');
    assert((await page.locator('#exportEstimate').textContent()).includes('fits a 16:9 slide'));
    const single = await page.evaluate(() => {
      const plan = ExportEngine.slidePlan(exportContext(document.querySelector('#exportForm')));
      return {height: plan.height, size: plan.size, rows: plan.columns.flat().filter(item => item.type === 'row').length};
    });
    assert.deepEqual([single.height, single.rows], [1080, 44]);
    // Combined layers: counts, dots and legend colours in one map.
    for (const layer of ['count', 'dots', 'status']) await page.check(`#exportForm input[name=layer_${layer}]`);
    const combined = await page.evaluate(() => {
      const svg = new DOMParser().parseFromString(exportMapMarkup(exportContext(document.querySelector('#exportForm')).layers), 'image/svg+xml');
      return {dots: svg.querySelectorAll('.count-dot').length, pills: svg.querySelectorAll('.map-label rect').length};
    });
    assert.deepEqual(combined, {dots: 44, pills: 11}, 'dots and count numbers are drawn together');
    await page.uncheck('#exportForm input[name=list]');
    assert.equal(await page.evaluate(() => ExportEngine.slidePlan(exportContext(document.querySelector('#exportForm'))).columns.length), 0, 'the list can be switched off');
    await page.check('#exportForm input[name=list]');
    assert(single.size >= 12, 'slide text never drops below 12px on a 1920-wide slide');
    await page.locator('#exportCopy').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('copied'));
    const clip = await page.evaluate(async () => (await navigator.clipboard.read())[0].types);
    assert(clip.includes('image/png'), 'the slide image is on the clipboard');
    let download = page.waitForEvent('download');
    await page.locator('[form=exportForm]').click();
    let file = await download;
    await file.saveAs(root + '/tests/export-slide.png');
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    const size = await page.evaluate(async () => {
      const id = S.projects[0].exports[0].id, bitmap = await createImageBitmap(await (await fetch('/api/exports/' + id)).blob());
      return [bitmap.width, bitmap.height];
    });
    assert.deepEqual(size, [3840, 2160], 'slides are 16:9 at 4K');

    // A long portfolio: every record must still be drawn, continuing over extra slides.
    const bootstrap = await (await page.request.get('http://127.0.0.1:8002/api/bootstrap')).json();
    const project = bootstrap.projects.find(p => p.id === 'us-coverage');
    const longName = 'Regional Product Management and Operations Portfolio Location with Extended Property Identification QA-065';
    project.fields.push({id: 'pm_ref', label: 'Product management reference', type: 'text', visibility: 'everyone', editable: 'everyone', options: [], required: false});
    for (let i = 0; i < 66; i++) {
      project.properties.push({
        id: `qa-${i}`, code: `QA-${String(i).padStart(3, '0')}`,
        name: i === 65 ? longName : `Quality assurance site ${i}`,
        country: 'USA', state: 'Nevada', district: `District ${i}`,
        city: `City ${i}`, address: '', status: i % 2 ? 'Live' : 'Opportunity',
        competitor: false, team: project.team, notes: '', lat: '', lng: '',
        custom: {pm_ref: `Product requirements reference ${i}`}
      });
    }
    // A property in another country belongs to the project but not to this map, so it must stay out of the export.
    project.properties.push({id: 'other-country', code: 'IN-001', name: 'Outside this map', country: 'IND', state: 'Tamil Nadu', district: '', city: '', address: '', status: 'Live', competitor: false, team: project.team, notes: '', lat: '', lng: '', custom: {pm_ref: ''}});
    const put = await page.request.put('http://127.0.0.1:8002/api/projects/us-coverage', {headers: {'X-Property-Map': '1'}, data: project});
    assert.equal(put.status(), 200, await put.text());
    await page.reload();
    await page.waitForSelector('#mapSvg .region');
    await page.selectOption('#stateFilter', 'Nevada');
    await page.locator('[data-action=export]').click();
    assert.equal(await page.locator('#exportCount').textContent(), '110 of 110 United States of America properties included');
    assert(!(await page.locator('#exportRecords').textContent()).includes('Outside this map'), 'properties from other countries are not exported with this map');
    assert.equal(await page.locator('#exportRecords .export-record').count(), 110);
    assert((await page.locator('#exportRecords').textContent()).includes(longName));
    await page.selectOption('#exportForm select[name=scope]', 'view');
    assert.equal(await page.locator('#exportRecords .export-record').count(), 83);
    await page.selectOption('#exportForm select[name=scope]', 'all');

    const long = await page.evaluate(() => {
      const plan = ExportEngine.slidePlan(exportContext(document.querySelector('#exportForm')));
      const ctx = document.createElement('canvas').getContext('2d'); ctx.font = plan.size + 'px Arial';
      const rows = plan.columns.flat().filter(item => item.type === 'row');
      return {height: plan.height, rows: rows.length, size: plan.size,
        allFit: rows.every(item => item.lines.every(line => ctx.measureText(line).width <= plan.columnWidth)),
        complete: rows.every(item => item.lines.join(' ') === `${item.row.code} · ${item.row.name}`), wrapped: rows.filter(item => item.lines.length > 1).length,
        inBounds: plan.listX + plan.columns.length * plan.columnWidth + (plan.columns.length - 1) * 28 <= 1872};
    });
    assert.equal(long.rows, 110, 'every property is in the one image');
    assert(long.size >= 12, 'text stays readable');
    assert(long.allFit && long.inBounds && long.complete, 'no name is clipped and every column stays on the image');
    assert(long.wrapped >= 1 && long.height <= 2200, 'a very long name wraps instead of stretching the image');
    assert((await page.locator('#exportEstimate').textContent()).startsWith('One PNG'));
    assert.equal(await page.locator('#exportCopy').isVisible(), true);
    await page.screenshot({path: root + '/tests/export-complete-drawer.png', fullPage: true});

    await page.evaluate(() => {
      window.drawnCodes = new Set();
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
        const code = String(value).match(/^QA-\d{3}(?=$| ·)/);
        if (code) window.drawnCodes.add(code[0]);
        return original.call(this, value, ...args);
      };
    });
    download = page.waitForEvent('download');
    await page.locator('[form=exportForm]').click();
    file = await download;
    assert(file.suggestedFilename().endsWith('.png'), 'a long list still exports as one image');
    await file.saveAs(root + '/tests/export-complete.png');
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    assert.equal(await page.evaluate(() => window.drawnCodes.size), 66, 'Every synthetic record is drawn in the single image');

    await page.locator('[data-action=export]').click();
    await page.selectOption('#exportForm select[name=kind]', 'pdf');
    const layout = await page.evaluate(() => {
      const form = document.querySelector('#exportForm');
      const rows = exportRows(form), {cols} = exportColumns(rows, form);
      const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '19px Arial';
      return {everyCellFits: cols.every(col => rows.every((row, index) => ctx.measureText(col.cell(row, index)).width + 36 <= col.width)),
        nameColumn: cols.find(col => col.label === 'PROPERTY NAME').width, custom: cols.some(col => col.label === 'Product management reference'),
        estimate: document.querySelector('#exportEstimate').textContent};
    });
    assert(layout.everyCellFits && layout.nameColumn > 900 && layout.custom, 'PDF columns widen to show full values, including custom fields');
    assert(layout.estimate.includes('6 PDF pages'), layout.estimate);
    const grouped = await page.evaluate(() => {
      const pages = ExportEngine.pdfPages(exportContext(document.querySelector('#exportForm'))), items = pages.flat();
      return {rows: items.filter(item => item.type === 'row').length, sections: items.filter(item => item.type === 'section' && !item.label.includes('(continued)')).map(item => item.label),
        nevada: items.find(item => item.label === 'Nevada').count, noOrphan: pages.every(p => p.at(-1).type === 'row'), headed: pages.every(p => p[0].type === 'section'), max: Math.max(...pages.map(p => p.length))};
    });
    assert.equal(grouped.rows, 110); assert.equal(grouped.sections.length, 11, 'one section per state'); assert.equal(grouped.nevada, 83);
    assert(grouped.noOrphan && grouped.headed && grouped.max <= 28, 'pages start with a state heading and never end on one');
    await page.uncheck('#exportForm input[name=groupByState]');
    assert((await page.locator('#exportEstimate').textContent()).includes('5 PDF pages'), 'ungrouped table is unchanged');
    await page.check('#exportForm input[name=groupByState]');
    await page.evaluate(() => window.drawnCodes.clear());
    download = page.waitForEvent('download');
    await page.locator('[form=exportForm]').click();
    file = await download;
    assert(file.suggestedFilename().endsWith('.pdf'));
    await file.saveAs(root + '/tests/export-complete.pdf');
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    assert.equal(await page.evaluate(() => window.drawnCodes.size), 66, 'Every synthetic record is drawn in the PDF');
    assert.deepEqual(errors, []);
    console.log('PASS: single 4K image with clipboard copy, combined map layers, one image for 110 records, measured unclipped values, and full PDF; no browser errors.');
  } finally {
    await browser?.close(); server.kill(); fs.rmSync(tmp, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1});
