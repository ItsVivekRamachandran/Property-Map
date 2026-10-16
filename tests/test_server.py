import unittest, tempfile, subprocess, os, time, urllib.request, urllib.error, json, http.cookiejar, pathlib, socket, copy, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ServerTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close();cls.base=f'http://127.0.0.1:{port}'
  env={**os.environ,'PROPERTY_MAP_MODE':'shared','PROPERTY_MAP_DATA':cls.tmp.name,'PROPERTY_MAP_ADMIN_EMAIL':'admin@igt.com','PROPERTY_MAP_ADMIN_PASSWORD':'strong-password-for-tests'}
  cls.proc=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--port',str(port)],env=env,stdout=subprocess.DEVNULL)
  for _ in range(60):
   try:urllib.request.urlopen(cls.base);break
   except Exception:time.sleep(.05)
  cls.admin=cls.client();cls.req(cls.admin,'/api/admin/login','POST',{'username':'admin','password':'strong-password-for-tests'})
 @classmethod
 def tearDownClass(cls):cls.proc.terminate();cls.proc.wait();cls.tmp.cleanup()
 @staticmethod
 def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 @classmethod
 def req(cls,client,path,method='GET',body=None,expected=200):
  req=urllib.request.Request(cls.base+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json','X-Property-Map':'1'})
  try:r=client.open(req)
  except urllib.error.HTTPError as e:r=e
  raw=r.read();out=json.loads(raw) if r.headers.get('Content-Type','').startswith('application/json') else raw
  assert r.status==expected,(r.status,expected,out)
  return out
 def test_01_auth_required(self):self.req(self.client(),'/api/bootstrap',expected=401)
 def test_02_crud_acl_conflict_and_fields(self):
  a=self.admin;b=self.req(a,'/api/bootstrap');p=b['projects'][0];pid=p['id'];self.assertEqual(len(p['properties']),44)
  for n in ['viewer','contributor','outsider']:
   self.req(a,'/api/users','POST',{'username':n,'name':n,'designation':'Reviewer','department':'Strategy','role':'member','team':'Research','password':'test-long-password'},201)
  users={u['name']:u['id'] for u in self.req(a,'/api/users')}
  p=self.req(a,'/api/projects/'+pid+'/members','PUT',{'members':{users['viewer']:'viewer',users['contributor']:'contributor'}})
  clients={}
  for n in users:
   if n=='Workspace admin':continue
   clients[n]=self.client();self.req(clients[n],'/api/login','POST',{'username':n})
  self.req(clients['outsider'],'/api/projects/'+pid,'PUT',p,403)
  outsider_projects=self.req(clients['outsider'],'/api/bootstrap')['projects'];self.assertEqual(len(outsider_projects),1);self.assertTrue(outsider_projects[0]['personal'])
  self.req(clients['viewer'],'/api/projects/'+pid,'PUT',p,403)
  p['fields']=[{'id':'secret','label':'Private score','type':'text','visibility':'admins','editable':'admins','required':False,'options':[]}]
  p['properties'][0]['custom']={'secret':'admin-only'};old=copy.deepcopy(p);p=self.req(a,'/api/projects/'+pid,'PUT',p)
  self.req(a,'/api/projects/'+pid,'PUT',old,409)
  cp=self.req(clients['contributor'],'/api/bootstrap')['projects'][0];self.assertNotIn('secret',cp['properties'][0]['custom'])
  cp['properties'][0]['name']='Changed by contributor';cp['properties'][0]['custom']['secret']='tamper'
  self.req(clients['contributor'],'/api/projects/'+pid,'PUT',cp)
  p=self.req(a,'/api/bootstrap')['projects'][0];self.assertEqual(p['properties'][0]['custom']['secret'],'admin-only')
  self.assertEqual(p['properties'][0]['name'],'Changed by contributor')
  q=copy.deepcopy(p);q['properties'][1]['code']=q['properties'][0]['code'];self.req(a,'/api/projects/'+pid,'PUT',q,400)
  q=copy.deepcopy(p);q['properties'][0]['lat']='200';q['properties'][0]['lng']='10';self.req(a,'/api/projects/'+pid,'PUT',q,400)
  self.req(clients['viewer'],'/api/config','PUT',b['config'],403)
  created=self.req(a,'/api/projects','POST',{'name':'Empty','description':'','country':'IND','team':'Research','properties':[],'fields':[],'palette':p['palette'],'regionRules':{}},201)
  self.req(a,'/api/projects/'+created['id'],'DELETE')
 def test_03_csrf(self):
  req=urllib.request.Request(self.base+'/api/logout',data=b'{}',headers={'Content-Type':'application/json'})
  with self.assertRaises(urllib.error.HTTPError) as e:self.admin.open(req)
  self.assertEqual(e.exception.code,403)
 def test_04_export_auth(self):
  import base64
  p=self.req(self.admin,'/api/bootstrap')['projects'][0]
  r=self.req(self.admin,'/api/projects/'+p['id']+'/exports','POST',{'name':'test.pdf','mime':'application/pdf','data':base64.b64encode(b'%PDF-1.7\ntest').decode()},201)
  eid=r['exports'][0]['id'];self.req(self.client(),'/api/exports/'+eid,expected=401)
  self.assertTrue(self.req(self.admin,'/api/exports/'+eid).startswith(b'%PDF'))
  import io,zipfile
  buffer=io.BytesIO()
  with zipfile.ZipFile(buffer,'w') as archive:archive.writestr('page-1.png',b'\x89PNG\r\n\x1a\n')
  payload=buffer.getvalue()
  saved=self.req(self.admin,'/api/projects/'+p['id']+'/exports','POST',{'name':'complete.zip','mime':'application/zip','data':base64.b64encode(payload).decode()},201)
  self.assertEqual(self.req(self.admin,'/api/exports/'+saved['exports'][0]['id']),payload)
  deleted=self.req(self.admin,'/api/exports/'+saved['exports'][0]['id'],'DELETE')
  self.assertFalse(any(e['id']==saved['exports'][0]['id'] for e in deleted['exports']))
  self.req(self.admin,'/api/exports/'+saved['exports'][0]['id'],expected=404)
 def test_05_atomic_import_and_strict_validation(self):
  before=self.req(self.admin,'/api/bootstrap')['projects'];p=copy.deepcopy(before[0]);count=len(before)
  bad=copy.deepcopy(p);bad['name']='x'*101
  self.req(self.admin,'/api/import','POST',{'projects':[p,bad]},400)
  self.assertEqual(len(self.req(self.admin,'/api/bootstrap')['projects']),count)
  q=copy.deepcopy(p);q['fields'].append({'id':'score','label':'Score','type':'number','visibility':'everyone','editable':'everyone','required':False,'locked':False,'condition':'','options':[]});q['properties'][0]['custom']['score']='NaN'
  self.req(self.admin,'/api/projects/'+p['id'],'PUT',q,400)
  q=copy.deepcopy(p);q['properties'][0]['notes']='x'*5001
  self.req(self.admin,'/api/projects/'+p['id'],'PUT',q,400)
  cfg=copy.deepcopy(self.req(self.admin,'/api/bootstrap')['config']);cfg['teams']=[t for t in cfg['teams'] if t!='West Region']
  self.req(self.admin,'/api/config','PUT',cfg,400)
  self.req(self.admin,'/api/users','POST',{'username':'wrong-team','name':'Wrong team','designation':'Reviewer','department':'Strategy','role':'member','team':'Not configured','password':'test-long-password'},400)
 def test_06_map_legend_validation(self):
  p=copy.deepcopy(self.req(self.admin,'/api/bootstrap')['projects'][0])
  p['legends'].append({'id':'under-review','label':'Under review','color':'#d14f7b'})
  p['properties'][0]['legendId']='under-review'
  p['regionRules']['USA:Nevada']={'legendId':'under-review','competition':False}
  p=self.req(self.admin,'/api/projects/'+p['id'],'PUT',p)
  self.assertEqual(p['regionRules']['USA:Nevada']['legendId'],'under-review')
  q=copy.deepcopy(p);q['properties'][0]['legendId']='missing';self.req(self.admin,'/api/projects/'+p['id'],'PUT',q,400)
  q=copy.deepcopy(p);q['regionRules']['USA:Not a real state']={'legendId':'under-review','competition':False};self.req(self.admin,'/api/projects/'+p['id'],'PUT',q,400)
 def test_07_hidden_values_survive_contributor_save(self):
  a=self.admin;p=copy.deepcopy(self.req(a,'/api/bootstrap')['projects'][0]);pid=p['id']
  self.req(a,'/api/users','POST',{'username':'hidden','name':'hidden','designation':'Reviewer','department':'Strategy','role':'member','team':'Research','password':'test-long-password'},201)
  uid=next(u['id'] for u in self.req(a,'/api/users') if u['name']=='hidden')
  p=self.req(a,'/api/projects/'+pid+'/members','PUT',{'members':{**p.get('members',{}),uid:'contributor'}})
  p['fields']=[{'id':'internal','label':'Internal score','type':'text','visibility':'admins','editable':'everyone','required':False,'options':[]}]
  p['properties'][0]['custom']={'internal':'keep-me'};self.req(a,'/api/projects/'+pid,'PUT',p)
  c=self.client();self.req(c,'/api/login','POST',{'username':'hidden'})
  cp=self.req(c,'/api/bootstrap')['projects'][0];self.assertNotIn('internal',cp['properties'][0]['custom'])
  cp['properties'][1]['notes']='Unrelated contributor edit';self.req(c,'/api/projects/'+pid,'PUT',cp)
  self.assertEqual(self.req(a,'/api/bootstrap')['projects'][0]['properties'][0]['custom']['internal'],'keep-me')
 def test_08_seed_is_reproducible_and_us_states_match(self):
  sys.path.insert(0,str(ROOT));from seed import seed_projects,CC_HEATMAP_COUNTS
  projects=seed_projects();self.assertEqual(projects,seed_projects())
  cc=next(p for p in projects if p['id']=='cc-heatmap');self.assertEqual(len(cc['properties']),215)
  countries={country:sum(1 for r in cc['properties'] if r['country']==country) for country in ['USA','CAN','URY']}
  self.assertEqual(countries,{'USA':207,'CAN':6,'URY':2})
  regions={(country,state):sum(1 for r in cc['properties'] if r['country']==country and r['state']==state) for country,state,abbr,count in CC_HEATMAP_COUNTS}
  self.assertEqual(regions,{(country,state):count for country,state,abbr,count in CC_HEATMAP_COUNTS})
  atlas=json.loads((ROOT/'public/data/us-counties.json').read_text())['objects']['states']['geometries']
  offered={g['properties']['name'] for g in atlas if int(g['id'])<60}
  accepted={f['properties']['name'] for f in json.loads((ROOT/'public/data/USA.json').read_text())['features']}
  self.assertEqual(offered,accepted)
 def test_09_igt_profiles_admin_crud_and_personal_workspace(self):
  a=self.admin;payload={'username':'profile.user','name':'Profile User','designation':'Analyst','department':'Operations','role':'member','team':'Research','password':'profile-long-password'}
  self.req(a,'/api/users','POST',{**payload,'username':'outside@example.com'},400)
  self.req(a,'/api/users','POST',payload,201);self.req(a,'/api/users','POST',{**payload,'username':'PROFILE.USER'},400)
  user=next(x for x in self.req(a,'/api/users') if x['email']=='profile.user@igt.com')
  self.assertEqual((user['designation'],user['department'],user['active']),('Analyst','Operations',True))
  personal=[p for p in self.req(a,'/api/bootstrap')['projects'] if p.get('owner')==user['id']]
  self.assertEqual(len(personal),1);self.assertTrue(personal[0]['personal'])
  updated=self.req(a,'/api/users/'+user['id'],'PUT',{**payload,'designation':'Senior Analyst','active':False})
  self.assertFalse(updated['active']);self.assertEqual(updated['designation'],'Senior Analyst')
  self.req(self.client(),'/api/login','POST',{'username':'profile.user'},401)
  result=self.req(a,'/api/users/'+user['id'],'DELETE');self.assertEqual(result['deletedProjects'],1)
  self.assertFalse(any(x['id']==user['id'] for x in self.req(a,'/api/users')))
 def test_10_email_only_self_enrollment_and_admin_separation(self):
  self.req(self.client(),'/api/login','POST',{'username':'admin'},401)
  first=self.client();self.req(first,'/api/login','POST',{'username':'new.user'});bootstrap=self.req(first,'/api/bootstrap')
  self.assertEqual(bootstrap['user']['email'],'new.user@igt.com');self.assertEqual(bootstrap['user']['role'],'member')
  self.assertEqual(len(bootstrap['projects']),1);self.assertTrue(bootstrap['projects'][0]['personal'])
  second=self.client();self.req(second,'/api/login','POST',{'email':'NEW.USER@igt.com'});self.assertEqual(self.req(second,'/api/bootstrap')['user']['id'],bootstrap['user']['id'])
 def test_11_no_properties_palette_and_legacy_defaults(self):
  a=self.admin;p=copy.deepcopy(self.req(a,'/api/bootstrap')['projects'][0]);url='/api/projects/'+p['id']
  p['palette'].pop('No properties',None)
  p=self.req(a,url,'PUT',p);self.assertEqual(p['palette']['No properties'],'#eeeef1')
  p['palette']['No properties']='#ffe0b2';p=self.req(a,url,'PUT',p)
  saved=next(x for x in self.req(a,'/api/bootstrap')['projects'] if x['id']==p['id'])
  self.assertEqual(saved['palette']['No properties'],'#ffe0b2')
  for invalid in ['orange',None,123]:
   q=copy.deepcopy(p);q['palette']['No properties']=invalid;self.req(a,url,'PUT',q,400)
  cfg=copy.deepcopy(self.req(a,'/api/bootstrap')['config']);cfg['palette'].pop('No properties',None)
  self.req(a,'/api/config','PUT',cfg)
  self.assertEqual(self.req(a,'/api/bootstrap')['config']['palette']['No properties'],'#eeeef1')
  cfg['palette']['No properties']='#123456';self.req(a,'/api/config','PUT',cfg)
  self.assertEqual(self.req(a,'/api/bootstrap')['config']['palette']['No properties'],'#123456')
 def test_12_malformed_request_shapes(self):
  for body in [[],None,'invalid',7]:
   self.req(self.admin,'/api/projects','POST',body if body is not None else {'properties':None},400)
  p=self.req(self.admin,'/api/bootstrap')['projects'][0]
  for members in [[],None,'invalid']:
   self.req(self.admin,'/api/projects/'+p['id']+'/members','PUT',{'members':members},400)
  for project in [None,[],{'properties':[None]}]:
   self.req(self.admin,'/api/import','POST',{'projects':[project]},400)
  self.req(self.client(),'/api/admin/login','POST',{'username':'admin','password':12},400)
 def test_13_export_delete_conflict_rolls_back_blob(self):
  import importlib.util,sqlite3
  from unittest.mock import patch,Mock
  with patch.dict(os.environ,{'PROPERTY_MAP_DATA':self.tmp.name}):
   spec=importlib.util.spec_from_file_location('export_conflict_server',ROOT/'server.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  connection=sqlite3.connect(':memory:');connection.row_factory=sqlite3.Row
  connection.executescript('CREATE TABLE config(id,body); CREATE TABLE projects(id,body); CREATE TABLE exports(id,project_id,name,mime,data);')
  project={'id':'p','owner':'admin','members':{},'exports':[{'id':'e'}],'version':1}
  connection.execute('INSERT INTO config VALUES(1,?)',(json.dumps({}),))
  connection.execute('INSERT INTO projects VALUES(?,?)',('p',json.dumps(project)))
  connection.execute('INSERT INTO exports VALUES(?,?,?,?,?)',('e','p','map.png','image/png',b'png'));connection.commit()
  class ConflictConnection:
   def __enter__(self):return self
   def __exit__(self,*args):return connection.__exit__(*args)
   def execute(self,sql,args=()):
    if sql.startswith('UPDATE projects'):return Mock(rowcount=0)
    return connection.execute(sql,args)
   def rollback(self):connection.rollback()
  handler=object.__new__(module.Handler);handler.path='/api/exports/e';handler.headers={'X-Property-Map':'1'}
  handler.user=lambda c:{'id':'admin','role':'admin'};handler.send=Mock()
  try:
   with patch.object(module,'db',return_value=ConflictConnection()):handler.route('DELETE')
   self.assertEqual(handler.send.call_args.args[0],409)
   self.assertEqual(connection.execute('SELECT data FROM exports WHERE id=?',('e',)).fetchone()[0],b'png')
   self.assertEqual(json.loads(connection.execute('SELECT body FROM projects').fetchone()[0]),project)
  finally:connection.close()
if __name__=='__main__':unittest.main(verbosity=2)
