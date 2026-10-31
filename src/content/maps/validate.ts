import { BUILDING, ENTITY, SPAWN } from '../../contracts';
import type { MapDefinition, SceneId, Tile } from '../../contracts';
import { isBlocked } from '../../game/interaction';
import { T, TILESET_FOR_SCENE, TILESETS } from './tiles';

type MapRegistry = Partial<Record<SceneId, MapDefinition>>;

const entityIds = new Set<string>([...Object.values(ENTITY), ...Object.values(BUILDING)]);
const blockedGround = new Set<number>([
  T.RAIL_H, T.RAIL_V, T.ROAD, T.ROAD_EDGE_N, T.ROAD_EDGE_S, T.ROAD_EDGE_E, T.ROAD_EDGE_W,
]);
const connections = [SPAWN.homeDoor, SPAWN.shopDoor, SPAWN.plaza, SPAWN.stationDeck];

function inBounds(map: MapDefinition, [x, y]: Tile): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.grid[0] && y < map.grid[1];
}

function walkable(map: MapDefinition, tile: Tile): boolean {
  // Same rule the player walks by: grid collision plus non-building entity blocking.
  return !isBlocked(map, tile);
}

export function validateMaps(registry: MapRegistry): string[] {
  const errors: string[] = [];
  for (const map of Object.values(registry)) {
    const report = (message: string) => errors.push(`${map.id}: ${message}`);
    const [cols, rows] = map.grid;
    const count = cols * rows;
    const sheet = TILESETS[TILESET_FOR_SCENE[map.id]];
    for (const [name, layer] of Object.entries(map.layers)) {
      if (layer.length !== count) report(`${name} length must be ${count}`);
      layer.forEach((tile, index) => {
        if (!Number.isInteger(tile) || tile < -1 || tile >= sheet.cols * sheet.rows)
          report(`${name}[${index}] tile index ${tile} is outside tileset`);
      });
    }
    if (map.collision.length !== count) report(`collision length must be ${count}`);
    map.collision.forEach((cell, index) => {
      if (cell !== 0 && cell !== 1) report(`collision[${index}] must be 0 or 1`);
    });
    for (const [name, tile] of Object.entries(map.spawns)) {
      if (!inBounds(map, tile)) report(`spawn ${name} is outside bounds`);
    }
    for (const entity of map.entities) {
      if (!entityIds.has(entity.id)) report(`unknown entity ${entity.id}`);
    }
    const portalTiles = new Set<string>();
    for (const portal of map.portals) {
      const key = portal.tile.join(',');
      if (portalTiles.has(key)) report(`duplicate portal tile ${key}`);
      portalTiles.add(key);
      if (!walkable(map, portal.tile)) report(`portal ${portal.id} tile is not walkable`);
      const target = registry[portal.toScene];
      if (!target) report(`portal ${portal.id} targets missing scene ${portal.toScene}`);
      else {
        const spawn = target.spawns[portal.toSpawn];
        if (!spawn) report(`portal ${portal.id} targets missing spawn ${portal.toSpawn}`);
        else if (!walkable(target, spawn)) report(`portal ${portal.id} target spawn ${portal.toSpawn} is not walkable`);
      }
    }
    if (map.id !== 'takanawa') continue;
    map.layers.ground.forEach((tile, index) => {
      if (blockedGround.has(tile) && map.collision[index] !== 1)
        report(`rail/road cell ${index} must be blocked`);
      if ((tile === T.CROSSING_H || tile === T.CROSSING_V) && !walkable(map, [index % cols, Math.floor(index / cols)]))
        report(`crossing cell ${index} must be walkable`);
    });
    for (const name of connections) {
      if (!map.spawns[name]) report(`missing required spawn ${name}`);
    }
    for (const source of connections) {
      const start = map.spawns[source];
      const queue: Tile[] = start && walkable(map, start) ? [start] : [];
      const visited = new Set(queue.map((tile) => tile.join(',')));
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = queue[cursor];
        if (!current) continue;
        const [x, y] = current;
        const neighbors: Tile[] = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const portal of map.portals) {
          if (portal.toScene === map.id && portal.tile[0] === x && portal.tile[1] === y) {
            const spawn = map.spawns[portal.toSpawn];
            if (spawn) neighbors.push(spawn);
          }
        }
        for (const tile of neighbors) {
          const key = tile.join(',');
          if (walkable(map, tile) && !visited.has(key)) {
            visited.add(key);
            queue.push(tile);
          }
        }
      }
      for (const name of connections) {
        const spawn = map.spawns[name];
        if (spawn && !visited.has(spawn.join(','))) report(`required spawn ${name} is disconnected from ${source}`);
      }
    }
  }
  return errors;
}
