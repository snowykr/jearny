# Takanawa Gateway map evidence

Retrieved on 2026-10-31. This is game-planning research, not live navigation. The player home is fictional. No real residence or current shop is assigned to it.

## Recommended 2D route

Use the Takanawa side west of the railway. Place the fictional home in a compressed residential zone west/southwest of the Sengakuji approach. The playable journey should follow the neighborhood streets to the temple approach, cross National Route 15 at the marked Sengakuji crossing, pass Sengakuji-tsuji plaza, climb to the LINKPILLAR 1 NORTH deck, and reach the station North Gate.

Sengakuji's [official access page](https://www.sengakuji.or.jp/access/) gives the reverse journey: leave the North Gate, go right around the rotary in front of LINKPILLAR 1 NORTH, descend the escalator, pass Sengakuji-tsuji plaza, cross the crosswalk, and continue to the temple. Its stated walk is five minutes. The page has no visible revision date; retrieved 2026-10-31.

`west-approach-route.geojson` is a 440 m connected OSM path from the North Gate to the temple approach. Its 27 segments share OSM nodes; it is not a straight line drawn across buildings. It includes elevated footways, steps, sidewalks, and two marked crossing ways. The route broadly agrees with the official description, but its precise stairs are an OSM candidate rather than a verified escalator itinerary. The graph assumes two-way walking and does not check opening hours. Do not present it as an accessible or live route.

For the game, compress this into a small west-to-east trip with the station central on screen and the railway forming a visible north–south barrier behind it. Rotate/simplify blocks only as a clearly stylized map. A stair/deck transition can flatten the level change while retaining its location. Keep home coordinates and art in a separate fictional game layer. Shop research is recorded in `../shops/references.md`; placement remains a separate authored game layer.

## Geographic data saved

`osm-map.osm` is the raw [OpenStreetMap API extract](https://www.openstreetmap.org/api/0.6/map?bbox=139.733,35.630,139.747,35.641). It contains 16,488 nodes, 2,540 ways, and 198 relations. The requested box is about 1.27 km east–west by 1.22 km north–south, roughly 600 m in each direction around the station. Raw OSM includes full ways beyond the box.

`takanawa-osm.geojson` clips selected geometries to that box and retains OSM identifiers, tags, versions, and edit timestamps. It contains 2,429 features: 1,280 building ways, 689 road/footway ways, 218 railway ways, 117 land-cover ways, 109 crossing nodes, 8 station/entrance/gate nodes, and 8 worship-site ways. GeoJSON coordinates are WGS84 longitude, latitude. The extract does not assemble relation multipolygons; it is a compact planning layer, not every OSM object. Surface and underground railways remain tagged separately through original `layer`, `tunnel`, and `railway` properties. Never assume that intersecting lines connect; use shared nodes and level tags.

Bounds: `[139.733, 35.630, 139.747, 35.641]` (west, south, east, north). Raw element edit dates range from 2008-10-21 to 2026-10-30. A recent download does not mean every feature was recently surveyed. Overpass requests returned HTTP 406 or timed out; the direct OSM API supplied the saved data. `overpass-query.txt` records the attempted query.

| Reference | Latitude | Longitude | Evidence |
| --- | ---: | ---: | --- |
| Takanawa Gateway station | 35.6353992 | 139.7406635 | OSM node 7502284289; edited 2026-08-30 |
| North Gate | 35.6357472 | 139.7406672 | OSM node 11185797078; edited 2025-09-20 |
| South Gate | 35.6352029 | 139.7404233 | OSM node 13123458811; edited 2025-09-20 |
| Temple approach route endpoint | 35.6378034 | 139.7378860 | OSM node 13304643664; edited 2025-11-14 |
| Sengakuji subway station reference | 35.6386708 | 139.7400043 | OSM node 6279803459; underground station, not an entrance |

`convert_osm.py` regenerates both GeoJSON files from the raw snapshot using Python and Shapely. `dataset-summary.json` records counts and dates. Original OSM `source` tags are retained; `dataset_source` identifies this extract's provider.

## Railway crossings and redevelopment

There is no verified direct station-to-east bridge for an October 2026 layout. Minato's [2026-02-27 progress answer](https://www.city.minato.tokyo.jp/kouchou/kuse/kocho/ikenshokai49/3474.html) gives a target opening in fiscal 2028–2030. Render it as future construction or omit it from the playable graph.

The northern under-rail route is different. Minato's [roadworks page](https://www.city.minato.tokyo.jp/dobokukeikaku/dainitouzai_setumeikai.html), updated 2026-03-28, links the saved [pedestrian route PDF](https://www.city.minato.tokyo.jp/documents/99746/hokousha_260328.pdf). Its red route follows the station-side street north and then passes through the old drainage-channel passage under the tracks. It avoids the former Route 15 detour. The sheet labels this temporary arrangement from 2026-03-28 until the end of fiscal 2026, planned. The saved PNG is a readable render of that one-page PDF. Use this as a separate optional branch, with construction context, rather than inventing a straight crossing opposite the station.

JR East's [station information](https://www.jreast.co.jp/estation/station/info.aspx?StationCd=1750) lists North and South gates. The [official internal-map page](https://www.jreast.co.jp/estation/stations/1750.html) was readable through web search; its direct HTML download returned 403, so no local JR map is claimed. The current [Gateway City access page](https://www.takanawagateway-city.com/access/) and its original `guide.svg` were saved as visual reference. These official diagrams are not georeferenced source geometry.

## Reuse and attribution

OSM data is under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Show `© OpenStreetMap contributors` with a link to [OSM copyright](https://www.openstreetmap.org/copyright) in map credits and disclose the ODbL source. OSM's copyright page describes attribution and share-alike requirements for adapted databases. Keep this source and derived geographic database available when distributing it; review the license for the intended distribution. Do not assume that all independently drawn game art has the same license as the data.

The official city, temple, and railway pages are evidence references. No general license to redistribute or trace their diagram artwork was established. Keep the saved official maps in research; draw original game art from permitted geographic data and independently stated facts. The temple page explicitly carries an all-rights-reserved notice. Do not use Google basemap imagery embedded in the saved pages as game assets.

PLATEAU 3D was not downloaded. The OSM footprint/road layer plus official route checks supplies the needed 2D starting point without a large 3D conversion.
