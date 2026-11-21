import {
  CHUNK_SIZE,
  GroundTile,
  ObjectTile,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  getSpawnPoints,
  tileIndex,
} from './tiles.ts';

export interface WorldMapData {
  width: number;
  height: number;
  ground: number[];
  objects: number[];
}

export interface ChunkRecord {
  chunkX: number;
  chunkY: number;
  ground: number[];
  objects: number[];
  revision: number;
}

export const STRING_TILE_LEGEND = Object.freeze({
  GRASS: 'grass',
  GRASS_FLOWER: 'grass-flower',
  GRASS_TUFT: 'grass-tuft',
  ROAD: 'stone-road',
  ROAD_EDGE: 'stone-road-edge',
  PLAZA: 'plaza-stone',
  WOOD_WALL: 'wood-wall',
  STONE_WALL: 'stone-wall',
  ROOF: 'terracotta-roof',
  WINDOW: 'window',
  DOOR: 'door',
  ROOF_DARK: 'dark-roof',
  FARM_SOIL: 'farm-soil',
  CROP: 'crop',
  FLOWER: 'flower',
  FENCE: 'wood-fence',
  TREE: 'tree',
  LAMP: 'lamp',
  BENCH: 'bench',
  WELL: 'well',
  WATER: 'water',
  BRIDGE: 'bridge',
  SIGN: 'sign',
  CRATE: 'crate',
  BUSH: 'bush',
});

function rngFrom(seed: number) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a large, seeded 192×144 (default) top-down pixel village map
 * with broad connected stone avenues, central paved plaza & green island,
 * modular wood & stone cottages, fenced crop farms, animal pasture,
 * tree groves, street lamps, and a northeast pond with a wooden bridge.
 */
