import type { HatStyle } from './tiles.ts';

export type QuestId =
  | 'q1_well_notice'
  | 'q2_clara_satchels'
  | 'q3_dial_chest'
  | 'q4_meadow_footprints'
  | 'q5_lantern_riddle'
  | 'q6_symbol_altar'
  | 'q7_twin_plates'
  | 'q8_founders_vault';

export type AdventureNodeKind =
  | 'landmark'
  | 'note'
  | 'npc'
  | 'satchel'
  | 'chest'
  | 'puzzle_altar'
  | 'pressure_plate'
  | 'hidden_door'
  | 'curio';

export type EmblemSymbolId = 'well' | 'wheat' | 'wave' | 'lantern';

export interface AdventureItemDef {
  id: string;
  name: string;
  category: 'key' | 'map' | 'relic' | 'curio';
  description: string;
}

export interface AdventureClueDef {
  id: string;
  title: string;
  location: string;
  author: string;
  body: string;
  questId: QuestId;
}

export interface AdventureQuestDef {
  id: QuestId;
  order: number;
  title: string;
  shortObjective: string;
  storyReason: string;
  rewardSummary: string;
  hints: string[];
  targetAreaLabel: string;
}

export interface AdventureNpcAppearance {
  avatarColor: string;
  hatStyle: HatStyle;
  roleTitle: string;
}

export interface AdventureNodeDef {
  id: string;
  kind: AdventureNodeKind;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  questId?: QuestId;
  clueId?: string;
  itemId?: string;
  puzzleType?: 'dial_lock' | 'emblem_order' | 'vault_chest';
  npc?: AdventureNpcAppearance;
  inspectionText: string;
  afterText?: string;
  lockedText?: string;
}

export interface AdventureActivityEntry {
  id: string;
  actorName: string;
  text: string;
  timestamp: number;
}

export interface AdventureState {
  chapterId: string;
  chapterTitle: string;
  completedQuests: QuestId[];
  discoveredClues: string[];
  collectedItems: string[];
  inspectedNodes: string[];
  openedChests: string[];
  unlockedChests: string[];
  solvedPuzzles: string[];
  hiddenDoorOpen: boolean;
  activePlates: {
    plateA: boolean;
    plateB: boolean;
  };
  recentDiscoveries: AdventureActivityEntry[];
}

export interface AdventureNotification {
  id: string;
  actorName: string;
  kind: 'clue' | 'item' | 'quest' | 'puzzle' | 'mechanism' | 'story';
  title: string;
  detail: string;
  timestamp: number;
}

export const CHAPTER_1_ID = 'chapter_1';
export const CHAPTER_1_TITLE = "Chapter 1 · The Cartographer's Lantern";

export const DIAL_CHEST_CODE = '433';
export const EMBLEM_SEQUENCE_SOLUTION: EmblemSymbolId[] = ['well', 'wheat', 'wave', 'lantern'];

export const EMBLEM_OPTIONS: Array<{ id: EmblemSymbolId; label: string; caption: string }> = [
  { id: 'well', label: 'Spring Well', caption: 'Feeds the village square' },
  { id: 'wheat', label: 'Golden Wheat', caption: 'Feeds the folk at harvest' },
  { id: 'wave', label: 'Pond Wave', caption: 'Mirrors the open sky' },
  { id: 'lantern', label: 'Warm Lantern', caption: 'Guides travelers home' },
];

