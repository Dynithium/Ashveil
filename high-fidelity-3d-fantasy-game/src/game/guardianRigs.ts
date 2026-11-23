import * as THREE from "three";
import { buildRig, type Rig, type RigOptions } from "./rig";

export type GuardianId = "colossus" | "captain" | "stalker" | "warden" | "leviathan" | "sentinel" | "forgemaster" | "herald";
export const GUARDIAN_IDS: GuardianId[] = ["colossus", "captain", "stalker", "warden", "leviathan", "sentinel", "forgemaster", "herald"];

const OPTIONS: Record<GuardianId, RigOptions> = {
  colossus: { scale: 3.5, bulk: 1.8, armor: 0x60452c, armorDark: 0x29241f, cloth: 0x554332, accent: 0xffb259, weapon: "none" },
  captain: { scale: 2.8, bulk: 1.35, armor: 0x596773, armorDark: 0x242e37, cloth: 0x334256, accent: 0x9ed9ef, weapon: "swordshield", cape: true },
  stalker: { scale: 3, bulk: 1, armor: 0x342523, armorDark: 0x171519, cloth: 0x442c25, accent: 0xff7640, weapon: "none" },
  warden: { scale: 3, bulk: 1.15, armor: 0x40394f, armorDark: 0x1e1b2b, cloth: 0x342f48, accent: 0xbcefff, weapon: "none" },
  leviathan: { scale: 3, bulk: 1.2, armor: 0x35251f, armorDark: 0x1b1716, cloth: 0x492d23, accent: 0xff7a26, weapon: "none" },
  sentinel: { scale: 3, bulk: 1, armor: 0x7b8990, armorDark: 0x303e48, cloth: 0x354a59, accent: 0xaff2ff, weapon: "halberd" },
  forgemaster: { scale: 3.4, bulk: 1.7, armor: 0x5c4530, armorDark: 0x292520, cloth: 0x493325, accent: 0xffa64c, weapon: "greatsword" },
  herald: { scale: 3, bulk: 1.15, armor: 0xa4a39b, armorDark: 0x41424b, cloth: 0x68636c, accent: 0xe5dcff, weapon: "greatsword", cape: true },
};

type Motion = { kind: "wings"; left: THREE.Group; right: THREE.Group } | { kind: "segments"; parts: THREE.Object3D[] };