export function generateStarterVillage(
  seed = 1,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT
): WorldMapData {
  const w = Math.max(96, Math.floor(width));
  const h = Math.max(72, Math.floor(height));
  const random = rngFrom(seed);
  const total = w * h;
  const ground = new Array<number>(total).fill(GroundTile.GRASS);
  const objects = new Array<number>(total).fill(ObjectTile.NONE);

  interface RectZone {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  const roads: RectZone[] = [];
  const buildings: RectZone[] = [];
  const farms: RectZone[] = [];

  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const setG = (x: number, y: number, id: number) => {
    if (inside(x, y)) ground[tileIndex(x, y, w)] = id;
  };
  const setO = (x: number, y: number, id: number) => {
    if (inside(x, y)) objects[tileIndex(x, y, w)] = id;
  };
  const fillG = (x: number, y: number, rw: number, rh: number, id: number) => {
    for (let yy = y; yy < y + rh; yy++) {
      for (let xx = x; xx < x + rw; xx++) setG(xx, yy, id);
    }
  };
  const fillO = (x: number, y: number, rw: number, rh: number, id: number) => {
    for (let yy = y; yy < y + rh; yy++) {
      for (let xx = x; xx < x + rw; xx++) setO(xx, yy, id);
    }
  };

  const roadH = (x1: number, x2: number, y: number, thick = 4) => {
    const sx = Math.max(0, Math.min(x1, x2));
    const ex = Math.min(w, Math.max(x1, x2));
    fillG(sx, y, ex - sx, thick, GroundTile.STONE_PATH);
    roads.push({ x: sx, y, w: ex - sx, h: thick });
  };

  const roadV = (x: number, y1: number, y2: number, thick = 4) => {
    const sy = Math.max(0, Math.min(y1, y2));
    const ey = Math.min(h, Math.max(y1, y2));
    fillG(x, sy, thick, ey - sy, GroundTile.STONE_PATH);
    roads.push({ x, y: sy, w: thick, h: ey - sy });
  };

  const roadRect = (x: number, y: number, rw: number, rh: number) => {
    fillG(x, y, rw, rh, GroundTile.PLAZA_STONE);
    roads.push({ x, y, w: rw, h: rh });
  };

  // 1. Sparse organic grass tufts and wildflowers so edits stay legible
  const speckleCount = Math.floor(w * h * 0.055);
  for (let i = 0; i < speckleCount; i++) {
    const x = Math.floor(random() * w);
    const y = Math.floor(random() * h);
    setG(x, y, random() < 0.62 ? GroundTile.GRASS_TUFT : GroundTile.GRASS_FLOWERS);
  }

  // 2. Broad connected avenues + generous central paved square
  const cx = Math.floor(w * 0.52);
  const cy = Math.floor(h * 0.50);
  const mainRoadY = Math.floor(h * 0.48);
  const southRoadY = Math.floor(h * 0.72);
  const westRoadX = Math.floor(w * 0.28);
  const eastRoadX = Math.floor(w * 0.70);
  const midRoadX = Math.floor(w * 0.48);

  roadH(0, w, mainRoadY, 5);
  roadH(Math.floor(w * 0.08), Math.floor(w * 0.92), southRoadY, 4);
  roadV(westRoadX, 0, h, 4);
  roadV(eastRoadX, 0, h, 5);
  roadV(midRoadX, Math.floor(h * 0.16), Math.floor(h * 0.88), 3);
  roadRect(cx - 11, cy - 9, 23, 19);

  // 3. Central green island, stone well, benches, flower planters, and corner lamps
  const greenX = cx - 7;
  const greenY = cy - 5;
  fillG(greenX, greenY, 15, 11, GroundTile.GRASS);
  fillG(cx - 2, cy - 2, 5, 5, GroundTile.PLAZA_STONE);
  setO(cx, cy, ObjectTile.WELL);
  setO(cx - 5, cy - 3, ObjectTile.BENCH);
  setO(cx + 5, cy - 3, ObjectTile.BENCH);
  setO(cx - 5, cy + 3, ObjectTile.BENCH);
  setO(cx + 5, cy + 3, ObjectTile.BENCH);
  setO(cx - 4, cy, ObjectTile.FLOWER_BED);
  setO(cx + 4, cy, ObjectTile.FLOWER_BED);
  for (const [dx, dy] of [
    [-9, -7],
    [9, -7],
    [-9, 7],
    [9, 7],
  ]) {
    setO(cx + dx, cy + dy, ObjectTile.LAMP_POST);
  }

  // 4. Modular wooden & stone cottages arranged along avenues with walkable yards
  const addHouse = (x: number, y: number, bw: number, bh: number, style: 'wood' | 'stone') => {
    if (x < 3 || y < 3 || x + bw >= w - 3 || y + bh >= h - 3) return;
    const wall = style === 'stone' ? ObjectTile.STONE_WALL : ObjectTile.WOOD_WALL;
    const roof = style === 'stone' ? ObjectTile.ROOF_SLATE : ObjectTile.ROOF_TERRACOTTA;
    const roofH = Math.max(2, Math.floor(bh * 0.36));

    // Warm interior timber floor beneath cottage footprint
    fillG(x, y, bw, bh, GroundTile.WOOD_FLOOR);
    // Exterior perimeter walls + pitched roof
    fillO(x, y, bw, bh, ObjectTile.NONE);
    for (let yy = y + roofH; yy < y + bh; yy++) {
      for (let xx = x; xx < x + bw; xx++) {
        const edge = yy === y + bh - 1 || xx === x || xx === x + bw - 1;
        if (edge) setO(xx, yy, wall);
      }
    }
    fillO(x - 1, y - 1, bw + 2, roofH + 1, roof);

    // Walkable doorway + sunlit cottage windows + entry path & yard details
    const doorX = x + Math.floor(bw / 2);
    const doorY = y + bh - 1;
    setO(doorX, doorY, ObjectTile.WOOD_DOOR);
    setG(doorX, doorY + 1, GroundTile.STONE_PATH);
    setG(doorX, doorY + 2, GroundTile.STONE_PATH);

    if (bw >= 7) {
      setO(x + 2, doorY, ObjectTile.WINDOW);
      setO(x + bw - 3, doorY, ObjectTile.WINDOW);
    }
    setO(x + 1, doorY + 1, ObjectTile.FLOWER_BED);
    setO(x + bw - 2, doorY + 1, style === 'wood' ? ObjectTile.BARREL : ObjectTile.CRATE);

    buildings.push({ x: x - 1, y: y - 1, w: bw + 2, h: bh + 2 });
  };

  const houseW = Math.max(8, Math.floor(w * 0.055));
  const houseH = Math.max(6, Math.floor(h * 0.062));
  const houseCandidates: Array<[number, number, 'wood' | 'stone']> = [
    [0.10, 0.30, 'stone'],
    [0.36, 0.28, 'wood'],
    [0.57, 0.25, 'stone'],
    [0.77, 0.34, 'wood'],
    [0.12, 0.56, 'wood'],
    [0.35, 0.58, 'stone'],
    [0.77, 0.56, 'stone'],
    [0.10, 0.79, 'stone'],
    [0.36, 0.80, 'wood'],
    [0.56, 0.79, 'wood'],
    [0.86, 0.56, 'wood'],
    [0.18, 0.30, 'wood'],
  ];

  for (const [px, py, style] of houseCandidates) {
    const hx = Math.floor(w * px);
    const hy = Math.floor(h * py);
    const bw = houseW + (random() < 0.4 ? 2 : 0);
    const nearSquare =
      hx < cx + 14 && hx + bw > cx - 14 && hy < cy + 12 && hy + houseH > cy - 12;
    const overlapsRoad = roads.some(
      (r) => hx - 2 < r.x + r.w && hx + bw + 2 > r.x && hy - 2 < r.y + r.h && hy + houseH + 3 > r.y
    );
    const overlapsHouse = buildings.some(
      (b) => hx - 3 < b.x + b.w && hx + bw + 3 > b.x && hy - 3 < b.y + b.h && hy + houseH + 3 > b.y
    );
    if (!nearSquare && !overlapsRoad && !overlapsHouse) {
      addHouse(hx, hy, bw, houseH, style);
    }
  }

  // 5. Productive fenced farm plots with crops, flowers, and walkable road-facing gates
  const addFarm = (x: number, y: number, fw: number, fh: number, mode: 'mixed' | 'sunflower' | 'pasture') => {
    if (x < 2 || y < 2 || x + fw >= w - 2 || y + fh >= h - 2) return;
    if (mode !== 'pasture') {
      fillG(x + 1, y + 1, fw - 2, fh - 2, GroundTile.DIRT_SOIL);
      for (let yy = y + 2; yy < y + fh - 2; yy++) {
        for (let xx = x + 2; xx < x + fw - 2; xx++) {
          if (xx === x + Math.floor(fw / 2)) {
            setG(xx, yy, GroundTile.STONE_PATH);
            continue;
          }
          if (yy % 2 === 0) {
            if (mode === 'sunflower') {
              setO(xx, yy, (xx + yy) % 3 === 0 ? ObjectTile.FLOWER_BED : ObjectTile.CROP_SUNFLOWER);
            } else {
              setO(xx, yy, xx < x + fw / 2 ? ObjectTile.CROP_CARROT : ObjectTile.CROP_SUNFLOWER);
            }
          }
        }
      }
    } else {
      // Cozy fenced animal yard with hay bales & decorative sheep/chickens
      fillG(x + 1, y + 1, fw - 2, fh - 2, GroundTile.GRASS);
      setO(x + 3, y + 3, ObjectTile.HAY_BALE);
      setO(x + 4, y + 3, ObjectTile.HAY_BALE);
      setO(x + 3, y + 4, ObjectTile.HAY_BALE);
      const pastureAnimals: Array<[number, number, ObjectTile]> = [
        [x + Math.floor(fw * 0.4), y + Math.floor(fh * 0.4), ObjectTile.SHEEP],
        [x + Math.floor(fw * 0.65), y + Math.floor(fh * 0.35), ObjectTile.SHEEP],
        [x + Math.floor(fw * 0.55), y + Math.floor(fh * 0.65), ObjectTile.SHEEP],
        [x + Math.floor(fw * 0.32), y + Math.floor(fh * 0.68), ObjectTile.CHICKEN],
        [x + Math.floor(fw * 0.72), y + Math.floor(fh * 0.62), ObjectTile.CHICKEN],
      ];
      for (const [ax, ay, animal] of pastureAnimals) {
        if (ax > x + 1 && ax < x + fw - 2 && ay > y + 1 && ay < y + fh - 2) {
          setO(ax, ay, animal);
        }
      }
    }

    // Wooden fence perimeter
    for (let xx = x; xx < x + fw; xx++) {
      setO(xx, y, ObjectTile.FENCE);
      setO(xx, y + fh - 1, ObjectTile.FENCE);
    }
    for (let yy = y; yy < y + fh; yy++) {
      setO(x, yy, ObjectTile.FENCE);
      setO(x + fw - 1, yy, ObjectTile.FENCE);
    }
    // 2-tile wide gate facing main road
    const gateX = x + Math.floor(fw / 2);
    setO(gateX, y + fh - 1, ObjectTile.NONE);
    setO(gateX - 1, y + fh - 1, ObjectTile.NONE);
    setG(gateX, y + fh - 1, GroundTile.GRASS);
    setG(gateX - 1, y + fh - 1, GroundTile.GRASS);

    farms.push({ x, y, w: fw, h: fh });
  };

  addFarm(4, 5, Math.floor(w * 0.19), Math.floor(h * 0.18), 'mixed');
  addFarm(Math.floor(w * 0.33), 6, Math.floor(w * 0.13), Math.floor(h * 0.13), 'sunflower');
  addFarm(Math.floor(w * 0.77), Math.floor(h * 0.78), Math.floor(w * 0.17), Math.floor(h * 0.16), 'mixed');
  addFarm(4, Math.floor(h * 0.56), Math.floor(w * 0.14), Math.floor(h * 0.13), 'pasture');

  // Helper to check if a coordinate is reserved by roads, buildings, or farms
  const isOccupied = (x: number, y: number, pad = 1) =>
    roads.some((r) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad) ||
    buildings.some((b) => x >= b.x - pad - 1 && x < b.x + b.w + pad + 1 && y >= b.y - pad - 1 && y < b.y + b.h + pad + 1) ||
    farms.some((f) => x >= f.x - pad && x < f.x + f.w + pad && y >= f.y - pad && y < f.y + f.h + pad);

  // 6. Winding pond in the northeast quadrant with sandy edge, wooden bridge, and stone lantern
  const pondX = Math.floor(w * 0.84);
  const pondY = Math.floor(h * 0.21);
  const radX = 11;
  const radY = 7;
  for (let yy = -radY - 2; yy <= radY + 2; yy++) {
    for (let xx = -radX - 2; xx <= radX + 2; xx++) {
      const tx = pondX + xx;
      const ty = pondY + yy;
      if (!inside(tx, ty) || isOccupied(tx, ty, 1)) continue;
      const wobble = 0.84 + 0.16 * Math.sin(xx * 0.65 + yy * 0.45);
      const norm = (xx * xx) / (radX * radX) + (yy * yy) / (radY * radY);
      if (norm < wobble) {
        setG(tx, ty, GroundTile.WATER);
        setO(tx, ty, ObjectTile.NONE);
      } else if (norm < wobble + 0.22) {
        setG(tx, ty, GroundTile.SAND_SHORE);
        if (random() < 0.14 && Math.abs(yy) > 2) {
          setO(tx, ty, ObjectTile.BUSH);
        }
      }
    }
  }
  // Walkable wooden bridge crossing the pond center + stone lantern landmark on bank
  for (let bx = pondX - 5; bx <= pondX + 5; bx++) {
    setG(bx, pondY, GroundTile.BRIDGE);
    setG(bx, pondY + 1, GroundTile.BRIDGE);
    setO(bx, pondY, ObjectTile.NONE);
    setO(bx, pondY + 1, ObjectTile.NONE);
  }
  setO(pondX - 5, pondY - 1, ObjectTile.PIER_POST);
  setO(pondX + 5, pondY - 1, ObjectTile.PIER_POST);
  setO(pondX - 5, pondY + 2, ObjectTile.PIER_POST);
  setO(pondX + 5, pondY + 2, ObjectTile.PIER_POST);
  if (inside(pondX + radX + 2, pondY - 2) && !isOccupied(pondX + radX + 2, pondY - 2)) {
    setG(pondX + radX + 2, pondY - 2, GroundTile.PLAZA_STONE);
    setO(pondX + radX + 2, pondY - 2, ObjectTile.LANTERN_TOWER);
  }

  // 7. Street lamps and benches lined cleanly along principal avenues
  for (let x = 10; x < w - 8; x += 16) {
    for (const y of [mainRoadY - 1, mainRoadY + 5]) {
      if (inside(x, y) && ground[tileIndex(x, y, w)] !== GroundTile.WATER && objects[tileIndex(x, y, w)] === ObjectTile.NONE) {
        if (!buildings.some((b) => x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h)) {
          setO(x, y, ObjectTile.LAMP_POST);
          if (inside(x + 2, y) && objects[tileIndex(x + 2, y, w)] === ObjectTile.NONE && x % 32 === 10) {
            setO(x + 2, y, ObjectTile.BENCH);
          }
        }
      }
    }
  }
  for (let y = 10; y < h - 8; y += 18) {
    for (const x of [westRoadX - 1, eastRoadX + 5]) {
      if (inside(x, y) && ground[tileIndex(x, y, w)] !== GroundTile.WATER && objects[tileIndex(x, y, w)] === ObjectTile.NONE) {
        if (!buildings.some((b) => x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h)) {
          setO(x, y, ObjectTile.LAMP_POST);
        }
      }
    }
  }

  // 8. Lush oak/pine groves & bushes around outer woodlands (leaving open build plots clear!)
  const treeAttempts = Math.floor(w * h * 0.015);
  for (let i = 0; i < treeAttempts; i++) {
    const x = Math.floor(random() * w);
    const y = Math.floor(random() * h);
    if (!inside(x, y)) continue;
    const idx = tileIndex(x, y, w);
    if (ground[idx] === GroundTile.WATER || ground[idx] === GroundTile.BRIDGE || objects[idx] !== ObjectTile.NONE) continue;
    if (isOccupied(x, y, 2)) continue;
    // Denser near map perimeter, lighter in open interior build plots
    const edgeDist = Math.min(x, y, w - 1 - x, h - 1 - y);
    const keepProb = edgeDist < 12 ? 0.88 : 0.42;
    if (random() < keepProb) {
      const roll = random();
      setO(x, y, roll < 0.48 ? ObjectTile.TREE_OAK : roll < 0.82 ? ObjectTile.TREE_PINE : ObjectTile.BUSH);
    }
  }

  // 9. Entrance signs and market crates beside central square
  const props: Array<[number, number, ObjectTile]> = [
    [5, mainRoadY - 2, ObjectTile.SIGNPOST],
    [w - 8, southRoadY - 2, ObjectTile.SIGNPOST],
    [westRoadX + 5, 6, ObjectTile.SIGNPOST],
    [cx - 12, cy - 1, ObjectTile.CRATE],
    [cx - 12, cy, ObjectTile.BARREL],
    [cx + 12, cy - 1, ObjectTile.CRATE],
    [cx + 12, cy, ObjectTile.CRATE],
  ];
  for (const [px, py, prop] of props) {
    if (inside(px, py) && ground[tileIndex(px, py, w)] !== GroundTile.WATER) {
      setO(px, py, prop);
    }
  }

  // Ensure all player spawn points around the plaza are guaranteed clear & walkable
  for (const sp of getSpawnPoints(w, h)) {
    if (inside(sp.x, sp.y)) {
      if (ground[tileIndex(sp.x, sp.y, w)] === GroundTile.WATER) {
        setG(sp.x, sp.y, GroundTile.PLAZA_STONE);
      }
      setO(sp.x, sp.y, ObjectTile.NONE);
    }
  }

  return {
    width: w,
    height: h,
    ground,
    objects,
  };
}

/**
 * Exposes window.PixelVillageMap.generate(seed, width, height, tileSize)
 * matching the structured string-tilemap API for console / external inspection.
 */
export function generateStructuredPixelVillageMap(
  seed = 1,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT,
  tileSize = 16
) {
  const map = generateStarterVillage(seed, width, height);
  const tiles: string[][] = [];

  for (let y = 0; y < map.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < map.width; x++) {
      const idx = tileIndex(x, y, map.width);
      const obj = map.objects[idx];
      const g = map.ground[idx];
      if (obj !== ObjectTile.NONE) {
        const objNameMap: Record<number, string> = {
          [ObjectTile.WOOD_WALL]: STRING_TILE_LEGEND.WOOD_WALL,
          [ObjectTile.STONE_WALL]: STRING_TILE_LEGEND.STONE_WALL,
          [ObjectTile.ROOF_TERRACOTTA]: STRING_TILE_LEGEND.ROOF,
          [ObjectTile.ROOF_SLATE]: STRING_TILE_LEGEND.ROOF_DARK,
          [ObjectTile.WINDOW]: STRING_TILE_LEGEND.WINDOW,
          [ObjectTile.WOOD_DOOR]: STRING_TILE_LEGEND.DOOR,
          [ObjectTile.FENCE]: STRING_TILE_LEGEND.FENCE,
          [ObjectTile.TREE_OAK]: STRING_TILE_LEGEND.TREE,
          [ObjectTile.TREE_PINE]: STRING_TILE_LEGEND.TREE,
          [ObjectTile.LAMP_POST]: STRING_TILE_LEGEND.LAMP,
          [ObjectTile.BENCH]: STRING_TILE_LEGEND.BENCH,
          [ObjectTile.WELL]: STRING_TILE_LEGEND.WELL,
          [ObjectTile.CROP_CARROT]: STRING_TILE_LEGEND.CROP,
          [ObjectTile.CROP_SUNFLOWER]: STRING_TILE_LEGEND.CROP,
          [ObjectTile.FLOWER_BED]: STRING_TILE_LEGEND.FLOWER,
          [ObjectTile.SIGNPOST]: STRING_TILE_LEGEND.SIGN,
          [ObjectTile.CRATE]: STRING_TILE_LEGEND.CRATE,
          [ObjectTile.BUSH]: STRING_TILE_LEGEND.BUSH,
        };
        row.push(objNameMap[obj] ?? STRING_TILE_LEGEND.CRATE);
      } else {
        const groundNameMap: Record<number, string> = {
          [GroundTile.GRASS]: STRING_TILE_LEGEND.GRASS,
          [GroundTile.GRASS_FLOWERS]: STRING_TILE_LEGEND.GRASS_FLOWER,
          [GroundTile.GRASS_TUFT]: STRING_TILE_LEGEND.GRASS_TUFT,
          [GroundTile.STONE_PATH]: STRING_TILE_LEGEND.ROAD,
          [GroundTile.ROAD_EDGE]: STRING_TILE_LEGEND.ROAD_EDGE,
          [GroundTile.PLAZA_STONE]: STRING_TILE_LEGEND.PLAZA,
          [GroundTile.DIRT_SOIL]: STRING_TILE_LEGEND.FARM_SOIL,
          [GroundTile.WATER]: STRING_TILE_LEGEND.WATER,
          [GroundTile.BRIDGE]: STRING_TILE_LEGEND.BRIDGE,
          [GroundTile.WOOD_FLOOR]: STRING_TILE_LEGEND.BRIDGE,
          [GroundTile.SAND_SHORE]: STRING_TILE_LEGEND.GRASS_TUFT,
        };
        row.push(groundNameMap[g] ?? STRING_TILE_LEGEND.GRASS);
      }
    }
    tiles.push(row);
  }

  return {
    name: 'Pixelfield Village',
    seed: Number(seed) >>> 0,
    width: map.width,
    height: map.height,
    tileSize,
    pixelWidth: map.width * tileSize,
    pixelHeight: map.height * tileSize,
    tiles,
    spawnPoints: getSpawnPoints(map.width, map.height),
    tileIds: STRING_TILE_LEGEND,
  };
}

