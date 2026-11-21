export const WORLD_WIDTH = 192;
export const WORLD_HEIGHT = 144;
export const CHUNK_SIZE = 16;
export const TILE_SIZE = 24;

export const SPAWN_TILE = {
  x: Math.floor(WORLD_WIDTH * 0.52),
  y: Math.floor(WORLD_HEIGHT * 0.50) + 10,
};

export enum GroundTile {
  GRASS = 0,
  GRASS_FLOWERS = 1,
  STONE_PATH = 2,
  DIRT_SOIL = 3,
  WOOD_FLOOR = 4,
  WATER = 5,
  SAND_SHORE = 6,
  PLAZA_STONE = 7,
  GRASS_TUFT = 8,
  BRIDGE = 9,
  ROAD_EDGE = 10,
}

export enum ObjectTile {
  NONE = 0,
  WOOD_WALL = 1,
  STONE_WALL = 2,
  ROOF_TERRACOTTA = 3,
  ROOF_SLATE = 4,
  WOOD_DOOR = 5,
  FENCE = 6,
  TREE_OAK = 7,
  TREE_PINE = 8,
  LAMP_POST = 9,
  CROP_CARROT = 10,
  CROP_SUNFLOWER = 11,
  FLOWER_BED = 12,
  WELL = 13,
  BENCH = 14,
  BARREL = 15,
  SHEEP = 16,
  CHICKEN = 17,
  HAY_BALE = 18,
  LANTERN_TOWER = 19,
  SIGNPOST = 20,
  PIER_POST = 21,
  WINDOW = 22,
  CRATE = 23,
  BUSH = 24,
}

export type TileLayer = 'ground' | 'object';

export interface PaletteItem {
  id: string;
  label: string;
  layer: TileLayer;
  tileId: number;
  category: 'terrain' | 'structure' | 'decor';
  solid: boolean;
}

export const BUILD_PALETTE: PaletteItem[] = [
  { id: 'stone_path', label: 'Stone Road', layer: 'ground', tileId: GroundTile.STONE_PATH, category: 'terrain', solid: false },
  { id: 'wood_floor', label: 'Wood Plank', layer: 'ground', tileId: GroundTile.WOOD_FLOOR, category: 'terrain', solid: false },
  { id: 'grass', label: 'Meadow Grass', layer: 'ground', tileId: GroundTile.GRASS, category: 'terrain', solid: false },
  { id: 'dirt_soil', label: 'Farm Soil', layer: 'ground', tileId: GroundTile.DIRT_SOIL, category: 'terrain', solid: false },
  { id: 'wood_wall', label: 'Timber Wall', layer: 'object', tileId: ObjectTile.WOOD_WALL, category: 'structure', solid: true },
  { id: 'stone_wall', label: 'Stone Wall', layer: 'object', tileId: ObjectTile.STONE_WALL, category: 'structure', solid: true },
  { id: 'roof_clay', label: 'Clay Roof', layer: 'object', tileId: ObjectTile.ROOF_TERRACOTTA, category: 'structure', solid: true },
  { id: 'wood_door', label: 'Doorway', layer: 'object', tileId: ObjectTile.WOOD_DOOR, category: 'structure', solid: false },
  { id: 'fence', label: 'Wood Fence', layer: 'object', tileId: ObjectTile.FENCE, category: 'structure', solid: true },
  { id: 'roof_slate', label: 'Dark Roof', layer: 'object', tileId: ObjectTile.ROOF_SLATE, category: 'structure', solid: true },
  { id: 'window', label: 'Window Wall', layer: 'object', tileId: ObjectTile.WINDOW, category: 'structure', solid: true },
  { id: 'bridge', label: 'Wood Bridge', layer: 'ground', tileId: GroundTile.BRIDGE, category: 'terrain', solid: false },
  { id: 'lamp', label: 'Street Lamp', layer: 'object', tileId: ObjectTile.LAMP_POST, category: 'decor', solid: true },
  { id: 'crops', label: 'Crops', layer: 'object', tileId: ObjectTile.CROP_CARROT, category: 'decor', solid: false },
  { id: 'flowers', label: 'Flower Box', layer: 'object', tileId: ObjectTile.FLOWER_BED, category: 'decor', solid: false },
  { id: 'bench', label: 'Park Bench', layer: 'object', tileId: ObjectTile.BENCH, category: 'decor', solid: false },
  { id: 'crate', label: 'Wood Crate', layer: 'object', tileId: ObjectTile.CRATE, category: 'decor', solid: true },
  { id: 'bush', label: 'Leafy Bush', layer: 'object', tileId: ObjectTile.BUSH, category: 'decor', solid: true },
  { id: 'tree_oak', label: 'Oak Tree', layer: 'object', tileId: ObjectTile.TREE_OAK, category: 'decor', solid: true },
  { id: 'water', label: 'Pond Water', layer: 'ground', tileId: GroundTile.WATER, category: 'terrain', solid: true },
];