export const ADVENTURE_ITEMS: Record<string, AdventureItemDef> = {
  brass_ribbon: {
    id: 'brass_ribbon',
    name: "Alden's Brass Ribbon",
    category: 'relic',
    description: 'A stamped surveyor marker ribbon once tied to the central well.',
  },
  herb_satchel_1: {
    id: 'herb_satchel_1',
    name: 'North Garden Seed Satchel',
    category: 'relic',
    description: 'Pressed sunflower seeds belonging to Clara the Archivist.',
  },
  herb_satchel_2: {
    id: 'herb_satchel_2',
    name: 'Fencepost Herb Satchel',
    category: 'relic',
    description: 'Dried chamomile tied with linen twine for Clara.',
  },
  herb_satchel_3: {
    id: 'herb_satchel_3',
    name: 'Avenue Meadow Satchel',
    category: 'relic',
    description: 'Pressed wild thyme dropped near the northern crossroads.',
  },
  copper_field_key: {
    id: 'copper_field_key',
    name: 'Copper Field Key',
    category: 'key',
    description: "Given by Clara from her grandfather's desk. Engraved with a compass star.",
  },
  map_fragment_1: {
    id: 'map_fragment_1',
    name: 'Map Fragment I (West)',
    category: 'map',
    description: 'Shows the broken southwest pasture fence and muddy bootprints heading south.',
  },
  map_fragment_2: {
    id: 'map_fragment_2',
    name: 'Map Fragment II (East)',
    category: 'map',
    description: 'Traces a dotted survey line across the northeast pond bridge to the Lantern Tower.',
  },
  map_fragment_3: {
    id: 'map_fragment_3',
    name: 'Map Fragment III (Sanctuary)',
    category: 'map',
    description: 'Marks the ivy-covered Southeast Ruins and a sealed cavern doorway in the cliff.',
  },
  silver_vault_crest: {
    id: 'silver_vault_crest',
    name: 'Silver Vault Crest',
    category: 'key',
    description: 'Awarded by the Four Stone Pedestals. Fits the Founder’s Treasure Chest.',
  },
  founders_charter: {
    id: 'founders_charter',
    name: 'Pixelfield Free Charter & Astrolabe',
    category: 'relic',
    description:
      'The missing founding charter securing Pixelfield’s common lands forever, paired with Alden Mercer’s brass astrolabe.',
  },
  curio_spyglass: {
    id: 'curio_spyglass',
    name: 'Surveyor’s Pocket Spyglass',
    category: 'curio',
    description: 'A tiny brass lens tucked beside a northern cottage barrel.',
  },
  curio_carved_duck: {
    id: 'curio_carved_duck',
    name: 'Carved Cedar Pond Duck',
    category: 'curio',
    description: 'Whittled by Rowan during quiet afternoons by the bridge.',
  },
  curio_bell_clapper: {
    id: 'curio_bell_clapper',
    name: 'Old Brass Bell Clapper',
    category: 'curio',
    description: 'Rung at harvest festivals fifty years ago along the east lane.',
  },
};

export const ADVENTURE_CLUES: Record<string, AdventureClueDef> = {
  clue_plaza_well: {
    id: 'clue_plaza_well',
    title: "Alden's Plaza Ribbon Note",
    location: 'Central Stone Well',
    author: 'Alden Mercer, Village Surveyor',
    questId: 'q1_well_notice',
    body:
      'To whoever finds this note when the autumn waters calm: I have placed our village treasure beyond the reach of greedy bailiffs. Seek Clara west of the square—her grandfather kept my field ledger safe.',
  },
  clue_clara_ledger: {
    id: 'clue_clara_ledger',
    title: "Grandfather's Ledger Excerpt",
    location: 'West Plaza Arch (Clara)',
    author: 'Thomas, Village Archivist',
    questId: 'q2_clara_satchels',
    body:
      'Alden locked his field satchel in an ironbound chest along the western avenue. For the 3-number dial he wrote: "First, count the iron street lamps at the four corners of the central square. Second, count the white sheep in the southwest pasture. Third, count the stacked hay bales inside that same pasture."',
  },
  clue_west_signpost: {
    id: 'clue_west_signpost',
    title: 'West Avenue Marker',
    location: 'West Village Signpost',
    author: 'Surveyor Engraving',
    questId: 'q3_dial_chest',
    body:
      'Chiseled neatly into the post: "Four corner lamps watch over Pixelfield Square, day and night. Begin every count from the square."',
  },
  clue_pasture_fence: {
    id: 'clue_pasture_fence',
    title: 'Pasture Tally Board',
    location: 'Southwest Pasture Gate',
    author: 'Old Shepherd Chalkboard',
    questId: 'q3_dial_chest',
    body:
      'Chalk marks beside the gate: "3 woolly sheep grazing inside, 3 golden hay bales stacked in the northwest corner of the pen. Note the broken fence panel along the south edge."',
  },
  clue_satchel_journal: {
    id: 'clue_satchel_journal',
    title: "Alden's Field Satchel Page",
    location: 'Ironbound Chest (West Avenue)',
    author: 'Alden Mercer',
    questId: 'q4_meadow_footprints',
    body:
      'Inside the chest lies Map Fragment I and a hurried entry: "I slipped through the south gap in the pasture fence in the rain. Follow my bootprints southeast across the grass to the mossy boundary stone—my next clue rests inside the hollow oak nearby."',
  },
  clue_boundary_stone: {
    id: 'clue_boundary_stone',
    title: 'Surveyor’s Boundary Stone',
    location: 'South Meadow Trail',
    author: 'Chiseled Compass Mark',
    questId: 'q4_meadow_footprints',
    body:
      'Freshly carved arrow pointing directly east-southeast toward a mossy hollow oak stump just a few paces away.',
  },
  clue_hollow_stump: {
    id: 'clue_hollow_stump',
    title: 'Hollow Oak Map Tube',
    location: 'South Meadow Clearing',
    author: 'Alden Mercer',
    questId: 'q5_lantern_riddle',
    body:
      'Wrapped in oilcloth inside the stump is Map Fragment II. A charcoal sketch shows the northeast pond, its timber bridge, and the stone Lantern Tower where Rowan keeps watch.',
  },
  clue_lantern_inscription: {
    id: 'clue_lantern_inscription',
    title: 'The Order of Four Elements',
    location: 'Northeast Lantern Tower',
    author: 'Alden Mercer',
    questId: 'q6_symbol_altar',
    body:
      'Etched into the copper plaque at the tower base: "To wake the ruined altar in the southeast woods, set Pixelfield’s four emblems in the order of a day’s work: (1) First, the Spring Well that feeds the square. (2) Second, the Golden Wheat of the harvest. (3) Third, the Pond Wave mirroring the afternoon sky. (4) Fourth, the Warm Lantern guiding us home at dusk."',
  },
  clue_rowan_story: {
    id: 'clue_rowan_story',
    title: "Rowan's Memory of the Flood",
    location: 'Northeast Pond Bridge (Rowan)',
    author: 'Rowan the Ferryman',
    questId: 'q5_lantern_riddle',
    body:
      '"People whispered Alden ran off with gold," Rowan says quietly. "Truth is, I ferried him across the bay in the storm so he could register Pixelfield’s charter before speculators bought out our flooded farms. Before leaving, he hid the original deed and village reserve in the southeast ruins."',
  },
  clue_ruins_plates: {
    id: 'clue_ruins_plates',
    title: 'Altar Mechanism Diagram',
    location: 'Southeast Ruins Courtyard',
    author: 'Alden Mercer',
    questId: 'q7_twin_plates',
    body:
      'The altar’s inner drawer reveals a brass plate: "No single greed shall open Pixelfield’s vault. Step upon both twin pressure stones outside the cliff gate together to unlatch the cavern archway." (Playing solo? Stepping on one stone winds a 12-second chime latch so you can hurry to the second stone!)',
  },
  clue_alden_final_letter: {
    id: 'clue_alden_final_letter',
    title: "Alden Mercer's Final Letter",
    location: "Founder's Cavern Sanctuary",
    author: 'Alden Mercer',
    questId: 'q8_founders_vault',
    body:
      'Dear neighbors of Pixelfield — If you are standing inside this lantern room together, then the village spirit survived the flood. The true treasure inside this chest is our Free Village Charter, ensuring these gardens, homes, and ponds belong to everyone who cares for them. Keep the lantern lit.',
  },
};

