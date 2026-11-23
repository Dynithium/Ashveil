const fs = require("fs");
const p = "C:/Users/mmirz/OneDrive/Documents/GitHub/Ashveil/high-fidelity-3d-fantasy-game/src/game/engine.ts";
let txt = fs.readFileSync(p, "utf8");

const CP1252 = {};
{
  const specials = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
    0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
    0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
  };
  for (const k of Object.keys(specials)) CP1252[String.fromCodePoint(Number(k))] = specials[k];
  for (let b = 0; b < 256; b++) {
    const ch = String.fromCharCode(b);
    if (!(ch in CP1252)) CP1252[ch] = b;
  }
}

const before = (txt.match(/â€/g) || []).length;
const RE = /[-ÿ][-ÿ‘’“”–—…†‡•‰′″‹›€™∂∆∏∑−∕∙√∞∫≈≠≤≥⌐⌠⌡├┤┬┴┼─│ -ÿ]*/g;
let runs = 0;
txt = txt.replace(RE, (run) => {
  const bytes = [];
  for (const ch of run) {
    const b = CP1252[ch];
    if (b === undefined) return run;
    bytes.push(b);
  }
  const dec = Buffer.from(bytes).toString("utf8");
  if (dec.includes("�") || dec === run) return run;
  runs++;
  return dec;
});
const after = (txt.match(/â€/g) || []).length;
fs.writeFileSync(p, txt, "utf8");
console.log(`moji before=${before} after=${after} repairedRuns=${runs}`);
const i = txt.indexOf("intro: [");
console.log("sample:", JSON.stringify(txt.slice(i - 120, i + 40)));
