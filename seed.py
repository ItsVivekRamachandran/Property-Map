import uuid
PALETTE={'Live':'#7052d6','Opportunity':'#239b8a','Competition':'#d99a38','No credit':'#cbd2dc','Prohibited':'#ca7488','No properties':'#eeeef1'}
LEGENDS=[
 {'id':'live','label':'Live','color':PALETTE['Live']},
 {'id':'opportunity','label':'Opportunity','color':PALETTE['Opportunity']},
 {'id':'no-credit','label':'No credit','color':PALETTE['No credit']},
 {'id':'prohibited','label':'Prohibited','color':PALETTE['Prohibited']},
]

CC_HEATMAP_COUNTS=[
 ('USA','Arizona','AZ',9),
 ('USA','Arkansas','AR',3),
 ('USA','California','CA',22),
 ('USA','Connecticut','CT',2),
 ('USA','Delaware','DE',2),
 ('USA','Florida','FL',11),
 ('USA','Illinois','IL',8),
 ('USA','Indiana','IN',8),
 ('USA','Louisiana','LA',6),
 ('USA','Maryland','MD',5),
 ('USA','Massachusetts','MA',3),
 ('USA','Michigan','MI',3),
 ('USA','Mississippi','MS',10),
 ('USA','Missouri','MO',2),
 ('USA','Nevada','NV',63),
 ('USA','New Jersey','NJ',9),
 ('USA','New Mexico','NM',1),
 ('USA','New York','NY',7),
 ('USA','North Carolina','NC',2),
 ('USA','Ohio','OH',7),
 ('USA','Oklahoma','OK',4),
 ('USA','Pennsylvania','PA',10),
 ('USA','Rhode Island','RI',2),
 ('USA','Virginia','VA',4),
 ('USA','Washington','WA',3),
 ('USA','West Virginia','WV',1),
 ('CAN','Ontario','ON',5),
 ('CAN','Québec','QC',1),
 ('URY','Montevideo','UY',2),
]

def uid():return uuid.uuid4().hex[:16]

def cc_heatmap_project(owner='local'):
 props=[]
 country_names={'USA':'United States','CAN':'Canada','URY':'Uruguay'}
 for country,state,abbr,count in CC_HEATMAP_COUNTS:
  source_region='Quebec' if country=='CAN' and abbr=='QC' else 'Uruguay' if country=='URY' else state
  for number in range(1,count+1):
   code=f'CC-{country}-{abbr}-{number:03d}'
   props.append({
    'id':code.lower(),'name':f'{source_region} CC {number:02d}','code':code,
    'country':country,'state':state,'district':'','city':'','address':'',
    'status':'Live','legendId':'live','competitor':False,'team':'Research',
    'notes':f'Count-derived placeholder {number} of {count} for {source_region}, {country_names[country]}, from the supplied Property count detail image. The source did not provide a property name, status, address, city, or coordinates.',
    'lat':'','lng':'','custom':{}
   })
 return {
  'id':'cc-heatmap','name':'CC HeatMap',
  'description':'World portfolio count view reconstructed from the supplied Property count detail image: 215 records across the United States, Canada, and Uruguay.',
  'team':'Research','country':'USA','owner':owner,'members':{},'properties':props,
  'palette':PALETTE.copy(),'legends':[x.copy() for x in LEGENDS],'fields':[],
  'regionRules':{},'exports':[],'version':1,'demo':False
 }

def seed_projects(owner='local'):
 rows=[('Nevada',['Aria','Bellagio','Casa Blanca','El Cortez','Eureka Mesquite','Excalibur','Luxor','MGM Grand','Mandalay Bay','New York New York','Palms','Park MGM','Plaza','The Cosmopolitan','Tuscany','Venetian','Virgin River']),('Arizona',['Desert Diamond Tucson','Desert Diamond West Valley','Desert Diamond White Tanks','Gila River Lone Butte','Gila River Santan Mountain','Gila River Vee Quiva','Gila River Wild Horse Pass']),('California',['Barona','Chukchansi Gold','Pechanga','Sky River','Soboba','Yaamava']),('Pennsylvania',['Live Philadelphia','Mount Airy','Rivers Philadelphia']),('Washington',['Ilani','Snoqualmie']),('Illinois',['American Place',"Bally’s Chicago"]),('Mississippi',['Horseshoe Tunica','Scarlet Pearl']),('Arkansas',['Oaklawn','Saracen']),('Maryland',['Live Maryland']),('Connecticut',['Foxwoods']),('Virginia',['Rivers Portsmouth'])]
 props=[]
 for state,names in rows:
  for name in names:props.append({'id':'seed-us-'+str(100+len(props)),'name':name,'code':'P'+str(100+len(props)),'country':'USA','state':state,'district':'','city':'','address':'','status':'Live','legendId':'live','competitor':False,'team':'West Region','notes':'Reference sample — confirm details before operational use.','lat':'','lng':'','custom':{}})
 props[0]['code']='V227';props[1]['code']='V174';props[2]['code']='V168'
 base={'id':'us-coverage','name':'US Property Coverage','description':'A connected view of our properties, opportunities and regional coverage.','team':'West Region','country':'USA','owner':owner,'members':{},'properties':props,'palette':PALETTE.copy(),'legends':[x.copy() for x in LEGENDS],'fields':[],'regionRules':{},'exports':[],'version':1,'demo':True}
 return [base,{'id':'india-planning','name':'India Expansion','description':'Explore regional opportunities and plan your next location.','team':'Business Development','country':'IND','owner':owner,'members':{},'properties':[],'palette':PALETTE.copy(),'legends':[x.copy() for x in LEGENDS],'fields':[],'regionRules':{},'exports':[],'version':1,'demo':True},cc_heatmap_project(owner)]
DEFAULT_CONFIG={'accountName':'Property Map','displayName':'','palette':PALETTE,'fields':[],'teamFields':{},'teams':['West Region','Business Development','Research']}
