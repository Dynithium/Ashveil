const fs = require("fs");
const path = require("path");
const dir = "C:/Users/mmirz/OneDrive/Documents/GitHub/Ashveil/high-fidelity-3d-fantasy-game/src";
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|css)$/.test(e.name)) {
      const buf = fs.readFileSync(p);
      const txt = buf.toString("utf8");
      const bad = [];
      // U+FFFD replacement char
      const repl = (txt.match(/�/g) || []).length;
      // classic UTF-8-as-ANSI mojibake markers
      const moji = (txt.match(/â€|Ã©|Â/g) || []).length;
      // lone '?' inside string literals that should be punctuation
      if (repl || moji) bad.push(`repl=${repl} moji=${moji}`);
      if (bad.length) console.log(path.basename(p), bad.join(" "));
    }
  }
}
walk(dir);
console.log("scan complete");
