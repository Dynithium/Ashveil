import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Game } from "../src/game/engine";
import { EPILOGUE_STEPS, epilogueDialogue } from "../src/game/epilogue";

test("the epilogue reflects Shards and frontier support without changing the ending", () => {
  assert.equal(EPILOGUE_STEPS.length, 3);
  assert.match(epilogueDialogue(0, 8, true).lines[0], /eight/i);
  assert.match(epilogueDialogue(0, 0, false).lines[0], /uneven/i);
  assert.match(epilogueDialogue(1, 0, true).lines[0], /guides and supplies/i);
  assert.match(epilogueDialogue(1, 0, false).lines[0], /few volunteers/i);
  assert.match(epilogueDialogue(2, 0, false).lines[1], /judge what I do/i);
});

test("each completed decision is saved before the closing narration and victory screen", () => {
  const game = Object.create(Game.prototype) as any;
  const saves: string[] = [];
  const tiers: number[] = [];
  Object.assign(game, {
    dialogue: { idx: 0, lines: ["line"] }, dialogueKind: "epilogueStep", epilogueStage: 0,
    epiloguePhase: "active", epilogueCast: [], shardsCollected: 0, time: 100,
    world: { setShardTier: (tier: number) => tiers.push(tier) },
    syncBeacon() {}, emit() {}, clearEpilogueCast() {},
    saveGame() { saves.push(`${this.epiloguePhase}:${this.epilogueStage}`); },
    startDialogue(kind: string) { this.dialogueKind = kind; this.dialogue = { idx: 0, lines: ["line"] }; },
  });
  game.advanceDialogue();
  assert.equal(game.epilogueStage, 1);
  assert.deepEqual(saves, ["active:1"]);
  assert.deepEqual(tiers, [1]);
  game.dialogue = { idx: 0, lines: ["line"] };
  game.dialogueKind = "epilogueStep";
  game.epilogueStage = 2;
  game.advanceDialogue();
  assert.equal(game.epiloguePhase, "closing");
  assert.equal(game.dialogueKind, "epilogueClosing");
  assert.equal(saves.at(-1), "closing:3");
  game.advanceDialogue();
  assert.equal(game.epiloguePhase, "complete");
  assert.equal(game.victoryAt, 93.5);
  assert.equal(saves.at(-1), "complete:3");
});
