import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { World } from "./world";
import { WORLD, groundAt, insideKeep, terrainHeight } from "./terrain";
import { NPC, Player, WEAPON_CONFIG, type GameCtx, type PlayerInput, type ProjectileOpts } from "./actors";
import { AmbientEmbers, Particles, Shockwaves, SwordTrail } from "./vfx";
import { audio } from "./audio";
import { buildRig, poseRig, type Rig } from "./rig";

// ---------------------------------------------------------------------------
// Quest script
// ---------------------------------------------------------------------------
const DIALOGUE: Record<string, string[]> = {
  // -------- PROLOGUE — training in the keep --------
  intro: [
    "So. Another ember crosses the veil, and finds my hall instead of a grave. Welcome, Ashbearer.",
    "I am Aldric — last king of a burnt crown. My knights are ash, my walls are memory held up by stubbornness.",
    "Long ago the Sundered Tree gave its Flame to warm the world. Then MALENKAR, my First Knight, tore that Flame from its roots and fled beneath the cathedral to the south.",
    "But Malenkar is only the beginning. He was the first to steal fire. He will not be the last thing you meet.",
    "Climb my keep. The western stair to the HALL OF BLADES. Then the eastern stair, to the TERRACE OF TRIALS.",
    "Only then take the road south. And whatever happens beneath that cathedral, Ashbearer — come back to me. There is far more you must know.",
  ],
  blades: [
    "The HALL OF BLADES is up the western stair — two effigies still stand.",
    "Strike with LEFT CLICK — three blows chain together. Hold E for a heavy blow that breaks a guard.",
    "You may carry three arms — press 1 for the Greatsword, 2 for Twin Blades, 3 for the Halberd. Each fights in its own tongue.",
  ],
  arcane: [
    "Good. Your arm remembers. Now the eastern stair, to the third floor — the TERRACE OF TRIALS.",
    "A warded effigy waits beneath the open sky. Steel will not serve; press Q and throw the Sundered Bolt at it.",
  ],

  // -------- ACT I — go kill Malenkar --------
  south: [
    "The cathedral lies SOUTH, through my gate and down the ash fields. Follow the golden beacon.",
    "Malenkar broke the Flame into shards when he fled. Some he keeps. Others were taken by things that no longer wear names I recognize.",
    "Rest at any Grace to mend — and press M to open the map, that you may travel between Graces you have found. My lands are wider than they look.",
    "Do not underestimate him. Even a shard of the Flame will burn a mortal to soot.",
  ],
  midjourney: [
    "You still breathe. Good. I can feel the shard he carries from here — it hums against my throne.",
    "Malenkar grows desperate as you near. When his flame gutters low, he will NOT die quietly. Brace yourself.",
    "Bring me what he stole. Then we will speak of what comes after.",
  ],

  // -------- ACT II opening — the world revealed --------
  ret: [
    "The air... warms. Malenkar is ash. I felt him fall from a hundred leagues off.",
    "Now listen, Ashbearer, for I have lied to you by omission. Malenkar was not a traitor. He was a THIEF, yes — but he stole to keep the Flame from something worse.",
    "The Sundered Flame was never OUR fire. It was forged, long ago, by three things called THE CHOIR. Three of them. They sang the world into shape and lit it with their song.",
    "Then they slept. And humankind woke, and warmed itself at their embers, and forgot.",
    "The Choir is waking. They want their fire back. Malenkar tried to hide it from them; that is why he fled south. Now that he is dead, the shards have scattered again — and TWO of the Choir have already claimed them.",
    "VETRAHL, the Hoarfrost Chorister, has taken the eastern shard. Her tower stands in the frozen reach — you will see her breath from miles.",
    "GRULL, Maw of the Mire, has swallowed the southern shard. He rots in the deep swamp. Do not fight him standing in the water.",
    "Take my runes, take my map, take my blessing. Slay them both — bring their shards home — and I will tell you the last, worst truth.",
    "Now GO. The Choir does not wait, and neither will I.",
  ],

  // -------- Reminders while questing in acts II/III --------
  huntChoir: [
    "Vetrahl in the east. Grull in the south. Their marks glow on your map, Ashbearer.",
    "One is a matter of patience; the other, of footing. Which you fight first is up to you.",
  ],
  oneChoirLeft: [
    "One of the Choir sings still. Finish it. The Flame grows restless in my keep.",
    "You have felt it, have you not? The world dims. The stars come earlier. That is them, calling their fire home.",
  ],

  // -------- ACT IV — the true ending --------
  bothChoirDown: [
    "Both. You brought me BOTH shards. Even I did not think you would.",
    "So. The final truth. Sit — or stand, as you like. It changes nothing.",
    "I am not the last king of a dead land. I am what the Choir left BEHIND when they slept.",
    "A crown they placed on a corpse, to keep the world running while they dreamed. I have worn it so long I began to believe it was my face.",
    "Every shard you carried back — I have drunk. I did not want to. I could not stop myself.",
    "The Flame is nearly whole again, and it burns in my chest, and it is HUNGRY, Ashbearer. It wants to sing.",
    "So I ask you a kindness. Draw your blade. Come to the throne. End what the Choir began — and free me, if you can.",
    "One last fight. In my hall, where it began. Come when you are ready.",
  ],

  // -------- After the final boss --------
  epilogue: [
    "You have killed a king, an ember, and a memory. The Ashveil is quiet at last.",
    "Wander it as you please. The Graces are yours. The Flame is yours to keep, or to scatter.",
    "I hope you scatter it. But that is no longer my choice.",
  ],
  done: [
    "There is nothing left for a king to say. Rest, Ashbearer. The world is yours.",
  ],
};

// 8 stages now — prologue, act 1, act 2 (two bosses in any order), act 4, epilogue.
const OBJECTIVES = [
  "Speak with King Aldric in the throne hall",                                    // 0
  "Hall of Blades — destroy 2 straw effigies",                                    // 1
  "Terrace of Trials — break the warded effigy with sorcery (Q)",                 // 2
  "Slay Malenkar in the Sunken Cathedral, far south",                             // 3
  "Return to King Aldric with the Flame",                                         // 4
  "Hunt the Choir — Vetrahl in the east, Grull in the south",                     // 5
  "One Chorister remains — finish the hunt",                                      // 6
  "Return to King Aldric — the Choir is dead",                                    // 7
  "Slay Aldric, the Hollow Crown, upon his throne",                               // 8
  "The Ashveil is silent. Wander at your leisure",                                // 9
];

/** Contextual coaching shown under the objective. */
const HINTS = [
  "Walk with W A S D · Press F to speak",
  "LEFT CLICK chains 3 slashes · E is a heavy blow · 1/2/3 swap weapons",
  "Q casts the Sundered Bolt · SPACE dodges · HOLD RIGHT CLICK to guard",
  "M opens the map · rest at any Grace to travel · SHIFT sprints",
  "Return north to the keep · press F at the throne",
  "Two Choir bosses · fight in any order · press M for the map",
  "Return to whichever boss still lives · your map shows the way",
  "The King awaits at the throne · press F to speak",
  "The Hollow Crown — 2 phases · flee to a Grace if wounded",
  "Press M to fast-travel · the world is yours",
];

/** Readable monoliths scattered across the world — worldbuilding + runes. */
const LORE_STONES: { title: string; body: string[] }[] = [
  { title: "STONE OF THE FIRST SONG", body: [
    "\"Before the world had a shape, three voices sang it into form. They named themselves nothing, for there was nothing to name them against.\"",
    "\"We call them THE CHOIR now, because we need a name for what we broke.\"",
  ] },
  { title: "STONE OF THE SUNDERED TREE", body: [
    "\"The Choir grew tired of singing and set their fire in a tree, that it might warm the world without them. Then they slept.\"",
    "\"Humankind woke, warmed itself, and forgot who lit the hearth.\"",
  ] },
  { title: "STONE OF THE BURNT CROWN", body: [
    "\"Aldric was crowned in flame and swore to keep it. Some say the coal held him. Some say he swallowed it whole.\"",
    "\"None can now tell where the king ends and the ember begins.\"",
  ] },
  { title: "STONE OF THE FIRST KNIGHT", body: [
    "\"Malenkar was not a traitor. Malenkar was a THIEF, and the difference matters — for he stole from a hand already reaching to steal it back.\"",
    "\"The court called him faithless. The Choir call him prey. Choose which name to carve.\"",
  ] },
  { title: "STONE OF VETRAHL, HOARFROST", body: [
    "\"The eastern Chorister was the youngest voice. Her song made ice, that the world might have a season to sleep in.\"",
    "\"Now she keeps a shard of the Flame in a tower of frost, and hums the season endlessly, and will not wake.\"",
  ] },
  { title: "STONE OF GRULL, MAW OF MIRE", body: [
    "\"The southern Chorister sang of rot, that death should make room for new life. He swallowed a shard whole to keep it safe.\"",
    "\"Do not fight him where the ground is wet. Do not fight him where you cannot run.\"",
  ] },
  { title: "STONE OF THE THIRD VOICE", body: [
    "\"There were three of them. Only two ever left the deep.\"",
    "\"The third stayed behind. Or the third walked ahead. The Choir does not agree, and the third does not speak.\"",
  ] },
  { title: "STONE OF THE HOLLOW CROWN", body: [
    "\"When the Choir slept they placed a crown on a corpse, that a king might walk their world for them.\"",
    "\"That king still walks. He calls himself Aldric. Do not eat at his table. Do not accept his runes.\"",
    "\"Every ember you carry to his throne, he swallows.\"",
  ] },
];


export type QualityLevel = "ultralow" | "low" | "medium" | "high" | "xhigh";

