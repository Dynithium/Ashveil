import * as THREE from "three";
import { buildRig, poseRig, type Rig, type WeaponKind } from "./rig";
import { animateGuardianRig } from "./guardianRigs";
import { GUARDIAN_SIGNATURES, distanceToSegmentXZ, planGuardianSignature, type SignaturePlan } from "./guardianAttacks";
import type { GuardianId } from "./guardianRigs";
import { groundAt, terrainHeight } from "./terrain";
import type { Particles, Shockwaves, SwordTrail } from "./vfx";
import { audio } from "./audio";

// ---------------------------------------------------------------------------
// Shared context handed to every actor each frame
// ---------------------------------------------------------------------------
export interface GameCtx {
  dt: number;
  time: number;
  scene: THREE.Scene;
  particles: Particles;
  waves: Shockwaves;
  player: Player;
  enemies: NPC[];
  grappleAnchors?: readonly GrappleAnchor[];
  grappleEnemy?: NPC | null;
  lineBlocked?: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  resolve: (x: number, z: number, r: number) => [number, number];
  shake: (amount: number, dur?: number) => void;
  hitStop: (dur: number) => void;
  popup: (pos: THREE.Vector3, text: string, kind: string) => void;
  spawnProjectile: (opts: ProjectileOpts) => void;
  onKill: (npc: NPC) => void;
  onTrialHit?: (npc: NPC) => boolean;
  onTrialParry?: (npc: NPC) => void;
  onBossThreshold?: (npc: NPC) => boolean;
  onPlayerDeath: () => void;
  onLethalPlayerDamage?: () => boolean;
  slowmo: (scale: number, dur: number) => void;
}

export interface GrappleAnchor { id: string; name: string; pos: THREE.Vector3 }

/** Pick an anchor in the player's forward cone without requiring a Shard. */
export function selectGrappleAnchor(pos: THREE.Vector3, yaw: number, anchors: readonly GrappleAnchor[]): GrappleAnchor | null {
  const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
  let best: GrappleAnchor | null = null;
  let score = -Infinity;
  for (const anchor of anchors) {
    const dx = anchor.pos.x - pos.x, dz = anchor.pos.z - pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 3 || distance > 28 || Math.abs(anchor.pos.y - pos.y) > 16) continue;
    const dot = (dx * forwardX + dz * forwardZ) / distance;
    if (dot < 0.6) continue;
    const nextScore = dot * 2 - distance / 28;
    if (nextScore > score) { score = nextScore; best = anchor; }
  }
  return best;
}

export interface ProjectileOpts {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  damage: number;
  color: number;
  radius: number;
  fromPlayer: boolean;
  life?: number;
  explode?: number;
  gravity?: number;
  /** Luminous Arc — the crescent tears straight through its targets. */
  pierce?: boolean;
}

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
// dedicated scratch — never share with the vectors passed in
const S1 = new THREE.Vector3();
const S2 = new THREE.Vector3();
const S3 = new THREE.Vector3();
// player attack scratch
const A1 = new THREE.Vector3();
const A2 = new THREE.Vector3();
const A3 = new THREE.Vector3();
// npc move scratch
const B1 = new THREE.Vector3();
const B2 = new THREE.Vector3();
const B3 = new THREE.Vector3();

function distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  S1.subVectors(b, a);
  const len2 = S1.lengthSq() || 1e-6;
  let t = S2.subVectors(p, a).dot(S1) / len2;
  t = Math.max(0, Math.min(1, t));
  S3.copy(a).addScaledVector(S1, t);
  return S3.distanceTo(p);
}

const angleLerp = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

// ---------------------------------------------------------------------------
export abstract class Actor {
  rig: Rig;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  hp = 100;
  maxHp = 100;
  state = "idle";
  stateTime = 0;
  stateDur = 1;
  dead = false;
  radius = 0.55;
  centerY = 1.05;
  scale = 1;
  flashTime = 0;
  speedBlend = 0;
  vertical = 0;

  constructor(rig: Rig) {
    this.rig = rig;
  }

  get phase() {
    return Math.min(1, this.stateTime / this.stateDur);
  }

  setState(s: string, dur: number) {
    this.state = s;
    this.stateTime = 0;
    this.stateDur = dur;
  }

  worldCenter(out: THREE.Vector3) {
    return out.set(this.pos.x, this.pos.y + this.centerY * this.scale, this.pos.z);
  }

  flash(t = 0.14) {
    this.flashTime = t;
  }

  protected baseEm: { c: THREE.Color; i: number }[] | null = null;

  protected applyFlash(dt: number) {
    if (!this.baseEm) {
      this.baseEm = this.rig.flashMats.map((m) => ({ c: m.emissive.clone(), i: m.emissiveIntensity }));
    }
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      const k = Math.max(0, this.flashTime) / 0.14;
      for (let i = 0; i < this.rig.flashMats.length; i++) {
        const m = this.rig.flashMats[i];
        const b = this.baseEm[i];
        m.emissive.setRGB(b.c.r * b.i + k * 1.5, b.c.g * b.i + k * 0.6, b.c.b * b.i + k * 0.4);
        m.emissiveIntensity = 1;
      }
    } else if (this.flashTime > -1) {
      this.flashTime = -2;
      for (let i = 0; i < this.rig.flashMats.length; i++) {
        const m = this.rig.flashMats[i];
        m.emissive.copy(this.baseEm[i].c);
        m.emissiveIntensity = this.baseEm[i].i;
      }
    }
  }

  protected groundStick(dt: number, glide = false) {
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y > gy + 0.04 || this.vertical > 0) {
      this.vertical -= 30 * dt;
      if (glide && this.vertical < -3.5) this.vertical = -3.5;
      this.pos.y += this.vertical * dt;
      if (this.pos.y < gy) {
        this.pos.y = gy;
        this.vertical = 0;
      }
    } else {
      this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 18);
      this.vertical = 0;
    }
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
  }

  weaponSegment(base: THREE.Vector3, tip: THREE.Vector3) {
    const w = this.rig.weapon;
    if (!w) return false;
    w.updateWorldMatrix(true, false);
    base.set(0, 0, 0).applyMatrix4(w.matrixWorld);
    tip.set(0, this.rig.bladeLength + 0.25 * this.scale, 0).applyMatrix4(w.matrixWorld);
    return true;
  }
}

// ---------------------------------------------------------------------------
// PLAYER
// ---------------------------------------------------------------------------
export interface PlayerInput {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  attack: boolean;
  heavy: boolean;
  roll: boolean;
  guard: boolean;
  cast: boolean;
  heal: boolean;
  camYaw: number;
  faceYaw: number | null;
  flyUp?: boolean;
  flyDown?: boolean;
  glide?: boolean;
}

/** Per-weapon combat tuning. Shared source of truth for balance + animation. */
export const WEAPON_CONFIG: Record<
  string,
  {
    label: string;
    stamAtk: number;
    stamHeavy: number;
    dmg: [number, number, number];
    heavyDmg: number;
    atkDur: [number, number, number];
    heavyDur: number;
    trailColor: number;
    critMul: number;
    rigWeapon: WeaponKind;
    lightWindows: [number, number][];
    heavyWindow: [number, number];
    range: number;
  }
> = {
  greatsword: {
    label: "Second Blade",
    stamAtk: 16, stamHeavy: 34,
    dmg: [21, 24, 33], heavyDmg: 52,
    atkDur: [0.7, 0.7, 0.86], heavyDur: 1.02,
    trailColor: 0xbfe4ff, critMul: 1.85, rigWeapon: "greatsword",
    lightWindows: [[0.32, 0.6], [0.28, 0.54], [0.38, 0.6]],
    heavyWindow: [0.44, 0.68],
    range: 0.75,
  },
  twinblades: {
    label: "Twin Blades",
    stamAtk: 9, stamHeavy: 24,
    dmg: [11, 12, 16], heavyDmg: 28,
    atkDur: [0.4, 0.4, 0.5], heavyDur: 0.85,
    trailColor: 0xff6a52, critMul: 1.6, rigWeapon: "twinblades",
    lightWindows: [[0.16, 0.32], [0.16, 0.32], [0.2, 0.4]],
    heavyWindow: [0.3, 0.62],
    range: 0.6,
  },
  halberd: {
    label: "Halberd",
    stamAtk: 20, stamHeavy: 40,
    dmg: [26, 28, 40], heavyDmg: 64,
    atkDur: [0.78, 0.78, 0.98], heavyDur: 1.2,
    trailColor: 0x9fd8ff, critMul: 2.0, rigWeapon: "halberd",
    lightWindows: [[0.4, 0.62], [0.4, 0.62], [0.5, 0.72]],
    heavyWindow: [0.5, 0.74],
    range: 0.95,
  },
  // ------------------------------------------------------------------ relics
  longbow: {
    label: "Raeku Longbow",
    stamAtk: 8, stamHeavy: 24,
    dmg: [26, 26, 26], heavyDmg: 120,
    atkDur: [0.42, 0.42, 0.42], heavyDur: 1.18,
    trailColor: 0x8fffd4, critMul: 1.5, rigWeapon: "longbow",
    lightWindows: [[0.14, 0.3], [0.14, 0.3], [0.14, 0.3]],
    heavyWindow: [0.64, 0.8],
    range: 0.6,
  },
  breacher: {
    label: "Breacher Gauntlet",
    stamAtk: 10, stamHeavy: 26,
    dmg: [25, 28, 33], heavyDmg: 46,
    atkDur: [0.55, 0.55, 0.66], heavyDur: 1.02,
    trailColor: 0xffd06a, critMul: 1.4, rigWeapon: "breacher",
    lightWindows: [[0.2, 0.4], [0.2, 0.4], [0.26, 0.46]],
    heavyWindow: [0.42, 0.64],
    range: 0.9,
  },
  pike: {
    label: "Voltaic Pike",
    stamAtk: 7, stamHeavy: 17,
    dmg: [17, 17, 22], heavyDmg: 52,
    atkDur: [0.34, 0.34, 0.44], heavyDur: 0.78,
    trailColor: 0x7ae0ff, critMul: 1.6, rigWeapon: "pike",
    lightWindows: [[0.12, 0.28], [0.12, 0.28], [0.16, 0.34]],
    heavyWindow: [0.2, 0.44],
    range: 2.5,
  },
  chakram: {
    label: "Cinder Chakram",
    stamAtk: 8, stamHeavy: 20,
    dmg: [28, 28, 28], heavyDmg: 14,
    atkDur: [0.36, 0.36, 0.36], heavyDur: 0.6,
    trailColor: 0xffc26a, critMul: 1.7, rigWeapon: "chakram",
    lightWindows: [[0.1, 0.26], [0.1, 0.26], [0.1, 0.26]],
    heavyWindow: [0.2, 0.42],
    range: 0.7,
  },
  buckler: {
    label: "Aegis Buckler",
    stamAtk: 7, stamHeavy: 18,
    dmg: [13, 13, 16], heavyDmg: 32,
    atkDur: [0.4, 0.4, 0.5], heavyDur: 0.85,
    trailColor: 0x6fe0ff, critMul: 1.3, rigWeapon: "buckler",
    lightWindows: [[0.16, 0.34], [0.16, 0.34], [0.2, 0.4]],
    heavyWindow: [0.3, 0.56],
    range: 0.7,
  },
};

export const RELIC_IDS = ["longbow", "breacher", "pike", "chakram", "buckler"] as const;
export const isRelic = (kind: string) => (RELIC_IDS as readonly string[]).includes(kind);

