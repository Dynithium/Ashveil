import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { Game } from "../src/game/engine";
import { PROLOGUE_BEATS, PROLOGUE_POINTS, advancePrologueFade } from "../src/game/kinterOpening";

test("Elderville and the playable border precede the months-later forest", () => {
  assert.deepEqual(PROLOGUE_BEATS.slice(0, 3).map((beat) => beat.id), ["last-night", "border", "arrival"]);
  const border = PROLOGUE_BEATS[1];
  assert.equal(border.mode, "traverse");
  assert.equal(border.awaits.length, 3);
  assert.ok(border.awaits.every((item) => !item.required && item.position));
});

test("a scene with both fades becomes visible before fading out", () => {
  let fade = 1;
  for (let i = 0; i < 30; i++) fade = advancePrologueFade(fade, true, 28, i / 10, 0.1);
  assert.equal(fade, 0);
  assert.ok(advancePrologueFade(0, true, 28, 27, 0.1) > 0.8);
});

test("border landmarks prompt only when nearby and do not repeat", () => {
  const game = Object.create(Game.prototype) as any;
  Object.assign(game, { dialogue: null, prologueIdx: 1, prologueBeatTime: 0, prologueElapsed: 0,
    prologueAwaitDone: new Set(), player: { pos: new THREE.Vector3(PROLOGUE_POINTS.borderCairn.x, 0, PROLOGUE_POINTS.borderCairn.z) } });
  assert.match(game.currentProloguePrompt(), /cairn/i);
  game.prologueAwaitDone.add("border:border-cairn");
  assert.equal(game.currentProloguePrompt(), null);
  game.player.pos.set(PROLOGUE_POINTS.borderSign.x, 0, PROLOGUE_POINTS.borderSign.z);
  assert.match(game.currentProloguePrompt(), /sign/i);
});
