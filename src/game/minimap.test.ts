import { describe, expect, it } from 'vitest';
import { BUILDING, QUEST } from '../contracts';
import { maps } from '../content/maps';
import { IT, T } from '../content/maps/tiles';
import { VIEW_H, VIEW_W } from './camera';
import {
  CATEGORY_COLOR, ariaLabel, buildBaseImage, indoorCategory, locationLabel, minimapWidth, nearestPoi,
  outdoorCategory, poisForMap, questTargetPoi, viewportRect, worldToMinimap,
} from './minimap';

const town = maps.takanawa;

describe('tile category mapping', () => {
  it('maps outdoor ground tiles to categories', () => {
    expect(outdoorCategory(T.GRASS_B)).toBe('grass');
    expect(outdoorCategory(T.ROAD)).toBe('road');
    expect(outdoorCategory(T.ROAD_EDGE_W)).toBe('road');
    expect(outdoorCategory(T.CROSSING_H)).toBe('crossing');
    expect(outdoorCategory(T.RAIL_V)).toBe('rail');
    expect(outdoorCategory(T.DECK)).toBe('deck');
    expect(outdoorCategory(T.PLAZA)).toBe('plaza');
    expect(outdoorCategory(T.TEMPLE_PATH)).toBe('path');
    expect(outdoorCategory(T.WATER)).toBe('water');
  });

  it('lets trees on the decoration/roof layers read over the ground', () => {
    expect(outdoorCategory(T.GRASS_A, -1, T.TREE_TL)).toBe('tree');
    expect(outdoorCategory(T.GRASS_A, T.TREE_BR, -1)).toBe('tree');
    expect(outdoorCategory(T.GRASS_A, T.FLOWERS, -1)).toBe('grass');
  });

  it('falls back to grass for unknown outdoor tiles and gives every category a colour', () => {
    expect(outdoorCategory(-1)).toBe('grass');
    for (const c of Object.values(CATEGORY_COLOR)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('classifies interior walls, furniture and floors', () => {
    expect(indoorCategory(IT.WOOD_FLOOR, -1, true)).toBe('wall'); // room border
    expect(indoorCategory(IT.WALL_TOP, -1, false)).toBe('wall');
    expect(indoorCategory(IT.TATAMI, IT.LOW_TABLE, false)).toBe('furniture');
    expect(indoorCategory(IT.TATAMI, -1, false)).toBe('floor-tatami');
    expect(indoorCategory(IT.SHOP_FLOOR, -1, false)).toBe('floor-shop');
    expect(indoorCategory(IT.GENKAN, -1, false)).toBe('floor-stone');
  });
});

describe('base image', () => {
  it('is 1 px per tile, fully opaque, with colour-coded roads and building footprints', () => {
    const img = buildBaseImage(town);
    expect(img.width).toBe(128);
    expect(img.height).toBe(96);
    expect(img.data.length).toBe(128 * 96 * 4);
    for (let i = 3; i < img.data.length; i += 4) expect(img.data[i]).toBe(255);
    const px = (x: number, y: number) => [...img.data.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 3)];
    expect(px(44, 5)).toEqual([0x4b, 0x4e, 0x59]); // Route 15 asphalt
    expect(px(60, 43)).toEqual([0x6b, 0x92, 0xc6]); // station footprint interior
    expect(px(58, 41)).toEqual([0x3a, 0x2a, 0x22]); // footprint border: station (12x5) is outlined
    expect(px(58, 40)).toEqual([0x8d, 0xa6, 0xbd]); // deck row above the station stays uncovered
    expect(px(16, 36)).toEqual([0xd0, 0x67, 0x5a]); // home footprint interior stays fill
  });

  it('renders interiors as room thumbnails', () => {
    const home = maps['home-interior'];
    const img = buildBaseImage(home);
    expect(img.width).toBe(home.grid[0]);
    expect(img.height).toBe(home.grid[1]);
  });
});

describe('POIs', () => {
  const pois = poisForMap(town);

  it('places 家 / 駅 / 松島屋 on their building footprints', () => {
    const byId = Object.fromEntries(pois.map((p) => [p.id, p]));
    expect(pois).toHaveLength(3);
    expect(byId[BUILDING.home]).toMatchObject({ label: '家', name: '自宅', center: [17.5, 37] });
    expect(byId[BUILDING.station]).toMatchObject({ label: '駅', center: [64, 43.5] });
    expect(byId[BUILDING.matsushimaya]).toMatchObject({ label: '松島屋', center: [16, 13.5] });
  });

  it('has no POIs for interiors', () => {
    expect(poisForMap(maps['home-interior'])).toEqual([]);
  });

  it('finds the nearest POI', () => {
    expect(nearestPoi(pois, [20, 41])?.poi.id).toBe(BUILDING.home);
    expect(nearestPoi(pois, [64, 49])?.poi.id).toBe(BUILDING.station);
    expect(nearestPoi(pois, [12, 8])?.poi.id).toBe(BUILDING.matsushimaya);
    expect(nearestPoi([], [0, 0])).toBeNull();
  });
});

describe('quest target', () => {
  const snap = (status: string | undefined, flags: Record<string, true> = {}) =>
    ({ quests: status ? { [QUEST.firstTrip]: status } : {}, flags }) as Parameters<typeof questTargetPoi>[0];

  it('walks home -> station -> shop -> home', () => {
    expect(questTargetPoi(snap(undefined))).toBe(BUILDING.home);
    expect(questTargetPoi(snap('active'))).toBe(BUILDING.station);
    expect(questTargetPoi(snap('active', { 'visited:station': true }))).toBe(BUILDING.matsushimaya);
    expect(questTargetPoi(snap('active', { 'visited:station': true, 'conversationPassed:shop_order': true }))).toBe(BUILDING.home);
    expect(questTargetPoi(snap('ready_to_return'))).toBe(BUILDING.home);
  });

  it('has no target once the quest is completed', () => {
    expect(questTargetPoi(snap('completed'))).toBeNull();
  });
});

describe('coordinate transform', () => {
  const f = { w: 200, h: 150, cols: 128, rows: 96 };

  it('scales world tiles to minimap pixels', () => {
    expect(worldToMinimap([0, 0], f)).toEqual([0, 0]);
    expect(worldToMinimap([128, 96], f)).toEqual([200, 150]);
    expect(worldToMinimap([64, 48], f)).toEqual([100, 75]);
  });

  it('shows a viewport window of 15x10 tiles centred on the player', () => {
    const r = viewportRect([64, 48], town, f);
    expect(r.w).toBeCloseTo((VIEW_W / 16 / 128) * 200);
    expect(r.h).toBeCloseTo((VIEW_H / 16 / 96) * 150);
    expect(r.x + r.w / 2).toBeCloseTo(worldToMinimap([64.5, 48.5], f)[0], 0);
  });

  it('clamps the viewport window to the map edges like the camera', () => {
    const corner = viewportRect([0, 0], town, f);
    expect(corner.x).toBe(0);
    expect(corner.y).toBe(0);
    const far = viewportRect([127, 95], town, f);
    expect(far.x + far.w).toBeCloseTo(200);
    expect(far.y + far.h).toBeCloseTo(150);
  });

  it('caps the minimap width at 200 css px and 25% of the viewport', () => {
    expect(minimapWidth(1920)).toBe(200);
    expect(minimapWidth(640)).toBe(160);
    expect(minimapWidth(375)).toBe(96);
    expect(minimapWidth(200)).toBe(96);
  });
});

describe('labels', () => {
  it('names each location', () => {
    expect(locationLabel('takanawa')).toBe('高輪ゲートウェイ周辺');
    expect(locationLabel('home-interior')).toBe('自宅 1F');
    expect(locationLabel('home-2f')).toBe('自宅 2F');
    expect(locationLabel('shop-interior')).toBe('松島屋（店内）');
  });

  it('builds an accessible name with the nearest POI', () => {
    const near = nearestPoi(poisForMap(town), [20, 41]);
    const label = ariaLabel('takanawa', near);
    expect(label).toContain('高輪ゲートウェイ周辺');
    expect(label).toContain('自宅');
    expect(ariaLabel('home-interior', null)).toBe('ミニマップ：自宅 1F');
  });
});
