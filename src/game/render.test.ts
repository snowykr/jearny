import { describe, expect, it } from 'vitest';
import { footAnchoredOrigin } from './render';

describe('footAnchoredOrigin', () => {
  it('puts a 16×20 cell bottom-centre on the tile bottom edge', () => {
    expect(footAnchoredOrigin(32, 64, 16, 16, 20)).toEqual([32, 44]);
  });

  it('puts a legacy 16×24 cell on the same feet line, 4 px taller', () => {
    expect(footAnchoredOrigin(32, 64, 16, 16, 24)).toEqual([32, 40]);
    const a = footAnchoredOrigin(32, 64, 16, 16, 20);
    const b = footAnchoredOrigin(32, 64, 16, 16, 24);
    expect(a[1] + 20).toBe(b[1] + 24);
  });

  it('centres cells narrower or wider than a tile and stays on integers', () => {
    expect(footAnchoredOrigin(32, 64, 16, 12, 20)).toEqual([34, 44]);
    expect(footAnchoredOrigin(32, 64, 16, 20, 24)).toEqual([30, 40]);
    const [x, y] = footAnchoredOrigin(32, 64, 16, 15, 19);
    expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
  });
});
