import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { Game } from "../src/game/engine";
import { buildRig } from "../src/game/rig";
import { SETTLEMENTS } from "../src/game/settlements";

function fixture() {
  const game = Object.create(Game.prototype) as any;
  const scene = new THREE.Scene();
  const relic = { id: "longbow", group: new THREE.Group(), taken: false };
  const grapple = { group: new THREE.Group(), taken: false };
  const collectible = { id: 4, tag: "spores", group: new THREE.Group(), taken: false };
  scene.add(relic.group, grapple.group, collectible.group);
  const effigy = () => ({ dead: false, hp: 70, dissolve: 0,
    rig: { root: { visible: true }, flashMats: [{ opacity: 1, transparent: false }], glowMats: [{ opacity: 1 }] } });
  const king = buildRig({ armor: 1, armorDark: 1, cloth: 1, accent: 1, weapon: "none" });
  Object.assign(game, {
    player: { runes: 0, weaponKind: "greatsword", shardPowers: new Set(), relicsOwned: new Set(),
      maxAshBursts: 5, grappleKnown: false, sanctuaryBlessing: false },
    world: { scene, weather: "clear", dayPhase: 0, graceSites: [{ pos: new THREE.Vector3() }],
      setWeather(kind: string) { this.weather = kind; }, dimShrine() {} },
    king, kingPos: new THREE.Vector3(), time: 0, villages: [], upgrades: {}, relicSlots: [null, null],
    discoveredGraces: new Set(), loreRead: new Set(), effigies: [effigy(), effigy(), effigy()],
    effigyKills: { blade: 0, arcane: 0 }, shardBosses: [], relicPickups: [relic], grapplePickup: grapple,
    collectibles: [collectible], villageNpcClaimed: new Set(), questsActive: new Set(), questsDone: new Set(),
    questMarks: new Map(), questKills: {}, collects: {}, reachedSpots: new Set(), chainDone: {},
    journalUnlocked: new Set(), aldrichMilestones: new Set(), lyekaiRelationsSpoken: new Set(), shrinesClaimed: new Set(),
    recomputeShrineStats() { this.player.maxHp = 140; this.player.maxStamina = 120; this.player.maxFp = 80; },
    restorePrologueEnvironment() {}, placeAtGrace() {}, resetEnemies() {}, syncWorldReactions() {}, syncBeacon() {},
    updateCamera() {}, showBanner() {}, switchWeapon(kind: string) { this.player.weaponKind = kind; },
  });
  return { game, relic, grapple, collectible };
}

test("save and reload preserve dropped runes, collected items, equipment and legacy trial progress", () => {
  let raw = "";
  Object.assign(globalThis, { localStorage: { setItem: (_key: string, value: string) => { raw = value; }, getItem: () => raw } });
  const original = fixture();
  Object.assign(original.game, { activeGraceIdx: 0, questStage: 1, prologueComplete: true,
    shardsCollected: 0, victory: false, campaignCompleted: false, postgame: false, pylonKills: 0 });
  Object.assign(original.game.player, { runes: 0, weaponKind: "longbow", grappleKnown: true, ashBursts: 2, filterCondition: 42 });
  original.game.player.relicsOwned.add("longbow");
  original.game.relicSlots = ["longbow", null];
  original.game.effigies[1].dead = true;
  original.game.effigyKills.blade = 1;
  original.collectible.taken = true;
  original.game.collects.spores = 1;
  original.game.createBloodstain(new THREE.Vector3(9, 4, -2), 725);
  original.game.saveGame();
  assert.ok(raw, "the campaign was written");

  const resumed = fixture();
  assert.equal(resumed.game.loadSave(), true);
  assert.deepEqual(resumed.game.bloodstain.pos.toArray(), [9, 4, -2]);
  assert.equal(resumed.game.bloodstain.runes, 725);
  assert.equal(resumed.game.player.weaponKind, "longbow");
  assert.deepEqual(resumed.game.relicSlots, ["longbow", null]);
  assert.equal(resumed.game.player.filterCondition, 42);
  assert.equal(resumed.relic.taken, true);
  assert.equal(resumed.grapple.taken, true);
  assert.equal(resumed.collectible.taken, true);
  assert.equal(resumed.game.collects.spores, 1);
  assert.equal(resumed.game.effigies[0].dead, false);
  assert.equal(resumed.game.effigies[1].dead, true);
});

test("an unreadable save is rejected without replacing its contents", () => {
  const raw = "{broken save";
  let writes = 0;
  Object.assign(globalThis, { localStorage: { getItem: () => raw, setItem: () => { writes++; } } });
  const { game } = fixture();
  assert.equal(game.loadSave(), false);
  assert.equal(writes, 0);
});

test("older partial Hall saves reconstruct already defeated effigies", () => {
  const raw = JSON.stringify({ v: 1, questStage: 1, effigyKills: { blade: 1, arcane: 0 } });
  Object.assign(globalThis, { localStorage: { getItem: () => raw, setItem() {} } });
  const { game } = fixture();
  assert.equal(game.loadSave(), true);
  assert.equal(game.effigies[0].dead, true);
  assert.equal(game.effigies[1].dead, false);
});

test("loading a partial regional cull restores only the remaining creatures", () => {
  const raw = JSON.stringify({ v: 1, questStage: 3, questsActive: ["the-storm-hawks"], questKills: { "the-storm-hawks": 2 } });
  Object.assign(globalThis, { localStorage: { getItem: () => raw, setItem() {} } });
  const { game } = fixture();
  game.villages = SETTLEMENTS.map((v) => ({ ...v, type: v.upgrade, level: 0 }));
  game.questCullEnemies = new Map();
  game.enemies = [];
  game.shardBosses = [];
  game.world.resolveColliders = (x: number, z: number) => [x, z];
  assert.equal(game.loadSave(), true);
  assert.equal(game.questKills["the-storm-hawks"], 2);
  assert.equal(game.questCullEnemies.get("the-storm-hawks").length, 2);
});

test("an interrupted playable epilogue resumes its saved responsibility", () => {
  const raw = JSON.stringify({ v: 1, victory: true, questStage: 9, epiloguePhase: "active", epilogueStage: 1 });
  Object.assign(globalThis, { localStorage: { getItem: () => raw, setItem() {} } });
  const { game } = fixture();
  game.boss = { hp: 100, dead: false, aggro: false, dissolve: 0,
    rig: { root: { visible: true }, flashMats: [], glowMats: [] } };
  let resumed = false;
  game.unlockEntries = () => {};
  game.beginEpilogue = (isResume: boolean) => { resumed = isResume; };
  assert.equal(game.loadSave(), true);
  assert.equal(resumed, true);
  assert.equal(game.epilogueStage, 1);
  assert.equal(game.epiloguePhase, "active");
});

test("reloading a failed Citadel attempt restores weather from before the boss storm", () => {
  const raw = JSON.stringify({ v: 1, questStage: 3, mainPhase2Done: true, weather: "ash", preBossWeather: "clear" });
  Object.assign(globalThis, { localStorage: { getItem: () => raw, setItem() {} } });
  const { game } = fixture();
  assert.equal(game.loadSave(), true);
  assert.equal(game.world.weather, "clear");
});
