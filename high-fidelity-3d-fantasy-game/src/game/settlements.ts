// ---------------------------------------------------------------------------
// THE TWENTY-THREE SETTLEMENTS
// One shared table: the world builds the architecture from it, the engine
// registers the forge/upgrades and the map markers from it. They can never
// drift apart.
// ---------------------------------------------------------------------------

export type SettlementStyle =
  | "outpost"   // sheet-metal shacks and reinforced bunkers
  | "stilt"     // timber stilts over water
  | "tents"     // canvas caravan on runners
  | "ruin"      // stone ruins reclaimed
  | "camp"      // timber platforms and walkways
  | "tower"     // raised platforms on old towers
  | "forge";    // industrial: foundries, smelters, cutting houses

export interface Settlement {
  id: string;
  name: string;
  region: string;
  x: number;
  z: number;
  style: SettlementStyle;
  /** Which upgrade this settlement's forge offers. */
  upgrade: "blade" | "vigor" | "arcane";
  costs: [number, number, number];
}

export const SETTLEMENTS: Settlement[] = [
  // ---- Uoka Borderlands ----
  { id: "sootfall", name: "Sootfall", region: "Uoka Borderlands", x: 34, z: 96, style: "outpost", upgrade: "vigor", costs: [700, 1800, 4200] },
  { id: "gatewatch", name: "Gatewatch", region: "Uoka Borderlands", x: 32, z: 112, style: "tower", upgrade: "blade", costs: [650, 1700, 3900] },
  { id: "violetpier", name: "Violet Pier", region: "Uoka Borderlands", x: -235, z: 195, style: "stilt", upgrade: "arcane", costs: [800, 2100, 4800] },

  // ---- The Iron Dunes ----
  { id: "rusthollow", name: "Rusthollow", region: "The Iron Dunes", x: 148, z: -188, style: "forge", upgrade: "blade", costs: [700, 1900, 4400] },
  { id: "miragewell", name: "Mirage Well", region: "The Iron Dunes", x: 198, z: -238, style: "ruin", upgrade: "vigor", costs: [650, 1750, 4000] },
  { id: "driftcamp", name: "Driftcamp", region: "The Iron Dunes", x: 118, z: -252, style: "tents", upgrade: "arcane", costs: [750, 1950, 4500] },

  // ---- The Sunken Bastion ----
  { id: "cairnwatch", name: "Cairnwatch", region: "The Sunken Bastion", x: -202, z: 56, style: "tower", upgrade: "blade", costs: [700, 1850, 4300] },
  { id: "lanterndeep", name: "Lantern-Deep", region: "The Sunken Bastion", x: -158, z: -12, style: "ruin", upgrade: "arcane", costs: [750, 2000, 4600] },

  // ---- The Cinderwood ----
  { id: "emberperch", name: "Ember-Perch", region: "The Cinderwood", x: -228, z: 86, style: "tower", upgrade: "blade", costs: [700, 1850, 4300] },
  { id: "mosshaven", name: "Moss-Haven", region: "The Cinderwood", x: -302, z: 24, style: "camp", upgrade: "vigor", costs: [650, 1700, 3900] },
  { id: "charwood", name: "Charwood", region: "The Cinderwood", x: -214, z: 16, style: "camp", upgrade: "arcane", costs: [700, 1900, 4400] },

  // ---- The Glass Crags ----
  { id: "shardvein", name: "Shard-Vein", region: "The Glass Crags", x: -112, z: -142, style: "forge", upgrade: "blade", costs: [750, 1950, 4500] },
  { id: "mirrorrest", name: "Mirror-Rest", region: "The Glass Crags", x: -52, z: -208, style: "ruin", upgrade: "vigor", costs: [700, 1800, 4200] },
  { id: "glintpost", name: "Glint-Post", region: "The Glass Crags", x: -58, z: -132, style: "tower", upgrade: "arcane", costs: [700, 1850, 4300] },

  // ---- The Slag Marshes ----
  { id: "stilthaven", name: "Stilt-Haven", region: "The Slag Marshes", x: -92, z: -262, style: "stilt", upgrade: "vigor", costs: [650, 1750, 4000] },
  { id: "valvecross", name: "Valvecross", region: "The Slag Marshes", x: -148, z: -332, style: "forge", upgrade: "arcane", costs: [750, 1950, 4500] },
  { id: "boilspring", name: "Boil-Spring", region: "The Slag Marshes", x: -58, z: -322, style: "camp", upgrade: "blade", costs: [700, 1850, 4300] },

  // ---- The Whispering Spire ----
  { id: "galenest", name: "Gale-Nest", region: "The Whispering Spire", x: 206, z: 94, style: "tower", upgrade: "blade", costs: [700, 1900, 4400] },
  { id: "cloudanchor", name: "Cloud-Anchor", region: "The Whispering Spire", x: 216, z: 142, style: "tower", upgrade: "vigor", costs: [650, 1750, 4050] },

  // ---- The Forgotten Foundry ----
  { id: "anvildeep", name: "Anvil-Deep", region: "The Forgotten Foundry", x: 196, z: -96, style: "forge", upgrade: "blade", costs: [750, 2000, 4600] },
  { id: "slaggate", name: "Slag-Gate", region: "The Forgotten Foundry", x: 158, z: -44, style: "outpost", upgrade: "arcane", costs: [700, 1850, 4300] },

  // ---- The Ashen Cathedral & Citadel Approaches ----
  { id: "vigilsend", name: "Vigil's End", region: "The Ashen Cathedral", x: 14, z: 72, style: "tents", upgrade: "blade", costs: [800, 2100, 4800] },
  { id: "ashensanctuary", name: "Ashen Sanctuary", region: "The Ashen Cathedral", x: -26, z: 80, style: "ruin", upgrade: "arcane", costs: [750, 1950, 4500] },
];

/** Where the Violet Mere (the bioluminescent lake at Violet Pier) sits. */
export const VIOLET_MERE = { x: -235, z: 205, r: 34, floor: 1.2, level: 3.4 };
