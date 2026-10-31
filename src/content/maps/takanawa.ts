// PLACEHOLDER — issue #4 replaces this with the authored 128×96 map.
// Keeps the right grid, spawns, portals and entity IDs so the game is navigable today.
import { BUILDING, ENTITY, PORTAL, SPAWN } from '../../contracts';
import type { MapDefinition } from '../../contracts';
import { T } from './tiles';
import { makeRoom } from './util';

export const takanawa: MapDefinition = makeRoom({
  id: 'takanawa',
  grid: [128, 96],
  floor: T.GRASS_A,
  wall: T.HEDGE,
  spawns: {
    [SPAWN.homeDoor]: [18, 41],
    [SPAWN.shopDoor]: [16, 17],
    [SPAWN.plaza]: [54, 37],
    [SPAWN.stationDeck]: [64, 50],
  },
  portals: [
    { id: PORTAL.homeDoor, tile: [18, 40], toScene: 'home-interior', toSpawn: SPAWN.entry },
    { id: PORTAL.shopDoor, tile: [16, 16], toScene: 'shop-interior', toSpawn: SPAWN.entry },
    { id: PORTAL.deckUp, tile: [56, 38], toScene: 'takanawa', toSpawn: SPAWN.stationDeck },
    { id: PORTAL.deckDown, tile: [64, 52], toScene: 'takanawa', toSpawn: SPAWN.plaza },
  ],
  entities: [
    { id: ENTITY.stationStaff, kind: 'npc', tile: [66, 50], facing: 'down' },
    { id: ENTITY.stationZone, kind: 'zone', tile: [62, 46], size: [6, 3] },
    { id: BUILDING.station, kind: 'building', tile: [58, 40], size: [12, 8], assetId: 'station' },
    { id: BUILDING.home, kind: 'building', tile: [15, 34], size: [5, 6], assetId: 'home' },
    { id: BUILDING.matsushimaya, kind: 'building', tile: [13, 11], size: [6, 5], assetId: 'matsushimaya' },
  ],
});