export const ALLOWED_GROUND_TILES = new Set<number>([
  GroundTile.GRASS,
  GroundTile.GRASS_FLOWERS,
  GroundTile.GRASS_TUFT,
  GroundTile.STONE_PATH,
  GroundTile.ROAD_EDGE,
  GroundTile.DIRT_SOIL,
  GroundTile.WOOD_FLOOR,
  GroundTile.WATER,
  GroundTile.SAND_SHORE,
  GroundTile.PLAZA_STONE,
  GroundTile.BRIDGE,
]);

export const ALLOWED_OBJECT_TILES = new Set<number>([
  ObjectTile.NONE,
  ObjectTile.WOOD_WALL,
  ObjectTile.STONE_WALL,
  ObjectTile.ROOF_TERRACOTTA,
  ObjectTile.ROOF_SLATE,
  ObjectTile.WOOD_DOOR,
  ObjectTile.WINDOW,
  ObjectTile.FENCE,
  ObjectTile.TREE_OAK,
  ObjectTile.TREE_PINE,
  ObjectTile.BUSH,
  ObjectTile.LAMP_POST,
  ObjectTile.CROP_CARROT,
  ObjectTile.CROP_SUNFLOWER,
  ObjectTile.FLOWER_BED,
  ObjectTile.BENCH,
  ObjectTile.BARREL,
  ObjectTile.CRATE,
  ObjectTile.HAY_BALE,
  ObjectTile.SIGNPOST,
]);

const SOLID_OBJECTS = new Set<number>([
  ObjectTile.WOOD_WALL,
  ObjectTile.STONE_WALL,
  ObjectTile.ROOF_TERRACOTTA,
  ObjectTile.ROOF_SLATE,
  ObjectTile.WINDOW,
  ObjectTile.FENCE,
  ObjectTile.TREE_OAK,
  ObjectTile.TREE_PINE,
  ObjectTile.BUSH,
  ObjectTile.LAMP_POST,
  ObjectTile.WELL,
  ObjectTile.BARREL,
  ObjectTile.CRATE,
  ObjectTile.SHEEP,
  ObjectTile.CHICKEN,
  ObjectTile.HAY_BALE,
  ObjectTile.LANTERN_TOWER,
  ObjectTile.SIGNPOST,
  ObjectTile.PIER_POST,
]);

export function isGroundSolid(ground: number): boolean {
  return ground === GroundTile.WATER;
}

export function isObjectSolid(obj: number): boolean {
  return SOLID_OBJECTS.has(obj);
}

export function isTileSolid(ground: number, obj: number): boolean {
  return isGroundSolid(ground) || isObjectSolid(obj);
}

export function getSpawnPoints(width = WORLD_WIDTH, height = WORLD_HEIGHT): Array<{ x: number; y: number }> {
  if (width < 96) {
    // Legacy 64x48 starter map spawn ring
    return [
      { x: 31, y: 26 },
      { x: 29, y: 26 },
      { x: 33, y: 26 },
      { x: 31, y: 27 },
      { x: 30, y: 27 },
      { x: 32, y: 27 },
    ];
  }
  const cx = Math.floor(width * 0.52);
  const cy = Math.floor(height * 0.50);
  return [
    { x: cx, y: cy + 10 },
    { x: cx - 2, y: cy + 10 },
    { x: cx + 2, y: cy + 10 },
    { x: cx - 4, y: cy + 10 },
    { x: cx + 4, y: cy + 10 },
    { x: cx - 6, y: cy + 10 },
    { x: cx + 6, y: cy + 10 },
    { x: cx, y: cy + 12 },
    { x: cx - 3, y: cy + 12 },
    { x: cx + 3, y: cy + 12 },
    { x: cx - 6, y: cy + 12 },
    { x: cx + 6, y: cy + 12 },
    { x: cx, y: cy - 10 },
    { x: cx - 3, y: cy - 10 },
    { x: cx + 3, y: cy - 10 },
  ];
}