export class Player extends Actor {
  stamina = 120;
  maxStamina = 120;
  fp = 80;
  maxFp = 80;
  flasks = 5;
  maxFlasks = 5;
  runes = 0;
  trail!: SwordTrail;
  invuln = 0;
  comboIndex = 0;
  comboWindow = 0;
  queued: "light" | "heavy" | null = null;
  hitSet = new Set<Actor>();
  staminaRegenDelay = 0;
  guardHeld = false;
  parryWindow = 0;
  lastStepPhase = 0;
  atGrace = false;
  poise = 0;
  hurtCooldown = 0;
  aura!: THREE.PointLight;
  bladePower = 1;
  magicPower = 1;
  weaponKind: string = "greatsword";
  godMode = false;
  /** Shards of Light carried (0..8) — kept for HUD/UI display. */
  shards = 0;
  /** Which guardians have fallen — unlocks Kinter's awakened powers. */
  shardPowers = new Set<string>();
  // ---- The Ashfall Relics + frontier gear ----
  relicsOwned = new Set<string>();
  relicHeat = 0;
  /** Shrines of Light temper the suit — scales how fast Relic use builds heat. */
  relicHeatRate = 1;
  overheatT = 0;
  coreRegenDelay = 0;
  overdriveT = 0;
  overdriveCooldown = 0;
  private skyStepUsed = false;
  private grappleTarget: THREE.Vector3 | null = null;
  private grappleTimer = 0;
  afterimage: { pos: THREE.Vector3; root: THREE.Group; remaining: number } | null = null;
  orbitSawT = 0;
  private orbitSawTick = 0;
  pikeVault = false;
  grappleKnown = false;
  ashBursts = 3;
  maxAshBursts = 5;
  /** Installed filter condition; spare canisters also power Ash Burst. */
  filterCondition = 100;
  sanctuaryBlessing = false;
  private seismicFired = false;
  private mirrorBurstFired = false;
  private relicShotFired = false;
  private orbitSawFired = false;

  static rigOptions(weapon: WeaponKind) {
    return {
      scale: 1,
      bulk: 1.02,
      armor: 0x6c6f78,
      armorDark: 0x2b2b30,
      cloth: 0x5c1f1c,
      accent: 0x8fd4ff,
      accentIntensity: 2.6,
      weapon,
      cape: true,
    } as const;
  }

  constructor() {
    super(buildRig(Player.rigOptions("greatsword")));
    this.maxHp = 140;
    this.hp = 140;
    this.radius = 0.5;
    this.centerY = 1.05;
    this.aura = new THREE.PointLight(0x86c6ff, 0.9, 9, 2);
    this.aura.position.y = 1.3;
    this.rig.root.add(this.aura);
  }

  /** Builds a fresh rig for the given weapon without touching the scene. */
  buildWeaponRig(kind: string): Rig {
    const cfg = WEAPON_CONFIG[kind] ?? WEAPON_CONFIG.greatsword;
    const rig = buildRig(Player.rigOptions(cfg.rigWeapon));
    return rig;
  }

  /** Swaps the active rig (caller is responsible for scene add/remove). */
  adoptRig(rig: Rig, kind: string) {
    this.rig = rig;
    this.weaponKind = kind;
    // The flash cache holds material refs from the OLD rig — rebuild it.
    this.baseEm = null;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.rig.root.add(this.aura);
  }

  get moving() {
    return this.state === "locomotion";
  }

  canAct() {
    return !this.dead && ["idle", "locomotion", "guard"].includes(this.state);
  }

