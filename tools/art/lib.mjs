// Pure, deterministic image helpers for tools/art/export.mjs.
// An "image" is { width, height, data } where data is RGBA bytes (Uint8Array/Buffer), row-major.

export const CELL = { tileset: [16, 16], character: [16, 24] };
export const DEFAULT_SLICES = { character: [3, 4] };
export const MAX_COLORS = 24;
export const ALPHA_THRESHOLD = 128;
export const ASPECT_TOLERANCE = 0.02;

export function makeImage(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Copy the rect [x, y, w, h] out of img. The rect must lie inside the image. */
export function cropImage(img, [x, y, w, h]) {
  if (![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1 || x < 0 || y < 0 || x + w > img.width || y + h > img.height) {
    throw new Error(`crop [${x},${y},${w},${h}] is outside the ${img.width}x${img.height} source`);
  }
  const out = makeImage(w, h);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * img.width + x) * 4;
    out.data.set(img.data.subarray(from, from + w * 4), row * w * 4);
  }
  return out;
}

/** Throws when scaling srcW×srcH to dstW×dstH would change the aspect ratio by more than `tolerance`. */
export function assertAspect(srcW, srcH, dstW, dstH, tolerance = ASPECT_TOLERANCE) {
  const src = srcW / srcH;
  const dst = dstW / dstH;
  const drift = Math.abs(src - dst) / dst;
  if (!(drift <= tolerance)) {
    throw new Error(
      `aspect ratio would be stretched: ${srcW}x${srcH} (${src.toFixed(4)}) -> ${dstW}x${dstH} (${dst.toFixed(4)}), drift ${(drift * 100).toFixed(2)}% > ${tolerance * 100}%`,
    );
  }
}

/** Nearest-neighbour resize, sampling the centre of each destination pixel's source footprint. */
export function resizeNearest(img, dstW, dstH) {
  if (!Number.isInteger(dstW) || !Number.isInteger(dstH) || dstW < 1 || dstH < 1) {
    throw new Error(`invalid target size ${dstW}x${dstH}`);
  }
  const out = makeImage(dstW, dstH);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / dstW));
      const s = (sy * img.width + sx) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * dstW + x) * 4);
    }
  }
  return out;
}

/** Hard alpha: alpha >= threshold becomes 255, anything else becomes fully transparent black. In place. */
export function applyAlphaThreshold(img, threshold = ALPHA_THRESHOLD) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] >= threshold) {
      d[i + 3] = 255;
    } else {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
    }
  }
  return img;
}

const key = (r, g, b) => (r << 16) | (g << 8) | b;

/** Weighted median-cut palette over the opaque pixels. Returns at most `maxColors` [r,g,b] entries, sorted. */
export function buildPalette(img, maxColors = MAX_COLORS) {
  const counts = new Map();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const k = key(d[i], d[i + 1], d[i + 2]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const colors = [...counts].map(([k, n]) => ({ r: k >> 16, g: (k >> 8) & 255, b: k & 255, n }));
  if (colors.length === 0) return [];
  if (colors.length <= maxColors) return colors.map(({ r, g, b }) => [r, g, b]).sort(cmpRgb);

  const boxes = [colors];
  while (boxes.length < maxColors) {
    // Split the box with the largest (extent × population) that still has >1 colour.
    let best = -1;
    let bestScore = -1;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const { extent } = boxExtent(box);
      const score = extent * box.reduce((s, c) => s + c.n, 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0) break;
    const box = boxes[best];
    const { channel } = boxExtent(box);
    box.sort((a, b) => a[channel] - b[channel] || a.r - b.r || a.g - b.g || a.b - b.b);
    const total = box.reduce((s, c) => s + c.n, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.length - 1; i++) {
      acc += box[i].n;
      cut = i + 1;
      if (acc * 2 >= total) break;
    }
    boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes
    .map((box) => {
      const total = box.reduce((s, c) => s + c.n, 0);
      const avg = (ch) => Math.round(box.reduce((s, c) => s + c[ch] * c.n, 0) / total);
      return [avg('r'), avg('g'), avg('b')];
    })
    .sort(cmpRgb)
    .filter((c, i, all) => i === 0 || cmpRgb(c, all[i - 1]) !== 0);
}

function boxExtent(box) {
  let best = { channel: 'r', extent: -1 };
  for (const channel of ['r', 'g', 'b']) {
    let lo = 255;
    let hi = 0;
    for (const c of box) {
      if (c[channel] < lo) lo = c[channel];
      if (c[channel] > hi) hi = c[channel];
    }
    if (hi - lo > best.extent) best = { channel, extent: hi - lo };
  }
  return best;
}

const cmpRgb = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Snap every opaque pixel to its nearest palette colour (ties go to the earlier entry). In place. */
export function applyPalette(img, palette) {
  const d = img.data;
  const cache = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const k = key(d[i], d[i + 1], d[i + 2]);
    let hit = cache.get(k);
    if (hit === undefined) {
      let bestDist = Infinity;
      hit = 0;
      palette.forEach((p, idx) => {
        const dist = (p[0] - d[i]) ** 2 + (p[1] - d[i + 1]) ** 2 + (p[2] - d[i + 2]) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          hit = idx;
        }
      });
      cache.set(k, hit);
    }
    const p = palette[hit];
    d[i] = p[0];
    d[i + 1] = p[1];
    d[i + 2] = p[2];
  }
  return img;
}

/** Quantize to at most `maxColors` colours. In place; returns the image. */
export function quantize(img, maxColors = MAX_COLORS) {
  return applyPalette(img, buildPalette(img, maxColors));
}

export function countColors(img) {
  const seen = new Set();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] !== 0) seen.add(key(d[i], d[i + 1], d[i + 2]));
  return seen.size;
}

/** Final sprite size for a meta fragment: explicit runtimeSize, or cells × cell size for sheets. */
export function runtimeSizeFor(meta) {
  const kind = meta.kind;
  if (kind === 'building') {
    if (!Array.isArray(meta.runtimeSize)) throw new Error(`${meta.id}: building needs runtimeSize [w,h]`);
    return [...meta.runtimeSize];
  }
  if (kind !== 'tileset' && kind !== 'character') throw new Error(`${meta.id}: unknown kind "${kind}"`);
  const [defX, defY] = DEFAULT_SLICES[kind] ?? [];
  const sliceX = meta.sliceX ?? defX;
  const sliceY = meta.sliceY ?? defY;
  if (!Number.isInteger(sliceX) || !Number.isInteger(sliceY)) throw new Error(`${meta.id}: ${kind} needs sliceX and sliceY`);
  const [cw, ch] = CELL[kind];
  const size = [sliceX * cw, sliceY * ch];
  if (meta.runtimeSize && (meta.runtimeSize[0] !== size[0] || meta.runtimeSize[1] !== size[1])) {
    throw new Error(`${meta.id}: runtimeSize ${meta.runtimeSize} != ${sliceX}x${sliceY} cells of ${cw}x${ch} = ${size}`);
  }
  return size;
}

/** Full pipeline on a decoded source image: crop -> aspect guard -> resize -> hard alpha -> quantize. */
export function processImage(src, meta) {
  const [w, h] = runtimeSizeFor(meta);
  const cropped = meta.crop ? cropImage(src, meta.crop) : src;
  assertAspect(cropped.width, cropped.height, w, h);
  const out = resizeNearest(cropped, w, h);
  applyAlphaThreshold(out);
  quantize(out);
  return out;
}
