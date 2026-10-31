// Pure helpers: input + map → command. Issue #19 owns, tests and extends this file.
import type { CommandPayload, Effect, EntityAnchor, MapDefinition, Portal, Tile } from '../contracts';
import type { Dir } from './input';

export const DELTA: Record<Dir, Tile> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const facingTile = (tile: Tile, dir: Dir): Tile => [tile[0] + DELTA[dir][0], tile[1] + DELTA[dir][1]];

export function entityAt(map: MapDefinition, [x, y]: Tile): EntityAnchor | null {
  for (const e of map.entities) {
    const [w, h] = e.size ?? [1, 1];
    if (x >= e.tile[0] && x < e.tile[0] + w && y >= e.tile[1] && y < e.tile[1] + h) return e;
  }
  return null;
}

export const portalAt = (map: MapDefinition, [x, y]: Tile): Portal | null =>
  map.portals.find((p) => p.tile[0] === x && p.tile[1] === y) ?? null;

export function isBlocked(map: MapDefinition, [x, y]: Tile): boolean {
  const [cols, rows] = map.grid;
  if (x < 0 || y < 0 || x >= cols || y >= rows) return true;
  if (map.collision[y * cols + x] === 1) return true;
  const e = entityAt(map, [x, y]);
  return !!e && e.kind !== 'zone';
}

export function interactCommand(map: MapDefinition, tile: Tile, dir: Dir): CommandPayload | null {
  const e = entityAt(map, facingTile(tile, dir));
  return e && e.kind !== 'building' ? { type: 'Interact', entityId: e.id } : null;
}

/** Drops effects whose id was already seen (network retries, re-renders). */
export function createEffectDeduper(max = 256): (effects: Effect[]) => Effect[] {
  const seen: string[] = [];
  return (effects) =>
    effects.filter((e) => {
      if (seen.includes(e.id)) return false;
      seen.push(e.id);
      if (seen.length > max) seen.shift();
      return true;
    });
}
