import * as THREE from "three";

// ---------------------------------------------------------------------------
// ASHVEIL — procedural humanoid rigs (no external models)
// ---------------------------------------------------------------------------

export type WeaponKind = "greatsword" | "claws" | "swordshield" | "flamebrand" | "none" | "twinblades" | "halberd";

export interface RigOptions {
  scale?: number;
  bulk?: number;
  armor: number; // primary metal
  armorDark: number;
  cloth: number;
  accent: number; // emissive
  accentIntensity?: number;
  weapon: WeaponKind;
  cape?: boolean;
  horns?: boolean;
  hunched?: boolean;
  tattered?: boolean;
  crown?: boolean;
}

export interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  elbowL: THREE.Group;
  handL: THREE.Group;
  shoulderR: THREE.Group;
  elbowR: THREE.Group;
  handR: THREE.Group;
  hipL: THREE.Group;
  kneeL: THREE.Group;
  hipR: THREE.Group;
  kneeR: THREE.Group;
  cape?: THREE.Mesh;
  capeBase?: Float32Array;
  weapon?: THREE.Group;
  bladeLength: number;
  flashMats: THREE.MeshStandardMaterial[];
  glowMats: THREE.Material[];
  height: number;
  hipHeight: number;
}

function jointMesh(geo: THREE.BufferGeometry, mat: THREE.Material, dropY: number) {
  geo.translate(0, dropY, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildRig(o: RigOptions): Rig {
  const S = o.scale ?? 1;
  const B = o.bulk ?? 1;
  const flashMats: THREE.MeshStandardMaterial[] = [];
  const glowMats: THREE.Material[] = [];

  const mkMat = (color: number, rough: number, metal: number, emissive = 0x000000, ei = 0) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
      emissive,
      emissiveIntensity: ei,
      flatShading: true,
    });
    flashMats.push(m);
    return m;
  };

  const metal = mkMat(o.armor, 0.42, 0.92);
  const dark = mkMat(o.armorDark, 0.62, 0.75);
  const cloth = mkMat(o.cloth, 0.95, 0.05);
  const glowMat = new THREE.MeshBasicMaterial({ color: o.accent, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  glowMats.push(glowMat);
  const emissiveMat = mkMat(o.accent, 0.5, 0.2, o.accent, o.accentIntensity ?? 2.4);

  const root = new THREE.Group();
  const hipHeight = 0.95 * S;
  const hips = new THREE.Group();
  hips.position.y = hipHeight;
  root.add(hips);

  // ------------------------------ torso ------------------------------------
  const torso = new THREE.Group();
  hips.add(torso);

  const pelvis = jointMesh(new THREE.BoxGeometry(0.42 * S * B, 0.24 * S, 0.28 * S * B), dark, 0.02 * S);
  torso.add(pelvis);

  const chest = jointMesh(new THREE.BoxGeometry(0.56 * S * B, 0.5 * S, 0.34 * S * B), metal, 0.36 * S);
  torso.add(chest);
  const chestTop = jointMesh(new THREE.BoxGeometry(0.62 * S * B, 0.16 * S, 0.38 * S * B), dark, 0.62 * S);
  torso.add(chestTop);

  // chest sigil
  const sigil = new THREE.Mesh(new THREE.CircleGeometry(0.1 * S * B, 6), glowMat);
  sigil.position.set(0, 0.42 * S, 0.18 * S * B);
  torso.add(sigil);

  // ------------------------------- head ------------------------------------
  const head = new THREE.Group();
  head.position.y = 0.7 * S;
  torso.add(head);
  const skull = jointMesh(new THREE.BoxGeometry(0.26 * S, 0.3 * S, 0.28 * S), metal, 0.14 * S);
  head.add(skull);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2 * S, 0.045 * S, 0.03 * S), glowMat);
  visor.position.set(0, 0.14 * S, 0.145 * S);
  head.add(visor);
  const crest = jointMesh(new THREE.BoxGeometry(0.045 * S, 0.14 * S, 0.3 * S), dark, 0.3 * S);
  head.add(crest);

  if (o.crown) {
    const goldMat = mkMat(0xd8b050, 0.32, 0.95, 0xffcf70, 0.35);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.165 * S, 0.185 * S, 0.1 * S, 8, 1, true), goldMat);
    band.position.y = 0.315 * S;
    head.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.028 * S, 0.13 * S, 4), goldMat);
      spike.position.set(Math.cos(a) * 0.165 * S, 0.41 * S, Math.sin(a) * 0.165 * S);
      head.add(spike);
    }
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.035 * S, 0), emissiveMat);
    jewel.position.set(0, 0.33 * S, 0.17 * S);
    head.add(jewel);
  }

  if (o.horns) {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06 * S, 0.5 * S, 5), dark);
      horn.position.set(side * 0.13 * S, 0.24 * S, -0.02 * S);
      horn.rotation.z = side * -0.75;
      horn.rotation.x = -0.3;
      horn.castShadow = true;
      head.add(horn);
    }
  }

  // ----------------------------- shoulders ---------------------------------
  const mkArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.36 * S * B, 0.62 * S, 0);
    torso.add(shoulder);

    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.17 * S * B, 8, 6), dark);
    pauldron.scale.set(1, 0.85, 1);
    pauldron.castShadow = true;
    shoulder.add(pauldron);

    const upper = jointMesh(new THREE.CapsuleGeometry(0.075 * S * B, 0.24 * S, 3, 6), metal, -0.19 * S);
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.34 * S;
    shoulder.add(elbow);

    const fore = jointMesh(new THREE.CapsuleGeometry(0.065 * S * B, 0.22 * S, 3, 6), metal, -0.17 * S);
    elbow.add(fore);

    const hand = new THREE.Group();
    hand.position.y = -0.32 * S;
    elbow.add(hand);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.1 * S, 0.12 * S, 0.1 * S), dark);
    fist.castShadow = true;
    hand.add(fist);

    return { shoulder, elbow, hand };
  };

  const L = mkArm(-1);
  const R = mkArm(1);

  // ------------------------------- legs ------------------------------------
  const mkLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.15 * S * B, 0, 0);
    hips.add(hip);
    const thigh = jointMesh(new THREE.CapsuleGeometry(0.1 * S * B, 0.3 * S, 3, 6), dark, -0.25 * S);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.46 * S;
    hip.add(knee);
    const shin = jointMesh(new THREE.CapsuleGeometry(0.085 * S * B, 0.28 * S, 3, 6), metal, -0.22 * S);
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13 * S, 0.09 * S, 0.26 * S), dark);
    foot.position.set(0, -0.42 * S, 0.05 * S);
    foot.castShadow = true;
    knee.add(foot);
    return { hip, knee };
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // ------------------------------- cape ------------------------------------
  let cape: THREE.Mesh | undefined;
  let capeBase: Float32Array | undefined;
  if (o.cape) {
    const cw = 0.72 * S * B;
    const ch = 1.25 * S;
    const g = new THREE.PlaneGeometry(cw, ch, 6, 10);
    g.translate(0, -ch / 2, 0);
    const capeMat = new THREE.MeshStandardMaterial({
      color: o.cloth,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    flashMats.push(capeMat);
    cape = new THREE.Mesh(g, capeMat);
    cape.castShadow = true;
    cape.position.set(0, 0.68 * S, -0.19 * S * B);
    torso.add(cape);
    capeBase = new Float32Array((g.attributes.position.array as Float32Array).slice());
  }

  // ------------------------------ weapon -----------------------------------
  let weapon: THREE.Group | undefined;
  let bladeLength = 0;

  if (o.weapon === "greatsword" || o.weapon === "flamebrand") {
    const g = new THREE.Group();
    const flame = o.weapon === "flamebrand";
    const len = (flame ? 2.0 : 1.75) * S;
    bladeLength = len;

    const bladeGeo = new THREE.BoxGeometry(flame ? 0.24 * S : 0.13 * S, len, 0.035 * S);
    bladeGeo.translate(0, len / 2 + 0.16 * S, 0);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: flame ? 0x3a1a10 : 0xcfd6e2,
      metalness: 0.98,
      roughness: flame ? 0.55 : 0.16,
      emissive: flame ? 0xff5a12 : 0x1b2434,
      emissiveIntensity: flame ? 2.2 : 0.35,
      flatShading: true,
    });
    flashMats.push(bladeMat);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.castShadow = true;
    g.add(blade);

    // fuller / glowing edge
    const edgeGeo = new THREE.BoxGeometry(flame ? 0.05 * S : 0.02 * S, len * 0.92, 0.05 * S);
    edgeGeo.translate(0, len / 2 + 0.16 * S, 0);
    const edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ color: flame ? 0xffaa33 : 0x9fd8ff, transparent: true, opacity: flame ? 0.95 : 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowMats.push(edge.material as THREE.Material);
    g.add(edge);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(flame ? 0.12 * S : 0.066 * S, 0.3 * S, 4), bladeMat);
    tip.position.y = len + 0.3 * S;
    g.add(tip);

    const guard = new THREE.Mesh(new THREE.BoxGeometry((flame ? 0.86 : 0.5) * S, 0.07 * S, 0.09 * S), dark);
    guard.position.y = 0.14 * S;
    guard.castShadow = true;
    g.add(guard);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * S, 0.04 * S, 0.34 * S, 6), cloth);
    grip.position.y = -0.04 * S;
    g.add(grip);

    const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.06 * S, 0), emissiveMat);
    pommel.position.y = -0.23 * S;
    g.add(pommel);

    // Blade held perpendicular to the forearm, pointing forward-up out of the
    // fist (previously it extended along the arm, aiming back at the camera).
    g.rotation.x = 1.72;
    R.hand.add(g);
    weapon = g;
  } else if (o.weapon === "claws") {
    bladeLength = 0.55 * S;
    const mkClaw = (hand: THREE.Group, side: number) => {
      const g = new THREE.Group();
      for (let i = -1; i <= 1; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.028 * S, 0.5 * S, 4), dark);
        c.position.set(i * 0.055 * S, -0.22 * S, 0.04 * S);
        c.rotation.x = 2.5;
        c.rotation.z = i * 0.16;
        c.castShadow = true;
        g.add(c);
      }
      g.rotation.z = side * 0.1;
      hand.add(g);
      return g;
    };
    mkClaw(L.hand, -1);
    weapon = mkClaw(R.hand, 1);
  } else if (o.weapon === "swordshield") {
    bladeLength = 1.15 * S;
    const g = new THREE.Group();
    const len = bladeLength;
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xb9c2ce, metalness: 0.95, roughness: 0.24, flatShading: true });
    flashMats.push(bladeMat);
    const bladeGeo = new THREE.BoxGeometry(0.1 * S, len, 0.03 * S);
    bladeGeo.translate(0, len / 2 + 0.12 * S, 0);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.castShadow = true;
    g.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34 * S, 0.06 * S, 0.07 * S), dark);
    guard.position.y = 0.1 * S;
    g.add(guard);
    g.rotation.x = 1.62; // blade forward out of the fist
    R.hand.add(g);
    weapon = g;

    const shield = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * S, 0.42 * S, 0.07 * S, 6), metal);
    plate.rotation.x = Math.PI / 2;
    plate.castShadow = true;
    shield.add(plate);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, 8, 6), emissiveMat);
    boss.position.z = 0.07 * S;
    shield.add(boss);
    shield.position.set(0, -0.1 * S, 0.12 * S);
    shield.rotation.x = -0.4;
    L.hand.add(shield);
  } else if (o.weapon === "twinblades") {
    // fast dual short-swords — right hand is the tracked "primary" blade
    bladeLength = 1.0 * S;
    const mkBlade = (hand: THREE.Group) => {
      const g = new THREE.Group();
      const len = bladeLength;
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 0.96, roughness: 0.2, emissive: 0x7a0f0f, emissiveIntensity: 0.3, flatShading: true });
      flashMats.push(bladeMat);
      const bladeGeo = new THREE.BoxGeometry(0.075 * S, len, 0.026 * S);
      bladeGeo.translate(0, len / 2 + 0.1 * S, 0);
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.castShadow = true;
      g.add(blade);
      const edgeGeo = new THREE.BoxGeometry(0.018 * S, len * 0.9, 0.032 * S);
      edgeGeo.translate(0, len / 2 + 0.1 * S, 0);
      const edge = new THREE.Mesh(
        edgeGeo,
        new THREE.MeshBasicMaterial({ color: 0xff5f4a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glowMats.push(edge.material as THREE.Material);
      g.add(edge);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28 * S, 0.05 * S, 0.06 * S), dark);
      guard.position.y = 0.09 * S;
      g.add(guard);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * S, 0.03 * S, 0.24 * S, 6), cloth);
      grip.position.y = -0.03 * S;
      g.add(grip);
      g.rotation.x = 1.68;
      hand.add(g);
      return g;
    };
    mkBlade(L.hand);
    weapon = mkBlade(R.hand);
  } else if (o.weapon === "halberd") {
    // two-handed reach weapon: long haft + axe blade + spear tip
    bladeLength = 2.3 * S;
    const g = new THREE.Group();
    const len = bladeLength;
    const haftMat = new THREE.MeshStandardMaterial({ color: 0x2c2015, roughness: 0.85, metalness: 0.05 });
    flashMats.push(haftMat);
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * S, 0.045 * S, len, 7), haftMat);
    haft.position.y = len / 2 - 0.1 * S;
    haft.castShadow = true;
    g.add(haft);

    const headMat = new THREE.MeshStandardMaterial({ color: 0xaeb8c4, metalness: 0.95, roughness: 0.22, emissive: 0x1b2434, emissiveIntensity: 0.3, flatShading: true });
    flashMats.push(headMat);
    const axe = new THREE.Mesh(new THREE.ConeGeometry(0.34 * S, 0.5 * S, 4), headMat);
    axe.rotation.z = Math.PI / 2;
    axe.rotation.y = Math.PI / 4;
    axe.position.set(0.16 * S, len - 0.42 * S, 0);
    axe.castShadow = true;
    g.add(axe);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.075 * S, 0.55 * S, 5), headMat);
    spike.position.y = len + 0.16 * S;
    g.add(spike);
    const edgeGlow = new THREE.Mesh(
      new THREE.ConeGeometry(0.09 * S, 0.5 * S, 5),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    edgeGlow.position.y = len + 0.1 * S;
    glowMats.push(edgeGlow.material as THREE.Material);
    g.add(edgeGlow);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * S, 0.04 * S, 0.5 * S, 6), cloth);
    grip.position.y = 0.28 * S;
    g.add(grip);

    g.rotation.x = 1.5;
    R.hand.add(g);
    weapon = g;
    // left hand grips lower on the haft for a two-handed silhouette
    L.hand.position.set(0, -0.36 * S, 0.02 * S);
  }

  if (o.hunched) {
    torso.rotation.x = 0.34;
    head.rotation.x = -0.3;
  }

  if (o.tattered) {
    const ragMat = new THREE.MeshStandardMaterial({ color: o.cloth, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    flashMats.push(ragMat);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * S, 0.5 + Math.random() * 0.5), ragMat);
      rag.position.set(Math.cos(a) * 0.2 * S, 0.02 * S, Math.sin(a) * 0.16 * S);
      rag.rotation.y = -a;
      rag.name = "rag";
      hips.add(rag);
    }
  }

  const height = 1.85 * S;

  return {
    root,
    hips,
    torso,
    head,
    shoulderL: L.shoulder,
    elbowL: L.elbow,
    handL: L.hand,
    shoulderR: R.shoulder,
    elbowR: R.elbow,
    handR: R.hand,
    hipL: legL.hip,
    kneeL: legL.knee,
    hipR: legR.hip,
    kneeR: legR.knee,
    cape,
    capeBase,
    weapon,
    bladeLength,
    flashMats,
    glowMats,
    height,
    hipHeight,
  };
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
const damp = (cur: number, target: number, lambda: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

export interface PoseInput {
  dt: number;
  time: number;
  speed: number; // 0..1 locomotion blend
  state: string;
  phase: number; // 0..1 within action
  combo: number;
  hunched?: boolean;
  guard?: boolean;
  weapon?: string;
  lookYaw?: number; // radians, head horizontal look
  lookPitch?: number; // radians, head vertical look
  footLock?: boolean; // for foot IK polish
}

/** Smoothly drives all joints toward the pose defined by the current state. */
export function poseRig(rig: Rig, p: PoseInput) {
  const t = p.time;
  const dt = Math.min(p.dt, 0.05);
  const k = 14;

  // target values
  let hipsY = 0;
  let torsoX = p.hunched ? 0.3 : 0.02;
  let torsoY = 0;
  let torsoZ = 0;
  let headX = p.hunched ? -0.28 : 0;
  let headY = 0;

  let shLX = 0, shLZ = 0.2, elLX = -0.35;
  let shRX = 0, shRZ = -0.2, elRX = -0.35;
  let hLX = 0, kLX = 0, hRX = 0, kRX = 0;
  let rootRotX = 0;

  const walkPhase = t * (6 + p.speed * 6);
  const sw = Math.sin(walkPhase);
  const sw2 = Math.sin(walkPhase * 2);

  if (p.state === "locomotion") {
    const amp = 0.22 + p.speed * 0.75;
    hLX = sw * amp;
    hRX = -sw * amp;
    kLX = Math.max(0, -sw * 0.5) * (0.5 + p.speed) - 0.08;
    kRX = Math.max(0, sw * 0.5) * (0.5 + p.speed) - 0.08;
    kLX = -Math.abs(Math.min(0, sw)) * (0.9 + p.speed * 0.8) - 0.05;
    kRX = -Math.abs(Math.min(0, -sw)) * (0.9 + p.speed * 0.8) - 0.05;
    shLX = -sw * amp * 0.85;
    shRX = sw * amp * 0.85;
    elLX = -0.4 - Math.abs(sw) * 0.35;
    elRX = -0.5 - Math.abs(sw) * 0.4;
    hipsY = -Math.abs(sw2) * 0.05 * (0.4 + p.speed) + Math.sin(t * 1.6) * 0.008;
    torsoX += p.speed * 0.3 + Math.abs(sw2) * 0.03;
    torsoZ = -sw * 0.05;
    headX -= p.speed * 0.16;
    shLZ = 0.24 + p.speed * 0.18;
    shRZ = -0.24 - p.speed * 0.18;
  } else if (p.state === "idle") {
    hipsY = Math.sin(t * 1.5) * 0.014 + Math.sin(t * 0.9) * 0.006;
    torsoX += Math.sin(t * 1.5) * 0.018 + Math.sin(t * 0.7) * 0.008;
    torsoZ += Math.sin(t * 0.55) * 0.015;
    headY = Math.sin(t * 0.42) * 0.24 + Math.sin(t * 0.31) * 0.08;
    headX += Math.sin(t * 0.8) * 0.03;
    shLZ = 0.22 + Math.sin(t * 1.5 + 1) * 0.02 + Math.sin(t * 0.6) * 0.01;
    shRZ = -0.22 - Math.sin(t * 1.5) * 0.02 - Math.sin(t * 0.6) * 0.01;
    elLX = -0.42 + Math.sin(t * 1.1) * 0.02;
    elRX = -0.55 + Math.sin(t * 1.1 + 0.5) * 0.02;
    hLX = -0.03 + Math.sin(t * 0.7) * 0.01;
    hRX = 0.05 + Math.sin(t * 0.7 + 1) * 0.01;
    kLX = -0.06;
    kRX = -0.06;
  } else if (p.state === "attack" && p.weapon === "twinblades") {
    // fast alternating dual-blade flurry — tight amplitude, quick timing
    const f = p.phase;
    const combo = p.combo % 3;
    const primary = combo % 2 === 0; // alternates which arm leads
    const wind = Math.min(1, f / 0.16);
    const strike = Math.max(0, Math.min(1, (f - 0.16) / 0.14));
    const rec = Math.max(0, (f - 0.3) / 0.7);
    const lead = 2.2 * wind - 2.7 * strike + 0.5 * rec;
    const off = 1.1 * wind - 1.4 * strike + 0.3 * rec;
    shRX = primary ? lead : off * 0.6;
    shLX = primary ? off * 0.6 : lead;
    shRZ = primary ? -1.3 * strike : 0.4;
    shLZ = primary ? 0.4 : 1.3 * strike;
    elRX = -0.6 - 0.8 * strike;
    elLX = -0.6 - 0.8 * strike;
    torsoY = (primary ? 1 : -1) * (0.5 * wind - 0.8 * strike + 0.2 * rec);
    torsoX = 0.06 + 0.14 * strike;
  } else if (p.state === "attack" && p.weapon === "halberd") {
    // reach thrusts — spacing weapon, slower wind-up, big extension
    const f = p.phase;
    const combo = p.combo % 3;
    const wind = Math.min(1, f / (combo === 2 ? 0.5 : 0.4));
    const strike = Math.max(0, Math.min(1, (f - (combo === 2 ? 0.5 : 0.4)) / 0.2));
    const rec = Math.max(0, (f - (combo === 2 ? 0.7 : 0.6)) / 0.4);
    shRX = -1.6 * wind + 1.4 * strike - 0.3 * rec;
    shLX = -1.4 * wind + 1.2 * strike - 0.3 * rec;
    elRX = -0.3 - 1.3 * strike;
    elLX = -0.3 - 1.1 * strike;
    torsoX = 0.16 * wind + 0.32 * strike - 0.1 * rec;
    torsoY = combo === 1 ? -0.4 * strike : combo === 2 ? 0.5 * wind - 0.6 * strike : 0;
    hLX = 0.22 * strike;
    hRX = -0.18 * strike;
  } else if (p.state === "attack") {
    const f = p.phase;
    const combo = p.combo % 3;
    if (combo === 0) {
      // wide right-to-left slash
      const wind = Math.min(1, f / 0.34);
      const strike = Math.max(0, Math.min(1, (f - 0.34) / 0.26));
      const rec = Math.max(0, (f - 0.6) / 0.4);
      shRX = 2.5 * wind - 3.1 * strike + 0.6 * rec;
      shRZ = -1.5 * wind + 2.4 * strike - 0.4 * rec;
      elRX = -0.9 + 0.7 * strike;
      torsoY = 0.95 * wind - 1.9 * strike + 0.5 * rec;
      torsoX = 0.05 + 0.28 * strike;
      shLX = -0.4 - 0.5 * strike;
      shLZ = 0.5 + 0.7 * strike;
      hLX = 0.18 * strike;
      hRX = -0.2 * strike;
    } else if (combo === 1) {
      // returning left-to-right
      const wind = Math.min(1, f / 0.3);
      const strike = Math.max(0, Math.min(1, (f - 0.3) / 0.24));
      const rec = Math.max(0, (f - 0.56) / 0.44);
      shRX = 1.6 * wind - 2.7 * strike + 0.5 * rec;
      shRZ = 1.7 * wind - 2.9 * strike + 0.4 * rec;
      elRX = -1.3 + 1.0 * strike;
      torsoY = -1.0 * wind + 1.9 * strike - 0.5 * rec;
      torsoX = 0.05 + 0.2 * strike;
      shLZ = 0.3 - 0.5 * strike;
    } else {
      // overhead smash
      const wind = Math.min(1, f / 0.4);
      const strike = Math.max(0, Math.min(1, (f - 0.4) / 0.18));
      const rec = Math.max(0, (f - 0.6) / 0.4);
      shRX = 2.9 * wind - 4.0 * strike + 0.7 * rec;
      shRZ = -0.1;
      elRX = -1.5 + 1.4 * strike;
      shLX = 2.6 * wind - 3.6 * strike + 0.6 * rec;
      shLZ = 0.1;
      torsoX = -0.45 * wind + 1.0 * strike - 0.3 * rec;
      hLX = -0.3 * wind + 0.5 * strike;
      hRX = 0.2 * wind - 0.35 * strike;
      kLX = -0.5 * strike;
      hipsY = -0.12 * strike;
    }
  } else if (p.state === "heavy" && p.weapon === "twinblades") {
    // both blades spin through a full circle — flashy, low individual damage
    const f = p.phase;
    const wind = Math.min(1, f / 0.3);
    const strike = Math.max(0, Math.min(1, (f - 0.3) / 0.3));
    const rec = Math.max(0, (f - 0.6) / 0.4);
    torsoY = 3.4 * wind * strike - 3.0 * rec;
    shRX = -1.6 + 1.2 * strike;
    shLX = -1.6 + 1.2 * strike;
    shRZ = -1.4 * strike;
    shLZ = 1.4 * strike;
    hipsY = -0.1 * strike;
  } else if (p.state === "heavy" && p.weapon === "halberd") {
    // wide horizontal reap, unmatched range
    const f = p.phase;
    const wind = Math.min(1, f / 0.5);
    const strike = Math.max(0, Math.min(1, (f - 0.5) / 0.22));
    const rec = Math.max(0, (f - 0.72) / 0.28);
    shRX = -0.6 * wind + 0.4 * strike;
    shLX = -0.4 * wind + 0.3 * strike;
    torsoY = -1.5 * wind + 3.2 * strike - 0.7 * rec;
    torsoX = 0.1 * wind + 0.3 * strike;
    hLX = 0.3 * strike;
    kLX = -0.3 * strike;
  } else if (p.state === "heavy") {
    const f = p.phase;
    const wind = Math.min(1, f / 0.46);
    const strike = Math.max(0, Math.min(1, (f - 0.46) / 0.2));
    const rec = Math.max(0, (f - 0.66) / 0.34);
    shRX = 3.3 * wind - 4.4 * strike + 0.8 * rec;
    shRZ = -1.9 * wind + 2.6 * strike;
    elRX = -1.7 + 1.6 * strike;
    shLX = 2.4 * wind - 3.2 * strike;
    torsoY = 1.35 * wind - 2.6 * strike + 0.6 * rec;
    torsoX = -0.3 * wind + 0.95 * strike - 0.3 * rec;
    hipsY = -0.06 - 0.18 * strike;
    hLX = 0.4 * strike;
    hRX = -0.45 * strike;
    kLX = -0.35 * strike;
  } else if (p.state === "roll") {
    rootRotX = p.phase * Math.PI * 2;
    const tuck = Math.sin(p.phase * Math.PI);
    hipsY = -0.4 * tuck;
    torsoX = 1.1 * tuck;
    hLX = -1.9 * tuck;
    hRX = -1.9 * tuck;
    kLX = -1.9 * tuck;
    kRX = -1.9 * tuck;
    shLX = -1.4 * tuck;
    shRX = -1.4 * tuck;
    elLX = -1.8 * tuck;
    elRX = -1.8 * tuck;
    headX = 0.6 * tuck;
  } else if (p.state === "backstep") {
    const tuck = Math.sin(p.phase * Math.PI);
    hipsY = -0.16 * tuck;
    torsoX = -0.3 * tuck;
    hLX = 0.6 * tuck;
    hRX = -0.4 * tuck;
    shRX = -0.5 * tuck;
    shLX = -0.5 * tuck;
  } else if (p.state === "guard") {
    torsoX = 0.16;
    torsoY = 0.42;
    shLX = -1.5;
    shLZ = 0.55;
    elLX = -1.5;
    shRX = -0.5;
    shRZ = -0.85;
    elRX = -1.2;
    hLX = -0.2;
    hRX = 0.22;
    kLX = -0.34;
    kRX = -0.3;
    hipsY = -0.09 + Math.sin(t * 2.2) * 0.008;
  } else if (p.state === "cast") {
    const f = p.phase;
    const up = Math.min(1, f / 0.45);
    const push = Math.max(0, Math.min(1, (f - 0.45) / 0.3));
    shLX = -2.4 * up + 0.9 * push;
    shLZ = 0.7 - 0.5 * push;
    elLX = -1.0 + 0.9 * push;
    shRX = -0.4;
    torsoX = -0.22 * up + 0.4 * push;
    hipsY = -0.05 * push;
  } else if (p.state === "hurt") {
    const f = Math.sin(p.phase * Math.PI);
    torsoX = -0.5 * f;
    headX = -0.4 * f;
    shLX = -0.9 * f;
    shRX = -0.9 * f;
    shLZ = 0.7 * f;
    shRZ = -0.7 * f;
    hipsY = -0.1 * f;
    hLX = 0.25 * f;
    hRX = -0.2 * f;
  } else if (p.state === "stagger") {
    const f = Math.sin(p.phase * Math.PI * 0.9);
    torsoX = -0.9 * f;
    headX = -0.6 * f;
    shLX = -1.4 * f;
    shRX = -1.6 * f;
    hipsY = -0.3 * f;
    kLX = -0.7 * f;
    kRX = -0.5 * f;
  } else if (p.state === "death") {
    const f = Math.min(1, p.phase * 1.5);
    rootRotX = f * 1.45;
    hipsY = -0.72 * f;
    torsoX = 0.4 * f;
    headX = 0.5 * f;
    shLX = 0.8 * f;
    shRX = 0.6 * f;
    shLZ = 1.1 * f;
    shRZ = -1.1 * f;
    hLX = -0.6 * f;
    hRX = -0.4 * f;
    kLX = -0.9 * f;
    kRX = -0.6 * f;
  } else if (p.state === "grace") {
    const f = Math.min(1, p.phase);
    hipsY = -0.55 * f;
    torsoX = 0.34 * f;
    headX = -0.2 * f;
    hLX = -1.7 * f;
    kLX = -1.5 * f;
    hRX = -1.5 * f;
    kRX = -1.9 * f;
    shLX = -0.3 * f;
    shRX = -0.3 * f;
  }

  const snap = p.state === "attack" || p.state === "heavy" || p.state === "roll" ? 40 : k;

  rig.hips.position.y = damp(rig.hips.position.y, rig.hipHeight + hipsY * (rig.hipHeight / 0.95), snap, dt);
  rig.torso.rotation.x = damp(rig.torso.rotation.x, torsoX, snap, dt);
  rig.torso.rotation.y = damp(rig.torso.rotation.y, torsoY, snap, dt);
  rig.torso.rotation.z = damp(rig.torso.rotation.z, torsoZ, snap, dt);
  // insane polish: head tracking — blend in lookYaw/lookPitch if provided
  if (p.lookYaw !== undefined) {
    headY += p.lookYaw * 0.85;
  }
  if (p.lookPitch !== undefined) {
    headX += p.lookPitch * 0.7;
  }
  // clamp head to avoid exorcist
  headY = Math.max(-0.9, Math.min(0.9, headY));
  headX = Math.max(-0.6, Math.min(0.55, headX));

  rig.head.rotation.x = damp(rig.head.rotation.x, headX, k, dt);
  rig.head.rotation.y = damp(rig.head.rotation.y, headY, k, dt);

  rig.shoulderL.rotation.x = damp(rig.shoulderL.rotation.x, shLX, snap, dt);
  rig.shoulderL.rotation.z = damp(rig.shoulderL.rotation.z, shLZ, snap, dt);
  rig.elbowL.rotation.x = damp(rig.elbowL.rotation.x, elLX, snap, dt);
  rig.shoulderR.rotation.x = damp(rig.shoulderR.rotation.x, shRX, snap, dt);
  rig.shoulderR.rotation.z = damp(rig.shoulderR.rotation.z, shRZ, snap, dt);
  rig.elbowR.rotation.x = damp(rig.elbowR.rotation.x, elRX, snap, dt);

  rig.hipL.rotation.x = damp(rig.hipL.rotation.x, hLX, snap, dt);
  rig.hipR.rotation.x = damp(rig.hipR.rotation.x, hRX, snap, dt);
  // knees hinge the opposite way to elbows
  rig.kneeL.rotation.x = damp(rig.kneeL.rotation.x, -kLX, snap, dt);
  rig.kneeR.rotation.x = damp(rig.kneeR.rotation.x, -kRX, snap, dt);

  rig.hips.rotation.x = damp(rig.hips.rotation.x, rootRotX, p.state === "roll" ? 60 : k, dt);

  // ---- cape simulation ----
  if (rig.cape && rig.capeBase) {
    const g = rig.cape.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const base = rig.capeBase;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const v = Math.min(1, -by / 1.3);
      const wave = Math.sin(t * 4.5 + by * 3.2 + bx * 1.4) * 0.05 + Math.sin(t * 2.1 + by * 1.5) * 0.04;
      arr[i * 3] = bx + wave * v * 0.6;
      arr[i * 3 + 1] = by + v * v * p.speed * 0.28;
      arr[i * 3 + 2] = base[i * 3 + 2] - v * v * (0.18 + p.speed * 1.15) - wave * v;
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }
}
