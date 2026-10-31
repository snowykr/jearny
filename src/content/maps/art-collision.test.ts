// The art registry is the single source of building collision (#50): a building's
// collisionTiles must be the rows its exported sprite actually paints, and each map
// entity must sit exactly on those rows. Reading the PNG here means a re-export that
// shifts or resizes the art fails in CI even when the metadata was not touched.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { BUILDING } from '../../contracts';
import type { EntityAnchor } from '../../contracts';
import homeMeta from '../../../assets/source/meta/home.json';
import matsushimayaMeta from '../../../assets/source/meta/matsushimaya.json';
import stationMeta from '../../../assets/source/meta/station.json';
import { maps } from './index';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** Opaque bounds of a sprite: what the player actually sees, in pixels. */
function opaqueBounds(id: string) {
  const png = PNG.sync.read(readFileSync(join(root, 'public', 'sprites', `${id}.png`)));
  let minX = png.width;
  let maxX = -1;
  let minY = png.height;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { width: png.width, height: png.height, minX, maxX, minY, maxY };
}

const registry = [
  { id: 'station', meta: stationMeta, entityId: BUILDING.station },
  { id: 'home', meta: homeMeta, entityId: BUILDING.home },
  { id: 'matsushimaya', meta: matsushimayaMeta, entityId: BUILDING.matsushimaya },
] as const;

const byEntity = (id: string): EntityAnchor => {
  const entity = maps.takanawa.entities.find((candidate) => candidate.id === id);
  if (!entity) throw new Error(`Missing map entity ${id}`);
  return entity;
};

describe('building collision follows the exported art', () => {
  for (const { id, meta, entityId } of registry) {
    it(`${id}: collisionTiles are exactly the painted rows`, () => {
      const bounds = opaqueBounds(id);
      expect(bounds.maxY).toBeGreaterThanOrEqual(0);
      expect(meta.runtimeSize).toEqual([bounds.width, bounds.height]);
      const rows = Math.floor(bounds.maxY / 16) - Math.floor(bounds.minY / 16) + 1;
      const cols = Math.ceil((bounds.maxX - bounds.minX + 1) / 16);
      expect(meta.collisionTiles).toEqual([cols, rows]);
    });

    it(`${id}: the map entity sits on the painted rows without moving the sprite`, () => {
      const bounds = opaqueBounds(id);
      const entity = byEntity(entityId);
      const heightTiles = bounds.height / 16;
      const footRow = entity.footRow;
      expect(footRow).toBeDefined();
      if (footRow === undefined) return;
      const spriteTop = footRow - heightTiles;
      const expectedTop = spriteTop + Math.floor(bounds.minY / 16);
      expect(entity.tile[1]).toBe(expectedTop);
      expect(entity.size).toEqual(meta.collisionTiles);
      // Same-width footprint: every painted column stays inside the blocked tiles.
      const [cols] = meta.collisionTiles as [number, number];
      const left = entity.tile[0] * 16;
      expect(left + bounds.maxX).toBeLessThan(left + cols * 16);
    });
  }
});
