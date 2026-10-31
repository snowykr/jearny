"""Extract game-planning geometry from the saved OSM snapshot. Requires shapely."""
import collections
import heapq
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from shapely.geometry import LineString, Point, Polygon, box, mapping

ROOT = Path(__file__).parent
BOUNDS = [139.733, 35.630, 139.747, 35.641]
clip = box(*BOUNDS)
root = ET.parse(ROOT / 'osm-map.osm').getroot()
nodes = {e.get('id'): e for e in root.findall('node')}
def tags(element):
    return {t.get('k'): t.get('v') for t in element.findall('tag')}
def coordinate(node_id):
    e = nodes[node_id]
    return [float(e.get('lon')), float(e.get('lat'))]
def feature(element, geometry, kind):
    return {'type': 'Feature', 'id': element.tag + '/' + element.get('id'),
            'properties': {**tags(element), 'osm_type': element.tag, 'osm_id': element.get('id'),
              'osm_version': element.get('version'), 'osm_timestamp': element.get('timestamp'),
              'dataset_kind': kind, 'dataset_source': 'OpenStreetMap contributors'}, 'geometry': mapping(geometry)}
features = []
graph = {}
way_by_id = {}
for e in root.findall('way'):
    t = tags(e)
    refs = [n.get('ref') for n in e.findall('nd')]
    if any(n not in nodes for n in refs) or len(refs) < 2:
        continue
    coordinates = [coordinate(n) for n in refs]
    kind = ('buildings' if 'building' in t else 'roads' if 'highway' in t else
            'railways' if 'railway' in t else 'landmarks' if t.get('amenity') == 'place_of_worship' else
            'landcover' if 'landuse' in t or 'natural' in t or 'leisure' in t else None)
    if kind:
        polygon = refs[0] == refs[-1] and len(refs) >= 4 and (kind in ['buildings', 'landmarks', 'landcover'] or t.get('area') == 'yes')
        geometry = Polygon(coordinates) if polygon else LineString(coordinates)
        if not geometry.is_valid:
            geometry = geometry.buffer(0) if polygon else geometry
        geometry = geometry.intersection(clip)
        if not geometry.is_empty:
            features.append(feature(e, geometry, kind))
    if t.get('highway') not in ['footway','pedestrian','path','steps','residential','living_street','service','unclassified','tertiary','secondary'] or t.get('foot') == 'no' or t.get('access') in ['private','no'] or t.get('construction'):
        continue
    way_by_id[e.get('id')] = e
    for a,b in zip(refs, refs[1:]):
        x,y = coordinate(a),coordinate(b)
        distance = math.hypot((x[0]-y[0])*90400,(x[1]-y[1])*111200)
        graph.setdefault(a,[]).append((b,distance,e.get('id')))
        graph.setdefault(b,[]).append((a,distance,e.get('id')))
for e in nodes.values():
    t = tags(e)
    if t.get('highway') == 'crossing' or t.get('railway') in ['station','subway_entrance'] or '改札' in t.get('name',''):
        geometry = Point(coordinate(e.get('id')))
        if clip.covers(geometry):
            features.append(feature(e, geometry, 'crossings' if t.get('highway') == 'crossing' else 'stations'))
collection = {'type': 'FeatureCollection', 'bbox': BOUNDS, 'name': 'Takanawa Gateway planning extract',
              'attribution': '© OpenStreetMap contributors', 'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
              'retrieved': '2026-10-31', 'features': features}
(ROOT / 'takanawa-osm.geojson').write_text(json.dumps(collection,ensure_ascii=False,separators=(',',':')))
# Shared-node pedestrian topology only. This is a planning candidate, not navigation.
start,end = '11185797078','13304643664'
queue,dist,previous = [(0,start)],{start:0},{}
while queue:
    distance,a = heapq.heappop(queue)
    if a == end:
        break
    if distance > dist[a]:
        continue
    for b,length,way in graph.get(a,[]):
        if distance+length < dist.get(b,float('inf')):
            dist[b] = distance+length
            previous[b] = (a,way)
            heapq.heappush(queue,(dist[b],b))
sequence,way_sequence = [end],[]
a = end
while a in previous:
    a,w = previous[a]
    sequence.append(a)
    way_sequence.append(w)
sequence.reverse()
way_sequence.reverse()
route = {'type':'FeatureCollection','attribution':'© OpenStreetMap contributors','license':collection['license'],
         'features':[{'type':'Feature','properties':{'name':'North gate to Sengakuji approach',
         'status':'OSM connected pedestrian candidate; broadly corroborated by temple access instructions',
         'distance_m_approx':round(dist[end]),'osm_node_ids':sequence,'osm_way_ids':list(dict.fromkeys(way_sequence)),
         'limitations':'Contains steps. Graph assumes two-way walking. Does not verify access hours or current work barriers. Endpoint is temple approach, not a fictional home.'},
         'geometry':{'type':'LineString','coordinates':[coordinate(n) for n in sequence]}}]}
(ROOT / 'west-approach-route.geojson').write_text(json.dumps(route,ensure_ascii=False,indent=2))
summary={'bounds_wgs84':BOUNDS,'features':len(features),'by_kind':dict(collections.Counter(f['properties']['dataset_kind'] for f in features)),
         'source_counts':dict(collections.Counter(e.tag for e in root)),
         'source_element_timestamp_min':min(e.get('timestamp') for e in root if e.get('timestamp')),
         'source_element_timestamp_max':max(e.get('timestamp') for e in root if e.get('timestamp'))}
(ROOT / 'dataset-summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
print('Route candidate metres:',round(dist[end]),'segments:',len(sequence)-1)
