import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Game } from "../src/game/engine";
import { QUEST_BY_ID } from "../src/game/quests";
import { REGIONAL_STORIES } from "../src/game/regionalStories";
import { VILLAGE_NPC_BY_ID } from "../src/game/npcData";
import { SETTLEMENTS } from "../src/game/settlements";

test("all eight regional investigations have valid contacts, clues and guardian follow-ups", () => {
  assert.equal(REGIONAL_STORIES.length, 8);
  assert.equal(new Set(REGIONAL_STORIES.map((story) => story.guardianId)).size, 8);
  for (const story of REGIONAL_STORIES) {
    const investigation = QUEST_BY_ID[`region-${story.id}-investigation`];
    const guardian = QUEST_BY_ID[`region-${story.id}-guardian`];
    assert.equal(VILLAGE_NPC_BY_ID[story.giver]?.village, story.settlement);
    assert.ok(SETTLEMENTS.some((village) => village.id === story.settlement));
    assert.equal(investigation.steps?.length, 2);
    assert.ok(investigation.steps?.every((step) => step.text?.length));
    assert.equal(guardian.requires, investigation.id);
    assert.equal(guardian.guardianId, story.guardianId);
  }
});

test("a guardian defeated before an investigation still satisfies its follow-up", () => {
  const story = REGIONAL_STORIES[0];
  const game = Object.create(Game.prototype) as any;
  Object.assign(game, {
    questsDone: new Set(), questsActive: new Set(), player: { shardPowers: new Set([story.guardianId]) },
    shardBosses: [], villages: SETTLEMENTS, chainDone: {},
  });
  assert.equal(game.nextOfferableQuest(story.giver).id, `region-${story.id}-investigation`);
  game.questsDone.add(`region-${story.id}-investigation`);
  const guardian = game.nextOfferableQuest(story.giver);
  assert.equal(guardian.id, `region-${story.id}-guardian`);
  assert.equal(game.questReady(guardian), true);
  game.questsActive.add(guardian.id);
  const [marker] = game.activeQuestMarkers();
  const home = SETTLEMENTS.find((village) => village.id === story.settlement)!;
  assert.equal(marker.x, home.x);
  assert.equal(marker.z, home.z);
  assert.match(marker.name, /return to/i);
});

test("an active investigation shows its next clue and advances its map marker", () => {
  const story = REGIONAL_STORIES[1];
  const id = `region-${story.id}-investigation`;
  const game = Object.create(Game.prototype) as any;
  Object.assign(game, { questsActive: new Set([id]), chainDone: { [id]: 0 } });
  assert.equal(game.activeQuestMarkers()[0].x, story.steps[0].spot[0]);
  game.chainDone[id] = 1;
  assert.equal(game.activeQuestMarkers()[0].x, story.steps[1].spot[0]);
});

test("investigation clues are presented and the final clue is preserved at completion", () => {
  const story = REGIONAL_STORIES[0];
  const def = QUEST_BY_ID[`region-${story.id}-investigation`];
  const game = Object.create(Game.prototype) as any;
  let saved = 0;
  let lastPreface: string[] | undefined;
  Object.assign(game, {
    chainDone: {}, questStepMarkers: [], world: { scene: { remove() {} } },
    syncWorldReactions() {}, showBanner() {}, emit() {}, saveGame() { saved++; },
    completeQuest(_def: unknown, _speaker: string, preface?: string[]) { lastPreface = preface; },
  });
  game.completeQuestStep(def, def.steps![0]);
  assert.equal(game.chainDone[def.id], 1);
  assert.deepEqual(game.dialogue.lines, story.steps[0].text);
  assert.equal(saved, 1);
  game.completeQuestStep(def, def.steps![1]);
  assert.deepEqual(lastPreface, story.steps[1].text);
});
