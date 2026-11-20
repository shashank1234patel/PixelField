import type { FacingDir } from '../shared/protocol.ts';
import { GroundTile, type HatStyle, ObjectTile, TILE_SIZE } from '../shared/tiles.ts';

function createTileCanvas(w = TILE_SIZE, h = TILE_SIZE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export interface SpriteAtlas {
  ground: Map<number, HTMLCanvasElement[]>;
  objects: Map<number, HTMLCanvasElement>;
  waterFrames: HTMLCanvasElement[];
}

let cachedAtlas: SpriteAtlas | null = null;
const swatchCache = new Map<string, string>();

function makeGrassVariant(variant: number, withFlowers: boolean): HTMLCanvasElement {
  const [c, ctx] = createTileCanvas();
  // Lush sunlit meadow green base
  px(ctx, 0, 0, 24, 24, '#6FA34B');
  // Subtle organic dither patches
  const patchColor = variant % 2 === 0 ? '#679B44' : '#78AD52';
  px(ctx, (variant * 5) % 16, (variant * 7) % 16, 6, 4, patchColor);
  px(ctx, (variant * 11 + 4) % 18, (variant * 3 + 10) % 18, 5, 3, '#7CB256');

  // Crisp grass blades
  const blades: Array<[number, number]> = [
    [(3 + variant * 4) % 20, (4 + variant * 5) % 19],
    [(14 + variant * 3) % 20, (12 + variant * 7) % 19],
    [(8 + variant * 6) % 20, (18 + variant * 2) % 20],
  ];
  for (const [bx, by] of blades) {
    px(ctx, bx, by, 1, 2, '#4F7E34');
    px(ctx, bx + 1, by - 1, 1, 2, '#5C8D3E');
    px(ctx, bx + 2, by, 1, 2, '#86BE60');
  }

  if (withFlowers) {
    const flowerColors = ['#F8F9FA', '#F6C945', '#E8837C', '#8ECAE6'];
    const c1 = flowerColors[variant % flowerColors.length];
    const c2 = flowerColors[(variant + 2) % flowerColors.length];
    px(ctx, 5, 7, 2, 2, c1);
    px(ctx, 6, 8, 1, 1, '#E9B949');
    px(ctx, 16, 15, 2, 2, c2);
    px(ctx, 17, 16, 1, 1, '#FFF3B0');
    px(ctx, 14, 5, 2, 1, '#F8F9FA');
  }
  return c;
}

function makeStonePath(variant: number): HTMLCanvasElement {
  const [c, ctx] = createTileCanvas();
  // Warm mortar bed
  px(ctx, 0, 0, 24, 24, '#7E827D');
  const stones = [
    [1, 1, 10, 6, '#A3A8A2', '#BCC1BB', '#6A6F6A'],
    [12, 1, 11, 7, '#999E98', '#B1B6B0', '#676C67'],
    [1, 8, 7, 7, '#9DA29C', '#B4B9B3', '#686D68'],
    [9, 9, 10, 6, '#A7ACA6', '#C0C5BF', '#6E736E'],
    [20, 9, 3, 7, '#949993', '#ACB1AB', '#646964'],
    [1, 16, 11, 7, '#9BA09A', '#B3B8B2', '#686D68'],
    [13, 16, 10, 7, '#A4A9A3', '#BDC2BC', '#6B706B'],
  ] as const;

  for (const [x, y, w, h, base, hi, sh] of stones) {
    const ox = variant === 1 ? (x + 2) % 21 : x;
    const drawW = Math.min(w, 23 - ox);
    px(ctx, ox, y, drawW, h, base);
    px(ctx, ox + 1, y, Math.max(1, drawW - 2), 1, hi);
    px(ctx, ox, y + h - 1, drawW, 1, sh);
  }
  return c;
}

function makePlazaStone(): HTMLCanvasElement {
  const [c, ctx] = createTileCanvas();
  px(ctx, 0, 0, 24, 24, '#8A8F88');
  // Dressed large square flagstone
  px(ctx, 1, 1, 10, 10, '#B2B7AF');
  px(ctx, 1, 1, 10, 1, '#CBD0C8');
  px(ctx, 1, 10, 10, 1, '#797E77');
  px(ctx, 12, 1, 11, 10, '#AAB0A7');
  px(ctx, 12, 1, 11, 1, '#C5CAC2');
  px(ctx, 1, 12, 11, 11, '#A9AFA6');
  px(ctx, 1, 12, 11, 1, '#C3C8C0');
  px(ctx, 13, 12, 10, 11, '#B4B9B1');
  px(ctx, 13, 12, 10, 1, '#CDD2CA');
  // Subtle mossy seam speck
  px(ctx, 11, 11, 2, 2, '#6A8E4E');
  return c;
}

function makeDirtSoil(): HTMLCanvasElement {
  const [c, ctx] = createTileCanvas();
  px(ctx, 0, 0, 24, 24, '#7E5636');
  // Tilled garden furrows
  for (let y = 2; y < 24; y += 5) {
    px(ctx, 1, y, 22, 2, '#694427');
    px(ctx, 1, y + 2, 22, 1, '#946845');
  }
  px(ctx, 5, 4, 2, 1, '#58371E');
  px(ctx, 17, 14, 2, 1, '#58371E');
  return c;
}

function makeWoodFloor(): HTMLCanvasElement {
  const [c, ctx] = createTileCanvas();
  px(ctx, 0, 0, 24, 24, '#A47148');
  for (let y = 0; y < 24; y += 6) {
    px(ctx, 0, y, 24, 1, '#6E472B');
    px(ctx, 0, y + 1, 24, 1, '#BC875B');
    const seam = (y * 3 + 7) % 20;
    px(ctx, seam, y + 1, 1, 5, '#6E472B');
    px(ctx, seam + 2, y + 3, 1, 1, '#56341D');
  }
  return c;
}

function makeSandShore(): HTMLCanvasElement {
  const [c, ctx] = createTileCanvas();
  px(ctx, 0, 0, 24, 24, '#D9C38C');
  px(ctx, 3, 4, 4, 2, '#E6D4A3');
  px(ctx, 14, 10, 5, 2, '#C7B079');
  px(ctx, 7, 17, 3, 2, '#B69D67');
  px(ctx, 18, 19, 2, 2, '#8F968E'); // shore pebble
  px(ctx, 4, 13, 2, 1, '#969C94');
  return c;
}

function makeWaterFrame(frame: number): HTMLCanvasElement {
  const [c, ctx] = createTileCanvas();
  px(ctx, 0, 0, 24, 24, '#2E86AB');
  px(ctx, 0, 0, 24, 6, '#338FB5');
  px(ctx, 0, 14, 24, 10, '#287A9D');
  const shift = frame * 3;
  // Crisp sparkling ripples
  px(ctx, (3 + shift) % 20, 5, 5, 1, '#6CC4E0');
  px(ctx, (4 + shift) % 20, 6, 3, 1, '#B3E8F7');
  px(ctx, (13 - shift + 24) % 19, 13, 6, 1, '#6CC4E0');
  px(ctx, (6 + shift) % 19, 19, 4, 1, '#5DB8D6');
  return c;
}

function makeObjectSprite(tile: ObjectTile): HTMLCanvasElement {
  const [c, ctx] = createTileCanvas();
  switch (tile) {
    case ObjectTile.WOOD_WALL: {
      // Cozy timber-framed plaster & oak wall
      px(ctx, 0, 0, 24, 24, '#E8DCC4');
      px(ctx, 0, 0, 24, 3, '#6F492C');
      px(ctx, 0, 21, 24, 3, '#5C3B22');
      px(ctx, 0, 0, 3, 24, '#6F492C');
      px(ctx, 21, 0, 3, 24, '#5C3B22');
      px(ctx, 0, 11, 24, 2, '#7D5434');
      // Cozy paned cottage window
      px(ctx, 7, 5, 10, 8, '#4E3420');
      px(ctx, 8, 6, 8, 6, '#87B5C9');
      px(ctx, 9, 7, 2, 2, '#CBE7F2');
      px(ctx, 11, 6, 2, 6, '#4E3420');
      px(ctx, 8, 8, 8, 1, '#4E3420');
      // Stone foundation plinth
      px(ctx, 0, 19, 24, 5, '#7E8480');
      px(ctx, 2, 20, 6, 3, '#9BA19C');
      px(ctx, 11, 20, 8, 3, '#919792');
      break;
    }
    case ObjectTile.STONE_WALL: {
      px(ctx, 0, 0, 24, 24, '#666E70');
      for (let row = 0; row < 4; row++) {
        const y = row * 6;
        const offset = (row % 2) * 5;
        for (let col = -1; col < 3; col++) {
          const x = col * 11 + offset;
          px(ctx, x + 1, y + 1, 9, 4, row % 2 === 0 ? '#90999C' : '#858E91');
          px(ctx, x + 1, y + 1, 9, 1, '#ADB6B8');
        }
      }
      // Small arched window
      px(ctx, 8, 6, 8, 8, '#3B4245');
      px(ctx, 9, 7, 6, 6, '#F2C572');
      px(ctx, 11, 7, 2, 6, '#3B4245');
      break;
    }
    case ObjectTile.ROOF_TERRACOTTA: {
      px(ctx, 0, 0, 24, 24, '#9B4229');
      for (let row = 0; row < 4; row++) {
        const y = row * 6;
        px(ctx, 0, y, 24, 5, row % 2 === 0 ? '#C45B3B' : '#B54F32');
        px(ctx, 0, y, 24, 1, '#DA7957');
        px(ctx, 0, y + 5, 24, 1, '#782F1B');
        for (let x = (row % 2) * 4; x < 24; x += 6) {
          px(ctx, x, y + 1, 1, 4, '#8A3820');
        }
      }
      break;
    }
    case ObjectTile.ROOF_SLATE: {
      px(ctx, 0, 0, 24, 24, '#3B4754');
      for (let row = 0; row < 4; row++) {
        const y = row * 6;
        px(ctx, 0, y, 24, 5, row % 2 === 0 ? '#506070' : '#465564');
        px(ctx, 0, y, 24, 1, '#6B7E91');
        px(ctx, 0, y + 5, 24, 1, '#2D3742');
        for (let x = (row % 2) * 4; x < 24; x += 6) {
          px(ctx, x, y + 1, 1, 4, '#34404D');
        }
      }
      break;
    }
    case ObjectTile.WOOD_DOOR: {
      // Walkable timber door arch frame
      px(ctx, 2, 0, 20, 4, '#5B3A21');
      px(ctx, 2, 0, 3, 24, '#6E472B');
      px(ctx, 19, 0, 3, 24, '#6E472B');
      px(ctx, 5, 3, 14, 18, '#8F5E38');
      px(ctx, 7, 5, 10, 14, '#A8734A');
      px(ctx, 11, 5, 1, 14, '#734A2B');
      // Brass door handle
      px(ctx, 15, 12, 2, 2, '#E9C46A');
      px(ctx, 4, 21, 16, 3, '#9BA19C');
      break;
    }
    case ObjectTile.FENCE: {
      // Shadow
      px(ctx, 2, 19, 20, 3, 'rgba(20, 30, 20, 0.25)');
      // Horizontal rails
      px(ctx, 0, 9, 24, 3, '#9C6B43');
      px(ctx, 0, 9, 24, 1, '#BC885B');
      px(ctx, 0, 15, 24, 3, '#8A5C37');
      // Vertical posts
      px(ctx, 3, 5, 4, 16, '#7E5230');
      px(ctx, 4, 5, 2, 14, '#B07C51');
      px(ctx, 17, 5, 4, 16, '#7E5230');
      px(ctx, 18, 5, 2, 14, '#B07C51');
      break;
    }
    case ObjectTile.TREE_OAK: {
      // Ground shadow
      px(ctx, 4, 19, 16, 4, 'rgba(18, 32, 18, 0.3)');
      // Warm sturdy trunk
      px(ctx, 9, 14, 6, 8, '#6D4527');
      px(ctx, 10, 14, 2, 7, '#8A5B36');
      // Lush multi-tone oak canopy
      px(ctx, 3, 4, 18, 12, '#2B5E2E');
      px(ctx, 5, 2, 14, 14, '#367538');
      px(ctx, 4, 5, 16, 8, '#468F44');
      px(ctx, 6, 3, 11, 5, '#62AB52');
      px(ctx, 8, 4, 5, 3, '#7DC466');
      // Canopy outline depth
      px(ctx, 4, 14, 16, 2, '#234D26');
      break;
    }
    case ObjectTile.TREE_PINE: {
      px(ctx, 5, 20, 14, 3, 'rgba(15, 28, 18, 0.3)');
      px(ctx, 10, 17, 4, 5, '#5E3A20');
      // Layered evergreen tiers
      px(ctx, 3, 13, 18, 5, '#1D4A36');
      px(ctx, 5, 9, 14, 5, '#245B42');
      px(ctx, 7, 5, 10, 5, '#2E7051');
      px(ctx, 9, 2, 6, 4, '#3F8A64');
      px(ctx, 11, 1, 2, 2, '#57A67D');
      // Highlight tips
      px(ctx, 8, 6, 4, 2, '#4A9670');
      px(ctx, 6, 10, 5, 2, '#3A805D');
      break;
    }
    case ObjectTile.LAMP_POST: {
      px(ctx, 8, 20, 8, 3, 'rgba(18, 24, 20, 0.3)');
      // Wrought-iron post
      px(ctx, 10, 18, 4, 4, '#2F383D');
      px(ctx, 11, 8, 2, 11, '#3D484F');
      // Lantern head
      px(ctx, 8, 3, 8, 6, '#293236');
      px(ctx, 9, 4, 6, 4, '#FFD166');
      px(ctx, 10, 5, 4, 2, '#FFF3B0');
      px(ctx, 9, 2, 6, 1, '#1F262A');
      break;
    }
    case ObjectTile.CROP_CARROT: {
      // 3 crisp carrot sprouts on garden row
      for (const cx of [4, 11, 18]) {
        px(ctx, cx, 13, 3, 5, '#E76F51');
        px(ctx, cx + 1, 14, 1, 3, '#F4A261');
        px(ctx, cx - 1, 9, 5, 4, '#3D8B40');
        px(ctx, cx, 8, 3, 2, '#62B356');
      }
      break;
    }
    case ObjectTile.CROP_SUNFLOWER: {
      for (const sx of [6, 16]) {
        px(ctx, sx, 11, 2, 10, '#3D8B40');
        px(ctx, sx - 2, 14, 2, 2, '#52A34C');
        px(ctx, sx + 2, 15, 2, 2, '#52A34C');
        // Golden petals
        px(ctx, sx - 2, 5, 6, 6, '#F4B942');
        px(ctx, sx - 1, 4, 4, 8, '#FFD166');
        px(ctx, sx, 7, 2, 2, '#5C3A21');
      }
      break;
    }
    case ObjectTile.FLOWER_BED: {
      px(ctx, 2, 12, 20, 9, '#7A4E2D');
      px(ctx, 3, 13, 18, 7, '#5B3A21');
      px(ctx, 4, 10, 16, 6, '#438945');
      px(ctx, 5, 11, 3, 3, '#E76F51');
      px(ctx, 10, 10, 3, 3, '#FFD166');
      px(ctx, 16, 11, 3, 3, '#A8DADC');
      px(ctx, 13, 13, 2, 2, '#F8F9FA');
      break;
    }
    case ObjectTile.WELL: {
      px(ctx, 3, 19, 18, 4, 'rgba(18, 25, 20, 0.3)');
      // Stone circular rim
      px(ctx, 4, 12, 16, 9, '#767E80');
      px(ctx, 5, 13, 14, 7, '#9AA3A6');
      px(ctx, 6, 13, 12, 4, '#2E86AB');
      px(ctx, 7, 14, 5, 1, '#84D2EC');
      // Timber supports + slate roof
      px(ctx, 5, 5, 2, 9, '#6F472B');
      px(ctx, 17, 5, 2, 9, '#6F472B');
      px(ctx, 3, 2, 18, 5, '#46586B');
      px(ctx, 5, 1, 14, 3, '#5F758C');
      break;
    }
    case ObjectTile.BENCH: {
      px(ctx, 3, 17, 18, 3, 'rgba(18, 25, 20, 0.25)');
      px(ctx, 3, 9, 18, 4, '#A46E44');
      px(ctx, 3, 9, 18, 1, '#C48A5E');
      px(ctx, 3, 14, 18, 3, '#8F5D37');
      px(ctx, 4, 16, 2, 4, '#3D484F');
      px(ctx, 18, 16, 2, 4, '#3D484F');
      break;
    }
    case ObjectTile.BARREL: {
      px(ctx, 6, 19, 12, 3, 'rgba(18, 25, 20, 0.25)');
      px(ctx, 6, 6, 12, 14, '#8E5A34');
      px(ctx, 7, 5, 10, 15, '#A87046');
      px(ctx, 6, 9, 12, 2, '#4A5257');
      px(ctx, 6, 15, 12, 2, '#4A5257');
      px(ctx, 8, 6, 8, 2, '#C28A5D');
      break;
    }
    case ObjectTile.SHEEP: {
      px(ctx, 5, 18, 14, 3, 'rgba(18, 25, 20, 0.25)');
      // Legs
      px(ctx, 7, 16, 2, 4, '#3B3632');
      px(ctx, 14, 16, 2, 4, '#3B3632');
      // Fluffy wool body
      px(ctx, 5, 9, 13, 8, '#EAE6DC');
      px(ctx, 6, 8, 11, 8, '#FBF9F4');
      px(ctx, 8, 9, 4, 3, '#FFFFFF');
      // Cute dark face
      px(ctx, 15, 10, 5, 5, '#3F3A36');
      px(ctx, 17, 11, 1, 1, '#FFFFFF');
      break;
    }
    case ObjectTile.CHICKEN: {
      px(ctx, 8, 18, 8, 2, 'rgba(18, 25, 20, 0.22)');
      px(ctx, 10, 16, 1, 3, '#E09F3E');
      px(ctx, 13, 16, 1, 3, '#E09F3E');
      px(ctx, 8, 11, 8, 6, '#F7F4EC');
      px(ctx, 13, 9, 4, 4, '#FFFFFF');
      px(ctx, 17, 10, 2, 2, '#E09F3E'); // beak
      px(ctx, 14, 8, 2, 1, '#D64545'); // comb
      px(ctx, 15, 10, 1, 1, '#222222');
      break;
    }
    case ObjectTile.HAY_BALE: {
      px(ctx, 3, 18, 18, 3, 'rgba(18, 25, 20, 0.25)');
      px(ctx, 3, 8, 18, 11, '#D4A039');
      px(ctx, 4, 9, 16, 4, '#E8BA51');
      px(ctx, 7, 8, 2, 11, '#9E6823');
      px(ctx, 15, 8, 2, 11, '#9E6823');
      break;
    }
    case ObjectTile.LANTERN_TOWER: {
      // Distinctive lakeside stone lighthouse / lantern landmark
      px(ctx, 3, 20, 18, 4, 'rgba(15, 25, 28, 0.35)');
      // Tapered stone base
      px(ctx, 5, 14, 14, 8, '#818A8F');
      px(ctx, 6, 9, 12, 6, '#96A0A6');
      px(ctx, 7, 10, 10, 2, '#B3BDC2');
      // Arched door
      px(ctx, 10, 17, 4, 5, '#3C322A');
      // Warm glowing lantern chamber
      px(ctx, 7, 4, 10, 5, '#2E3A42');
      px(ctx, 8, 5, 8, 3, '#FFD166');
      px(ctx, 10, 5, 4, 3, '#FFF8D6');
      // Pointed slate cap
      px(ctx, 6, 3, 12, 2, '#425363');
      px(ctx, 9, 1, 6, 2, '#576C80');
      px(ctx, 11, 0, 2, 1, '#FFD166');
      break;
    }
    case ObjectTile.SIGNPOST: {
      px(ctx, 9, 19, 6, 3, 'rgba(18, 25, 20, 0.25)');
      px(ctx, 11, 11, 2, 10, '#6B4426');
      px(ctx, 4, 6, 16, 7, '#9C6B43');
      px(ctx, 5, 7, 14, 5, '#BD8B5E');
      px(ctx, 7, 9, 10, 1, '#5C3A21');
      px(ctx, 7, 11, 7, 1, '#5C3A21');
      break;
    }
    case ObjectTile.PIER_POST: {
      px(ctx, 8, 8, 8, 13, '#6B4527');
      px(ctx, 9, 7, 6, 12, '#8F603B');
      px(ctx, 8, 11, 8, 2, '#C9A86A'); // mooring rope wrap
      break;
    }
    default:
      break;
  }
  return c;
}

export function getSpriteAtlas(): SpriteAtlas {
  if (cachedAtlas) return cachedAtlas;

  const ground = new Map<number, HTMLCanvasElement[]>();
  ground.set(GroundTile.GRASS, [0, 1, 2, 3].map((v) => makeGrassVariant(v, false)));
  ground.set(GroundTile.GRASS_FLOWERS, [0, 1, 2, 3].map((v) => makeGrassVariant(v, true)));
  ground.set(GroundTile.STONE_PATH, [0, 1].map((v) => makeStonePath(v)));
  ground.set(GroundTile.DIRT_SOIL, [makeDirtSoil()]);
  ground.set(GroundTile.WOOD_FLOOR, [makeWoodFloor()]);
  ground.set(GroundTile.SAND_SHORE, [makeSandShore()]);
  ground.set(GroundTile.PLAZA_STONE, [makePlazaStone()]);
  const waterFrames = [0, 1, 2, 3].map((f) => makeWaterFrame(f));
  ground.set(GroundTile.WATER, waterFrames);

  const objects = new Map<number, HTMLCanvasElement>();
  for (const val of Object.values(ObjectTile)) {
    if (typeof val === 'number' && val !== ObjectTile.NONE) {
      objects.set(val, makeObjectSprite(val));
    }
  }

  cachedAtlas = { ground, objects, waterFrames };
  return cachedAtlas;
}

export function getPaletteSwatchDataUrl(layer: 'ground' | 'object', tileId: number): string {
  const key = `${layer}:${tileId}`;
  const cached = swatchCache.get(key);
  if (cached) return cached;

  const atlas = getSpriteAtlas();
  const [c, ctx] = createTileCanvas(24, 24);
  if (layer === 'ground') {
    const arr = atlas.ground.get(tileId);
    if (arr?.[0]) ctx.drawImage(arr[0], 0, 0);
  } else {
    // Draw subtle grass backing under object swatch so shapes read clearly
    const bg = atlas.ground.get(GroundTile.GRASS)?.[0];
    if (bg) ctx.drawImage(bg, 0, 0);
    const obj = atlas.objects.get(tileId);
    if (obj) ctx.drawImage(obj, 0, 0);
  }
  const url = c.toDataURL();
  swatchCache.set(key, url);
  return url;
}

export function drawVillagerSprite(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  scale: number,
  opts: {
    avatarColor: string;
    hatStyle: HatStyle;
    facing: FacingDir;
    walking: boolean;
    animTime: number;
    displayName: string;
    isSelf: boolean;
    isHost: boolean;
    connected: boolean;
  }
) {
  const step = opts.walking ? Math.sin(opts.animTime * 11) : 0;
  const bob = opts.walking ? Math.abs(Math.sin(opts.animTime * 11)) * 1.4 : 0;
  const pxSize = scale; // 1 logical pixel = scale screen pixels
  const originX = Math.round(screenX - 12 * pxSize);
  const originY = Math.round(screenY - (18 + bob) * pxSize);

  ctx.save();
  if (!opts.connected) {
    ctx.globalAlpha = 0.52;
  }

  const rect = (lx: number, ly: number, lw: number, lh: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      originX + Math.round(lx * pxSize),
      originY + Math.round(ly * pxSize),
      Math.max(1, Math.round(lw * pxSize)),
      Math.max(1, Math.round(lh * pxSize))
    );
  };

  // Ground shadow (does not bob)
  ctx.fillStyle = 'rgba(18, 28, 22, 0.34)';
  ctx.fillRect(
    Math.round(screenX - 6 * pxSize),
    Math.round(screenY + 1 * pxSize),
    Math.round(12 * pxSize),
    Math.round(3 * pxSize)
  );

  // Boots with stride
  const leftFootY = 17 + (step > 0.25 ? -1 : 0);
  const rightFootY = 17 + (step < -0.25 ? -1 : 0);
  rect(8, leftFootY, 3, 3, '#3E2B1E');
  rect(13, rightFootY, 3, 3, '#3E2B1E');

  // Tunic / Cloak body
  rect(7, 11, 10, 7, '#1F2421'); // Crisp dark pixel outline
  rect(8, 12, 8, 5, opts.avatarColor);
  // Belt accent
  rect(8, 15, 8, 1, '#4A3423');
  rect(11, 15, 2, 1, '#E8C56C');

  // Arms
  const armSwing = Math.round(step * 1.2);
  rect(6, 12 + armSwing, 2, 4, opts.avatarColor);
  rect(16, 12 - armSwing, 2, 4, opts.avatarColor);

  // Head
  rect(7, 4, 10, 8, '#2C221E'); // outline
  rect(8, 5, 8, 6, '#F2C9A0'); // warm skin tone
  // Hair cap
  rect(8, 4, 8, 3, '#4E3424');
  if (opts.facing === 'up') {
    rect(8, 5, 8, 5, '#4E3424');
  } else {
    // Eyes based on facing
    const eyeShift = opts.facing === 'left' ? -1 : opts.facing === 'right' ? 1 : 0;
    rect(9 + eyeShift, 8, 1, 2, '#1F2421');
    rect(14 + eyeShift, 8, 1, 2, '#1F2421');
  }

  // Hat accessory
  if (opts.hatStyle === 'straw') {
    rect(5, 4, 14, 2, '#D9AF52');
    rect(8, 2, 8, 2, '#E8C670');
    rect(8, 3, 8, 1, '#B84A39');
  } else if (opts.hatStyle === 'cap') {
    rect(7, 2, 10, 3, opts.avatarColor);
    rect(8, 1, 8, 2, '#F2ECE1');
  } else if (opts.hatStyle === 'flower') {
    rect(14, 3, 3, 3, '#F4A261');
    rect(15, 4, 1, 1, '#FFF3B0');
    rect(13, 5, 2, 1, '#52A34C');
  }

  // Host gold crown glint
  if (opts.isHost) {
    rect(9, 0, 6, 2, '#F4C430');
    rect(9, -1, 1, 1, '#FFE680');
    rect(11, -1, 2, 1, '#FFE680');
    rect(14, -1, 1, 1, '#FFE680');
  }

  // Floating legible name tag
  const label = opts.connected ? opts.displayName : `${opts.displayName} (reconnecting)`;
  ctx.font = `600 ${Math.max(11, Math.round(5.5 * pxSize))}px "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'center';
  const metrics = ctx.measureText(label);
  const tagW = metrics.width + 12;
  const tagH = 18;
  const tagX = Math.round(screenX - tagW / 2);
  const tagY = Math.round(originY - 14);

  ctx.fillStyle = opts.isSelf ? 'rgba(29, 78, 56, 0.88)' : 'rgba(20, 28, 25, 0.82)';
  ctx.beginPath();
  ctx.roundRect(tagX, tagY, tagW, tagH, 4);
  ctx.fill();

  ctx.fillStyle = '#F8F7F2';
  ctx.fillText(label, Math.round(screenX), tagY + 13);
  ctx.restore();
}
