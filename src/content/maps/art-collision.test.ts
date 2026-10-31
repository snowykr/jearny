// The art registry is the single source of building collision (#50): a building's
// collisionTiles must be the rows its exported sprite actually paints, and each map
// entity must sit exactly on those rows. Reading the PNG here means a re-export that
// shifts or resizes the art fails in CI even when the metadata was not touched.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { maps } from './index';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const metaDir = join(root, 'assets', 'source', 'meta');

interface BuildingMeta {
  id: string;
  kind: string;
  runtimeSize: [number, number];
  collisionTiles: [number, number];
}

const metas: BuildingMeta[] = readdirSync(metaDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(metaDir, name), 'utf8')) as BuildingMeta)
  .filter((meta) => meta.kind === 'building');

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

const placed = maps.takanawa.entities.filter((entity) => entity.kind === 'building');

describe('building collision follows the exported art', () => {
  it('finds at least one building in the registry and on the map', () => {
    expect(metas.length).toBeGreaterThan(0);
    expect(placed.length).toBeGreaterThan(0);
  });

  for (const meta of metas) {
    it(`${meta.id}: collisionTiles are exactly the painted rows`, () => {
      const bounds = opaqueBounds(meta.id);
      expect(bounds.maxY).toBeGreaterThanOrEqual(0);
      expect(meta.runtimeSize).toEqual([bounds.width, bounds.height]);
      const rows = Math.floor(bounds.maxY / 16) - Math.floor(bounds.minY / 16) + 1;
      const cols = Math.ceil((bounds.maxX - bounds.minX + 1) / 16);
      expect(meta.collisionTiles).toEqual([cols, rows]);
    });
  }

  for (const entity of placed) {
    const meta = metas.find((candidate) => candidate.id === entity.assetId);
    it(`${entity.id}: matches a registry entry and sits on its painted rows`, () => {
      expect(meta).toBeDefined();
      if (!meta) return;
      const bounds = opaqueBounds(meta.id);
      const [cols, rows] = meta.collisionTiles;
      expect(entity.size).toEqual([cols, rows]);
      // Same width as the sprite, so the painted columns and blocked tiles share an edge.
      expect(meta.runtimeSize[0]).toBe(cols * 16);
      const heightTiles = bounds.height / 16;
      const footRow = entity.footRow;
      expect(footRow).toBeDefined();
      if (footRow === undefined) return;
      const spriteTop = footRow - heightTiles;
      expect(entity.tile[1]).toBe(spriteTop + Math.floor(bounds.minY / 16));
      const left = entity.tile[0] * 16;
      expect(left + bounds.maxX).toBeLessThan(left + cols * 16);
      // The footprint also covers the painted bottom row.
      const bottom = (entity.tile[1] + rows) * 16;
      expect(spriteTop * 16 + bounds.maxY).toBeLessThan(bottom);
    });
  }

  it('has a registry entry for every building placed on the map', () => {
    for (const entity of placed) {
      expect(metas.some((meta) => meta.id === entity.assetId), `missing meta for ${entity.id}`).toBe(true);
    }
  });
});
