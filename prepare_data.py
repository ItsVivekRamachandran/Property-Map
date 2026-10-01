import json, pathlib, math
root=pathlib.Path(__file__).parent/'public'/'data'
def simplify(points, tol=0.018):
 if len(points)<5:return points
 a,b=points[0],points[-1]; dx=b[0]-a[0];dy=b[1]-a[1]; denom=dx*dx+dy*dy
 best=-1;idx=0
 for i,p in enumerate(points[1:-1],1):
  t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denom)) if denom else 0
  dist=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
  if dist>best:best=dist;idx=i
 if best>tol*tol:return simplify(points[:idx+1],tol)[:-1]+simplify(points[idx:],tol)
 return [a,b]
def ring(r):
 mid=len(r)//2
 out=simplify(r[:mid+1])[:-1]+simplify(r[mid:])
 if len(out)<4:out=r[:3]+[r[0]]
 return [[round(x,4),round(y,4)] for x,y,*_ in out]
d=json.loads((root/'world-raw.json').read_text()); groups={}
for f in d['features']:
 p=f['properties']; code=p['adm0_a3']
 if code in ['ATA','-99'] or not p.get('name'):continue
 g=f['geometry']; coords=g['coordinates']
 coords=[ring(r) for r in coords] if g['type']=='Polygon' else [[ring(r) for r in poly] for poly in coords]
 groups.setdefault(code,{'name':p['admin'],'features':[]})['features'].append({'type':'Feature','properties':{'name':p['name'],'id':p['iso_3166_2'] or p['adm1_code'],'abbr':p.get('postal') or p['name'][:3]},'geometry':{'type':g['type'],'coordinates':coords}})
for code,c in groups.items():(root/(code+'.json')).write_text(json.dumps({'type':'FeatureCollection','features':c['features']},separators=(',',':')))
(root/'countries.json').write_text(json.dumps([{'code':k,'name':v['name']} for k,v in sorted(groups.items(),key=lambda kv:kv[1]['name'])],separators=(',',':')))
print('Prepared',len(groups),'countries and',sum(len(c['features']) for c in groups.values()),'regions')