export const ADVENTURE_QUESTS: AdventureQuestDef[] = [
  {
    id: 'q1_well_notice',
    order: 1,
    title: 'The Ribbon at the Well',
    shortObjective: 'Inspect the central stone well in Pixelfield Plaza.',
    storyReason:
      'Villagers noticed a weathered brass ribbon fluttering from the old plaza well—the signature mark of missing surveyor Alden Mercer.',
    rewardSummary: "Alden's Plaza Note & Brass Ribbon",
    targetAreaLabel: 'Central Plaza',
    hints: [
      'Walk straight north from the spawn square toward the roofed stone well in the middle of the green island.',
      'Stand beside the Central Well and press E (or click it) to inspect the attached parchment.',
    ],
  },
  {
    id: 'q2_clara_satchels',
    order: 2,
    title: "Clara's Lost Seed Satchels",
    shortObjective: 'Speak with Clara west of the plaza and find her 3 lost satchels north of the square.',
    storyReason:
      'Clara the Archivist holds her grandfather’s ledger about Alden, but she misplaced three pressed-herb satchels around the Sunflower Garden.',
    rewardSummary: "Grandfather's Ledger Clue & Copper Field Key",
    targetAreaLabel: 'West Plaza & North Sunflower Garden',
    hints: [
      'Talk to Clara standing just west of the central plaza green island.',
      'Search north along the road toward the Sunflower Garden fence—look for 3 woven herb satchels with bright ribbons.',
      'Once all 3 satchels are collected, return to Clara to receive her grandfather’s ledger and the Copper Field Key.',
    ],
  },
  {
    id: 'q3_dial_chest',
    order: 3,
    title: 'The Ironbound Field Chest',
    shortObjective: 'Open Alden’s locked chest west of the plaza using clues from the square and pasture.',
    storyReason:
      'Clara’s ledger reveals Alden hid his map satchel inside a 3-dial ironbound chest along the western avenue.',
    rewardSummary: 'Map Fragment I (West)',
    targetAreaLabel: 'Western Avenue & Southwest Pasture',
    hints: [
      'Walk west along the main stone avenue to find the locked ironbound chest near the western cottages.',
      'Read the 3 counts in Grandfather’s Ledger: corner lamps around the central square (4), white sheep in the southwest pasture (3), and hay bales in the pasture (3).',
      'Set the chest dial to 4 - 3 - 3 and press Unlock Chest.',
    ],
  },
  {
    id: 'q4_meadow_footprints',
    order: 4,
    title: 'Footprints in the South Meadow',
    shortObjective: 'Follow the muddy bootprints from the broken pasture fence to the hollow oak stump.',
    storyReason:
      'Map Fragment I sketches a muddy escape trail leaving the southwest pasture toward a mossy surveyor stone in the southern clearing.',
    rewardSummary: 'Map Fragment II (East)',
    targetAreaLabel: 'Southwest Pasture & South Meadow',
    hints: [
      'Head to the bottom fence of the southwest animal pasture and look for the broken gap with muddy footprints leading southeast.',
      'Follow the footprints past the mossy Boundary Stone to find the parchment tucked beside the Hollow Oak Stump.',
    ],
  },
  {
    id: 'q5_lantern_riddle',
    order: 5,
    title: 'The Ferryman at Lantern Pond',
    shortObjective: 'Cross the northeast pond bridge, speak with Rowan, and inspect the Lantern Tower.',
    storyReason:
      'Map Fragment II points across the wooden bridge to the northeast pond—where old ferryman Rowan saw Alden on the night he left.',
    rewardSummary: 'Map Fragment III & Order of Four Elements',
    targetAreaLabel: 'Northeast Pond & Lantern Tower',
    hints: [
      'Follow the main avenue east and then turn north along the east road to reach the sparkling pond.',
      'Cross the wooden bridge to talk to Rowan the Ferryman, then inspect the tall stone Lantern Tower on the eastern bank.',
    ],
  },
  {
    id: 'q6_symbol_altar',
    order: 6,
    title: 'The Four Stone Pedestals',
    shortObjective: 'Travel to the southeast stone ruins and arrange the four village emblems in order.',
    storyReason:
      'Map Fragment III reveals an ivy-draped stone ruin tucked into the southeast woods, guarded by Alden’s four-emblem altar.',
    rewardSummary: 'Silver Vault Crest & Cavern Gate Blueprint',
    targetAreaLabel: 'Southeast Stone Ruins',
    hints: [
      'Head south along the east avenue toward the southeast woods until you spot mossy stone pillars and ruined flagstones.',
      'Inspect the carved Symbol Altar and match the Lantern Tower plaque: 1. Spring Well, 2. Golden Wheat, 3. Pond Wave, 4. Warm Lantern.',
    ],
  },
  {
    id: 'q7_twin_plates',
    order: 7,
    title: 'The Twin Pressure Stones',
    shortObjective: 'Activate both stone pressure plates outside the cliff ruin to open the hidden cavern path.',
    storyReason:
      'Alden sealed the cavern entrance behind twin surveyor switches so villagers working together could unlatch the sanctuary.',
    rewardSummary: "Hidden Path to Founder's Cavern Opened",
    targetAreaLabel: 'Southeast Ruins Cliff Gate',
    hints: [
      'Look just east of the Symbol Altar for two recessed brass-and-stone floor plates outside the sealed cliff doorway.',
      'Have two friends stand on both plates at the same time—or if exploring solo, step on one plate to wind its 12-second chime latch and walk quickly onto the second plate!',
    ],
  },
  {
    id: 'q8_founders_vault',
    order: 8,
    title: "The Founder's Vault",
    shortObjective: "Enter the opened cavern, read Alden's final letter, and unlock the Founder's Treasure Chest.",
    storyReason:
      'The stone archway has slid open, revealing a warm lantern-lit cavern holding Pixelfield’s true lost treasure.',
    rewardSummary: 'Pixelfield Free Charter & Golden Astrolabe',
    targetAreaLabel: "Founder's Cavern (Southeast)",
    hints: [
      'Walk straight north through the newly opened cavern doorway into the lit sanctuary chamber.',
      "Read Alden's Final Letter beside the lantern, then inspect the grand Founder's Treasure Chest to unlock it with your Copper Key and Silver Crest!",
    ],
  },
];

