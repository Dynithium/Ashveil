import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { NPC, Player, selectGrappleAnchor, type GameCtx, type PlayerInput } from "../src/game/actors";
import { World } from "../src/game/world";
import { terrainHeight } from "../src/game/terrain";
import { validateAgentAction } from "../src/game/ashveilBenchmark";

const neutral: PlayerInput = { moveX: 0, moveZ: 0, sprint: false, attack: false, heavy: false,
  roll: false, guard: false, cast: false, heal: false, camYaw: 0, faceYaw: null };

function fixture() {
  const player = new Player();
  player.pos.set(0, terrainHeight(0, 0), 0);
  player.grappleKnown = true;
  player.yaw = 0;
  player.trail = { clear() {}, push() {} } as any;
  const ctx = { dt: 0.05, time: 0, scene: new THREE.Scene(), player, enemies: [], grappleAnchors: [],
    particles: { emit() {} }, waves: { spawn() {} }, resolve: (x: number, z: number) => [x, z],
    shake() {}, hitStop() {}, popup() {}, spawnProjectile() {}, onKill() {}, onPlayerDeath() {}, slowmo() {},
  } as unknown as GameCtx;
  return { player, ctx };
}

test("guardian arenas and the Citadel have visible, named grapple anchors", () => {
  const world = Object.create(World.prototype) as any;
  world.scene = new THREE.Scene();
  world.grappleAnchors = [];
  world.buildGrappleAnchors();
  assert.equal(world.grappleAnchors.length, 28);
  assert.equal(new Set(world.grappleAnchors.map((anchor: any) => anchor.id)).size, 28);
  assert.equal(world.grappleAnchors.filter((anchor: any) => anchor.name === "Citadel anchor").length, 4);
  assert.equal(world.scene.children.length, 28);
});

test("anchor selection respects direction, distance, and height", () => {
  const origin = new THREE.Vector3();
  const anchors = [
    { id: "behind", name: "behind", pos: new THREE.Vector3(0, 3, -8) },
    { id: "far", name: "far", pos: new THREE.Vector3(0, 3, 40) },
    { id: "high", name: "high", pos: new THREE.Vector3(0, 20, 8) },
    { id: "front", name: "front", pos: new THREE.Vector3(1, 4, 12) },
  ];
  assert.equal(selectGrappleAnchor(origin, 0, anchors)?.id, "front");
  assert.equal(selectGrappleAnchor(origin, Math.PI / 2, anchors), null);
  assert.deepEqual(validateAgentAction({ action: "grapple" }), { action: "grapple", seconds: undefined });
});

test("the basic line moves Kinter toward an anchor through the collision resolver", () => {
  const { player, ctx } = fixture();
  const y = player.pos.y;
  ctx.grappleAnchors = [{ id: "test", name: "test anchor", pos: new THREE.Vector3(0, y + 5, 12) }];
  let resolves = 0;
  ctx.resolve = (x, z) => { resolves++; return [x, Math.min(z, 3)]; };
  assert.equal(player.grapple(ctx), true);
  assert.equal(player.fp, 68);
  assert.equal(player.pos.z, 0, "the grapple does not teleport");
  for (let i = 0; i < 10; i++) player.update(neutral, ctx);
  assert.ok(player.pos.z > 0 && player.pos.z <= 3);
  assert.ok(player.pos.y > y);
  assert.ok(resolves > 0);
});

test("a locked enemy takes priority over an anchor without being pulled before Mag-Grapple", () => {
  const { player, ctx } = fixture();
  const enemy = new NPC("warden");
  enemy.pos.set(0, player.pos.y, 10);
  ctx.enemies.push(enemy);
  ctx.grappleEnemy = enemy;
  ctx.grappleAnchors = [{ id: "anchor", name: "anchor", pos: new THREE.Vector3(0, player.pos.y + 5, 15) }];
  assert.equal(player.grapple(ctx), true);
  assert.equal((player as any).grappleTarget.z, 10);
  assert.equal(enemy.pos.z, 10);
  assert.equal(enemy.shieldDisarmedT, 0);
});

test("Mag-Grapple removes a shield instead of moving the enemy instantly", () => {
  const { player, ctx } = fixture();
  const enemy = new NPC("warden");
  enemy.pos.set(0, player.pos.y, 10);
  enemy.yaw = Math.PI;
  ctx.enemies.push(enemy);
  const initialZ = enemy.pos.z;
  player.shardPowers.add("forgemaster");
  assert.equal(player.grapple(ctx), true);
  assert.equal(enemy.pos.z, initialZ);
  assert.equal(enemy.shieldDisarmedT, 8);
  assert.equal(enemy.rig.shield?.visible, false);
  const hp = enemy.hp;
  enemy.damage(40, player.pos, ctx);
  assert.equal(enemy.hp, hp - 40);
  enemy.passive = true;
  ctx.dt = 8.1;
  enemy.update(ctx);
  assert.equal(enemy.rig.shield?.visible, true);
  const guardedHp = enemy.hp;
  enemy.damage(40, player.pos, ctx);
  assert.equal(enemy.hp, guardedHp - 22);
});
