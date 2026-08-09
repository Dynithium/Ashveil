// ---------------------------------------------------------------------------
// ASHVEIL — procedural terrain field
// Deterministic noise + the single source of truth for ground height.
// ---------------------------------------------------------------------------

const PERM = new Uint8Array(512);
(function seedPerm() {
  let s = 1337 >>> 0;
  const rnd = () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function grad(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? 2 * v : -2 * v);
}

/** Classic 2D perlin, range approximately [-1, 1] */
export function noise2(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const aa = PERM[PERM[X] + Y];
  const ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];
  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
  return lerp(x1, x2, v) * 0.7;
}

export function fbm(x: number, y: number, octaves = 5, lac = 2.03, gain = 0.5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

export function ridged(x: number, y: number, octaves = 4): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(x * freq, y * freq)) * 1.6;
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerpN = lerp;

// --------------------------- world constants -------------------------------
export const WORLD = {
  // Expanded ~3.5× in area. Kept < 500 so the mountain cliff shader stays sane.
  radius: 420,
  wall: 410,
  arenaRadius: 52,
  arenaCenter: { x: 0, z: 0 },
  graceAt: { x: 6, z: 101 },
  castle: { x: 0, z: 120, r: 26 },
  kingAt: { x: 0, z: 125.4 },
};

// ---------------------------------------------------------------------------
// Biome anchors — expanded and repositioned to fill the new world radius.
// Each biome now has real distance (30-350 units from spawn).
// ---------------------------------------------------------------------------
export const BIOMES = {
  cinder: { x: -260, z: 60, r: 78 },
  frost: { x: 250, z: -80, r: 82 },
  mire: { x: -80, z: -290, r: 84 },
};

export function biomeWeights(x: number, z: number) {
  const w = (b: typeof BIOMES.cinder) => smoothstep(b.r, b.r * 0.25, Math.hypot(x - b.x, z - b.z));
  return { cinder: w(BIOMES.cinder), frost: w(BIOMES.frost), mire: w(BIOMES.mire) };
}

/** Ground height at world (x, z). Everything (physics, props, grass) uses this. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.sqrt(x * x + z * z);

  // rolling ash plains
  let h = fbm(x * 0.0065, z * 0.0065, 5) * 24;
  h += fbm(x * 0.021 + 31.7, z * 0.021 - 12.4, 4) * 5.2;
  h += ridged(x * 0.0135 - 4.2, z * 0.0135 + 8.8, 4) * 7.5;

  // a shallow processional valley leading south -> arena
  const road = Math.exp(-Math.pow((x - Math.sin(z * 0.012) * 12) / 16, 2));
  h -= road * 4.2 * smoothstep(30, 70, r);

  // the sunken cathedral arena, flattened
  const arena = smoothstep(WORLD.arenaRadius + 22, WORLD.arenaRadius - 14, r);
  const arenaFloor = -6 + fbm(x * 0.06, z * 0.06, 2) * 0.14;
  h = lerp(h, arenaFloor, arena);

  // lip / stairs ring around the arena
  const lip = smoothstep(WORLD.arenaRadius + 26, WORLD.arenaRadius + 6, r) * smoothstep(WORLD.arenaRadius - 16, WORLD.arenaRadius + 4, r);
  h += lip * 3.0;

  // encircling cliffs — pushed out to the new world radius
  const cliff = smoothstep(340, 420, r);
  h += Math.pow(cliff, 1.7) * 150 + ridged(x * 0.03, z * 0.03, 3) * cliff * 30;

  // mid-range rolling hills give the larger world some real elevation change
  h += fbm(x * 0.003, z * 0.003, 3) * 24 * smoothstep(80, 260, r);

  // Kingsfall Keep — a flat plateau to the north
  const cd = Math.hypot(x, z - 120);
  h = lerp(h, 9.8, smoothstep(46, 30, cd));

  return h;
}

// ---------------------------------------------------------------------------
// Walkable platforms (castle floors, stairs, ramps). Axis-aligned rectangles
// with either a flat top or a linear ramp along one axis.
// ---------------------------------------------------------------------------
export interface Platform {
  x0: number; x1: number; z0: number; z1: number;
  y0: number; y1?: number;
  axis?: "x" | "z";
}

export const platforms: Platform[] = [];

export function addPlatform(p: Platform) {
  platforms.push(p);
  return p;
}

export function platformTop(p: Platform, x: number, z: number): number {
  if (p.axis === "z" && p.y1 !== undefined) {
    const t = clamp((z - p.z0) / (p.z1 - p.z0), 0, 1);
    return lerp(p.y0, p.y1, t);
  }
  if (p.axis === "x" && p.y1 !== undefined) {
    const t = clamp((x - p.x0) / (p.x1 - p.x0), 0, 1);
    return lerp(p.y0, p.y1, t);
  }
  return p.y0;
}

/**
 * Height of the highest walkable surface at (x, z) that the given feet height
 * can stand on. Anything more than `step` above the feet is a ceiling, not a
 * floor, so the actor stays below it.
 */
export function groundAt(x: number, z: number, feetY: number, step = 0.9): number {
  let best = terrainHeight(x, z);
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    const y = platformTop(p, x, z);
    if (y > best && y <= feetY + step) best = y;
  }
  return best;
}

/** True when (x,z,y) sits inside the keep's interior column. */
export function insideKeep(x: number, z: number): boolean {
  return x > -11 && x < 11 && z > 108.6 && z < 131.4;
}

/** Analytic-ish normal via central differences. */
export function terrainNormal(x: number, z: number, out: { x: number; y: number; z: number }) {
  const e = 0.7;
  const hL = terrainHeight(x - e, z);
  const hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e);
  const hU = terrainHeight(x, z + e);
  let nx = hL - hR;
  let ny = 2 * e;
  let nz = hD - hU;
  const len = Math.hypot(nx, ny, nz) || 1;
  out.x = nx / len;
  out.y = ny / len;
  out.z = nz / len;
  return out;
}

export function slopeAt(x: number, z: number): number {
  const n = terrainNormal(x, z, { x: 0, y: 1, z: 0 });
  return 1 - n.y;
}

/** Seeded RNG for scattering props deterministically. */
export function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