  private spend(n: number) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaRegenDelay = 0.65;
  }

  private spendCore(amount: number): boolean {
    if (this.godMode) return true;
    if (this.fp < amount) return false;
    this.fp -= amount;
    this.coreRegenDelay = 1.5;
    return true;
  }

  /** A basic jump makes ledges reachable without requiring a relic. */
  jump(ctx: GameCtx): boolean {
    if (!this.canAct() || this.stamina < 12 || this.pos.y > groundAt(this.pos.x, this.pos.z, this.pos.y) + 0.15) return false;
    this.spend(12);
    this.vertical = 8.5;
    this.skyStepUsed = false;
    ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.15, z: this.pos.z, count: 12, speed: 2, size: 5, life: 0.45, color: 0x8fd4ff, grav: -2 });
    return true;
  }

  /** The Leviathan's Shard overclocks movement and attacks for fifteen seconds. */
  activateOverdrive(ctx: GameCtx): boolean {
    if (!this.shardPowers.has("leviathan") || !this.canAct() || this.overdriveCooldown > 0 || this.fp < 20) return false;
    this.spendCore(20);
    this.overdriveT = 15;
    this.overdriveCooldown = 30;
    audio.ui("click");
    ctx.waves.spawn(this.pos.clone().setY(this.pos.y + 0.5), 0xffb45e, 4.5, 0.7);
    ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z, count: 50, speed: 5, size: 7, life: 0.8, color: 0xffb45e, grav: -1 });
    ctx.popup(this.pos.clone().setY(this.pos.y + 2), "CORE OVERDRIVE", "heal");
    return true;
  }

  private addRelicHeat(ctx: GameCtx, amount: number) {
    this.relicHeat = Math.min(100, this.relicHeat + amount);
    if (this.relicHeat >= 100) {
      this.overheatT = 5;
      this.relicHeat = 0;
      audio.suit(false);
      ctx.popup(V2.copy(this.pos).setY(this.pos.y + 2.1), "SUIT OVERHEATED", "warn");
      ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z, count: 40, speed: 4, size: 7, life: 0.7, color: 0xff9a3a, grav: 1.5 });
    }
  }

  /** C — pop a spent filter canister: ash floods the foes, not your lungs. */
  ashBurst(ctx: GameCtx) {
    if (this.ashBursts <= 0 || this.dead || !this.canAct()) return false;
    this.ashBursts--;
    audio.explosion();
    ctx.shake(0.7, 0.4);
    ctx.waves.spawn(this.pos.clone().setY(this.pos.y + 0.5), 0xb8a88a, 9.5, 0.8);
    ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.8, z: this.pos.z, count: 120, speed: 9, size: 9, life: 1.0, color: 0x9a8a70, grav: -1.5, spread: 1.4, upBias: 1.5 });
    for (const e of ctx.enemies) {
      if (e.dead || e.dormant) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < 9) {
        e.damage(26, this.pos, ctx, 60);
        if (e.kind !== "boss") { e.aggro = false; e.setState("stagger", 1.5); }
        else e.setState("stagger", 0.7);
      }
    }
    ctx.popup(V2.copy(this.pos).setY(this.pos.y + 2.1), "ASH BURST", "warn");
    return true;
  }

  replaceFilter(): boolean {
    if (this.dead || !this.canAct() || this.ashBursts <= 0 || this.filterCondition >= 99.9) return false;
    this.ashBursts--;
    this.filterCondition = 100;
    audio.suit(true);
    return true;
  }

  /** Hazard exposure is not a directional attack and cannot be parried. */
  damageFromExposure(amount: number, ctx: GameCtx) {
    if (this.dead || this.godMode || amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash();
    ctx.popup(this.pos.clone().setY(this.pos.y + 2), `FILTER −${Math.round(amount)}`, "playerhurt");
    if (this.hp <= 0) {
      if (ctx.onLethalPlayerDamage?.()) return;
      this.dead = true;
      this.setState("death", 2.2);
      audio.death();
      ctx.onPlayerDeath();
    }
  }

  /** G — latch onto a world anchor or pull toward a target in front of Kinter. */
  grapple(ctx: GameCtx) {
    if (!this.grappleKnown || this.dead || !this.canAct() || this.fp < 12) return false;
    const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const inFront = (pos: THREE.Vector3, range: number) => {
      const dx = pos.x - this.pos.x, dz = pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      return d >= 1.5 && d <= range && (dx * dir.x + dz * dir.z) / d > 0.7;
    };
    const shielded = this.shardPowers.has("forgemaster")
      ? ctx.enemies.filter((enemy) => (!ctx.grappleEnemy || enemy === ctx.grappleEnemy) && !enemy.dead && !enemy.dormant && enemy.shieldEnabled && !!enemy.rig.shield && enemy.shieldDisarmedT <= 0 && inFront(enemy.pos, 18))
        .sort((a, b) => Number(b === ctx.grappleEnemy) - Number(a === ctx.grappleEnemy) || a.pos.distanceToSquared(this.pos) - b.pos.distanceToSquared(this.pos))[0]
      : undefined;
    this.spendCore(12);
    this.invuln = Math.max(this.invuln, 0.35);
    audio.roll();
    ctx.shake(0.25, 0.15);
    let endpoint: THREE.Vector3;
    if (shielded && shielded.disarmShield(8)) {
      this.cancelGrapple();
      this.setState("roll", 0.4);
      this.vel.set(0, 0, 0);
      shielded.vel.addScaledVector(dir, -8);
      shielded.setState("stagger", 0.9);
      endpoint = shielded.pos.clone().setY(shielded.pos.y + 1);
      ctx.popup(endpoint.clone(), "SHIELD DISARMED", "parry");
    } else {
      const locked = ctx.grappleEnemy && !ctx.grappleEnemy.dead && !ctx.grappleEnemy.dormant && inFront(ctx.grappleEnemy.pos, 18) ? ctx.grappleEnemy : null;
      const anchor = locked ? null : selectGrappleAnchor(this.pos, this.yaw, ctx.grappleAnchors ?? []);
      const enemy = locked ?? ctx.enemies.filter((target) => !target.dead && !target.dormant && inFront(target.pos, 18))
        .sort((a, b) => a.pos.distanceToSquared(this.pos) - b.pos.distanceToSquared(this.pos))[0];
      endpoint = anchor ? anchor.pos.clone() : enemy ? enemy.pos.clone().setY(enemy.pos.y + 2) : this.pos.clone().addScaledVector(dir, 9).setY(this.pos.y + 1);
      this.setState("roll", anchor || enemy ? 0.85 : 0.4);
      this.vel.set(dir.x * 21, 0, dir.z * 21);
      this.grappleTarget = anchor || enemy ? endpoint.clone().add(new THREE.Vector3(0, -1, 0)) : null;
      this.grappleTimer = this.grappleTarget ? 0.85 : 0;
    }
    const from = this.pos.clone().setY(this.pos.y + 1);
    for (let i = 1; i <= 10; i++) {
      const point = from.clone().lerp(endpoint, i / 10);
      ctx.particles.emit({ x: point.x, y: point.y, z: point.z, count: 2, speed: 0.25, size: 4, life: 0.35, color: 0xcfd6e2, grav: 0 });
    }
    ctx.waves.spawn(endpoint, 0xcfd6e2, 1.5, 0.35, false);
    return true;
  }

  cancelGrapple() { this.grappleTarget = null; this.grappleTimer = 0; }

  damage(amount: number, fromPos: THREE.Vector3, ctx: GameCtx, poiseDmg = 10): boolean | "parry" {
    if (this.dead || this.invuln > 0 || this.hurtCooldown > 0) return false;
    let dmg = amount;
    const facing = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const toAtk = V1.subVectors(fromPos, this.pos).setY(0).normalize();
    const blocking = this.state === "guard" && facing.dot(toAtk) > 0.25;

    if (blocking) {
      if (this.parryWindow > 0) {
        audio.parry();
        ctx.shake(0.5, 0.25);
        ctx.hitStop(0.09);
        ctx.popup(V2.copy(this.pos).setY(this.pos.y + 1.9), "PARRY", "parry");
        ctx.particles.emit({ x: fromPos.x, y: fromPos.y, z: fromPos.z, count: 40, speed: 8, size: 7, life: 0.5, color: 0xfff0c0, grav: -3 });
        ctx.waves.spawn(V2.copy(this.pos).addScaledVector(facing, 1.2).setY(this.pos.y + 1.2), 0xffe9b0, 3.2, 0.4, false);
        // Aegis Counter (shard 2) — a perfect block rips the attacker apart
        if (this.shardPowers.has("captain")) {
          for (const e of ctx.enemies) {
            if (e.dead || e.dormant) continue;
            const ddx = e.pos.x - this.pos.x;
            const ddz = e.pos.z - this.pos.z;
            if (Math.hypot(ddx, ddz) < 7.5) e.damage(85, this.pos, ctx, 40);
          }
          ctx.waves.spawn(this.pos.clone().setY(this.pos.y + 1), 0xffe9b0, 8.5, 0.7);
        }
        this.parryWindow = 0;
        return "parry";
      }
      const cost = dmg * 0.62;
      dmg *= 0.16;
      this.spend(cost);
      audio.hit("metal");
      ctx.particles.emit({ x: fromPos.x, y: fromPos.y, z: fromPos.z, count: 22, speed: 6, size: 5, life: 0.4, color: 0xffd27a });
      ctx.shake(0.28, 0.18);
      if (this.stamina <= 0) {
        this.setState("stagger", 1.1);
        ctx.popup(V2.copy(this.pos).setY(this.pos.y + 2.0), "GUARD BROKEN", "warn");
      }
    }

    this.hp = Math.max(0, this.hp - dmg);
    this.flash();
    this.hurtCooldown = 0.35;
    ctx.shake(blocking ? 0.3 : 0.75, 0.3);
    ctx.popup(V2.copy(this.pos).setY(this.pos.y + 1.95), Math.round(dmg).toString(), "playerhurt");

    if (!blocking) {
      this.cancelGrapple();
      audio.hit("flesh");
      ctx.particles.emit({
        x: this.pos.x, y: this.pos.y + 1.1, z: this.pos.z,
        count: 26, speed: 4.5, size: 6, life: 0.6, color: 0x8e1c17, grav: -9,
      });
      this.poise += poiseDmg;
      const knock = V1.subVectors(this.pos, fromPos).setY(0).normalize().multiplyScalar(3.2);
      this.vel.add(knock);
      if (this.poise > 34 || dmg > this.maxHp * 0.28) {
        this.setState("hurt", 0.42);
        this.poise = 0;
      }
    }

    if (this.hp <= 0 && !this.dead) {
      if (ctx.onLethalPlayerDamage?.()) return true;
      this.dead = true;
      this.setState("death", 2.2);
      audio.death();
      ctx.onPlayerDeath();
    }
    return true;
  }

  /** Afterimage Dash leaves a short-lived target at the start of the dodge. */
  private afterimageBurst(ctx: GameCtx) {
    this.clearAfterimage(ctx.scene);
    const root = new THREE.Group();
    const light = new THREE.MeshBasicMaterial({ color: 0x9fdfff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.8, 0.34), light);
    torso.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), light);
    head.position.y = 1.72;
    root.add(torso, head);
    for (const x of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), light);
      leg.position.set(x, 0.38, 0);
      root.add(leg);
    }
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    ctx.scene.add(root);
    this.afterimage = { pos: this.pos.clone(), root, remaining: 2.5 };
    ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.9, z: this.pos.z, count: 60, speed: 5.5, size: 10, life: 1.1, color: 0xffd9a0, grav: -0.5, spread: 0.9 });
    ctx.waves.spawn(this.pos.clone().setY(this.pos.y + 0.5), 0x9fdfff, 4, 0.65);
  }

  clearAfterimage(scene: THREE.Scene) {
    if (!this.afterimage) return;
    scene.remove(this.afterimage.root);
    this.afterimage.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) material.dispose();
    });
    this.afterimage = null;
  }

  heal(ctx: GameCtx) {
    if (this.flasks <= 0 || this.dead || !this.canAct()) return;
    this.flasks--;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.62);
    audio.heal();
    ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z, count: 60, speed: 2.4, size: 7, life: 1.5, color: 0xffd27a, grav: 2.6, upBias: 2 });
    ctx.popup(V2.copy(this.pos).setY(this.pos.y + 2.1), "+" + Math.round(this.maxHp * 0.62), "heal");
  }

  update(input: PlayerInput, ctx: GameCtx) {
    const dt = ctx.dt;
    this.stateTime += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.parryWindow = Math.max(0, this.parryWindow - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.poise = Math.max(0, this.poise - dt * 14);
    // relics: suit heat bleeds off slowly; an overheated suit is a sluggish suit
    this.relicHeat = Math.max(0, this.relicHeat - 13 * dt);
    this.overheatT = Math.max(0, this.overheatT - dt);
    this.coreRegenDelay = Math.max(0, this.coreRegenDelay - dt);
    this.overdriveT = Math.max(0, this.overdriveT - dt);
    this.overdriveCooldown = Math.max(0, this.overdriveCooldown - dt);
    if (this.afterimage) {
      this.afterimage.remaining -= dt;
      if (this.afterimage.remaining <= 0) this.clearAfterimage(ctx.scene);
      else this.afterimage.root.scale.setScalar(0.96 + Math.sin(ctx.time * 8) * 0.04);
    }
    if (this.orbitSawT > 0) {
      this.orbitSawT = Math.max(0, this.orbitSawT - dt);
      this.orbitSawTick = Math.max(0, this.orbitSawTick - dt);
      if (this.orbitSawTick <= 0) {
        this.orbitSawTick = 0.26;
        for (const e of ctx.enemies) {
          if (e.dead || e.dormant) continue;
          if (Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 3.0) {
            e.damage(16, this.pos, ctx, 24);
          }
        }
        ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.9, z: this.pos.z, count: 6, speed: 3.2, size: 6, life: 0.3, color: 0xffc26a, grav: -1, upBias: 0.4 });
      }
    }
    this.applyFlash(dt);

    if (this.dead) {
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.groundStick(dt);
      poseRig(this.rig, { dt, time: ctx.time, speed: 0, state: "death", phase: this.phase, combo: 0 });
      this.trail?.clear();
      return;
    }

    // Respawn drops us in "grace" — let it expire on its own so a still body
    // isn't locked out of acting forever.
    if (this.state === "grace" && this.stateTime >= this.stateDur) {
      this.setState("idle", 0.1);
    }

    // ------------------------- stamina ------------------------------------
    if (this.godMode) {
      this.stamina = this.maxStamina;
      this.fp = this.maxFp;
      this.hp = this.maxHp;
      this.flasks = this.maxFlasks;
      this.relicHeat = 0;
      this.overheatT = 0;
      this.orbitSawT = 0;
    } else {
      this.staminaRegenDelay = Math.max(0, this.staminaRegenDelay - dt);
      if (this.staminaRegenDelay <= 0) {
        const rate = (this.state === "guard" ? 12 : 34) * (this.overdriveT > 0 ? 1.35 : 1);
        this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
      }
      if (this.coreRegenDelay <= 0) this.fp = Math.min(this.maxFp, this.fp + (this.overdriveT > 0 ? 2.6 : 1.4) * (this.overheatT > 0 ? 0.3 : 1) * dt);
    }

    // ------------------------- input intents -------------------------------
    const mag = Math.hypot(input.moveX, input.moveZ);
    const wantMove = mag > 0.08;
    const moveYaw = wantMove ? Math.atan2(input.moveX, input.moveZ) + input.camYaw : this.yaw;
    const desiredYaw = input.faceYaw !== null ? input.faceYaw : moveYaw;
    const grounded = this.pos.y <= groundAt(this.pos.x, this.pos.z, this.pos.y) + 0.15 && this.vertical <= 0;
    if (grounded) this.skyStepUsed = false;

    if (this.canAct()) {
      if (this.godMode && input.roll) {
        // Space is the "ascend" key in fly mode — never roll
      } else if (input.roll && this.stamina >= 22 && !(this.shardPowers.has("sentinel") && !grounded && this.skyStepUsed)) {
        this.spend(22);
        const powered = this.spendCore(6);
        // Afterimage Dash (shard 3) — longer invulnerability through the roll
        this.invuln = this.shardPowers.has("stalker") ? 0.62 : 0.42;
        audio.roll();
        const gy = groundAt(this.pos.x, this.pos.z, this.pos.y);
        const airborne = this.pos.y > gy + 0.5;
        if (powered && this.shardPowers.has("sentinel") && airborne) {
          // One aerial dash per jump; landing restores it.
          this.skyStepUsed = true;
          this.vertical = Math.max(this.vertical, 8.5);
          if (wantMove) this.yaw = moveYaw;
          this.setState("roll", 0.62);
          this.vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(7.2);
        } else if (wantMove) {
          this.yaw = moveYaw;
          this.setState("roll", this.overheatT > 0 ? 0.5 : 0.62);
          this.vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(this.overheatT > 0 || !powered ? 6.4 : 11.5);
        } else {
          this.setState("backstep", 0.44);
          this.vel.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(8.5);
        }
        // Afterimage Dash — a decoy of light that erupts where Kinter vanished
        if (powered && this.shardPowers.has("stalker")) this.afterimageBurst(ctx);
        ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.15, z: this.pos.z, count: 24, speed: 3, size: 8, life: 0.7, color: this.shardPowers.has("stalker") ? 0xffd9a0 : 0x6b5c48, grav: -1.5 });
      } else if (input.heavy && this.stamina >= (WEAPON_CONFIG[this.weaponKind]?.stamHeavy ?? 34) && (!isRelic(this.weaponKind) || this.godMode || this.fp >= 14)) {
        const cfg = WEAPON_CONFIG[this.weaponKind] ?? WEAPON_CONFIG.greatsword;
        this.spend(cfg.stamHeavy);
        this.setState("heavy", cfg.heavyDur / (this.overdriveT > 0 ? 1.25 : 1));
        this.hitSet.clear();
        this.comboIndex = 0;
        audio.swing(1.5);
        if (wantMove) this.yaw = desiredYaw;
        if (isRelic(this.weaponKind)) { this.spendCore(14); this.addRelicHeat(ctx, 14 * this.relicHeatRate); }
        if (this.weaponKind === "pike") {
          // Vaulting Lunge — plant the pike, ride the storm over the fray
          this.pikeVault = true;
          this.vertical = Math.max(this.vertical, 9.6);
          this.vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(10.5);
          ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z, count: 30, speed: 5, size: 6, life: 0.6, color: 0x7ae0ff, grav: -2 });
        }
        if (this.weaponKind === "breacher") this.seismicFired = false;
        if (this.weaponKind === "buckler") this.mirrorBurstFired = false;
      } else if (input.attack && this.stamina >= (WEAPON_CONFIG[this.weaponKind]?.stamAtk ?? 16) && (!isRelic(this.weaponKind) || this.godMode || this.fp >= 6)) {
        const cfg = WEAPON_CONFIG[this.weaponKind] ?? WEAPON_CONFIG.greatsword;
        this.spend(cfg.stamAtk);
        this.comboIndex = this.comboWindow > 0 ? (this.comboIndex + 1) % 3 : 0;
        this.setState("attack", cfg.atkDur[this.comboIndex] / (this.overdriveT > 0 ? 1.25 : 1));
        this.hitSet.clear();
        audio.swing(this.weaponKind === "twinblades" ? 0.7 : 1);
        if (wantMove) this.yaw = desiredYaw;
        if (isRelic(this.weaponKind)) { this.spendCore(6); this.addRelicHeat(ctx, 9 * this.relicHeatRate); }
      } else if (input.cast && this.fp >= 22) {
        this.spendCore(22);
        this.castSpell = true;
        this.setState("cast", 0.92);
        audio.fire();
        if (wantMove) this.yaw = desiredYaw;
        // Luminous Arc (shard 4) — the bolt splits into a crescent of light
        this.castEmpowered = this.shardPowers.has("warden");
      } else if (input.heal) {
        // Don't enter the cast state (and never launch the fireball) if the
        // flask can't actually be consumed.
        if (this.flasks > 0 && !this.dead && this.canAct()) {
          this.heal(ctx);
          this.setState("cast", 0.7);
        }
      } else if ((input.attack || input.heavy) && isRelic(this.weaponKind) && !this.godMode && this.fp < (input.heavy ? 14 : 6)) {
        ctx.popup(this.pos.clone().setY(this.pos.y + 2), "CORE ENERGY LOW", "warn");
      } else if (input.guard && this.stamina > 4) {
        if (this.state !== "guard") this.parryWindow = 0.2;
        this.state = "guard";
      } else if (this.state === "guard") {
        this.state = "idle";
      }
    }

    // ------------------------- god-mode free flight ------------------------
    if (this.godMode) {
      const flySpeed = input.sprint ? 46 : 20; // sprint = warp speed for scanning the map
      if (wantMove) {
        this.yaw = angleLerp(this.yaw, desiredYaw, Math.min(1, dt * 16));
        this.vel.x += (Math.sin(moveYaw) * flySpeed - this.vel.x) * Math.min(1, dt * 12);
        this.vel.z += (Math.cos(moveYaw) * flySpeed - this.vel.z) * Math.min(1, dt * 12);
        if (this.state !== "guard") this.state = "locomotion";
      } else {
        this.vel.x *= Math.exp(-10 * dt);
        this.vel.z *= Math.exp(-10 * dt);
        if (this.state === "locomotion") this.state = "idle";
      }
      // vertical: Space rises, Ctrl descends, otherwise hover in place
      const lift = (input.flyUp ? 1 : 0) - (input.flyDown ? 1 : 0);
      this.vertical += (lift * flySpeed - this.vertical) * Math.min(1, dt * 12);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vertical * dt;
      // clamp to sane world bounds so you can't fly forever
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > 400) { this.pos.x = (this.pos.x / r) * 400; this.pos.z = (this.pos.z / r) * 400; }
      this.pos.y = Math.max(terrainHeight(this.pos.x, this.pos.z) - 2, Math.min(this.pos.y, 260));
      this.rig.root.position.copy(this.pos);
      this.rig.root.rotation.y = this.yaw;
      this.speedBlend += ((wantMove ? 1 : 0) - this.speedBlend) * Math.min(1, dt * 8);
      poseRig(this.rig, { dt, time: ctx.time, speed: this.speedBlend, state: wantMove ? "locomotion" : "idle", phase: this.phase, combo: this.comboIndex, weapon: this.weaponKind });
      this.resolveAttack(ctx);
      this.resolveCast(ctx);
      this.aura.color.setHex(0xffd27a);
      this.aura.intensity = 3.5 + Math.sin(ctx.time * 6) * 0.8;
      return;
    }

    // ------------------------- movement ------------------------------------
    let speedTarget = 0;
    const locked = ["attack", "heavy", "roll", "backstep", "hurt", "stagger", "cast"].includes(this.state);

    if (!locked) {
      const base = (input.guard ? 2.6 : input.sprint && this.stamina > 6 ? 8.4 : 4.6) * (this.overdriveT > 0 ? 1.25 : 1);
      if (input.sprint && wantMove && !input.guard) this.spend(11 * dt);
      if (wantMove) {
        this.yaw = angleLerp(this.yaw, desiredYaw, Math.min(1, dt * (input.guard ? 9 : 14)));
        const spd = base * Math.min(1, mag);
        this.vel.x += (Math.sin(moveYaw) * spd - this.vel.x) * Math.min(1, dt * 13);
        this.vel.z += (Math.cos(moveYaw) * spd - this.vel.z) * Math.min(1, dt * 13);
        speedTarget = base > 6 ? 1 : 0.5;
        if (this.state !== "guard") this.state = "locomotion";
      } else {
        this.vel.x *= Math.exp(-14 * dt);
        this.vel.z *= Math.exp(-14 * dt);
        if (this.state === "locomotion") this.state = "idle";
      }
    } else {
      // root motion
      let push = 0;
      if (this.state === "attack") push = this.phase > 0.24 && this.phase < 0.52 ? 7 : 0;
      if (this.state === "heavy") push = this.phase > 0.4 && this.phase < 0.62 ? 8.5 : 0;
      if (push > 0) {
        this.vel.x += (Math.sin(this.yaw) * push - this.vel.x) * Math.min(1, dt * 9);
        this.vel.z += (Math.cos(this.yaw) * push - this.vel.z) * Math.min(1, dt * 9);
      } else {
        this.vel.x *= Math.exp(-(this.state === "roll" ? 3.4 : 9) * dt);
        this.vel.z *= Math.exp(-(this.state === "roll" ? 3.4 : 9) * dt);
      }
    }

    if (this.grappleTarget && this.grappleTimer > 0) {
      this.grappleTimer = Math.max(0, this.grappleTimer - dt);
      const dx = this.grappleTarget.x - this.pos.x, dz = this.grappleTarget.z - this.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 1.5) {
        const speed = Math.min(22, distance / Math.max(dt, 0.001));
        this.vel.x = dx / distance * speed;
        this.vel.z = dz / distance * speed;
      } else { this.vel.x = 0; this.vel.z = 0; }
      this.vertical = THREE.MathUtils.clamp((this.grappleTarget.y - this.pos.y) * 2.5, -4, 12);
      if (this.grappleTimer <= 0 || (distance <= 1.5 && Math.abs(this.grappleTarget.y - this.pos.y) < 1.5)) this.cancelGrapple();
    }
    this.pos.addScaledVector(this.vel, dt);

    // separation from enemies (before collider resolve so walls win last)
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const dx = this.pos.x - e.pos.x;
      const dz = this.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + e.radius;
      if (d < min) {
        if (d > 1e-4) {
          const p = ((min - d) / d) * 0.6;
          this.pos.x += dx * p;
          this.pos.z += dz * p;
        } else {
          const a = Math.abs(Math.sin(this.pos.x * 12.9898 + e.pos.z * 78.233)) * Math.PI * 2;
          this.pos.x += Math.cos(a) * min * 0.5;
          this.pos.z += Math.sin(a) * min * 0.5;
        }
      }
    }

    const [nx, nz] = ctx.resolve(this.pos.x, this.pos.z, this.radius);
    this.pos.x = nx;
    this.pos.z = nz;

    this.groundStick(dt, !!input.glide && this.shardPowers.has("sentinel") && this.vertical < 0);

    // Vaulting Lunge — crash down on whatever the sky lined up for you
    if (this.pikeVault) {
      const gy = groundAt(this.pos.x, this.pos.z, this.pos.y);
      const fell = this.pos.y <= gy + 0.12;
      if (fell && this.vertical <= 0.01) {
        this.pikeVault = false;
        audio.explosion();
        ctx.shake(0.6, 0.35);
        ctx.waves.spawn(this.pos.clone().setY(gy + 0.3), 0x7ae0ff, 4.6, 0.6);
        ctx.particles.emit({ x: this.pos.x, y: gy + 0.4, z: this.pos.z, count: 80, speed: 9, size: 7, life: 0.7, color: 0x9fe8ff, grav: -6, upBias: 3, spread: 1.2 });
        for (const e of ctx.enemies) {
          if (e.dead || e.dormant) continue;
          const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
          if (d < 4.2) {
            e.damage(52 * this.bladePower * (this.godMode ? 99 : 1), this.pos, ctx, 110);
            e.vertical = Math.max(e.vertical, 5.5);
          }
        }
      }
    }

    // ------------------------- state resolution ----------------------------
    if (locked && this.stateTime >= this.stateDur) {
      if (this.state === "attack" || this.state === "heavy") this.comboWindow = 0.42;
      this.state = "idle";
      this.stateTime = 0;
      this.vel.multiplyScalar(0.3);
    }
    if (this.state === "roll" && this.phase > 0.72) this.invuln = Math.min(this.invuln, 0.02);

    // ------------------------- footsteps -----------------------------------
    if (this.state === "locomotion") {
      const ph = ctx.time * (6 + this.speedBlend * 6);
      if (Math.floor(ph / Math.PI) !== this.lastStepPhase) {
        this.lastStepPhase = Math.floor(ph / Math.PI);
        audio.step(false);
        ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z, count: 3, speed: 0.9, size: 5, life: 0.5, color: 0x594a38, grav: -1 });
      }
    }

    // ------------------------- animation -----------------------------------
    this.speedBlend += (speedTarget - this.speedBlend) * Math.min(1, dt * 8);
    poseRig(this.rig, {
      dt, time: ctx.time,
      speed: this.speedBlend,
      state: this.state,
      phase: this.phase,
      combo: this.comboIndex,
      weapon: this.weaponKind,
    });

    // ------------------------- combat resolution ---------------------------
    this.resolveAttack(ctx);
    this.resolveCast(ctx);

    this.aura.intensity = 0.7 + Math.sin(ctx.time * 3) * 0.15 + (this.state === "attack" || this.state === "heavy" ? 1.4 : 0);
    if (this.godMode) {
      this.aura.color.setHex(0xffd27a);
      this.aura.intensity = 3.5 + Math.sin(ctx.time * 6) * 0.8;
    } else {
      this.aura.color.setHex(0x86c6ff);
    }
  }

  private resolveAttack(ctx: GameCtx) {
    const cfg = WEAPON_CONFIG[this.weaponKind] ?? WEAPON_CONFIG.greatsword;
    const isLight = this.state === "attack";
    const isHeavy = this.state === "heavy";
    let active = false;
    let dmg = 0;

    // ================= RELIC WEAPONS =================
    if (this.weaponKind === "longbow") {
      const fireAt = isLight ? 0.16 : cfg.heavyWindow[0] + 0.02;
      if (isLight || isHeavy) {
        if (this.phase >= fireAt && !this.relicShotFired) {
          this.relicShotFired = true;
          const h = this.rig.handL;
          h.updateWorldMatrix(true, false);
          const origin = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
          const dir = new THREE.Vector3(Math.sin(this.yaw), 0.09, Math.cos(this.yaw)).normalize();
          const heavy = isHeavy;
          const bolt = (heavy ? 120 : 26) * this.magicPower * (this.godMode ? 99 : 1);
          ctx.spawnProjectile({
            pos: origin, dir, speed: heavy ? 64 : 46, damage: bolt,
            color: heavy ? 0xbdf2ff : 0x8fffd4, radius: heavy ? 0.85 : 0.32,
            fromPlayer: true, explode: heavy ? 2.2 : 1.4, life: 2.4, pierce: heavy,
          });
          audio.fire();
          ctx.shake(0.18, 0.12);
          ctx.particles.emit({ x: origin.x, y: origin.y, z: origin.z, count: heavy ? 40 : 14, speed: 3.5, size: 6, life: 0.4, color: 0x8fffd4, grav: 0 });
        }
      }
      if (this.state !== "attack" && this.state !== "heavy") { this.relicShotFired = false; }
      this.trail?.clear();
      return;
    }
    if (this.weaponKind === "chakram") {
      if (isLight && !this.relicShotFired && this.phase > 0.12) {
        this.relicShotFired = true;
        const origin = this.pos.clone().setY(this.pos.y + 1.15);
        const dir = new THREE.Vector3(Math.sin(this.yaw), 0.05, Math.cos(this.yaw)).normalize();
        ctx.spawnProjectile({
          pos: origin, dir, speed: 34, damage: 34 * this.bladePower * (this.godMode ? 99 : 1),
          color: 0xffc26a, radius: 0.42, fromPlayer: true, explode: 0.6, life: 1.7, pierce: true,
        });
        audio.swing(0.9);
        ctx.particles.emit({ x: origin.x, y: origin.y, z: origin.z, count: 12, speed: 2.5, size: 5, life: 0.35, color: 0xffc26a, grav: 0 });
      }
      if (this.state !== "attack" && this.state !== "heavy") this.relicShotFired = false;
      if (isHeavy && !this.orbitSawFired) {
        const fireAt = cfg.heavyWindow[0] + 0.04;
        if (this.phase >= fireAt) {
          this.orbitSawFired = true;
          this.orbitSawT = 4.5;
          this.orbitSawTick = 0;
          audio.fire();
          ctx.waves.spawn(this.pos.clone().setY(this.pos.y + 0.8), 0xffc26a, 3.4, 0.45, false);
          ctx.popup(V2.copy(this.pos).setY(this.pos.y + 2.0), "ORBITING SAW", "warn");
        }
      }
      if (this.state !== "heavy") this.orbitSawFired = false;
      this.trail?.clear();
      return;
    }
    if (this.weaponKind === "breacher" && isHeavy) {
      // Seismic Slam — the ground answers to a fist this stubborn
      const w = cfg.heavyWindow;
      if (this.phase > w[0] && !this.seismicFired) {
        this.seismicFired = true;
        audio.explosion();
        ctx.shake(0.9, 0.5);
        ctx.waves.spawn(this.pos.clone().setY(terrainHeight(this.pos.x, this.pos.z) + 0.3), 0xffd06a, 7.5, 0.8);
        ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z, count: 110, speed: 11, size: 8, life: 0.9, color: 0xa88a4a, grav: -8, upBias: 5, spread: 1.3 });
        for (const e of ctx.enemies) {
          if (e.dead || e.dormant) continue;
          const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
          if (d < 7) {
            e.damage(46 * this.bladePower * (this.godMode ? 99 : 1), this.pos, ctx, 120);
            e.vertical = Math.max(e.vertical ?? 0, e.kind === "boss" ? 2.0 : 7.5); // hauled skyward
            e.setState("stagger", Math.max(e.stateDur ?? 0.8, 0.8));
          }
        }
      }
    }
    if (this.weaponKind === "buckler" && isHeavy) {
      // Mirror Bash — answer projectiles with the same idea, better
      const w = cfg.heavyWindow;
      if (this.phase > w[0] && !this.mirrorBurstFired) {
        this.mirrorBurstFired = true;
        audio.parry();
        ctx.waves.spawn(this.pos.clone().setY(this.pos.y + 1), 0x6fe0ff, 5.2, 0.5, false);
        ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 1.1, z: this.pos.z, count: 60, speed: 8, size: 6, life: 0.5, color: 0x9ff0ff, grav: 0 });
        for (const e of ctx.enemies) {
          if (e.dead || e.dormant) continue;
          const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
          if (d < 5) {
            e.damage(34 * this.magicPower * (this.godMode ? 99 : 1), this.pos, ctx, 70);
            if (e.kind !== "boss") e.setState("stagger", 1.1);
            ctx.popup(e.pos.clone().setY(e.pos.y + 2), "MIRRORED", "magic");
          }
        }
      }
    }
    // ==================================================
    if (isLight) {
      const w = cfg.lightWindows[this.comboIndex];
      active = this.phase > w[0] && this.phase < w[1];
      dmg = cfg.dmg[this.comboIndex];
    } else if (isHeavy) {
      active = this.phase > cfg.heavyWindow[0] && this.phase < cfg.heavyWindow[1];
      dmg = cfg.heavyDmg;
      // Shatter Strike (shard 1) — heavy blows carry the colossus's ruin
      if (this.shardPowers.has("colossus")) dmg *= 1.4;
    }

    const base = A1;
    const tip = A2;
    const hasWeapon = this.weaponSegment(base, tip);
    if (hasWeapon && this.trail) {
      this.trail.push(base, tip, active, ctx.dt);
    }

    if (!active) return;

    // sparks along the blade
    if (Math.random() < 0.6) {
      ctx.particles.emit({
        x: tip.x, y: tip.y, z: tip.z, count: 2, speed: 1.2, size: 4, life: 0.28, color: 0x9fd8ff, grav: -2,
      });
    }

    const c = A3;
    if (!hasWeapon) return; // no weapon -> no segment to hit against
    for (const e of ctx.enemies) {
      if (e.dead || e.dormant || this.hitSet.has(e)) continue;
      e.worldCenter(c);
      const d = distToSegment(c, base, tip);
      if (d < e.radius + cfg.range * e.scale) {
        this.hitSet.add(e);
        const crit = this.godMode ? true : Math.random() < 0.16;
        const godMul = this.godMode ? 99 : 1;
        // Shatter Strike damage is applied in the heavy branch; Raeku Awakening (shard 8) imbues every strike
        const shardMul = this.shardPowers.has("herald") ? 1.35 : 1;
        const finalDmg = dmg * this.bladePower * godMul * (crit ? cfg.critMul : 1) * (0.92 + Math.random() * 0.16) * shardMul;
        e.damage(finalDmg, this.pos, ctx, isHeavy ? (this.shardPowers.has("colossus") ? 74 : 46) : 20);
        ctx.popup(c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5, 0)), Math.round(finalDmg).toString(), crit ? "crit" : "dmg");
        ctx.hitStop(isHeavy ? 0.04 : 0.022);
        ctx.shake(isHeavy ? 0.55 : 0.3, 0.18);
        ctx.particles.emit({ x: c.x, y: c.y, z: c.z, count: crit ? 18 : 10, speed: 6, size: 5, life: 0.35, color: 0xffc466, grav: -7 });
        ctx.particles.emit({ x: c.x, y: c.y, z: c.z, count: 8, speed: 3, size: 5, life: 0.4, color: 0x7a1512, grav: -8 });
        ctx.waves.spawn(c.clone(), 0xffd08a, 1.8, 0.3, false);
        audio.hit(crit ? "crit" : "flesh");
      }
    }
  }

  private castFired = false;
  private castSpell = false;
  private castEmpowered = false;
  private resolveCast(ctx: GameCtx) {
    if (this.state !== "cast") {
      this.castFired = false;
      this.castSpell = false;
      return;
    }
    if (!this.castSpell) return; // e.g. the healing flask reuses the cast pose
    if (!this.castFired && this.phase > 0.45) {
      this.castFired = true;
      const h = this.rig.handL;
      h.updateWorldMatrix(true, false);
      const p = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
      const dir = new THREE.Vector3(Math.sin(this.yaw), 0.02, Math.cos(this.yaw)).normalize();
      const bolt = 62 * this.magicPower * (this.godMode ? 99 : 1) * (this.castEmpowered ? 1.6 : 1);
      ctx.spawnProjectile({ pos: p, dir, speed: this.castEmpowered ? 38 : 30, damage: bolt, color: this.godMode ? 0xffd27a : this.castEmpowered ? 0xffd98a : 0x6fc6ff, radius: this.castEmpowered ? 1.05 : (this.godMode ? 1.2 : 0.55), fromPlayer: true, explode: this.castEmpowered ? 5.4 : (this.godMode ? 8 : 4.2), life: 3, pierce: this.castEmpowered });
      ctx.particles.emit({ x: p.x, y: p.y, z: p.z, count: 34, speed: 4, size: 7, life: 0.6, color: 0x6fc6ff, grav: 0 });
      ctx.shake(0.22, 0.15);
    }
    if (this.phase < 0.45) {
      const h = this.rig.handL;
      h.updateWorldMatrix(true, false);
      const p = V1.setFromMatrixPosition(h.matrixWorld);
      ctx.particles.emit({ x: p.x, y: p.y, z: p.z, count: 2, speed: 1.4, size: 5, life: 0.35, color: 0x6fc6ff, grav: 1.5 });
    }
  }
}

