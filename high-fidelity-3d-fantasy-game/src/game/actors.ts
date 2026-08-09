import * as THREE from "three";
import { buildRig, poseRig, type Rig, type WeaponKind } from "./rig";
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
  resolve: (x: number, z: number, r: number) => [number, number];
  shake: (amount: number, dur?: number) => void;
  hitStop: (dur: number) => void;
  popup: (pos: THREE.Vector3, text: string, kind: string) => void;
  spawnProjectile: (opts: ProjectileOpts) => void;
  onKill: (npc: NPC) => void;
  onPlayerDeath: () => void;
  slowmo: (scale: number, dur: number) => void;
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

  private baseEm: { c: THREE.Color; i: number }[] | null = null;

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

  protected groundStick(dt: number) {
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y > gy + 0.04) {
      this.vertical -= 30 * dt;
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
    label: "Greatsword",
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
};

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

  damage(amount: number, fromPos: THREE.Vector3, ctx: GameCtx, poiseDmg = 10) {
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
        this.parryWindow = 0;
        return "parry" as any;
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
      this.dead = true;
      this.setState("death", 2.2);
      audio.death();
      ctx.onPlayerDeath();
    }
    return true;
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
    this.applyFlash(dt);

    if (this.dead) {
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.groundStick(dt);
      poseRig(this.rig, { dt, time: ctx.time, speed: 0, state: "death", phase: this.phase, combo: 0 });
      this.trail?.clear();
      return;
    }

    // ------------------------- stamina ------------------------------------
    if (this.godMode) {
      this.stamina = this.maxStamina;
      this.fp = this.maxFp;
      this.hp = this.maxHp;
      this.flasks = this.maxFlasks;
    } else {
      this.staminaRegenDelay = Math.max(0, this.staminaRegenDelay - dt);
      if (this.staminaRegenDelay <= 0) {
        const rate = this.state === "guard" ? 12 : 34;
        this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
      }
      this.fp = Math.min(this.maxFp, this.fp + 1.4 * dt);
    }

    // ------------------------- input intents -------------------------------
    const mag = Math.hypot(input.moveX, input.moveZ);
    const wantMove = mag > 0.08;
    const moveYaw = wantMove ? Math.atan2(input.moveX, input.moveZ) + input.camYaw : this.yaw;
    const desiredYaw = input.faceYaw !== null ? input.faceYaw : moveYaw;

    if (this.canAct()) {
      if (this.godMode && input.roll) {
        // Space is the "ascend" key in fly mode — never roll
      } else if (input.roll && this.stamina >= 22) {
        this.spend(22);
        this.invuln = 0.42;
        audio.roll();
        if (wantMove) {
          this.yaw = moveYaw;
          this.setState("roll", 0.62);
          this.vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(11.5);
        } else {
          this.setState("backstep", 0.44);
          this.vel.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(8.5);
        }
        ctx.particles.emit({ x: this.pos.x, y: this.pos.y + 0.15, z: this.pos.z, count: 24, speed: 3, size: 8, life: 0.7, color: 0x6b5c48, grav: -1.5 });
      } else if (input.heavy && this.stamina >= (WEAPON_CONFIG[this.weaponKind]?.stamHeavy ?? 34)) {
        const cfg = WEAPON_CONFIG[this.weaponKind] ?? WEAPON_CONFIG.greatsword;
        this.spend(cfg.stamHeavy);
        this.setState("heavy", cfg.heavyDur);
        this.hitSet.clear();
        this.comboIndex = 0;
        audio.swing(1.5);
        if (wantMove) this.yaw = desiredYaw;
      } else if (input.attack && this.stamina >= (WEAPON_CONFIG[this.weaponKind]?.stamAtk ?? 16)) {
        const cfg = WEAPON_CONFIG[this.weaponKind] ?? WEAPON_CONFIG.greatsword;
        this.spend(cfg.stamAtk);
        this.comboIndex = this.comboWindow > 0 ? (this.comboIndex + 1) % 3 : 0;
        this.setState("attack", cfg.atkDur[this.comboIndex]);
        this.hitSet.clear();
        audio.swing(this.weaponKind === "twinblades" ? 0.7 : 1);
        if (wantMove) this.yaw = desiredYaw;
      } else if (input.cast && this.fp >= 22) {
        this.fp -= 22;
        this.setState("cast", 0.92);
        audio.fire();
        if (wantMove) this.yaw = desiredYaw;
      } else if (input.heal) {
        this.heal(ctx);
        this.setState("cast", 0.7);
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
      const base = input.guard ? 2.6 : input.sprint && this.stamina > 6 ? 8.4 : 4.6;
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

    this.pos.addScaledVector(this.vel, dt);
    const [nx, nz] = ctx.resolve(this.pos.x, this.pos.z, this.radius);
    this.pos.x = nx;
    this.pos.z = nz;

    // separation from enemies
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const dx = this.pos.x - e.pos.x;
      const dz = this.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + e.radius;
      if (d < min && d > 1e-4) {
        const p = ((min - d) / d) * 0.6;
        this.pos.x += dx * p;
        this.pos.z += dz * p;
      }
    }

    this.groundStick(dt);

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
    if (isLight) {
      const w = cfg.lightWindows[this.comboIndex];
      active = this.phase > w[0] && this.phase < w[1];
      dmg = cfg.dmg[this.comboIndex];
    } else if (isHeavy) {
      active = this.phase > cfg.heavyWindow[0] && this.phase < cfg.heavyWindow[1];
      dmg = cfg.heavyDmg;
    }

    const base = A1;
    const tip = A2;
    if (this.weaponSegment(base, tip) && this.trail) {
      this.trail.push(base, tip, active);
    }

    if (!active) return;

    // sparks along the blade
    if (Math.random() < 0.6) {
      ctx.particles.emit({
        x: tip.x, y: tip.y, z: tip.z, count: 2, speed: 1.2, size: 4, life: 0.28, color: 0x9fd8ff, grav: -2,
      });
    }

    const c = A3;
    for (const e of ctx.enemies) {
      if (e.dead || this.hitSet.has(e)) continue;
      e.worldCenter(c);
      const d = distToSegment(c, base, tip);
      if (d < e.radius + cfg.range * e.scale) {
        this.hitSet.add(e);
        const crit = this.godMode ? true : Math.random() < 0.16;
        const godMul = this.godMode ? 99 : 1;
        const finalDmg = dmg * this.bladePower * godMul * (crit ? cfg.critMul : 1) * (0.92 + Math.random() * 0.16);
        e.damage(finalDmg, this.pos, ctx, isHeavy ? 46 : 20);
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
  private resolveCast(ctx: GameCtx) {
    if (this.state !== "cast") {
      this.castFired = false;
      return;
    }
    if (!this.castFired && this.phase > 0.45) {
      this.castFired = true;
      if (this.fp >= 0) {
        const h = this.rig.handL;
        h.updateWorldMatrix(true, false);
        const p = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
        const dir = new THREE.Vector3(Math.sin(this.yaw), 0.02, Math.cos(this.yaw)).normalize();
        const bolt = 62 * this.magicPower * (this.godMode ? 99 : 1);
        ctx.spawnProjectile({ pos: p, dir, speed: 30, damage: bolt, color: this.godMode ? 0xffd27a : 0x6fc6ff, radius: this.godMode ? 1.2 : 0.55, fromPlayer: true, explode: this.godMode ? 8 : 4.2, life: 3 });
        ctx.particles.emit({ x: p.x, y: p.y, z: p.z, count: 34, speed: 4, size: 7, life: 0.6, color: 0x6fc6ff, grav: 0 });
        ctx.shake(0.22, 0.15);
      }
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
  bossRole: "main" | "regional" | "hollowCrown" = "main";
  /** Dormant enemies are hidden and skip all updates until awakened. */
  dormant = false;

  constructor(kind: NPCKind) {
    let rig: Rig;
    if (kind === "wretch") {
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
        scale: 2.55, bulk: 1.5,
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
      this.radius = 1.9;
      this.centerY = 1.15;
      this.moveSpeed = 5.2;
      this.attackRange = 6.4;
      this.aggroRange = 46;
      this.maxPoise = 190;
      this.runeValue = 20000;
      this.name = "MALENKAR, THE SUNDERED FLAME";
      this.glowLight = new THREE.PointLight(0xff6a1e, 6, 26, 1.8);
      this.glowLight.position.y = 3;
      this.rig.root.add(this.glowLight);
    }
  }

  damage(amount: number, fromPos: THREE.Vector3, ctx: GameCtx, poiseDmg = 15) {
    if (this.dead) return;
    this.aggro = true;
    this.hp = Math.max(0, this.hp - amount);
    this.flash();
    this.poise += poiseDmg;

    if (this.hp <= 0) {
      this.dead = true;
      this.setState("death", 2.6);
      this.vel.set(0, 0, 0);
      ctx.particles.emit({
        x: this.pos.x, y: this.pos.y + this.centerY * this.scale, z: this.pos.z,
        count: this.kind === "boss" ? 140 : 45, speed: this.kind === "boss" ? 11 : 5,
        size: 8, life: 1.6, color: this.kind === "boss" ? 0xff8a2a : 0xffb45e, grav: -3,
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
      if (this.kind !== "boss" || Math.random() < 0.35) {
        this.setState("stagger", this.kind === "boss" ? 1.5 : 0.85);
        this.move = null;
        ctx.popup(V1.copy(this.pos).setY(this.pos.y + this.centerY * this.scale + 0.8).clone(), "STAGGERED", "warn");
      }
    } else if (this.state !== "stagger" && this.kind !== "boss" && Math.random() < 0.5 && !this.move) {
      this.setState("hurt", 0.34);
    }

    const knock = V1.subVectors(this.pos, fromPos).setY(0).normalize().multiplyScalar(this.kind === "boss" ? 0.4 : 2.4);
    this.vel.add(knock);
  }

  update(ctx: GameCtx) {
    if (this.dormant) return; // hidden bosses skip all updates
    const dt = ctx.dt;
    this.stateTime += dt;
    this.moveCooldown = Math.max(0, this.moveCooldown - dt);
    this.applyFlash(dt);

    if (this.dead) {
      this.dissolve = Math.min(1, this.dissolve + dt * 0.42);
      this.vel.multiplyScalar(Math.exp(-5 * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.groundStick(dt);
      poseRig(this.rig, { dt, time: ctx.time, speed: 0, state: "death", phase: this.phase, combo: 0 });
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
    const toPlayer = V1.subVectors(player.pos, this.pos);
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

    let speedTarget = 0;
    const busy = ["attack", "stagger", "hurt", "roar"].includes(this.state);

    if (this.state === "roar") {
      this.vel.multiplyScalar(Math.exp(-8 * dt));
      if (Math.random() < 0.9) {
        ctx.particles.emit({
          x: this.pos.x, y: this.pos.y + 1.5, z: this.pos.z,
          count: 6, speed: 9, size: 9, life: 0.9, color: 0xff7a22, grav: 2, spread: 2.4,
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
      this.runMoveEffects(ctx, m, ph, dist);
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
    const [nx, nz] = ctx.resolve(this.pos.x, this.pos.z, this.radius);
    this.pos.x = nx;
    this.pos.z = nz;

    // separation among enemies
    for (const o of ctx.enemies) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.radius;
      if (d < min && d > 1e-4) {
        const p = ((min - d) / d) * 0.5;
        this.pos.x += dx * p;
        this.pos.z += dz * p;
      }
    }

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
          count: 1, speed: 0.6, size: 6, life: 1.0, color: 0xff7a22, grav: 1.6,
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
    const pool = MOVES[this.kind];
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
    this.setState("attack", m.dur / (this.kind === "boss" ? 1 + this.phaseIdx * 0.14 : 1));
    if (this.kind !== "wretch") audio.swing(this.kind === "boss" ? 1.6 : 1.2);
  }

  private novaFired = false;

  private runMoveEffects(ctx: GameCtx, m: Move, ph: number, dist: number) {
    const player = ctx.player;

    // ---- telegraph glow ----
    if (ph < m.windup) {
      const k = ph / m.windup;
      for (const g of this.rig.glowMats) (g as THREE.MeshBasicMaterial).opacity = 0.4 + k * 0.6;
      if (this.kind === "boss" && Math.random() < 0.8) {
        const w = this.rig.weapon;
        if (w) {
          w.updateWorldMatrix(true, false);
          const tp = B3.set(0, this.rig.bladeLength * 0.6, 0).applyMatrix4(w.matrixWorld);
          ctx.particles.emit({ x: tp.x, y: tp.y, z: tp.z, count: 3, speed: 1.5, size: 7, life: 0.6, color: 0xff8a2a, grav: 1.5 });
        }
      }
    }

    const inActive = ph >= m.active[0] && ph <= m.active[1];

    // ---- special moves ----
    if (m.name === "nova" && !this.novaFired && ph > m.windup) {
      this.novaFired = true;
      audio.explosion();
      ctx.shake(1.5, 0.7);
      ctx.waves.spawn(V1.copy(this.pos).setY(this.pos.y + 0.3).clone(), 0xff8a2a, m.range, 0.85);
      ctx.waves.spawn(V1.copy(this.pos).setY(this.pos.y + 0.35).clone(), 0xffe0a0, m.range * 0.7, 0.6);
      ctx.particles.emit({
        x: this.pos.x, y: this.pos.y + 1, z: this.pos.z, count: 100, speed: 14, size: 7, life: 0.9, color: 0xff7a22, grav: -3, spread: 0.8,
      });
      if (dist < m.range) {
        const falloff = 1 - dist / m.range;
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
          dir, speed: 17 + this.phaseIdx * 3, damage: m.damage, color: 0xff7a22, radius: 1.05, fromPlayer: false, life: 4, explode: 3.4,
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
        const tx = player.pos.x + Math.cos(a) * r;
        const tz = player.pos.z + Math.sin(a) * r;
        const from = new THREE.Vector3(tx + 4, terrainHeight(tx, tz) + 34 + i * 2, tz + 4);
        const dir = new THREE.Vector3(tx - from.x, terrainHeight(tx, tz) - from.y, tz - from.z).normalize();
        window.setTimeout(() => {
          ctx.spawnProjectile({ pos: from, dir, speed: 26, damage: m.damage, color: 0xff5a12, radius: 1.4, fromPlayer: false, life: 4, explode: 5.5, gravity: -6 });
        }, i * 130);
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
        hit = dist < m.range * 0.7;
      }
      if (hit && !this.hitDone) {
        this.hitDone = true;
        player.damage(m.damage, this.pos, ctx, m.poise);
      }
      // ground scar for big slams
      if (this.kind === "boss" && ph > m.active[0] && ph < m.active[0] + 0.05 && (m.name === "slam" || m.name === "sweep")) {
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

    if (ph > m.active[1]) {
      for (const g of this.rig.glowMats) (g as THREE.MeshBasicMaterial).opacity = 0.9;
    }
  }
}
