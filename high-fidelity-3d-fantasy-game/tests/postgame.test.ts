import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { Game } from "../src/game/engine";

function enemy(role: "main" | "shard") {
  return {
    kind: "boss", bossRole: role, dead: true, dissolve: 1, tutorialTag: "",
    hp: 0, maxHp: 100, poise: 0, aggro: true, move: null, moveSpeed: 1,
    vel: new THREE.Vector3(), pos: new THREE.Vector3(), yaw: 0,
    rig: { flashMats: [{ opacity: 0, transparent: true }], glowMats: [{ opacity: 0 }] },
    setState() {}, cancelGuardianSignature() {},
  };
}

test("a new final attempt restores Malenkar but keeps defeated guardians defeated", () => {
  const game = Object.create(Game.prototype) as any;
  const boss = enemy("main");
  const guardian = enemy("shard");
  let resetCast = false;
  Object.assign(game, {
    projectiles: [], enemies: [boss, guardian], boss, victory: false,
    world: { scene: {}, weather: "ash", setWeather(kind: string) { this.weather = kind; }, citadelCables: { visible: false }, citadelBeam: { visible: false } },
    pylons: [], pylonsBrokenFromLoad: 0, mainPhase2Done: true, preBossWeather: "clear",
    resetFinaleCast: () => { resetCast = true; },
  });
  game.resetEnemies();
  assert.equal(boss.dead, false);
  assert.equal(boss.hp, boss.maxHp);
  assert.equal(guardian.dead, true);
  assert.equal(game.mainPhase2Done, false);
  assert.equal(game.world.citadelCables.visible, true);
  assert.equal(game.world.weather, "clear");
  assert.equal(resetCast, true);
});

test("continuing after victory enters and saves a replayable pre-Citadel state", () => {
  const game = Object.create(Game.prototype) as any;
  const pylon = { dead: true, hp: 0, maxHp: 260, dissolve: 1,
    rig: { root: { visible: false }, flashMats: [], glowMats: [] }, setState() {} };
  const player = { rig: { weapon: { visible: false } }, vel: new THREE.Vector3(), hp: 1, maxHp: 140, stamina: 0, maxStamina: 120,
    fp: 0, maxFp: 80, flasks: 0, maxFlasks: 5 };
  let saves = 0;
  let reset = false;
  Object.assign(game, {
    victory: true, victoryShown: true, victoryDismissed: false, campaignCompleted: false,
    postgame: false, questStage: 9, pylons: [pylon], pylonKills: 3, epilogueCast: [],
    player, resetEnemies: () => { reset = true; }, placeAtGrace() {}, syncBeacon() {}, syncWorldReactions() {},
    updateCamera() {}, saveGame: () => { saves++; }, requestPointerLock() {}, showBanner() {}, emit() {},
  });
  game.dismissVictory();
  assert.equal(game.victory, false);
  assert.equal(game.postgame, true);
  assert.equal(game.campaignCompleted, true);
  assert.equal(game.questStage, 3);
  assert.equal(pylon.dead, false);
  assert.equal(pylon.hp, 260);
  assert.equal(player.hp, player.maxHp);
  assert.equal(reset, true);
  assert.equal(saves, 1);
});
