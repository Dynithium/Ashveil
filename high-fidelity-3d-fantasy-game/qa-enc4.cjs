const fs = require("fs");
const p = "C:/Users/mmirz/OneDrive/Documents/GitHub/Ashveil/high-fidelity-3d-fantasy-game/src/game/engine.ts";
const txt = fs.readFileSync(p, "utf8");
const CP1252 = {};
{
  const specials = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
    0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
    0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
  };
  for (const [cp, b] of Object.entries(specials)) CP1252[String.fromCodePoint(parseInt(cp, 16))] = b;
  for (let b = 0; b < 256; b++) {
    const ch = String.fromCharCode(b);
    if (!(ch in CP1252)) CP1252[ch] = b;
  }
}
const i = txt.indexOf("â€");
const run = txt.slice(i, i + 3);
console.log("run:", JSON.stringify(run), Array.from(run).map((c) => c.codePointAt(0).toString(16)));
const bytes = Array.from(run).map((ch) => CP1252[ch]);
console.log("bytes:", bytes.map((b) => (b === undefined ? "undef" : b.toString(16))));
if (bytes.every((b) => b !== undefined)) {
  const dec = Buffer.from(bytes).toString("utf8");
  console.log("decoded:", JSON.stringify(dec), "hasRepl:", dec.includes("�"));
}
