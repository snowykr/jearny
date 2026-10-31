// Map colours for the minimap and the town map (#66).
//
// Every value is sampled from the shipped atlases, not invented:
//   public/sprites/tiles-outdoor.png  and  public/sprites/tiles-interior.png
// (8x6 grids of 16x16 cells; index = row * 8 + col, see src/content/maps/tiles.ts).
//
// Sampling: for the named tile, take the dominant opaque colour (5-bit buckets); where the
// tile is mostly outline or has two near-equal fills, take the mean/other fill and say so.
// Re-sample with pngjs (a devDependency):
//
//   node -e "const{PNG}=require('pngjs');const fs=require('fs');const p=PNG.sync.read(fs.readFileSync('public/sprites/tiles-outdoor.png'));const i=Number(process.argv[1]);const cx=(i%8)*16,cy=(i/8|0)*16;const m=new Map();for(let y=0;y<16;y++)for(let x=0;x<16;x++){const o=((cy+y)*p.width+cx+x)*4;if(p.data[o+3]<200)continue;const k=(p.data[o]>>3)+','+(p.data[o+1]>>3)+','+(p.data[o+2]>>3);m.set(k,(m.get(k)||0)+1);}console.log([...m].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,n])=>'#'+k.split(',').map(v=>(+v*8+4).toString(16).padStart(2,'0')).join('')+' x'+n).join(' '))" 0
import { IT, T } from '../content/maps/tiles';

export type TileCategory =
  | 'grass' | 'sidewalk' | 'road' | 'crossing' | 'rail' | 'gravel' | 'deck' | 'plaza' | 'path'
  | 'water' | 'hedge' | 'tree'
  | 'floor-tatami' | 'floor-wood' | 'floor-shop' | 'floor-stone' | 'wall' | 'furniture';

/** The atlas tile each colour came from, so the palette can be re-checked against the art. */
export const CATEGORY_TILE: Record<TileCategory, { sheet: 'tiles-outdoor' | 'tiles-interior'; tile: number }> = {
  grass: { sheet: 'tiles-outdoor', tile: T.GRASS_A },
  sidewalk: { sheet: 'tiles-outdoor', tile: T.SIDEWALK },
  road: { sheet: 'tiles-outdoor', tile: T.ROAD },
  crossing: { sheet: 'tiles-outdoor', tile: T.CROSSING_H }, // stripe fill; the asphalt underneath stays `road`
  rail: { sheet: 'tiles-outdoor', tile: T.RAIL_H }, // mean: sleepers + ties, no single dominant fill
  gravel: { sheet: 'tiles-outdoor', tile: T.GRAVEL },
  deck: { sheet: 'tiles-outdoor', tile: T.DECK },
  plaza: { sheet: 'tiles-outdoor', tile: T.PLAZA }, // mean, so it stays distinct from the deck
  path: { sheet: 'tiles-outdoor', tile: T.TEMPLE_PATH }, // mean, so it stays distinct from gravel
  water: { sheet: 'tiles-outdoor', tile: T.WATER },
  hedge: { sheet: 'tiles-outdoor', tile: T.HEDGE }, // bush fill, ignoring the dark outline
  tree: { sheet: 'tiles-outdoor', tile: T.TREE_BL },
  'floor-tatami': { sheet: 'tiles-interior', tile: IT.TATAMI },
  'floor-wood': { sheet: 'tiles-interior', tile: IT.WOOD_FLOOR },
  'floor-shop': { sheet: 'tiles-interior', tile: IT.SHOP_FLOOR },
  'floor-stone': { sheet: 'tiles-interior', tile: IT.GENKAN },
  wall: { sheet: 'tiles-interior', tile: IT.WALL_TOP }, // the dark wall band; IT.WALL alone is plaster
  furniture: { sheet: 'tiles-interior', tile: IT.LOW_TABLE },
};

export const CATEGORY_COLOR: Record<TileCategory, string> = {
  grass: '#64ac5c',
  sidewalk: '#bcaca4',
  road: '#5c6c7c',
  crossing: '#e4d4bc',
  rail: '#857464',
  gravel: '#ac9c94',
  deck: '#e4d4bc',
  plaza: '#d8cab3',
  path: '#9b968a',
  water: '#24749c',
  hedge: '#448c54',
  tree: '#448c54',
  'floor-tatami': '#ecbc84',
  'floor-wood': '#cc8c3c',
  'floor-shop': '#ecccac',
  'floor-stone': '#74849c',
  wall: '#5c3c24',
  furniture: '#bc8444',
};
