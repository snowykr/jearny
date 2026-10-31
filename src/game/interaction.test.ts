import { describe, expect, it } from 'vitest';
import { BUILDING, ENTITY, PORTAL, SPAWN } from '../contracts';
import type { Effect, MapDefinition } from '../contracts';
import { maps } from '../content/maps';
import { makeRoom } from '../content/maps/util';
import { arrivalCommand, createEffectDeduper, entityAt, facingTile, interactCommand, isBlocked, portalAt, zoneAt } from './interaction';
import { STEP_SECONDS, createPlayer, updatePlayer } from './player';

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
    const start = home.spawns[SPAWN.start];
    if (!start) throw new Error('Missing start spawn');
    expect(interactCommand(home, start, 'down')).toBeNull();
    expect(interactCommand(takanawa, [57, 44], 'left')).toBeNull(); // faces the station building
    expect(entityAt(takanawa, [57, 44])).toBeNull();
    expect(entityAt(takanawa, [58, 44])?.id).toBe(BUILDING.station);
    expect(interactCommand(takanawa, [57, 44], 'right')).toBeNull();
  });
});

describe('collision helpers', () => {
  it('blocks outside the grid, collision cells, NPCs and painted footprints but not zones', () => {
    expect(isBlocked(home, [-1, 0])).toBe(true);
    expect(isBlocked(home, [0, 0])).toBe(true);
    const start = home.spawns[SPAWN.start];
    if (!start) throw new Error('Missing start spawn');
    expect(isBlocked(home, start)).toBe(false);
    expect(isBlocked(home, [4, 4])).toBe(true); // guide
    expect(isBlocked(takanawa, [62, 48])).toBe(false); // zone only (row 48 is below the station building)
    expect(isBlocked(takanawa, [66, 50])).toBe(true); // station staff
  });

  it('blocks a building through its painted footprint, not through its entity alone', () => {
    // The map authoring loop paints every footprint into the grid, so a building wall still blocks.
    expect(isBlocked(takanawa, [58, 44])).toBe(true); // inside the station footprint
    // ...and the entity adds nothing on top: a free grid tile is walkable even under the gate.
    expect(isBlocked(takanawa, [36, 18])).toBe(false);
  });

  it('opens the 泉岳寺 sanmon passage and keeps its posts solid', () => {
    // Fails if a building entity starts blocking by itself again; the grid already owns its walls.
    expect(isBlocked(takanawa, [36, 18])).toBe(false);
    expect(isBlocked(takanawa, [37, 18])).toBe(false);
    expect(isBlocked(takanawa, [33, 18])).toBe(true); // west post
    expect(isBlocked(takanawa, [40, 18])).toBe(true); // east post
    expect(isBlocked(takanawa, [35, 18])).toBe(true); // one tile inside the west post
  });

  it('walks from the gate apron into the temple court with the player state machine', () => {
    // The real movement path: updatePlayer, the function scene.ts drives, from the apron on the
    // temple path through the sanmon passage to the paved court in front of the hall.
    const p = createPlayer([37, 22], 'up');
    const trace: [number, number][] = [p.tile];
    for (let tick = 0; tick < 40 && (p.tile[0] !== 37 || p.tile[1] !== 14); tick++) {
      const arrived = updatePlayer(p, takanawa, STEP_SECONDS, { heldDir: 'up', tapDir: null, canAct: true });
      if (arrived) trace.push(arrived);
    }
    expect(p.tile).toEqual([37, 14]);
    expect(trace).toEqual([
      [37, 22], [37, 21], [37, 20], [37, 19], [37, 18],
      [37, 17], [37, 16], [37, 15], [37, 14],
    ]);
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
    expect(portalAt(home, [6, 8])?.id).toBe(PORTAL.homeExit);
    expect(portalAt(home, [6, 7])).toBeNull();
  });
});

describe('arrivalCommand (portals and zones)', () => {
  it('uses a portal when stepping onto its tile', () => {
    const r = arrivalCommand(home, [6, 8], null);
    expect(r.command).toEqual({ type: 'UsePortal', portalId: PORTAL.homeExit });
    expect(r.portal?.toSpawn).toBe(SPAWN.homeDoor);
  });

  it('dispatches Interact(zone) once per entry', () => {
    const first = arrivalCommand(takanawa, [62, 48], null); // zone covers x 61..67, y 48..49
    expect(first.command).toEqual({ type: 'Interact', entityId: ENTITY.stationZone });
    expect(first.zoneId).toBe(ENTITY.stationZone);
    // moving within the zone does not re-fire
    const second = arrivalCommand(takanawa, [63, 48], first.zoneId);
    expect(second.command).toBeNull();
    expect(second.zoneId).toBe(ENTITY.stationZone);
    // leaving then re-entering fires again
    const out = arrivalCommand(takanawa, [60, 48], second.zoneId);
    expect(out.command).toBeNull();
    expect(out.zoneId).toBeNull();
    expect(arrivalCommand(takanawa, [62, 48], out.zoneId).command).not.toBeNull();
  });

  it('does nothing on plain tiles', () => {
    const start = home.spawns[SPAWN.start];
    if (!start) throw new Error('Missing start spawn');
    expect(arrivalCommand(home, start, null)).toEqual({ command: null, portal: null, zoneId: null });
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
