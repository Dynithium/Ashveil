import { RELIC_IDS } from "./actors";

export type RelicId = (typeof RELIC_IDS)[number];
export type RelicSlots = [RelicId | null, RelicId | null];

export function isOwnedRelic(id: unknown, owned: ReadonlySet<string>): id is RelicId {
  return typeof id === "string" && (RELIC_IDS as readonly string[]).includes(id) && owned.has(id);
}

/** Migrate old saves while preserving deliberately empty slots in new saves. */
export function restoreRelicSlots(saved: unknown, owned: ReadonlySet<string>, previousWeapon?: string): RelicSlots {
  if (Array.isArray(saved)) {
    const first = isOwnedRelic(saved[0], owned) ? saved[0] : null;
    const second = isOwnedRelic(saved[1], owned) && saved[1] !== first ? saved[1] : null;
    return [first, second];
  }
  const choices = RELIC_IDS.filter((id) => owned.has(id));
  if (isOwnedRelic(previousWeapon, owned)) {
    return [previousWeapon, choices.find((id) => id !== previousWeapon) ?? null];
  }
  return [choices[0] ?? null, choices[1] ?? null];
}

/** Moving a relic to the other slot swaps the old assignment when possible. */
export function assignRelicSlot(current: RelicSlots, slot: 0 | 1, id: string | null, owned: ReadonlySet<string>): RelicSlots | null {
  if (id !== null && !isOwnedRelic(id, owned)) return null;
  const next: RelicSlots = [...current];
  const other = slot === 0 ? 1 : 0;
  if (id !== null && next[other] === id) next[other] = next[slot];
  next[slot] = id;
  return next;
}
