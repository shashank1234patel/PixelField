import {
  CHUNK_SIZE,
  GroundTile,
  ObjectTile,
  WORLD_HEIGHT,
  WORLD_WIDTH,
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

function fillRect(
  arr: number[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  val: number
) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
        arr[tileIndex(x, y)] = val;
      }
    }
  }
}

function setAt(arr: number[], x: number, y: number, val: number) {
  if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
    arr[tileIndex(x, y)] = val;
  }
}

function buildCottage(
  ground: number[],
  objects: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  wallTile: ObjectTile,
  roofTile: ObjectTile,
  doorOffsetX: number
) {
  // Warm porch strip below door
  fillRect(ground, x, y, w, h, GroundTile.WOOD_FLOOR);
  // Roof on top rows
  const roofRows = Math.max(2, Math.floor(h / 2));
  fillRect(objects, x, y, w, roofRows, roofTile);
  // Side & front walls
  for (let row = roofRows; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const isEdge = row === h - 1 || col === 0 || col === w - 1;
      if (isEdge) {
        setAt(objects, x + col, y + row, wallTile);
      } else {
        setAt(objects, x + col, y + row, ObjectTile.NONE);
      }
    }
  }
  // Walkable wooden doorway
  const doorX = x + doorOffsetX;
  const doorY = y + h - 1;
  setAt(objects, doorX, doorY, ObjectTile.WOOD_DOOR);
  setAt(ground, doorX, doorY + 1, GroundTile.STONE_PATH);
  // Flower box next to doorway if room
  if (doorOffsetX > 1) {
    setAt(objects, x + 1, doorY + 1, ObjectTile.FLOWER_BED);
  }
  if (doorOffsetX < w - 2) {
    setAt(objects, x + w - 2, doorY + 1, ObjectTile.BARREL);
  }
}

function buildFencePerimeter(
  objects: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  gateX: number,
  gateY: number
) {
  for (let col = 0; col < w; col++) {
    setAt(objects, x + col, y, ObjectTile.FENCE);
    setAt(objects, x + col, y + h - 1, ObjectTile.FENCE);
  }
  for (let row = 0; row < h; row++) {
    setAt(objects, x, y + row, ObjectTile.FENCE);
    setAt(objects, x + w - 1, y + row, ObjectTile.FENCE);
  }
  // Clear 2-tile wide walkable opening
  setAt(objects, gateX, gateY, ObjectTile.NONE);
  if (gateX === x || gateX === x + w - 1) {
    setAt(objects, gateX, gateY + 1, ObjectTile.NONE);
  } else {
    setAt(objects, gateX + 1, gateY, ObjectTile.NONE);
  }
}