// ---------------------------------------------------------------------------
// ENEMIES
// ---------------------------------------------------------------------------
export type NPCKind = "wretch" | "warden" | "boss";

interface Move {
  name: string;
  dur: number;
  windup: number;
  active: [number, number];
  damage: number;
  range: number;
  lunge: number;
  poise: number;
  cooldown: number;
}

const MOVES: Record<string, Move[]> = {
  wretch: [
    { name: "slash", dur: 0.95, windup: 0.42, active: [0.44, 0.62], damage: 13, range: 2.6, lunge: 7, poise: 12, cooldown: 0.9 },
    { name: "double", dur: 1.35, windup: 0.34, active: [0.36, 0.5], damage: 10, range: 2.8, lunge: 6, poise: 10, cooldown: 1.2 },
  ],
  warden: [
    { name: "chop", dur: 1.5, windup: 0.5, active: [0.52, 0.7], damage: 26, range: 3.2, lunge: 6.5, poise: 26, cooldown: 1.4 },
    { name: "sweep", dur: 1.7, windup: 0.52, active: [0.54, 0.74], damage: 22, range: 3.6, lunge: 4, poise: 24, cooldown: 1.8 },
  ],
  boss: [
    { name: "slam", dur: 2.0, windup: 0.48, active: [0.5, 0.68], damage: 38, range: 6.5, lunge: 9, poise: 60, cooldown: 1.1 },
    { name: "sweep", dur: 1.9, windup: 0.46, active: [0.48, 0.66], damage: 32, range: 7.5, lunge: 6, poise: 55, cooldown: 1.0 },
    { name: "combo", dur: 2.7, windup: 0.34, active: [0.36, 0.48], damage: 27, range: 7, lunge: 12, poise: 45, cooldown: 1.3 },
    { name: "nova", dur: 2.6, windup: 0.95, active: [1.0, 1.0], damage: 46, range: 13, lunge: 0, poise: 80, cooldown: 2.0 },
    { name: "flamewave", dur: 2.3, windup: 0.7, active: [0.72, 0.74], damage: 30, range: 40, lunge: 0, poise: 40, cooldown: 1.6 },
    { name: "meteor", dur: 3.2, windup: 1.0, active: [1.02, 1.05], damage: 40, range: 60, lunge: 0, poise: 70, cooldown: 2.4 },
  ],
};

