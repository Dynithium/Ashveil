import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(join(tmpdir(), "ashveil-tests-"));
try {
  const names = ["boss-threshold", "postgame", "king-trial", "save-roundtrip", "regional-culls", "regional-stories", "opening", "epilogue", "shard-abilities", "grapple", "filter-hazards", "guardian-rigs", "guardian-attacks", "relic-loadout"];
  await build({ entryPoints: names.map((name) => `tests/${name}.test.ts`), outdir: directory, outExtension: { ".js": ".cjs" }, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  const result = spawnSync(process.execPath, ["--test", ...names.map((name) => join(directory, `${name}.test.cjs`))], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
