import unittest, tempfile, subprocess, os, time, urllib.request, urllib.error, json, http.cookiejar, pathlib, socket, copy, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ServerTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close();cls.base=f'http://127.0.0.1:{port}'
  env={**os.environ,'PROPERTY_MAP_MODE':'shared','PROPERTY_MAP_DATA':cls.tmp.name,'PROPERTY_MAP_ADMIN_EMAIL':'admin@test.org','PROPERTY_MAP_ADMIN_PASSWORD':'strong-password-for-tests'}
  cls.proc=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--port',str(port)],env=env,stdout=subprocess.DEVNULL)
  for _ in range(60):
   try:urllib.request.urlopen(cls.base);break
   except Exception:time.sleep(.05)
  cls.admin=cls.client();cls.req(cls.admin,'/api/login','POST',{'email':'admin@test.org','password':'strong-password-for-tests'})
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
   self.req(a,'/api/users','POST',{'email':n+'@test.org','name':n,'role':'member','team':'Research','password':'test-long-password'},201)
  users={u['name']:u['id'] for u in self.req(a,'/api/users')}
  p=self.req(a,'/api/projects/'+pid+'/members','PUT',{'members':{users['viewer']:'viewer',users['contributor']:'contributor'}})
  clients={}
  for n in users:
   if n=='Workspace admin':continue
   clients[n]=self.client();self.req(clients[n],'/api/login','POST',{'email':n+'@test.org','password':'test-long-password'})
  self.req(clients['outsider'],'/api/projects/'+pid,'PUT',p,403)
  self.assertEqual(self.req(clients['outsider'],'/api/bootstrap')['projects'],[])
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
  self.req(self.admin,'/api/users','POST',{'email':'wrong-team@test.org','name':'Wrong team','role':'member','team':'Not configured','password':'test-long-password'},400)
 def test_06_map_legend_validation(self):
  p=copy.deepcopy(self.req(self.admin,'/api/bootstrap')['projects'][0])
  p['legends'].append({'id':'under-review','label':'Under review','color':'#d14f7b'})
  p['properties'][0]['legendId']='under-review'
  p['regionRules']['USA:Nevada']={'legendId':'under-review','competition':False}
  p=self.req(self.admin,'/api/projects/'+p['id'],'PUT',p)
  self.assertEqual(p['regionRules']['USA:Nevada']['legendId'],'under-review')
  q=copy.deepcopy(p);q['properties'][0]['legendId']='missing';self.req(self.admin,'/api/projects/'+p['id'],'PUT',q,400)
  q=copy.deepcopy(p);q['regionRules']['USA:Not a real state']={'legendId':'under-review','competition':False};self.req(self.admin,'/api/projects/'+p['id'],'PUT',q,400)
if __name__=='__main__':unittest.main(verbosity=2)