/** A distinct procedural silhouette for each named guardian. */
export function buildGuardianRig(id: GuardianId): Rig {
  const options = OPTIONS[id];
  const rig = buildRig(options);
  const s = options.scale ?? 1;
  const plate = new THREE.MeshStandardMaterial({ color: options.armor, metalness: 0.65, roughness: 0.58, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: options.armorDark, metalness: 0.45, roughness: 0.8, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: options.accent, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  rig.flashMats.push(plate, dark);
  rig.glowMats.push(glow);
  rig.root.userData.guardianId = id;

  const part = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) =>
    part(parent, new THREE.BoxGeometry(w * s, h * s, d * s), material, x * s, y * s, z * s);

  if (id === "colossus") {
    // A buried tank hull forms the torso, with shoulder guns and treads.
    box(rig.torso, 1.65, 0.8, 0.85, plate, 0, 0.4, 0);
    box(rig.torso, 1.1, 0.22, 0.65, dark, 0, 0.9, 0);
    for (const side of [-1, 1]) {
      const barrel = part(rig.torso, new THREE.CylinderGeometry(0.09 * s, 0.13 * s, 1.05 * s, 6), dark, side * 0.62 * s, 0.74 * s, 0.7 * s);
      barrel.rotation.x = Math.PI / 2;
      box(side < 0 ? rig.hipL : rig.hipR, 0.42, 0.6, 0.85, dark, 0, -0.25, 0);
    }
    box(rig.torso, 0.35, 0.28, 0.04, glow, 0, 0.4, 0.44);
  } else if (id === "captain") {
    // Broken naval crest and an unmistakable shield-and-sword profile.
    box(rig.head, 0.08, 0.28, 0.45, plate, 0, 0.36, 0);
    box(rig.torso, 0.56, 0.7, 0.025, dark, 0, 0.2, -0.24);
    box(rig.torso, 0.18, 0.27, 0.03, glow, 0, 0.33, 0.2);
  } else if (id === "stalker" || id === "leviathan") {
    // Keep the hidden skeleton for movement and combat state, but give the
    // predator and serpent their own non-humanoid bodies.
    rig.hips.visible = false;
    rig.weapon = undefined;
    const body = new THREE.Group();
    rig.root.add(body);
    const parts: THREE.Object3D[] = [];
    if (id === "stalker") {
      const core = part(body, new THREE.SphereGeometry(0.58 * s, 8, 6), dark, 0, 0.58 * s, 0);
      core.scale.set(0.85, 0.75, 1.5);
      part(body, new THREE.ConeGeometry(0.32 * s, 0.85 * s, 5), plate, 0, 0.72 * s, 0.9 * s).rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        part(body, new THREE.SphereGeometry(0.07 * s, 6, 4), glow, side * 0.18 * s, 0.78 * s, 1.05 * s);
        for (const z of [-0.65, 0.5]) {
          const leg = box(body, 0.16, 0.65, 0.18, plate, side * 0.46, 0.27, z);
          leg.rotation.z = side * 0.35;
          parts.push(leg);
        }
      }
      const tail = part(body, new THREE.ConeGeometry(0.16 * s, 1.6 * s, 5), plate, 0, 0.75 * s, -1.25 * s);
      tail.rotation.x = -Math.PI / 2;
      parts.push(tail);
    } else {
      for (let i = 0; i < 7; i++) {
        const radius = (0.58 - i * 0.045) * s;
        const segment = part(body, new THREE.SphereGeometry(radius, 8, 6), i % 2 ? dark : plate, 0, (0.7 + i * 0.03) * s, -i * 0.5 * s);
        segment.scale.set(1, 0.8, 1.2);
        parts.push(segment);
      }
      const mouth = part(body, new THREE.TorusGeometry(0.36 * s, 0.1 * s, 6, 10), glow, 0, 0.72 * s, 0.55 * s);
      mouth.rotation.y = Math.PI;
      for (const side of [-1, 1]) part(body, new THREE.SphereGeometry(0.09 * s, 6, 4), glow, side * 0.32 * s, 0.95 * s, 0.36 * s);
    }
    rig.root.userData.guardianMotion = { kind: "segments", parts } satisfies Motion;
  } else if (id === "warden") {
    // Faceted obsidian armor and an elevated prism refract the silhouette.
    for (const side of [-1, 1]) {
      const shard = part(rig.torso, new THREE.OctahedronGeometry(0.38 * s, 0), plate, side * 0.52 * s, 0.5 * s, 0);
      shard.scale.set(0.7, 1.9, 0.7);
      shard.rotation.z = side * -0.3;
    }
    const prism = part(rig.head, new THREE.OctahedronGeometry(0.34 * s, 0), glow, 0, 0.45 * s, 0);
    prism.scale.y = 1.7;
  } else if (id === "sentinel") {
    const left = new THREE.Group(), right = new THREE.Group();
    left.position.set(-0.42 * s, 0.55 * s, -0.1 * s);
    right.position.set(0.42 * s, 0.55 * s, -0.1 * s);
    rig.torso.add(left, right);
    for (const [side, wing] of [[-1, left], [1, right]] as const) {
      for (let i = 0; i < 3; i++) {
        const feather = box(wing, 1.2 - i * 0.16, 0.12, 0.36, i === 2 ? glow : plate, side * (0.62 + i * 0.2), -i * 0.18, -i * 0.1);
        feather.rotation.z = side * -0.2;
      }
    }
    rig.root.userData.guardianMotion = { kind: "wings", left, right } satisfies Motion;
  } else if (id === "forgemaster") {
    box(rig.torso, 1.2, 0.9, 0.72, plate, 0, 0.45, 0);
    for (const side of [-1, 1]) {
      const stack = part(rig.torso, new THREE.CylinderGeometry(0.14 * s, 0.18 * s, 0.9 * s, 7), dark, side * 0.48 * s, 1.05 * s, -0.1 * s);
      stack.rotation.z = side * -0.12;
    }
    box(rig.torso, 0.42, 0.4, 0.05, glow, 0, 0.4, 0.38);
    if (rig.weapon) box(rig.weapon, 0.65, 0.38, 0.55, plate, 0, 1.35, 0);
  } else {
    // The Herald is a person in pale plate, not another horned warlord.
    const halo = part(rig.torso, new THREE.TorusGeometry(0.58 * s, 0.035 * s, 5, 18), glow, 0, 0.85 * s, -0.3 * s);
    halo.rotation.y = Math.PI / 2;
    box(rig.torso, 0.52, 0.78, 0.03, dark, 0, 0.2, -0.22);
  }
  return rig;
}

export function animateGuardianRig(rig: Rig, time: number, state: string, phase: number) {
  const motion = rig.root.userData.guardianMotion as Motion | undefined;
  if (!motion) return;
  if (motion.kind === "wings") {
    const flap = Math.sin(time * (state === "attack" ? 8 : 3)) * 0.35 + 0.22;
    motion.left.rotation.z = -flap;
    motion.right.rotation.z = flap;
  } else {
    motion.parts.forEach((part, index) => {
      part.rotation.y = Math.sin(time * 3 - index * 0.7) * (state === "attack" ? 0.3 : 0.12);
      if (state === "death") part.rotation.z = Math.sin(index) * phase * 0.3;
    });
  }
}
