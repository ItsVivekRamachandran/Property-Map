const {chromium} = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') : require('playwright');
const {spawn} = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), net = require('net');

(async () => {
  const root = path.resolve(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-geography-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0,'127.0.0.1',resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.env.PYTHON || 'python3', [root + '/server.py', '--port', String(port)], {
    env: {...process.env, PROPERTY_MAP_MODE: 'local', PROPERTY_MAP_DATA: tmp}, stdio: ['ignore', 'pipe', 'inherit']
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {server.stdout.once('data', resolve); server.once('error', reject)});
    const base = 'http://127.0.0.1:' + port;
    browser = await chromium.launch({executablePath: require('./chromium_path.cjs'), headless:true});
    const page = await browser.newPage(), failures = [], errors = [];
    let blockedGuatemala=0;
    await page.route('**/data/GTM.json',route=>{blockedGuatemala++;return route.abort('blockedbyclient')});
    assert.deepEqual(JSON.parse(fs.readFileSync(root+'/public/data/guatemala-regions.json','utf8')),JSON.parse(fs.readFileSync(root+'/public/data/GTM.json','utf8')),'the browser-safe geography matches the canonical Guatemala data');
    page.on('requestfailed', request => failures.push({url:request.url(),error:request.failure()?.errorText}));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForSelector('#mapSvg .region');
    await page.evaluate(()=>{
      const original=window.fetch;window.maxMapRequests=0;let active=0;
      window.fetch=async(...args)=>{active++;window.maxMapRequests=Math.max(window.maxMapRequests,active);try{return await original(...args)}finally{active--}};
    });
    const results = await page.evaluate(async () => {
      const results = [];
      for (const view of [...S.continents].sort((a,b)=>Number(b.code==='CONTINENT_NORTH_AMERICA')-Number(a.code==='CONTINENT_NORTH_AMERICA'))) {
        try {S.country=view.code;await render();const data=S.geo[view.code];results.push({name:view.name,regions:data.features.length,drawn:document.querySelectorAll('#mapSvg .region').length})}
        catch (error) {results.push({name:view.name,error:error.message})}
      }
      return results;
    });
    console.log(JSON.stringify({results,failures}));
    assert(results.every(result => result.regions > 0 && result.drawn > 0), 'all continents load and render completely over HTTP');
    assert((await page.evaluate(async()=>(await geo('GTM')).features.length))>0,'Guatemala also loads as an individual country with a content blocker enabled');
    assert.equal(blockedGuatemala,0,'neither continent nor country maps request the blocked GTM filename');
    assert((await page.evaluate(()=>window.maxMapRequests))<=4,'map downloads are bounded to four concurrent requests');
    let remaining=1;
    await page.route('**/data/CAN.json',route=>remaining-->0?route.abort('failed'):route.continue());
    const reloadNorth=()=>page.evaluate(async()=>{
      delete S.geo.CONTINENT_NORTH_AMERICA;delete S.regionGeo.CAN;
      try {const data=await geo('CONTINENT_NORTH_AMERICA');return {regions:data.features.length}}
      catch(error){return {error:error.message,cached:!!S.regionGeo.CAN}}
    });
    assert.equal((await reloadNorth()).regions,440,'a transient failed request recovers automatically');
    remaining=3;
    const failed=await reloadNorth();
    assert(failed.error.includes('data/CAN.json')&&!failed.cached,'persistent failures identify the file and remove the rejected cache entry');
    const recovered=await page.evaluate(async()=>({regions:(await geo('CONTINENT_NORTH_AMERICA')).features.length}));
    assert.equal(recovered.regions,440,'retrying the continent succeeds without reloading the page');
    const navigated=await page.evaluate(async()=>{
      delete S.geo.CONTINENT_NORTH_AMERICA;delete S.regionGeo.CAN;
      S.view='workspace';S.country='CONTINENT_NORTH_AMERICA';const loading=render();
      S.view='projects';await render();await loading;
      return !!document.querySelector('.project-grid')&&!document.querySelector('#mapSvg');
    });
    assert(navigated,'a late continent response does not overwrite newer navigation');
    assert.deepEqual(errors, []);
    console.log('PASS: six HTTP continent maps with GTM blocked, Guatemala country map, bounded downloads, automatic retry, recovery after failure, and navigation during loading.');
  } finally {await browser?.close();server.kill();await new Promise(resolve=>server.once('exit',resolve));fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(error => {console.error(error);process.exitCode=1});
