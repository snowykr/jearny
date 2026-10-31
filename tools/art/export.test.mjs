// Proves `npm run art:export` reproduces every runtime sprite from the committed assets/source images.
// Read-only: no writes, no network, no git.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderSprite } from './export.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const META_DIR = join(ROOT, 'assets/source/meta');

const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/source/manifest.json'), 'utf8'));
const manifestById = new Map(manifest.assets.map((entry) => [entry.id, entry]));
const metas = readdirSync(META_DIR)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ file, meta: JSON.parse(readFileSync(join(META_DIR, file), 'utf8')) }));

test('meta fragments and manifest assets are a 1:1 set (no orphan sprite)', () => {
  assert.deepEqual(
    metas.map(({ meta }) => meta.id).sort(),
    [...manifestById.keys()].sort(),
  );
});

for (const { file, meta } of metas) {
  test(`${meta.id}: re-renders public/sprites/${meta.id}.png byte-for-byte`, () => {
    const { spriteBuf, entry } = renderSprite(meta);
    const committedSprite = readFileSync(join(ROOT, 'public/sprites', `${meta.id}.png`));
    assert.deepEqual(spriteBuf, committedSprite, `${file} does not reproduce public/sprites/${meta.id}.png`);

    const committed = manifestById.get(meta.id);
    assert.ok(committed, `${file} has no assets/source/manifest.json entry`);
    assert.equal(entry.spriteSha256, committed.spriteSha256, `${file}: sprite sha256 drifted`);
    assert.equal(entry.sha256, committed.sha256, `${file}: source sha256 drifted`);
  });
}
