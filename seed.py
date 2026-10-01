import uuid
PALETTE={'Live':'#7052d6','Opportunity':'#239b8a','Competition':'#d99a38','No credit':'#cbd2dc','Prohibited':'#ca7488'}
LEGENDS=[
 {'id':'live','label':'Live','color':PALETTE['Live']},
 {'id':'opportunity','label':'Opportunity','color':PALETTE['Opportunity']},
 {'id':'no-credit','label':'No credit','color':PALETTE['No credit']},
 {'id':'prohibited','label':'Prohibited','color':PALETTE['Prohibited']},
]
def uid():return uuid.uuid4().hex[:16]
def seed_projects(owner='local'):
 rows=[('Nevada',['Aria','Bellagio','Casa Blanca','El Cortez','Eureka Mesquite','Excalibur','Luxor','MGM Grand','Mandalay Bay','New York New York','Palms','Park MGM','Plaza','The Cosmopolitan','Tuscany','Venetian','Virgin River']),('Arizona',['Desert Diamond Tucson','Desert Diamond West Valley','Desert Diamond White Tanks','Gila River Lone Butte','Gila River Santan Mountain','Gila River Vee Quiva','Gila River Wild Horse Pass']),('California',['Barona','Chukchansi Gold','Pechanga','Sky River','Soboba','Yaamava']),('Pennsylvania',['Live Philadelphia','Mount Airy','Rivers Philadelphia']),('Washington',['Ilani','Snoqualmie']),('Illinois',['American Place',"Bally’s Chicago"]),('Mississippi',['Horseshoe Tunica','Scarlet Pearl']),('Arkansas',['Oaklawn','Saracen']),('Maryland',['Live Maryland']),('Connecticut',['Foxwoods']),('Virginia',['Rivers Portsmouth'])]
 props=[]
 for state,names in rows:
  for name in names:props.append({'id':'seed-us-'+str(100+len(props)),'name':name,'code':'P'+str(100+len(props)),'country':'USA','state':state,'district':'','city':'','address':'','status':'Live','legendId':'live','competitor':False,'team':'West Region','notes':'Reference sample — confirm details before operational use.','lat':'','lng':'','custom':{}})
 props[0]['code']='V227';props[1]['code']='V174';props[2]['code']='V168'
 base={'id':'us-coverage','name':'US Property Coverage','description':'A connected view of our properties, opportunities and regional coverage.','team':'West Region','country':'USA','owner':owner,'members':{},'properties':props,'palette':PALETTE.copy(),'legends':[x.copy() for x in LEGENDS],'fields':[],'regionRules':{},'exports':[],'version':1,'demo':True}
 return [base,{'id':'india-planning','name':'India Expansion','description':'Explore regional opportunities and plan your next location.','team':'Business Development','country':'IND','owner':owner,'members':{},'properties':[],'palette':PALETTE.copy(),'legends':[x.copy() for x in LEGENDS],'fields':[],'regionRules':{},'exports':[],'version':1,'demo':True}]
DEFAULT_CONFIG={'accountName':'Property Map','displayName':'','palette':PALETTE,'fields':[],'teamFields':{},'teams':['West Region','Business Development','Research']}