export function generateStarterVillage(): WorldMapData {
  const total = WORLD_WIDTH * WORLD_HEIGHT;
  const ground = new Array<number>(total).fill(GroundTile.GRASS);
  const objects = new Array<number>(total).fill(ObjectTile.NONE);

  // Subtle scattered wildflower patches across meadow
  for (let y = 2; y < WORLD_HEIGHT - 2; y++) {
    for (let x = 2; x < WORLD_WIDTH - 2; x++) {
      const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if (hash % 17 === 0) {
        ground[tileIndex(x, y)] = GroundTile.GRASS_FLOWERS;
      }
    }
  }

  // 1. Lakeside shoreline in southeast corner (x: 41..63, y: 29..47)
  for (let y = 28; y < WORLD_HEIGHT; y++) {
    for (let x = 39; x < WORLD_WIDTH; x++) {
      const dx = (x - 58) / 18;
      const dy = (y - 44) / 14;
      const wave = Math.sin(x * 0.25) * 0.08 + Math.cos(y * 0.3) * 0.06;
      const dist = Math.sqrt(dx * dx + dy * dy) + wave;
      if (dist < 0.92) {
        setAt(ground, x, y, GroundTile.WATER);
      } else if (dist < 1.07) {
        setAt(ground, x, y, GroundTile.SAND_SHORE);
      }
    }
  }

  // Headland peninsula for the stone lantern tower landmark (x: 53..57, y: 31..35)
  fillRect(ground, 53, 31, 5, 4, GroundTile.GRASS);
  fillRect(ground, 52, 34, 6, 1, GroundTile.SAND_SHORE);
  setAt(ground, 55, 32, GroundTile.PLAZA_STONE);
  setAt(objects, 55, 32, ObjectTile.LANTERN_TOWER);
  setAt(objects, 53, 32, ObjectTile.LAMP_POST);

  // Wooden pier extending into the lake (x: 46..48, y: 33..38)
  fillRect(ground, 46, 33, 3, 6, GroundTile.WOOD_FLOOR);
  setAt(objects, 46, 38, ObjectTile.PIER_POST);
  setAt(objects, 48, 38, ObjectTile.PIER_POST);
  setAt(objects, 46, 34, ObjectTile.BARREL);

  // 2. Central gathering square & stone cobblestone paths
  fillRect(ground, 27, 20, 9, 7, GroundTile.PLAZA_STONE);
  // Central green island around well
  fillRect(ground, 29, 22, 5, 3, GroundTile.GRASS);
  setAt(ground, 31, 23, GroundTile.PLAZA_STONE);
  setAt(objects, 31, 23, ObjectTile.WELL);
  setAt(objects, 31, 25, ObjectTile.BENCH);
  setAt(objects, 28, 21, ObjectTile.LAMP_POST);
  setAt(objects, 34, 21, ObjectTile.LAMP_POST);
  setAt(objects, 28, 25, ObjectTile.FLOWER_BED);
  setAt(objects, 34, 25, ObjectTile.FLOWER_BED);

  // Main cobblestone roads connecting all zones
  // West road from square to gardens & west border
  fillRect(ground, 3, 21, 25, 2, GroundTile.STONE_PATH);
  // North road from square up toward cottages & north meadow
  fillRect(ground, 30, 8, 3, 12, GroundTile.STONE_PATH);
  // East road from square past cottages toward lighthouse headland
  fillRect(ground, 36, 22, 20, 2, GroundTile.STONE_PATH);
  fillRect(ground, 54, 24, 2, 7, GroundTile.STONE_PATH);
  // South road from square to lakeside pier & south entrance
  fillRect(ground, 30, 27, 3, 18, GroundTile.STONE_PATH);
  // Branch from south road to wooden pier
  fillRect(ground, 33, 32, 14, 2, GroundTile.STONE_PATH);
  // Branch to pasture gate
  fillRect(ground, 23, 32, 7, 2, GroundTile.STONE_PATH);
  // Street lamps along main roads
  setAt(objects, 25, 20, ObjectTile.LAMP_POST);
  setAt(objects, 37, 21, ObjectTile.LAMP_POST);
  setAt(objects, 46, 21, ObjectTile.LAMP_POST);
  setAt(objects, 29, 36, ObjectTile.LAMP_POST);
  setAt(objects, 33, 36, ObjectTile.LAMP_POST);
  setAt(objects, 34, 27, ObjectTile.SIGNPOST);

  // 3. Cozy wooden & stone village cottages
  // North-West Timber Inn (terracotta roof)
  buildCottage(ground, objects, 23, 11, 6, 6, ObjectTile.WOOD_WALL, ObjectTile.ROOF_TERRACOTTA, 3);
  // North-East Slate Cottage (stone walls + slate roof)
  buildCottage(ground, objects, 34, 11, 5, 6, ObjectTile.STONE_WALL, ObjectTile.ROOF_SLATE, 2);
  // Far East Timber Workshop
  buildCottage(ground, objects, 42, 15, 6, 5, ObjectTile.WOOD_WALL, ObjectTile.ROOF_SLATE, 2);
  // East Garden House
  buildCottage(ground, objects, 50, 15, 6, 5, ObjectTile.STONE_WALL, ObjectTile.ROOF_TERRACOTTA, 2);
  // South-West Bakery Cottage
  buildCottage(ground, objects, 23, 25, 5, 5, ObjectTile.WOOD_WALL, ObjectTile.ROOF_TERRACOTTA, 2);
  // Lakeside Hall
  buildCottage(ground, objects, 37, 26, 6, 5, ObjectTile.STONE_WALL, ObjectTile.ROOF_SLATE, 3);

  // Extra benches & barrels around cottages
  setAt(objects, 33, 17, ObjectTile.BENCH);
  setAt(objects, 40, 20, ObjectTile.BENCH);
  setAt(objects, 49, 25, ObjectTile.BENCH);

  // 4. Fenced Vegetable & Flower Gardens (West, x: 7..21, y: 12..19)
  buildFencePerimeter(objects, 7, 12, 15, 8, 14, 19);
  fillRect(ground, 9, 14, 5, 4, GroundTile.DIRT_SOIL);
  fillRect(ground, 15, 14, 5, 4, GroundTile.DIRT_SOIL);
  for (let x = 9; x <= 13; x++) {
    setAt(objects, x, 14, ObjectTile.CROP_CARROT);
    setAt(objects, x, 15, ObjectTile.CROP_CARROT);
    setAt(objects, x, 17, ObjectTile.CROP_SUNFLOWER);
  }
  for (let x = 15; x <= 19; x++) {
    setAt(objects, x, 14, ObjectTile.CROP_SUNFLOWER);
    setAt(objects, x, 16, ObjectTile.FLOWER_BED);
    setAt(objects, x, 17, ObjectTile.CROP_CARROT);
  }

  // 5. Fenced Animal Pasture & Mini Barn (South-West, x: 7..22, y: 26..37)
  buildFencePerimeter(objects, 7, 26, 16, 12, 22, 32);
  // Small timber shed in upper-left corner of pasture
  buildCottage(ground, objects, 8, 27, 4, 4, ObjectTile.WOOD_WALL, ObjectTile.ROOF_TERRACOTTA, 2);
  // Hay bales & static decorative sheep/chickens
  setAt(objects, 13, 28, ObjectTile.HAY_BALE);
  setAt(objects, 13, 29, ObjectTile.HAY_BALE);
  setAt(objects, 10, 33, ObjectTile.HAY_BALE);
  setAt(objects, 15, 30, ObjectTile.SHEEP);
  setAt(objects, 18, 31, ObjectTile.SHEEP);
  setAt(objects, 13, 34, ObjectTile.SHEEP);
  setAt(objects, 17, 35, ObjectTile.SHEEP);
  setAt(objects, 15, 33, ObjectTile.CHICKEN);
  setAt(objects, 19, 29, ObjectTile.CHICKEN);
  setAt(objects, 11, 35, ObjectTile.CHICKEN);

  // 6. Lush Oak & Pine Tree Groves framing the settlement
  const oakCoords: [number, number][] = [
    [3, 4], [6, 6], [10, 5], [15, 6], [19, 5], [21, 8],
    [3, 14], [4, 18], [3, 26], [4, 32], [3, 39], [6, 42],
    [12, 41], [17, 43], [22, 41], [26, 43],
    [43, 5], [48, 6], [54, 5], [59, 8], [60, 15], [59, 22],
    [40, 8], [37, 5], [27, 6], [35, 36],
  ];
  const pineCoords: [number, number][] = [
    [2, 2], [4, 2], [8, 3], [13, 3], [18, 2], [24, 4],
    [2, 9], [5, 10], [2, 23], [2, 35], [4, 44], [9, 44],
    [15, 45], [20, 44], [25, 45], [35, 44], [38, 42],
    [40, 3], [45, 3], [51, 3], [57, 3], [61, 5], [61, 11],
    [61, 19], [61, 25], [46, 27], [48, 28], [21, 23],
  ];

  for (const [tx, ty] of oakCoords) {
    if (ground[tileIndex(tx, ty)] === GroundTile.GRASS || ground[tileIndex(tx, ty)] === GroundTile.GRASS_FLOWERS) {
      if (objects[tileIndex(tx, ty)] === ObjectTile.NONE) {
        setAt(objects, tx, ty, ObjectTile.TREE_OAK);
      }
    }
  }
  for (const [tx, ty] of pineCoords) {
    if (ground[tileIndex(tx, ty)] === GroundTile.GRASS || ground[tileIndex(tx, ty)] === GroundTile.GRASS_FLOWERS) {
      if (objects[tileIndex(tx, ty)] === ObjectTile.NONE) {
        setAt(objects, tx, ty, ObjectTile.TREE_PINE);
      }
    }
  }

  // Subtle corner posts marking open northeast expansion plot
  setAt(objects, 46, 8, ObjectTile.SIGNPOST);

  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    ground,
    objects,
  };
}