export interface AdventureLayoutAnchors {
  cx: number;
  cy: number;
  brokenFenceX: number;
  brokenFenceY: number;
  boundaryStoneX: number;
  boundaryStoneY: number;
  hollowStumpX: number;
  hollowStumpY: number;
  pondX: number;
  pondY: number;
  lanternX: number;
  lanternY: number;
  ruinsX: number;
  ruinsY: number;
  altarX: number;
  altarY: number;
  plateAX: number;
  plateAY: number;
  plateBX: number;
  plateBY: number;
  doorX: number;
  doorY: number;
  cavernCenterX: number;
  cavernCenterY: number;
}

export function getAdventureAnchors(width: number, height: number): AdventureLayoutAnchors {
  if (width < 96) {
    // Graceful compact layout for legacy 64x48 worlds
    return {
      cx: 31,
      cy: 23,
      brokenFenceX: 14,
      brokenFenceY: 33,
      boundaryStoneX: 20,
      boundaryStoneY: 38,
      hollowStumpX: 26,
      hollowStumpY: 41,
      pondX: 48,
      pondY: 36,
      lanternX: 55,
      lanternY: 32,
      ruinsX: 45,
      ruinsY: 10,
      altarX: 49,
      altarY: 12,
      plateAX: 52,
      plateAY: 14,
      plateBX: 56,
      plateBY: 14,
      doorX: 54,
      doorY: 11,
      cavernCenterX: 54,
      cavernCenterY: 7,
    };
  }

  const cx = Math.floor(width * 0.52); // 99
  const cy = Math.floor(height * 0.50); // 72
  const pondX = Math.floor(width * 0.84); // 161
  const pondY = Math.floor(height * 0.21); // 30
  const lanternX = pondX + 13; // 174
  const lanternY = pondY - 2; // 28

  // Southwest pasture sits at x=4, y=floor(h*0.56)=80, w=26, h=18 -> south fence y=97
  const brokenFenceX = 20;
  const brokenFenceY = Math.floor(height * 0.56) + Math.floor(height * 0.13) - 1; // 97
  const boundaryStoneX = 34;
  const boundaryStoneY = Math.floor(height * 0.78); // 112
  const hollowStumpX = 44;
  const hollowStumpY = Math.floor(height * 0.83); // 119

  // Southeast Ruins & Founder's Cavern nestled peacefully in open SE clearing (between southRoadY=103 and SE farm at x=147, y=112)
  // Place Ruins Courtyard at x=116..140, y=112..134 so it never overlaps any road, house, or farm!
  const ruinsX = Math.floor(width * 0.62); // 119
  const ruinsY = Math.floor(height * 0.81); // 116
  const altarX = ruinsX + 3; // 122
  const altarY = ruinsY + 6; // 122
  const plateAX = ruinsX + 10; // 129
  const plateAY = ruinsY + 9; // 125
  const plateBX = ruinsX + 16; // 135
  const plateBY = ruinsY + 9; // 125
  const doorX = ruinsX + 13; // 132
  const doorY = ruinsY + 5; // 121
  const cavernCenterX = doorX; // 132
  const cavernCenterY = doorY - 4; // 117

  return {
    cx,
    cy,
    brokenFenceX,
    brokenFenceY,
    boundaryStoneX,
    boundaryStoneY,
    hollowStumpX,
    hollowStumpY,
    pondX,
    pondY,
    lanternX,
    lanternY,
    ruinsX,
    ruinsY,
    altarX,
    altarY,
    plateAX,
    plateAY,
    plateBX,
    plateBY,
    doorX,
    doorY,
    cavernCenterX,
    cavernCenterY,
  };
}

