import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Game } from "../src/game/engine";

test("the king's trial advances on three hits and offers a non-parry route", () => {
  const game = Object.create(Game.prototype) as any;
  const king = { flash() {} };
  let completed = 0;
  Object.assign(game, { trialActor: king, trialPhase: "strikes", trialHits: 0,
    trialParryAttempts: 0, showBanner() {}, finishKingTrial: () => { completed++; } });
  for (let i = 0; i < 3; i++) assert.equal(game.onKingTrialHit(king), true);
  assert.equal(game.trialPhase, "dodge");
  assert.equal(game.onKingTrialHit({}), false);
  game.trialPhase = "parry";
  for (let i = 0; i < 4; i++) game.onKingTrialHit(king);
  assert.equal(completed, 0);
  game.onKingTrialHit(king);
  assert.equal(completed, 1);
});
