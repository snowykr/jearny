#!/usr/bin/env node
// Deterministic sprite export: assets/source/meta/*.json (+ legacy manifest entries) -> public/sprites/<id>.png
// and a regenerated assets/source/manifest.json. See docs/ART.md "After generation".
//
//   node tools/art/export.mjs            export everything
//   node tools/art/export.mjs station    export only the listed ids (manifest keeps the other entries)
//
// Importing this module only exposes renderSprite(meta); the CLI runs when the file is executed directly.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { countColors, processImage, runtimeSizeFor } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const META_DIR = join(ROOT, 'assets/source/meta');
const MANIFEST = join(ROOT, 'assets/source/manifest.json');
const SPRITES = join(ROOT, 'public/sprites');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function decodePng(buf) {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

function encodePng(img) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png, { deflateLevel: 9, filterType: -1 });
}

/** Meta fragments by id, plus legacy manifest entries (pre-meta format) for ids without a fragment. */
function loadMetas() {
  const metas = new Map();
  const legacy = existsSync(MANIFEST) ? readJson(MANIFEST).assets ?? [] : [];
  for (const e of legacy) {
    if (e.kind) continue; // already in the new format; its meta fragment is the source of truth
    metas.set(e.id, {
      id: e.id,
      kind: 'building',
      source: e.source,
      runtimeSize: e.proposedRuntimeSize,
      status: 'draft',
      notes: `legacy status: ${e.status}`,
    });
  }
  const files = existsSync(META_DIR) ? readdirSync(META_DIR).filter((f) => f.endsWith('.json')).sort() : [];
  for (const f of files) {
    const meta = readJson(join(META_DIR, f));
    if (!meta.id || f !== `${meta.id}.json`) throw new Error(`${f}: "id" must match the file name`);
    metas.set(meta.id, meta);
  }
  return metas;
}

/** Run the pipeline for one meta fragment without writing: returns the encoded sprite and its manifest entry. */
export function renderSprite(meta) {
  const sourcePath = join(ROOT, meta.source);
  if (!existsSync(sourcePath)) throw new Error(`source not found: ${meta.source}`);
  const sourceBuf = readFileSync(sourcePath);
  const src = decodePng(sourceBuf);
  const out = processImage(src, meta);
  const spriteBuf = encodePng(out);
  const entry = {
    id: meta.id,
    kind: meta.kind,
    source: meta.source,
    sha256: sha256(sourceBuf),
    sourceSize: [src.width, src.height],
    ...(meta.crop ? { crop: meta.crop } : {}),
    runtimeSize: runtimeSizeFor(meta),
    ...(meta.sliceX ? { sliceX: meta.sliceX } : {}),
    ...(meta.sliceY ? { sliceY: meta.sliceY } : {}),
    sprite: `public/sprites/${meta.id}.png`,
    spriteSha256: sha256(spriteBuf),
    colors: countColors(out),
    alpha: true,
    status: meta.status ?? 'draft',
    anchors: meta.anchors ?? {},
    ...(meta.collisionTiles ? { collisionTiles: meta.collisionTiles } : {}),
    ...(meta.generator ? { generator: meta.generator } : {}),
    ...(meta.mode ? { mode: meta.mode } : {}),
    ...(meta.notes ? { notes: meta.notes } : {}),
  };
  return { spriteBuf, entry };
}

function exportAsset(meta) {
  const { spriteBuf, entry } = renderSprite(meta);
  mkdirSync(SPRITES, { recursive: true });
  writeFileSync(join(SPRITES, `${meta.id}.png`), spriteBuf);
  return entry;
}

function main() {
  const only = new Set(process.argv.slice(2));
  const metas = loadMetas();
  for (const id of only) if (!metas.has(id)) throw new Error(`unknown asset id: ${id}`);

  const previous = new Map((existsSync(MANIFEST) ? readJson(MANIFEST).assets ?? [] : []).filter((e) => e.kind).map((e) => [e.id, e]));
  const entries = new Map();
  const failures = [];
  for (const [id, meta] of [...metas].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (only.size && !only.has(id)) {
      if (previous.has(id)) entries.set(id, previous.get(id));
      continue;
    }
    try {
      entries.set(id, exportAsset(meta));
      console.log(`ok   ${id}`);
    } catch (err) {
      failures.push(id);
      console.error(`FAIL ${id}: ${err.message}`);
    }
  }
  if (failures.length) {
    console.error(`${failures.length} asset(s) failed; manifest not updated.`);
    process.exit(1);
  }
  const manifest = { version: 2, stage: 'exported_runtime_sprites', assets: [...entries.values()] };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
