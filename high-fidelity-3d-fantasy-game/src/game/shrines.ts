// ---------------------------------------------------------------------------
// SHRINES OF LIGHT — twenty-four hush corners of the Ashveil, three per
// region. Each grants one ancient blessing. None is required; all are worth
// the walk. The map does not mark them — rumor, reflection and ruined stone do.
// ---------------------------------------------------------------------------

export type ShrineKind = "vigor" | "core" | "filter" | "stamina" | "relic";

export interface ShrineDef {
  id: string;
  name: string;
  /** Broad region this shrine watches over (used for the journal flavour). */
  region: string;
  x: number;
  z: number;
  kind: ShrineKind;
}

export const SHRINES: ShrineDef[] = [
  // The Iron Dunes
  { id: "s01", name: "Shrine of the Buried Road",   region: "The Iron Dunes",     x: 130,  z: -225, kind: "vigor" },
  { id: "s02", name: "Shrine of the Silent Engine", region: "The Iron Dunes",     x: 185,  z: -165, kind: "relic" },
  { id: "s03", name: "Shrine of the Long Dune",     region: "The Iron Dunes",     x: 95,   z: -215, kind: "core" },
  // The Sunken Bastion
  { id: "s04", name: "Shrine of the Drowned Bell",  region: "The Sunken Bastion", x: -190, z: 45,   kind: "stamina" },
  { id: "s05", name: "Shrine of the Lantern Tide",  region: "The Sunken Bastion", x: -135, z: -25,  kind: "filter" },
  { id: "s06", name: "Shrine of the Captain's Standard", region: "The Sunken Bastion", x: -215, z: -10, kind: "relic" },
  // The Cinder Canopy
  { id: "s07", name: "Shrine of the Whispering Canopy", region: "The Cinder Canopy", x: -290, z: 90,  kind: "core" },
  { id: "s08", name: "Shrine of the Petrified Root",    region: "The Cinder Canopy", x: -215, z: 35,  kind: "vigor" },
  { id: "s09", name: "Shrine of the Ember Vantage",     region: "The Cinder Canopy", x: -245, z: 115, kind: "relic" },
  // The Glass Crags
  { id: "s10", name: "Shrine of the Mirror Pools",  region: "The Glass Crags",    x: -95,  z: -130, kind: "filter" },
  { id: "s11", name: "Shrine of the Shattered Light", region: "The Glass Crags",  x: -35,  z: -195, kind: "stamina" },
  { id: "s12", name: "Shrine of the Black Vein",    region: "The Glass Crags",    x: -70,  z: -100, kind: "relic" },
  // The Slag Marshes
  { id: "s13", name: "Shrine of the Still Sludge",  region: "The Slag Marshes",   x: -130, z: -250, kind: "vigor" },
  { id: "s14", name: "Shrine of the Pressure Line", region: "The Slag Marshes",   x: -95,  z: -320, kind: "filter" },
  { id: "s15", name: "Shrine of the Tar Horizon",   region: "The Slag Marshes",   x: -145, z: -305, kind: "relic" },
  // The Whispering Spire
  { id: "s16", name: "Shrine of the Turbine Heart", region: "The Whispering Spire", x: 190, z: 55,  kind: "core" },
  { id: "s17", name: "Shrine of the Upper Gale",    region: "The Whispering Spire", x: 235, z: 135, kind: "stamina" },
  { id: "s18", name: "Shrine of the Silent Blade",  region: "The Whispering Spire", x: 150, z: 80,  kind: "relic" },
  // The Forgotten Foundry
  { id: "s19", name: "Shrine of the Empty Mold",    region: "The Forgotten Foundry", x: 120, z: -15, kind: "stamina" },
  { id: "s20", name: "Shrine of the Sleeping Furnace", region: "The Forgotten Foundry", x: 215, z: -80, kind: "vigor" },
  { id: "s21", name: "Shrine of the Last Quota",    region: "The Forgotten Foundry", x: 190, z: -20, kind: "relic" },
  // The Ashen Cathedral
  { id: "s22", name: "Shrine of the Broken Bell",   region: "The Ashen Cathedral", x: 30,  z: -80, kind: "filter" },
  { id: "s23", name: "Shrine of the Two Halves",    region: "The Ashen Cathedral", x: -35, z: -20, kind: "core" },
  { id: "s24", name: "Shrine of the Little Vigil",  region: "The Ashen Cathedral", x: 45,  z: 10,  kind: "relic" },
];

export const SHRINE_BY_ID = new Map(SHRINES.map((s) => [s.id, s]));

/** Human-readable effect line shown in the banner when a shrine is claimed. */
export function shrineBlessingText(kind: ShrineKind): string {
  switch (kind) {
    case "vigor": return "Vigor hardened — +8 Max Health";
    case "core": return "Core expanded — +10 Max Energy";
    case "filter": return "Filter endurance improved · +1 spare canister";
    case "stamina": return "Wind in the limbs — +10 Max Stamina";
    case "relic": return "Relics run quiet — their heat builds slower";
  }
}
