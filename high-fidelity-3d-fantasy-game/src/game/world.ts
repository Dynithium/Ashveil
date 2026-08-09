import * as THREE from "three";
import { BIOMES, WORLD, addPlatform, biomeWeights, fbm, makeRng, slopeAt, smoothstep, terrainHeight, terrainNormal } from "./terrain";

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
  sun!: THREE.DirectionalLight;
  moonDir = SUN_DIR.clone().multiplyScalar(-1);
  sunDir = SUN_DIR.clone();
  colliders: Collider[] = [];
  private skyMat!: THREE.ShaderMaterial;
  private windMats: THREE.Material[] = [];
  private shaderUniforms: { value: number }[] = [];
  private windUniforms: { value: number }[] = [];
  graceLight!: THREE.PointLight;
  braziers: { light: THREE.PointLight; base: number; phase: number }[] = [];
  treeGlow!: THREE.Mesh;
  graceShard?: THREE.Mesh;
  graceSites: { pos: THREE.Vector3; light: THREE.PointLight; shard: THREE.Mesh; name: string }[] = [];
  loreStones: { pos: THREE.Vector3; id: number; mesh: THREE.Mesh }[] = [];
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
    this.scene.fog = new THREE.FogExp2(0x2a2018, 0.0048);
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildSunderedTree();
    this.buildArena();
    this.buildCastle();
    this.buildVillages();
    this.buildRuins();
    this.buildFlora();
    this.buildBiomeProps();
    this.buildGrace();
    this.buildLoreStones();
    this.buildMist();
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
    this.scene.add(sky);
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
    const cFrost = new THREE.Color(0xcdd9e4);
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
    this.treeGlow = halo;

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

    const treeLight = new THREE.PointLight(0xffb45e, 8, 1400, 1.2);
    treeLight.position.set(0, 300, 0);
    group.add(treeLight);

    this.scene.add(group);

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
      const h = 10 + rng() * 22;
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
      // Only every other brazier carries a real light — dynamic lights are the
      // single most expensive thing in the scene, and the flame meshes read as
      // emissive anyway.
      if (i % 2 === 0) {
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
      const sw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, hi - lo), darkStone);
      sw.position.set(x0 + (x1 - x0) / 2 + (x0 < 0 ? (x1 - x0) / 2 : -(x1 - x0) / 2), (yA + yB) / 2 + 0.4, (lo + hi) / 2);
      sw.rotation.x = Math.atan2(yB - yA, hi - lo) * 0;
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
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffc879, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const winGeo = new THREE.PlaneGeometry(1.1, 2.2);
    for (const y of [K.base + 3.4, K.f2 + 3.4]) {
      for (const z of [113.5, 120, 126.5]) {
        for (const sx of [-1, 1]) {
          const w = new THREE.Mesh(winGeo, winMat);
          w.position.set(sx * (IX - 0.55), y, z);
          w.rotation.y = Math.PI / 2;
          this.scene.add(w);
        }
      }
      for (const x of [-6, 0, 6]) {
        const w = new THREE.Mesh(winGeo, winMat);
        w.position.set(x, y, Z1 - 0.55);
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
    this.braziers.push({ light: hearthA, base: 26, phase: 2.1 });
    const hearthB = new THREE.PointLight(0xffb066, 22, 26, 1.7);
    hearthB.position.set(0, K.f2 + 4.5, 120);
    this.scene.add(hearthB);
    this.braziers.push({ light: hearthB, base: 22, phase: 4.4 });
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
      const l = new THREE.PointLight(0xff8a2a, 10, 26, 1.7);
      l.position.set(x, y + (big ? 4.1 : 3.5), z);
      this.scene.add(l);
      this.braziers.push({ light: l, base: 10, phase: Math.random() * 6 });
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
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 40),
      new THREE.MeshStandardMaterial({ map: this.carpetTex(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(CX, terrainHeight(CX, 112) + 0.09, 107);
    carpet.receiveShadow = true;
    this.scene.add(carpet);
  }

  // ------------------------------ ruins ------------------------------------
  private buildVillages() {
    const sites = [
      { x: -118, z: 82, name: "Hearthmere" },
      { x: 126, z: 72, name: "Vowglass" },
      { x: -104, z: -96, name: "Briarwatch" },
    ];
    const stone = new THREE.MeshStandardMaterial({ color: 0x5a5042, roughness: 0.94, metalness: 0.03 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x3a2a1b, roughness: 0.98 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x2d2f36, roughness: 0.82, metalness: 0.1, flatShading: true });
    const gold = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });

    for (const [si, site] of sites.entries()) {
      const g = new THREE.Group();
      g.name = site.name;
      const rng = makeRng(9000 + si * 77);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng() * 0.4;
        const r = 7 + rng() * 12;
        const x = site.x + Math.cos(a) * r;
        const z = site.z + Math.sin(a) * r;
        const y = terrainHeight(x, z);
        const hut = new THREE.Group();
        hut.position.set(x, y, z);
        hut.rotation.y = rng() * Math.PI * 2;
        const w = 3.0 + rng() * 2.2;
        const d = 3.2 + rng() * 2.4;
        const h = 2.2 + rng() * 1.2;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i % 2 ? stone : timber);
        body.position.y = h / 2;
        body.castShadow = body.receiveShadow = true;
        hut.add(body);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.5, 4), roof);
        cap.position.y = h + 1.2;
        cap.rotation.y = Math.PI * 0.25;
        cap.castShadow = true;
        hut.add(cap);
        g.add(hut);
        this.colliders.push({ x, z, r: Math.max(w, d) * 0.45 });
      }

      // forge / upgrade altar at the center
      const y = terrainHeight(site.x, site.z);
      const anvil = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.65, 1.4), stone);
      anvil.position.set(site.x, y + 0.55, site.z);
      anvil.castShadow = anvil.receiveShadow = true;
      g.add(anvil);
      const sigil = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.35, 48), gold);
      sigil.rotation.x = -Math.PI / 2;
      sigil.position.set(site.x, y + 0.08, site.z);
      g.add(sigil);
      const light = new THREE.PointLight(0xffb56a, 10, 24, 1.8);
      light.position.set(site.x, y + 3.2, site.z);
      g.add(light);
      this.braziers.push({ light, base: 10, phase: si * 2.0 });

      // a few vertical landmarks so villages read on the horizon
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + si;
        const x = site.x + Math.cos(a) * 16;
        const z = site.z + Math.sin(a) * 16;
        const py = terrainHeight(x, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, 7.5, 6), timber);
        pole.position.set(x, py + 3.75, z);
        pole.castShadow = true;
        g.add(pole);
        const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), gold);
        flame.position.set(x, py + 7.7, z);
        g.add(flame);
      }
      this.scene.add(g);
    }
  }

  private buildRuins() {
    const rng = makeRng(777);
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
    this.scene.add(cols, blocks);

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
      this.scene.add(g);
      this.colliders.push({ x, z, r: 3 });
    }
  }

  // ------------------------------- flora -----------------------------------
  private buildFlora() {
    const rng = makeRng(31337);

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
    this.scene.add(trunks, branches);

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
      color: 0xbb9a48,
      side: THREE.DoubleSide,
      vertexColors: true,
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
    this.scene.add(grass);

    // --- glowing erdleaf flowers ---
    const flowerMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
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
    this.scene.add(flowers);
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
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.95 }),
    );
    shard.position.y = 1.1;
    shard.name = "graceShard";
    g.add(shard);

    for (let i = 0; i < 3; i++) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.9 + i * 0.75, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffc978, transparent: true, opacity: 0.14 - i * 0.035, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.position.y = 1.1;
      g.add(halo);
    }
    const l = new THREE.PointLight(0xffd28a, 9, 34, 1.5);
    l.position.y = 1.4;
    g.add(l);
    this.scene.add(g);

    const site = { pos: new THREE.Vector3(x, y, z), light: l, shard, name };
    this.graceSites.push(site);
    if (this.graceSites.length === 1) {
      this.graceShard = shard;
      this.graceLight = l;
    }
    return site;
  }

  private buildGrace() {
    // Home grace + a network of wayshrines that span the expanded world.
    // Ordered roughly by story progression.
    this.buildGraceAt(WORLD.graceAt.x, WORLD.graceAt.z, "Kingsfall Grace");         // 0 — spawn
    this.buildGraceAt(6, 30, "Roadside Grace");                                     // 1 — south road
    this.buildGraceAt(4, -40, "Cathedral Approach");                                // 2 — Malenkar arena
    // --- after Malenkar ---
    this.buildGraceAt(-160, 80, "Hearthmere Wayshrine");                            // 3 — west village
    this.buildGraceAt(-260, 60, "Cinderwood Grace");                                // 4 — Cinderwood biome
    this.buildGraceAt(-300, 30, "Ashen Colonnade");                                 // 5 — deep Cinderwood
    this.buildGraceAt(160, 30, "Vowglass Wayshrine");                               // 6 — east village
    this.buildGraceAt(250, -80, "Frostmourn Grace");                                // 7 — Frostmourn biome
    this.buildGraceAt(310, -140, "Choir's Bell — East");                            // 8 — Vetrahl arena
    this.buildGraceAt(-104, -140, "Briarwatch Wayshrine");                          // 9 — south village
    this.buildGraceAt(-80, -290, "Mirefen Grace");                                  // 10 — Mirefen biome
    this.buildGraceAt(-140, -340, "Choir's Bell — South");                          // 11 — Grull arena
    this.buildGraceAt(0, 300, "Beyond the Keep");                                   // 12 — hidden northern grove
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
        if (rng() < 0.5) {
          const l = new THREE.PointLight(0xff5a1a, 3.5, 12, 2);
          l.position.set(x, y + 6.2 * sc, z);
          this.scene.add(l);
        }
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
      const l = new THREE.PointLight(0x6a9a4a, 4, 30, 2);
      l.position.set(b.x, waterY + 2, b.z);
      this.scene.add(l);
    }
  }

  // --------------------------- lore stones ----------------------------------
  private buildLoreStones() {
    const spots: [number, number][] = [
      [-70, 96], [96, 54], [-142, -20], [64, -110], [-6, -150], [150, 30],
    ];
    const mat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x6fc6ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    spots.forEach(([x, z], id) => {
      const y = terrainHeight(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 1), mat.clone());
      stone.position.y = 1.3;
      stone.castShadow = true;
      g.add(stone);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), haloMat.clone());
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
    this.scene.add(mesh);
  }

  // ------------------------------ update -----------------------------------
  update(dt: number, camPos: THREE.Vector3) {
    this.time += dt;
    this.skyMat.uniforms.uTime.value = this.time;
    for (const u of this.shaderUniforms) u.value = this.time; // wind sway only — no extra bloom

    // ---------------------------- day / night -------------------------------
    this.dayPhase = (this.dayPhase + dt / World.DAY_LENGTH) % 1;
    const angle = this.dayPhase * Math.PI * 2;
    this.sunDir.set(Math.cos(angle) * 0.92, Math.sin(angle) * 0.92 + 0.14, -0.82).normalize();
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
      site.light.intensity = 9 + Math.sin(this.time * 1.8 + site.pos.x) * 2.2;
      site.shard.rotation.y = this.time * 0.9;
      site.shard.rotation.x = Math.sin(this.time * 0.7) * 0.25;
      site.shard.position.y = 1.1 + Math.sin(this.time * 1.4 + site.pos.z) * 0.12;
    }
    for (const stone of this.loreStones) {
      stone.mesh.rotation.y = this.time * 0.5 + stone.id;
      stone.mesh.position.y = 1.3 + Math.sin(this.time * 1.1 + stone.id * 2) * 0.1;
    }
  }

  /** 'clear' | 'ash' | 'ember' — crossfades smoothly over a few seconds. */
  setWeather(kind: "clear" | "ash" | "ember") {
    this.weather = kind;
    this.ashTarget = kind === "ash" ? 1 : 0;
    this.emberTarget = kind === "ember" ? 1 : 0;
  }

  /** Push a position out of static colliders. Returns adjusted x/z. */
  resolveColliders(x: number, z: number, radius: number): [number, number] {
    for (const c of this.colliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 0.0001) {
        const push = (min - d) / d;
        x += dx * push;
        z += dz * push;
      }
    }
    const r = Math.hypot(x, z);
    if (r > WORLD.wall) {
      x = (x / r) * WORLD.wall;
      z = (z / r) * WORLD.wall;
    }
    return [x, z];
  }
}

export { terrainHeight, terrainNormal };
