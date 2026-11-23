import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Game } from "../src/game/engine";
import { Player, type GameCtx } from "../src/game/actors";
import { drainFilter, filterStage, hazardAt } from "../src/game/filterHazards";
import { validateAgentAction } from "../src/game/ashveilBenchmark";

test("hazards respect clean-air areas and shrine endurance", () => {
  assert.equal(hazardAt(-120, -300, "clear", [])?.name, "Marsh fumes");
  assert.equal(hazardAt(-120, -300, "ash", [{ x: -120, z: -300, radius: 8 }]), null);
  assert.equal(hazardAt(300, 300, "clear", []), null);
  assert.equal(hazardAt(300, 300, "ash", [])?.name, "Ash storm");
  const hazard = { name: "test", drainPerSecond: 1 };
  assert.equal(drainFilter(100, hazard, 0, 60), 40);
  assert.equal(drainFilter(100, hazard, 4, 60), 100 - 60 / 1.8);
  assert.deepEqual([100, 60, 25, 0].map(filterStage), ["stable", "worn", "critical", "exhausted"]);
});

test("a depleted filter warns before exposure damage, and clean air stops it", () => {
  const game = Object.create(Game.prototype) as any;
  const player = new Player();
  player.pos.set(-120, 0, -300);
  player.filterCondition = 0.5;
  const ctx = { popup() {}, onPlayerDeath() {}, onLethalPlayerDamage: () => false } as unknown as GameCtx;
  Object.assign(game, { player, world: { weather: "clear" }, filterSafePoints: [], filterHazard: null,
    filterDamageTimer: 0, filterSaveTimer: 0, trialActor: null, epiloguePhase: null, victory: false,
    prologueActive: false, shrineKindCount: () => 0, showBanner() {}, saveGame() {} });
  game.updateFilter(1, ctx);
  game.updateFilter(1, ctx);
  assert.equal(player.hp, player.maxHp);
  player.invuln = 10;
  player.state = "guard";
  game.updateFilter(1, ctx);
  assert.equal(player.hp, player.maxHp - 4, "exposure cannot be blocked or dodged");
  game.filterSafePoints = [{ x: -120, z: -300, radius: 8 }];
  game.updateFilter(10, ctx);
  assert.equal(player.hp, player.maxHp - 4);
});

test("replacing a filter consumes one shared canister and refuses waste", () => {
  const player = new Player();
  assert.equal(player.replaceFilter(), false);
  player.filterCondition = 10;
  player.ashBursts = 1;
  assert.equal(player.replaceFilter(), true);
  assert.equal(player.filterCondition, 100);
  assert.equal(player.ashBursts, 0);
  player.filterCondition = 10;
  assert.equal(player.replaceFilter(), false);
  assert.deepEqual(validateAgentAction({ action: "filter" }), { action: "filter", seconds: undefined });
});
