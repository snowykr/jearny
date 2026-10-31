import { describe, expect, it } from 'vitest';
import { ENTITY, PORTAL } from '../contracts';
import type { CommandPayload, GameSession, GameSnapshot, Outcome } from '../contracts';
import { maps } from '../content/maps';
import { createInputBus } from './input';
import { STEP_SECONDS, walkColumn } from './player';
import { NPC_TURN_SECONDS, createSceneRuntime, spawnFacing, spawnTile } from './scene';
import type { CommandResult } from './scene';

/** Local fixture: the scene runtime only reads `dialogue.status`, so it must not depend on Track B's domain. */
const snapshotWith = (dialogue: GameSnapshot['dialogue']['status']): GameSnapshot => ({
  schemaVersion: 1,
  contentVersion: 'test',
  sessionId: 't',
  revision: 0,
  sceneId: 'takanawa',
  spawnId: 'home-door',
  inventory: {},
  walletYen: 0,
  quests: {},
  flags: {},
  dialogue: { status: dialogue, nodeId: null, speakerId: null },
  cosmetics: [],
  settings: { volume: 1, muted: true, textSize: 'normal', inputMode: 'keyboard' },
});

function fakeSession(opts: { reject?: boolean; dialogue?: GameSnapshot['dialogue']['status'] } = {}) {
  const sent: CommandPayload[] = [];
  const snap = snapshotWith('closed');
  const session = {
    get snapshot() {
      return { ...snap, dialogue: { ...snap.dialogue, status: opts.dialogue ?? 'closed' } };
    },
    async dispatch(payload: CommandPayload): Promise<Outcome> {
      sent.push(payload);
      return opts.reject ? { ok: false, reason: 'not_available', snapshot: snap } : { ok: true, snapshot: snap, effects: [] };
    },
  } as unknown as GameSession;
  return { session, sent, setDialogue: (s: GameSnapshot['dialogue']['status']) => (opts.dialogue = s) };
}

const setup = (sceneId: keyof typeof maps, spawnId: string, f = fakeSession()) => {
  const bus = createInputBus();
  const results: CommandResult[] = [];
  const rt = createSceneRuntime({ map: maps[sceneId], spawnId, session: f.session, bus, onResult: (r) => results.push(r) });
  return { rt, bus, f, results };
};

