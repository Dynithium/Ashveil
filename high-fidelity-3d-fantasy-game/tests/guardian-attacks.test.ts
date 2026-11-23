import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { NPC, Player, type GameCtx } from "../src/game/actors";
import { GUARDIAN_IDS, buildGuardianRig, type GuardianId } from "../src/game/guardianRigs";
import { GUARDIAN_SIGNATURES, distanceToSegmentXZ, lineBlockedByCircles, planGuardianSignature } from "../src/game/guardianAttacks";
import { terrainHeight } from "../src/game/terrain";

function fixture(id: GuardianId) {
  const player = new Player();
  const y = terrainHeight(0, 0);
  player.pos.set(0, y, 6);
  const enemy = new NPC("boss", buildGuardianRig(id));
  enemy.shardId = id;
  enemy.bossRole = "shard";
  enemy.pos.set(0, y, 0);
  enemy.aggro = true;
  enemy.hp = enemy.maxHp * 0.5;
  enemy.phaseIdx = 1;
  (enemy as any).signatureCooldown = 0;
  const projectiles: any[] = [];
  const ctx = { dt: 0.1, time: 0, player, enemies: [enemy], scene: new THREE.Scene(),
    particles: { emit() {} }, waves: { spawn() {} }, resolve: (x: number, z: number) => [x, z],
    shake() {}, hitStop() {}, popup() {}, spawnProjectile(projectile: any) { projectiles.push(projectile); },
    onKill() {}, onPlayerDeath() {}, slowmo() {},
  } as unknown as GameCtx;
  return { enemy, player, ctx, projectiles };
}

test("every guardian has a timed, bounded signature and captured target", () => {
  assert.deepEqual(Object.keys(GUARDIAN_SIGNATURES).sort(), [...GUARDIAN_IDS].sort());
  const origin = new THREE.Vector3(0, 0, 0), target = new THREE.Vector3(0, 0, 6);
  for (const id of GUARDIAN_IDS) {
    const plan = planGuardianSignature(id, origin, target);
    assert.ok(plan.spec.windup >= 1.5, `${id} warns before attacking`);
    assert.ok(plan.spec.damage > 0 && plan.spec.damage < 35);
    target.x = 1;
    assert.equal(plan.target.x, 0, `${id} does not track a moving player during the warning`);
    target.x = 0;
  }
  assert.equal(distanceToSegmentXZ(new THREE.Vector3(2, 0, 3), origin, target), 2);
});

test("the Colossus warns before a single hit and leaves a recovery window", () => {
  const { enemy, player, ctx } = fixture("colossus");
  let hits = 0;
  player.damage = () => { hits++; return true; };
  enemy.update(ctx);
  assert.equal(ctx.scene.children.length, 1);
  assert.equal(hits, 0);
  for (let i = 0; i < 23; i++) { ctx.time += ctx.dt; enemy.update(ctx); }
  assert.equal(hits, 1);
  assert.equal(ctx.scene.children.length, 0);
  assert.equal(enemy.state, "stagger");
});

test("moving out of a marked area or interrupting the warning avoids damage", () => {
  const first = fixture("leviathan");
  let hits = 0;
  first.player.damage = () => { hits++; return true; };
  first.enemy.update(first.ctx);
  first.player.pos.set(10, first.player.pos.y, 6);
  for (let i = 0; i < 24; i++) { first.ctx.time += first.ctx.dt; first.enemy.update(first.ctx); }
  assert.equal(hits, 0);
  assert.equal(first.ctx.scene.children.length, 0);

  const second = fixture("stalker");
  second.enemy.update(second.ctx);
  assert.equal(second.ctx.scene.children.length, 1);
  second.enemy.setState("stagger", 1);
  second.enemy.update(second.ctx);
  assert.equal(second.ctx.scene.children.length, 0);
  assert.equal((second.enemy as any).signaturePlan, null);
});

test("the Herald releases a five-blade fan and the Sentinel releases a delayed dive", () => {
  for (const [id, count] of [["herald", 5], ["sentinel", 1]] as const) {
    const { enemy, ctx, projectiles } = fixture(id);
    enemy.update(ctx);
    assert.equal(projectiles.length, 0);
    for (let i = 0; i < 22; i++) { ctx.time += ctx.dt; enemy.update(ctx); }
    assert.equal(projectiles.length, count, id);
    assert.equal(ctx.scene.children.length, 0);
  }
});

test("solid cover blocks the Prism Warden's beam without treating its own base as cover", () => {
  const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(0, 0, 10);
  assert.equal(lineBlockedByCircles(a, b, [{ x: 0, z: 0, r: 2 }]), false);
  assert.equal(lineBlockedByCircles(a, b, [{ x: 0, z: 5, r: 1 }]), true);
  assert.equal(lineBlockedByCircles(a, b, [{ x: 3, z: 5, r: 1 }]), false);
  const { enemy, player, ctx } = fixture("warden");
  let hits = 0;
  player.damage = () => { hits++; return true; };
  const plan = planGuardianSignature("warden", enemy.pos, player.pos);
  ctx.lineBlocked = () => true;
  (enemy as any).releaseGuardianSignature(ctx, plan);
  assert.equal(hits, 0);
  ctx.lineBlocked = () => false;
  (enemy as any).releaseGuardianSignature(ctx, plan);
  assert.equal(hits, 1);
});
