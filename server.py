#!/usr/bin/env python3
"""Property Map. Standard-library server with SQLite, sessions and project ACLs."""
import os,json,sqlite3,secrets,hashlib,hmac,time,re,base64,urllib.parse,mimetypes,argparse,math,datetime
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from seed import seed_projects,DEFAULT_CONFIG,PALETTE,LEGENDS,uid
ROOT=Path(__file__).parent; PUBLIC=ROOT/'public'; DATA=Path(os.environ.get('PROPERTY_MAP_DATA',str(ROOT/'data')))
DATA.mkdir(exist_ok=True,parents=True); DB=DATA/'property-map.sqlite3'
LOCAL=os.environ.get('PROPERTY_MAP_MODE','local')=='local'
def db():
 c=sqlite3.connect(DB,timeout=15);c.row_factory=sqlite3.Row;return c
def password_hash(p,salt=None):
 salt=salt or secrets.token_hex(16)
 return salt+':'+hashlib.pbkdf2_hmac('sha256',p.encode(),salt.encode(),310000).hex()
def verify_password(p,h):return hmac.compare_digest(password_hash(p,h.split(':')[0]),h)
def init():
 with db() as c:
  c.executescript('''CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,role TEXT,team TEXT,password TEXT);CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires REAL);CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,body TEXT);CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY,body TEXT);CREATE TABLE IF NOT EXISTS exports(id TEXT PRIMARY KEY,project_id TEXT,name TEXT,mime TEXT,data BLOB);CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,time REAL,user_id TEXT,action TEXT,project_id TEXT);''')
  c.execute('INSERT OR IGNORE INTO config VALUES(1,?)',(json.dumps(DEFAULT_CONFIG),))
  if LOCAL:
   c.execute('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?,?)',('local','local@preview','Local workspace','admin','West Region',''))
  elif not c.execute("SELECT 1 FROM users WHERE id!='local'").fetchone():
   p=os.environ.get('PROPERTY_MAP_ADMIN_PASSWORD','')
   if len(p)<12:raise SystemExit('Set PROPERTY_MAP_ADMIN_PASSWORD to at least 12 characters for shared mode.')
   c.execute('INSERT INTO users VALUES(?,?,?,?,?,?)',('admin',os.environ.get('PROPERTY_MAP_ADMIN_EMAIL','admin@example.com').lower(),'Workspace admin','admin','West Region',password_hash(p)))
  if not c.execute('SELECT 1 FROM projects').fetchone():
   for p in seed_projects('local' if LOCAL else 'admin'):c.execute('INSERT INTO projects VALUES(?,?)',(p['id'],json.dumps(p)))
def user_dict(r):return {k:r[k] for k in ['id','email','name','role','team']}
def role_for(u,p):return 'admin' if u['role']=='admin' or p['owner']==u['id'] else p.get('members',{}).get(u['id'])
def fields_for(p,config):
 out={}
 for layer in [config.get('fields',[]),config.get('teamFields',{}).get(p['team'],[]),p.get('fields',[])]:
  for f in layer:
   if f['id'] not in out or not out[f['id']].get('locked'):out[f['id']]=f
 return list(out.values())
def field_allowed(f,role,op='visibility'):return role=='admin' or f.get(op,'everyone')=='everyone' or (f.get(op)=='contributors' and role=='contributor')
def validate_legends(p):
 legends=p.get('legends')
 if legends is None:
  legends=[dict(x) for x in LEGENDS];p['legends']=legends
 if not isinstance(legends,list) or not 1<=len(legends)<=20:raise ValueError('Add between 1 and 20 map legends.')
 ids=set();labels=set()
 for item in legends:
  if not isinstance(item,dict):raise ValueError('Each map legend must be an object.')
  lid=item.get('id','');label=item.get('label','').strip() if isinstance(item.get('label'),str) else ''
  if not re.fullmatch(r'[a-zA-Z0-9_-]{1,50}',lid) or lid in ids:raise ValueError('Invalid or duplicate map legend ID.')
  if not label or len(label)>80 or label.casefold() in labels:raise ValueError('Map legend names must be unique and no longer than 80 characters.')
  if not re.fullmatch(r'#[0-9a-fA-F]{6}',str(item.get('color',''))):raise ValueError('Invalid map legend color.')
  ids.add(lid);labels.add(label.casefold());item['label']=label
 return legends,ids
