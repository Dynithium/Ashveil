import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { Game } from "../src/game/engine";
import { Player, type GameCtx, type PlayerInput } from "../src/game/actors";
import { assignRelicSlot, restoreRelicSlots } from "../src/game/relicLoadout";
import { terrainHeight } from "../src/game/terrain";
import { SwordTrail } from "../src/game/vfx";
import { validateAgentAction } from "../src/game/ashveilBenchmark";

const neutral: PlayerInput = { moveX: 0, moveZ: 0, sprint: false, attack: false, heavy: false,
  roll: false, guard: false, cast: false, heal: false, camYaw: 0, faceYaw: null };

function combatFixture() {
  const player = new Player();
  player.pos.set(0, terrainHeight(0, 0), 0);
  player.trail = { clear() {}, push() {} } as any;
  const ctx = { dt: 0.05, time: 0, scene: new THREE.Scene(), player, enemies: [],
    particles: { emit() {} }, waves: { spawn() {} }, resolve: (x: number, z: number) => [x, z],
    shake() {}, hitStop() {}, popup() {}, spawnProjectile() {}, onKill() {}, onPlayerDeath() {}, slowmo() {},
  } as unknown as GameCtx;
  return { player, ctx };
}

test("relic slots migrate old saves, preserve empty slots, and reject unowned items", () => {
  const owned = new Set(["longbow", "pike", "chakram"]);
  assert.deepEqual(restoreRelicSlots(undefined, owned, "chakram"), ["chakram", "longbow"]);
  assert.deepEqual(restoreRelicSlots([null, "pike"], owned), [null, "pike"]);
  assert.deepEqual(restoreRelicSlots(["pike", "pike"], owned), ["pike", null]);
  assert.deepEqual(assignRelicSlot(["longbow", "pike"], 0, "pike", owned), ["pike", "longbow"]);
  assert.equal(assignRelicSlot(["longbow", null], 1, "buckler", owned), null);
  assert.deepEqual(validateAgentAction({ action: "relic", slot: 1 }), { action: "relic", slot: 1 });
});

test("switching relics retains Kinter's outfit and the Second Blade", () => {
  const game = Object.create(Game.prototype) as any;
  const player = new Player();
  const scene = new THREE.Scene();
  player.trail = new SwordTrail(8, 0xffffff);
  player.relicsOwned.add("longbow");
  scene.add(player.rig.root, player.trail.mesh);
  Object.assign(game, { player, world: { scene }, relicSlots: ["longbow", null],
    prologueActive: false, prologueComplete: true, started: false, showBanner() {}, emit() {} });
  assert.equal(game.switchWeapon("longbow"), true);
  assert.equal(player.weaponKind, "longbow");
  assert.equal(game.kinterBackBlade.visible, true);
  assert.ok(player.rig.head.children.length >= 3, "the hat remains attached");
  assert.equal(game.switchWeapon("greatsword"), true);
  assert.equal(game.kinterBackBlade.visible, false);
  assert.equal(player.weaponKind, "greatsword");
});

test("relic attacks spend energy, delay recharge, and refuse attacks without enough core", () => {
  const { player, ctx } = combatFixture();
  player.weaponKind = "longbow";
  player.fp = 10;
  player.update({ ...neutral, attack: true }, ctx);
  assert.equal(player.state, "attack");
  assert.ok(player.fp < 5);
  const afterAttack = player.fp;
  for (let i = 0; i < 10; i++) player.update(neutral, ctx);
  assert.equal(player.fp, afterAttack, "the core does not refill immediately");
  for (let i = 0; i < 30; i++) player.update(neutral, ctx);
  assert.ok(player.fp > afterAttack);
  player.fp = 0;
  player.setState("idle", 0.1);
  player.update({ ...neutral, heavy: true }, ctx);
  assert.notEqual(player.state, "heavy");
});

test("an empty core still permits a slower basic dodge and warm core slows recharge", () => {
  const low = combatFixture();
  low.player.fp = 0;
  low.player.update({ ...neutral, roll: true, moveZ: 1 }, low.ctx);
  assert.equal(low.player.state, "roll");
  assert.ok(low.player.pos.z > 0);
  const normal = combatFixture(), warm = combatFixture();
  normal.player.fp = warm.player.fp = 0;
  warm.player.overheatT = 5;
  for (let i = 0; i < 20; i++) { normal.player.update(neutral, normal.ctx); warm.player.update(neutral, warm.ctx); }
  assert.ok(warm.player.fp < normal.player.fp * 0.5);
});
