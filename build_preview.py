from pathlib import Path
import json
from seed import seed_projects,DEFAULT_CONFIG
ROOT=Path(__file__).parent;P=ROOT/'public'
def js(s):return s.replace('</script','<\\/script')
embedded={str(f.relative_to(P)):json.loads(f.read_text()) for f in (P/'data').glob('*.json') if f.name!='world-raw.json'}
seed={'projects':seed_projects(),'config':DEFAULT_CONFIG}
for p in seed['projects']:p['access']='admin'
html=(P/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css">','<style>'+(P/'styles.css').read_text()+'</style>')
html=html.replace('<script src="vendor/d3.min.js"></script>', '<script>window.STANDALONE=true;window.SEED='+js(json.dumps(seed))+';window.EMBEDDED='+js(json.dumps(embedded,separators=(',',':')))+';</script><script>'+js((P/'vendor/d3.min.js').read_text())+'</script>')
for f in ['vendor/topojson.min.js','vendor/pdf-lib.min.js','vendor/jszip.min.js','vendor/material-symbols.js','export-engine.js','app.js']:html=html.replace('<script src="'+f+'"></script>','<script>'+js((P/f).read_text())+'</script>')
(ROOT/'Property-Map.html').write_text(html)
print('Built self-contained Property-Map.html:',round(len(html.encode())/1024**2,2),'MiB')