def visible(p,u,config):
 p=json.loads(json.dumps(p));role=role_for(u,p);fs=fields_for(p,config)
 for r in p['properties']:r['custom']={k:v for k,v in r.get('custom',{}).items() if any(f['id']==k and field_allowed(f,role) for f in fs)}
 p['effectiveFields']=[f for f in fs if field_allowed(f,role)];p['access']=role
 if role!='admin':p.pop('members',None)
 return p
def validate_fields(fs):
 if not isinstance(fs,list) or len(fs)>60:raise ValueError('Maximum 60 custom fields.')
 ids=set()
 for f in fs:
  if not isinstance(f,dict):raise ValueError('Each custom field must be an object.')
  if not re.fullmatch(r'[a-zA-Z0-9_-]{1,50}',f.get('id','')) or f['id'] in ids:raise ValueError('Invalid or duplicate field ID.')
  ids.add(f['id'])
  if not str(f.get('label','')).strip() or len(f['label'])>80:raise ValueError('Field label is required (maximum 80 characters).')
  if f.get('type') not in ['text','number','date','select','checkbox']:raise ValueError('Invalid field type.')
  for key in ['visibility','editable']:
   if f.get(key,'everyone') not in ['everyone','contributors','admins']:raise ValueError('Invalid field access.')
  if f.get('condition','') not in ['', 'Live','Opportunity']:raise ValueError('Invalid field status condition.')
  if not isinstance(f.get('required',False),bool) or not isinstance(f.get('locked',False),bool):raise ValueError('Invalid field settings.')
  opts=f.get('options',[])
  if not isinstance(opts,list) or len(opts)>100 or any(not isinstance(x,str) or not x.strip() or len(x)>100 for x in opts):raise ValueError('Enter up to 100 valid dropdown options.')
  if f.get('type')=='select' and not opts:raise ValueError('Dropdown options are required.')
  if f.get('required') and f.get('editable','everyone')!=f.get('visibility','everyone'):raise ValueError('Required fields must be editable by the roles that can see them.')