export function getAdventureNodesForMap(width: number, height: number): AdventureNodeDef[] {
  const a = getAdventureAnchors(width, height);
  const mainRoadY = width < 96 ? 22 : Math.floor(height * 0.48); // 69
  const westRoadX = width < 96 ? 16 : Math.floor(width * 0.28); // 53
  const sunflowerFarmX = width < 96 ? 18 : Math.floor(width * 0.33); // 63
  const sunflowerFarmY = width < 96 ? 8 : 6;
  const pastureY = width < 96 ? 28 : Math.floor(height * 0.56); // 80

  return [
    // QUEST 1: Central Well
    {
      id: 'plaza_well',
      kind: 'landmark',
      name: 'Central Stone Well',
      subtitle: 'Pixelfield Plaza',
      x: a.cx,
      y: a.cy,
      questId: 'q1_well_notice',
      clueId: 'clue_plaza_well',
      itemId: 'brass_ribbon',
      inspectionText:
        'Tied neatly to the timber beam of the old well is a brass surveyor ribbon holding a dry parchment scroll.',
      afterText:
        'The village well draws cool spring water beneath the central green. Alden’s note sent you to find Clara west of the plaza.',
    },

    // QUEST 2: Clara & 3 Seed Satchels
    {
      id: 'npc_clara',
      kind: 'npc',
      name: 'Clara the Archivist',
      subtitle: 'Village Historian',
      x: a.cx - 8,
      y: a.cy + 1,
      questId: 'q2_clara_satchels',
      clueId: 'clue_clara_ledger',
      itemId: 'copper_field_key',
      npc: {
        avatarColor: '#6B3E5E',
        hatStyle: 'flower',
        roleTitle: 'Archivist',
      },
      inspectionText:
        '"Alden Mercer’s brass ribbon! My grandfather guarded his surveying ledger for decades. I would unlock my desk right now, but I dropped 3 pressed-herb satchels along the northern road near the Sunflower Garden. If your group gathers all three, the ledger and grandfather’s Copper Key are yours!"',
      afterText:
        '"Thank you for bringing back all three satchels! Keep Grandfather’s Ledger close—it explains the 3 numbers on Alden’s locked chest down the western avenue."',
    },
    {
      id: 'herb_satchel_1',
      kind: 'satchel',
      name: 'Woven Seed Satchel',
      subtitle: 'Near Sunflower Garden Gate',
      x: sunflowerFarmX + 12,
      y: sunflowerFarmY + (width < 96 ? 8 : 20),
      questId: 'q2_clara_satchels',
      itemId: 'herb_satchel_1',
      inspectionText:
        'You found one of Clara’s pressed-sunflower seed satchels resting beside the garden gate!',
      afterText: 'Already returned to the group satchel for Clara.',
    },
    {
      id: 'herb_satchel_2',
      kind: 'satchel',
      name: 'Chamomile Herb Satchel',
      subtitle: 'North Crossroads Fence',
      x: Math.max(8, a.cx - 14),
      y: Math.max(8, a.cy - 18),
      questId: 'q2_clara_satchels',
      itemId: 'herb_satchel_2',
      inspectionText:
        'Tucked beside the meadow grass is Clara’s chamomile satchel tied with linen twine!',
      afterText: 'Already collected for Clara.',
    },
    {
      id: 'herb_satchel_3',
      kind: 'satchel',
      name: 'Wild Thyme Satchel',
      subtitle: 'Sunflower Garden East Path',
      x: sunflowerFarmX + (width < 96 ? 12 : 24),
      y: sunflowerFarmY + (width < 96 ? 10 : 12),
      questId: 'q2_clara_satchels',
      itemId: 'herb_satchel_3',
      inspectionText:
        'You spotted Clara’s third satchel of wild thyme by the blooming golden rows!',
      afterText: 'Already collected for Clara.',
    },

    // QUEST 3: Western Clues & Locked Dial Chest
    {
      id: 'west_signpost',
      kind: 'note',
      name: 'West Avenue Marker',
      subtitle: 'Carved Timber Signpost',
      x: westRoadX + 5,
      y: mainRoadY - 1,
      questId: 'q3_dial_chest',
      clueId: 'clue_west_signpost',
      inspectionText:
        'An old carved signpost stands along the western avenue, bearing a surveyor’s inscription about Pixelfield Square.',
    },
    {
      id: 'pasture_clue',
      kind: 'note',
      name: 'Pasture Tally Board',
      subtitle: 'Southwest Animal Pasture',
      x: width < 96 ? 12 : 18,
      y: pastureY + (width < 96 ? 6 : 19),
      questId: 'q3_dial_chest',
      clueId: 'clue_pasture_fence',
      inspectionText:
        'A weathered shepherd’s board hangs by the pasture gate listing the sheep and hay bales kept inside.',
    },
    {
      id: 'west_satchel_chest',
      kind: 'chest',
      name: "Alden's Ironbound Field Chest",
      subtitle: '3-Digit Brass Dial Lock',
      x: westRoadX - 2,
      y: mainRoadY + 6,
      questId: 'q3_dial_chest',
      clueId: 'clue_satchel_journal',
      itemId: 'map_fragment_1',
      puzzleType: 'dial_lock',
      inspectionText:
        'A sturdy timber-and-iron surveying chest rests under the avenue lamp. Its brass dial turns from 0 to 9 on three wheels.',
      afterText:
        'The ironbound chest stands open. Inside you recovered Map Fragment I and Alden’s note pointing toward the south meadow.',
    },

    // QUEST 4: Broken Fence Trail, Boundary Stone & Hollow Stump
    {
      id: 'south_boundary_stone',
      kind: 'landmark',
      name: 'Surveyor’s Boundary Stone',
      subtitle: 'South Meadow Trail',
      x: a.boundaryStoneX,
      y: a.boundaryStoneY,
      questId: 'q4_meadow_footprints',
      clueId: 'clue_boundary_stone',
      inspectionText:
        'Muddy bootprints lead straight to this mossy stone. A brass compass arrow is chiseled deep into its crown, pointing southeast.',
    },
    {
      id: 'south_hollow_stump',
      kind: 'note',
      name: 'Hollow Oak Stump',
      subtitle: 'South Meadow Clearing',
      x: a.hollowStumpX,
      y: a.hollowStumpY,
      questId: 'q4_meadow_footprints',
      clueId: 'clue_hollow_stump',
      itemId: 'map_fragment_2',
      inspectionText:
        'Nestled inside the dry hollow of an old oak root lies a waxed map tube containing Map Fragment II!',
      afterText:
        'The hollow oak held Map Fragment II, tracing a path across the northeast pond bridge to the Lantern Tower.',
    },

    // QUEST 5: Northeast Pond Bridge, Rowan & Lantern Tower
    {
      id: 'npc_rowan',
      kind: 'npc',
      name: 'Rowan the Ferryman',
      subtitle: 'Keeper of Lantern Pond',
      x: a.pondX + 6,
      y: a.pondY,
      questId: 'q5_lantern_riddle',
      clueId: 'clue_rowan_story',
      npc: {
        avatarColor: '#285E61',
        hatStyle: 'straw',
        roleTitle: 'Ferryman',
      },
      inspectionText:
        '"Well now, look at those map pieces! I’m Rowan. Fifty years back I rowed Alden Mercer across the bay during the Great Flood. He never stole a coin—he hid the village charter to protect Pixelfield from land sharks. Check the copper plaque on the Lantern Tower right behind me!"',
      afterText:
        '"The Lantern Tower plaque gives the exact order for the Southeast Ruins altar. Take care by the mossy cliff stones!"',
    },
    {
      id: 'pond_lantern_tower',
      kind: 'landmark',
      name: 'Lakeside Lantern Tower',
      subtitle: 'Northeast Pond Bank',
      x: a.lanternX,
      y: a.lanternY,
      questId: 'q5_lantern_riddle',
      clueId: 'clue_lantern_inscription',
      itemId: 'map_fragment_3',
      inspectionText:
        'A warm beacon glows atop the tapered stone tower. Behind a loose brick at the base sits Map Fragment III alongside a copper plaque inscribed with the Order of Four Elements.',
      afterText:
        'The tower plaque reads: Spring Well → Golden Wheat → Pond Wave → Warm Lantern.',
    },

    // QUEST 6: Southeast Ruins Symbol Altar
    {
      id: 'ruins_symbol_altar',
      kind: 'puzzle_altar',
      name: 'Four-Emblem Stone Altar',
      subtitle: 'Southeast Ruins Courtyard',
      x: a.altarX,
      y: a.altarY,
      questId: 'q6_symbol_altar',
      clueId: 'clue_ruins_plates',
      itemId: 'silver_vault_crest',
      puzzleType: 'emblem_order',
      inspectionText:
        'Four weathered sandstone recesses await Pixelfield’s carved emblems in the exact order described at the Lantern Tower.',
      afterText:
        'The four stone emblems glow softly in their correct sequence. A hidden drawer released the Silver Vault Crest and lit the twin pressure stones to the east.',
    },

    // QUEST 7: Twin Cooperative Pressure Plates & Sealed Cavern Gate
    {
      id: 'coop_plate_a',
      kind: 'pressure_plate',
      name: 'West Pressure Stone',
      subtitle: 'Twin Mechanism Switch',
      x: a.plateAX,
      y: a.plateAY,
      questId: 'q7_twin_plates',
      inspectionText:
        'A recessed stone plate engraved with twin hands. Stand on both West and East Pressure Stones simultaneously with a friend—or step across quickly while the 12-second brass chime holds the latch!',
      afterText: 'The twin mechanism has already unlatched the Founder’s Cavern doorway!',
    },
    {
      id: 'coop_plate_b',
      kind: 'pressure_plate',
      name: 'East Pressure Stone',
      subtitle: 'Twin Mechanism Switch',
      x: a.plateBX,
      y: a.plateBY,
      questId: 'q7_twin_plates',
      inspectionText:
        'The second recessed pressure stone. Activate both stones together to slide open the sealed cliff archway.',
      afterText: 'The twin mechanism has already unlatched the Founder’s Cavern doorway!',
    },
    {
      id: 'hidden_cavern_door',
      kind: 'hidden_door',
      name: 'Sealed Cavern Archway',
      subtitle: 'Southeast Cliff Ruin',
      x: a.doorX,
      y: a.doorY,
      questId: 'q7_twin_plates',
      inspectionText:
        'Heavy stone slabs seal a hidden cavern carved into the hillside. Two recessed pressure plates sit just south of the archway.',
      afterText: 'The stone doorway stands wide open, revealing the warm glow of Founder’s Cavern inside!',
    },

    // QUEST 8: Inside Founder's Cavern
    {
      id: 'alden_final_letter',
      kind: 'note',
      name: "Alden's Final Letter",
      subtitle: "Founder's Cavern Sanctuary",
      x: a.cavernCenterX - 2,
      y: a.cavernCenterY + 1,
      questId: 'q8_founders_vault',
      clueId: 'clue_alden_final_letter',
      inspectionText:
        'Beneath a warm brass lantern lies an unsealed letter addressed simply: "To the Friends of Pixelfield."',
    },
    {
      id: 'founders_vault_chest',
      kind: 'chest',
      name: "Founder's Treasure Chest",
      subtitle: "Alden Mercer's Cache",
      x: a.cavernCenterX,
      y: a.cavernCenterY - 1,
      questId: 'q8_founders_vault',
      itemId: 'founders_charter',
      puzzleType: 'vault_chest',
      inspectionText:
        'A grand oak-and-brass treasure chest rests at the center of the lit sanctuary, bearing two keyholes: one for a Copper Field Key and one for a Silver Vault Crest.',
      lockedText:
        'You need both Clara’s Copper Field Key and the Silver Vault Crest from the Ruins Altar to unseal the Founder’s Treasure Chest.',
      afterText:
        'The Founder’s Treasure Chest gleams open! Pixelfield’s Free Village Charter and Alden’s Golden Astrolabe are safely home.',
    },

    // OPTIONAL BONUS CURIOS (Exploration rewards across the village)
    {
      id: 'curio_north_spyglass',
      kind: 'curio',
      name: 'Glinting Brass Tube',
      subtitle: 'Northern Cottage Yard',
      x: width < 96 ? 26 : Math.floor(width * 0.42),
      y: width < 96 ? 12 : Math.floor(height * 0.37),
      itemId: 'curio_spyglass',
      inspectionText:
        'Tucked behind a flower box is Alden’s miniature brass pocket spyglass! Added to the group’s Curios collection.',
    },
    {
      id: 'curio_pond_duck',
      kind: 'curio',
      name: 'Carved Cedar Duck',
      subtitle: 'Pond West Shore',
      x: a.pondX - 8,
      y: a.pondY + 4,
      itemId: 'curio_carved_duck',
      inspectionText:
        'Resting on the sandy shore is a hand-carved cedar duck—a cozy village curio added to your Journal!',
    },
    {
      id: 'curio_east_clapper',
      kind: 'curio',
      name: 'Old Festival Bell Clapper',
      subtitle: 'Eastern Avenue Bench',
      x: width < 96 ? 50 : Math.floor(width * 0.75),
      y: width < 96 ? 25 : mainRoadY + 6,
      itemId: 'curio_bell_clapper',
      inspectionText:
        'Under the roadside bench sits an engraved bronze bell clapper from Pixelfield’s first harvest festival!',
    },
  ];
}

