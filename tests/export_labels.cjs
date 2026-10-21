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
   const stateToggle=page.getByRole('checkbox',{name:'State labels',exact:true}),countToggle=page.getByRole('checkbox',{name:'Count labels',exact:true});
   await stateToggle.uncheck();await countToggle.uncheck();
   const result=await page.evaluate(()=>{
    const context=exportContext(document.querySelector('#exportForm')),parse=markup=>new DOMParser().parseFromString(markup,'image/svg+xml');
    const layers={count:true,dots:true,status:true,locations:true,numbers:false,stateLabels:false},off=parse(exportMapMarkup(layers)),on=parse(exportMapMarkup({...layers,numbers:true,stateLabels:true})),states=parse(exportMapMarkup({...layers,stateLabels:true})),counts=parse(exportMapMarkup({...layers,numbers:true}));
    const audit=svg=>{
     const canvas=document.createElement('canvas').getContext('2d'),regions=new Map([...svg.querySelectorAll('.region')].map(n=>[n.dataset.state,new Path2D(n.getAttribute('d'))])),boxes=[],fonts=[];
     for(const node of svg.querySelectorAll('.map-label')){
      const [left,top,right,bottom]=node.dataset.exportBox.split(',').map(Number),shape=regions.get(node.dataset.labelKey);
      if(left<12||top<12||right>888||bottom>448)return false;
      for(let iy=0;iy<=4;iy++)for(let ix=0;ix<=6;ix++)if(!canvas.isPointInPath(shape,left+(right-left)*ix/6,top+(bottom-top)*iy/4))return false;
      if(boxes.some(b=>left<b.right&&right>b.left&&top<b.bottom&&bottom>b.top))return false;
      boxes.push({left,top,right,bottom});fonts.push(Number(node.dataset.exportFontPx));
     }
     return !svg.querySelector('.export-label-leaders,[data-export-callout=true]')&&fonts.every(size=>size>=17.99);
    };
    const fitted=[on,states,counts,parse(exportMapMarkup({...layers,numbers:true,stateLabels:true},{...context,kind:'pdf'})),parse(exportMapMarkup({...layers,numbers:true,stateLabels:true},{...context,kind:'png',showOverview:false,showList:true}))].every(svg=>!svg.querySelector('.map-label')||audit(svg));
    const paints=svg=>[...svg.querySelectorAll('.region')].map(node=>node.getAttribute('fill'));
    return {off:off.querySelectorAll('text,.map-label,.property-count-number,.export-label-leaders').length,on:on.querySelectorAll('.map-label text').length,stateOnly:states.querySelectorAll('.state-label').length>0&&states.querySelectorAll('.property-count-number').length===0,countOnly:(!mapProperties().length||counts.querySelectorAll('.property-count-number').length>0)&&counts.querySelectorAll('.state-label').length===0,fitted,sameColors:JSON.stringify(paints(off))===JSON.stringify(paints(on)),dotsPreserved:off.querySelectorAll('.count-dot').length===on.querySelectorAll('.count-dot').length,contextHidesLabels:context.layers.numbers===false&&context.layers.stateLabels===false,liveLabels:document.querySelectorAll('#mapSvg .map-label text').length};
   });
   assert.equal(result.off,0,scope+' leaves no initials, counts, badges or callouts');
   assert(result.on>0&&result.liveLabels>0,scope+' labels return when enabled and the live map is unaffected');
   assert(result.stateOnly&&result.countOnly,scope+' exports state labels and count labels independently');
   assert(result.fitted,scope+' adapts font sizes and keeps labels within their own regions without overlap or callouts in PNG and PDF');
   assert(result.sameColors&&result.dotsPreserved&&result.contextHidesLabels,scope+' preserves map colors and dots');
   await stateToggle.check();await countToggle.check();
   await page.evaluate(()=>closeDrawer(true));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: independent label controls and adaptive labels contained in their regions without overlap or callouts, across PNG/PDF country, World, and six continent views.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
