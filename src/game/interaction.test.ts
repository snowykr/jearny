import { describe, expect, it } from 'vitest';
import { BUILDING, ENTITY, PORTAL, SPAWN } from '../contracts';
import type { Effect, MapDefinition } from '../contracts';
import { maps } from '../content/maps';
import { makeRoom } from '../content/maps/util';
import { arrivalCommand, createEffectDeduper, entityAt, facingTile, interactCommand, isBlocked, portalAt, zoneAt } from './interaction';

const takanawa = maps.takanawa;
const home = maps['home-interior'];

describe('facingTile / interactCommand', () => {
  it('computes the faced tile', () => {
    expect(facingTile([5, 5], 'up')).toEqual([5, 4]);
    expect(facingTile([5, 5], 'left')).toEqual([4, 5]);
  });

  it('interacts with the NPC on the faced tile', () => {
    const guide = home.entities.find((e) => e.id === ENTITY.guide)!;
    const below: [number, number] = [guide.tile[0], guide.tile[1] + 1];
    expect(interactCommand(home, below, 'up')).toEqual({ type: 'Interact', entityId: ENTITY.guide });
  });

  it('returns null for empty tiles and for buildings', () => {
    expect(interactCommand(home, [8, 6], 'down')).toBeNull();
    expect(interactCommand(takanawa, [57, 44], 'left')).toBeNull(); // faces the station building
    expect(entityAt(takanawa, [57, 44])).toBeNull();
    expect(entityAt(takanawa, [58, 44])?.id).toBe(BUILDING.station);
    expect(interactCommand(takanawa, [57, 44], 'right')).toBeNull();
  });
});

describe('collision helpers', () => {
  it('blocks outside the grid, collision cells, buildings and NPCs but not zones', () => {
    expect(isBlocked(home, [-1, 0])).toBe(true);
    expect(isBlocked(home, [0, 0])).toBe(true);
    expect(isBlocked(home, [8, 6])).toBe(false);
    expect(isBlocked(home, [5, 4])).toBe(true); // guide
    expect(isBlocked(takanawa, [62, 48])).toBe(false); // zone only (row 48 is below the station building)
    expect(isBlocked(takanawa, [66, 50])).toBe(true); // station staff
  });

  it('lets a solid entity win over an overlapping zone', () => {
    const m: MapDefinition = makeRoom({
      id: 'home-interior',
      grid: [8, 8],
      floor: 0,
      spawns: { a: [1, 1] },
      entities: [
        { id: 'zone:z', kind: 'zone', tile: [2, 2], size: [3, 3] },
        { id: 'npc:n', kind: 'npc', tile: [3, 3] },
      ],
    });
    expect(entityAt(m, [3, 3])?.id).toBe('npc:n');
    expect(isBlocked(m, [3, 3])).toBe(true);
    expect(entityAt(m, [2, 2])?.id).toBe('zone:z');
    expect(zoneAt(m, [3, 3])?.id).toBe('zone:z');
  });

  it('finds portals by tile', () => {
    expect(portalAt(home, [8, 11])?.id).toBe(PORTAL.homeExit);
    expect(portalAt(home, [8, 10])).toBeNull();
  });
});

describe('arrivalCommand (portals and zones)', () => {
  it('uses a portal when stepping onto its tile', () => {
    const r = arrivalCommand(home, [8, 11], null);
    expect(r.command).toEqual({ type: 'UsePortal', portalId: PORTAL.homeExit });
    expect(r.portal?.toSpawn).toBe(SPAWN.homeDoor);
  });

  it('dispatches Interact(zone) once per entry', () => {
    const first = arrivalCommand(takanawa, [62, 48], null);
    expect(first.command).toEqual({ type: 'Interact', entityId: ENTITY.stationZone });
    expect(first.zoneId).toBe(ENTITY.stationZone);
    // moving within the zone does not re-fire
    const second = arrivalCommand(takanawa, [63, 48], first.zoneId);
    expect(second.command).toBeNull();
    expect(second.zoneId).toBe(ENTITY.stationZone);
    // leaving then re-entering fires again
    const out = arrivalCommand(takanawa, [61, 48], second.zoneId);
    expect(out.command).toBeNull();
    expect(out.zoneId).toBeNull();
    expect(arrivalCommand(takanawa, [62, 48], out.zoneId).command).not.toBeNull();
  });

  it('does nothing on plain tiles', () => {
    expect(arrivalCommand(home, [8, 6], null)).toEqual({ command: null, portal: null, zoneId: null });
  });
});

describe('createEffectDeduper', () => {
  const fx = (id: string): Effect => ({ id, type: 'ShowHint', reason: id });

  it('drops effects it has already seen', () => {
    const dedupe = createEffectDeduper();
    expect(dedupe([fx('a'), fx('b')]).map((e) => e.id)).toEqual(['a', 'b']);
    expect(dedupe([fx('b'), fx('c')]).map((e) => e.id)).toEqual(['c']);
    expect(dedupe([fx('a')])).toEqual([]);
  });

  it('drops duplicates inside one batch', () => {
    expect(createEffectDeduper()([fx('a'), fx('a')])).toHaveLength(1);
  });

  it('forgets the oldest ids beyond max', () => {
    const dedupe = createEffectDeduper(2);
    dedupe([fx('a'), fx('b'), fx('c')]);
    expect(dedupe([fx('a')])).toHaveLength(1); // evicted
    expect(dedupe([fx('c')])).toHaveLength(0);
  });
});
