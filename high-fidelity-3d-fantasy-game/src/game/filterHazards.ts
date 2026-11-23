export type FilterStage = "stable" | "worn" | "critical" | "exhausted";
export interface FilterHazard { name: string; drainPerSecond: number }
export interface SafePoint { x: number; z: number; radius: number }

const HAZARDS: (FilterHazard & { x: number; z: number; radius: number })[] = [
  { name: "Cinderwood fog", x: -265, z: 55, radius: 68, drainPerSecond: 0.65 },
  { name: "Bastion flood vapour", x: -185, z: 25, radius: 42, drainPerSecond: 0.5 },
  { name: "Marsh fumes", x: -120, z: -300, radius: 72, drainPerSecond: 0.8 },
  { name: "Foundry exhaust", x: 178, z: -70, radius: 53, drainPerSecond: 0.7 },
];

export function filterStage(condition: number): FilterStage {
  if (condition <= 0) return "exhausted";
  if (condition <= 25) return "critical";
  if (condition <= 60) return "worn";
  return "stable";
}

/** Settlements and Signal Beacons provide clean air, even during a storm. */
export function hazardAt(x: number, z: number, weather: string, safe: readonly SafePoint[]): FilterHazard | null {
  if (safe.some((point) => Math.hypot(x - point.x, z - point.z) < point.radius)) return null;
  const local = HAZARDS.filter((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius)
    .sort((a, b) => b.drainPerSecond - a.drainPerSecond)[0];
  if (local) return { name: local.name, drainPerSecond: local.drainPerSecond };
  return weather === "ash" ? { name: "Ash storm", drainPerSecond: 0.45 } : null;
}

/** Shrine improvements extend filter life without removing hazards. */
export function drainFilter(condition: number, hazard: FilterHazard | null, shrineCount: number, seconds: number): number {
  if (!hazard || seconds <= 0) return Math.max(0, Math.min(100, condition));
  const endurance = 1 + Math.max(0, shrineCount) * 0.2;
  return Math.max(0, Math.min(100, condition - hazard.drainPerSecond * seconds / endurance));
}