def validate_project(p,config,old=None,u=None):
 if not isinstance(p,dict):raise ValueError('Project must be an object.')
 if not isinstance(p.get('name'),str) or not p['name'].strip() or len(p['name'])>100:raise ValueError('Project name is required (maximum 100 characters).')
 if not isinstance(p.get('description',''),str) or len(p.get('description',''))>2000:raise ValueError('Project description is limited to 2,000 characters.')
 if not isinstance(p.get('team',''),str) or p.get('team') not in config.get('teams',[]):raise ValueError('Choose a configured project team.')
 if not re.fullmatch('[A-Z]{3}',str(p.get('country'))) or not (PUBLIC/'data'/(str(p.get('country'))+'.json')).is_file():raise ValueError('Choose a supported country.')
 validate_fields(p.get('fields',[]))
 palette=p.get('palette')
 if not isinstance(palette,dict) or set(palette)!=set(PALETTE):raise ValueError('A complete project palette is required.')
 for v in palette.values():
  if not re.fullmatch(r'#[0-9a-fA-F]{6}',v):raise ValueError('Invalid color.')
 legends,legend_ids=validate_legends(p)
 label_ids={x['label'].casefold():x['id'] for x in legends}
 rules=p.get('regionRules',{})
 if not isinstance(rules,dict) or len(rules)>2000:raise ValueError('Invalid regional legend assignments.')
 rule_countries={}
 for key,rule in rules.items():
  match=re.fullmatch(r'([A-Z]{3}):(.{1,160})',key or '')
  if not match or not isinstance(rule,dict) or not isinstance(rule.get('competition',False),bool):raise ValueError('Invalid regional legend assignment.')
  co,state=match.groups()
  if co not in rule_countries:
   path=PUBLIC/'data'/(co+'.json')
   if not path.is_file():raise ValueError('Regional legend assignment uses an unsupported country.')
   rule_countries[co]={f['properties']['name'] for f in json.loads(path.read_text())['features']}
  if state not in rule_countries[co]:raise ValueError('Regional legend assignment uses an invalid state or province.')
  legend_id=rule.get('legendId') or label_ids.get(str(rule.get('status','')).casefold())
  if legend_id and legend_id not in legend_ids:raise ValueError('Regional legend assignment references an unknown legend.')
  if legend_id:rule['legendId']=legend_id
  rule.pop('status',None)
 props=p.get('properties',[])
 if not isinstance(props,list):raise ValueError('Properties must be a list.')
 if len(props)>10000:raise ValueError('Project limit is 10,000 properties.')
 countries={};codes=set();ids=set();role=role_for(u,p) if u else 'admin';fs=fields_for(p,config);old_by_id={x.get('id'):x for x in (old or {}).get('properties',[]) if isinstance(x,dict)}
 for r in props:
  if not isinstance(r,dict):raise ValueError('Each property must be an object.')
  if not r.get('id') or r['id'] in ids:raise ValueError('Duplicate property identifier.')
  ids.add(r['id'])
  if not isinstance(r.get('name'),str) or not r['name'].strip() or len(r['name'])>120:raise ValueError('Property name is required (maximum 120 characters).')
  if not isinstance(r.get('code'),str) or not r['code'].strip() or len(r['code'])>50:raise ValueError('Property code is required (maximum 50 characters).')
  for key,limit,label in [('district',120,'District'),('city',120,'City'),('address',500,'Address'),('team',100,'Team'),('notes',5000,'Notes')]:
   if not isinstance(r.get(key,''),str) or len(r.get(key,''))>limit:raise ValueError(f'{label} is limited to {limit} characters.')
  if r.get('team') not in config.get('teams',[]):raise ValueError('Choose a configured property team.')
  code=r['code'].strip().lower()
  if code in codes:raise ValueError('Property codes must be unique within a project.')
  codes.add(code)
  co=r.get('country','')
  if co not in countries:
   path=PUBLIC/'data'/(co+'.json')
   if not re.fullmatch('[A-Z]{3}',co) or not path.is_file():raise ValueError('Invalid property country.')
   countries[co]={f['properties']['name'] for f in json.loads(path.read_text())['features']}
  if r.get('state') not in countries[co]:raise ValueError('Choose a valid state or province.')
  if r.get('status') not in ['Live','Opportunity']:raise ValueError('Invalid property status.')
  legend_id=r.get('legendId') or label_ids.get(r.get('status','').casefold()) or legends[0]['id']
  if legend_id not in legend_ids:raise ValueError('Property references an unknown map legend.')
  r['legendId']=legend_id
  if not isinstance(r.get('competitor',False),bool):raise ValueError('Invalid competitor setting.')
  for key,limit in [('lat',90),('lng',180)]:
   if r.get(key,'')!='':
    value=float(r[key])
    if not math.isfinite(value) or not -limit<=value<=limit:raise ValueError('Coordinates are outside the valid range.')
  if (r.get('lat','')=='')!=(r.get('lng','')==''):raise ValueError('Enter both latitude and longitude.')
  if not isinstance(r.get('custom',{}),dict):raise ValueError('Custom property values must be an object.')
  prev=old_by_id.get(r['id'],{})
  for f in fs:
   active=not f.get('condition') or r.get('status')==f['condition'];v=r.get('custom',{}).get(f['id'])
   if old and not field_allowed(f,role,'editable'):
    r.setdefault('custom',{})[f['id']]=prev.get('custom',{}).get(f['id']);continue
   if active and (not prev or r!=prev) and f.get('required') and field_allowed(f,role) and (v is None or v=='' or v is False):raise ValueError(f["label"]+' is required.')
   if v not in [None,'']:
    if f['type']=='number':
     n=float(v)
     if not math.isfinite(n):raise ValueError('Invalid number for '+f['label'])
    if f['type']=='date':
     try:datetime.date.fromisoformat(str(v))
     except ValueError:raise ValueError('Invalid date for '+f['label'])
    if f['type']=='checkbox' and not isinstance(v,bool):raise ValueError('Invalid checkbox value for '+f['label'])
    if f['type']=='text' and (not isinstance(v,str) or len(v)>5000):raise ValueError(f['label']+' is limited to 5,000 characters.')
    if f['type']=='select' and v not in f.get('options',[]):raise ValueError('Invalid choice for '+f['label'])
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def send(self,status=200,obj=None,data=None,mime='application/json',headers=None):
  payload=data if data is not None else json.dumps(obj).encode()
  self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(payload)));self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','same-origin');self.send_header('Cache-Control','no-store' if self.path.startswith('/api') else 'no-cache')
  self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
  for k,v in (headers or {}).items():self.send_header(k,v)
  self.end_headers();self.wfile.write(payload)
 def body(self):
  n=int(self.headers.get('Content-Length',0))
  if n<0 or n>32*1024*1024:raise ValueError('Request too large.')
  return json.loads(self.rfile.read(n) or '{}')
 def user(self,c):
  if LOCAL:return user_dict(c.execute("SELECT * FROM users WHERE id='local'").fetchone())
  cookie=SimpleCookie();cookie.load(self.headers.get('Cookie',''));t=cookie.get('pm_session')
  if not t:return None
  r=c.execute('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',(hashlib.sha256(t.value.encode()).hexdigest(),time.time())).fetchone()
  return user_dict(r) if r else None
 def do_GET(self):self.dispatch('GET')
 def do_POST(self):self.dispatch('POST')
 def do_PUT(self):self.dispatch('PUT')
 def do_DELETE(self):self.dispatch('DELETE')
 def dispatch(self,method):
  try:self.route(method)
  except (ValueError,KeyError,TypeError) as e:self.send(400,{'error':str(e)})
  except Exception as e:
   print(type(e).__name__,str(e));self.send(500,{'error':'The request could not be completed.'})
 def route(self,method):
  path=urllib.parse.urlsplit(self.path).path
  if not path.startswith('/api/'):
   if method!='GET':return self.send(405,{'error':'Method not allowed'})
   rel='index.html' if path=='/' else urllib.parse.unquote(path).lstrip('/')
   f=(PUBLIC/rel).resolve()
   if not f.is_relative_to(PUBLIC.resolve()) or not f.is_file():return self.send(404,{'error':'Not found'})
   return self.send(data=f.read_bytes(),mime=mimetypes.guess_type(f.name)[0] or 'application/octet-stream')
  if method!='GET':
   if self.headers.get('X-Property-Map')!='1':return self.send(403,{'error':'Invalid request origin.'})
   origin=self.headers.get('Origin')
   if origin and urllib.parse.urlsplit(origin).netloc!=self.headers.get('Host'):return self.send(403,{'error':'Invalid request origin.'})
  with db() as c:
   if path=='/api/login' and method=='POST':
    b=self.body();ip=self.client_address[0];attempts=getattr(self.server,'attempts',{});c.execute('DELETE FROM sessions WHERE expires<=?',(time.time(),))
    recent=[t for t in attempts.get(ip,[]) if t>time.time()-300]
    if len(recent)>=12:return self.send(429,{'error':'Too many attempts. Try again in five minutes.'})
    r=c.execute("SELECT * FROM users WHERE email=? AND password!=''",(b.get('email','').lower().strip(),)).fetchone()
    if not r or not verify_password(b.get('password',''),r['password']):
     recent.append(time.time());attempts[ip]=recent;self.server.attempts=attempts;return self.send(401,{'error':'Email or password is incorrect.'})
    attempts.pop(ip,None);self.server.attempts=attempts
    t=secrets.token_urlsafe(32);c.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(t.encode()).hexdigest(),r['id'],time.time()+43200))
    secure='; Secure' if os.environ.get('PROPERTY_MAP_SECURE_COOKIE')=='1' else ''
    return self.send(obj={'ok':True},headers={'Set-Cookie':'pm_session='+t+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'+secure})
   u=self.user(c)
   if not u:return self.send(401,{'error':'Sign in to continue.'})
   config=json.loads(c.execute('SELECT body FROM config WHERE id=1').fetchone()[0])
   if path=='/api/logout' and method=='POST':
    cookie=SimpleCookie();cookie.load(self.headers.get('Cookie',''))
    if cookie.get('pm_session'):c.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(cookie['pm_session'].value.encode()).hexdigest(),))
    return self.send(obj={'ok':True},headers={'Set-Cookie':'pm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
   if path=='/api/bootstrap' and method=='GET':
    ps=[json.loads(r[0]) for r in c.execute('SELECT body FROM projects')];ps=[visible(p,u,config) for p in ps if role_for(u,p)]
    cfg=json.loads(json.dumps(config))
    if u['role']!='admin':cfg['fields']=[];cfg['teamFields']={}
    return self.send(obj={'user':u,'config':cfg,'projects':ps,'mode':'local-server' if LOCAL else 'shared'})
   if path=='/api/config' and method=='PUT':
    if u['role']!='admin':return self.send(403,{'error':'Only administrators can change account settings.'})
    b=self.body();validate_fields(b.get('fields',[]))
    if not isinstance(b.get('palette'),dict) or set(b['palette'])!=set(PALETTE) or any(not re.fullmatch(r'#[0-9a-fA-F]{6}',str(v)) for v in b['palette'].values()):raise ValueError('Invalid palette color.')
    if not isinstance(b.get('teams'),list) or not b['teams'] or any(not isinstance(t,str) or not t.strip() or len(t)>100 for t in b['teams']):raise ValueError('Enter valid team names.')
    if len(set(b['teams']))!=len(b['teams']):raise ValueError('Team names must be unique.')
    used={r[0] for r in c.execute('SELECT team FROM users') if r[0]}
    for row in c.execute('SELECT body FROM projects'):
     project=json.loads(row[0]);used.add(project.get('team'));used.update(r.get('team') for r in project.get('properties',[]))
    missing={team for team in used if team and team not in b['teams']}
    if missing:raise ValueError('Teams in use cannot be removed: '+', '.join(sorted(missing)))
    if not isinstance(b.get('teamFields',{}),dict):raise ValueError('Invalid team field configuration.')
    for team,fs in b.get('teamFields',{}).items():
     if team not in b['teams']:raise ValueError('Team field configuration references an unknown team.')
     validate_fields(fs)
    if not isinstance(b.get('accountName'),str) or not b['accountName'].strip() or len(b['accountName'])>100:raise ValueError('Account name is required (maximum 100 characters).')
    if not isinstance(b.get('displayName',''),str) or len(b.get('displayName',''))>100:raise ValueError('Display name is limited to 100 characters.')
    c.execute('UPDATE config SET body=? WHERE id=1',(json.dumps(b),));c.execute('INSERT INTO audit(time,user_id,action,project_id) VALUES(?,?,?,?)',(time.time(),u['id'],'config.update',None));return self.send(obj={'ok':True})
   if path=='/api/users':
    if u['role']!='admin':return self.send(403,{'error':'Administrator access required.'})
    if method=='GET':return self.send(obj=[user_dict(r) for r in c.execute('SELECT * FROM users')])
    if method=='POST':
     b=self.body()
     if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',b.get('email','')):raise ValueError('Enter a valid email address.')
     if len(b.get('password',''))<12:raise ValueError('Use a password of at least 12 characters.')
     if b.get('role') not in ['admin','member']:raise ValueError('Invalid account role.')
     if not isinstance(b.get('name'),str) or not b['name'].strip() or len(b['name'])>120:raise ValueError('Name is required (maximum 120 characters).')
     if b.get('team','') not in config.get('teams',[]):raise ValueError('Choose a configured team.')
     try:c.execute('INSERT INTO users VALUES(?,?,?,?,?,?)',(uid(),b['email'].lower(),b['name'],b['role'],b.get('team',''),password_hash(b['password'])))
     except sqlite3.IntegrityError:raise ValueError('An account with that email already exists.')
     c.execute('INSERT INTO audit(time,user_id,action,project_id) VALUES(?,?,?,?)',(time.time(),u['id'],'user.create',None));return self.send(201,{'ok':True})
   if path=='/api/import' and method=='POST':
    items=self.body().get('projects')
    if not isinstance(items,list) or not items or len(items)>50:raise ValueError('Import between 1 and 50 projects at a time.')
    prepared=[]
    for raw in items:
     p=json.loads(json.dumps(raw));p.update(id=uid(),owner=u['id'],members={},version=1,exports=[])
     for r in p.get('properties',[]):r['id']=uid()
     validate_project(p,config,u=u);prepared.append(p)
    for p in prepared:c.execute('INSERT INTO projects VALUES(?,?)',(p['id'],json.dumps(p)))
    c.execute('INSERT INTO audit(time,user_id,action,project_id) VALUES(?,?,?,?)',(time.time(),u['id'],'project.import',None));return self.send(201,[visible(p,u,config) for p in prepared])
   if path=='/api/projects' and method=='POST':
    b=self.body();b.update(id=uid(),owner=u['id'],members={},version=1,exports=[]);validate_project(b,config,u=u)
    c.execute('INSERT INTO projects VALUES(?,?)',(b['id'],json.dumps(b)));c.execute('INSERT INTO audit(time,user_id,action,project_id) VALUES(?,?,?,?)',(time.time(),u['id'],'project.create',b['id']));return self.send(201,visible(b,u,config))
   m=re.fullmatch(r'/api/projects/([\w-]+)(?:/(exports|members))?',path)
   if m:
    pid,sub=m.groups();row=c.execute('SELECT body FROM projects WHERE id=?',(pid,)).fetchone()
    if not row:return self.send(404,{'error':'Project not found.'})
    p=json.loads(row[0]);role=role_for(u,p)
    if not role:return self.send(403,{'error':'You do not have access to this project.'})
    if sub=='exports' and method=='POST':
     b=self.body();raw=base64.b64decode(b['data'],validate=True);mime=b['mime']
     signatures={'image/png':b'\x89PNG','application/pdf':b'%PDF','application/zip':b'PK\x03\x04'}
     if mime not in signatures or not raw.startswith(signatures[mime]):raise ValueError('Invalid export file.')
     eid=uid();name=Path(b['name']).name;c.execute('INSERT INTO exports VALUES(?,?,?,?,?)',(eid,pid,name,mime,raw));p['exports'].insert(0,{'id':eid,'name':name,'mime':mime,'date':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
     p['version']+=1
     if c.execute('UPDATE projects SET body=? WHERE id=? AND body=?',(json.dumps(p),pid,row[0])).rowcount!=1:
      c.rollback();return self.send(409,{'error':'Project changed while saving the export. Please retry.'})
     c.execute('INSERT INTO audit(time,user_id,action,project_id) VALUES(?,?,?,?)',(time.time(),u['id'],'export.create',pid));return self.send(201,visible(p,u,config))
    if sub=='members' and method=='PUT':
     if role!='admin':return self.send(403,{'error':'Only project owners and admins can manage access.'})
     members=self.body()['members']
     for k,v in members.items():
      if v not in ['viewer','contributor'] or not c.execute('SELECT 1 FROM users WHERE id=?',(k,)).fetchone():raise ValueError('Invalid project member.')
     p['members']=members;p['version']+=1
     if c.execute('UPDATE projects SET body=? WHERE id=? AND body=?',(json.dumps(p),pid,row[0])).rowcount!=1:return self.send(409,{'error':'Project changed. Reload before changing access.'})
     c.execute('INSERT INTO audit(time,user_id,action,project_id) VALUES(?,?,?,?)',(time.time(),u['id'],'members.update',pid));return self.send(obj=visible(p,u,config))
    if method=='DELETE' and not sub:
     if role!='admin':return self.send(403,{'error':'Only project owners and admins can delete projects.'})
     c.execute('DELETE FROM projects WHERE id=?',(pid,));c.execute('DELETE FROM exports WHERE project_id=?',(pid,));c.execute('INSERT INTO audit(time,user_id,action,project_id) VALUES(?,?,?,?)',(time.time(),u['id'],'project.delete',pid));return self.send(obj={'ok':True})
    if method=='PUT' and not sub:
     if role=='viewer':return self.send(403,{'error':'This project is read-only.'})
     b=self.body()
     if b.get('version')!=p['version']:return self.send(409,{'error':'Someone updated this project. Reload before saving to avoid overwriting their changes.'})
     for key in ['id','owner','members','exports']:b[key]=p[key]
     if role!='admin':
      for key in ['fields','name','team','description','country']:b[key]=p[key]
     validate_project(b,config,old=p,u=u);b.pop('access',None);b.pop('effectiveFields',None);b['version']=p['version']+1
     if c.execute('UPDATE projects SET body=? WHERE id=? AND body=?',(json.dumps(b),pid,row[0])).rowcount!=1:return self.send(409,{'error':'Project changed while saving. Reload to avoid overwriting changes.'})
     c.execute('INSERT INTO audit(time,user_id,action,project_id) VALUES(?,?,?,?)',(time.time(),u['id'],'project.update',pid));return self.send(obj=visible(b,u,config))
   m=re.fullmatch(r'/api/exports/([\w-]+)',path)
   if m and method in ['GET','DELETE']:
    r=c.execute('SELECT * FROM exports WHERE id=?',(m[1],)).fetchone()
    if not r:return self.send(404,{'error':'Export not found.'})
    prow=c.execute('SELECT body FROM projects WHERE id=?',(r['project_id'],)).fetchone();p=json.loads(prow[0]);role=role_for(u,p)
    if not role:return self.send(403,{'error':'Access denied.'})
    if method=='DELETE':
     if role!='admin':return self.send(403,{'error':'Only project owners and admins can delete exports.'})
     c.execute('DELETE FROM exports WHERE id=?',(m[1],));p['exports']=[e for e in p.get('exports',[]) if e['id']!=m[1]];p['version']+=1
     if c.execute('UPDATE projects SET body=? WHERE id=? AND body=?',(json.dumps(p),r['project_id'],prow[0])).rowcount!=1:return self.send(409,{'error':'Project changed while deleting the export. Please retry.'})
     c.execute('INSERT INTO audit(time,user_id,action,project_id) VALUES(?,?,?,?)',(time.time(),u['id'],'export.delete',r['project_id']));return self.send(obj=visible(p,u,config))
    return self.send(data=r['data'],mime=r['mime'],headers={'Content-Disposition':"attachment; filename*=UTF-8''"+urllib.parse.quote(r['name'])})
   return self.send(404,{'error':'Not found.'})
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8000);parser.add_argument('--host',default='127.0.0.1');args=parser.parse_args()
 if LOCAL and args.host not in ['127.0.0.1','localhost','::1']:raise SystemExit('Local preview must bind to loopback. Use PROPERTY_MAP_MODE=shared for team access.')
 init();print(f'Property Map: http://{args.host}:{args.port} ({"local preview" if LOCAL else "authenticated shared mode"})',flush=True);ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()
