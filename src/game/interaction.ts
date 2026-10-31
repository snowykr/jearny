// Pure helpers: input + map → command. Issue #19 owns, tests and extends this file.
import type { CommandPayload, Effect, EntityAnchor, MapDefinition, Portal, Tile } from '../contracts';
import type { Dir } from './input';

export const DELTA: Record<Dir, Tile> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export const facingTile = (tile: Tile, dir: Dir): Tile => [tile[0] + DELTA[dir][0], tile[1] + DELTA[dir][1]];

/** Solid entities (npc, shop, item, building) win over zones that overlap the same tile. */
export function entityAt(map: MapDefinition, [x, y]: Tile): EntityAnchor | null {
  let zone: EntityAnchor | null = null;
  for (const e of map.entities) {
    const [w, h] = e.size ?? [1, 1];
    if (x >= e.tile[0] && x < e.tile[0] + w && y >= e.tile[1] && y < e.tile[1] + h) {
      if (e.kind !== 'zone') return e;
      zone ??= e;
    }
  }
  return zone;
}

export function zoneAt(map: MapDefinition, tile: Tile): EntityAnchor | null {
  for (const e of map.entities) {
    if (e.kind !== 'zone') continue;
    const [w, h] = e.size ?? [1, 1];
    if (tile[0] >= e.tile[0] && tile[0] < e.tile[0] + w && tile[1] >= e.tile[1] && tile[1] < e.tile[1] + h) return e;
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

/**
 * What stepping onto `tile` should dispatch. A portal wins; otherwise entering a zone
 * (coming from `fromZoneId`) dispatches Interact once. `zoneId` is the zone now occupied.
 */
export function arrivalCommand(
  map: MapDefinition,
  tile: Tile,
  fromZoneId: string | null,
): { command: CommandPayload | null; portal: Portal | null; zoneId: string | null } {
  const zone = zoneAt(map, tile);
  const zoneId = zone?.id ?? null;
  const portal = portalAt(map, tile);
  if (portal) return { command: { type: 'UsePortal', portalId: portal.id }, portal, zoneId };
  if (zone && zone.id !== fromZoneId) return { command: { type: 'Interact', entityId: zone.id }, portal: null, zoneId };
  return { command: null, portal: null, zoneId };
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