export function createInitialAdventureState(): AdventureState {
  return {
    chapterId: CHAPTER_1_ID,
    chapterTitle: CHAPTER_1_TITLE,
    completedQuests: [],
    discoveredClues: [],
    collectedItems: [],
    inspectedNodes: [],
    openedChests: [],
    unlockedChests: [],
    solvedPuzzles: [],
    hiddenDoorOpen: false,
    activePlates: {
      plateA: false,
      plateB: false,
    },
    recentDiscoveries: [],
  };
}

export function getActiveQuest(state: AdventureState): AdventureQuestDef | null {
  for (const q of ADVENTURE_QUESTS) {
    if (!state.completedQuests.includes(q.id)) {
      return q;
    }
  }
  return null;
}

export function getStoryProgressMetrics(state: AdventureState): {
  completedCount: number;
  totalCount: number;
  percent: number;
  isComplete: boolean;
} {
  const totalCount = ADVENTURE_QUESTS.length;
  const completedCount = state.completedQuests.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return {
    completedCount,
    totalCount,
    percent,
    isComplete: completedCount >= totalCount,
  };
}

export function normalizeAdventureState(raw: unknown): AdventureState {
  const base = createInitialAdventureState();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<AdventureState>;
  return {
    chapterId: typeof obj.chapterId === 'string' ? obj.chapterId : base.chapterId,
    chapterTitle: typeof obj.chapterTitle === 'string' ? obj.chapterTitle : base.chapterTitle,
    completedQuests: Array.isArray(obj.completedQuests) ? obj.completedQuests : [],
    discoveredClues: Array.isArray(obj.discoveredClues) ? obj.discoveredClues : [],
    collectedItems: Array.isArray(obj.collectedItems) ? obj.collectedItems : [],
    inspectedNodes: Array.isArray(obj.inspectedNodes) ? obj.inspectedNodes : [],
    openedChests: Array.isArray(obj.openedChests) ? obj.openedChests : [],
    unlockedChests: Array.isArray(obj.unlockedChests) ? obj.unlockedChests : [],
    solvedPuzzles: Array.isArray(obj.solvedPuzzles) ? obj.solvedPuzzles : [],
    hiddenDoorOpen: Boolean(obj.hiddenDoorOpen),
    activePlates: {
      plateA: Boolean(obj.activePlates?.plateA),
      plateB: Boolean(obj.activePlates?.plateB),
    },
    recentDiscoveries: Array.isArray(obj.recentDiscoveries) ? obj.recentDiscoveries.slice(-20) : [],
  };
}