// ---------------------------------------------------------------------------
// SHARD GUARDIANS — signature move kits (distinct feel per lair)
// ---------------------------------------------------------------------------
const bossMove = (name: string) => MOVES.boss.find((m) => m.name === name)!;
const cloneMove = (base: Move, overrides: Partial<Move>): Move => ({ ...base, ...overrides });
const SHARD_KITS: Record<string, Move[]> = {
  // The Rusted Colossus — slow, apocalyptic, hits like a siege gun
  colossus: [
    cloneMove(bossMove("slam"), { damage: 48, cooldown: 1.25 }),
    bossMove("nova"),
    bossMove("sweep"),
    bossMove("slam"),
    bossMove("nova"),
    cloneMove(bossMove("sweep"), { damage: 40 }),
  ],
  // The Hollow Captain — a duelist, never wastes a swing
  captain: [
    cloneMove(bossMove("combo"), { damage: 28, cooldown: 1.1 }),
    bossMove("sweep"),
    bossMove("combo"),
    cloneMove(bossMove("slam"), { damage: 33, range: 5.0 }),
    bossMove("combo"),
  ],
  // The Ash-Stalker — a burnt sprint of a thing, here then not here
  stalker: [
    cloneMove(bossMove("sweep"), { lunge: 15, range: 6.5 }),
    bossMove("combo"),
    bossMove("flamewave"),
    cloneMove(bossMove("sweep"), { lunge: 15, range: 6.5 }),
    bossMove("slam"),
  ],
  // The Prism Warden — a storm given purpose, breaking light on the cliffs
  warden: [
    bossMove("nova"),
    bossMove("flamewave"),
    bossMove("nova"),
    bossMove("slam"),
    bossMove("flamewave"),
  ],
  // The Molten Leviathan — the swamp unmakes the unwary, one boil at a time
  leviathan: [
    cloneMove(bossMove("nova"), { damage: 52, cooldown: 2.2 }),
    bossMove("slam"),
    bossMove("nova"),
    bossMove("sweep"),
    cloneMove(bossMove("nova"), { damage: 46 }),
  ],
  // The Gale Sentinel — the wind itself learned to kill
  sentinel: [
    cloneMove(bossMove("sweep"), { range: 8.0, lunge: 14 }),
    bossMove("combo"),
    bossMove("flamewave"),
    cloneMove(bossMove("sweep"), { range: 8.0, lunge: 14 }),
    bossMove("combo"),
  ],
  // The Iron Forgemaster — the hammer keeps what the fire gives it
  forgemaster: [
    bossMove("meteor"),
    bossMove("slam"),
    bossMove("meteor"),
    bossMove("nova"),
    bossMove("slam"),
  ],
  // The Pale Herald — no wasted motion, no wasted light
  herald: [
    bossMove("slam"),
    bossMove("sweep"),
    bossMove("combo"),
    bossMove("nova"),
    bossMove("flamewave"),
    bossMove("meteor"),
  ],
};

