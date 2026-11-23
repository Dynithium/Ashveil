import * as THREE from "three";
import { BIOMES, FLATTENS, WORLD, addPlatform, biomeWeights, clearPlatforms, fbm, makeRng, slopeAt, smoothstep, terrainHeight } from "./terrain";
import type { GrappleAnchor } from "./actors";
import { buildRig, poseRig } from "./rig";
import { SETTLEMENTS, VIOLET_MERE } from "./settlements";
import { SHRINES } from "./shrines";

// ---------------------------------------------------------------------------
// ASHVEIL — world construction: sky, land, the Sundered Tree, ruins, flora
// ---------------------------------------------------------------------------

export interface Collider {
  x: number;
  z: number;
  r: number;
}

const SUN_DIR = new THREE.Vector3(-0.42, 0.2, -0.88).normalize();

// ------------------------------- sky ---------------------------------------
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform float uTime;
uniform float uNight;
uniform float uStorm;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ v += a*vnoise(p); p *= 2.05; a *= 0.5; }
  return v;
}

void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y*0.5+0.5, 0.0, 1.0);

  // night sky deepens toward indigo-black; day keeps the warm dusk palette
  vec3 nightZenith = vec3(0.010, 0.012, 0.026);
  vec3 nightMid    = vec3(0.028, 0.030, 0.052);
  vec3 nightHoriz  = vec3(0.055, 0.048, 0.075);
  vec3 zenith  = mix(vec3(0.031, 0.036, 0.070), nightZenith, uNight);
  vec3 mid     = mix(vec3(0.115, 0.098, 0.121), nightMid, uNight);
  vec3 horizon = mix(vec3(0.402, 0.276, 0.150), nightHoriz, uNight);
  vec3 col = mix(horizon, mid, smoothstep(0.42, 0.62, h));
  col = mix(col, zenith, smoothstep(0.58, 0.98, h));

  // sun + halo (fades out below the horizon)
  float sd = max(dot(d, normalize(uSun)), 0.0);
  float sunVis = 1.0 - uNight;
  col += vec3(1.0, 0.72, 0.34) * pow(sd, 900.0) * 6.0 * sunVis;
  col += vec3(1.0, 0.66, 0.30) * pow(sd, 22.0) * 0.42 * sunVis;
  col += vec3(0.95, 0.60, 0.28) * pow(sd, 4.0) * 0.10 * sunVis;

  // moon + halo (opposite side of the sky, only visible at night)
  float md = max(dot(d, normalize(uMoon)), 0.0);
  col += vec3(0.78, 0.85, 1.0) * pow(md, 1400.0) * 5.0 * uNight;
  col += vec3(0.55, 0.63, 0.85) * pow(md, 40.0) * 0.3 * uNight;

  // stars — brighten heavily at night
  if (d.y > 0.02) {
    vec2 sp = d.xz / (d.y + 0.35) * 6.0;
    float st = hash(floor(sp * 62.0));
    float tw = 0.5 + 0.5 * sin(uTime * 1.7 + st * 60.0);
    float star = smoothstep(0.9965, 1.0, st) * tw;
    col += vec3(0.85, 0.88, 1.0) * star * smoothstep(0.02, 0.55, d.y) * (0.25 + uNight * 1.8);
  }

  // clouds (single layer — the second octave set was pure GPU cost)
  vec2 cp = d.xz / max(d.y * 0.9 + 0.14, 0.06);
  float c1 = fbm(cp * 0.34 + vec2(uTime * 0.0055, uTime * 0.0022));
  float clouds = smoothstep(0.40, 0.86, c1);
  float cf = clouds * smoothstep(-0.02, 0.30, d.y);
  float lit = pow(max(dot(d, normalize(uSun)), 0.0), 3.0);
  vec3 cloudCol = mix(vec3(0.085, 0.075, 0.088), vec3(0.92, 0.62, 0.34), lit * 0.85 + 0.12);
  col = mix(col, cloudCol, cf * 0.86);

  // golden haze rising from the horizon (suppressed at night, storms mute it)
  col += vec3(0.55, 0.36, 0.14) * pow(1.0 - abs(d.y), 12.0) * 0.55 * (1.0 - uNight * 0.7);

  // storm darkening + desaturation
  col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * vec3(0.66, 0.65, 0.68), uStorm * 0.7);
  col *= mix(1.0, 0.56, uStorm);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// --------------------------- texture helpers -------------------------------
