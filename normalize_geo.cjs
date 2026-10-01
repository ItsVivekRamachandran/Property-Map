// Natural Earth uses GeoJSON winding; D3's spherical polygons require opposite exterior winding.
const fs=require('fs'),path=require('path'),d3=require('./public/vendor/d3.min.js');
const root=path.join(__dirname,'public/data');let fixed=0;
for(const file of fs.readdirSync(root).filter(n=>/^[A-Z]{3}\.json$/.test(n))){const g=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));for(const f of g.features){const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;for(const p of polys){if(d3.geoArea({type:'Polygon',coordinates:p})>2*Math.PI){p.forEach(r=>r.reverse());fixed++}}}fs.writeFileSync(path.join(root,file),JSON.stringify(g))}
const india=JSON.parse(fs.readFileSync(path.join(root,'IND.json'),'utf8'));console.log('Corrected polygon winding:',fixed,'India bounds:',d3.geoBounds(india));