export const QUALITY_PRESETS: Record<QualityLevel, {
  label: string;
  short: string;
  desc: string;
  pixelRatio: number;
  shadowSize: number;
  bloom: number;
  adaptive: boolean;
  particles: number;
  embers: number;
  grass: boolean;
  mist: boolean;
  shadows: boolean;
}> = {
  ultralow: {
    label: "ULTRA LOW",
    short: "POTATO",
    desc: "Max FPS · no shadows · low res · for netbooks",
    pixelRatio: 0.55,
    shadowSize: 256,
    bloom: 0.0,
    adaptive: false,
    particles: 0.35,
    embers: 0.2,
    grass: false,
    mist: false,
    shadows: false,
  },
  low: {
    label: "LOW",
    short: "LUMEN",
    desc: "High FPS · soft shadows",
    pixelRatio: 0.8,
    shadowSize: 512,
    bloom: 0.18,
    adaptive: true,
    particles: 0.6,
    embers: 0.5,
    grass: true,
    mist: false,
    shadows: true,
  },
  medium: {
    label: "MEDIUM",
    short: "EMBER",
    desc: "Balanced · recommended",
    pixelRatio: 1.2,
    shadowSize: 1024,
    bloom: 0.38,
    adaptive: true,
    particles: 0.85,
    embers: 0.8,
    grass: true,
    mist: true,
    shadows: true,
  },
  high: {
    label: "HIGH",
    short: "FLAME",
    desc: "Crisp · PC gaming",
    pixelRatio: 1.5,
    shadowSize: 1536,
    bloom: 0.46,
    adaptive: true,
    particles: 1.0,
    embers: 1.0,
    grass: true,
    mist: true,
    shadows: true,
  },
  xhigh: {
    label: "X-HIGH",
    short: "SUNDERED",
    desc: "Cinematic · melts GPU",
    pixelRatio: 2.0,
    shadowSize: 2048,
    bloom: 0.58,
    adaptive: false,
    particles: 1.2,
    embers: 1.2,
    grass: true,
    mist: true,
    shadows: true,
  },
};

export const QUALITY_ORDER: QualityLevel[] = ["ultralow","low","medium","high","xhigh"];


export interface DialogueState {
  speaker: string;
  lines: string[];
  idx: number;
}

