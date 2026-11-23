/** The local threats named by settlement cull quests. */
export const REGIONAL_CULLS: Record<string, { name: string; form: "burrower" | "hawk" | "humanoid"; color: number }> = {
  "holding-the-line": { name: "Buttress Burrower", form: "burrower", color: 0x625044 },
  "smoke-and-silent-knives": { name: "Catacomb Raider", form: "humanoid", color: 0x5d5158 },
  "light-through-obsidian": { name: "Glass Burrower", form: "burrower", color: 0x424858 },
  "pressure-lines": { name: "Pipeline Lurker", form: "burrower", color: 0x5b483b },
  "the-storm-hawks": { name: "Storm-Hawk", form: "hawk", color: 0x637482 },
  "the-rogue-cores": { name: "Rogue Automaton", form: "humanoid", color: 0x675346 },
  "the-outer-line": { name: "Ash Burrower", form: "burrower", color: 0x534644 },
};

/** A killed quest creature contributes only to the encounter that spawned it. */
export function cullKillCounts(questId: string, enemyQuestId: string | null): boolean {
  return enemyQuestId === questId && Object.prototype.hasOwnProperty.call(REGIONAL_CULLS, questId);
}
