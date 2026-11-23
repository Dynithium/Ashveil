import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { NPC, Player, chooseEnemyTarget, type GameCtx, type PlayerInput } from "../src/game/actors";
import { groundAt, terrainHeight } from "../src/game/terrain";
import { validateAgentAction } from "../src/game/ashveilBenchmark";

const neutral: PlayerInput = { moveX: 0, moveZ: 0, sprint: false, attack: false, heavy: false,
  roll: false, guard: false, cast: false, heal: false, camYaw: 0, faceYaw: null };

function fixture() {
  const player = new Player();
  player.pos.set(0, terrainHeight(0, 0), 0);
  player.trail = { clear() {}, push() {} } as any;
  const ctx = { dt: 0.05, time: 0, scene: new THREE.Scene(), player, enemies: [],
    particles: { emit() {} }, waves: { spawn() {} }, resolve: (x: number, z: number) => [x, z],
    shake() {}, hitStop() {}, popup() {}, spawnProjectile() {}, onKill() {}, onPlayerDeath() {}, slowmo() {},
  } as unknown as GameCtx;
  return { player, ctx };
}

test("jump lifts the player from the ground and cannot be repeated in mid-air", () => {
  const { player, ctx } = fixture();
  const start = player.pos.y;
  assert.equal(player.jump(ctx), true);
  player.update(neutral, ctx);
  assert.ok(player.pos.y > start);
  assert.equal(player.jump(ctx), false);
});

test("Sky-Step is available once per flight and holding glide slows descent", () => {
  const { player, ctx } = fixture();
  player.shardPowers.add("sentinel");
  assert.equal(player.jump(ctx), true);
  for (let i = 0; i < 4; i++) player.update(neutral, ctx);
  player.update({ ...neutral, roll: true }, ctx);
  assert.equal((player as any).skyStepUsed, true);
  // Give the remaining roll enough open air to finish, as when dashing from a ledge.
  player.pos.y = terrainHeight(player.pos.x, player.pos.z) + 8;
  player.vel.set(0, 0, 0);
  for (let i = 0; i < 14; i++) player.update({ ...neutral, glide: true }, ctx);
  assert.ok(player.pos.y > groundAt(player.pos.x, player.pos.z, player.pos.y) + 0.5);
  const stamina = player.stamina;
  player.update({ ...neutral, roll: true, glide: true }, ctx);
  assert.ok(player.stamina >= stamina, "a second aerial dash does not spend stamina");
  player.vertical = -10;
  player.update({ ...neutral, glide: true }, ctx);
  assert.ok(player.vertical >= -3.5);
});

test("Core Overdrive requires its Shard and energy, expires, and has a cooldown", () => {
  const { player, ctx } = fixture();
  assert.equal(player.activateOverdrive(ctx), false);
  player.shardPowers.add("leviathan");
  assert.equal(player.activateOverdrive(ctx), true);
  assert.equal(player.fp, 60);
  assert.equal(player.overdriveT, 15);
  assert.equal(player.overdriveCooldown, 30);
  assert.equal(player.activateOverdrive(ctx), false);
  player.update({ ...neutral, attack: true }, ctx);
  assert.ok(player.stateDur < 0.7, "light attacks are faster while overdriven");
  assert.ok(player.overdriveT < 15);
  assert.deepEqual(validateAgentAction({ action: "jump" }), { action: "jump", seconds: undefined });
  assert.deepEqual(validateAgentAction({ action: "overdrive" }), { action: "overdrive", seconds: undefined });
});

test("Afterimage Dash leaves a temporary decoy without dealing automatic damage", () => {
  const { player, ctx } = fixture();
  let damage = 0;
  const enemy = { pos: new THREE.Vector3(4, player.pos.y, 0), radius: 0.5, dead: false, dormant: false,
    damage() { damage++; } };
  ctx.enemies.push(enemy as any);
  player.shardPowers.add("stalker");
  const origin = player.pos.clone();
  player.update({ ...neutral, moveZ: 1, roll: true }, ctx);
  assert.ok(player.afterimage);
  assert.equal(damage, 0);
  assert.equal(chooseEnemyTarget(enemy.pos, player, true), player.afterimage!.pos);
  assert.equal(chooseEnemyTarget(enemy.pos, player, false), player.pos);
  assert.equal(chooseEnemyTarget(new THREE.Vector3(100, 0, 100), player, true), player.pos);
  assert.deepEqual(player.afterimage!.pos.toArray(), origin.toArray());
  for (let i = 0; i < 51; i++) player.update(neutral, ctx);
  assert.equal(player.afterimage, null);
  assert.equal(ctx.scene.children.length, 0);
});

test("an area attack aimed at a decoy cannot damage a distant player", () => {
  const { player, ctx } = fixture();
  const enemy = new NPC("boss");
  enemy.pos.set(0, 0, 0);
  player.pos.set(100, 0, 0);
  let hits = 0;
  player.damage = () => { hits++; return true; };
  (enemy as any).runMoveEffects(ctx, { name: "nova", windup: 0.1, range: 13, damage: 40, active: [1, 1] }, 0.5, new THREE.Vector3());
  assert.equal(hits, 0);
});