/** Engaged enemies briefly pursue a nearby afterimage, without losing aggro. */
export function chooseEnemyTarget(enemyPos: THREE.Vector3, player: Player, aggro: boolean): THREE.Vector3 {
  const decoy = player.afterimage;
  return aggro && decoy && Math.hypot(enemyPos.x - decoy.pos.x, enemyPos.z - decoy.pos.z) < 18
    ? decoy.pos : player.pos;
}


export class NPC extends Actor {
  kind: NPCKind;
  aggro = false;
  target: Player | null = null;
  move: Move | null = null;
  moveCooldown = 0;
  poise = 0;
  maxPoise = 30;
  hitDone = false;
  aggroRange = 26;
  attackRange = 2.6;
  moveSpeed = 3.4;
  runeValue = 120;
  name = "Ashen Wretch";
  phaseIdx = 0;
  strafeDir = 1;
  strafeTimer = 0;
  dissolve = 0;
  glowLight?: THREE.PointLight;
  trail?: SwordTrail;
  spawnDelay = 0;
  lastStep = 0;
  /** Training effigy: never moves, never attacks, still fully damageable. */
  passive = false;
  tutorialTag = "";
  /** Set for a creature spawned by a settlement's local cull quest. */
  questCullId: string | null = null;
  shieldEnabled = true;
  shieldDisarmedT = 0;
  bossRole: "main" | "shard" = "main";
  /** Set for the eight shard-guardians — which Shard of Light they hold. */
  shardId: string | null = null;
  /** Dormant enemies are hidden and skip all updates until awakened. */
  dormant = false;
  /** The Warlord's ward — the engine scales this down while his conduits live. */
  damageTakenMul = 1;
  effectsColor = 0xff7a22;
  private signatureCooldown = 7;
  private signatureWindup = 0;
  private signaturePlan: SignaturePlan | null = null;
  private signatureTell: THREE.Group | null = null;

  get signatureWarning(): { label: string; remaining: number; duration: number } | null {
    return this.signaturePlan ? { label: this.signaturePlan.spec.label, remaining: Math.max(0, this.signatureWindup), duration: this.signaturePlan.spec.windup } : null;
  }

  constructor(kind: NPCKind, suppliedRig?: Rig) {
    let rig: Rig;
    if (suppliedRig) {
      rig = suppliedRig;
    } else if (kind === "wretch") {
      rig = buildRig({
        scale: 0.94, bulk: 0.8,
        armor: 0x4a4238, armorDark: 0x241f1a, cloth: 0x3a2b20,
        accent: 0xff6a2a, accentIntensity: 3.0, weapon: "claws", hunched: true, tattered: true,
      });
    } else if (kind === "warden") {
      rig = buildRig({
        scale: 1.12, bulk: 1.3,
        armor: 0x585c66, armorDark: 0x22242b, cloth: 0x2c3a52,
        accent: 0x8ad8ff, accentIntensity: 2.2, weapon: "swordshield", cape: true,
      });
    } else {
      rig = buildRig({
        scale: 3.5, bulk: 1.5,
        armor: 0x3a2a22, armorDark: 0x191110, cloth: 0x6b1810,
        accent: 0xff7a1e, accentIntensity: 3.4, weapon: "flamebrand", cape: true, horns: true,
      });
    }
    super(rig);
    this.kind = kind;
    this.scale = rig.height / 1.85;

    if (kind === "wretch") {
      this.maxHp = this.hp = 80;
      this.radius = 0.5;
      this.centerY = 1.0;
      this.moveSpeed = 4.4;
      this.attackRange = 2.4;
      this.aggroRange = 28;
      this.maxPoise = 24;
      this.runeValue = 180;
      this.name = "Ashen Wretch";
    } else if (kind === "warden") {
      this.maxHp = this.hp = 190;
      this.radius = 0.72;
      this.centerY = 1.15;
      this.moveSpeed = 3.0;
      this.attackRange = 3.0;
      this.aggroRange = 24;
      this.maxPoise = 52;
      this.runeValue = 520;
      this.name = "Grave Warden";
    } else {
      this.maxHp = this.hp = 1700;
      this.radius = 2.35;
      this.centerY = 1.15;
      this.moveSpeed = 5.2;
      this.attackRange = 8.2;
      this.aggroRange = 46;
      this.maxPoise = 190;
      this.runeValue = 20000;
      this.name = "MALENKAR, WARLORD OF THE ASHVEIL";
      this.glowLight = new THREE.PointLight(0xff6a1e, 6, 26, 1.8);
      this.glowLight.position.y = 3;
      this.rig.root.add(this.glowLight);
    }
  }

  damage(amount: number, fromPos: THREE.Vector3, ctx: GameCtx, poiseDmg = 15) {
    if (this.dead || this.dormant) return; // Act IV boss can't be hurt before he wakes
    if (ctx.onTrialHit?.(this)) return;
    if (this.shieldEnabled && this.rig.shield && this.shieldDisarmedT <= 0) {
      const dx = fromPos.x - this.pos.x, dz = fromPos.z - this.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.001 && (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / distance > 0.3) amount *= 0.55;
    }
    amount *= this.damageTakenMul;
    this.aggro = true;
    this.hp = Math.max(0, this.hp - amount);
    this.flash();
    this.poise += poiseDmg;

    // The final encounter must enter its scripted charge even when a single
    // hit crosses the threshold and would otherwise kill the boss outright.
    if (this.kind === "boss" && this.bossRole === "main" && ctx.onBossThreshold?.(this)) return;

    if (this.hp <= 0) {
      this.cancelGuardianSignature(ctx.scene);
      this.dead = true;
      this.setState("death", 2.6);
      this.vel.set(0, 0, 0);
      ctx.particles.emit({
        x: this.pos.x, y: this.pos.y + this.centerY * this.scale, z: this.pos.z,
        count: this.kind === "boss" ? 140 : 45, speed: this.kind === "boss" ? 11 : 5,
        size: 8, life: 1.6, color: this.kind === "boss" ? this.effectsColor : 0xffb45e, grav: -3,
      });
      ctx.waves.spawn(V1.copy(this.pos).setY(this.pos.y + 0.2).clone(), 0xffc078, this.kind === "boss" ? 14 : 5, 0.75);
      if (this.kind === "boss" && this.bossRole === "main") {
        audio.explosion();
        ctx.shake(1.2, 0.8);
        ctx.slowmo(0.35, 1.2);
      } else if (this.kind === "boss") {
        audio.explosion();
        ctx.shake(0.75, 0.45);
      }
      ctx.onKill(this);
      return;
    }

    if (this.poise >= this.maxPoise) {
      this.poise = 0;
      if (this.state !== "stagger" && (this.kind !== "boss" || Math.random() < 0.35)) {
        this.setState("stagger", this.kind === "boss" ? 1.5 : 0.85);
        this.move = null;
        // an interrupted windup leaves the telegraph glow pinned on otherwise
        for (const g of this.rig.glowMats) (g as THREE.MeshBasicMaterial).opacity = 0.9;
        ctx.popup(V1.copy(this.pos).setY(this.pos.y + this.centerY * this.scale + 0.8).clone(), "STAGGERED", "warn");
      }
    } else if (this.state !== "stagger" && this.kind !== "boss" && Math.random() < 0.5 && !this.move) {
      this.setState("hurt", 0.34);
    }

    const knock = V1.subVectors(this.pos, fromPos).setY(0).normalize().multiplyScalar(this.kind === "boss" ? 0.4 : 2.4);
    this.vel.add(knock);
  }

  disarmShield(seconds: number): boolean {
    if (this.dead || !this.shieldEnabled || !this.rig.shield || this.shieldDisarmedT > 0) return false;
    this.shieldDisarmedT = seconds;
    this.rig.shield.visible = false;
    return true;
  }

