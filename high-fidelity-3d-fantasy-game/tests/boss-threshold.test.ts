import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { NPC, type GameCtx } from "../src/game/actors";

function boss() {
  // Exercise the real damage pipeline without creating a renderer or a world.
  const npc = Object.create(NPC.prototype) as NPC;
  Object.assign(npc, {
    kind: "boss", bossRole: "main", dead: false, dormant: false,
    hp: 100, maxHp: 100, damageTakenMul: 1, aggro: false, poise: 0,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    flash: () => {},
  });
  return npc;
}

test("a lethal hit gives the final encounter a chance to run its required transition", () => {
  const npc = boss();
  let transitions = 0;
  const ctx = {
    onBossThreshold: (target: NPC) => {
      transitions++;
      assert.equal(target.hp, 0);
      target.hp = 50;
      return true;
    },
    onKill: () => assert.fail("the transition must precede the death pipeline"),
  } as unknown as GameCtx;
  npc.damage(150, new THREE.Vector3(), ctx);
  assert.equal(transitions, 1);
  assert.equal(npc.hp, 50);
  assert.equal(npc.dead, false);
});

test("ordinary enemies do not invoke the final encounter transition", () => {
  const npc = boss();
  npc.bossRole = "shard";
  const ctx = { onBossThreshold: () => assert.fail("not the final boss") } as unknown as GameCtx;
  npc.damage(10, new THREE.Vector3(), ctx);
  assert.equal(npc.hp, 90);
});