export function isProtectedLandmarkTile(x: number, y: number, width = WORLD_WIDTH, height = WORLD_HEIGHT): boolean {
  if (width < 96) {
    if (x === 31 && y === 23) return true;
    if (x === 31 && y === 26) return true;
    if (x === 55 && y === 32) return true;
    return false;
  }
  const cx = Math.floor(width * 0.52);
  const cy = Math.floor(height * 0.50);
  // Protect central village well and immediate 1-tile rim
  if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) return true;
  // Protect primary spawn pad
  if (x === cx && y === cy + 10) return true;
  return false;
}

export function isInBuildZone(x: number, y: number, width = WORLD_WIDTH, height = WORLD_HEIGHT): boolean {
  if (width < 96) {
    const nwClearing = x >= 4 && x <= 22 && y >= 4 && y <= 13;
    const neClearing = x >= 44 && x <= 60 && y >= 4 && y <= 14;
    const westGarden = x >= 6 && x <= 24 && y >= 15 && y <= 26;
    const southMeadow = x >= 24 && x <= 40 && y >= 33 && y <= 44;
    return nwClearing || neClearing || westGarden || southMeadow;
  }
  // Open neighborhood build plots reserved outside the central square and main avenues
  const cx = Math.floor(width * 0.52);
  const cy = Math.floor(height * 0.50);
  const inCentralPlaza = x >= cx - 12 && x <= cx + 12 && y >= cy - 10 && y <= cy + 10;
  if (inCentralPlaza) return false;

  const plotNW = x >= Math.floor(width * 0.08) && x <= Math.floor(width * 0.25) && y >= Math.floor(height * 0.24) && y <= Math.floor(height * 0.44);
  const plotNE = x >= Math.floor(width * 0.53) && x <= Math.floor(width * 0.68) && y >= Math.floor(height * 0.08) && y <= Math.floor(height * 0.36);
  const plotSW = x >= Math.floor(width * 0.08) && x <= Math.floor(width * 0.25) && y >= Math.floor(height * 0.55) && y <= Math.floor(height * 0.69);
  const plotS = x >= Math.floor(width * 0.32) && x <= Math.floor(width * 0.68) && y >= Math.floor(height * 0.78) && y <= Math.floor(height * 0.94);
  const plotE = x >= Math.floor(width * 0.76) && x <= Math.floor(width * 0.94) && y >= Math.floor(height * 0.36) && y <= Math.floor(height * 0.68);
  return plotNW || plotNE || plotSW || plotS || plotE;
}

export const AVATAR_COLORS = [
  { id: 'moss', label: 'Forest Moss', hex: '#2D6A4F' },
  { id: 'terracotta', label: 'Terracotta', hex: '#B85032' },
  { id: 'slate', label: 'Harbor Blue', hex: '#355C7D' },
  { id: 'ochre', label: 'Harvest Gold', hex: '#B7791F' },
  { id: 'plum', label: 'Berry Plum', hex: '#6B3E5E' },
  { id: 'pine', label: 'Deep Pine', hex: '#1B4332' },
  { id: 'rust', label: 'Cedar Red', hex: '#9B2C2C' },
  { id: 'teal', label: 'Lake Teal', hex: '#285E61' },
];

export const HAT_STYLES = [
  { id: 'none', label: 'No Hat' },
  { id: 'straw', label: 'Straw Hat' },
  { id: 'cap', label: 'Wool Cap' },
  { id: 'flower', label: 'Wildflower' },
] as const;

export type HatStyle = (typeof HAT_STYLES)[number]['id'];

export function tileIndex(x: number, y: number, width = WORLD_WIDTH): number {
  return y * width + x;
}
