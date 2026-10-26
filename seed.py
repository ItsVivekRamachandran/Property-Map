"""Deterministic, fictional demo data. Never include customer data here."""

import uuid

PALETTE={'Live':'#7052d6','Opportunity':'#239b8a','Competition':'#d99a38','No credit':'#cbd2dc','Prohibited':'#ca7488','No properties':'#eeeef1'}
LEGENDS=[
    {'id':'live','label':'Live','color':PALETTE['Live']},
    {'id':'opportunity','label':'Opportunity','color':PALETTE['Opportunity']},
    {'id':'no-credit','label':'No credit','color':PALETTE['No credit']},
    {'id':'prohibited','label':'Prohibited','color':PALETTE['Prohibited']},
]


def uid():
    return uuid.uuid4().hex[:16]


# State, city, and count: geography is real; every property is fictional.
DEMO_REGIONS = [
    ('Nevada', 'Las Vegas', 17),
    ('Arizona', 'Phoenix', 7),
    ('California', 'Sacramento', 6),
    ('Pennsylvania', 'Philadelphia', 3),
    ('Washington', 'Seattle', 2),
    ('Illinois', 'Chicago', 2),
    ('Mississippi', 'Jackson', 2),
    ('Arkansas', 'Little Rock', 2),
    ('Maryland', 'Baltimore', 1),
    ('Connecticut', 'Hartford', 1),
    ('Virginia', 'Richmond', 1),
]


def seed_projects(owner='local'):
    """Return an independent demo project on each call, with stable IDs."""
    properties = []
    for state, city, count in DEMO_REGIONS:
        for number in range(1, count + 1):
            sequence = len(properties) + 1
            properties.append({
                'id': f'demo-property-{sequence:03d}',
                'name': f'Demo {city} Property {number:02d}',
                'code': f'DEMO-{sequence:03d}',
                'country': 'USA', 'state': state, 'district': city, 'city': '',
                'address': f'{100 + number} Example Lane (fictional address)',
                'status': 'Live', 'legendId': 'live', 'competitor': False,
                'team': 'West Region',
                'notes': 'Fictional property for demonstration only. No real business information.',
                'lat': '', 'lng': '', 'custom': {},
            })
    return [{
        'id': 'demo-project', 'name': 'Demo Property Portfolio',
        'description': '44 fictional properties across 11 US states. All names, codes, and addresses are mock information.',
        'team': 'West Region', 'country': 'USA', 'owner': owner,
        'members': {}, 'properties': properties, 'palette': PALETTE.copy(),
        'legends': [legend.copy() for legend in LEGENDS], 'fields': [],
        'regionRules': {}, 'exports': [], 'version': 1, 'demo': True,
    }]


DEFAULT_CONFIG = {
    'accountName': 'Product HeatMap', 'displayName': '', 'palette': PALETTE,
    'fields': [], 'teamFields': {},
    'teams': ['West Region', 'Business Development', 'Research'],
}
