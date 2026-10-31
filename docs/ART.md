# Art pipeline: Image Gen 2 only

Every new or regenerated raster asset is made with **Image Gen 2**, and it must match the four source assets we already created in `assets/source/`. Do not use other image models, stock art, or photo pixels.

## The approved style set

The style anchors are these files. Treat them as the ground truth for palette, outline weight, viewing angle and pixel density:

| ID | Source | Runtime size | Status |
|---|---|---|---|
| station | `assets/source/station-v1.png` | 192×128 | needs halo/edge cleanup |
| matsushimaya | `assets/source/matsushimaya-v1.png` | 96×80 | needs grid/palette export |
| home | `assets/source/home-v1.png` | 80×96 | needs grid export |
| liebe | `assets/source/liebe-v1.png` | 80×80 | optional, outside first map |

The original prompts are in `assets/source/prompts.json`. The architecture reference photos are in `research/shops/`.

## Rules for every Image Gen 2 request

1. **Fixing an existing asset → edit, don't regenerate.** Use Image Gen 2 in edit mode with the existing `assets/source/<id>-v1.png` as the input image. Ask only for the fix, e.g. "remove the soft halo, hard transparent edge, keep everything else identical". That way the building we already approved stays the same.
2. **New assets (tiles, characters, interiors, props) → attach style references.** Every request includes at least `station-v1.png` and `matsushimaya-v1.png` as **style reference images**, and states: "Match the palette, outline weight, pixel density and three-quarter top-down angle of the attached reference sprites exactly." If the asset depicts a real place, also attach the matching photo from `research/` as an **architecture reference only**.
3. **Reuse the shared style prefix verbatim.** Start every prompt with:

   > Original Japanese top-down pixel RPG asset visually inspired by Pokemon FireRed's overworld. Orthographic three-quarter TOP-DOWN RPG angle, front facing directly down to player, no isometric diamond or perspective convergence. Chunky deliberate pixels, crisp edges, restrained 24-color palette, dark colored outlines, sun from upper left, simple 3-shade clusters. Transparent background, no floor, no shadow beyond footprint, no text or logos. Readable when scaled down into a 16px-grid game. Match the attached reference sprites exactly in palette, outline and pixel density.

4. **Ask for one asset, or one sheet, per request.** Sheets must state the exact grid. Examples: "4 columns × 4 rows, each cell 16×16 logical px, one tile per cell, no gaps" or "4 directions × 3 walk frames, each cell 16×24".
5. **No real business text, logos or people** on storefronts. Prices and interiors are fictional.

## After generation: deterministic export

Image Gen 2 output is a *source*, not a runtime sprite. Before anything is used in-game:

1. Save the raw output as `assets/source/<id>-v<N>.png`. Never overwrite an earlier version.
2. Add or update `assets/source/meta/<id>.json` with the generator (`"Image Gen 2"`), mode (`edit`/`generate`), the full prompt, the reference images, and the output anchors (`anchors.door`, `anchors.foot`) and `collisionTiles` when the asset is a building. This metadata file is the asset registry.
3. Export to `public/sprites/<id>.png` with `npm run art:export` (`tools/art/`): nearest-neighbour downscale to the runtime size, quantize to the shared palette, hard alpha threshold, no stretching.
4. Do not hand-edit `assets/source/manifest.json`. The exporter derives it from `meta/<id>.json` and the exported sprites (sha256, sizes, status, anchors, collision footprint); an export that fails leaves the manifest untouched.
5. **Review gate:** at 1× and 4× game scale, check exact dimensions, hard transparent edges, a coherent palette, legibility against light and dark ground, and correct anchors. If it fails, iterate with an Image Gen 2 *edit* instead of starting over.

Missing or unapproved assets render as an obvious magenta placeholder in-game. The game never silently shows the wrong art.

## Building collision comes from the art

A building's `collisionTiles` in its meta file is the single source of its collision: the opaque sprite rows (alpha > 0), measured in 16px ground tiles. The map entity's `size` must repeat those tiles and a map test checks it, so transparent padding, roof overhang and base shadow never block walkable ground. `footRow` on the entity is the tile row where the sprite's bottom edge sits; the renderer bottom-aligns the sprite to it and Y-sorts by it, and it defaults to `tile.y + size.y`. When `collisionTiles` is shorter than the sprite, set `footRow` explicitly so the art stays exactly where it was while only the collision shrinks.
