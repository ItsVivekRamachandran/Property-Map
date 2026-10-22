const {chromium} = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') : require('playwright');
const assert = require('assert'), path = require('path'), fs = require('fs');

(async () => {
  const browser = await chromium.launch({executablePath: require('./chromium_path.cjs'), headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1512, height: 1050}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + path.resolve(__dirname, '../Property-Map.html'));
    await page.waitForSelector('#mapSvg .region');
    await page.locator('[data-view=projects]').click();
    await page.locator('.project-card').filter({hasText: 'Demo Property Portfolio'}).locator('[data-action=open-project]').click();
    await page.waitForSelector('#mapSvg .region');
    const views = await page.locator('#countryFilter optgroup[label=Continents] option').evaluateAll(nodes => nodes.map(n => ({code: n.value, name: n.textContent})));
    assert.equal(views.length, 6);
    const assigned = await page.evaluate(() => S.continents.flatMap(c => c.countries));
    assert.equal(new Set(assigned).size, assigned.length, 'countries belong to one continent only');
    for (const view of views) {
      await page.selectOption('#countryFilter', view.code);
      await page.waitForFunction(code => S.country === code && document.querySelector('.panelhead .badge')?.textContent === countryName(code), view.code);
      const expected = view.name === 'North America' ? 44 : 0;
      assert.equal(await page.locator('.stats .num').first().textContent(), String(expected), view.name + ' total');
      assert.equal(await page.locator('#stateFilter').count(), 0, 'continent view offers country detail');
      const geometry = await page.evaluate(() => ({
        codes: [...document.querySelectorAll('#mapSvg .region')].map(n => n.dataset.country),
        members: continentView(S.country).countries,
        pathsValid: [...document.querySelectorAll('#mapSvg .region')].every(n => !/NaN|Infinity/.test(n.getAttribute('d')))
      }));
      assert(geometry.codes.length > 0 && geometry.pathsValid, view.name + ' renders valid geography');
      assert(geometry.codes.every(code => geometry.members.includes(code)), 'no other continents on the map');
      await page.locator('#mapSvg').screenshot({path: path.resolve(__dirname, 'continent-' + view.name.toLowerCase().replaceAll(' ', '-') + '.png')});
      await page.locator('[data-action=export]').click();
      await page.waitForSelector('#exportPreview canvas');
      assert.equal(await page.locator('#exportCount').textContent(), `${expected} of ${expected} ${view.name} properties included`);
      const data = await page.evaluate(() => {
        const context = exportContext(document.querySelector('#exportForm'));
        return {world: context.world, countries: [...new Set(context.rows.map(r => r.country))], pdfRows: ExportEngine.pdfPages(context).flat().filter(r => r.type === 'row').length};
      });
      assert(data.world && data.countries.every(c => geometry.members.includes(c)));
      assert.equal(data.pdfRows, expected, 'PDF directory respects the continent scope');
      await page.evaluate(() => closeDrawer(true));
    }
    await page.selectOption('#countryFilter', 'CONTINENT_NORTH_AMERICA');
    const stateCounts = await page.evaluate(() => {
      const region = key => {const node=document.querySelector(`[data-state="${key}"]`);return {fill:node.getAttribute('fill'),count:document.querySelector(`[data-region="${key}"] .property-count-number`)?.textContent}};
      return {nevada:region('USA:Nevada'),california:region('USA:California'),ontario:region('CAN:Ontario'),quebec:region('CAN:Québec'),texas:region('USA:Texas'),states:document.querySelectorAll('#mapSvg .region[data-country=USA]').length};
    });
    assert.equal(stateCounts.states,51,'continent includes the US states and DC');
    assert.equal(stateCounts.nevada.count,'17');assert.equal(stateCounts.california.count,'6');
    assert(await page.locator('#mapSvg .map-label[data-region="USA:Nevada"] .property-count-number').isVisible(),'highest-count state badge is visible at continent scale');
    assert.equal(stateCounts.ontario.count,undefined);assert.equal(stateCounts.quebec.count,undefined);
    assert.notEqual(stateCounts.nevada.fill,stateCounts.california.fill,'each state is shaded by its own count');
    assert.equal(stateCounts.texas.count,undefined,'zero-count regions have no numeric badge');
    await page.locator('[data-action=colors]').click();
    await page.fill('input[data-hex="No properties"]','#ffe0b2');
    await page.locator('[data-action=apply-colors]').click();
    await page.waitForSelector('#overlay:empty',{state:'attached'});
    assert.equal(await page.locator('#mapSvg [data-state="USA:Texas"]').getAttribute('fill'),'#ffe0b2');
    assert.equal(await page.locator('#mapSvg [data-state="USA:Nevada"]').getAttribute('fill'),stateCounts.nevada.fill,'empty-region color does not change populated regions');
    await page.reload();await page.waitForSelector('#mapSvg .region');
    await page.locator('[data-view=projects]').click();
    await page.locator('.project-card').filter({hasText:'Demo Property Portfolio'}).locator('[data-action=open-project]').click();
    await page.selectOption('#countryFilter','CONTINENT_NORTH_AMERICA');
    await page.waitForSelector('#mapSvg [data-state="USA:Texas"]');
    assert.equal(await page.locator('#mapSvg [data-state="USA:Texas"]').getAttribute('fill'),'#ffe0b2','custom no-properties color survives reload');
    await page.locator('[data-action=export]').click();
    const exportedStates=await page.evaluate(()=>{
      const context=exportContext(document.querySelector('#exportForm')),svg=new DOMParser().parseFromString(exportMapMarkup(context.layers),'image/svg+xml');
      const label=svg.querySelector('.map-label[data-region="USA:Nevada"]');
      return {nevada:label.textContent,visible:label.style.display!=='none',texas:svg.querySelector('[data-state="USA:Texas"]').getAttribute('fill'),continent:context.continent};
    });
    assert(exportedStates.continent&&exportedStates.nevada.includes('17')&&exportedStates.visible);assert.equal(exportedStates.texas,'#ffe0b2');
    await page.uncheck('#exportForm input[name=countNumbers]');
    const image = await page.evaluate(async () => {
      const context = exportContext(document.querySelector('#exportForm')), svg = exportMapMarkup(context.layers);
      if (new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('.property-count-number')) throw Error('Count labels should be hidden');
      const result = await ExportEngine.slideBlob(context, svg);
      const bitmap = await createImageBitmap(result.blob), dimensions = [bitmap.width, bitmap.height]; bitmap.close();
      return {dimensions, bytes: Array.from(new Uint8Array(await result.blob.arrayBuffer()))};
    });
    assert.deepEqual(image.dimensions, [3840,2160]);
    fs.writeFileSync(path.resolve(__dirname, 'continent-export.png'), Buffer.from(image.bytes));
    await page.evaluate(() => closeDrawer(true));
    await page.locator('#mapSvg .region[data-state="USA:Nevada"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#stateFilter');
    assert.equal(await page.locator('#mapSvg .region').count(), 51, 'country drill-down retains state detail');
    assert.equal(await page.locator('#stateFilter').inputValue(),'Nevada','selecting a continent state opens that state filter');
    await page.selectOption('#countryFilter', 'CONTINENT_NORTH_AMERICA');
    await page.locator('[data-action=property]').first().click();
    assert.equal(await page.locator('#propertyForm select[name=country] option[value^=CONTINENT_]').count(), 0, 'continents cannot be stored as property countries');
    assert(await page.evaluate(() => scopeIncludesCountry(S.country, document.querySelector('#propertyForm select[name=country]').value)));
    await page.evaluate(() => closeDrawer(true));
    await page.selectOption('#countryFilter', 'WORLD');
    assert.equal(await page.locator('.stats .num').first().textContent(), '44', 'returning to World restores all countries');
    assert.equal(await page.locator('#mapSvg .world-country[data-state=USA]').count(),1,'World keeps whole-country rendering');
    assert.deepEqual(errors, []);
    console.log('PASS: continent state counts and shading, persistent no-properties color, scoped exports, labels, state drill-down, and whole-country World view.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1});
