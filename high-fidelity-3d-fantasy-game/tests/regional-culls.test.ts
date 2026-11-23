import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { Game } from "../src/game/engine";
import { QUESTS, QUEST_BY_ID } from "../src/game/quests";
import { REGIONAL_CULLS, cullKillCounts } from "../src/game/regionalEncounters";
import { SETTLEMENTS } from "../src/game/settlements";

test("every cull quest has its own local encounter and kills cannot cross-count", () => {
  const quests = QUESTS.filter((quest) => quest.kind === "cull");
  assert.equal(quests.length, Object.keys(REGIONAL_CULLS).length);
  for (const quest of quests) {
    assert.ok(REGIONAL_CULLS[quest.id], quest.id);
    assert.equal(cullKillCounts(quest.id, quest.id), true);
    assert.equal(cullKillCounts(quest.id, null), false);
    assert.equal(cullKillCounts(quest.id, "some-other-quest"), false);
  }
});

test("a partially completed regional cull spawns only its remaining targets", () => {
  const game = Object.create(Game.prototype) as any;
  const def = QUEST_BY_ID["the-storm-hawks"];
  const scene = new THREE.Scene();
  Object.assign(game, {
    villages: SETTLEMENTS, questKills: { [def.id]: 2 }, questCullEnemies: new Map(), enemies: [],
    shardBosses: [{ pos: new THREE.Vector3(190, 0, 115), aggroRange: 20 }],
    world: { scene, resolveColliders: (x: number, z: number) => [x, z] },
  });
  game.spawnRegionalCull(def);
  assert.equal(game.enemies.length, def.count - 2);
  assert.ok(game.enemies.every((enemy: any) => enemy.questCullId === def.id && enemy.name === "Storm-Hawk"));
  assert.ok(game.enemies.every((enemy: any) => Math.hypot(enemy.pos.x - 190, enemy.pos.z - 115) > 28), "the local quest does not place targets inside the guardian's arena");
  game.spawnRegionalCull(def);
  assert.equal(game.enemies.length, def.count - 2, "reloading into an existing encounter does not duplicate it");
  game.clearRegionalCull(def.id);
  assert.equal(game.enemies.length, 0);
  assert.equal(scene.children.length, 0);
});