  update(ctx: GameCtx) {
    if (this.dormant) return; // hidden bosses skip all updates
    const dt = ctx.dt;
    this.stateTime += dt;
    this.moveCooldown = Math.max(0, this.moveCooldown - dt);
    if (this.shieldDisarmedT > 0) {
      this.shieldDisarmedT = Math.max(0, this.shieldDisarmedT - dt);
      if (this.shieldDisarmedT === 0 && this.rig.shield && !this.dead) this.rig.shield.visible = true;
    }
    this.poise = Math.max(0, this.poise - dt * 9); // chip damage shouldn't add up forever
    this.applyFlash(dt);

    if (this.dead) {
      this.cancelGuardianSignature(ctx.scene);
      this.dissolve = Math.min(1, this.dissolve + dt * 0.42);
      this.vel.multiplyScalar(Math.exp(-5 * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.groundStick(dt);
      poseRig(this.rig, { dt, time: ctx.time, speed: 0, state: "death", phase: this.phase, combo: 0 });
      if (this.shardId) animateGuardianRig(this.rig, ctx.time, "death", this.phase);
      const k = 1 - this.dissolve;
      for (const m of this.rig.flashMats) {
        m.transparent = true;
        m.opacity = k;
      }
      for (const m of this.rig.glowMats) (m as THREE.MeshBasicMaterial).opacity = k * 0.9;
      if (this.glowLight) this.glowLight.intensity = 6 * k;
      if (Math.random() < 0.5 && this.dissolve < 0.95) {
        ctx.particles.emit({
          x: this.pos.x + (Math.random() - 0.5) * this.radius * 2,
          y: this.pos.y + Math.random() * this.centerY * 2 * this.scale,
          z: this.pos.z + (Math.random() - 0.5) * this.radius * 2,
          count: 2, speed: 0.5, size: 5, life: 1.2, color: 0xffb45e, grav: 1.4,
        });
      }
      this.trail?.clear();
      return;
    }

    const player = ctx.player;
    this.target = player;
    const targetPos = chooseEnemyTarget(this.pos, player, this.aggro && this.tutorialTag !== "king-trial");
    const toPlayer = V1.subVectors(targetPos, this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    toPlayer.normalize();

    // ---- training effigies: stand still, take hits, look intimidating ----
    if (this.passive) {
      this.vel.multiplyScalar(Math.exp(-12 * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.groundStick(dt);
      this.speedBlend += (0 - this.speedBlend) * Math.min(1, dt * 8);
      const st = this.state === "hurt" || this.state === "stagger" ? this.state : "idle";
      if ((this.state === "hurt" || this.state === "stagger") && this.stateTime >= this.stateDur) this.setState("idle", 1);
      poseRig(this.rig, { dt, time: ctx.time, speed: 0, state: st, phase: this.phase, combo: 0, hunched: this.kind === "wretch" });
      return;
    }

    if (!this.aggro && dist < this.aggroRange && !player.dead) {
      this.aggro = true;
      if (this.kind === "boss") {
        audio.roar();
        ctx.shake(1.4, 1.2);
        this.setState("roar", 2.4);
      }
    }
    if (player.dead) this.aggro = false;
    // Leash: an enemy whose prey runs far away loses interest and stands down.
    if (this.aggro && !player.dead && dist > Math.max(38, this.aggroRange * 1.5)) {
      this.aggro = false;
      if (this.state !== "hurt" && this.state !== "stagger") {
        this.move = null;
        this.setState("idle", 1);
      }
    }

    this.updateGuardianSignature(ctx, dt, targetPos, dist);

    let speedTarget = 0;
    const busy = ["attack", "stagger", "hurt", "roar"].includes(this.state);

    if (this.state === "roar") {
      this.vel.multiplyScalar(Math.exp(-8 * dt));
      if (Math.random() < 0.9) {
        ctx.particles.emit({
          x: this.pos.x, y: this.pos.y + 1.5, z: this.pos.z,
          count: 6, speed: 9, size: 9, life: 0.9, color: this.effectsColor, grav: 2, spread: 2.4,
        });
      }
      if (this.stateTime >= this.stateDur) this.setState("idle", 1);
    } else if (this.state === "stagger" || this.state === "hurt") {
      this.vel.multiplyScalar(Math.exp(-7 * dt));
      if (this.stateTime >= this.stateDur) this.setState("idle", 1);
    } else if (this.state === "attack" && this.move) {
      const ph = this.phase;
      const m = this.move;
      // face target early, then commit
      if (ph < m.windup * 0.85) {
        this.yaw = angleLerp(this.yaw, Math.atan2(toPlayer.x, toPlayer.z), Math.min(1, dt * 6));
      }
      if (ph > m.windup * 0.9 && ph < m.active[1] + 0.06 && m.lunge > 0) {
        this.vel.x += (Math.sin(this.yaw) * m.lunge - this.vel.x) * Math.min(1, dt * 8);
        this.vel.z += (Math.cos(this.yaw) * m.lunge - this.vel.z) * Math.min(1, dt * 8);
      } else {
        this.vel.multiplyScalar(Math.exp(-9 * dt));
      }
      this.runMoveEffects(ctx, m, ph, targetPos);
      if (this.stateTime >= this.stateDur) {
        this.setState("idle", 1);
        this.move = null;
        this.moveCooldown = 0.4 + Math.random() * 0.5;
      }
    } else if (this.aggro && !busy) {
      // ------- pursue / circle / strike -------
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 1.2 + Math.random() * 1.8;
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const wantDist = this.attackRange * 0.8;
      this.yaw = angleLerp(this.yaw, Math.atan2(toPlayer.x, toPlayer.z), Math.min(1, dt * 7));

      if (dist > wantDist + 0.6) {
        const sp = this.moveSpeed * (dist > 14 ? 1.15 : 1);
        this.vel.x += (toPlayer.x * sp - this.vel.x) * Math.min(1, dt * 6);
        this.vel.z += (toPlayer.z * sp - this.vel.z) * Math.min(1, dt * 6);
        speedTarget = dist > 14 ? 1 : 0.62;
      } else {
        // circle strafe
        const sx = -toPlayer.z * this.strafeDir;
        const sz = toPlayer.x * this.strafeDir;
        const sp = this.moveSpeed * 0.5;
        this.vel.x += (sx * sp - this.vel.x) * Math.min(1, dt * 4);
        this.vel.z += (sz * sp - this.vel.z) * Math.min(1, dt * 4);
        speedTarget = 0.4;
      }

      if (this.moveCooldown <= 0) this.chooseMove(ctx, dist);
    } else {
      this.vel.multiplyScalar(Math.exp(-8 * dt));
    }

    this.pos.addScaledVector(this.vel, dt);

    // separation among enemies (before collider resolve so walls win last)
    for (const o of ctx.enemies) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.radius;
      if (d < min) {
        if (d > 1e-4) {
          const p = ((min - d) / d) * 0.5;
          this.pos.x += dx * p;
          this.pos.z += dz * p;
        } else {
          const a = Math.abs(Math.sin(o.pos.x * 39.346 + this.pos.z * 11.135)) * Math.PI * 2;
          this.pos.x += Math.cos(a) * min * 0.5;
          this.pos.z += Math.sin(a) * min * 0.5;
        }
      }
    }

    const [nx, nz] = ctx.resolve(this.pos.x, this.pos.z, this.radius);
    this.pos.x = nx;
    this.pos.z = nz;

    this.groundStick(dt);

    this.speedBlend += (speedTarget - this.speedBlend) * Math.min(1, dt * 7);
    let animState = this.state;
    if (this.state === "idle") animState = this.speedBlend > 0.08 ? "locomotion" : "idle";
    if (this.state === "roar") animState = "heavy";
    if (this.state === "attack" && this.move) {
      animState = this.move.name === "nova" || this.move.name === "meteor" || this.move.name === "flamewave" ? "cast" : this.move.name === "combo" ? "attack" : "heavy";
    }
    poseRig(this.rig, {
      dt, time: ctx.time,
      speed: this.speedBlend,
      state: animState,
      phase: this.state === "attack" && this.move ? this.phase : this.phase,
      combo: Math.floor(this.stateTime * 3) % 3,
      hunched: this.kind === "wretch",
    });
    if (this.shardId) animateGuardianRig(this.rig, ctx.time, this.state, this.phase);

    if (this.trail) {
      const base = B1;
      const tip = B2;
      const active = this.state === "attack" && !!this.move && this.phase > this.move.active[0] - 0.06 && this.phase < this.move.active[1] + 0.05;
      if (this.weaponSegment(base, tip)) this.trail.push(base, tip, active);
    }

    if (this.kind === "boss") {
      const p = 1 - this.hp / this.maxHp;
      this.phaseIdx = p > 0.68 ? 2 : p > 0.36 ? 1 : 0;
      if (this.glowLight) this.glowLight.intensity = 6 + this.phaseIdx * 6 + Math.sin(ctx.time * 8) * 1.5;
      if (Math.random() < 0.35 + this.phaseIdx * 0.25) {
        const a = Math.random() * Math.PI * 2;
        ctx.particles.emit({
          x: this.pos.x + Math.cos(a) * 1.6, y: this.pos.y + Math.random() * 4.2, z: this.pos.z + Math.sin(a) * 1.6,
          count: 1, speed: 0.6, size: 6, life: 1.0, color: this.effectsColor, grav: 1.6,
        });
      }
    }

    // heavy footfalls
    if (speedTarget > 0.3 && this.kind !== "wretch") {
      const ph = Math.floor((ctx.time * (6 + this.speedBlend * 6)) / Math.PI);
      if (ph !== this.lastStep) {
        this.lastStep = ph;
        if (V1.subVectors(this.pos, ctx.player.pos).length() < 40) audio.step(this.kind === "boss");
        if (this.kind === "boss") {
          ctx.shake(0.18, 0.1);
          ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.1, z: this.pos.z, count: 8, speed: 2.4, size: 8, life: 0.7, color: 0x6b5c48, grav: -2 });
        }
      }
    }
  }

  private chooseMove(_ctx: GameCtx, dist: number) {
    const pool = (this.shardId ? SHARD_KITS[this.shardId] : undefined) ?? MOVES[this.kind];
    let candidates = pool.filter((m) => dist < m.range + 1.4);
    if (this.kind === "boss") {
      candidates = pool.filter((m) => {
        if (m.name === "flamewave") return this.phaseIdx >= 1 && dist > 8;
        if (m.name === "meteor") return this.phaseIdx >= 2 && dist > 6;
        if (m.name === "nova") return dist < 15;
        return dist < m.range + 2.2;
      });
      if (candidates.length === 0) candidates = [pool[2]];
    }
    if (candidates.length === 0) return;
    if (Math.random() > (this.kind === "boss" ? 0.92 : 0.55)) return; // hesitation
    const m = candidates[Math.floor(Math.random() * candidates.length)];
    this.move = m;
    this.hitDone = false;
    this.novaFired = false;
    this.scarFired = false;
    this.setState("attack", m.dur / (this.kind === "boss" ? 1 + this.phaseIdx * 0.14 : 1));
    if (this.kind !== "wretch") audio.swing(this.kind === "boss" ? 1.6 : 1.2);
  }

  /** Remove transient warnings on interruption, death, rest, or retry. */
  cancelGuardianSignature(scene: THREE.Scene) {
    if (this.signatureTell) {
      scene.remove(this.signatureTell);
      this.signatureTell.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) material.dispose();
      });
    }
    this.signatureTell = null;
    this.signaturePlan = null;
    this.signatureWindup = 0;
  }

  private updateGuardianSignature(ctx: GameCtx, dt: number, target: THREE.Vector3, distance: number) {
    if (!this.shardId || !(this.shardId in GUARDIAN_SIGNATURES)) return;
    if (!this.aggro || this.dead || ctx.player.dead) {
      if (this.signaturePlan) this.cancelGuardianSignature(ctx.scene);
      return;
    }
    if (this.signaturePlan) {
      if (this.state === "stagger" || this.state === "hurt") {
        this.cancelGuardianSignature(ctx.scene);
        this.signatureCooldown = 4;
        return;
      }
      if (this.signaturePlan.spec.pattern === "pull" && distance < 15) {
        const toward = this.pos.clone().sub(ctx.player.pos).setY(0);
        if (toward.lengthSq() > 0.01) ctx.player.vel.addScaledVector(toward.normalize(), 3.2 * dt);
      }
      this.signatureWindup -= dt;
      if (this.signatureWindup <= 0) {
        const plan = this.signaturePlan;
        this.releaseGuardianSignature(ctx, plan);
        this.cancelGuardianSignature(ctx.scene);
        this.signatureCooldown = plan.spec.cooldown;
        this.setState("stagger", 0.8); // a readable counterattack window
      }
      return;
    }
    if (this.phaseIdx < 1) return;
    this.signatureCooldown = Math.max(0, this.signatureCooldown - dt);
    const spec = GUARDIAN_SIGNATURES[this.shardId as GuardianId];
    if (this.signatureCooldown > 0 || distance > spec.maxRange || ["attack", "roar", "stagger", "hurt"].includes(this.state)) return;
    const plan = planGuardianSignature(this.shardId as GuardianId, this.pos, target);
    this.signaturePlan = plan;
    this.signatureWindup = spec.windup;
    this.signatureTell = this.buildGuardianTell(plan);
    ctx.scene.add(this.signatureTell);
    this.vel.set(0, 0, 0);
    this.move = null;
    this.setState("roar", spec.windup + 0.1);
    ctx.popup(this.pos.clone().setY(this.pos.y + 4), spec.label, "warn");
    audio.roar();
  }

  private buildGuardianTell(plan: SignaturePlan): THREE.Group {
    const group = new THREE.Group();
    for (const mark of plan.marks) {
      const material = new THREE.MeshBasicMaterial({ color: mark.dangerous ? plan.spec.color : 0x6d7185,
        transparent: true, opacity: mark.dangerous ? 0.85 : 0.25, depthWrite: false, side: THREE.DoubleSide });
      const radius = mark.dangerous ? plan.spec.radius : plan.spec.radius * 0.7;
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.86, radius, 32), material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(mark.x, terrainHeight(mark.x, mark.z) + 0.18, mark.z);
      group.add(ring);
    }
    if (plan.spec.pattern === "beam" || plan.spec.pattern === "fan") {
      const dx = plan.target.x - plan.origin.x, dz = plan.target.z - plan.origin.z;
      const length = Math.min(plan.spec.maxRange, Math.max(1, Math.hypot(dx, dz)));
      const baseAngle = Math.atan2(dx, dz);
      const angles = plan.spec.pattern === "fan" ? [-0.4, -0.2, 0, 0.2, 0.4] : [0];
      for (const offset of angles) {
        const angle = baseAngle + offset;
        const mx = plan.origin.x + Math.sin(angle) * length / 2, mz = plan.origin.z + Math.cos(angle) * length / 2;
        const line = new THREE.Mesh(new THREE.BoxGeometry(plan.spec.radius * 1.4, 0.08, length),
          new THREE.MeshBasicMaterial({ color: plan.spec.color, transparent: true, opacity: 0.55, depthWrite: false }));
        line.position.set(mx, terrainHeight(mx, mz) + 0.25, mz);
        line.rotation.y = angle;
        group.add(line);
      }
    }
    return group;
  }

  private releaseGuardianSignature(ctx: GameCtx, plan: SignaturePlan) {
    const { spec } = plan;
    const player = ctx.player;
    audio.explosion();
    ctx.shake(0.65, 0.35);
    if (spec.pattern === "fan") {
      const angle = Math.atan2(plan.target.x - plan.origin.x, plan.target.z - plan.origin.z);
      for (const offset of [-0.4, -0.2, 0, 0.2, 0.4]) {
        const dir = new THREE.Vector3(Math.sin(angle + offset), 0, Math.cos(angle + offset));
        ctx.spawnProjectile({ pos: this.pos.clone().setY(this.pos.y + 1.5).addScaledVector(dir, 2), dir,
          speed: 15, damage: spec.damage, color: spec.color, radius: 0.55, life: 2.3, fromPlayer: false, explode: 1 });
      }
      return;
    }
    if (spec.pattern === "dive") {
      const dir = plan.target.clone().sub(this.pos).setY(0).normalize();
      this.vel.addScaledVector(dir, 9);
      this.vertical = 5;
      const ground = terrainHeight(plan.target.x, plan.target.z);
      ctx.spawnProjectile({ pos: new THREE.Vector3(plan.target.x, ground + 8, plan.target.z), dir: new THREE.Vector3(0, -1, 0),
        speed: 14, damage: spec.damage, color: spec.color, radius: 0.8, life: 2, fromPlayer: false, explode: spec.radius });
      return;
    }
    let hit = false;
    if (spec.pattern === "beam") {
      hit = distanceToSegmentXZ(player.pos, plan.origin, plan.target) <= spec.radius &&
        Math.abs(player.pos.y - terrainHeight(player.pos.x, player.pos.z)) < 3 && !ctx.lineBlocked?.(plan.origin, player.pos);
      ctx.waves.spawn(plan.target.clone().setY(terrainHeight(plan.target.x, plan.target.z) + 0.3), spec.color, 3, 0.5);
    } else {
      for (const mark of plan.marks) {
        if (!mark.dangerous) continue;
        const y = terrainHeight(mark.x, mark.z);
        ctx.waves.spawn(new THREE.Vector3(mark.x, y + 0.3, mark.z), spec.color, spec.radius, 0.7);
        ctx.particles.emit({ x: mark.x, y: y + 0.5, z: mark.z, count: 25, speed: 5, size: 6, life: 0.6, color: spec.color, grav: -3 });
        if (Math.hypot(player.pos.x - mark.x, player.pos.z - mark.z) <= spec.radius && Math.abs(player.pos.y - y) < 3) hit = true;
      }
    }
    if (hit) player.damage(spec.damage, plan.origin, ctx, 30);
  }

  private novaFired = false;
  private scarFired = false;

  private runMoveEffects(ctx: GameCtx, m: Move, ph: number, targetPos: THREE.Vector3) {
    const player = ctx.player;
    const playerDistance = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);

    // ---- telegraph glow ----
    if (ph < m.windup) {
      const k = ph / m.windup;
      for (const g of this.rig.glowMats) (g as THREE.MeshBasicMaterial).opacity = 0.4 + k * 0.6;
      if (this.kind === "boss" && Math.random() < 0.8) {
        const w = this.rig.weapon;
        if (w) {
          w.updateWorldMatrix(true, false);
          const tp = B3.set(0, this.rig.bladeLength * 0.6, 0).applyMatrix4(w.matrixWorld);
          ctx.particles.emit({ x: tp.x, y: tp.y, z: tp.z, count: 3, speed: 1.5, size: 7, life: 0.6, color: this.effectsColor, grav: 1.5 });
        }
      }
    }

    const inActive = ph >= m.active[0] && ph <= m.active[1];

    // ---- special moves ----
    if (m.name === "nova" && !this.novaFired && ph > m.windup) {
      this.novaFired = true;
      audio.explosion();
      ctx.shake(1.5, 0.7);
      ctx.waves.spawn(V1.copy(this.pos).setY(this.pos.y + 0.3).clone(), this.effectsColor, m.range, 0.85);
      ctx.waves.spawn(V1.copy(this.pos).setY(this.pos.y + 0.35).clone(), 0xffe0a0, m.range * 0.7, 0.6);
      ctx.particles.emit({
        x: this.pos.x, y: this.pos.y + 1, z: this.pos.z, count: 100, speed: 14, size: 7, life: 0.9, color: this.effectsColor, grav: -3, spread: 0.8,
      });
      if (playerDistance < m.range) {
        const falloff = 1 - playerDistance / m.range;
        player.damage(m.damage * (0.45 + falloff * 0.75), this.pos, ctx, 40);
      }
    }

    if (m.name === "flamewave" && !this.novaFired && ph > m.windup) {
      this.novaFired = true;
      audio.fire();
      const count = 3 + this.phaseIdx * 2;
      for (let i = 0; i < count; i++) {
        const spread = ((i - (count - 1) / 2) / count) * 1.5;
        const dir = new THREE.Vector3(Math.sin(this.yaw + spread), 0, Math.cos(this.yaw + spread));
        ctx.spawnProjectile({
          pos: new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z).addScaledVector(dir, 2.4),
          dir, speed: 17 + this.phaseIdx * 3, damage: m.damage, color: this.effectsColor, radius: 1.05, fromPlayer: false, life: 4, explode: 3.4,
        });
      }
      ctx.shake(0.6, 0.4);
    }

    if (m.name === "meteor" && !this.novaFired && ph > m.windup) {
      this.novaFired = true;
      audio.roar();
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 13;
        const tx = targetPos.x + Math.cos(a) * r;
        const tz = targetPos.z + Math.sin(a) * r;
        const from = new THREE.Vector3(tx + 4, terrainHeight(tx, tz) + 34 + i * 3.5, tz + 4);
        const dir = new THREE.Vector3(tx - from.x, terrainHeight(tx, tz) - from.y, tz - from.z).normalize();
        // Staggered launch heights give the meteors their sequential impact
        // spacing — no wall-clock timers, so pause and teardown behave.
        ctx.spawnProjectile({ pos: from, dir, speed: 26, damage: m.damage, color: this.effectsColor, radius: 1.4, fromPlayer: false, life: 4, explode: 5.5, gravity: -6 });
      }
      ctx.shake(1.0, 1.2);
    }

    // ---- melee contact ----
    if (inActive && m.lunge >= 0 && m.name !== "nova" && m.name !== "flamewave" && m.name !== "meteor") {
      const base = B1;
      const tip = B2;
      let hit = false;
      const pc = V3;
      player.worldCenter(pc);
      if (this.weaponSegment(base, tip)) {
        hit = distToSegment(pc, base, tip) < player.radius + 0.55 * this.scale;
        if (Math.random() < 0.5) {
          ctx.particles.emit({ x: tip.x, y: tip.y, z: tip.z, count: 2, speed: 1.5, size: 6, life: 0.35, color: this.kind === "boss" ? 0xff7a22 : 0xffb066, grav: -1 });
        }
      } else {
        hit = playerDistance < m.range * 0.7;
      }
      if (hit && !this.hitDone) {
        this.hitDone = true;
        const result = player.damage(m.damage, this.pos, ctx, m.poise);
        if (result === "parry") ctx.onTrialParry?.(this);
      }
      // ground scar for big slams
      if (!this.scarFired && this.kind === "boss" && ph > m.active[0] && ph < m.active[0] + 0.05 && (m.name === "slam" || m.name === "sweep")) {
        this.scarFired = true;
        const fp = B3.set(this.pos.x + Math.sin(this.yaw) * 4.5, this.pos.y, this.pos.z + Math.cos(this.yaw) * 4.5);
        ctx.waves.spawn(new THREE.Vector3(fp.x, terrainHeight(fp.x, fp.z) + 0.25, fp.z), 0xff8a2a, 9, 0.6);
        ctx.particles.emit({ x: fp.x, y: terrainHeight(fp.x, fp.z) + 0.2, z: fp.z, count: 90, speed: 12, size: 8, life: 0.9, color: 0xff7a22, grav: -10, upBias: 4 });
        ctx.shake(1.1, 0.5);
        audio.explosion();
        // shockwave damage
        const pd = Math.hypot(player.pos.x - fp.x, player.pos.z - fp.z);
        if (pd < 6.5 && !this.hitDone) {
          this.hitDone = true;
          player.damage(m.damage * 0.8, fp, ctx, m.poise);
        }
      }
    }

    if (ph > m.active[1] || ph >= 0.98) { // nova/meteor never exceed phase 1 — release the glow anyway
      for (const g of this.rig.glowMats) (g as THREE.MeshBasicMaterial).opacity = 0.9;
    }
  }
}
