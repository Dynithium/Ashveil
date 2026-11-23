import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { NPC, Player, type GameCtx } from "../src/game/actors";
import { GUARDIAN_IDS, animateGuardianRig, buildGuardianRig } from "../src/game/guardianRigs";
import { AmbientEmbers, Particles } from "../src/game/vfx";

test("all eight guardians build distinct rigs compatible with combat and death", () => {
  assert.equal(new Set(GUARDIAN_IDS).size, 8);
  const player = new Player();
  player.pos.set(300, 0, 300);
  const ctx = { dt: 0.1, time: 1, player, enemies: [], scene: new THREE.Scene(),
    particles: { emit() {} }, waves: { spawn() {} }, resolve: (x: number, z: number) => [x, z],
    shake() {}, hitStop() {}, popup() {}, spawnProjectile() {}, onKill() {}, onPlayerDeath() {}, slowmo() {},
  } as unknown as GameCtx;
  for (const id of GUARDIAN_IDS) {
    const rig = buildGuardianRig(id);
    const guardian = new NPC("boss", rig);
    guardian.shardId = id;
    assert.equal(rig.root.userData.guardianId, id);
    assert.equal(guardian.rig, rig);
    assert.ok(rig.flashMats.length > 4);
    guardian.update(ctx);
    let kills = 0;
    ctx.onKill = () => { kills++; };
    guardian.bossRole = "shard";
    guardian.hp = 1;
    guardian.damage(100, player.pos, ctx);
    guardian.damage(100, player.pos, ctx);
    assert.equal(kills, 1, `${id} awards its victory exactly once`);
    guardian.update(ctx);
    assert.ok(rig.flashMats.some((material) => material.opacity < 1), `${id} fades after death`);
  }
});

test("the Captain has a shield and the non-humanoid guardians do not expose a hidden weapon", () => {
  assert.ok(buildGuardianRig("captain").shield);
  for (const id of ["stalker", "leviathan"] as const) {
    const rig = buildGuardianRig(id);
    assert.equal(rig.hips.visible, false);
    assert.equal(rig.weapon, undefined);
  }
});

test("the Sentinel's wings animate and ambient particles have a small screen-space cap", () => {
  const rig = buildGuardianRig("sentinel");
  const motion = rig.root.userData.guardianMotion;
  animateGuardianRig(rig, 0, "idle", 0);
  const before = motion.left.rotation.z;
  animateGuardianRig(rig, 0.3, "attack", 0.5);
  assert.notEqual(motion.left.rotation.z, before);
  const embers = new AmbientEmbers(8);
  const particles = new Particles(8);
  assert.equal((embers.points.material as THREE.ShaderMaterial).uniforms.uPointMax.value, 5);
  assert.equal((particles.points.material as THREE.ShaderMaterial).uniforms.uPointMax.value, 48);
});
