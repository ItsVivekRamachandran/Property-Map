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
    const page = await browser.newPage({viewport: {width: 1512, height: 1050}, acceptDownloads: true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8002');
    await page.waitForSelector('#mapSvg .region');
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
    const put = await page.request.put('http://127.0.0.1:8002/api/projects/us-coverage', {
      headers: {'X-Property-Map': '1'}, data: project
    });
    assert.equal(put.status(), 200, await put.text());
    await page.reload();
    await page.waitForSelector('#mapSvg .region');
    await page.selectOption('#stateFilter', 'Nevada');
    await page.locator('[data-action=export]').click();
    assert.equal(await page.locator('#exportCount').textContent(), '110 of 110 project properties included');
    assert.equal(await page.locator('#exportRecords .export-record').count(), 110);
    assert((await page.locator('#exportRecords').textContent()).includes(longName));
    await page.selectOption('#exportForm select[name=scope]', 'view');
    assert.equal(await page.locator('#exportRecords .export-record').count(), 83);
    await page.selectOption('#exportForm select[name=scope]', 'all');

    const layout = await page.evaluate(() => {
      const form = document.querySelector('#exportForm');
      const rows = exportRows(form), {cols, width} = exportColumns(rows, form);
      const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '19px Arial';
      return {count: rows.length, width, everyCellFits: cols.every(col =>
        rows.every((row, index) => ctx.measureText(col.cell(row, index)).width + 36 <= col.width)),
        nameColumn: cols.find(col => col.label === 'PROPERTY NAME').width,
        cssWrap: getComputedStyle(document.querySelector('.export-record')).whiteSpace,
        pdfEstimate: document.querySelector('#exportEstimate').textContent};
    });
    assert.equal(layout.count, 110);
    assert(layout.everyCellFits, 'All row values must fit measured columns');
    assert(layout.nameColumn > 900, 'A long name must widen its column');
    assert.equal(layout.cssWrap, 'nowrap');
    assert(layout.pdfEstimate.includes('5 PDF pages'));
    await page.screenshot({path: root + '/tests/export-complete-drawer.png', fullPage: true});

    await page.evaluate(() => {
      window.drawnCodes = new Set();
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
        const code = String(value).match(/^QA-\d{3}(?=$|  ·)/);
        if (code) window.drawnCodes.add(code[0]);
        return original.call(this, value, ...args);
      };
    });
    let download = page.waitForEvent('download');
    await page.locator('[form=exportForm]').click();
    let file = await download;
    await file.saveAs(root + '/tests/export-complete.pdf');
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    assert.equal(await page.evaluate(() => window.drawnCodes.size), 66, 'Every synthetic record is drawn in the PDF');

    await page.locator('[data-action=export]').click();
    await page.selectOption('#exportForm select[name=format]', 'PNG');
    assert((await page.locator('#exportEstimate').textContent()).includes('numbered PNG pages'));
    await page.evaluate(() => window.drawnCodes.clear());
    download = page.waitForEvent('download');
    await page.locator('[form=exportForm]').click();
    file = await download;
    assert(file.suggestedFilename().endsWith('.zip'));
    await file.saveAs(root + '/tests/export-complete.zip');
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    assert.equal(await page.evaluate(() => window.drawnCodes.size), 66, 'Every synthetic record is drawn in the numbered PNG pages');

    await page.locator('[data-action=export]').click();
    await page.selectOption('#exportForm select[name=format]', 'PNG');
    await page.selectOption('#exportForm select[name=pngLayout]', 'poster');
    assert.equal(await page.locator('#exportRecords .export-record').count(), 110);
    assert((await page.locator('#exportEstimate').textContent()).includes('One PNG image'));
    const posterLayout = await page.evaluate(() => {
      const form = document.querySelector('#exportForm'), rows = exportRows(form);
      const names = Object.fromEntries(S.countries.map(c => [c.code, c.name]));
      const plan = ExportEngine.posterPlan(rows, names, 3840, project().name);
      const sample = {...project(), properties: project().properties.slice(0, 44)};
      const sampleRows = ExportEngine.rowsFor(sample, 'all', []);
      const samplePlan = ExportEngine.posterPlan(sampleRows, names, 3840, sample.name);
      const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '18px Arial';
      return {count: plan.columns.flat().filter(item => item.type === 'property').length,
        allFit: plan.columns.every((column, i) => column.filter(item => item.type === 'property').every(item =>
          ctx.measureText(`${item.row.code}  ·  ${item.row.name}`).width + 50 <= plan.columnWidths[i])),
        pixels: plan.width * plan.height * 4,
        sampleColumns: samplePlan.columns.length,
        sampleHeight: samplePlan.height};
    });
    assert.equal(posterLayout.count, 110);
    assert(posterLayout.allFit, 'No property name is clipped or wrapped in the side-by-side image');
    assert(posterLayout.pixels <= 32_000_000);
    assert(posterLayout.sampleColumns >= 3, 'A 44-property poster uses enough columns to avoid empty space below the map');
    assert(posterLayout.sampleHeight <= 1100, 'A 44-property poster stays close to the map-card height');
    await page.screenshot({path: root + '/tests/export-poster-option.png'});
    await page.evaluate(() => window.drawnCodes.clear());
    download = page.waitForEvent('download');
    await page.locator('[form=exportForm]').click();
    file = await download;
    assert(file.suggestedFilename().endsWith('.png'));
    await file.saveAs(root + '/tests/export-poster.png');
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    assert.equal(await page.evaluate(() => window.drawnCodes.size), 66, 'Every synthetic record is drawn in the single-image layout');
    assert.deepEqual(errors, []);
    console.log('PASS: 110-record scope/list, measured unwrapped values, full PDF, PNG/ZIP, and single-image rendering; no browser errors.');
  } finally {
    await browser?.close(); server.kill(); fs.rmSync(tmp, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1});
