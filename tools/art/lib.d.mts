export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}
export type Rgb = [number, number, number];
export interface AssetMeta {
  id: string;
  kind: 'building' | 'tileset' | 'character';
  source: string;
  runtimeSize?: [number, number];
  sliceX?: number;
  sliceY?: number;
  crop?: [number, number, number, number];
  [extra: string]: unknown;
}

export const CELL: Record<string, [number, number]>;
export const MAX_COLORS: number;
export const ALPHA_THRESHOLD: number;
export const ASPECT_TOLERANCE: number;
export function makeImage(width: number, height: number): RgbaImage;
export function cropImage(img: RgbaImage, rect: [number, number, number, number]): RgbaImage;
export function assertAspect(srcW: number, srcH: number, dstW: number, dstH: number, tolerance?: number): void;
export function resizeNearest(img: RgbaImage, dstW: number, dstH: number): RgbaImage;
export function applyAlphaThreshold(img: RgbaImage, threshold?: number): RgbaImage;
export function buildPalette(img: RgbaImage, maxColors?: number): Rgb[];
export function applyPalette(img: RgbaImage, palette: Rgb[]): RgbaImage;
export function quantize(img: RgbaImage, maxColors?: number): RgbaImage;
export function countColors(img: RgbaImage): number;
export function runtimeSizeFor(meta: AssetMeta): [number, number];
export function processImage(src: RgbaImage, meta: AssetMeta): RgbaImage;
