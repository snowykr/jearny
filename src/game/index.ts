// Track A owns src/game/. KAPLAY renders and reads input; it never owns quest state.
// PLACEHOLDER: gray-box map + grid-walking square + camera follow.
import kaplay from 'kaplay';
import type { GameSession, MapDefinition } from '../contracts';
import { maps } from '../content/maps';

export const VIEW_W = 240;
export const VIEW_H = 160;

export function startGame(canvas: HTMLCanvasElement, session: GameSession): void {
  const k = kaplay({
    global: false,
    canvas,
    width: VIEW_W,
    height: VIEW_H,
    letterbox: true,
    crisp: true,
    background: [24, 24, 32],
  });

  k.scene('map', (map: MapDefinition) => {
    const ts = map.tileSize;
    const [cols, rows] = map.grid;
    const blocked = (x: number, y: number) =>
      x < 0 || y < 0 || x >= cols || y >= rows || map.collision[y * cols + x] === 1;

    k.onDraw(() => {
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
          k.drawRect({ pos: k.vec2(x * ts, y * ts), width: ts, height: ts, color: blocked(x, y) ? k.rgb(70, 70, 90) : k.rgb(150, 170, 130) });
    });

    let tile = map.spawns[session.snapshot.spawnId] ?? Object.values(map.spawns)[0] ?? [1, 1];
    const player = k.add([k.rect(ts, ts), k.color(230, 80, 80), k.pos(tile[0] * ts, tile[1] * ts), k.z(10)]);

    const step = (dx: number, dy: number) => {
      const next: [number, number] = [tile[0] + dx, tile[1] + dy];
      if (blocked(...next)) return;
      tile = next;
      player.pos = k.vec2(tile[0] * ts, tile[1] * ts);
    };
    k.onKeyPress('left', () => step(-1, 0));
    k.onKeyPress('right', () => step(1, 0));
    k.onKeyPress('up', () => step(0, -1));
    k.onKeyPress('down', () => step(0, 1));
    k.onKeyPress('space', () => void session.dispatch({ type: 'Interact', entityId: 'debug' }));

    k.onUpdate(() => k.setCamPos(player.pos.add(ts / 2, ts / 2)));
  });

  k.go('map', maps[session.snapshot.sceneId]);
}