function noiseTexture(size = 512, scale = 8, contrast = 1): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      v += fbm((x / size) * scale, (y / size) * scale, 5) * 0.5 + 0.5;
      v = Math.pow(Math.min(1, Math.max(0, v)), contrast);
      const i = (y * size + x) * 4;
      const b = v * 255;
      img.data[i] = b;
      img.data[i + 1] = b;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function normalFromHeight(size = 512, scale = 10, strength = 2.4): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const H = (x: number, y: number) => fbm((x / size) * scale, (y / size) * scale, 5);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(-dx, -dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Generated once, cloned per-material (image data is shared).
let _detailNormal: THREE.Texture | null = null;
let _detailRough: THREE.Texture | null = null;
function detailNormal(rx: number, ry: number) {
  if (!_detailNormal) _detailNormal = normalFromHeight(256, 12, 2.6);
  const t = _detailNormal.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}
function detailRough(rx: number, ry: number) {
  if (!_detailRough) _detailRough = noiseTexture(256, 9, 1.2);
  const t = _detailRough.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

// ------------------------------ the World ----------------------------------
export class World {
  scene = new THREE.Scene();
  skyRoot!: THREE.Mesh;
  ruinsRoot!: THREE.Group;
  ruinColliders: Collider[] = [];
  floraRoot!: THREE.Group;
  mistRoot!: THREE.InstancedMesh;
  sun!: THREE.DirectionalLight;
  moonDir = SUN_DIR.clone().multiplyScalar(-1);
  sunDir = SUN_DIR.clone();
  colliders: Collider[] = [];
  grappleAnchors: GrappleAnchor[] = [];
  private skyMat!: THREE.ShaderMaterial;
  private windMats: THREE.Material[] = [];
  private shaderUniforms: { value: number }[] = [];
  private windUniforms: { value: number }[] = [];
  graceShard?: THREE.Mesh;
  treeRoot!: THREE.Group;
  braziers: { light: THREE.PointLight; base: number; phase: number }[] = [];

  graceSites: { pos: THREE.Vector3; shard: THREE.Mesh; name: string }[] = [];
  /** The 24 Shrines of Light — silent obelisks that remember the old world. */
  shrineSites: { pos: THREE.Vector3; flame: THREE.Mesh; halo: THREE.Mesh; name: string; id: string; kind: string }[] = [];
  loreStones: { pos: THREE.Vector3; id: number; mesh: THREE.Mesh }[] = [];
  // ---- THE BLACK CITADEL — the warlord's stolen engine, hanging in the dark ----
  /** The Raeku, suspended over Malenkar's dais — the engine rotates it slowly. */
  citadelRaeku: THREE.Group | null = null;
  /** Umbilical cables from the sanctum pillars into the Raeku. Ripped free at Phase 2. */
  citadelCables: THREE.Group | null = null;
  /** The siphon beam feeding the dais. Collapses when the cables are cut. */
  citadelBeam: THREE.Mesh | null = null;
  private citadelFlicker: THREE.MeshStandardMaterial[] = [];
  // ---- the Raeku in Kingsfall Keep — brightens with every Shard returned ----
  keepRaekuCore: THREE.MeshStandardMaterial | null = null;
  keepRaekuLight: THREE.PointLight | null = null;

  // ---- visible restoration: Shards rebuild the keep, quests rebuild lives ----
  private shardTier = 0;
  private keepWindowTiers: { mat: THREE.MeshBasicMaterial; minTier: number }[] = [];
  private keepHearths: { light: THREE.PointLight; base: number; phase: number; original: number }[] = [];
  private relayHalos: { mesh: THREE.Object3D; minTier: number }[] = [];
  private restorationGroups: { group: THREE.Group; minTier: number }[] = [];
  private reactivePatrols: { rig: ReturnType<typeof buildRig>; minTier: number; x: number; z: number; axis: "x" | "z"; range: number; phase: number }[] = [];
  private questLanterns: { flame: THREE.Mesh; light: THREE.PointLight; phase: number }[] = [];
  private convoy: { root: THREE.Group; rigs: ReturnType<typeof buildRig>[]; wheels: THREE.Mesh[] } | null = null;
  private scoutMemorial: THREE.Group | null = null;
  private mossDome: THREE.Group | null = null;
  private signalArray: THREE.Group | null = null;
  private sanctuaryBeacon: THREE.Group | null = null;
  private stiltSkiff: { root: THREE.Group; rig: ReturnType<typeof buildRig>; pole: THREE.Mesh } | null = null;
  private miragePumps: { root: THREE.Group; wheels: THREE.Group[]; pistons: { mesh: THREE.Mesh; baseY: number }[]; waterMat: THREE.MeshBasicMaterial } | null = null;
  private cloudGondola: { root: THREE.Group; car: THREE.Group; curve: THREE.QuadraticBezierCurve3; wheels: THREE.Mesh[] } | null = null;
  time = 0;

  // ---- day / night ----
  static readonly DAY_LENGTH = 600; // seconds for a full cycle
  dayPhase = 0.28; // 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk
  nightFactor = 0;
  private hemi!: THREE.HemisphereLight;
  private fill!: THREE.DirectionalLight;

  // ---- weather ----
  weather: "clear" | "ash" | "ember" = "clear";
  private ashTarget = 0;
  private emberTarget = 0;
  private ashAmt = 0;
  private emberAmt = 0;
  private fogBase = 0.0048;
  private fogColorClear = new THREE.Color(0x2a2018);
  private fogColorAsh = new THREE.Color(0x3a342c);
  private fogColorEmber = new THREE.Color(0x33201a);

  constructor() {
    clearPlatforms();
    this.scene.fog = new THREE.FogExp2(0x2a2018, 0.0048);
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildSunderedTree();
    this.buildArena();
    this.buildCastle();
    this.buildCitadel();
    this.buildRaekuHeart();
    this.buildSettlements();
    this.buildRuins();
    this.buildFlora();
    this.buildBiomeProps();
    this.buildAshveilGuardians();
    this.buildGrappleAnchors();
    this.buildGrace();
    this.buildShrines();
    this.buildLoreStones();
    this.buildWorldReactions();
    this.buildMist();
  }

  /** Visible line anchors around each guardian arena and the Citadel. */
  private buildGrappleAnchors() {
    const names = ["Iron Dunes", "Sunken Bastion", "Cinderwood", "Glass Crags", "Slag Marshes", "Whispering Spire", "Forgotten Foundry", "Ashen Cathedral"];
    const metal = new THREE.MeshStandardMaterial({ color: 0x555b60, metalness: 0.7, roughness: 0.55 });
    const light = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9 });
    const poleGeometry = new THREE.CylinderGeometry(0.1, 0.16, 5, 6);
    const ringGeometry = new THREE.TorusGeometry(0.7, 0.13, 6, 14);
    const add = (id: string, name: string, x: number, z: number) => {
      const y = terrainHeight(x, z);
      const group = new THREE.Group();
      const pole = new THREE.Mesh(poleGeometry, metal);
      pole.position.y = 2.5;
      const ring = new THREE.Mesh(ringGeometry, light);
      ring.position.y = 5.25;
      group.position.set(x, y, z);
      group.add(pole, ring);
      this.scene.add(group);
      this.grappleAnchors.push({ id, name, pos: new THREE.Vector3(x, y + 5.25, z) });
    };
    FLATTENS.forEach((lair, index) => {
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3 + 0.35;
        add(`lair-${index}-${i}`, `${names[index]} anchor`, lair.x + Math.cos(angle) * 24, lair.z + Math.sin(angle) * 24);
      }
    });
    [[-25, -25], [25, -25], [-25, 8], [25, 8]].forEach(([x, z], index) => add(`citadel-${index}`, "Citadel anchor", x, z));
  }

  // ------------------------------ sky --------------------------------------
  private buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: this.sunDir },
        uMoon: { value: this.moonDir },
        uTime: { value: 0 },
        uNight: { value: 0 },
        uStorm: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2200, 48, 32), this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    sky.name = "world-sky";
    this.scene.add(sky);
    this.skyRoot = sky;
  }

  private buildLights() {
    const sun = new THREE.DirectionalLight(0xffc98a, 3.1);
    sun.position.copy(this.sunDir).multiplyScalar(180);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 300;
    const d = 54;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    const hemi = new THREE.HemisphereLight(0x6a5f8c, 0x241a14, 0.75);
    this.scene.add(hemi);
    this.hemi = hemi;

    const fill = new THREE.DirectionalLight(0x5f78c8, 0.55);
    fill.position.set(60, 40, 80);
    this.scene.add(fill);
    this.fill = fill;
  }

  // ---------------------------- terrain ------------------------------------
  private buildTerrain() {
    // World is now ~2× radius, but we keep segment density roughly constant
    // so per-vertex cost per screen-pixel doesn't explode. Distant terrain
    // reads fine at this density thanks to fog + biome vertex-color washes.
    const SIZE = WORLD.radius * 2.4;
    const SEG = 288;
    const N = SEG + 1;
    const step = SIZE / SEG;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    // pass 1 — heights
    const H = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const h = terrainHeight(pos.getX(i), pos.getZ(i));
      H[i] = h;
      pos.setY(i, h);
    }
    const gridSlope = (i: number) => {
      const col = i % N;
      const row = (i / N) | 0;
      const l = H[row * N + Math.max(0, col - 1)];
      const rr = H[row * N + Math.min(N - 1, col + 1)];
      const u = H[Math.max(0, row - 1) * N + col];
      const d = H[Math.min(N - 1, row + 1) * N + col];
      const nx = (l - rr) / (2 * step);
      const nz = (u - d) / (2 * step);
      return 1 - 1 / Math.sqrt(1 + nx * nx + nz * nz);
    };

    const cRock = new THREE.Color(0x413a34);
    const cAsh = new THREE.Color(0x554a3d);
    const cGrass = new THREE.Color(0x5d5230);
    const cGold = new THREE.Color(0x8a7434);
    const cDark = new THREE.Color(0x241f1c);
    const cCinder = new THREE.Color(0x3a1912);
    const cFrost = new THREE.Color(0x77849a); // was 0xcdd9e4 — snowed the whole reach out from under the player
    const cMire = new THREE.Color(0x3d4a30);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const slope = gridSlope(i);
      const r = Math.hypot(x, z);
      const patch = fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5;

      tmp.copy(cGrass).lerp(cGold, patch * 0.75);
      tmp.lerp(cAsh, smoothstep(0.06, 0.3, slope));
      tmp.lerp(cRock, smoothstep(0.22, 0.62, slope));
      // arena floor is dark scorched stone
      tmp.lerp(cDark, smoothstep(WORLD.arenaRadius + 12, WORLD.arenaRadius - 16, r) * 0.85);
      // scorch radiating from the arena
      tmp.multiplyScalar(0.72 + 0.4 * smoothstep(WORLD.arenaRadius, WORLD.arenaRadius + 60, r));

      // regional biome identity — cheap distance-blend, zero texture cost
      const bw = biomeWeights(x, z);
      if (bw.cinder > 0.001) tmp.lerp(cCinder, bw.cinder * 0.82);
      if (bw.frost > 0.001) tmp.lerp(cFrost, bw.frost * 0.88);
      if (bw.mire > 0.001) tmp.lerp(cMire, bw.mire * 0.8);

      const grain = 0.86 + 0.28 * (fbm(x * 0.25, z * 0.25, 2) * 0.5 + 0.5);
      colors[i * 3] = tmp.r * grain;
      colors[i * 3 + 1] = tmp.g * grain;
      colors[i * 3 + 2] = tmp.b * grain;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const nrm = detailNormal(90, 90);
    const rough = detailRough(50, 50);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.02,
      normalMap: nrm,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: rough,
      dithering: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = "terrain";
    this.scene.add(mesh);
  }

  // -------------------------- the Sundered Tree ----------------------------
  private buildSunderedTree() {
    const group = new THREE.Group();
    group.name = "sundered-tree";
    group.position.set(-210, -30, -560);

    const bark = new THREE.MeshStandardMaterial({
      color: 0x2a2118,
      roughness: 0.85,
      metalness: 0.1,
      emissive: 0xffb347,
      emissiveIntensity: 0.42,
    });

    // trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(9, 30, 250, 16, 6, true), bark);
    trunk.position.y = 125;
    const tp = trunk.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i);
      const w = 1 + fbm(tp.getX(i) * 0.06, y * 0.02, 3) * 0.22;
      tp.setX(i, tp.getX(i) * w);
      tp.setZ(i, tp.getZ(i) * w);
    }
    trunk.geometry.computeVertexNormals();
    group.add(trunk);

    // canopy: layered glowing shells
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffcb6b,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    for (let i = 0; i < 5; i++) {
      const s = 118 + i * 26;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 16), glowMat.clone());
      (shell.material as THREE.MeshBasicMaterial).opacity = 0.14 - i * 0.021;
      shell.position.y = 260;
      shell.scale.set(1, 0.72, 1);
      group.add(shell);
    }

    const leafMat = new THREE.MeshStandardMaterial({
      color: 0xd8a04a,
      emissive: 0xffb03a,
      emissiveIntensity: 2.4,
      roughness: 0.6,
      flatShading: true,
    });
    const rng = makeRng(9182);
    const branchGeo = new THREE.CylinderGeometry(1.2, 4.5, 70, 6, 1, true);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng() * 0.4;
      const tilt = 0.5 + rng() * 0.55;
      const b = new THREE.Mesh(branchGeo, bark);
      b.position.set(Math.cos(a) * 26, 230 + rng() * 60, Math.sin(a) * 26);
      b.rotation.z = -Math.cos(a) * tilt;
      b.rotation.x = Math.sin(a) * tilt;
      group.add(b);

      const cluster = new THREE.Mesh(new THREE.IcosahedronGeometry(24 + rng() * 22, 1), leafMat);
      cluster.position.set(Math.cos(a) * (72 + rng() * 46), 268 + rng() * 92, Math.sin(a) * (72 + rng() * 46));
      cluster.scale.set(1, 0.66, 1);
      group.add(cluster);
    }

    // giant additive halo billboard
    const haloTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d")!;
      const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, "rgba(255,236,190,1)");
      grd.addColorStop(0.22, "rgba(255,190,105,0.55)");
      grd.addColorStop(0.55, "rgba(220,140,60,0.16)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })();
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.85,
        fog: false,
      }),
    );
    halo.position.y = 250;
    group.add(halo);

    // light shafts
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xffc978,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    for (let i = 0; i < 9; i++) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(60 + i * 14, 700), shaftMat);
      shaft.position.set((i - 4) * 34, 90, 20 + i * 4);
      shaft.rotation.z = (i - 4) * 0.045;
      group.add(shaft);
    }

    // the tree itself burns — no bare bulb needed; its glow carries the horizon
    this.scene.add(group);
    this.treeRoot = group;

    // secondary distant mountains
    const mMat = new THREE.MeshStandardMaterial({ color: 0x1d1a24, roughness: 1, flatShading: true, fog: true });
    const mrng = makeRng(551);
    for (let i = 0; i < 22; i++) {
      const a = mrng() * Math.PI * 2;
      const dist = 620 + mrng() * 520;
      const hgt = 160 + mrng() * 330;
      const m = new THREE.Mesh(new THREE.ConeGeometry(120 + mrng() * 180, hgt, 5 + Math.floor(mrng() * 4), 1), mMat);
      m.position.set(Math.cos(a) * dist, hgt * 0.34 - 40, Math.sin(a) * dist);
      m.rotation.y = mrng() * 3;
      this.scene.add(m);
    }
  }

  // ------------------------------ arena ------------------------------------
  private buildArena() {
    const stone = new THREE.MeshStandardMaterial({
      color: 0x4b453d,
      roughness: 0.92,
      metalness: 0.05,
      flatShading: false,
    });
    stone.normalMap = detailNormal(4, 4);

    const R = WORLD.arenaRadius;
    const floorY = terrainHeight(0, 0);

    // engraved sigil rings burned into the scorched floor
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffa63c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const rr of [R * 0.28, R * 0.46, R * 0.66]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(rr - 0.4, rr, 160), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = floorY + 0.22;
      this.scene.add(ring);
    }
    // radial spokes
    const spokeMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
    const spokeGeo = new THREE.PlaneGeometry(0.3, R * 0.4);
    spokeGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const spoke = new THREE.Mesh(spokeGeo, spokeMat);
      spoke.rotation.y = Math.PI / 2 - a;
      spoke.position.set(Math.cos(a) * R * 0.46, floorY + 0.2, Math.sin(a) * R * 0.46);
      this.scene.add(spoke);
    }

    // shattered cathedral pillars around the rim
    const rng = makeRng(4242);
    const pillarGeo = new THREE.CylinderGeometry(2.0, 2.5, 1, 10, 1);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.08;
      const rr = R - 2.5;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      const h = 14 + rng() * 26;
      const p = new THREE.Mesh(pillarGeo, stone);
      p.position.set(x, terrainHeight(x, z) + h / 2, z);
      p.scale.y = h;
      p.rotation.y = rng() * 3;
      p.rotation.z = (rng() - 0.5) * 0.06;
      p.castShadow = true;
      p.receiveShadow = true;
      this.scene.add(p);
      this.colliders.push({ x, z, r: 2.6 });

      // capital block
      if (rng() > 0.35) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 6), stone);
        cap.position.set(x, terrainHeight(x, z) + h + 1, z);
        cap.rotation.y = rng() * 3;
        cap.castShadow = true;
        this.scene.add(cap);
      }
    }

    // braziers of the sundered flame
    const brMat = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.7, metalness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const rr = R * 0.66;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      const base = terrainHeight(x, z);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 4.2, 8), brMat);
      stand.position.set(x, base + 2.1, z);
      stand.castShadow = true;
      this.scene.add(stand);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 0.7, 1.2, 12), brMat);
      bowl.position.set(x, base + 4.6, z);
      this.scene.add(bowl);
      const flame = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.5, 1),
        new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      flame.position.set(x, base + 5.6, z);
      flame.name = "flame";
      this.scene.add(flame);
      // every third brazier carries a real light — the rest burn as emissive coals
      if (i % 3 === 0) {
        const l = new THREE.PointLight(0xff8a2a, 20, 54, 1.6);
        l.position.set(x, base + 6, z);
        this.scene.add(l);
        this.braziers.push({ light: l, base: 20, phase: i * 1.7 });
      }
    }

    // huge broken throne / altar at the arena's north
    const throne = new THREE.Group();
    const tx = 0;
    const tz = -R * 0.78;
    const ty = terrainHeight(tx, tz);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(11, 3, 9), stone);
    seat.position.set(0, 3, 0);
    seat.castShadow = true;
    throne.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(11, 22, 2.4), stone);
    back.position.set(0, 14, -3.4);
    back.rotation.x = -0.08;
    back.castShadow = true;
    throne.add(back);
    for (let i = -1; i <= 1; i += 2) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(1.4, 9, 6), stone);
      spike.position.set(i * 5.2, 27, -3.2);
      throne.add(spike);
    }
    throne.position.set(tx, ty, tz);
    this.scene.add(throne);
    this.colliders.push({ x: tx, z: tz, r: 6 });
  }

  // --------------------------- Kingsfall Keep ------------------------------
  /** Interior extents & floor heights, shared with the engine for placement. */
  keep = {
    base: 9.8,
    f2: 16.8,
    f3: 23.8,
    minX: -10, maxX: 10,
    minZ: 110, maxZ: 130,
  };

  private buildKeepTower() {
    const K = this.keep;
    K.base = terrainHeight(0, 120);
    K.f2 = K.base + 7;
    K.f3 = K.base + 14;
    const WALL_TOP = K.base + 17;
    const IX = 10.6; // wall centre-line offset
    const Z0 = 109.4;
    const Z1 = 130.6;

    const stone = new THREE.MeshStandardMaterial({ color: 0x5f584d, roughness: 0.92, metalness: 0.04 });
    stone.normalMap = detailNormal(4, 4);
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x35302a, roughness: 0.9, metalness: 0.05 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2c1d, roughness: 0.95 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.94, emissive: 0x5c3f0c, emissiveIntensity: 0.4 });

    const H = WALL_TOP - K.base;
    const addWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };

    // ---- shell: N / E / W solid, S split around a gate ----
    addWall(22.4, H, 1.2, 0, K.base + H / 2, Z1);
    addWall(1.2, H, 22.4, IX, K.base + H / 2, 120);
    addWall(1.2, H, 22.4, -IX, K.base + H / 2, 120);
    addWall(8.4, H, 1.2, -6.8, K.base + H / 2, Z0);
    addWall(8.4, H, 1.2, 6.8, K.base + H / 2, Z0);
    addWall(5.2, H - 4.5, 1.2, 0, K.base + 4.5 + (H - 4.5) / 2, Z0); // lintel over the door

    // wall colliders (skip the doorway)
    for (let z = 110; z <= 130; z += 2) {
      this.colliders.push({ x: -IX + 0.4, z, r: 1.0 }, { x: IX - 0.4, z, r: 1.0 });
    }
    for (let x = -10; x <= 10; x += 2) {
      this.colliders.push({ x, z: Z1 - 0.4, r: 1.0 });
      if (Math.abs(x) > 2.6) this.colliders.push({ x, z: Z0 + 0.4, r: 1.0 });
    }

    // ---- corner turrets ----
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * 10.9;
        const z = 120 + sz * 10.9;
        const th = H + 4.5;
        const t = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, th, 10), stone);
        t.position.set(x, K.base + th / 2, z);
        t.castShadow = t.receiveShadow = true;
        this.scene.add(t);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 4.4, 10), new THREE.MeshStandardMaterial({ color: 0x232c38, roughness: 0.7, metalness: 0.25, flatShading: true }));
        roof.position.set(x, K.base + th + 2.2, z);
        roof.castShadow = true;
        this.scene.add(roof);
        const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), goldMat);
        finial.position.set(x, K.base + th + 4.7, z);
        this.scene.add(finial);
        this.colliders.push({ x, z, r: 2.5 });
      }
    }

    // ---- battlements around the open top floor ----
    const merGeo = new THREE.BoxGeometry(1.1, 1.2, 1.2);
    const merlons = new THREE.InstancedMesh(merGeo, darkStone, 44);
    merlons.castShadow = true;
    const mm = new THREE.Matrix4();
    let mi = 0;
    const pushMerlon = (x: number, z: number, ry: number) => {
      if (mi >= 44) return;
      mm.compose(new THREE.Vector3(x, WALL_TOP + 0.6, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
      merlons.setMatrixAt(mi++, mm);
    };
    for (let x = -9.5; x <= 9.5; x += 2.4) { pushMerlon(x, Z1, 0); pushMerlon(x, Z0, 0); }
    for (let z = 111.5; z <= 128.5; z += 2.4) { pushMerlon(IX, z, Math.PI / 2); pushMerlon(-IX, z, Math.PI / 2); }
    for (; mi < 44; mi++) { mm.makeScale(0, 0, 0); merlons.setMatrixAt(mi, mm); }
    merlons.instanceMatrix.needsUpdate = true;
    this.scene.add(merlons);

    // ---- floor slabs (with stairwell openings cut out) ----
    const slab = (x0: number, x1: number, z0: number, z1: number, top: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.55, z1 - z0), darkStone);
      m.position.set((x0 + x1) / 2, top - 0.275, (z0 + z1) / 2);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      addPlatform({ x0, x1, z0, z1, y0: top });
    };
    // second floor — opening on the west for stair 1
    slab(-5.4, IX, Z0, Z1, K.f2);
    slab(-IX, -5.4, Z0, 111, K.f2);
    slab(-IX, -5.4, 127, Z1, K.f2);
    // third floor — opening on the east for stair 2
    slab(-IX, 5.4, Z0, Z1, K.f3);
    slab(5.4, IX, Z0, 111, K.f3);
    slab(5.4, IX, 127, Z1, K.f3);

    // ---- stairs ----
    const buildStair = (x0: number, x1: number, zA: number, zB: number, yA: number, yB: number) => {
      const steps = 16;
      const g = new THREE.BoxGeometry((x1 - x0) * 0.98, 0.45, Math.abs(zB - zA) / steps);
      const im = new THREE.InstancedMesh(g, stone, steps);
      im.castShadow = im.receiveShadow = true;
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        m4.makeTranslation((x0 + x1) / 2, yA + (yB - yA) * t - 0.22, zA + (zB - zA) * t);
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
      this.scene.add(im);
      // collision ramp (z-ordered rect)
      const lo = Math.min(zA, zB);
      const hi = Math.max(zA, zB);
      addPlatform({ x0, x1, z0: lo, z1: hi, y0: zA < zB ? yA : yB, y1: zA < zB ? yB : yA, axis: "z" });
      // side stringer wall so you can't walk off sideways
      const yLo = zA < zB ? yA : yB;
      const yHi = zA < zB ? yB : yA;
      const sw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, hi - lo), darkStone);
      sw.position.set(x0 + (x1 - x0) / 2 + (x0 < 0 ? (x1 - x0) / 2 : -(x1 - x0) / 2), (yLo + yHi) / 2 + 0.4, (lo + hi) / 2);
      // rotate the long axis to lie along the ramp (a bare *0 here left it flat)
      sw.rotation.x = -Math.atan2(yHi - yLo, hi - lo);
      this.scene.add(sw);
    };
    buildStair(-9.8, -5.4, 111, 127, K.base, K.f2); // ground → 2nd, ascending +z
    buildStair(5.4, 9.8, 127, 111, K.f2, K.f3); // 2nd → 3rd, ascending -z

    // ---- great doors ----
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.4, 0.25), woodMat);
      door.position.set(side * 1.3, K.base + 2.2, Z0 - 0.1);
      door.rotation.y = side * 0.5;
      door.castShadow = true;
      this.scene.add(door);
    }

    // ---- glowing windows (cheap emissive quads, no lights) ----
    // Each district wakes at a different Relay tier instead of every window
    // sharing one always-on material.
    const winMats = [1, 2].map((minTier) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffc879, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.keepWindowTiers.push({ mat, minTier });
      return mat;
    });
    const winGeo = new THREE.PlaneGeometry(1.1, 2.2);
    for (const [floor, y] of [K.base + 3.4, K.f2 + 3.4].entries()) {
      const winMat = winMats[floor];
      for (const z of [113.5, 120, 126.5]) {
        for (const sx of [-1, 1]) {
          const w = new THREE.Mesh(winGeo, winMat);
          w.position.set(sx * (IX - 0.68), y, z);
          w.rotation.y = Math.PI / 2;
          this.scene.add(w);
        }
      }
      for (const x of [-6, 0, 6]) {
        const w = new THREE.Mesh(winGeo, winMat);
        w.position.set(x, y, Z1 - 0.68);
        this.scene.add(w);
      }
    }

    // ---- rose window + throne on the ground floor ----
    const rose = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.34, 8, 22), goldMat);
    rose.position.set(0, K.base + 4.6, Z1 - 0.75);
    this.scene.add(rose);
    const roseGlow = new THREE.Mesh(
      new THREE.CircleGeometry(2.15, 22),
      new THREE.MeshBasicMaterial({ color: 0xffc568, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    roseGlow.position.set(0, K.base + 4.6, Z1 - 0.8);
    this.keepWindowTiers.push({ mat: roseGlow.material as THREE.MeshBasicMaterial, minTier: 3 });
    (roseGlow.material as THREE.MeshBasicMaterial).opacity = 0.08;
    this.scene.add(roseGlow);

    const tZ = 127.4;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 2.4), darkStone);
    seat.position.set(0, K.base + 1.0, tZ);
    seat.castShadow = seat.receiveShadow = true;
    this.scene.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5.4, 0.7), darkStone);
    back.position.set(0, K.base + 3.4, tZ + 1.2);
    back.castShadow = true;
    this.scene.add(back);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 2.1), darkStone);
      arm.position.set(side * 1.65, K.base + 1.75, tZ);
      this.scene.add(arm);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.0, 5), goldMat);
      spike.position.set(side * 1.35, K.base + 7.0, tZ + 1.2);
      this.scene.add(spike);
    }
    this.colliders.push({ x: 0, z: tZ + 0.7, r: 2.0 });

    // (the carpet is laid by buildCastle, running gate → hall → throne)

    // ---- banners on each floor ----
    const bannerMat = new THREE.MeshStandardMaterial({ map: this.bannerTex(), roughness: 0.95, side: THREE.DoubleSide });
    this.injectWind(bannerMat, 0.1);
    const bannerGeo = new THREE.PlaneGeometry(1.9, 3.8, 3, 6);
    bannerGeo.translate(0, -1.9, 0);
    for (const y of [K.base + 6.6, K.f2 + 6.6]) {
      for (const sx of [-1, 1]) {
        for (const z of [114, 124]) {
          const b = new THREE.Mesh(bannerGeo, bannerMat);
          b.position.set(sx * (IX - 0.75), y, z);
          b.rotation.y = sx * Math.PI * 0.5;
          this.scene.add(b);
        }
      }
    }

    // ---- exactly two hearth lights for the whole keep (constant count) ----
    const hearthA = new THREE.PointLight(0xffb066, 26, 30, 1.7);
    hearthA.position.set(0, K.base + 4.5, 125);
    this.scene.add(hearthA);
    const hearthEntryA = { light: hearthA, base: 26, phase: 2.1, original: 26 };
    this.braziers.push(hearthEntryA);
    this.keepHearths.push(hearthEntryA);
    const hearthB = new THREE.PointLight(0xffb066, 22, 26, 1.7);
    hearthB.position.set(0, K.f2 + 4.5, 120);
    this.scene.add(hearthB);
    const hearthEntryB = { light: hearthB, base: 22, phase: 4.4, original: 22 };
    this.braziers.push(hearthEntryB);
    this.keepHearths.push(hearthEntryB);
  }

  private carpetTex() {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#511314";
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = "#c9a24a";
    g.fillRect(3, 0, 3, 256);
    g.fillRect(58, 0, 3, 256);
    g.fillStyle = "rgba(201,162,74,0.55)";
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(32, i * 32 + 16);
      g.rotate(Math.PI / 4);
      g.fillRect(-5, -5, 10, 10);
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 3);
    return t;
  }

  private bannerTex() {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 224;
    const g = c.getContext("2d")!;
    g.fillStyle = "#4e1010";
    g.fillRect(0, 0, 128, 224);
    g.strokeStyle = "#c9a24a";
    g.lineWidth = 7;
    g.strokeRect(8, 8, 112, 208);
    g.fillStyle = "#c9a24a";
    g.beginPath();
    g.moveTo(64, 46);
    g.quadraticCurveTo(94, 92, 74, 120);
    g.quadraticCurveTo(90, 138, 64, 168);
    g.quadraticCurveTo(38, 138, 54, 120);
    g.quadraticCurveTo(34, 92, 64, 46);
    g.fill();
    g.fillStyle = "#4e1010";
    g.beginPath();
    g.arc(64, 122, 12, 0, 7);
    g.fill();
    return new THREE.CanvasTexture(c);
  }

  private buildCastle() {
    this.buildKeepTower();

    const CX = WORLD.castle.x;
    const CZ = WORLD.castle.z;
    const CR = WORLD.castle.r;

    const stone = new THREE.MeshStandardMaterial({ color: 0x5c564c, roughness: 0.9, metalness: 0.04 });
    stone.normalMap = detailNormal(3, 3);
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x37322b, roughness: 0.88, metalness: 0.05 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x232c38, roughness: 0.7, metalness: 0.25, flatShading: true });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.34, metalness: 0.92, emissive: 0x6b4a10, emissiveIntensity: 0.35 });

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);

    // ------- curtain wall (one segment skipped for the south gate) -------
    const SEGS = 24;
    const wallGeo = new THREE.BoxGeometry(7.6, 6.4, 2.3);
    const merGeo = new THREE.BoxGeometry(1.1, 1.1, 2.5);
    const walls = new THREE.InstancedMesh(wallGeo, stone, SEGS);
    const merlons = new THREE.InstancedMesh(merGeo, darkStone, SEGS * 4);
    walls.castShadow = walls.receiveShadow = true;
    merlons.castShadow = true;
    let wi = 0;
    let mi = 0;
    const gateA = -Math.PI / 2; // south
    for (let i = 0; i < SEGS; i++) {
      const a = (i / SEGS) * Math.PI * 2;
      let d = ((a - gateA + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 0.15) continue; // the gate gap
      const x = CX + Math.cos(a) * CR;
      const z = CZ + Math.sin(a) * CR;
      const y = terrainHeight(x, z);
      e.set(0, -(a + Math.PI / 2), 0);
      q.setFromEuler(e);
      m.compose(v.set(x, y + 3.0, z), q, s);
      walls.setMatrixAt(wi++, m);
      // crenellations
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      for (let k = 0; k < 4; k++) {
        const off = (k - 1.5) * 1.95;
        m.compose(v.set(x + tx * off, y + 6.75, z + tz * off), q, s);
        merlons.setMatrixAt(mi++, m);
      }
      this.colliders.push({ x, z, r: 3.4 });
      this.colliders.push({ x: x + tx * 2.7, z: z + tz * 2.7, r: 2.4 });
      this.colliders.push({ x: x - tx * 2.7, z: z - tz * 2.7, r: 2.4 });
    }
    for (; wi < SEGS; wi++) { m.makeScale(0, 0, 0); walls.setMatrixAt(wi, m); }
    for (; mi < SEGS * 4; mi++) { m.makeScale(0, 0, 0); merlons.setMatrixAt(mi, m); }
    walls.instanceMatrix.needsUpdate = true;
    merlons.instanceMatrix.needsUpdate = true;
    this.scene.add(walls, merlons);

    // ------- towers -------
    const towerAngles = [Math.PI / 2, Math.PI / 2 - 0.8, Math.PI / 2 + 0.8, Math.PI / 2 - 1.6, Math.PI / 2 + 1.6, gateA - 0.26, gateA + 0.26];
    for (const a of towerAngles) {
      const gate = Math.abs(a - gateA) < 0.5;
      const x = CX + Math.cos(a) * CR;
      const z = CZ + Math.sin(a) * CR;
      const y = terrainHeight(x, z);
      const h = gate ? 11 : 13.5;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(gate ? 2.6 : 3.2, gate ? 3.0 : 3.7, h, 10), stone);
      body.position.set(x, y + h / 2 - 0.5, z);
      body.castShadow = body.receiveShadow = true;
      this.scene.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(gate ? 3.3 : 4.0, gate ? 4.2 : 5.4, 10), roofMat);
      roof.position.set(x, y + h + (gate ? 1.6 : 2.2) - 0.5, z);
      roof.castShadow = true;
      this.scene.add(roof);
      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), goldMat);
      finial.position.set(x, y + h + (gate ? 4 : 5.2) - 0.5, z);
      this.scene.add(finial);
      this.colliders.push({ x, z, r: gate ? 3.2 : 3.9 });
    }

    // ------- gate arch + torches -------
    const gx = CX;
    const gz = CZ - CR;
    const gy = terrainHeight(gx, gz);
    const arch = new THREE.Mesh(new THREE.BoxGeometry(9.6, 2.6, 3.2), stone);
    arch.position.set(gx, gy + 7.4, gz);
    arch.castShadow = true;
    this.scene.add(arch);
    const archTop = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.6, 6, 16, Math.PI), darkStone);
    archTop.position.set(gx, gy + 6.1, gz);
    this.scene.add(archTop);

    const mkTorch = (x: number, z: number, big = false) => {
      const y = terrainHeight(x, z);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, big ? 3.2 : 2.6, 6), darkStone);
      stand.position.set(x, y + (big ? 1.6 : 1.3), z);
      stand.castShadow = true;
      this.scene.add(stand);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.22, 0.5, 8), darkStone);
      bowl.position.set(x, y + (big ? 3.3 : 2.7), z);
      this.scene.add(bowl);
      const flame = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.55, 1),
        new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      flame.position.set(x, y + (big ? 3.8 : 3.2), z);
      this.scene.add(flame);
      // no bare bulb — the additive flame carries the gate
    };
    mkTorch(gx - 3.6, gz + 1.6);
    mkTorch(gx + 3.6, gz + 1.6);

    // (the throne hall, rose window and throne now live inside the
    //  multi-floor keep — see buildKeepTower)
    void darkStone;
    void goldMat;

    // ------- gate banners -------
    const bannerMat = new THREE.MeshStandardMaterial({ map: this.bannerTex(), roughness: 0.95, side: THREE.DoubleSide });
    this.injectWind(bannerMat, 0.16);
    const bannerGeo = new THREE.PlaneGeometry(2.1, 4.4, 3, 6);
    bannerGeo.translate(0, -2.2, 0);
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(bannerGeo, bannerMat);
      b.position.set(gx + sx * 4.9, gy + 9.6, gz + 0.4);
      b.rotation.y = Math.PI;
      b.castShadow = true;
      this.scene.add(b);
    }

    // ------- royal carpet from gate to throne -------
    // Ribbon conformed to terrainHeight so it never hovers over the sloped
    // approach or clips into the plateau (a flat plane did both).
    const carpetMat = new THREE.MeshStandardMaterial({ map: this.carpetTex(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 });
    const carpetSegs = 28, carpetHalf = 1.7, cz0 = 87, cz1 = 127;
    const cPos = new Float32Array((carpetSegs + 1) * 2 * 3);
    const cUv = new Float32Array((carpetSegs + 1) * 2 * 2);
    for (let i = 0; i <= carpetSegs; i++) {
      const z = cz0 + (i / carpetSegs) * (cz1 - cz0);
      for (let k = 0; k < 2; k++) {
        const sx = k === 0 ? -carpetHalf : carpetHalf;
        const o6 = i * 6 + k * 3, o4 = i * 4 + k * 2;
        cPos[o6] = CX + sx;
        cPos[o6 + 1] = terrainHeight(CX + sx, z) + 0.09;
        cPos[o6 + 2] = z;
        cUv[o4] = k;
        cUv[o4 + 1] = i / carpetSegs;
      }
    }
    const cIdx: number[] = [];
    for (let i = 0; i < carpetSegs; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      cIdx.push(a, c, b, b, c, d);
    }
    const carpetGeo = new THREE.BufferGeometry();
    carpetGeo.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
    carpetGeo.setAttribute("uv", new THREE.BufferAttribute(cUv, 2));
    carpetGeo.setIndex(cIdx);
    carpetGeo.computeVertexNormals();
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    carpet.receiveShadow = true;
    this.scene.add(carpet);

    // ---- permanent drawbridge over the moat (carved at z≈90) ----
    // The moat is terrain; the bridge is always here — prologue escort and
    // post-story approach alike. An invisible walkable ramp registers too.
    const bridgeDeck = (z: number) => 6.4 + ((9.8 - 6.4) * (z - 84.7)) / (95.1 - 84.7);
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x35281a, roughness: 0.95 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.5, metalness: 0.8 });
    const moatMat = new THREE.MeshStandardMaterial({ color: 0x101c22, roughness: 0.16, metalness: 0.4, transparent: true, opacity: 0.92 });
    const moat = new THREE.Mesh(new THREE.PlaneGeometry(34, 8), moatMat);
    moat.rotation.x = -Math.PI / 2;
    moat.position.set(0, terrainHeight(0, 90) + 0.03, 90);
    moat.receiveShadow = true;
    this.scene.add(moat);
    for (let i = 0; i < 9; i++) {
      const z = 84.7 + i * 1.3;
      const deckY = bridgeDeck(z);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.42, 1.26), plankMat);
      plank.position.set(0, deckY - 0.2, z);
      plank.castShadow = plank.receiveShadow = true;
      this.scene.add(plank);
      const line = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 1 }));
      line.position.set(0, deckY + 0.03, z);
      this.scene.add(line);
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.35, 6), railMat);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(sx * 2.55, deckY + 0.65, z);
        this.scene.add(rail);
        this.colliders.push({ x: sx * 2.55, z, r: 0.24 });
      }
    }
    addPlatform({ x0: -2.6, x1: 2.6, z0: 84.7, z1: 95.1, y0: 6.4, y1: 9.8, axis: "z" });
  }

  // =========================================================================
  // THE TWENTY-THREE SETTLEMENTS — each built to its region's character.
  // =========================================================================
  private buildSettlements() {
    const sheetMetal = new THREE.MeshStandardMaterial({ color: 0x4a4740, roughness: 0.86, metalness: 0.3, flatShading: true });
    const bunker = new THREE.MeshStandardMaterial({ color: 0x3b362e, roughness: 0.95 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.97 });
    const canvasMat = new THREE.MeshStandardMaterial({ color: 0x6d6046, roughness: 0.95 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x5f584d, roughness: 0.94, metalness: 0.03 });
    const industrial = new THREE.MeshStandardMaterial({ color: 0x3a332c, roughness: 0.85, metalness: 0.45, flatShading: true });
    const gold = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });
    const violet = new THREE.MeshBasicMaterial({ color: 0x7d4ad8, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false });

    const rng = makeRng(7788);
    for (const s of SETTLEMENTS) {
      const g = new THREE.Group();
      g.name = s.name;
      const gy = terrainHeight(s.x, s.z);
      // Stilt villages stand on decks above the waterline, not in it.
      const lift = s.style === "stilt" ? 3.2 : 0;
      const put = (m: THREE.Object3D, x: number, z: number, yOff = 0) => {
        m.position.set(x, terrainHeight(x, z) + yOff + lift, z);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
        return m;
      };
      const block = (w: number, h: number, d: number, mat: THREE.Material, x: number, z: number, ry = 0, yOff = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        put(m, x, z, yOff + h / 2);
        m.rotation.y = ry;
        this.colliders.push({ x, z, r: Math.max(w, d) * 0.48 });
        return m;
      };
      const cone = (r: number, h: number, mat: THREE.Material, x: number, z: number, yOff = 0) => {
        const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat);
        put(m, x, z, yOff + h / 2);
        return m;
      };
      const cyl = (r: number, h: number, mat: THREE.Material, x: number, z: number, yOff = 0) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), mat);
        put(m, x, z, yOff + h / 2);
        return m;
      };

      // the forge altar every settlement is built around
      const anvil = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 2.2), stone);
      put(anvil, s.x, s.z, 0.85);
      const sigil = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.85, 44), gold);
      sigil.rotation.x = -Math.PI / 2;
      sigil.position.set(s.x, gy + 0.1 + lift, s.z);
      g.add(sigil);
      // a dome of forge-glow pooled over the anvil — no bare bulb, it reads the same
      const forgeGlow = new THREE.Mesh(
        new THREE.SphereGeometry(4.6, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
      );
      forgeGlow.position.set(s.x, gy + 3.4 + lift, s.z);
      g.add(forgeGlow);

      // a banner pole so the settlement reads from the horizon
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 12, 6), timber);
      put(pole, s.x + 6.5, s.z + 4.5, 6.0);
      const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), gold);
      put(flame, s.x + 6.5, s.z + 4.5, 12.2);
      this.colliders.push({ x: s.x + 6.5, z: s.z + 4.5, r: 0.4 });

      // the settlement's own buildings, in its regional idiom
      const ring = 11.2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + (s.x % 7) * 0.4;
        const bx = s.x + Math.cos(a) * (ring + (i % 2) * 5.0);
        const bz = s.z + Math.sin(a) * (ring + (i % 2) * 5.0);
        const ry = a + 1.2;
        switch (s.style) {
          case "outpost": {
            block(5.4 + (i % 2) * 1.6, 3.4, 4.3, sheetMetal, bx, bz, ry);
            block(1.6, 4.0, 4.9, bunker, bx + Math.cos(a + 1.6) * 4.0, bz + Math.sin(a + 1.6) * 4.0, ry + 0.4);
            break;
          }
          case "stilt": {
            // a deck on posts, over the water
            for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) {
              cyl(0.24, 12.5, timber, bx + ox, bz + oz, -6.2);
            }
            block(5.6, 0.5, 5.6, timber, bx, bz, ry, 0.4);
            block(3.8, 2.9, 3.8, timber, bx, bz, ry, 2.0);
            cone(2.9, 2.3, canvasMat, bx, bz, 4.6);
            break;
          }
          case "tents": {
            cone(3.2, 4.0, canvasMat, bx, bz, 2.05);
            block(6.8, 0.8, 2.4, timber, bx + 4.0, bz, ry, 0.85); // a wagon on runners
            break;
          }
          case "ruin": {
            block(1.9, 3.7 + (i % 3) * 1.5, 8.1, stone, bx, bz, ry);
            cyl(0.85, 5.3 + (i % 2) * 2.2, stone, bx + Math.cos(a + 1.4) * 5.0, bz + Math.sin(a + 1.4) * 5.0);
            break;
          }
          case "camp": {
            block(4.7, 3.1, 4.0, timber, bx, bz, ry);
            block(0.45, 1.9, 11.6, timber, bx + Math.cos(a + 1.5) * 4.6, bz + Math.sin(a + 1.5) * 4.6, ry + 0.3); // walkway rail
            break;
          }
          case "tower": {
            // a raised platform on four legs
            for (const [ox, oz] of [[-2.0, -2.0], [2.0, -2.0], [-2.0, 2.0], [2.0, 2.0]] as const) {
              cyl(0.28, 7.6, timber, bx + ox, bz + oz, 0);
            }
            block(6.6, 0.6, 6.6, timber, bx, bz, ry, 7.4);
            block(4.1, 3.0, 4.1, timber, bx, bz, ry, 8.8);
            cone(3.2, 2.0, canvasMat, bx, bz, 11.6);
            break;
          }
          case "forge": {
            block(7.1, 5.3, 6.2, industrial, bx, bz, ry);
            cyl(0.85, 11, industrial, bx + Math.cos(a + 1.4) * 3.8, bz + Math.sin(a + 1.4) * 3.8);
            const mouth = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.8), gold);
            mouth.position.set(bx + Math.sin(ry) * 3.14, terrainHeight(bx, bz) + 1.9, bz + Math.cos(ry) * 3.14);
            mouth.rotation.y = ry;
            g.add(mouth);
            break;
          }
        }
      }

      // a resident or two, going about their business
      for (let v = 0; v < 2; v++) {
        const va = (v / 2) * Math.PI * 2 + 1.1;
        const vx = s.x + Math.cos(va) * 4.4;
        const vz = s.z + Math.sin(va) * 4.4;
        const rig = buildRig({
          scale: 0.96 + rng() * 0.12,
          bulk: 0.95 + rng() * 0.18,
          armor: [0x4c5058, 0x51412c, 0x3d4a44, 0x50402e][(v + s.id.length) % 4],
          armorDark: 0x22242a,
          cloth: [0x5c3226, 0x2f4356, 0x3d4a30, 0x55483a][(v + s.id.length) % 4],
          accent: [0xffb060, 0x9fd8ff, 0xbfe4ff, 0xffd98a][(v + s.id.length) % 4],
          accentIntensity: 1.4,
          weapon: v === 0 ? "none" : "greatsword",
          tattered: rng() > 0.5,
        });
        poseRig(rig, { dt: 0.016, time: 0, speed: 0, state: "idle", phase: 0.4, combo: 0 });
        rig.root.traverse((o) => { o.castShadow = false; });
        rig.root.position.set(vx, terrainHeight(vx, vz), vz);
        rig.root.rotation.y = va + Math.PI;
        g.add(rig.root);
        this.colliders.push({ x: vx, z: vz, r: 0.5 });
      }

      this.scene.add(g);
    }

    // ---- the Violet Mere — bioluminescent water under Violet Pier ----
    const mere = new THREE.Mesh(
      new THREE.CircleGeometry(VIOLET_MERE.r * 0.95, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1d1436, roughness: 0.06, metalness: 0.55,
        emissive: 0x4a2a86, emissiveIntensity: 0.42,
        transparent: true, opacity: 0.88,
      }),
    );
    mere.rotation.x = -Math.PI / 2;
    mere.position.set(VIOLET_MERE.x, VIOLET_MERE.level, VIOLET_MERE.z);
    this.scene.add(mere);
    // a ring of luminous spores over the water
    const sporeGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const spores = new THREE.InstancedMesh(sporeGeo, violet, 90);
    const mm = new THREE.Matrix4();
    const mv = new THREE.Vector3();
    const mq = new THREE.Quaternion();
    const ms = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * VIOLET_MERE.r * 0.9;
      mv.set(VIOLET_MERE.x + Math.cos(a) * rad, VIOLET_MERE.level + 0.4 + rng() * 3.4, VIOLET_MERE.z + Math.sin(a) * rad);
      mq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      mm.compose(mv, mq, ms);
      spores.setMatrixAt(i, mm);
    }
    spores.instanceMatrix.needsUpdate = true;
    this.scene.add(spores);
    // the Mere keeps its own bruised violet light — carried by the spores it grew

  }

  private buildRuins() {
    const rng = makeRng(777);
    const root = new THREE.Group();
    root.name = "world-ruins";
    const stone = new THREE.MeshStandardMaterial({ color: 0x565046, roughness: 0.95, metalness: 0.03 });
    stone.normalMap = detailNormal(2, 2);

    const colGeo = new THREE.CylinderGeometry(1.1, 1.3, 1, 8, 1);
    const blockGeo = new THREE.BoxGeometry(1, 1, 1);
    const cols = new THREE.InstancedMesh(colGeo, stone, 260);
    const blocks = new THREE.InstancedMesh(blockGeo, stone, 480);
    cols.castShadow = cols.receiveShadow = true;
    blocks.castShadow = blocks.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();

    let ci = 0;
    let bi = 0;
    let ruinGuard = 0;
    while (ci < 260 && ruinGuard++ < 8000) {
      const a = rng() * Math.PI * 2;
      const rad = WORLD.arenaRadius + 16 + rng() * 300;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (slopeAt(x, z) > 0.42) continue;
      if (Math.hypot(x - WORLD.castle.x, z - WORLD.castle.z) < 38) continue;
      const h = 4 + rng() * 16;
      v.set(x, terrainHeight(x, z) + h / 2 - 0.5, z);
      e.set((rng() - 0.5) * 0.14, rng() * 6, (rng() - 0.5) * 0.14);
      q.setFromEuler(e);
      s.set(1, h, 1);
      m.compose(v, q, s);
      cols.setMatrixAt(ci++, m);

      // rubble around it
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n && bi < 480; k++) {
        const rx = x + (rng() - 0.5) * 12;
        const rz = z + (rng() - 0.5) * 12;
        const sz = 1 + rng() * 3.4;
        v.set(rx, terrainHeight(rx, rz) + sz * 0.28, rz);
        e.set(rng() * 3, rng() * 6, rng() * 3);
        q.setFromEuler(e);
        s.set(sz, sz * (0.4 + rng() * 0.6), sz * (0.7 + rng() * 0.7));
        m.compose(v, q, s);
        blocks.setMatrixAt(bi++, m);
      }
    }
    for (; bi < 480; bi++) {
      m.makeScale(0, 0, 0);
      blocks.setMatrixAt(bi, m);
    }
    cols.instanceMatrix.needsUpdate = true;
    blocks.instanceMatrix.needsUpdate = true;
    root.add(cols, blocks);

    // giant standing arches
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      const rad = 95 + rng() * 260;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (Math.hypot(x - WORLD.castle.x, z - WORLD.castle.z) < 42) continue;
      const g = new THREE.Group();
      const y = terrainHeight(x, z);
      const H = 22 + rng() * 16;
      const W = 14 + rng() * 8;
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(3, H, 3), stone);
        leg.position.set((side * W) / 2, H / 2, 0);
        leg.castShadow = true;
        g.add(leg);
      }
      const top = new THREE.Mesh(new THREE.TorusGeometry(W / 2, 1.6, 6, 18, Math.PI), stone);
      top.position.y = H;
      top.castShadow = true;
      g.add(top);
      g.position.set(x, y, z);
      g.rotation.y = rng() * 6;
      root.add(g);
      const collider = { x, z, r: 3 };
      this.colliders.push(collider);
      this.ruinColliders.push(collider);
    }
    this.scene.add(root);
    this.ruinsRoot = root;
  }

  // ------------------------------- flora -----------------------------------
  private buildFlora() {
    const rng = makeRng(31337);
    const root = new THREE.Group();
    root.name = "world-flora";

    // --- dead trees ---
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 0.95, flatShading: true });
    const trunkGeo = new THREE.CylinderGeometry(0.28, 1.1, 12, 6, 3);
    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, 320);
    const branchGeo = new THREE.CylinderGeometry(0.1, 0.35, 5, 4);
    const branches = new THREE.InstancedMesh(branchGeo, barkMat, 1280);
    trunks.castShadow = branches.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    let ti = 0;
    let bi = 0;
    let guard = 0;
    while (ti < 320 && guard++ < 12000) {
      const a = rng() * Math.PI * 2;
      const rad = WORLD.arenaRadius + 22 + rng() * 320;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (slopeAt(x, z) > 0.45) continue;
      if (Math.hypot(x - WORLD.castle.x, z - WORLD.castle.z) < 36) continue;
      const y = terrainHeight(x, z);
      const sc = 0.7 + rng() * 1.1;
      v.set(x, y + 6 * sc, z);
      e.set((rng() - 0.5) * 0.2, rng() * 6, (rng() - 0.5) * 0.2);
      q.setFromEuler(e);
      s.set(sc, sc, sc);
      m.compose(v, q, s);
      trunks.setMatrixAt(ti++, m);
      const nb = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < nb && bi < 1280; k++) {
        const ba = rng() * Math.PI * 2;
        const bh = y + (7 + rng() * 4) * sc;
        v.set(x + Math.cos(ba) * 1.6 * sc, bh, z + Math.sin(ba) * 1.6 * sc);
        e.set(Math.sin(ba) * 1.0, ba, -Math.cos(ba) * 1.0);
        q.setFromEuler(e);
        s.set(sc, sc * (0.7 + rng() * 0.7), sc);
        m.compose(v, q, s);
        branches.setMatrixAt(bi++, m);
      }
    }
    for (; ti < 320; ti++) { m.makeScale(0, 0, 0); trunks.setMatrixAt(ti, m); }
    for (; bi < 1280; bi++) { m.makeScale(0, 0, 0); branches.setMatrixAt(bi, m); }
    trunks.instanceMatrix.needsUpdate = true;
    branches.instanceMatrix.needsUpdate = true;
    root.add(trunks, branches);

    // --- wind-blown grass ---
    const bladeGeo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      -0.055, 0, 0, 0.055, 0, 0, -0.035, 0.55, 0.02, 0.035, 0.55, 0.02, 0, 1.0, 0.06,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 0, 0.55, 1, 0.55, 0.5, 1]);
    bladeGeo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    bladeGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    bladeGeo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    bladeGeo.computeVertexNormals();

    // Lambert instead of Standard: no PBR/IBL maths across ~11k blades.
    const grassMat = new THREE.MeshLambertMaterial({
      color: 0x6a5530, // dry ashen straw — the original 0xbb9a48 whiteed the field out under a 3.1-intensity sun
      side: THREE.DoubleSide,
      // No vertexColors: the blade geometry carries no color attribute, and
      // Lambert would multiply instanceColor by opaque black.
    });
    this.injectWind(grassMat, 0.62);

    // Grass cap stays modest — density falls off with radius via sqrt distribution.
    // Feels populated near the player and thins naturally at the horizon.
    const COUNT = 16000;
    const grass = new THREE.InstancedMesh(bladeGeo, grassMat, COUNT);
    grass.receiveShadow = false;
    const col = new THREE.Color();
    let gi = 0;
    guard = 0;
    while (gi < COUNT && guard++ < COUNT * 6) {
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * 340;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const r = Math.hypot(x, z);
      if (r < WORLD.arenaRadius + 6) continue;
      if (Math.hypot(x - WORLD.castle.x, z - WORLD.castle.z) < 30) continue;
      if (slopeAt(x, z) > 0.4) continue;
      const y = terrainHeight(x, z);
      const sc = 0.8 + rng() * 1.5;
      v.set(x, y, z);
      e.set(0, rng() * 6.28, (rng() - 0.5) * 0.22);
      q.setFromEuler(e);
      s.set(sc * (0.8 + rng() * 0.5), sc * (0.9 + rng() * 1.0), sc);
      m.compose(v, q, s);
      grass.setMatrixAt(gi, m);
      const tint = rng();
      col.setRGB(0.52 + tint * 0.38, 0.40 + tint * 0.26, 0.14 + tint * 0.12);
      grass.setColorAt(gi, col);
      gi++;
    }
    grass.count = gi;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    root.add(grass);

    // --- glowing erdleaf flowers ---
    const flowerMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.injectWind(flowerMat, 0.4);
    const fGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const flowers = new THREE.InstancedMesh(fGeo, flowerMat, 900);
    let fi = 0;
    guard = 0;
    while (fi < 900 && guard++ < 9000) {
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * 340;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (Math.hypot(x, z) < WORLD.arenaRadius + 8 || slopeAt(x, z) > 0.35) continue;
      v.set(x, terrainHeight(x, z) + 0.5 + rng() * 0.7, z);
      e.set(0, rng() * 6.28, 0);
      q.setFromEuler(e);
      const sc = 0.6 + rng() * 0.9;
      s.set(sc, sc, sc);
      m.compose(v, q, s);
      flowers.setMatrixAt(fi++, m);
    }
    flowers.count = fi;
    flowers.instanceMatrix.needsUpdate = true;
    root.add(flowers);
    this.scene.add(root);
    this.floraRoot = root;
  }

  /** Adds time-driven wind sway to any material used by instanced foliage. */
  private injectWind(mat: THREE.Material, amount: number) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWindMul = { value: 1 };
      this.shaderUniforms.push(shader.uniforms.uTime as { value: number });
      this.windUniforms.push(shader.uniforms.uWindMul as { value: number });
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uTime;
           uniform float uWindMul;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             vec3 iwp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
           #else
             vec3 iwp = vec3(0.0);
           #endif
           float bh = clamp(position.y, 0.0, 1.4);
           float ph = iwp.x * 0.31 + iwp.z * 0.27;
           float w = (sin(uTime * 1.35 + ph) * 0.62 + sin(uTime * 2.9 + ph * 1.7) * 0.28 + sin(uTime * 0.45 + ph * 0.3) * 0.5) * uWindMul;
           transformed.x += w * bh * bh * ${amount.toFixed(3)};
           transformed.z += w * bh * bh * ${(amount * 0.6).toFixed(3)};`,
        );
    };
    mat.needsUpdate = true;
    this.windMats.push(mat);
  }

  // ------------------------------- grace -----------------------------------
  /** Builds one Grace / Wayshrine. The first call becomes the "home" site. */
  buildGraceAt(x: number, z: number, name: string) {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const shard = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.95 }),
    );
    shard.position.y = 1.1;
    shard.name = "graceShard";
    g.add(shard);

    for (let i = 0; i < 3; i++) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.3 + i * 1.05, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffc978, transparent: true, opacity: 0.2 - i * 0.055, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.position.y = 1.1;
      g.add(halo);
    }
    this.scene.add(g);

    const site = { pos: new THREE.Vector3(x, y, z), shard, name };
    this.graceSites.push(site);
    if (this.graceSites.length === 1) {
      this.graceShard = shard;
    }
    return site;
  }

  private buildGrace() {
    // Home grace + a network of wayshrines that span the expanded world.
    // Ordered roughly by story progression.
    this.buildGraceAt(WORLD.graceAt.x, WORLD.graceAt.z, "Kingsfall Grace");         // 0 — spawn
    this.buildGraceAt(6, 30, "Roadside Grace");                                     // 1 — the cathedral road
    this.buildGraceAt(4, -40, "Cathedral Approach");                                // 2 — Malenkar arena
    // --- the eight guardians -----------------------------------
    this.buildGraceAt(-160, 80, "Hearthmere Wayshrine");                            // 3 — west village
    this.buildGraceAt(-260, 60, "Cinderwood Grace");                                // 4 — the Cinderwood
    this.buildGraceAt(-300, 30, "Ashen Colonnade");                                 // 5 — deep Cinderwood
    this.buildGraceAt(160, 30, "Vowglass Wayshrine");                               // 6 — east village
    this.buildGraceAt(250, -80, "Frostmourn Grace");                                // 7 — Frostmourn biome
    this.buildGraceAt(158, -196, "Iron Dunes Wayshrine");                           // 8 — the Iron Dunes
    this.buildGraceAt(-104, -140, "Briarwatch Wayshrine");                          // 9 — south village
    this.buildGraceAt(-80, -290, "Mirefen Grace");                                  // 10 — the Mirefen
    this.buildGraceAt(-64, -162, "Glass Crags Wayshrine");                          // 11 — the Glass Crags
    this.buildGraceAt(0, 300, "Beyond the Keep");                                   // 12 — hidden northern grove
    // --- the guardians' approach wayshrines ------------------------
    this.buildGraceAt(-160, 8, "The Bastion Wayshrine");                            // 13 — the Sunken Bastion
    this.buildGraceAt(152, -50, "The Forge Wayshrine");                             // 14 — the Forgotten Foundry
    this.buildGraceAt(166, 99, "The Spire Wayshrine");                              // 15 — the Whispering Spire
  }

  // ------------------------------- shrines ----------------------------------
  /** Builds one Shrine of Light — a thin obelisk of pale stone and old light. */
  private buildShrines() {
    for (const s of SHRINES) this.buildShrineAt(s.x, s.z, s.id, s.name, s.kind);
  }

  buildShrineAt(x: number, z: number, id: string, name: string, kind: string) {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const stone = new THREE.MeshStandardMaterial({ color: 0x6b6558, roughness: 0.85, metalness: 0.08, emissive: 0x1a2b33, emissiveIntensity: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.65, 0.85, 8), stone);
    base.position.y = 0.42;
    g.add(base);
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.28, 8), stone);
    dais.position.y = 0.98;
    g.add(dais);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 6), stone);
    spire.position.y = 2.4;
    g.add(spire);

    const flame = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.MeshBasicMaterial({ color: 0xa8ecff, transparent: true, opacity: 0.95 }),
    );
    flame.position.y = 1.42;
    flame.name = "shrineFlame";
    g.add(flame);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    halo.position.y = 1.42;
    g.add(halo);

    this.scene.add(g);
    const site = { pos: new THREE.Vector3(x, y, z), flame, halo, name, id, kind };
    this.shrineSites.push(site);
    return site;
  }

  /** Dims a claimed shrine's flame — the rite is spent; the stone remembers. */
  dimShrine(id: string) {
    const s = this.shrineSites.find((site) => site.id === id);
    if (!s) return;
    const mat = s.flame.material as THREE.MeshBasicMaterial;
    mat.color.set(0x2e4a55);
    mat.opacity = 0.35;
    const haloMat = s.halo.material as THREE.MeshBasicMaterial;
    haloMat.color.set(0x263943);
    haloMat.opacity = 0.045;
  }

  // --------------------------- biome prop clusters ---------------------------
  private buildBiomeProps() {
    const rng = makeRng(5511);

    // ---- Cinderwood: burning dead trees with orange canopies ----
    {
      const bark = new THREE.MeshStandardMaterial({ color: 0x1c1210, roughness: 0.9, flatShading: true });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0xd8632a, emissive: 0xff5a1a, emissiveIntensity: 1.6, roughness: 0.7, flatShading: true });
      const b = BIOMES.cinder;
      for (let i = 0; i < 26; i++) {
        const a = rng() * Math.PI * 2;
        const rad = Math.sqrt(rng()) * b.r * 0.9;
        const x = b.x + Math.cos(a) * rad;
        const z = b.z + Math.sin(a) * rad;
        if (slopeAt(x, z) > 0.45) continue;
        const y = terrainHeight(x, z);
        const sc = 0.9 + rng() * 1.3;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * sc, 0.55 * sc, 6 * sc, 6), bark);
        trunk.position.set(x, y + 3 * sc, z);
        trunk.rotation.y = rng() * 6;
        trunk.castShadow = true;
        this.scene.add(trunk);
        const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 * sc, 0), leafMat);
        canopy.position.set(x, y + 6.2 * sc, z);
        canopy.scale.set(1, 0.7, 1);
        this.scene.add(canopy);
        // no bare bulb — the emissive canopy is the fire it carries
        this.colliders.push({ x, z, r: 0.5 * sc });
      }
    }

    // ---- Frostmourn: ice crystal spires + frozen colonnade fragments ----
    {
      const iceMat = new THREE.MeshPhysicalMaterial({ color: 0xbfe0f0, transparent: true, opacity: 0.75, roughness: 0.08, metalness: 0.0, transmission: 0.4, thickness: 1.2 });
      const stone = new THREE.MeshStandardMaterial({ color: 0x8fa0ac, roughness: 0.6, metalness: 0.05 });
      const b = BIOMES.frost;
      for (let i = 0; i < 20; i++) {
        const a = rng() * Math.PI * 2;
        const rad = Math.sqrt(rng()) * b.r * 0.9;
        const x = b.x + Math.cos(a) * rad;
        const z = b.z + Math.sin(a) * rad;
        if (slopeAt(x, z) > 0.45) continue;
        const y = terrainHeight(x, z);
        const h = 3 + rng() * 7;
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rng() * 0.6, h, 6), iceMat);
        spire.position.set(x, y + h / 2, z);
        spire.rotation.y = rng() * 6;
        spire.castShadow = true;
        this.scene.add(spire);
        this.colliders.push({ x, z, r: 0.7 });
      }
      for (let i = 0; i < 8; i++) {
        const a = rng() * Math.PI * 2;
        const rad = b.r * (0.3 + rng() * 0.5);
        const x = b.x + Math.cos(a) * rad;
        const z = b.z + Math.sin(a) * rad;
        const y = terrainHeight(x, z);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 8 + rng() * 4, 8), stone);
        col.position.set(x, y + 4, z);
        col.rotation.z = (rng() - 0.5) * 0.5;
        col.castShadow = col.receiveShadow = true;
        this.scene.add(col);
        this.colliders.push({ x, z, r: 1.2 });
      }
    }

    // ---- Mirefen: still dark water + dead reeds ----
    {
      const b = BIOMES.mire;
      const waterY = terrainHeight(b.x, b.z) - 0.4;
      const waterMat = new THREE.MeshStandardMaterial({ color: 0x1c2a1a, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88 });
      const water = new THREE.Mesh(new THREE.CircleGeometry(b.r * 0.75, 40), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(b.x, waterY, b.z);
      water.receiveShadow = true;
      this.scene.add(water);

      const reedMat = new THREE.MeshStandardMaterial({ color: 0x39432a, roughness: 0.95, flatShading: true });
      for (let i = 0; i < 40; i++) {
        const a = rng() * Math.PI * 2;
        const rad = b.r * 0.75 * (0.6 + rng() * 0.5);
        const x = b.x + Math.cos(a) * rad;
        const z = b.z + Math.sin(a) * rad;
        const y = terrainHeight(x, z);
        const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.4 + rng() * 1.2, 4), reedMat);
        reed.position.set(x, y + 0.7, z);
        reed.rotation.z = (rng() - 0.5) * 0.3;
        this.scene.add(reed);
      }
      // no bare bulb — the mire is lit by its own glow
    }
  }

  // =========================================================================
  // THE EIGHT GUARDIAN DUNGEONS — grand architecture, one per lair.
  // =========================================================================
  private buildAshveilGuardians() {
    const rust = new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 0.92, metalness: 0.35, flatShading: true });
    const rustLight = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.9, metalness: 0.3, flatShading: true });
    const obsidian = new THREE.MeshStandardMaterial({ color: 0x0e0d12, roughness: 0.32, metalness: 0.66, flatShading: true });
    const paleStone = new THREE.MeshStandardMaterial({ color: 0x77705f, roughness: 0.95 });
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x37322b, roughness: 0.94 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x54432a, metalness: 0.82, roughness: 0.48, flatShading: true });
    const industrial = new THREE.MeshStandardMaterial({ color: 0x3a332c, roughness: 0.85, metalness: 0.45, flatShading: true });
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xff7a22 });
    const emberMatBright = new THREE.MeshBasicMaterial({ color: 0xffc060 });

    // ---- shared architecture helpers ----
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0, collide = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      if (collide) this.colliders.push({ x, z, r: Math.max(w, d) * 0.55 });
      return m;
    };
    const pillar = (x: number, z: number, r: number, h: number, mat: THREE.Material, ry = 0) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.18, h, 8), mat);
      m.position.set(x, terrainHeight(x, z) + h / 2, z);
      m.rotation.y = ry;
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      this.colliders.push({ x, z, r: r * 1.2 });
      return m;
    };
    const slab = (w: number, d: number, mat: THREE.Material, x: number, z: number, ry = 0) => {
      const y = terrainHeight(x, z) + 0.14;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    const brazier = (x: number, z: number, _intensity = 6, _color = 0xffa040) => {
      const y = terrainHeight(x, z);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.38, 0.75, 8), bronze);
      bowl.position.set(x, y + 0.38, z);
      bowl.castShadow = true;
      this.scene.add(bowl);
      const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), emberMatBright);
      flame.position.set(x, y + 0.95, z);
      this.scene.add(flame);
      this.colliders.push({ x, z, r: 0.62 }); // solid: no walking (or camera) through the fire
    };
    const archRing = (x: number, z: number, radius: number, tube: number, mat: THREE.Material, ry: number, tilt = 0) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 26), mat);
      t.position.set(x, terrainHeight(x, z) + radius, z);
      t.rotation.y = ry;
      t.rotation.x = tilt;
      t.castShadow = true;
      this.scene.add(t);
      return t;
    };

    // ===================================================================
    // 1. THE IRON DUNES — The Tank Cemetery (The Rusted Colossus)
    // A pre-war graveyard of colossal machines half-swallowed by the dunes.
    // ===================================================================
    {
      const gx = 170, gz = -215;
      const gy = terrainHeight(gx, gz);
      // The colossal hull at the heart of the dunes
      const hull = new THREE.Mesh(new THREE.BoxGeometry(21, 6.5, 11.5), rust);
      hull.position.set(gx, gy + 2.1, gz);
      hull.rotation.set(0.1, 0.38, -0.13);
      hull.castShadow = hull.receiveShadow = true;
      this.scene.add(hull);
      this.colliders.push({ x: gx, z: gz, r: 9.5 });
      // a broken cannon barrel thrust upward from the hull
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 16, 8), rustLight);
      barrel.position.set(gx + 2.5, gy + 5.5, gz - 1.5);
      barrel.rotation.set(0.5, 0.4, 1.15);
      barrel.castShadow = true;
      this.scene.add(barrel);
      // glowing hatch — the guardian's maw
      const maw = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), emberMat);
      maw.position.set(gx - 4.2, gy + 3.2, gz + 5.78);
      maw.rotation.y = 0.38;
      this.scene.add(maw);
      // the maw carries its own orange emissive — no bare bulb needed
      // the graveyard — rows of smaller half-buried hulls
      const hulls: [number, number, number, number][] = [
        [gx - 15, gz + 2, 8, 0.3], [gx + 13, gz - 9, 10, -0.4], [gx + 6, gz + 12, 7, 0.8],
        [gx - 8, gz - 13, 9, 0.2], [gx - 18, gz - 8, 6, -0.7], [gx + 17, gz + 6, 7.5, 1.1],
      ];
      for (const [hx, hz, s, ry] of hulls) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.55, s * 0.7), rust);
        m.position.set(hx, terrainHeight(hx, hz) + s * 0.16, hz);
        m.rotation.set(0.15, ry, -0.08);
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
        this.colliders.push({ x: hx, z: hz, r: s * 0.55 });
      }
      // perimeter — a broken forest of rusted I-beams and cable
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const px = gx + Math.cos(a) * 24, pz = gz + Math.sin(a) * 24;
        const py = terrainHeight(px, pz);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 4.5, 6), rust);
        post.position.set(px, py + 2.2, pz);
        post.rotation.z = (i % 3 === 0 ? 0.22 : 0) - 0.1;
        post.castShadow = true;
        this.scene.add(post);
        this.colliders.push({ x: px, z: pz, r: 0.4 });
      }
      // scattered armor plates across the dunes
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const px = gx + Math.cos(a) * (8 + (i * 37 % 13));
        const pz = gz + Math.sin(a) * (8 + (i * 53 % 13));
        const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6 + (i % 3), 0.35, 1.6), rustLight);
        plate.position.set(px, terrainHeight(px, pz) + 0.2, pz);
        plate.rotation.set(0.1, a * 3.1, 0.05);
        plate.receiveShadow = true;
        this.scene.add(plate);
      }
      slab(26, 22, darkStone, gx, gz, 0.38);
      brazier(gx - 7, gz + 7, 6);
      brazier(gx + 8, gz - 6, 6);
      brazier(gx + 2, gz + 11, 5);
    }

    // ===================================================================
    // 2. THE SUNKEN BASTION — The Drowned Keep (The Hollow Captain)
    // A keep sunk beneath a black moat, its gate the only way across.
    // ===================================================================
    {
      const gx = -185, gz = 25;
      const gy = terrainHeight(gx, gz);
      // the black moat
      const moat = new THREE.Mesh(
        new THREE.CircleGeometry(16.5, 40),
        new THREE.MeshStandardMaterial({ color: 0x0c161f, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.9 }),
      );
      moat.rotation.x = -Math.PI / 2;
      moat.position.set(gx, gy + 0.4, gz);
      this.scene.add(moat);
      // the keep — four corner towers linked by walls, one face collapsed
      const towerPos: [number, number][] = [[gx - 8.5, gz - 8.5], [gx + 8.5, gz - 8.5], [gx - 8.5, gz + 8.5], [gx + 8.5, gz + 8.5]];
      for (const [tx, tz] of towerPos) {
        const ty = terrainHeight(tx, tz);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(4.2, 11, 4.2), darkStone);
        tower.position.set(tx, ty + 5.5, tz);
        tower.castShadow = tower.receiveShadow = true;
        this.scene.add(tower);
        this.colliders.push({ x: tx, z: tz, r: 3.1 });
        // arrow slit — a burning eye
        const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.6), emberMat);
        slit.position.set(tx, ty + 6.4, tz + (tz > gz ? -2.12 : 2.12));
        slit.rotation.y = tz > gz ? 0 : Math.PI;
        this.scene.add(slit);
        const capTop = new THREE.Mesh(new THREE.ConeGeometry(3.1, 2.6, 4), rust);
        capTop.position.set(tx, ty + 12.2, tz);
        capTop.rotation.y = Math.PI / 4;
        this.scene.add(capTop);
      }
      // wall segments — north (broken) and east/west (standing)
      const wall = (x: number, z: number, w: number, ry: number) => {
        const y = terrainHeight(x, z);
        box(w, 5.5, 1.5, darkStone, x, y + 2.75, z, ry);
      };
      wall(gx, gz - 8.7, 13.5, 0);              // north curtain
      wall(gx - 8.7, gz, 13.5, Math.PI / 2);    // west curtain
      wall(gx + 8.7, gz, 13.5, Math.PI / 2);    // east curtain
      // south curtain collapsed — a rubble slope, not a wall
      for (let i = 0; i < 5; i++) {
        const rx = gx - 6 + i * 3.1;
        const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + (i * 0.7) % 1.2, 0), darkStone);
        rubble.position.set(rx, terrainHeight(rx, gz + 8.7) + 0.6, gz + 8.7);
        this.scene.add(rubble);
      }
      // gatehouse arch on the north approach
      const gateL = new THREE.Mesh(new THREE.BoxGeometry(2.6, 8.5, 2.6), darkStone);
      gateL.position.set(gx - 2.3, gy + 4.25, gz - 8.7);
      this.scene.add(gateL);
      this.colliders.push({ x: gx - 2.3, z: gz - 8.7, r: 1.7 });
      const gateR = gateL.clone();
      gateR.position.set(gx + 2.3, gy + 4.25, gz - 8.7);
      this.scene.add(gateR);
      this.colliders.push({ x: gx + 2.3, z: gz - 8.7, r: 1.7 });
      const gateLintel = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.7, 2.8), darkStone);
      gateLintel.position.set(gx, gy + 9.3, gz - 8.7);
      this.scene.add(gateLintel);
      // the keep's inner citadel — a memory of better days
      slab(10, 9, rustLight, gx, gz, 0);
      const keep = new THREE.Mesh(new THREE.BoxGeometry(6.5, 9.5, 6.5), paleStone);
      keep.position.set(gx, gy + 4.75, gz - 3);
      keep.castShadow = keep.receiveShadow = true;
      this.scene.add(keep);
      this.colliders.push({ x: gx, z: gz - 3, r: 4.4 });
      const window = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2), emberMat);
      window.position.set(gx, gy + 6, gz + 0.26);
      this.scene.add(window);
      // plank bridge sunk across the moat
      for (let i = 0; i < 7; i++) {
        box(4.2, 0.3, 1.7, rustLight, gx, gy + 0.55, gz + 14.5 - i * 1.85, 0, false);
      }
      brazier(gx - 5.5, gz - 5.5, 5);
      brazier(gx + 5.5, gz - 5.5, 5);
      brazier(gx, gz + 4, 4, 0xffd060);
    }

    // ===================================================================
    // 3. THE CINDERWOOD — The Ashen Chapel (The Ash-Stalker)
    // A roofless chapel in the burnt forest, its saints long gone.
    // ===================================================================
    {
      const gx = -265, gz = 55;
      const gy = terrainHeight(gx, gz);
      // black scorched floor circle
      const floor = new THREE.Mesh(new THREE.CircleGeometry(13, 30), new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(gx, gy + 0.06, gz);
      this.scene.add(floor);
      // the nave — two rows of broken octagonal columns
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const cz = gz - 7.5 + i * 5;
          const fallen = (i === 1 && side === 1) || (i === 3 && side === -1);
          if (fallen) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 5.5, 8), paleStone);
            m.rotation.z = Math.PI / 2;
            m.rotation.y = side;
            m.position.set(gx + side * 4.4, terrainHeight(gx + side * 4.4, cz) + 0.72, cz);
            m.castShadow = m.receiveShadow = true;
            this.scene.add(m);
            this.colliders.push({ x: gx + side * 4.4, z: cz, r: 1.2 });
          } else {
            pillar(gx + side * 4.4, cz, 0.72, 5.5 + (i % 2) * 1.2, paleStone);
          }
        }
      }
      // the rose window — a broken halo standing at the east end
      archRing(gx, gz - 10.5, 2.4, 0.34, bronze, 0, 0.12);
      const rose = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      rose.position.set(gx, terrainHeight(gx, gz - 10.5) + 2.4, gz - 10.5);
      rose.rotation.y = Math.PI;
      this.scene.add(rose);
      // altar slab and fallen saints
      box(3.4, 1.7, 1.5, paleStone, gx, gy + 0.85, gz + 9.5);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 11), rust);
      beam.position.set(gx + 1.4, gy + 5.1, gz + 0.5);
      beam.rotation.z = 0.06;
      beam.castShadow = true;
      this.scene.add(beam);
      this.colliders.push({ x: gx + 1.4, z: gz + 0.5, r: 1.2 });
      // wall stubs flanking the nave
      box(1.1, 3.4, 9, darkStone, gx - 8.2, gy + 1.7, gz);
      box(1.1, 2.2, 7, darkStone, gx + 8.2, gy + 1.1, gz + 1);
      // a body of ash where a congregation once stood
      for (let i = 0; i < 8; i++) {
        const ash = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + (i * 0.31) % 0.5, 0), darkStone);
        const a = i * 2.1;
        ash.position.set(gx + Math.cos(a) * 5.5, gy + 0.35, gz + Math.sin(a) * 5.5);
        this.scene.add(ash);
      }
      brazier(gx - 3.4, gz - 8.5, 6);
      brazier(gx + 3.4, gz - 8.5, 6);
      brazier(gx, gz + 9.5, 7, 0xff5a1a);
    }

    // ===================================================================
    // 4. THE GLASS CRAGS — The Obsidian Ziggurat (The Prism Warden)
    // A stepped sun pyramid of fused volcanic glass.
    // ===================================================================
    {
      const gx = -85, gz = -175;
      const gy = terrainHeight(gx, gz);
      // three tiers of black glass
      const tier = (w: number, h: number, yOff: number, ry: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), obsidian);
        m.position.set(gx, gy + yOff + h / 2, gz);
        m.rotation.y = ry;
        m.castShadow = m.receiveShadow = true;
        this.scene.add(m);
        return m;
      };
      tier(17, 2.6, 0, 0);
      tier(11.5, 2.6, 2.6, Math.PI / 4);
      tier(6.5, 2.6, 5.2, 0);
      this.colliders.push({ x: gx, z: gz, r: 8.2 });
      // the stair — an ascent of black glass
      for (let i = 0; i < 9; i++) {
        const t = i / 9;
        box(6, 0.42, 1.5, obsidian, gx, gy + 0.45 + t * 5.0, gz + 12.5 - t * 3.4, 0, false);
      }
      // the beacon altar at the summit
      const altar = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), emberMatBright);
      altar.position.set(gx, gy + 8.3, gz);
      this.scene.add(altar);
      // the altar's emissive heart is its own lantern
      // the obelisk ring — the watchers in stone
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const ox = gx + Math.cos(a) * 13.5, oz = gz + Math.sin(a) * 13.5;
        const oy = terrainHeight(ox, oz);
        const ob = new THREE.Mesh(new THREE.ConeGeometry(1.15 + (i % 2) * 0.35, 6.5 + (i % 3) * 1.7, 4), obsidian);
        ob.position.set(ox, oy + (6.5 + (i % 3) * 1.7) / 2, oz);
        ob.rotation.y = a;
        ob.castShadow = true;
        this.scene.add(ob);
        this.colliders.push({ x: ox, z: oz, r: 1.4 });
      }
      // a glowing fissure across the tiers
      const fissure = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 13), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      fissure.position.set(gx + 0.2, gy + 3.9, gz + 0.1);
      fissure.rotation.y = 0.3;
      fissure.rotation.x = 0.42;
      this.scene.add(fissure);
      brazier(gx - 9, gz + 9, 6);
      brazier(gx + 9, gz - 9, 6);
    }

    // ===================================================================
    // 5. THE SLAG MARSHES — The Drowned Nave (The Molten Leviathan)
    // A drowned temple of drowned saints in black water.
    // ===================================================================
    {
      const gx = -120, gz = -300;
      const gy = terrainHeight(gx, gz);
      // black water
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(15.5, 36),
        new THREE.MeshStandardMaterial({ color: 0x0a1210, roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.9 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(gx, gy + 0.32, gz);
      this.scene.add(water);
      // the drowned colonnade — two rows, some fallen
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const cz = gz - 8 + i * 4.2;
          const fallen = i % 3 === 2;
          if (fallen) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 4.6, 7), darkStone);
            m.rotation.z = Math.PI / 2;
            m.rotation.y = i * 0.9;
            m.position.set(gx + side * 5.2, gy + 0.75, cz);
            m.castShadow = true;
            this.scene.add(m);
          } else {
            pillar(gx + side * 5.2, cz, 0.65, 4.6 + (i % 2) * 1.0, darkStone);
          }
        }
      }
      // the sunken altar, mostly below the water
      const altar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 1.8), paleStone);
      altar.position.set(gx, gy + 0.28, gz);
      altar.castShadow = true;
      this.scene.add(altar);
      this.colliders.push({ x: gx, z: gz, r: 2.5 });
      // black braziers on the dry rim
      brazier(gx - 9.5, gz + 6.5, 6, 0xff5a1a);
      brazier(gx + 9.5, gz - 6.5, 6, 0xff5a1a);
      // weeping flames around the nave — emissive wicks, no bare bulbs
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const lx = gx + Math.cos(a) * 12, lz = gz + Math.sin(a) * 12;
        const wick = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), emberMatBright);
        wick.position.set(lx, terrainHeight(lx, lz) + 1.5, lz);
        this.scene.add(wick);
      }
    }

    // ===================================================================
    // 6. THE WHISPERING SPIRE — The Turbine Cathedral (The Gale Sentinel)
    // A cathedral rebuilt around the last wind turbine on earth.
    // ===================================================================
    {
      const gx = 190, gz = 115;
      const gy = terrainHeight(gx, gz);
      // stepped podium — the processional ascent
      box(19, 1.6, 19, darkStone, gx, gy + 0.8, gz, 0);
      box(13.5, 1.6, 13.5, paleStone, gx, gy + 2.4, gz, 0);
      this.colliders.push({ x: gx, z: gz, r: 9.2 });
      // four buttress arches — the cathedral's praying frame
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const bx = gx + Math.cos(a) * 6.4, bz = gz + Math.sin(a) * 6.4;
        box(1.2, 6.4, 1.2, darkStone, bx, gy + 4.4, bz, a, false);
      }
      // the turbine mast, forever turning
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.5, 33, 12), industrial);
      mast.position.set(gx, gy + 17, gz);
      mast.castShadow = true;
      this.scene.add(mast);
      this.colliders.push({ x: gx, z: gz, r: 2.3 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 12.5, 2.1), industrial);
        blade.position.set(gx, gy + 31, gz);
        blade.rotation.y = a;
        blade.rotation.z = 1.02;
        blade.castShadow = true;
        this.scene.add(blade);
      }
      // the beacon's glare is its own flare — emissive, no bare bulb
      const throatFlare = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), emberMatBright);
      throatFlare.position.set(gx, gy + 32.5, gz);
      this.scene.add(throatFlare);
      // a ring of candle-posts around the podium
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const px = gx + Math.cos(a) * 10.2, pz = gz + Math.sin(a) * 10.2;
        const py = terrainHeight(px, pz);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.6, 6), bronze);
        post.position.set(px, py + 1.3, pz);
        this.scene.add(post);
        const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), emberMatBright);
        tip.position.set(px, py + 2.75, pz);
        this.scene.add(tip);
      }
      brazier(gx - 6, gz + 6, 6);
      brazier(gx + 6, gz - 6, 6);
    }

    // ===================================================================
    // 7. THE FORGOTTEN FOUNDRY — The Foundry Cathedral (The Iron Forgemaster)
    // A factory that never stopped stamping out empty Life Armour.
    // ===================================================================
    {
      const gx = 178, gz = -70;
      const gy = terrainHeight(gx, gz);
      // nave of furnace stacks
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const cz = gz - 8 + i * 8;
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 10, 10), rust);
          stack.position.set(gx + side * 6.5, gy + 5, cz);
          stack.castShadow = stack.receiveShadow = true;
          this.scene.add(stack);
          this.colliders.push({ x: gx + side * 6.5, z: cz, r: 2.4 });
          // a glowing furnace band near the base
          const band = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.78, 0.7, 10, 1, true), emberMat);
          band.position.set(gx + side * 6.5, gy + 1.4, cz);
          this.scene.add(band);
        }
      }
      // the great furnace at the crossing
      const furnace = new THREE.Mesh(new THREE.BoxGeometry(7.5, 8, 7.5), rust);
      furnace.position.set(gx, gy + 4, gz);
      furnace.castShadow = furnace.receiveShadow = true;
      this.scene.add(furnace);
      this.colliders.push({ x: gx, z: gz, r: 5.4 });
      // a fire-mouth door
      const door = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.2), emberMat);
      door.position.set(gx, gy + 1.9, gz + 3.78);
      this.scene.add(door);
      // the gate's glow is carried by its own furnace bands
      // the final chimney — a black finger to the sky
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.2, 15, 10), rust);
      chimney.position.set(gx + 5.5, gy + 7.5, gz - 8.5);
      chimney.castShadow = true;
      this.scene.add(chimney);
      this.colliders.push({ x: gx + 5.5, z: gz - 8.5, r: 1.7 });
      // a conveyor skeleton spanning the nave
      box(0.5, 4.5, 0.5, industrial, gx - 4.5, gy + 2.25, gz - 3, 0, false);
      box(0.5, 4.5, 0.5, industrial, gx + 4.5, gy + 2.25, gz - 3, 0, false);
      box(10, 0.6, 0.9, industrial, gx, gy + 4.8, gz - 3, 0, false);
      // crane arm over the nave
      box(0.8, 9, 0.8, industrial, gx - 10, gy + 4.5, gz + 9, 0, false);
      box(7.5, 0.7, 0.7, industrial, gx - 6.4, gy + 8.7, gz + 9, 0.42, false);
      brazier(gx - 8, gz + 7, 7, 0xff5a1a);
      brazier(gx + 8, gz - 7, 7, 0xff5a1a);
    }

    // ===================================================================
    // 8. THE ASHEN CATHEDRAL — The Pale Nave (The Pale Herald)
    // The great ruined gateway on the road to Malenkar.
    // ===================================================================
    {
      const gx = 0, gz = 44;
      const gy = terrainHeight(gx, gz);
      // the west facade — two pillars and a beam, mostly standing
      for (const dx of [-5.4, 5.4]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.6, 11.5, 2.6), paleStone);
        p.position.set(gx + dx, terrainHeight(gx + dx, gz) + 5.75, gz);
        p.castShadow = p.receiveShadow = true;
        this.scene.add(p);
        this.colliders.push({ x: gx + dx, z: gz, r: 1.7 });
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(13.2, 1.8, 2.8), paleStone);
      lintel.position.set(gx, terrainHeight(gx, gz) + 12.3, gz);
      lintel.castShadow = true;
      this.scene.add(lintel);
      // the rose window — a burning eye in the beam
      archRing(gx, gz, 2.0, 0.3, bronze, 0, 0);
      const rose = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      rose.position.set(gx, gy + 12.3, gz + 0.01);
      this.scene.add(rose);
      // the nave — two rows of columns running north from the facade
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const cz = gz + 4.5 + i * 4.0;
          const fallen = i === 2 && side === 1;
          if (fallen) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 6.4, 8), paleStone);
            m.rotation.z = Math.PI / 2;
            m.rotation.y = 0.4;
            m.position.set(gx + side * 5.6, terrainHeight(gx + side * 5.6, cz) + 0.7, cz);
            m.castShadow = true;
            this.scene.add(m);
            this.colliders.push({ x: gx + side * 5.6, z: cz, r: 1.25 });
          } else {
            pillar(gx + side * 5.6, cz, 0.68, 6.6 + (i % 2) * 0.9, paleStone);
          }
        }
      }
      // the altar platform at the east end of the nave
      box(5.4, 0.9, 3.2, darkStone, gx, gy + 0.45, gz + 25.5, 0);
      box(2.6, 1.6, 1.3, paleStone, gx, gy + 1.55, gz + 25.5, 0);
      this.colliders.push({ x: gx, z: gz + 25.5, r: 2.2 });
      // a fallen arch crown where the choir vault used to be
      const crown = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.34, 8, 20, Math.PI), paleStone);
      crown.position.set(gx + 2.8, terrainHeight(gx + 2.8, gz + 14) + 0.8, gz + 14);
      crown.rotation.z = Math.PI / 2;
      crown.rotation.y = 0.8;
      crown.castShadow = true;
      this.scene.add(crown);
      this.colliders.push({ x: gx + 2.8, z: gz + 14, r: 1.6 });
      brazier(gx - 3.4, gz + 1.5, 7, 0xffd060);
      brazier(gx + 3.4, gz + 1.5, 7, 0xffd060);
      brazier(gx, gz + 26.2, 5, 0xff5a1a);
    }
  }

  // --------------------------- lore stones ----------------------------------
  private buildLoreStones() {
    const spots: [number, number][] = [
      [-70, 96], [96, 54], [-142, -20], [64, -110], [-6, -150], [150, 30],
      [152, -186], // STONE OF THE FIRST KNIGHT — the Iron Dunes vigil
      [10, 26],    // STONE OF THE LAST KING — the road to the citadel
    ];
    const mat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x6fc6ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    spots.forEach(([x, z], id) => {
      const y = terrainHeight(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const stone = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 1), mat.clone());
      stone.position.y = 1.3;
      stone.castShadow = true;
      g.add(stone);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(2.3, 12, 10), haloMat.clone());
      halo.position.y = 1.3;
      g.add(halo);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.7, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x39332c, roughness: 0.9 }),
      );
      base.position.y = 0.25;
      base.castShadow = base.receiveShadow = true;
      g.add(base);
      this.scene.add(g);
      this.loreStones.push({ pos: new THREE.Vector3(x, y, z), id, mesh: stone });
      this.colliders.push({ x, z, r: 0.9 });
    });
  }

  // ------------------------------- mist ------------------------------------
  private buildMist() {
    const tex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const ctx = c.getContext("2d")!;
      const grd = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
      grd.addColorStop(0, "rgba(190,170,150,0.30)");
      grd.addColorStop(0.6, "rgba(150,130,110,0.10)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
      blending: THREE.NormalBlending,
    });
    const rng = makeRng(2024);
    const geo = new THREE.PlaneGeometry(1, 1);
    const count = 90;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const rad = 30 + rng() * 150;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      v.set(x, terrainHeight(x, z) + 1 + rng() * 3, z);
      q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rng() * 6));
      const sc = 26 + rng() * 44;
      s.set(sc, sc, sc);
      m.compose(v, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 5;
    mesh.name = "world-mist";
    this.scene.add(mesh);
    this.mistRoot = mesh;
  }

  // ------------------------------ citadel -----------------------------------
  /** THE BLACK CITADEL — obsidian gate, chasm of ash, and the stolen engine above the dais. */
  private buildCitadel() {
    const obsidian = new THREE.MeshStandardMaterial({ color: 0x161010, roughness: 0.38, metalness: 0.78, flatShading: true });
    const obsidianDeep = new THREE.MeshStandardMaterial({ color: 0x0d0a09, roughness: 0.55, metalness: 0.6, flatShading: true });
    const veinMat = new THREE.MeshBasicMaterial({ color: 0x3a9aff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const rng = makeRng(31337);

    // ---------- the ash-chasm moat on the road north of the cathedral rim ----------
    const chasmY = terrainHeight(0, 34);
    const crackTex = (() => {
      const c = document.createElement("canvas");
      c.width = 512; c.height = 128;
      const g = c.getContext("2d")!;
      g.fillStyle = "#070403";
      g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 46; i++) {
        const y0 = 8 + rng() * 112;
        g.strokeStyle = `rgba(255,${120 + Math.floor(rng() * 90)},40,${0.5 + rng() * 0.5})`;
        g.lineWidth = 1 + rng() * 2.4;
        g.shadowBlur = 8;
        g.shadowColor = "#ff7a22";
        g.beginPath();
        g.moveTo(0, y0);
        let x = 0;
        let y = y0;
        while (x < 512) {
          x += 18 + rng() * 30;
          y = Math.max(4, Math.min(124, y + (rng() - 0.5) * 34));
          g.lineTo(x, y);
        }
        g.stroke();
      }
      return new THREE.CanvasTexture(c);
    })();
    const chasm = new THREE.Mesh(new THREE.PlaneGeometry(86, 15), new THREE.MeshBasicMaterial({ map: crackTex, depthWrite: false }));
    chasm.rotation.x = -Math.PI / 2;
    chasm.position.set(0, chasmY + 0.14, 34);
    chasm.renderOrder = 1;
    this.scene.add(chasm);

    // obsidian teeth lining the fissure
    for (let i = 0; i < 44; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = (rng() - 0.5) * 80;
      const z = 34 + side * (6.4 + rng() * 2.4);
      const h = 1.6 + rng() * 2.8;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rng() * 0.9, h, 5), obsidianDeep);
      tooth.position.set(x, terrainHeight(x, z) + h * 0.42, z);
      tooth.castShadow = true;
      this.scene.add(tooth);
    }

    // ---------- the obsidian drawbridge ----------
    const deckY = chasmY + 1.1;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.8, 17.4), obsidian);
    deck.position.set(0, deckY, 34);
    deck.castShadow = deck.receiveShadow = true;
    this.scene.add(deck);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 17.4), obsidianDeep);
      rail.position.set(sx * 4.05, deckY + 1.0, 34);
      rail.castShadow = true;
      this.scene.add(rail);
      for (const zc of [25.6, 42.4]) {
        const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.62, 7.2, 5), obsidianDeep);
        obelisk.position.set(sx * 4.05, deckY + 3.6, zc);
        obelisk.castShadow = true;
        this.scene.add(obelisk);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.8, 5), obsidian);
        tip.position.set(sx * 4.05, deckY + 7.6, zc);
        this.scene.add(tip);
      }
    }
    // ember-glow bleeding up through the planks
    const underglow = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 17), emberMat.clone());
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.set(0, deckY - 0.46, 34);
    this.scene.add(underglow);
    addPlatform({ x0: -4.4, x1: 4.4, z0: 25.2, z1: 42.8, y0: deckY + 0.4 });

    // ---------- outer buttresses on the road (seen from the keep) ----------
    const buttresses: [number, number, number, number][] = [
      [-11, 63, 24, 2.6], [11, 63, 27, 3.0], [-18, 75, 32, 3.4], [18, 75, 30, 3.1],
    ];
    for (const [bx, bz, bh, br] of buttresses) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(br, bh, 6), obsidianDeep);
      spike.position.set(bx, terrainHeight(bx, bz) + bh * 0.42, bz);
      spike.castShadow = true;
      this.scene.add(spike);
      this.colliders.push({ x: bx, z: bz, r: br * 0.8 });
    }

    // ---------- the gate of black iron on the cathedral rim ----------
    const gateY = terrainHeight(0, 50);
    for (const sx of [-1, 1]) {
      const towerX = sx * 7.2;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(5.4, 36, 5.4), obsidian);
      tower.position.set(towerX, gateY + 18, 50.5);
      tower.castShadow = true;
      this.scene.add(tower);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(3.6, 9, 4), obsidianDeep);
      crown.rotation.y = Math.PI / 4;
      crown.position.set(towerX, gateY + 40.5, 50.5);
      crown.castShadow = true;
      this.scene.add(crown);
      // stolen light veins crawling up the iron
      for (let v = 0; v < 3; v++) {
        const vein = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 27 + rng() * 6), veinMat);
        vein.position.set(towerX + (v - 1) * 1.5, gateY + 13 + rng() * 6, 47.78);
        this.scene.add(vein);
      }
      this.colliders.push({ x: towerX, z: 50.5, r: 3.6 });
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(20, 3.6, 5.6), obsidian);
    lintel.position.set(0, gateY + 34.9, 50.5);
    lintel.castShadow = true;
    this.scene.add(lintel);
    const lintelTrim = new THREE.Mesh(new THREE.BoxGeometry(16.4, 1.7, 4.6), obsidianDeep);
    lintelTrim.position.set(0, gateY + 31.9, 50.5);
    this.scene.add(lintelTrim);
    // the great doors, torn open from within
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(6.4, 27, 1.1), obsidianDeep);
      door.position.set(sx * 5.1, gateY + 13.5, 46.4);
      door.rotation.y = sx * 0.62;
      door.castShadow = true;
      this.scene.add(door);
    }

    // ---------- the stolen engine, suspended above the dais ----------
    const raeku = new THREE.Group();
    raeku.position.set(0, 17.6, -18);
    const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(2.75, 0), new THREE.MeshStandardMaterial({ color: 0x6b4e22, metalness: 0.92, roughness: 0.32, flatShading: true }));
    cage.castShadow = true;
    raeku.add(cage);
    const cageEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.78, 0)), new THREE.LineBasicMaterial({ color: 0xd8b25a, transparent: true, opacity: 0.7 }));
    raeku.add(cageEdges);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x0a2a4a, emissive: 0x3aa0ff, emissiveIntensity: 2.3, metalness: 0.25, roughness: 0.2, transparent: true, opacity: 0.96 });
    this.citadelFlicker.push(coreMat);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), coreMat);
    raeku.add(core);
    this.scene.add(raeku);
    this.citadelRaeku = raeku;

    // umbilical cables from the sanctum's dead pillars into the engine
    const cables = new THREE.Group();
    const cableAnchors: [number, number, number][] = [[-30, 24, -44], [30, 24, -44], [-33, 23, 6], [33, 23, 6]];
    for (const [cx, cy, cz] of cableAnchors) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(cx, cy, cz),
        new THREE.Vector3(cx * 0.4, 13.2, -18 + (cz + 18) * 0.35),
        new THREE.Vector3(0, 17.6, -18),
      );
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.34, 6, false), new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.7, metalness: 0.4 }));
      cables.add(tube);
    }
    this.scene.add(cables);
    this.citadelCables = cables;

    // the siphon beam feeding the warlord's throne
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x2a7aff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 0.85, 15.5, 10, 1, true), beamMat);
    beam.position.set(0, 9.4, -18);
    this.scene.add(beam);
    this.citadelBeam = beam;

    // the engine's cold heart-light — one real light, and worth it
    const raekuLight = new THREE.PointLight(0x3a8aff, 30, 70, 1.7);
    raekuLight.position.set(0, 15, -18);
    this.scene.add(raekuLight);

    // four black obelisks ringing the dais, each slit with stolen blue
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const ox = Math.cos(a) * 6.4;
      const oz = -18 + Math.sin(a) * 6.4;
      const oy = terrainHeight(ox, oz);
      const ob = new THREE.Mesh(new THREE.BoxGeometry(1.15, 6.6, 1.15), obsidian);
      ob.position.set(ox, oy + 3.3, oz);
      ob.castShadow = true;
      this.scene.add(ob);
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 4.6), veinMat);
      slit.position.set(ox + Math.cos(a) * 0.6, oy + 3.4, oz + Math.sin(a) * 0.6);
      slit.rotation.y = -a + Math.PI;
      this.scene.add(slit);
      this.colliders.push({ x: ox, z: oz, r: 1.0 });
    }

    // the sunken dais the engine rains onto
    const floorY = terrainHeight(0, -18);
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 8.4, 1.1, 18), obsidianDeep);
    dais.position.set(0, floorY + 0.55, -18);
    dais.receiveShadow = true;
    this.scene.add(dais);
    const glyph = new THREE.Mesh(new THREE.RingGeometry(4.4, 5.15, 48), emberMat.clone());
    glyph.rotation.x = -Math.PI / 2;
    glyph.position.set(0, floorY + 1.13, -18);
    this.scene.add(glyph);
  }

  /** The Raeku's heart in Kingsfall Keep — dim and guttering until the Shards come home. */
  private buildRaekuHeart() {
    const floorY = this.keep?.base ?? terrainHeight(0, 129);
    const obsidian = new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.6, metalness: 0.5, flatShading: true });
    // pedestal bolted into the keep's black rock behind the throne
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.5, 3.1, 8), obsidian);
    pedestal.position.set(0, floorY + 1.55, 129.15);
    pedestal.castShadow = true;
    this.scene.add(pedestal);
    const cradle = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 6, 14), new THREE.MeshStandardMaterial({ color: 0x6b4e22, metalness: 0.9, roughness: 0.35 }));
    cradle.rotation.x = Math.PI / 2;
    cradle.position.set(0, floorY + 3.35, 129.15);
    this.scene.add(cradle);

    const heart = new THREE.Group();
    heart.position.set(0, floorY + 4.6, 129.15);
    const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 0), new THREE.MeshStandardMaterial({ color: 0x54401e, metalness: 0.92, roughness: 0.4, flatShading: true }));
    cage.castShadow = true;
    heart.add(cage);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x081c30, emissive: 0x2a6aff, emissiveIntensity: 0.85, metalness: 0.3, roughness: 0.25, transparent: true, opacity: 0.95 });
    this.keepRaekuCore = coreMat;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.88, 0), coreMat);
    heart.add(core);
    for (const [i, minTier] of [1, 3, 4].entries()) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.72 + i * 0.28, 0.035 + i * 0.012, 6, 48),
        new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffdf91 : 0x82c9ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.rotation.set(Math.PI / 2 + i * 0.45, i * 0.7, 0);
      halo.visible = false;
      heart.add(halo);
      this.relayHalos.push({ mesh: halo, minTier });
    }
    this.scene.add(heart);
    this.keepRaekuLight = new THREE.PointLight(0x2a6aff, 3.4, 26, 1.9);
    this.keepRaekuLight.position.set(0, floorY + 4.6, 128.4);
    this.scene.add(this.keepRaekuLight);
  }

  // --------------------- restoration & settlement payoffs -------------------
  private buildWorldReactions() {
    const iron = new THREE.MeshStandardMaterial({ color: 0x343942, roughness: 0.55, metalness: 0.72 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x493421, roughness: 0.94 });
    const canvas = new THREE.MeshStandardMaterial({ color: 0x756343, roughness: 0.95, side: THREE.DoubleSide });
    const amber = new THREE.MeshBasicMaterial({ color: 0xffc66d, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
    const blue = new THREE.MeshBasicMaterial({ color: 0x8fd9ff, transparent: true, opacity: 0.68, blending: THREE.AdditiveBlending, depthWrite: false });

    // The capital relights district by district: gate, courtyard, high keep,
    // then the complete Relay crown. Geometry is cheap; the two real hearths
    // above carry the actual illumination.
    const lamps: [number, number, number][] = [
      [-3.6, 96.2, 1], [3.6, 96.2, 1],
      [-6.2, 104, 2], [6.2, 104, 2],
      [-4.2, 116, 3], [4.2, 116, 3],
      [0, 123.2, 4],
    ];
    for (const [x, z, minTier] of lamps) {
      const group = new THREE.Group();
      group.position.set(x, terrainHeight(x, z), z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.17, 2.7, 6), iron);
      pole.position.y = 1.35;
      group.add(pole);
      const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), amber);
      crown.position.y = 2.9;
      group.add(crown);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.75, 24), amber);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(ring);
      group.visible = false;
      this.scene.add(group);
      this.restorationGroups.push({ group, minTier });
    }

    // Six Shards: Lyekai's scouts finally have a muster table, weapon racks,
    // and packs ready for the march instead of merely another dialogue line.
    const scouts = new THREE.Group();
    scouts.position.set(14.5, terrainHeight(14.5, 103.5), 103.5);
    const table = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.8), timber);
    table.position.y = 1.15;
    scouts.add(table);
    for (const x of [-1.25, 1.25]) {
      for (const z of [-0.62, 0.62]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.15, 0.13), timber);
        leg.position.set(x, 0.57, z);
        scouts.add(leg);
      }
    }
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 1.3), new THREE.MeshBasicMaterial({ color: 0xc6b27c, side: THREE.DoubleSide }));
    chart.rotation.x = -Math.PI / 2;
    chart.position.y = 1.25;
    scouts.add(chart);
    for (let i = 0; i < 4; i++) {
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.8, 5), iron);
      spear.position.set(-2.2 + i * 0.18, 1.4, 0.3);
      spear.rotation.z = -0.12;
      scouts.add(spear);
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.65, 0.42), canvas);
      pack.position.set(1.9 + (i % 2) * 0.62, 0.33, -0.8 + Math.floor(i / 2) * 0.55);
      scouts.add(pack);
    }
    scouts.visible = false;
    this.scene.add(scouts);
    this.restorationGroups.push({ group: scouts, minTier: 3 });

    // Friendly patrols are cosmetic and collision-free: they make the roads
    // feel held without introducing another hostile AI population.
    const patrolDefs: [number, number, number, "x" | "z", number, number][] = [
      [1, -5, 100, "x", 3.2, 0], [1, 5, 100, "x", 3.2, Math.PI],
      [2, -5, 113, "z", 3.4, 1.2], [2, 5, 113, "z", 3.4, 4.2],
      [4, -14, 102, "z", 4.5, 2.4], [4, 14, 102, "z", 4.5, 5.4],
    ];
    for (const [minTier, x, z, axis, range, phase] of patrolDefs) {
      const rig = buildRig({ scale: 0.98, bulk: 1.12, armor: 0x59616b, armorDark: 0x252a31, cloth: 0x313c52, accent: 0xffd27a, accentIntensity: 1.7, weapon: "swordshield", cape: true });
      rig.root.traverse((o) => { o.castShadow = false; });
      rig.root.position.set(x, terrainHeight(x, z), z);
      rig.root.visible = false;
      this.scene.add(rig.root);
      this.reactivePatrols.push({ rig, minTier, x, z, axis, range, phase });
    }

    // The Dark Below: each completed chain step kindles one persistent lamp.
    for (const [i, spot] of ([[-112, -148], [-98, -162], [-120, -172]] as const).entries()) {
      const [x, z] = spot;
      const y = terrainHeight(x, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 3.1, 6), iron);
      post.position.set(x, y + 1.55, z);
      this.scene.add(post);
      const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), amber.clone());
      flame.position.set(x, y + 3.25, z);
      flame.visible = false;
      this.scene.add(flame);
      const light = new THREE.PointLight(0xffb65e, 8, 17, 1.8);
      light.position.set(x, y + 3.15, z);
      light.visible = false;
      this.scene.add(light);
      this.questLanterns.push({ flame, light, phase: i * 2.1 });
    }

    // The Merchant King's fall puts a real covered convoy back on the dunes.
    const convoyRoot = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.75, 2.1), timber);
    bed.position.y = 1.05;
    convoyRoot.add(bed);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 3.5, 12, 1, true, 0, Math.PI), canvas);
    cover.rotation.z = Math.PI / 2;
    cover.rotation.y = Math.PI / 2;
    cover.position.y = 1.65;
    convoyRoot.add(cover);
    const wheels: THREE.Mesh[] = [];
    for (const x of [-1.3, 1.3]) {
      for (const z of [-1.16, 1.16]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 12), iron);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.62, z);
        convoyRoot.add(wheel);
        wheels.push(wheel);
      }
    }
    const escortA = buildRig({ scale: 0.98, bulk: 1.05, armor: 0x554936, armorDark: 0x272119, cloth: 0x5a3525, accent: 0xffc66d, weapon: "none", cape: true });
    const escortB = buildRig({ scale: 1.02, bulk: 1.12, armor: 0x4c535e, armorDark: 0x22262c, cloth: 0x303b4d, accent: 0x9fd8ff, weapon: "swordshield" });
    escortA.root.position.set(-2.8, 0, 0.8);
    escortB.root.position.set(2.8, 0, -0.8);
    convoyRoot.add(escortA.root, escortB.root);
    convoyRoot.visible = false;
    this.scene.add(convoyRoot);
    this.convoy = { root: convoyRoot, rigs: [escortA, escortB], wheels };

    // Gatewatch's fallen recon squad receives three named-blue memorial lamps.
    const memorial = new THREE.Group();
    memorial.position.set(20, terrainHeight(20, 113), 113);
    for (let i = 0; i < 3; i++) {
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.15, 0.34), iron);
      stone.position.set((i - 1) * 1.25, 0.58, 0);
      memorial.add(stone);
      const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), blue);
      light.position.set((i - 1) * 1.25, 1.35, 0);
      memorial.add(light);
    }
    memorial.visible = false;
    this.scene.add(memorial);
    this.scoutMemorial = memorial;

    // Moss-Haven's repaired panes close around a living green canopy.
    const dome = new THREE.Group();
    dome.position.set(-302, terrainHeight(-302, 24), 24);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(7.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9adbc2, emissive: 0x245e3d, emissiveIntensity: 0.45, transparent: true, opacity: 0.16, roughness: 0.12, metalness: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    dome.add(glass);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39996;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.4, 7), new THREE.MeshStandardMaterial({ color: 0x4e8a50, emissive: 0x183c20, emissiveIntensity: 0.6, roughness: 0.85 }));
      leaf.position.set(Math.cos(a) * 3.7, 1.2, Math.sin(a) * 3.7);
      dome.add(leaf);
    }
    dome.visible = false;
    this.scene.add(dome);
    this.mossDome = dome;

    // Glint-Post and the Sanctuary answer their completed arcs with landmarks
    // visible from the road, not only a few hundred runes in a ledger.
    const signal = new THREE.Group();
    signal.position.set(-58, terrainHeight(-58, -132), -132);
    const signalBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 1.1, 58, 12, 1, true), blue);
    signalBeam.position.y = 29;
    signal.add(signalBeam);
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(2.1, 24), new THREE.MeshStandardMaterial({ color: 0xc9ecff, emissive: 0x77c9ff, emissiveIntensity: 1.8, metalness: 0.85, roughness: 0.12, side: THREE.DoubleSide }));
    mirror.position.y = 3.2;
    mirror.rotation.x = -0.45;
    signal.add(mirror);
    signal.visible = false;
    this.scene.add(signal);
    this.signalArray = signal;

    const sanctuary = new THREE.Group();
    sanctuary.position.set(-24, terrainHeight(-24, 82), 82);
    const sanctuaryBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.65, 34, 10, 1, true), amber);
    sanctuaryBeam.position.y = 17;
    sanctuary.add(sanctuaryBeam);
    const sanctuaryFlame = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), amber);
    sanctuaryFlame.position.y = 2.2;
    sanctuary.add(sanctuaryFlame);
    sanctuary.visible = false;
    this.scene.add(sanctuary);
    this.sanctuaryBeacon = sanctuary;

    // Stilt-Haven needs both a safe dock and a charted channel. The ferryman,
    // hull, and pole are cosmetic: no collision or transport state to persist.
    const skiffRoot = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 5.2), timber);
    hull.position.y = 0.35;
    skiffRoot.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.65, 2.1, 4), timber);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.35, 3.05);
    skiffRoot.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 4.5), canvas);
    deck.position.y = 0.66;
    skiffRoot.add(deck);
    for (const x of [-1.12, 1.12]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 4.8), timber);
      rail.position.set(x, 0.75, 0);
      skiffRoot.add(rail);
    }
    const ferryman = buildRig({ scale: 0.94, bulk: 1.08, armor: 0x4b4437, armorDark: 0x24231e, cloth: 0x344636, accent: 0xffc66d, weapon: "none", cape: true });
    ferryman.root.position.set(0, 0.72, -0.5);
    ferryman.root.traverse((o) => { o.castShadow = false; });
    skiffRoot.add(ferryman.root);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 5.8, 6), timber);
    pole.position.set(1.05, 2.4, -0.25);
    pole.rotation.z = -0.32;
    skiffRoot.add(pole);
    const skiffLamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), amber);
    skiffLamp.position.set(0, 1.05, 2.25);
    skiffRoot.add(skiffLamp);
    skiffRoot.visible = false;
    this.scene.add(skiffRoot);
    this.stiltSkiff = { root: skiffRoot, rig: ferryman, pole };

    // Mirage Well's restored pumps actually turn, reciprocate, and spill water.
    const pumpRoot = new THREE.Group();
    const pumpWheels: THREE.Group[] = [];
    const pistons: { mesh: THREE.Mesh; baseY: number }[] = [];
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x76d9e8, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [x, z] of [[187, -231], [207, -246]] as const) {
      const y = terrainHeight(x, z);
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 3.1, 10), iron);
      housing.position.set(x, y + 1.55, z);
      pumpRoot.add(housing);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 4.8, 8), iron);
      pipe.position.set(x + 1.45, y + 2.4, z);
      pumpRoot.add(pipe);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.8, 8), iron);
      spout.rotation.z = Math.PI / 2;
      spout.position.set(x + 2.65, y + 4.65, z);
      pumpRoot.add(spout);
      const wheel = new THREE.Group();
      wheel.position.set(x - 1.35, y + 2.25, z);
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.13, 6, 18), iron));
      const spokeA = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 0.1), iron);
      const spokeB = spokeA.clone();
      spokeB.rotation.z = Math.PI / 2;
      wheel.add(spokeA, spokeB);
      pumpRoot.add(wheel);
      pumpWheels.push(wheel);
      const piston = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.4, 0.34), iron);
      piston.position.set(x + 1.45, y + 4.25, z);
      pumpRoot.add(piston);
      pistons.push({ mesh: piston, baseY: y + 4.25 });
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 4.1, 8), waterMat);
      water.position.set(x + 4.0, y + 2.55, z);
      pumpRoot.add(water);
      const basin = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.18, 6, 20), iron);
      basin.rotation.x = Math.PI / 2;
      basin.position.set(x + 4.0, y + 0.45, z);
      pumpRoot.add(basin);
    }
    pumpRoot.visible = false;
    this.scene.add(pumpRoot);
    this.miragePumps = { root: pumpRoot, wheels: pumpWheels, pistons, waterMat };

    // Cloud-Anchor's single restored cable runs toward Gale-Nest. The car
    // follows the same sagging curve as the cable, including at save-load.
    const gondolaRoot = new THREE.Group();
    const from = new THREE.Vector3(224, terrainHeight(224, 146) + 16, 146);
    const to = new THREE.Vector3(213, terrainHeight(213, 92) + 16, 92);
    const middle = from.clone().lerp(to, 0.5);
    middle.y -= 5;
    const curve = new THREE.QuadraticBezierCurve3(from, middle, to);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.075, 5, false), iron);
    gondolaRoot.add(cable);
    for (const end of [from, to]) {
      const ground = terrainHeight(end.x, end.z);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.65, end.y - ground, 8), iron);
      tower.position.set(end.x, ground + (end.y - ground) / 2, end.z);
      gondolaRoot.add(tower);
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 0.3), iron);
      crossbar.position.copy(end);
      gondolaRoot.add(crossbar);
    }
    const car = new THREE.Group();
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 2.5), canvas);
    cabin.position.y = -3.25;
    car.add(cabin);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.25, 1.1, 4), iron);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = -1.65;
    car.add(roof);
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6), iron);
    hanger.position.y = -0.85;
    car.add(hanger);
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.48, depthWrite: false });
    for (const x of [-0.85, 0.85]) {
      const window = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.8), windowMat);
      window.position.set(x, -3.15, 1.256);
      car.add(window);
    }
    const gondolaWheels: THREE.Mesh[] = [];
    const wheelGeo = new THREE.TorusGeometry(0.38, 0.1, 6, 12);
    wheelGeo.rotateY(Math.PI / 2);
    for (const z of [-0.65, 0.65]) {
      const wheel = new THREE.Mesh(wheelGeo, iron);
      wheel.position.set(0, 0.15, z);
      car.add(wheel);
      gondolaWheels.push(wheel);
    }
    curve.getPoint(0.5, car.position);
    car.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    gondolaRoot.add(car);
    gondolaRoot.visible = false;
    this.scene.add(gondolaRoot);
    this.cloudGondola = { root: gondolaRoot, car, curve, wheels: gondolaWheels };
  }

  /** Idempotent 0/2/4/6/8-Shard restoration, including after a save load. */
  setShardTier(tier: number) {
    this.shardTier = THREE.MathUtils.clamp(Math.floor(tier), 0, 4);
    for (const w of this.keepWindowTiers) w.mat.opacity = this.shardTier >= w.minTier ? 0.42 + this.shardTier * 0.075 : 0.09;
    for (const h of this.keepHearths) h.base = h.original + this.shardTier * 5.5;
    for (const h of this.relayHalos) h.mesh.visible = this.shardTier >= h.minTier;
    for (const r of this.restorationGroups) r.group.visible = this.shardTier >= r.minTier;
    for (const p of this.reactivePatrols) p.rig.root.visible = this.shardTier >= p.minTier;
  }

  /** Quest-driven changes are derived state too; no cosmetic save flags needed. */
  setQuestReactions(state: { lanternsLit: number; caravan: boolean; scoutsHonored: boolean; domeRestored: boolean; signalArray: boolean; sanctuaryBeacon: boolean; skiffFreed: boolean; pumpsRunning: boolean; gondolaRunning: boolean }) {
    for (const [i, lantern] of this.questLanterns.entries()) {
      const lit = i < state.lanternsLit;
      lantern.flame.visible = lit;
      lantern.light.visible = lit;
    }
    if (this.convoy) this.convoy.root.visible = state.caravan;
    if (this.scoutMemorial) this.scoutMemorial.visible = state.scoutsHonored;
    if (this.mossDome) this.mossDome.visible = state.domeRestored;
    if (this.signalArray) this.signalArray.visible = state.signalArray;
    if (this.sanctuaryBeacon) this.sanctuaryBeacon.visible = state.sanctuaryBeacon;
    if (this.stiltSkiff) this.stiltSkiff.root.visible = state.skiffFreed;
    if (this.miragePumps) this.miragePumps.root.visible = state.pumpsRunning;
    if (this.cloudGondola) this.cloudGondola.root.visible = state.gondolaRunning;
  }

  // ------------------------------ update -----------------------------------
  update(dt: number, camPos: THREE.Vector3) {
    this.time += dt;
    if (this.citadelRaeku) {
      this.citadelRaeku.rotation.y += dt * 0.33;
      this.citadelRaeku.rotation.x = Math.sin(this.time * 0.37) * 0.09;
    }
    for (const m of this.citadelFlicker) {
      m.emissiveIntensity = 2.2 + Math.sin(this.time * 6.4) * 0.55 + Math.sin(this.time * 17.1) * 0.35;
    }
    if (this.citadelBeam) {
      (this.citadelBeam.material as THREE.MeshBasicMaterial).opacity = 0.17 + Math.sin(this.time * 2.7) * 0.055;
    }
    this.skyMat.uniforms.uTime.value = this.time;
    for (const u of this.shaderUniforms) u.value = this.time; // wind sway only — no extra bloom

    // ---------------------------- day / night -------------------------------
    this.dayPhase = (this.dayPhase + dt / World.DAY_LENGTH) % 1;
    const angle = this.dayPhase * Math.PI * 2;
    this.sunDir.set(Math.cos(angle) * 0.92, 0.14 - Math.cos(angle) * 0.92, -0.82).normalize();
    this.moonDir.copy(this.sunDir).multiplyScalar(-1);
    this.nightFactor = THREE.MathUtils.clamp(1 - (this.sunDir.y + 0.12) / 0.32, 0, 1);
    this.skyMat.uniforms.uNight.value = this.nightFactor;

    const sunLit = 1 - this.nightFactor * 0.94;
    this.sun.intensity = 3.1 * sunLit;
    this.sun.color.setHSL(0.09, 0.55, 0.5 + this.nightFactor * 0.25);
    this.hemi.intensity = 0.75 - this.nightFactor * 0.35;
    this.hemi.color.setHSL(0.66, 0.35, 0.35 + this.nightFactor * 0.08);
    this.fill.intensity = 0.55 * (1 - this.nightFactor * 0.5);

    // ------------------------------- weather --------------------------------
    this.ashAmt += (this.ashTarget - this.ashAmt) * Math.min(1, dt * 0.28);
    this.emberAmt += (this.emberTarget - this.emberAmt) * Math.min(1, dt * 0.28);
    this.skyMat.uniforms.uStorm.value = this.ashAmt;
    const windMul = 1 + this.ashAmt * 2.6 + this.emberAmt * 0.4;
    for (const u of this.windUniforms) u.value = windMul;

    const fogColor = this.fogColorClear.clone().lerp(this.fogColorAsh, this.ashAmt).lerp(this.fogColorEmber, this.emberAmt * 0.7);
    // fog deepens at night too, for atmosphere
    fogColor.lerp(new THREE.Color(0x07070c), this.nightFactor * 0.55);
    (this.scene.fog as THREE.FogExp2).color.copy(fogColor);
    (this.scene.fog as THREE.FogExp2).density = this.fogBase * (1 + this.ashAmt * 2.2 + this.emberAmt * 0.5 + this.nightFactor * 0.25);

    // keep the shadow frustum around the player
    this.sun.position.set(camPos.x, 0, camPos.z).addScaledVector(this.sunDir, 170);
    this.sun.target.position.set(camPos.x, 0, camPos.z);
    this.sun.target.updateMatrixWorld();

    const nightBoost = 1 + this.nightFactor * 0.7;
    for (const b of this.braziers) {
      b.light.intensity = b.base * nightBoost * (0.75 + Math.sin(this.time * 9 + b.phase) * 0.12 + Math.sin(this.time * 21.3 + b.phase * 2) * 0.09);
    }
    for (const site of this.graceSites) {
      site.shard.rotation.y = this.time * 0.9;
      site.shard.rotation.x = Math.sin(this.time * 0.7) * 0.25;
      site.shard.position.y = 1.1 + Math.sin(this.time * 1.4 + site.pos.z) * 0.12;
    }
    for (const stone of this.loreStones) {
      stone.mesh.rotation.y = this.time * 0.5 + stone.id;
      stone.mesh.position.y = 1.3 + Math.sin(this.time * 1.1 + stone.id * 2) * 0.1;
    }

    // Restoration remains alive rather than becoming a static unlock tableau.
    for (const [i, h] of this.relayHalos.entries()) {
      if (!h.mesh.visible) continue;
      h.mesh.rotation.z += dt * (0.16 + i * 0.08) * (i % 2 ? -1 : 1);
      h.mesh.rotation.y += dt * 0.09;
    }
    for (const p of this.reactivePatrols) {
      if (!p.rig.root.visible) continue;
      const dx = p.x - camPos.x;
      const dz = p.z - camPos.z;
      if (dx * dx + dz * dz > 150 * 150) continue;
      const t = this.time * 0.34 + p.phase;
      const offset = Math.sin(t) * p.range;
      const forward = Math.cos(t) >= 0 ? 1 : -1;
      const x = p.x + (p.axis === "x" ? offset : 0);
      const z = p.z + (p.axis === "z" ? offset : 0);
      p.rig.root.position.set(x, terrainHeight(x, z), z);
      p.rig.root.rotation.y = p.axis === "x" ? forward * Math.PI / 2 : forward > 0 ? 0 : Math.PI;
      poseRig(p.rig, { dt, time: this.time + p.phase, speed: 0.75, state: "walk", phase: p.phase, combo: 0, weapon: "swordshield" });
    }
    for (const lantern of this.questLanterns) {
      if (!lantern.flame.visible) continue;
      const flicker = 0.9 + Math.sin(this.time * 8.5 + lantern.phase) * 0.1;
      lantern.flame.scale.setScalar(flicker);
      lantern.light.intensity = 8 * flicker;
    }
    if (this.convoy?.root.visible) {
      const a = this.time * 0.045;
      const x = 118 + Math.cos(a) * 22;
      const z = -252 + Math.sin(a) * 22;
      this.convoy.root.position.set(x, terrainHeight(x, z), z);
      this.convoy.root.rotation.y = -a;
      for (const wheel of this.convoy.wheels) wheel.rotation.y += dt * 1.1;
      for (const [i, rig] of this.convoy.rigs.entries()) {
        poseRig(rig, { dt, time: this.time + i, speed: 0.55, state: "walk", phase: i * 1.7, combo: 0, weapon: i === 0 ? "none" : "swordshield" });
      }
    }
    if (this.signalArray?.visible) this.signalArray.rotation.y = Math.sin(this.time * 0.16) * 0.16;
    if (this.sanctuaryBeacon?.visible) this.sanctuaryBeacon.rotation.y += dt * 0.08;
    if (this.stiltSkiff?.root.visible) {
      const a = this.time * 0.075;
      const x = -92 + Math.cos(a) * 24;
      const z = -262 + Math.sin(a) * 15;
      this.stiltSkiff.root.position.set(x, terrainHeight(x, z) + 0.35 + Math.sin(this.time * 1.3) * 0.12, z);
      this.stiltSkiff.root.rotation.y = Math.atan2(-Math.sin(a) * 24, Math.cos(a) * 15);
      this.stiltSkiff.root.rotation.z = Math.sin(this.time * 0.9) * 0.025;
      this.stiltSkiff.pole.rotation.z = -0.32 + Math.sin(this.time * 0.85) * 0.16;
      poseRig(this.stiltSkiff.rig, { dt, time: this.time, speed: 0, state: "idle", phase: 0.4, combo: 0, weapon: "none" });
    }
    if (this.miragePumps?.root.visible) {
      for (const [i, wheel] of this.miragePumps.wheels.entries()) wheel.rotation.z += dt * (i % 2 ? -1.4 : 1.4);
      for (const [i, piston] of this.miragePumps.pistons.entries()) piston.mesh.position.y = piston.baseY + Math.sin(this.time * 2.8 + i * Math.PI) * 0.38;
      this.miragePumps.waterMat.opacity = 0.62 + Math.sin(this.time * 3.2) * 0.1;
    }
    if (this.cloudGondola?.root.visible) {
      const phase = this.time * 0.11;
      const t = (Math.sin(phase) + 1) * 0.5;
      this.cloudGondola.curve.getPoint(t, this.cloudGondola.car.position);
      this.cloudGondola.car.rotation.z = Math.sin(this.time * 0.7) * 0.025;
      const spin = dt * (Math.cos(phase) >= 0 ? 1.5 : -1.5);
      for (const wheel of this.cloudGondola.wheels) wheel.rotation.x += spin;
    }
  }

  /** 'clear' | 'ash' | 'ember' — crossfades smoothly over a few seconds. */
  setWeather(kind: "clear" | "ash" | "ember") {
    this.weather = kind;
    this.ashTarget = kind === "ash" ? 1 : 0;
    this.emberTarget = kind === "ember" ? 1 : 0;
  }

  /** Push a position out of scene colliders. Returns adjusted x/z. */
  resolveColliders(x: number, z: number, radius: number): [number, number] {
    // Repeat because resolving one overlap can push the player into a nearby
    // trunk or wall. A deterministic normal also prevents a zero-distance
    // collision from leaving the player stuck at a collider's exact center.
    for (let pass = 0; pass < 5; pass++) {
      let moved = false;
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        let dx = x - c.x;
        let dz = z - c.z;
        let d = Math.hypot(dx, dz);
        const min = c.r + radius;
        if (d >= min) continue;
        if (d < 0.0001) {
          const angle = ((i * 2.399963229728653) % (Math.PI * 2));
          dx = Math.cos(angle);
          dz = Math.sin(angle);
          d = 1;
        }
        const push = (min - d + 0.001) / d;
        x += dx * push;
        z += dz * push;
        moved = true;
      }
      if (!moved) break;
    }

    const overlapScore = (px: number, pz: number) => {
      let score = 0;
      for (const c of this.colliders) {
        const penetration = c.r + radius - Math.hypot(px - c.x, pz - c.z);
        if (penetration > 0) score += penetration * penetration;
      }
      return score;
    };
    // Closely packed props can form overlapping circles with no clear radial
    // push direction. Search a small local ring for the nearest free point.
    if (overlapScore(x, z) > 0) {
      const originX = x;
      const originZ = z;
      let bestScore = overlapScore(x, z);
      let bestX = x;
      let bestZ = z;
      for (let distance = 0.5; distance <= 8 && bestScore > 0; distance += 0.5) {
        for (let i = 0; i < 24; i++) {
          const angle = (i / 24) * Math.PI * 2;
          const candidateX = originX + Math.cos(angle) * distance;
          const candidateZ = originZ + Math.sin(angle) * distance;
          if (Math.hypot(candidateX, candidateZ) > WORLD.wall - radius) continue;
          const score = overlapScore(candidateX, candidateZ);
          if (score < bestScore) {
            bestScore = score;
            bestX = candidateX;
            bestZ = candidateZ;
            if (score === 0) break;
          }
        }
      }
      x = bestX;
      z = bestZ;
    }
    const r = Math.hypot(x, z);
    if (r > WORLD.wall) {
      x = (x / r) * WORLD.wall;
      z = (z / r) * WORLD.wall;
    }
    return [x, z];
  }
}
