const fs = require("fs");
const p = "C:/Users/mmirz/OneDrive/Documents/GitHub/Ashveil/high-fidelity-3d-fantasy-game/src/game/engine.ts";
const txt = fs.readFileSync(p, "utf8");
const needles = [
  "the King’s Trial",
  "Walk with W A S D",
  "SHATTER STRIKE",
  "— a decaying rune",
  "Malenkar",
  "F — Speak with",
  "·",
  "…",
];
for (const n of needles) {
  const c = (txt.split(n).length - 1);
  console.log(`${JSON.stringify(n)} -> ${c}`);
}
console.log("--- sample lines ---");
const lines = txt.split("\n");
for (const l of lines) {
  if (l.includes("Walk with W A S D") || l.includes("the King") && l.includes("Trial")) console.log(l.trim());
}
