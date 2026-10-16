const {chromium}=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright'):require('playwright');
const assert=require('assert'),path=require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:require('./chromium_path.cjs'),headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('file://'+path.resolve(__dirname,'../Property-Map.html'));await page.waitForSelector('#mapSvg .region');
  const scopes=await page.evaluate(()=>['USA','WORLD',...S.continents.map(view=>view.code)]);
  for(const scope of scopes){
   await page.selectOption('#countryFilter',scope);
   await page.waitForFunction(code=>document.querySelector('.panelhead .badge')?.textContent===countryName(code),scope);
   await page.locator('[data-action=export]').click();await page.waitForSelector('#exportPreview canvas');
   const toggle=page.getByRole('checkbox',{name:'Map labels (initials and counts)',exact:true});
   await toggle.uncheck();
   const result=await page.evaluate(()=>{
    const context=exportContext(document.querySelector('#exportForm')),parse=markup=>new DOMParser().parseFromString(markup,'image/svg+xml');
    const layers={count:true,dots:true,status:true,locations:true,numbers:false},off=parse(exportMapMarkup(layers)),on=parse(exportMapMarkup({...layers,numbers:true}));
    const paints=svg=>[...svg.querySelectorAll('.region')].map(node=>node.getAttribute('fill'));
    return {off:off.querySelectorAll('text,.map-label,.property-count-number,.export-label-leaders').length,on:on.querySelectorAll('.map-label text').length,sameColors:JSON.stringify(paints(off))===JSON.stringify(paints(on)),dotsPreserved:off.querySelectorAll('.count-dot').length===on.querySelectorAll('.count-dot').length,contextHidesLabels:context.layers.numbers===false,liveLabels:document.querySelectorAll('#mapSvg .map-label text').length};
   });
   assert.equal(result.off,0,scope+' leaves no initials, counts, badges or callouts');
   assert(result.on>0&&result.liveLabels>0,scope+' labels return when enabled and the live map is unaffected');
   assert(result.sameColors&&result.dotsPreserved&&result.contextHidesLabels,scope+' preserves map colors and dots');
   await toggle.check();
   await page.evaluate(()=>closeDrawer(true));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: export labels fully hidden in country, World, and all six continent views; colors/dots preserved and labels can be restored.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