// ---------------------------------------------------------------------------
// Cinematic grade pass
// ---------------------------------------------------------------------------
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAberr: { value: 0.0016 },
    uVignette: { value: 1.05 },
    uDamage: { value: 0 },
    uGrace: { value: 0 },
    uDeath: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberr, uVignette, uDamage, uGrace, uDeath;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }

    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // barrel + damage pull
      float pull = uDamage * 0.035;
      uv = 0.5 + c * (1.0 - pull + r2 * 0.02);

      // chromatic aberration
      float ab = uAberr * (1.0 + uDamage * 7.0) * (1.0 + r2 * 2.4);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      // filmic grade: crush blacks toward blue, lift highs toward gold
      col = pow(max(col, 0.0), vec3(1.02, 1.0, 0.99));
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.055, 0.062, 0.10);
      vec3 highTint  = vec3(1.06, 0.99, 0.88);
      col = mix(col * (1.0 - 0.28) + shadowTint * 0.28, col * highTint, smoothstep(0.06, 0.72, lum));
      col = mix(vec3(lum), col, 1.14); // saturation

      // grace bloom wash
      col += vec3(1.0, 0.78, 0.42) * uGrace * (0.20 + 0.30 * (1.0 - r2));

      // damage vignette
      col = mix(col, vec3(0.55, 0.03, 0.02), uDamage * smoothstep(0.02, 0.35, r2) * 0.85);

      // death desaturation
      col = mix(col, vec3(dot(col, vec3(0.299,0.587,0.114))) * vec3(1.05,0.86,0.78), uDeath);

      // vignette
      float vig = 1.0 - uVignette * r2 * (0.85 + r2 * 0.9);
      col *= clamp(vig, 0.0, 1.0);

      // film grain
      float g = hash(vUv * uRes + fract(uTime) * 411.0);
      col += (g - 0.5) * 0.035;

      gl_FragColor = vec4(col, 1.0);
    }`,
};

// ---------------------------------------------------------------------------
export interface Popup {
  id: number;
  text: string;
  kind: string;
  x: number;
  y: number;
  born: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  fp: number;
  maxFp: number;
  flasks: number;
  maxFlasks: number;
  runes: number;
  target: { name: string; hp: number; maxHp: number } | null;
  boss: { name: string; hp: number; maxHp: number; phase: number } | null;
  prompt: string | null;
  lockOn: { x: number; y: number } | null;
  enemiesLeft: number;
  fps: number;
  bloodstain: number;
  banner: { title: string; sub?: string; id: number } | null;
  dead: boolean;
  victory: boolean;
  victoryShown: boolean;
  victoryName: string;
  quality: QualityLevel;
  paused: boolean;
  started: boolean;
  area: string;
  popups: Popup[];
  objective: string;
  hint: string;
  marker: { x: number; y: number; dist: number } | null;
  dialogue: DialogueState | null;
  upgrades: { blade: number; vigor: number; arcane: number };
  combo: number;
  weapon: string;
  mapOpen: boolean;
  map: {
    player: { x: number; z: number; yaw: number };
    villages: { name: string; x: number; z: number; level: number; available: boolean }[];
    bosses: { name: string; x: number; z: number; main: boolean; dead: boolean }[];
    graces: { name: string; x: number; z: number; discovered: boolean; active: boolean; idx: number }[];
    marker: { x: number; z: number } | null;
  };
}

interface Village {
  name: string;
  x: number;
  z: number;
  type: "blade" | "vigor" | "arcane";
  level: number;
  costs: number[];
}

type Listener = (s: HudState) => void;

interface Projectile {
  mesh: THREE.Mesh;
  lightIdx: number;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  radius: number;
  fromPlayer: boolean;
  explode: number;
  color: number;
  gravity: number;
  dead: boolean;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  world: World;
  composer!: EffectComposer;
  bloom!: UnrealBloomPass;
  grade!: ShaderPass;

  player: Player;
  enemies: NPC[] = [];
  boss!: NPC;
  particles = new Particles(2400);
  waves = new Shockwaves();
  embers = new AmbientEmbers(700);

  projectiles: Projectile[] = [];
  popups: Popup[] = [];
  private popupId = 0;

  // camera state
  camYaw = Math.PI;
  camPitch = 0.16;
  camDist = 6.4;
  camTargetDist = 6.4;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  lockTarget: NPC | null = null;

  // timing
  private clock = new THREE.Clock();
  time = 0;
  timeScale = 1;
  private slowmoT = 0;
  private slowmoScale = 1;
  private hitStopT = 0;
  private shakeAmt = 0;
  private shakeT = 0;
  private damageFx = 0;
  private graceFx = 0;
  private deathFx = 0;
  private fps = 60;
  private fpsAcc = 0;
  private fpsCount = 0;
  private basePixelRatio = 1.5;
  private quality = 1;
  private qualityCooldown = 3;
  qualityLevel: QualityLevel = (typeof localStorage !== "undefined" && localStorage.getItem("ashveil_quality") as QualityLevel) || "medium";
  private qualityManual = typeof localStorage !== "undefined" && !!localStorage.getItem("ashveil_quality");
  private lightPool: THREE.PointLight[] = [];
  private lightBusy: boolean[] = [];
  effigies: NPC[] = [];
  private effigyKills = { blade: 0, arcane: 0 };
  villages: Village[] = [
    { name: "Hearthmere Forge", x: -118, z: 82, type: "blade", level: 0, costs: [700, 1800, 4200] },
    { name: "Vowglass Shrine", x: 126, z: 72, type: "vigor", level: 0, costs: [650, 1700, 3900] },
    { name: "Briarwatch Scriptorium", x: -104, z: -96, type: "arcane", level: 0, costs: [800, 2100, 4800] },
  ];
  upgrades = { blade: 0, vigor: 0, arcane: 0 };
  regionalBosses: NPC[] = [];
  hollowCrown!: NPC;
  private crownAwakened = false;
  private streamAcc = 0;
  discoveredGraces = new Set<number>();
  activeGraceIdx = 0;
  mapOpen = false;
  loreRead = new Set<number>();

  // flow
  paused = false;
  started = false;
  running = true;
  dead = false;
  victory = false;
  victoryShown = false;
  victoryName = "MALENKAR, THE SUNDERED FLAME";
  private victoryDismissed = false;
  private victoryAt = -999;
  private respawnTimer = 0;
  private bossAwake = false;
  private bannerId = 0;
  private banner: { title: string; sub?: string; id: number } | null = null;
  private bannerT = 0;
  bloodstain: { pos: THREE.Vector3; runes: number; mesh: THREE.Mesh } | null = null;
  private prompt: string | null = null;
  // combo system
  private comboCount = 0;
  private comboTimer = 0;
  private comboBest = 0;

  // quest / king
  questStage = 0;
  dialogue: DialogueState | null = null;
  private dialogueKind: string = "intro";
  private king!: Rig;
  private kingPos = new THREE.Vector3();
  private kingYaw = Math.PI;
  private beacon!: THREE.Group;
  private beaconTarget = new THREE.Vector3();
  private beaconMats: THREE.MeshBasicMaterial[] = [];

  private keys: Record<string, boolean> = {};
  private mouse = { left: false, right: false };
  private attackBuffer = 0;
  private heavyBuffer = 0;
  private rollBuffer = 0;
  private castBuffer = 0;
  private healBuffer = 0;
  private interactBuffer = 0;

  private listeners: Listener[] = [];
  private container: HTMLElement;
  private disposed = false;
  private lastHud = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", stencil: false });
    this.basePixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(58, container.clientWidth / container.clientHeight, 0.1, 3000);

    this.world = new World();
    const scene = this.world.scene;

    // subtle IBL so armour reads as metal
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    (scene as any).environmentIntensity = 0.30;
    pmrem.dispose();

    scene.add(this.particles.points, this.waves.group, this.embers.points);

    // ---- player ----
    this.player = new Player();
    this.player.trail = new SwordTrail(24, 0xbfe4ff);
    scene.add(this.player.trail.mesh);
    scene.add(this.player.rig.root);
    // spawn just inside the keep's great doors, facing the throne
    this.player.pos.set(0, this.world.keep.base, 112.5);
    this.player.yaw = 0;

    this.initLightPool();
    this.buildKing();
    this.buildBeacon();
    this.spawnEnemies();
    this.spawnEffigies();
    this.setupPost();
    this.bindEvents();

    this.camYaw = Math.PI;
    this.updateCamera(0, true);
    this.renderer.compile(scene, this.camera);
    // apply saved quality (no banner at boot)
    try {
      const q = (typeof localStorage !== "undefined" && localStorage.getItem("ashveil_quality") as any) || "medium";
      if ((QUALITY_PRESETS as any)[q]) this.qualityLevel = q as any;
      const preset = QUALITY_PRESETS[this.qualityLevel];
      if (preset) {
        this.basePixelRatio = Math.min(window.devicePixelRatio, preset.pixelRatio);
        const pr = this.basePixelRatio * this.quality;
        this.renderer.setPixelRatio(pr);
        this.composer?.setPixelRatio(pr);
        if (this.world.sun) {
          this.world.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
          this.world.sun.castShadow = preset.shadows;
          this.renderer.shadowMap.enabled = preset.shadows;
        }
        if (this.bloom) this.bloom.strength = preset.bloom;
      }
    } catch {}

  }

  // ------------------------------------------------------------------ setup
  private setupPost() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.world.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.28, 0.22);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uRes.value.set(w, h);
    this.composer.addPass(this.grade);
  }

  private spawnEnemies() {
    const scene = this.world.scene;
    const place = (kind: "wretch" | "warden", x: number, z: number) => {
      const n = new NPC(kind);
      n.pos.set(x, terrainHeight(x, z), z);
      n.yaw = Math.random() * 6.28;
      if (kind === "warden") {
        n.trail = new SwordTrail(16, 0xffd9a0);
        scene.add(n.trail.mesh);
      }
      scene.add(n.rig.root);
      this.enemies.push(n);
      return n;
    };

    const spots: [("wretch" | "warden"), number, number][] = [
      ["wretch", 12, 76], ["wretch", -16, 70], ["wretch", 26, 60],
      ["warden", -4, 62],
      ["wretch", -38, 44], ["wretch", -46, 30], ["warden", 44, 34],
      ["wretch", 58, 8], ["wretch", 66, -14], ["warden", -62, -6],
      ["wretch", -30, -58], ["wretch", 18, -70], ["warden", 34, -62],
      ["wretch", 84, 46], ["wretch", -84, 40], ["wretch", 46, 92],
      ["warden", -74, -52], ["wretch", 92, -34],
    ];
    for (const [k, x, z] of spots) place(k, x, z);

    void 0;
    // ---- the boss ----
    const b = new NPC("boss");
    b.pos.set(0, terrainHeight(0, -18), -18);
    b.yaw = 0;
    b.trail = new SwordTrail(28, 0xff8a2a);
    scene.add(b.trail.mesh);
    scene.add(b.rig.root);
    this.enemies.push(b);
    this.boss = b;

    // ------- The Choir — Act II bosses --------
    // Vetrahl (east, Frostmourn) and Grull (south, Mirefen). Both are required
    // to complete Act II; killing either advances the quest, killing both opens
    // the final act.
    const regional: { name: string; x: number; z: number; hp: number; trail: number; runes: number }[] = [
      { name: "VETRAHL, THE HOARFROST CHORISTER", x: 310, z: -140, hp: 3400, trail: 0x9fd8ff, runes: 12000 },
      { name: "GRULL, MAW OF THE MIRE", x: -140, z: -340, hp: 3800, trail: 0x9be07a, runes: 12000 },
    ];
    for (const spec of regional) {
      const r = new NPC("boss");
      r.bossRole = "regional";
      r.name = spec.name;
      r.maxHp = r.hp = spec.hp;
      r.runeValue = spec.runes;
      r.radius = 1.75;
      r.centerY = 1.15;
      r.moveSpeed = 4.6;
      r.attackRange = 6.0;
      r.aggroRange = 40;
      r.maxPoise = 170;
      r.scale = 2.3;
      r.pos.set(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      r.yaw = Math.random() * Math.PI * 2;
      r.trail = new SwordTrail(24, spec.trail);
      scene.add(r.trail.mesh);
      scene.add(r.rig.root);
      // Recolor accent to match the biome — costs nothing since the rig is procedural
      for (const m of r.rig.flashMats) {
        m.color.multiplyScalar(0.75);
        m.color.offsetHSL(spec.trail === 0x9fd8ff ? 0.6 : 0.3, 0.05, 0);
      }
      this.enemies.push(r);
      this.regionalBosses.push(r);
    }

    // ------- Hollow Crown — Act IV boss, hidden inside the throne room -------
    const crown = new NPC("boss");
    crown.bossRole = "hollowCrown";
    crown.name = "ALDRIC, THE HOLLOW CROWN";
    crown.maxHp = crown.hp = 5200;
    crown.runeValue = 50000;
    crown.radius = 1.9;
    crown.centerY = 1.25;
    crown.moveSpeed = 5.2;
    crown.attackRange = 6.4;
    crown.aggroRange = 8; // only wakes on player getting very close
    crown.maxPoise = 240;
    crown.scale = 2.6;
    crown.dormant = true; // won't act until the story unlocks him
    crown.pos.set(WORLD.kingAt.x + 40, terrainHeight(WORLD.kingAt.x + 40, WORLD.kingAt.z + 40), WORLD.kingAt.z + 40);
    crown.rig.root.visible = false;
    crown.yaw = 0;
    crown.trail = new SwordTrail(28, 0xffb066);
    scene.add(crown.trail.mesh);
    scene.add(crown.rig.root);
    for (const m of crown.rig.flashMats) {
      m.color.offsetHSL(0, 0.15, 0);
    }
    this.enemies.push(crown);
    this.hollowCrown = crown;
  }

  // ------------------------------------------------------- tutorial effigies
  private spawnEffigies() {
    const K = this.world.keep;
    const make = (x: number, y: number, z: number, tag: string, hp: number, name: string) => {
      const n = new NPC("wretch");
      n.passive = true;
      n.tutorialTag = tag;
      n.maxHp = n.hp = hp;
      n.runeValue = 0;
      n.name = name;
      n.aggroRange = 0;
      n.pos.set(x, y, z);
      n.yaw = Math.PI;
      // effigies read as straw-and-timber, not living foes
      for (const m of n.rig.flashMats) {
        m.color.multiplyScalar(0.62);
        m.color.offsetHSL(0.02, -0.18, 0.04);
      }
      this.world.scene.add(n.rig.root);
      this.enemies.push(n);
      this.effigies.push(n);

      // wooden post behind it
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x3d2c1d, roughness: 0.96 }),
      );
      post.position.set(x, y + 1.3, z + 0.55);
      post.castShadow = true;
      this.world.scene.add(post);
      return n;
    };

    // ---- Hall of Blades (2nd floor) ----
    make(-3.4, K.f2, 121, "blade", 70, "Straw Effigy");
    make(3.4, K.f2, 121, "blade", 70, "Straw Effigy");

    // ---- Terrace of Trials (3rd floor) ----
    const arc = make(0, K.f3, 122, "arcane", 90, "Warded Effigy");
    // a shimmering ward that only sorcery should break
    const ward = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x6fc6ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ward.position.y = 1.1;
    arc.rig.root.add(ward);
  }

  // ------------------------------------------------------------- king/quest
  private buildKing() {
    this.king = buildRig({
      scale: 1.06,
      bulk: 1.04,
      armor: 0x71603c,
      armorDark: 0x2e2718,
      cloth: 0x431640,
      accent: 0xffd27a,
      accentIntensity: 2.0,
      weapon: "none",
      cape: true,
      crown: true,
    });
    const { x, z } = WORLD.kingAt;
    this.kingPos.set(x, terrainHeight(x, z), z);
    this.king.root.position.copy(this.kingPos);
    this.kingYaw = Math.PI;
    this.king.root.rotation.y = this.kingYaw;
    this.world.scene.add(this.king.root);
    this.world.colliders.push({ x, z, r: 1.0 });

    const halo = new THREE.PointLight(0xffd9a0, 4, 12, 2);
    halo.position.y = 2.4;
    this.king.root.add(halo);
  }

  private buildBeacon() {
    this.beacon = new THREE.Group();
    const mk = (r: number, color: number, op: number) => {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      this.beaconMats.push(mat);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.35, 95, 12, 1, true), mat);
      this.beacon.add(mesh);
      return mesh;
    };
    mk(1.4, 0xffca70, 0.16);
    mk(0.5, 0xfff0c8, 0.4);
    this.beacon.renderOrder = 6;
    this.world.scene.add(this.beacon);
    this.syncBeacon();
  }

  private syncBeacon() {
    const K = this.world.keep;
    const kingAt = { x: WORLD.kingAt.x, y: K.base, z: WORLD.kingAt.z - 2.4 };
    let t: { x: number; y: number; z: number } | null;
    switch (this.questStage) {
      case 0: t = kingAt; break;
      case 1: t = { x: 0, y: K.f2, z: 121 }; break;
      case 2: t = { x: 0, y: K.f3, z: 122 }; break;
      case 3: t = { x: 0, y: terrainHeight(0, -10), z: -10 }; break;
      case 4: t = kingAt; break;
      case 5:
      case 6: {
        // Point at whichever Choir boss is still alive (nearest one).
        const alive = this.regionalBosses.filter((b) => !b.dead);
        if (alive.length === 0) { t = kingAt; break; }
        alive.sort((a, b) =>
          Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z) -
          Math.hypot(b.pos.x - this.player.pos.x, b.pos.z - this.player.pos.z));
        const b = alive[0];
        t = { x: b.pos.x, y: terrainHeight(b.pos.x, b.pos.z), z: b.pos.z };
        break;
      }
      case 7: t = kingAt; break;
      case 8: t = { x: this.hollowCrown.pos.x, y: this.hollowCrown.pos.y, z: this.hollowCrown.pos.z }; break;
      default: t = null;
    }
    if (!t) {
      this.beacon.visible = false;
      return;
    }
    this.beacon.visible = true;
    this.beaconTarget.set(t.x, t.y, t.z);
    // Indoors: short pillar. Outdoors: full 46-tall beam that punches sky.
    const indoor = this.questStage < 3 || this.questStage === 4 || this.questStage === 7 || this.questStage === 8;
    this.beacon.scale.set(1, indoor ? 0.055 : 1, 1);
    this.beacon.position.set(t.x, t.y + (indoor ? 2.6 : 46), t.z);
  }

  private awakenHollowCrown() {
    if (this.crownAwakened) return;
    this.crownAwakened = true;
    const c = this.hollowCrown;
    c.dormant = false;
    c.rig.root.visible = true;
    // Rise in the throne room, in front of the throne.
    c.pos.set(WORLD.kingAt.x, terrainHeight(WORLD.kingAt.x, WORLD.kingAt.z - 5), WORLD.kingAt.z - 5);
    c.rig.root.position.copy(c.pos);
    c.yaw = 0;
    c.rig.root.rotation.y = 0;
    c.aggro = true;
    // Wither the king NPC away (he collapses into the boss's ember form)
    this.king.root.visible = false;
    audio.roar();
    this.shakeAmt = Math.max(this.shakeAmt, 1.2);
    this.shakeT = Math.max(this.shakeT, 1.4);
  }

  private startDialogue(kind: string) {
    this.dialogueKind = kind;
    this.dialogue = { speaker: "KING ALDRIC", lines: DIALOGUE[kind] ?? DIALOGUE.done, idx: 0 };
    audio.ui("click");
    this.emit();
  }

  advanceDialogue() {
    if (!this.dialogue) return;
    audio.ui("click");
    this.dialogue.idx++;
    if (this.dialogue.idx >= this.dialogue.lines.length) {
      const kind = this.dialogueKind;
      this.dialogue = null;
      if (kind === "intro") {
        this.questStage = 1;
        this.syncBeacon();
        this.showBanner("THE HALL OF BLADES", "Climb the western stair");
      } else if (kind === "ret") {
        // Act II unlocked — go hunt the two Choir bosses.
        this.questStage = 5;
        this.player.runes += 8000;
        this.syncBeacon();
        this.showBanner("THE CHOIR AWAKENS", "Hunt Vetrahl in the east and Grull in the south");
        audio.grace();
      } else if (kind === "bothChoirDown") {
        // Act IV — Hollow Crown awakens.
        this.questStage = 8;
        this.awakenHollowCrown();
        this.syncBeacon();
        this.showBanner("ALDRIC, THE HOLLOW CROWN", "The king rises from his throne");
        audio.setIntensity(1);
      } else if (kind === "epilogue") {
        this.questStage = 9;
        this.syncBeacon();
      }
    }
    this.emit();
  }

  private updateKing(dt: number) {
    const p = this.player;
    const dx = p.pos.x - this.kingPos.x;
    const dz = p.pos.z - this.kingPos.z;
    const dist = Math.hypot(dx, dz);
    // face the player when near
    const want = dist < 12 ? Math.atan2(dx, dz) : Math.PI;
    let d = ((want - this.kingYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    this.kingYaw += d * Math.min(1, dt * 3);
    this.king.root.rotation.y = this.kingYaw;
    poseRig(this.king, {
      dt,
      time: this.time,
      speed: 0,
      state: this.dialogue ? "guard" : "idle",
      phase: 0.5,
      combo: 0,
    });
    // regal idle: no combat stance while talking — override arms downward
    if (this.dialogue) {
      this.king.shoulderL.rotation.x = -0.9;
      this.king.shoulderL.rotation.z = 0.45;
      this.king.elbowL.rotation.x = -1.1;
      this.king.shoulderR.rotation.x = -0.25;
      this.king.shoulderR.rotation.z = -0.25;
      this.king.elbowR.rotation.x = -0.4;
      this.king.torso.rotation.y = 0;
    }
  }

  // ----------------------------------------------------------------- events
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    this.keys[k] = true;
    if (this.dialogue && (k === "f" || k === " " || k === "enter")) {
      e.preventDefault();
      this.advanceDialogue();
      return;
    }
    if (k === " ") { this.rollBuffer = 0.22; e.preventDefault(); }
    if (k === "e") this.heavyBuffer = 0.22;
    if (k === "q") this.castBuffer = 0.22;
    if (k === "r") this.healBuffer = 0.22;
    if (k === "f") this.interactBuffer = 0.3;
    if (k === "tab" || k === "t" || k === "v") { e.preventDefault(); if (this.started && !this.paused && !this.dead && !this.victoryShown && (document as any).pointerLockElement !== this.renderer.domElement) { this.requestPointerLock(); } if (this.paused) { this.setPaused(false); window.setTimeout(() => this.toggleLock(true), 80); } else { this.toggleLock(true); } }
    if (k === "escape") { if (this.mapOpen) this.toggleMap(); else this.setPaused(!this.paused); }
    if (k === "h") this.toggleGodMode();
    if (k === "m") this.toggleMap();
    if (k === "1") this.switchWeapon("greatsword");
    if (k === "2") this.switchWeapon("twinblades");
    if (k === "3") this.switchWeapon("halberd");
  };

  switchWeapon(kind: string) {
    const p = this.player;
    if (p.weaponKind === kind || !p.canAct()) return;
    const cfg = WEAPON_CONFIG[kind];
    if (!cfg) return;
    // swap the rig
    const oldRoot = p.rig.root;
    const newRig = p.buildWeaponRig(kind);
    this.world.scene.remove(oldRoot);
    p.adoptRig(newRig, kind);
    this.world.scene.add(newRig.root);
    // retint the trail to match the weapon
    if (p.trail) {
      this.world.scene.remove(p.trail.mesh);
    }
    p.trail = new SwordTrail(kind === "twinblades" ? 18 : 24, cfg.trailColor);
    this.world.scene.add(p.trail.mesh);
    audio.swing(0.7);
    this.showBanner(cfg.label.toUpperCase(), "Weapon drawn");
    this.emit();
  }

  toggleGodMode() {
    const p = this.player;
    p.godMode = !p.godMode;
    if (p.godMode) {
      p.hp = p.maxHp;
      p.stamina = p.maxStamina;
      p.fp = p.maxFp;
      p.flasks = p.maxFlasks;
      p.runes += 50000;
      this.graceFx = 1;
      audio.grace();
      this.showBanner("GOD MODE — ENABLED", "fly with WASD · SPACE up · CTRL down · SHIFT warp-speed · one-shot");
    } else {
      audio.ui("click");
      this.showBanner("GOD MODE — DISABLED", "mortal once more");
    }
    this.emit();
  }

  /** Apply a quality preset live — updates DPR, shadow map, bloom, and toggles expensive VFX */
  setQuality(level: QualityLevel) {
    const preset = QUALITY_PRESETS[level];
    if (!preset) return;
    this.qualityLevel = level;
    this.qualityManual = true;
    try { localStorage.setItem("ashveil_quality", level); } catch {}
    this.basePixelRatio = Math.min(window.devicePixelRatio, preset.pixelRatio);
    const pr = this.basePixelRatio * this.quality;
    try {
      this.renderer.setPixelRatio(pr);
      if (this.composer) this.composer.setPixelRatio(pr);
      if (this.world.sun) {
        this.world.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
        if (this.world.sun.shadow.map) {
          this.world.sun.shadow.map.dispose();
          (this.world.sun.shadow as any).map = null;
        }
        this.world.sun.castShadow = preset.shadows;
        this.renderer.shadowMap.enabled = preset.shadows;
      }
      if (this.bloom) this.bloom.strength = preset.bloom;
      (this.world as any)._qualityShadows = preset.shadows;
      (this.world as any)._qualityGrass = preset.grass;
    } catch {}
    audio.ui("click");
    this.showBanner(preset.label, preset.desc);
    this.emit();
  }
  private onKeyUp = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = false; };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.started || this.paused) return;
    if (document.pointerLockElement !== this.renderer.domElement) this.requestPointerLock();
    if (this.dialogue) {
      if (e.button === 0) this.advanceDialogue();
      return;
    }
    if (e.button === 0) { this.mouse.left = true; this.attackBuffer = 0.22; }
    if (e.button === 2) this.mouse.right = true;
    if (e.button === 1) { e.preventDefault(); this.toggleLock(); }
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouse.left = false;
    if (e.button === 2) this.mouse.right = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    const s = this.sensitivity;
    this.camYaw -= e.movementX * s;
    this.camPitch = Math.max(-0.75, Math.min(0.95, this.camPitch + e.movementY * s));
  };
  private onWheel = (e: WheelEvent) => {
    this.camTargetDist = Math.max(3.2, Math.min(11, this.camTargetDist + e.deltaY * 0.004));
  };
  private onContext = (e: Event) => e.preventDefault();
  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w, h);
  };

  private bindEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    this.renderer.domElement.addEventListener("wheel", this.onWheel, { passive: true });
    this.renderer.domElement.addEventListener("contextmenu", this.onContext);
  }

  requestPointerLock() {
    try {
      const p = this.renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  private onPointerLockChange = () => {
    if (!this.started || this.paused || this.dead || this.victoryShown) return;
    if (document.pointerLockElement !== this.renderer.domElement) this.setPaused(true);
  };

  setPaused(v: boolean) {
    this.paused = v;
    if (v) document.exitPointerLock?.();
    else if (this.started) this.requestPointerLock();
    this.emit();
  }

  start() {
    this.started = true;
    this.paused = false;
    audio.resume();
    this.requestPointerLock();
    this.showBanner("THE ASHVEIL", "Lands Between the Sundered Flame");
  }

  dismissVictory() {
    this.victoryShown = false;
    this.victoryDismissed = true;
    this.requestPointerLock();
    this.showBanner("THE FLAME IS THINE", "Wander the Ashveil as you will");
    this.emit();
  }

  quitToTitle() {
    this.started = false;
    this.paused = false;
    document.exitPointerLock?.();
    this.emit();
  }

  onState(l: Listener) {
    this.listeners.push(l);
    return () => { this.listeners = this.listeners.filter((x) => x !== l); };
  }

  // ------------------------------------------------------------- game utils
  private toggleLock(forceLock = false) {
    if (this.lockTarget && !forceLock) { this.lockTarget = null; audio.ui("hover"); this.emit(); return; }

    let best: NPC | null = null;
    let bestScore = -Infinity;
    const fwd = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const to = new THREE.Vector3();

    // Pass 1: in front, within 42m, scored by dot + distance — normal lock
    for (const e of this.enemies) {
      if (e.dead) continue;
      to.subVectors(e.pos, this.player.pos).setY(0);
      const d = to.length();
      if (d > 42) continue;
      if (d < 0.5) continue;
      to.normalize();
      const dot = to.dot(fwd);
      if (dot < 0.05) continue;
      const score = dot * 2.8 - d * 0.06 + (e.kind === "boss" ? 0.5 : 0);
      if (score > bestScore) { bestScore = score; best = e; }
    }

    // Pass 2: if nothing in front, grab nearest within 30m regardless of facing — works without pointer lock
    if (!best) {
      let nearestD = 999;
      for (const e of this.enemies) {
        if (e.dead) continue;
        to.subVectors(e.pos, this.player.pos).setY(0);
        const d = to.length();
        if (d > 30) continue;
        if (d < nearestD) { nearestD = d; best = e; }
      }
    }

    // Pass 3: if still nothing, grab any aggro'd boss within 80m
    if (!best) {
      for (const e of this.enemies) {
        if (e.dead || e.kind !== "boss") continue;
        if (!e.aggro) continue;
        to.subVectors(e.pos, this.player.pos).setY(0);
        const d = to.length();
        if (d < 80) { best = e; break; }
      }
    }

    this.lockTarget = best;
    if (best) {
      audio.ui("click");
      this.showBanner(best.name, "Locked — press TAB/T/V to unlock");
    } else {
      audio.ui("hover");
      if (forceLock) this.showBanner("NO TARGET", "No enemies nearby");
    }
    this.emit();
  }

  showBanner(title: string, sub?: string) {
    this.bannerId++;
    this.banner = { title, sub, id: this.bannerId };
    this.bannerT = 4.2;
  }

  private incCombo() {
    this.comboCount++;
    this.comboTimer = 3.2;
    if (this.comboCount > this.comboBest) this.comboBest = this.comboCount;
    if (this.comboCount >= 3) {
      this.showBanner(`${this.comboCount}x COMBO!`, this.comboCount >= 5 ? "The flame sings through you" : "Keep striking");
    }
  }

  private resetCombo() {
    if (this.comboCount > 0) {
      if (this.comboCount >= 5) audio.grace();
    }
    this.comboCount = 0;
    this.comboTimer = 0;
  }

  /** Auto-detect quality by quick benchmark */
  async benchmarkQuality(): Promise<QualityLevel> {
    this.showBanner("BENCHMARKING...", "Measuring frame rate for 2 seconds");
    const start = performance.now();
    let frames = 0;
    let fpsSamples: number[] = [];
    let last = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        frames++;
        const now = performance.now();
        if (now - last > 200) {
          const fps = Math.round((frames * 1000) / (now - start));
          fpsSamples.push(fps);
          last = now;
        }
        if (now - start < 2200) {
          requestAnimationFrame(tick);
        } else {
          const avg = fpsSamples.length ? Math.round(fpsSamples.reduce((a,b)=>a+b,0)/fpsSamples.length) : this.fps;
          let suggested: QualityLevel = "medium";
          if (avg < 30) suggested = "ultralow";
          else if (avg < 42) suggested = "low";
          else if (avg < 54) suggested = "medium";
          else if (avg < 66) suggested = "high";
          else suggested = "xhigh";
          this.setQuality(suggested);
          this.showBanner(`AUTO-DETECTED: ${suggested.toUpperCase()}`, `${avg} FPS avg · ${QUALITY_PRESETS[suggested].desc}`);
          resolve(suggested);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private ctx(dt: number): GameCtx {
    return {
      dt,
      time: this.time,
      scene: this.world.scene,
      particles: this.particles,
      waves: this.waves,
      player: this.player,
      enemies: this.enemies,
      resolve: (x, z, r) => this.world.resolveColliders(x, z, r),
      shake: (a, d = 0.3) => { const s = a * this.shakeIntensity; this.shakeAmt = Math.max(this.shakeAmt, s); this.shakeT = Math.max(this.shakeT, d); },
      hitStop: (d) => { this.hitStopT = Math.max(this.hitStopT, d); },
      popup: (pos, text, kind) => this.addPopup(pos, text, kind),
      spawnProjectile: (o) => this.spawnProjectile(o),
      onKill: (npc) => this.handleKill(npc),
      onPlayerDeath: () => this.handlePlayerDeath(),
      slowmo: (scale, dur) => { this.slowmoScale = scale; this.slowmoT = dur; },
      incCombo: () => this.incCombo(),
      resetCombo: () => this.resetCombo(),
    };
  }

  private addPopup(pos: THREE.Vector3, text: string, kind: string) {
    const v = pos.clone().project(this.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * 100;
    const y = (-v.y * 0.5 + 0.5) * 100;
    this.popups.push({ id: ++this.popupId, text, kind, x, y, born: performance.now() });
    if (this.popups.length > 26) this.popups.shift();
  }

  /**
   * Dynamic lights are allocated ONCE. Adding/removing a light at runtime makes
   * three.js recompile every material in the scene — that was the source of the
   * frame hitches when casting or when the boss threw fire.
   */
  private initLightPool() {
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 2);
      this.world.scene.add(l);
      this.lightPool.push(l);
      this.lightBusy.push(false);
    }
  }

  private acquireLight(color: number): number {
    for (let i = 0; i < this.lightPool.length; i++) {
      if (!this.lightBusy[i]) {
        this.lightBusy[i] = true;
        this.lightPool[i].color.set(color);
        this.lightPool[i].intensity = 9;
        return i;
      }
    }
    return -1;
  }

  private releaseLight(i: number) {
    if (i < 0) return;
    this.lightBusy[i] = false;
    this.lightPool[i].intensity = 0;
  }

  private projGeo?: THREE.IcosahedronGeometry;
  private haloGeo?: THREE.SphereGeometry;

  private spawnProjectile(o: ProjectileOpts) {
    // shared unit geometry, scaled per projectile — no per-shot allocation
    if (!this.projGeo) this.projGeo = new THREE.IcosahedronGeometry(1, 2);
    if (!this.haloGeo) this.haloGeo = new THREE.SphereGeometry(2.1, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(this.projGeo, mat);
    mesh.scale.setScalar(o.radius);
    mesh.position.copy(o.pos);
    const halo = new THREE.Mesh(
      this.haloGeo,
      new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.add(halo);
    this.world.scene.add(mesh);
    const lightIdx = this.acquireLight(o.color);
    this.projectiles.push({
      mesh, lightIdx,
      vel: o.dir.clone().normalize().multiplyScalar(o.speed),
      life: o.life ?? 3,
      damage: o.damage,
      radius: o.radius,
      fromPlayer: o.fromPlayer,
      explode: o.explode ?? 0,
      color: o.color,
      gravity: o.gravity ?? 0,
      dead: false,
    });
  }

  private detonate(p: Projectile) {
    if (p.dead) return;
    p.dead = true;
    const pos = p.mesh.position;
    const ctx = this.ctx(0.016);
    audio.explosion();
    this.particles.emit({ x: pos.x, y: pos.y, z: pos.z, count: 150, speed: 13, size: 9, life: 1.0, color: p.color, grav: -5, spread: 1.2 });
    this.waves.spawn(pos.clone(), p.color, p.explode > 0 ? p.explode * 1.6 : 3, 0.55, false);
    this.waves.spawn(new THREE.Vector3(pos.x, terrainHeight(pos.x, pos.z) + 0.2, pos.z), p.color, Math.max(3, p.explode * 1.4), 0.7);
    this.shakeAmt = Math.max(this.shakeAmt, 0.7);
    this.shakeT = Math.max(this.shakeT, 0.35);

    if (p.explode > 0) {
      if (p.fromPlayer) {
        const c = new THREE.Vector3();
        for (const e of this.enemies) {
          if (e.dead) continue;
          e.worldCenter(c);
          const d = c.distanceTo(pos);
          if (d < p.explode + e.radius) {
            const dmg = p.damage * (1 - (d / (p.explode + e.radius)) * 0.5);
            e.damage(dmg, pos, ctx, 34);
            this.addPopup(c.clone().setY(c.y + 0.6), Math.round(dmg).toString(), "magic");
            if (p.fromPlayer) this.incCombo();
          }
        }
      } else {
        const d = this.player.pos.distanceTo(pos);
        if (d < p.explode + 0.9) this.player.damage(p.damage * (1 - (d / (p.explode + 1)) * 0.45), pos, ctx, 30);
      }
    }
    this.releaseLight(p.lightIdx);
    this.world.scene.remove(p.mesh);
    p.mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material) (m.material as THREE.Material).dispose();
    });
  }

  private updateProjectiles(dt: number) {
    const c = new THREE.Vector3();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.dead) { this.projectiles.splice(i, 1); continue; }
      p.life -= dt;
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 4;
      const pos = p.mesh.position;
      if (p.lightIdx >= 0) {
        const l = this.lightPool[p.lightIdx];
        l.position.copy(pos);
        l.intensity = 8 + Math.sin(this.time * 30) * 2;
      }
      this.particles.emit({
        x: pos.x, y: pos.y, z: pos.z, count: 2, speed: 1.2, size: 7, life: 0.42, color: p.color, grav: 0.4, spread: p.radius,
      });

      let hit = false;
      if (pos.y <= terrainHeight(pos.x, pos.z) + p.radius * 0.5) hit = true;
      if (!hit) {
        if (p.fromPlayer) {
          for (const e of this.enemies) {
            if (e.dead) continue;
            e.worldCenter(c);
            if (c.distanceTo(pos) < e.radius + p.radius + 0.35) { hit = true; break; }
          }
        } else {
          this.player.worldCenter(c);
          if (c.distanceTo(pos) < this.player.radius + p.radius + 0.25) hit = true;
        }
      }
      if (hit || p.life <= 0) {
        this.detonate(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ flow
  private handleKill(npc: NPC) {
    this.player.runes += npc.runeValue;

    // ---- tutorial progression ----
    if (npc.tutorialTag === "blade") {
      this.effigyKills.blade++;
      const left = 2 - this.effigyKills.blade;
      if (this.questStage === 1) {
        if (left > 0) {
          this.showBanner("EFFIGY FELLED", `${left} remains in the Hall of Blades`);
        } else {
          this.questStage = 2;
          this.syncBeacon();
          this.showBanner("THE HALL IS YOURS", "Climb the eastern stair to the Terrace");
          audio.grace();
        }
      }
      return;
    }
    if (npc.tutorialTag === "arcane") {
      this.effigyKills.arcane++;
      if (this.questStage === 2) {
        this.questStage = 3;
        this.syncBeacon();
        this.showBanner("THE WARD IS BROKEN", "Now take the road south");
        audio.grace();
      }
      return;
    }
    if (npc.kind === "boss") {
      // ---- Regional (Choir) bosses — Act II progression ----
      if (npc.bossRole === "regional") {
        this.showBanner("A CHOIR VOICE SILENCED", `${npc.name}  ·  +${npc.runeValue.toLocaleString()} runes`);
        this.addPopup(npc.pos.clone().setY(npc.pos.y + 2.6), "+" + npc.runeValue, "runes");
        audio.setIntensity(0);
        // Advance from "hunt both" → "one left" → "return to king"
        const bothDead = this.regionalBosses.every((b) => b.dead);
        if (bothDead && this.questStage < 7) {
          this.questStage = 7;
          this.showBanner("THE CHOIR IS SILENT", "Return to King Aldric");
        } else if (this.questStage < 6) {
          this.questStage = 6;
        }
        this.syncBeacon();
        return;
      }

      // ---- Hollow Crown — the real ending ----
      if (npc.bossRole === "hollowCrown") {
        this.victory = true;
        this.victoryName = npc.name;
        this.victoryAt = this.time;
        this.questStage = 9;
        this.syncBeacon();
        this.showBanner("THE HOLLOW CROWN FALLS", "The Ashveil is silent");
        audio.setIntensity(0);
        return;
      }

      // ---- Malenkar (main) — Act I climax, but NOT the ending anymore ----
      if (this.questStage < 4) this.questStage = 4;
      this.showBanner("MALENKAR FALLS", "Return to King Aldric with the Flame");
      audio.setIntensity(0);
      this.syncBeacon();
    } else {
      this.addPopup(npc.pos.clone().setY(npc.pos.y + 2), "+" + npc.runeValue, "runes");
    }
  }

  private handlePlayerDeath() {
    this.resetCombo();
    this.dead = true;
    this.dialogue = null;
    this.respawnTimer = 5.2;
    // drop bloodstain
    if (this.bloodstain) this.world.scene.remove(this.bloodstain.mesh);
    if (this.player.runes > 0) {
      const geo = new THREE.SphereGeometry(0.45, 12, 10);
      const mat = new THREE.MeshBasicMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(this.player.pos).setY(this.player.pos.y + 0.6);
      this.world.scene.add(mesh);
      this.bloodstain = { pos: mesh.position.clone(), runes: this.player.runes, mesh };
    }
    this.player.runes = 0;
    this.emit();
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.fp = p.maxFp;
    p.flasks = p.maxFlasks;
    p.poise = 0;
    p.invuln = 1.2;
    p.setState("grace", 1.6);
    p.pos.set(WORLD.graceAt.x, terrainHeight(WORLD.graceAt.x, WORLD.graceAt.z), WORLD.graceAt.z - 2.5);
    p.vel.set(0, 0, 0);
    p.yaw = Math.PI;
    for (const m of p.rig.flashMats) { m.opacity = 1; m.transparent = false; }
    this.dead = false;
    this.deathFx = 0;
    this.lockTarget = null;
    this.resetEnemies();
    this.graceFx = 1;
    audio.grace();
    audio.setIntensity(0);
    this.bossAwake = false;
    this.showBanner("LOST GRACE", "The flame rekindles");
    if (this.started) this.requestPointerLock();
    this.emit();
  }

  restAtGrace() {
    const p = this.player;
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.fp = p.maxFp;
    p.flasks = p.maxFlasks;
    this.resetEnemies();
    this.graceFx = 1;
    audio.grace();
    audio.setIntensity(0);
    this.bossAwake = false;
    this.showBanner("GRACE RESTORED", "Foes have returned to the ash");
    this.emit();
  }

  /** Index of the nearest grace within `range`, or -1. */
  private nearestGraceIdx(range = 4.6): number {
    let best = -1;
    let bd = range;
    const sites = this.world.graceSites;
    for (let i = 0; i < sites.length; i++) {
      const d = Math.hypot(this.player.pos.x - sites[i].pos.x, this.player.pos.z - sites[i].pos.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  private discoverGrace(idx: number) {
    if (idx < 0 || this.discoveredGraces.has(idx)) return;
    this.discoveredGraces.add(idx);
    const site = this.world.graceSites[idx];
    this.showBanner("GRACE DISCOVERED", site.name);
    this.graceFx = 1;
    audio.grace();
  }

  /** Fast travel to a discovered grace by index. */
  fastTravel(idx: number) {
    if (!this.discoveredGraces.has(idx)) return;
    const site = this.world.graceSites[idx];
    const p = this.player;
    p.pos.set(site.pos.x, terrainHeight(site.pos.x, site.pos.z + 2.5), site.pos.z + 2.5);
    p.vel.set(0, 0, 0);
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.fp = p.maxFp;
    p.flasks = p.maxFlasks;
    this.activeGraceIdx = idx;
    this.mapOpen = false;
    this.resetEnemies();
    this.bossAwake = false;
    this.graceFx = 1;
    this.updateCamera(0, true);
    audio.grace();
    audio.setIntensity(0);
    this.showBanner("SPIRIT SPRING", "Arrived · " + site.name);
    this.requestPointerLock();
    this.emit();
  }

  toggleMap() {
    if (!this.started || this.dead || this.dialogue || this.victoryShown) return;
    this.mapOpen = !this.mapOpen;
    if (this.mapOpen) document.exitPointerLock?.();
    else this.requestPointerLock();
    audio.ui("click");
    this.emit();
  }

  private nearestLore(range = 3.2): number {
    let best = -1;
    let bd = range;
    for (const s of this.world.loreStones) {
      const d = Math.hypot(this.player.pos.x - s.pos.x, this.player.pos.z - s.pos.z);
      if (d < bd) { bd = d; best = s.id; }
    }
    return best;
  }

  private readLore(id: number) {
    const text = LORE_STONES[id] ?? { title: "Worn Stone", body: "The inscription has been scoured away by ash." };
    if (!this.loreRead.has(id)) {
      this.loreRead.add(id);
      this.player.runes += 200;
      this.addPopup(this.player.pos.clone().setY(this.player.pos.y + 2), "+200", "runes");
    }
    this.dialogue = { speaker: text.title, lines: text.body, idx: 0 };
    this.dialogueKind = "lore";
    audio.ui("click");
    this.emit();
  }

  private resetEnemies() {
    for (const e of this.enemies) {
      if (e.kind === "boss" && this.victory) continue;
      if (e.kind === "boss" && e.bossRole === "regional" && e.dead) continue;
      if (e.tutorialTag) continue; // felled effigies stay felled
      if (e.dead) {
        e.dead = false;
        e.dissolve = 0;
        for (const m of e.rig.flashMats) { m.opacity = 1; m.transparent = false; }
        for (const m of e.rig.glowMats) (m as THREE.MeshBasicMaterial).opacity = 0.9;
      }
      e.hp = e.maxHp;
      e.poise = 0;
      e.aggro = false;
      e.move = null;
      e.vel.set(0, 0, 0);
      e.setState("idle", 1);
      if (e.glowLight) e.glowLight.intensity = 6;
    }
    if (!this.victory) {
      this.boss.pos.set(0, terrainHeight(0, -18), -18);
      this.boss.yaw = 0;
    }
  }

  private nearestVillage(): Village | null {
    let best: Village | null = null;
    let bd = 999;
    for (const v of this.villages) {
      const d = Math.hypot(this.player.pos.x - v.x, this.player.pos.z - v.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best && bd < 9 ? best : null;
  }

  private upgradeAtVillage(v: Village) {
    if (v.level >= v.costs.length) {
      this.showBanner(v.name.toUpperCase(), "Already fully upgraded");
      audio.ui("hover");
      return;
    }
    const cost = v.costs[v.level];
    if (this.player.runes < cost) {
      this.showBanner(v.name.toUpperCase(), `${cost.toLocaleString()} runes required`);
      audio.ui("hover");
      return;
    }
    this.player.runes -= cost;
    v.level++;
    this.upgrades[v.type] = v.level;
    if (v.type === "blade") this.player.bladePower = 1 + v.level * 0.18;
    if (v.type === "arcane") this.player.magicPower = 1 + v.level * 0.22;
    if (v.type === "vigor") {
      this.player.maxHp = 140 + v.level * 28;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 28);
      this.player.maxStamina = 120 + v.level * 12;
      this.player.stamina = this.player.maxStamina;
    }
    const title = v.type === "blade" ? "BLADE REFORGED" : v.type === "arcane" ? "ARCANE FLAME DEEPENED" : "VIGOR RESTORED";
    this.showBanner(title, `${v.name} · rank ${v.level}`);
    this.graceFx = 0.8;
    audio.grace();
  }

  // ---------------------------------------------------------------- camera
  private updateCamera(dt: number, instant = false) {
    const p = this.player;
    const focusY = p.pos.y + 1.35;

    if (this.lockTarget && !this.lockTarget.dead) {
      const t = this.lockTarget;
      const dx = t.pos.x - p.pos.x;
      const dz = t.pos.z - p.pos.z;
      const desiredYaw = Math.atan2(dx, dz) + Math.PI;
      let d = ((desiredYaw - this.camYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      this.camYaw += d * Math.min(1, dt * 6);
      const dist = Math.hypot(dx, dz);
      const tgtPitch = THREE.MathUtils.clamp(0.06 + (t.centerY * t.scale - 1.2) / Math.max(4, dist) + (t.kind === "boss" ? 0.12 : 0), -0.2, 0.5);
      this.camPitch += (tgtPitch - this.camPitch) * Math.min(1, dt * 4);
      this.camTargetDist = THREE.MathUtils.clamp(6.0 + (t.kind === "boss" ? 4.0 : 0) + dist * 0.11, 5, 13);
    }

    // pull the camera in tight inside the keep so it doesn't clip the walls
    const indoors = insideKeep(p.pos.x, p.pos.z, p.pos.y);
    const wanted = indoors ? Math.min(this.camTargetDist, 4.3) : this.camTargetDist;
    this.camDist += (wanted - this.camDist) * (instant ? 1 : Math.min(1, dt * 6));

    const cp = Math.cos(this.camPitch);
    const off = new THREE.Vector3(
      Math.sin(this.camYaw) * cp * this.camDist,
      Math.sin(this.camPitch) * this.camDist + 1.9,
      Math.cos(this.camYaw) * cp * this.camDist,
    );

    const target = new THREE.Vector3(p.pos.x, focusY, p.pos.z);
    let desired = target.clone().add(off);

    // ---- insane polish: camera collision — ray march against colliders to prevent wall clipping
    // simple sphere sweep: if line from target to desired hits any collider, pull in
    const dir = new THREE.Vector3().subVectors(desired, target);
    const len = dir.length();
    if (len > 0.1) {
      dir.normalize();
      let closest = len;
      for (const col of this.world.colliders) {
        // project collider onto camera ray
        const toCol = new THREE.Vector3(col.x - target.x, 0, col.z - target.z);
        const proj = toCol.dot(new THREE.Vector3(dir.x, 0, dir.z));
        if (proj < 0 || proj > len) continue;
        const perp = new THREE.Vector3().copy(toCol).sub(new THREE.Vector3(dir.x,0,dir.z).multiplyScalar(proj));
        if (perp.length() < col.r + 0.6) {
          closest = Math.min(closest, Math.max(1.2, proj - 0.8));
        }
      }
      if (closest < len) {
        desired = target.clone().addScaledVector(dir, closest);
      }
    }

    // keep the camera above whatever floor the player is standing on
    const gh = groundAt(desired.x, desired.z, p.pos.y + 2.2) + 0.9;
    if (desired.y < gh) desired.y = gh;

    // subtle camera breathing when idle — insane polish
    if (!this.lockTarget && p.state === "idle") {
      desired.y += Math.sin(this.time * 0.9) * 0.04;
      desired.x += Math.sin(this.time * 0.6) * 0.02;
    }


    if (instant) this.camPos.copy(desired);
    else this.camPos.lerp(desired, Math.min(1, dt * 9));

    // look target: bias toward the locked enemy
    let look = target.clone().add(new THREE.Vector3(0, 0.25, 0));
    if (this.lockTarget && !this.lockTarget.dead) {
      const t = this.lockTarget;
      const tc = new THREE.Vector3(t.pos.x, t.pos.y + t.centerY * t.scale * 0.9, t.pos.z);
      look = look.lerp(tc, 0.36);
    }
    if (instant) this.camLook.copy(look);
    else this.camLook.lerp(look, Math.min(1, dt * 10));

    this.camera.position.copy(this.camPos);

    // shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmt * Math.max(0, this.shakeT) * 1.6;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
      this.camera.position.z += (Math.random() - 0.5) * k;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }
    this.camera.lookAt(this.camLook);
    if (this.shakeT > 0) this.camera.rotateZ((Math.random() - 0.5) * this.shakeAmt * 0.045);
  }

  // ----------------------------------------------------------------- frame
  private buildInput(dt: number): PlayerInput {
    if (this.dialogue) {
      // conversation locks combat but leaves the camera free
      this.attackBuffer = this.heavyBuffer = this.rollBuffer = this.castBuffer = this.healBuffer = 0;
      return { moveX: 0, moveZ: 0, sprint: false, attack: false, heavy: false, roll: false, guard: false, cast: false, heal: false, camYaw: this.camYaw + Math.PI, faceYaw: null };
    }
    const k = this.keys;
    let mx = 0;
    let mz = 0;
    if (k["w"] || k["arrowup"]) mz += 1;
    if (k["s"] || k["arrowdown"]) mz -= 1;
    if (k["a"] || k["arrowleft"]) mx += 1;
    if (k["d"] || k["arrowright"]) mx -= 1;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    this.heavyBuffer = Math.max(0, this.heavyBuffer - dt);
    this.rollBuffer = Math.max(0, this.rollBuffer - dt);
    this.castBuffer = Math.max(0, this.castBuffer - dt);
    this.healBuffer = Math.max(0, this.healBuffer - dt);
    this.interactBuffer = Math.max(0, this.interactBuffer - dt);

    const canAct = this.player.canAct();
    const attack = this.attackBuffer > 0 && canAct;
    const heavy = this.heavyBuffer > 0 && canAct;
    const roll = this.rollBuffer > 0 && canAct;
    const cast = this.castBuffer > 0 && canAct;
    const heal = this.healBuffer > 0 && canAct;
    if (attack) this.attackBuffer = 0;
    if (heavy) this.heavyBuffer = 0;
    if (roll) this.rollBuffer = 0;
    if (cast) this.castBuffer = 0;
    if (heal) this.healBuffer = 0;

    let faceYaw: number | null = null;
    if (this.lockTarget && !this.lockTarget.dead) {
      faceYaw = Math.atan2(this.lockTarget.pos.x - this.player.pos.x, this.lockTarget.pos.z - this.player.pos.z);
    }

    return {
      moveX: mx, moveZ: mz,
      sprint: !!k["shift"],
      attack, heavy, roll, cast, heal,
      guard: this.mouse.right,
      camYaw: this.camYaw + Math.PI,
      faceYaw,
      flyUp: !!k[" "],
      flyDown: !!k["control"] || !!k["c"],
    };
  }

  private frame = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.frame);

    let raw = Math.min(this.clock.getDelta(), 0.05);
    this.fpsAcc += raw;
    this.fpsCount++;
    if (this.fpsAcc > 0.5) {
      this.fps = Math.round(this.fpsCount / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsCount = 0;
      // ---- adaptive resolution: protect the frame budget automatically ----
      const preset = QUALITY_PRESETS[this.qualityLevel];
      const allowAdaptive = preset ? preset.adaptive : true;
      if (allowAdaptive) {
        this.qualityCooldown -= 0.5;
        if (this.qualityCooldown <= 0) {
          let q = this.quality;
          if (this.fps < 46 && q > 0.5) q = Math.max(0.5, q - 0.18);
          else if (this.fps > 58 && q < 1.15) q = Math.min(1.15, q + 0.09);
          if (Math.abs(q - this.quality) > 0.01) {
            this.quality = q;
            const pr = this.basePixelRatio * q;
            this.renderer.setPixelRatio(pr);
            this.composer.setPixelRatio(pr);
            this.qualityCooldown = 2.5;
          }
        }
      }
    }

    if (!this.started || this.paused) {
      // idle cinematic orbit on the menu
      if (!this.started) {
        this.time += raw;
        this.camYaw += raw * 0.06;
        this.camPitch = 0.13 + Math.sin(this.time * 0.16) * 0.05;
        this.camTargetDist = 8.4;
        this.world.update(raw, this.camera.position);
        this.embers.update(raw, this.time, this.camera.position);
        this.particles.update(raw);
        this.updateCamera(raw);
        this.grade.uniforms.uTime.value = this.time;
        this.composer.render();
      }
      return;
    }

    // slowmo / hitstop
    if (this.slowmoT > 0) {
      this.slowmoT -= raw;
      this.timeScale += ((this.slowmoT > 0 ? this.slowmoScale : 1) - this.timeScale) * 0.12;
    } else {
      this.timeScale += (1 - this.timeScale) * 0.08;
    }
    if (this.hitStopT > 0) {
      this.hitStopT -= raw;
      raw *= 0.06;
    }
    const dt = raw * this.timeScale;
    this.time += dt;

    const ctx = this.ctx(dt);

    // ---- player ----
    const input = this.buildInput(raw);
    this.player.update(input, ctx);

    // ---- enemies ----
    let alive = 0;
    // ---- streaming: distance-based tick throttling for a bigger world ----
    // Enemies close to the player run every frame. Far enemies tick once every
    // ~0.4s and are visually hidden. Keeps a 3× larger world affordable.
    this.streamAcc += raw;
    const doFarTick = this.streamAcc > 0.4;
    if (doFarTick) this.streamAcc = 0;
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    for (const e of this.enemies) {
      const dx = e.pos.x - px;
      const dz = e.pos.z - pz;
      const d2 = dx * dx + dz * dz;
      const near = d2 < 80 * 80;
      const veryFar = d2 > 220 * 220;
      // Bosses always render (their bars need to work), effigies always render.
      const alwaysVisible = e.kind === "boss" || e.tutorialTag !== "" || e === this.hollowCrown;
      e.rig.root.visible = alwaysVisible || !veryFar;
      if (near) {
        e.update(ctx);
      } else if (doFarTick && !e.dead) {
        // Cheap sleep tick — still ages state timers, still respects aggro reset,
        // but doesn't run full AI/animation every frame.
        e.update(ctx);
      }
      if (!e.dead && e.kind !== "boss") alive++;
    }

    // boss music trigger
    // Boss music trigger — Malenkar, regionals, or the Hollow Crown.
    const anyBossActive =
      (this.boss.aggro && !this.boss.dead) ||
      this.regionalBosses.some((b) => b.aggro && !b.dead) ||
      (this.hollowCrown && !this.hollowCrown.dormant && !this.hollowCrown.dead);
    if (this.bossAwake && !anyBossActive) {
      this.bossAwake = false;
      audio.setIntensity(0);
    }
    if (!this.bossAwake && anyBossActive) {
      this.bossAwake = true;
      audio.setIntensity(1);
      // Pick the most-relevant boss for the banner + lock target.
      let engaged: NPC | null = null;
      if (this.hollowCrown && !this.hollowCrown.dormant && !this.hollowCrown.dead) engaged = this.hollowCrown;
      else if (this.boss.aggro && !this.boss.dead) engaged = this.boss;
      else engaged = this.regionalBosses.find((b) => b.aggro && !b.dead) ?? null;
      if (engaged) {
        this.showBanner(engaged.name, engaged === this.hollowCrown ? "The King unmasked" : engaged === this.boss ? "First of the Sundered" : "A Voice of the Choir");
        this.lockTarget = engaged;
      }
    }

    this.updateProjectiles(dt);
    this.particles.update(dt);
    this.waves.update(dt, this.camera);
    this.embers.update(dt, this.time, this.camera.position);
    this.world.update(dt, this.player.pos);
    this.updateCamera(raw);

    // ---- bloodstain pickup ----
    if (this.bloodstain) {
      const b = this.bloodstain;
      b.mesh.position.y = b.pos.y + Math.sin(this.time * 2) * 0.12;
      b.mesh.scale.setScalar(1 + Math.sin(this.time * 3) * 0.1);
      if (Math.random() < 0.3) {
        this.particles.emit({ x: b.pos.x, y: b.pos.y, z: b.pos.z, count: 1, speed: 0.5, size: 5, life: 1.2, color: 0x9fd8ff, grav: 1.2 });
      }
      if (this.player.pos.distanceTo(b.pos) < 2.4 && !this.player.dead) {
        this.player.runes += b.runes;
        this.addPopup(b.pos.clone(), "+" + b.runes, "runes");
        audio.ui("click");
        this.world.scene.remove(b.mesh);
        this.bloodstain = null;
      }
    }

    // ---- king + beacon + interactions ----
    this.updateKing(dt);
    if (this.beacon.visible) {
      this.beacon.rotation.y += dt * 0.4;
      const pulse = 0.72 + Math.sin(this.time * 2.2) * 0.28;
      this.beaconMats[0].opacity = 0.13 * pulse;
      this.beaconMats[1].opacity = 0.38 * pulse;
    }

    const kd = Math.hypot(this.player.pos.x - this.kingPos.x, this.player.pos.z - this.kingPos.z);
    const graceIdx = this.nearestGraceIdx();
    if (graceIdx >= 0) this.discoverGrace(graceIdx);
    const village = this.nearestVillage();
    const lore = this.nearestLore();
    this.prompt = null;
    if (!this.dead && !this.dialogue && !this.mapOpen) {
      if (kd < 5.5) {
        this.prompt = "F — Speak with King Aldric";
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          // stage 3 = sent south but boss not yet dead → he offers the "midjourney" warning
          // Route to the right speech based on where in the story we are.
          let kind: string;
          switch (this.questStage) {
            case 0: kind = "intro"; break;
            case 1: kind = "blades"; break;
            case 2: kind = "arcane"; break;
            case 3: kind = "midjourney"; break;             // sent south, boss not yet dead
            case 4: kind = "ret"; break;                    // Malenkar dead — reveals Choir
            case 5: kind = "huntChoir"; break;              // hunting both
            case 6: kind = "oneChoirLeft"; break;           // one left
            case 7: kind = "bothChoirDown"; break;          // both dead — awakens Hollow Crown
            case 8: kind = "oneChoirLeft"; break;           // during final fight, shouldn't hit
            case 9: kind = "epilogue"; break;
            default: kind = "done";
          }
          this.startDialogue(kind);
        }
      } else if (village) {
        const next = village.costs[village.level];
        const label = village.type === "blade" ? "Forge blade" : village.type === "vigor" ? "Strengthen body" : "Deepen arcane fire";
        this.prompt = village.level >= village.costs.length
          ? `F — ${village.name} · fully upgraded`
          : `F — ${label} at ${village.name} (${next.toLocaleString()} runes)`;
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.upgradeAtVillage(village);
        }
      } else if (graceIdx >= 0) {
        this.activeGraceIdx = graceIdx;
        this.prompt = "F — Rest at Grace   ·   M — Map & Travel";
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.restAtGrace();
        }
      } else if (lore >= 0) {
        this.prompt = this.loreRead.has(lore) ? "F — Read the Lore Stone again" : "F — Read the Lore Stone (+200 runes)";
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.readLore(lore);
        }
      }
    }

    // ---- respawn flow ----
    if (this.dead) {
      this.respawnTimer -= raw;
      this.deathFx = Math.min(1, this.deathFx + raw * 0.5);
      if (this.respawnTimer <= 0) this.respawn();
    }

    // ---- combo timer ----
    if (this.comboTimer > 0) {
      this.comboTimer -= raw;
      if (this.comboTimer <= 0) this.resetCombo();
    }

    // ---- post fx uniforms ----
    this.damageFx += ((1 - this.player.hp / this.player.maxHp > 0.65 ? 0.4 : 0) - this.damageFx) * 0.05;
    const hurtPulse = this.player.hurtCooldown > 0 ? this.player.hurtCooldown / 0.35 : 0;
    this.graceFx = Math.max(0, this.graceFx - raw * 0.55);
    this.grade.uniforms.uTime.value = this.time;
    this.grade.uniforms.uDamage.value = Math.min(0.55, this.damageFx + hurtPulse * 0.35);
    this.grade.uniforms.uGrace.value = this.graceFx;
    this.grade.uniforms.uDeath.value = this.deathFx;
    this.bloom.strength = 0.66 + (this.boss.aggro && !this.boss.dead ? 0.22 : 0) + this.graceFx * 0.5;

    if (this.bannerT > 0) this.bannerT -= raw;

    if (this.victory && !this.victoryShown && !this.victoryDismissed && this.time - this.victoryAt > 6.5) {
      this.victoryShown = true;
      document.exitPointerLock?.();
      this.emit();
    }

    this.composer.render();

    if (performance.now() - this.lastHud > 60) {
      this.lastHud = performance.now();
      this.emit(alive);
    }
  };

  private computeMarker(): { x: number; y: number; dist: number } | null {
    if (!this.beacon.visible || this.dialogue) return null;
    const dist = Math.hypot(this.player.pos.x - this.beaconTarget.x, this.player.pos.z - this.beaconTarget.z);
    if (dist < 7) return null;
    const v = new THREE.Vector3(this.beaconTarget.x, this.beaconTarget.y + 7, this.beaconTarget.z).project(this.camera);
    if (v.z > 1) return null;
    const x = Math.max(3, Math.min(97, (v.x * 0.5 + 0.5) * 100));
    const y = Math.max(5, Math.min(92, (-v.y * 0.5 + 0.5) * 100));
    return { x, y, dist: Math.round(dist) };
  }

  private emit(alive?: number) {
    const p = this.player;
    let lockOn: { x: number; y: number } | null = null;
    if (this.lockTarget && !this.lockTarget.dead) {
      const t = this.lockTarget;
      const v = new THREE.Vector3(t.pos.x, t.pos.y + t.centerY * t.scale, t.pos.z).project(this.camera);
      if (v.z < 1) lockOn = { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100 };
    }
    const state: HudState = {
      hp: p.hp, maxHp: p.maxHp,
      stamina: p.stamina, maxStamina: p.maxStamina,
      fp: p.fp, maxFp: p.maxFp,
      flasks: p.flasks, maxFlasks: p.maxFlasks,
      runes: p.runes,
      target: this.lockTarget && !this.lockTarget.dead && this.lockTarget.kind !== "boss"
        ? { name: this.lockTarget.name, hp: this.lockTarget.hp, maxHp: this.lockTarget.maxHp }
        : null,
      boss: this.lockTarget && !this.lockTarget.dead && this.lockTarget.kind === "boss"
        ? { name: this.lockTarget.name, hp: this.lockTarget.hp, maxHp: this.lockTarget.maxHp, phase: this.lockTarget.phaseIdx }
        : this.boss.aggro && !this.victory
          ? { name: this.boss.name, hp: this.boss.hp, maxHp: this.boss.maxHp, phase: this.boss.phaseIdx }
          : null,
      prompt: this.prompt,
      lockOn,
      enemiesLeft: alive ?? 0,
      fps: this.fps,
      bloodstain: this.bloodstain?.runes ?? 0,
      banner: this.bannerT > 0 ? this.banner : null,
      dead: this.dead,
      victory: this.victory,
      victoryShown: this.victoryShown,
      victoryName: this.victoryName,
      quality: this.qualityLevel,
      paused: this.paused,
      started: this.started,
      combo: this.comboCount,
      area:
        Math.hypot(p.pos.x, p.pos.z) < WORLD.arenaRadius + 8
          ? "Cathedral of the Sundered Flame"
          : Math.hypot(p.pos.x - WORLD.castle.x, p.pos.z - WORLD.castle.z) < WORLD.castle.r + 6
            ? "Kingsfall Keep"
            : "Ashveil Plains",
      popups: this.popups,
      objective: OBJECTIVES[Math.min(this.questStage, OBJECTIVES.length - 1)],
      hint: HINTS[Math.min(this.questStage, HINTS.length - 1)],
      marker: this.computeMarker(),
      dialogue: this.dialogue,
      upgrades: this.upgrades,
      weapon: p.weaponKind,
      mapOpen: this.mapOpen,
      map: {
        player: { x: p.pos.x, z: p.pos.z, yaw: p.yaw },
        villages: this.villages.map((v) => ({
          name: v.name,
          x: v.x,
          z: v.z,
          level: v.level,
          available: v.level < v.costs.length && p.runes >= v.costs[v.level],
        })),
        bosses: [this.boss, ...this.regionalBosses, ...(this.crownAwakened ? [this.hollowCrown] : [])].map((b) => ({
          name: b.name,
          x: b.pos.x,
          z: b.pos.z,
          main: b.bossRole === "main" || b.bossRole === "hollowCrown",
          dead: b.dead,
        })),
        graces: this.world.graceSites.map((g, i) => ({
          name: g.name,
          x: g.pos.x,
          z: g.pos.z,
          discovered: this.discoveredGraces.has(i),
          active: i === this.activeGraceIdx,
          idx: i,
        })),
        marker: this.beacon.visible ? { x: this.beaconTarget.x, z: this.beaconTarget.z } : null,
      },
    };
    const now = performance.now();
    if (this.popups.length && now - this.popups[0].born > 1400) {
      this.popups = this.popups.filter((q) => now - q.born < 1400);
    }
    for (const l of this.listeners) l(state);
  }

  run() {
    this.clock.start();
    requestAnimationFrame(this.frame);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.renderer.domElement.removeEventListener("wheel", this.onWheel);
    this.renderer.domElement.removeEventListener("contextmenu", this.onContext);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