/** Run frames until the in-flight step lands (plus the one-frame gap). */
const tick = (rt: ReturnType<typeof setup>['rt'], seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) rt.update(dt);
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('scene runtime', () => {
  it('spawns at the spawn tile facing away from a nearby portal', () => {
    const { rt } = setup('takanawa', 'home-door');
    expect(rt.player.tile).toEqual(spawnTile(maps.takanawa, 'home-door'));
    expect(rt.player.facing).toBe('down');
    expect(spawnFacing(maps['home-interior'], [8, 10])).toBe('up');
  });

  it('walks one tile per step while a direction is held, and stops on release', () => {
    const { rt, bus } = setup('home-interior', 'start'); // [8,6]
    bus.press('right');
    tick(rt, 0.5); // turn delay (~0.08s) then ~2 steps
    bus.release('right');
    tick(rt, 0.3);
    expect(rt.player.to).toBeNull();
    expect(rt.player.tile[0]).toBeGreaterThanOrEqual(10);
    expect(rt.player.tile[1]).toBe(6);
  });

  it('a tap only turns without moving', () => {
    const { rt, bus } = setup('home-interior', 'start');
    bus.press('left');
    bus.release('left');
    tick(rt, 0.3);
    expect(rt.player.facing).toBe('left');
    expect(rt.player.tile).toEqual([8, 6]);
  });

  it('does not walk into walls or NPCs', () => {
    const { rt, bus } = setup('home-interior', 'start');
    bus.press('up');
    tick(rt, 3);
    expect(rt.player.tile).toEqual([8, 1]); // stopped by the wall row
    bus.release('up');
    // guide stands at [5,4]: walk into it from the right along y=4
    rt.player.tile = [7, 4];
    rt.player.facing = 'left';
    bus.press('left');
    tick(rt, 2);
    expect(rt.player.tile).toEqual([6, 4]);
  });

  it('ignores movement and interact while the dialogue is open', () => {
    const f = fakeSession({ dialogue: 'showing' });
    const { rt, bus } = setup('home-interior', 'start', f);
    bus.press('right');
    bus.press('interact');
    tick(rt, 0.6);
    expect(rt.player.tile).toEqual([8, 6]);
    expect(f.sent).toHaveLength(0);
  });

  it('interact dispatches Interact for the faced NPC', async () => {
    const f = fakeSession();
    const { rt, bus } = setup('home-interior', 'start', f);
    rt.player.tile = [5, 5];
    rt.player.facing = 'up';
    bus.press('interact');
    await flush();
    expect(f.sent).toEqual([{ type: 'Interact', entityId: ENTITY.guide }]);
  });

  it('stepping onto a portal dispatches UsePortal once', async () => {
    const { rt, bus, results } = setup('home-interior', 'entry'); // [8,9], portal at [8,11]
    bus.press('down');
    tick(rt, 0.8);
    await flush();
    expect(results.map((r) => r.payload)).toEqual([{ type: 'UsePortal', portalId: PORTAL.homeExit }]);
    expect(results[0]?.portal?.toScene).toBe('takanawa');
  });

  it('a rejected outcome bumps and does not move the player', async () => {
    const f = fakeSession({ reject: true });
    const { rt, bus } = setup('home-interior', 'start', f);
    rt.player.tile = [5, 5];
    rt.player.facing = 'up';
    bus.press('interact');
    await flush();
    rt.update(0.02);
    expect(rt.bumpOffset()).not.toEqual([0, 0]);
    expect(rt.player.tile).toEqual([5, 5]);
    tick(rt, 0.5);
    expect(rt.bumpOffset()).toEqual([0, 0]);
  });

  it('entering the station zone dispatches Interact(zone) once per entry', async () => {
    const f = fakeSession();
    const { rt, bus } = setup('takanawa', 'station-deck', f); // zone covers x 61..67, y 48..49; the station building blocks y<=47
    rt.player.tile = [64, 50];
    rt.player.facing = 'up';
    bus.press('up');
    tick(rt, 0.3); // y 49 enters the zone; the in-flight dispatch pauses walking
    await flush();
    tick(rt, 0.5); // y 48 is still inside the zone (no re-fire); 47 is the building
    expect(f.sent).toEqual([{ type: 'Interact', entityId: ENTITY.stationZone }]);
    bus.release('up');
    expect(rt.player.tile[1]).toBe(48);
  });

  it('leaks no listeners after 10 scene changes', () => {
    const bus = createInputBus();
    const f = fakeSession();
    let alive = 0;
    const orig = bus.onPress.bind(bus);
    bus.onPress = (cb) => {
      alive++;
      const off = orig(cb);
      return () => {
        alive--;
        off();
      };
    };
    for (let i = 0; i < 10; i++) {
      const rt = createSceneRuntime({ map: maps['home-interior'], spawnId: 'start', session: f.session, bus, onResult: () => {} });
      expect(alive).toBe(1);
      rt.dispose();
      expect(rt.activeListeners).toBe(0);
      expect(alive).toBe(0);
    }
    // a disposed runtime ignores late input
    bus.press('interact');
    expect(f.sent).toHaveLength(0);
  });

  describe('NPC facing', () => {
    const talk = async (f: ReturnType<typeof fakeSession>) => {
      const s = setup('home-interior', 'start', f);
      s.rt.player.tile = [5, 5];
      s.rt.player.facing = 'up'; // guide at [5,4]
      s.bus.press('interact');
      await flush();
      return s;
    };

    it('the NPC turns to face the player on interact and the player state is untouched', async () => {
      const { rt } = await talk(fakeSession());
      expect(rt.npcFacing(ENTITY.guide)).toBe('down');
      expect(rt.player.tile).toEqual([5, 5]);
      expect(rt.npcFacing(ENTITY.stationStaff)).toBeNull();
    });

    it('turns toward the player from any side', async () => {
      const f = fakeSession();
      const { rt, bus } = setup('home-interior', 'start', f);
      rt.player.tile = [6, 4]; // guide at [5,4] is to the player's left
      rt.player.facing = 'left';
      bus.press('interact');
      await flush();
      expect(rt.npcFacing(ENTITY.guide)).toBe('right');
    });

    it('turns back after 2 s when no dialogue opened', async () => {
      const { rt } = await talk(fakeSession());
      tick(rt, NPC_TURN_SECONDS - 0.2);
      expect(rt.npcFacing(ENTITY.guide)).toBe('down');
      tick(rt, 0.5);
      expect(rt.npcFacing(ENTITY.guide)).toBeNull();
    });

    it('keeps facing while the dialogue is open, even past 2 s, and turns back when it closes', async () => {
      const f = fakeSession();
      const { rt } = await talk(f);
      f.setDialogue('showing');
      tick(rt, NPC_TURN_SECONDS + 1);
      expect(rt.npcFacing(ENTITY.guide)).toBe('down');
      f.setDialogue('closed');
      tick(rt, 0.05);
      expect(rt.npcFacing(ENTITY.guide)).toBeNull();
    });

    it('does not turn for non-NPC interactions', async () => {
      const f = fakeSession();
      const { rt, bus } = setup('takanawa', 'station-deck', f);
      rt.player.tile = [64, 50];
      rt.player.facing = 'up';
      bus.press('up');
      tick(rt, 0.3);
      await flush();
      expect(rt.npcFacing(ENTITY.stationZone)).toBeNull();
    });
  });

  describe('walk cycle', () => {
    it('plays stepA, idle, stepB, idle over two tiles and idles when stopped', () => {
      const at = (parity: 0 | 1, progress: number) => walkColumn({ to: [1, 1], progress, parity });
      expect([at(0, 0.1), at(0, 0.7), at(1, 0.1), at(1, 0.7)]).toEqual([1, 0, 2, 0]);
      expect(walkColumn({ to: null, progress: 0, parity: 1 })).toBe(0);
    });
  });
});