export function packMapToChunks(map: WorldMapData, chunkSize = CHUNK_SIZE): ChunkRecord[] {
  const chunksX = Math.ceil(map.width / chunkSize);
  const chunksY = Math.ceil(map.height / chunkSize);
  const chunks: ChunkRecord[] = [];

  for (let cy = 0; cy < chunksY; cy++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const g: number[] = [];
      const o: number[] = [];
      for (let ly = 0; ly < chunkSize; ly++) {
        for (let lx = 0; lx < chunkSize; lx++) {
          const wx = cx * chunkSize + lx;
          const wy = cy * chunkSize + ly;
          if (wx < map.width && wy < map.height) {
            const idx = tileIndex(wx, wy, map.width);
            g.push(map.ground[idx] ?? GroundTile.GRASS);
            o.push(map.objects[idx] ?? ObjectTile.NONE);
          } else {
            g.push(GroundTile.GRASS);
            o.push(ObjectTile.NONE);
          }
        }
      }
      chunks.push({
        chunkX: cx,
        chunkY: cy,
        ground: g,
        objects: o,
        revision: 1,
      });
    }
  }
  return chunks;
}

export function unpackChunksToMap(
  chunks: ChunkRecord[],
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT,
  chunkSize = CHUNK_SIZE
): WorldMapData {
  const total = width * height;
  const ground = new Array<number>(total).fill(GroundTile.GRASS);
  const objects = new Array<number>(total).fill(ObjectTile.NONE);

  for (const ch of chunks) {
    for (let ly = 0; ly < chunkSize; ly++) {
      for (let lx = 0; lx < chunkSize; lx++) {
        const wx = ch.chunkX * chunkSize + lx;
        const wy = ch.chunkY * chunkSize + ly;
        if (wx < width && wy < height) {
          const localIdx = ly * chunkSize + lx;
          const worldIdx = tileIndex(wx, wy, width);
          ground[worldIdx] = ch.ground[localIdx] ?? GroundTile.GRASS;
          objects[worldIdx] = ch.objects[localIdx] ?? ObjectTile.NONE;
        }
      }
    }
  }

  return {
    width,
    height,
    ground,
    objects,
  };
}