export function packMapToChunks(map: WorldMapData): ChunkRecord[] {
  const chunksX = Math.ceil(map.width / CHUNK_SIZE);
  const chunksY = Math.ceil(map.height / CHUNK_SIZE);
  const chunks: ChunkRecord[] = [];

  for (let cy = 0; cy < chunksY; cy++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const g: number[] = [];
      const o: number[] = [];
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = cx * CHUNK_SIZE + lx;
          const wy = cy * CHUNK_SIZE + ly;
          const idx = tileIndex(wx, wy);
          g.push(map.ground[idx] ?? GroundTile.GRASS);
          o.push(map.objects[idx] ?? ObjectTile.NONE);
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

export function unpackChunksToMap(chunks: ChunkRecord[]): WorldMapData {
  const total = WORLD_WIDTH * WORLD_HEIGHT;
  const ground = new Array<number>(total).fill(GroundTile.GRASS);
  const objects = new Array<number>(total).fill(ObjectTile.NONE);

  for (const ch of chunks) {
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ch.chunkX * CHUNK_SIZE + lx;
        const wy = ch.chunkY * CHUNK_SIZE + ly;
        if (wx < WORLD_WIDTH && wy < WORLD_HEIGHT) {
          const localIdx = ly * CHUNK_SIZE + lx;
          const worldIdx = tileIndex(wx, wy);
          ground[worldIdx] = ch.ground[localIdx] ?? GroundTile.GRASS;
          objects[worldIdx] = ch.objects[localIdx] ?? ObjectTile.NONE;
        }
      }
    }
  }

  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    ground,
    objects,
  };
}
