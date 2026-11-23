import * as THREE from "three";
import type { GuardianId } from "./guardianRigs";

export type SignaturePattern = "volley" | "pulse" | "ambush" | "beam" | "dive" | "pull" | "fan";
export interface GuardianSignature {
  label: string; pattern: SignaturePattern; windup: number; cooldown: number; radius: number; damage: number; color: number; maxRange: number;
}
export interface SignatureMark { x: number; z: number; dangerous: boolean }
export interface SignaturePlan { spec: GuardianSignature; origin: THREE.Vector3; target: THREE.Vector3; marks: SignatureMark[] }

export const GUARDIAN_SIGNATURES: Record<GuardianId, GuardianSignature> = {
  colossus: { label: "SHELL BARRAGE", pattern: "volley", windup: 2.2, cooldown: 10, radius: 3.1, damage: 23, color: 0xffbc70, maxRange: 25 },
  captain: { label: "DROWNED SHOCK", pattern: "pulse", windup: 1.8, cooldown: 9, radius: 6, damage: 24, color: 0x8fdfff, maxRange: 14 },
  stalker: { label: "MIRROR LUNGE", pattern: "ambush", windup: 1.8, cooldown: 9, radius: 3.1, damage: 24, color: 0xffad73, maxRange: 20 },
  warden: { label: "PRISM BEAM", pattern: "beam", windup: 2.1, cooldown: 9, radius: 1.6, damage: 25, color: 0xbcefff, maxRange: 26 },
  leviathan: { label: "STEAM VENTS", pattern: "volley", windup: 2.2, cooldown: 10, radius: 3.4, damage: 25, color: 0xffa05c, maxRange: 22 },
  sentinel: { label: "STORM DIVE", pattern: "dive", windup: 1.9, cooldown: 9, radius: 3.5, damage: 24, color: 0xa5eaff, maxRange: 18 },
  forgemaster: { label: "MAGNETIC SURGE", pattern: "pull", windup: 2.4, cooldown: 11, radius: 6.5, damage: 26, color: 0xffc075, maxRange: 15 },
  herald: { label: "PALE BLADES", pattern: "fan", windup: 2.0, cooldown: 9, radius: 1.2, damage: 19, color: 0xe2d8ff, maxRange: 25 },
};

/** Capture target positions once; warnings do not follow the player. */
export function planGuardianSignature(id: GuardianId, origin: THREE.Vector3, target: THREE.Vector3): SignaturePlan {
  const spec = GUARDIAN_SIGNATURES[id];
  const start = origin.clone();
  const end = target.clone();
  if (spec.pattern === "dive") {
    const delta = end.clone().sub(start).setY(0);
    if (delta.length() > 8) delta.setLength(8);
    end.x = start.x + delta.x;
    end.z = start.z + delta.z;
  }
  const marks: SignatureMark[] = [];
  if (spec.pattern === "pulse" || spec.pattern === "pull") {
    marks.push({ x: start.x, z: start.z, dangerous: true });
  } else if (spec.pattern === "volley") {
    marks.push({ x: end.x, z: end.z, dangerous: true },
      { x: end.x + 5, z: end.z, dangerous: true }, { x: end.x - 5, z: end.z, dangerous: true });
  } else if (spec.pattern === "ambush") {
    marks.push({ x: end.x, z: end.z, dangerous: true },
      { x: end.x + 5, z: end.z + 2, dangerous: false }, { x: end.x - 5, z: end.z + 2, dangerous: false });
  } else if (spec.pattern === "dive") {
    marks.push({ x: end.x, z: end.z, dangerous: true });
  }
  return { spec, origin: start, target: end, marks };
}

export function distanceToSegmentXZ(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 0.0001) return Math.hypot(point.x - a.x, point.z - a.z);
  const t = THREE.MathUtils.clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

/** Treat intervening solid scenery as cover, ignoring the guardian's own base. */
export function lineBlockedByCircles(a: THREE.Vector3, b: THREE.Vector3, colliders: readonly { x: number; z: number; r: number }[]): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 0.0001) return false;
  return colliders.some((collider) => {
    if (Math.hypot(a.x - collider.x, a.z - collider.z) <= collider.r + 0.2) return false;
    const t = ((collider.x - a.x) * dx + (collider.z - a.z) * dz) / lengthSquared;
    if (t <= 0.02 || t >= 0.98) return false;
    return Math.hypot(collider.x - (a.x + dx * t), collider.z - (a.z + dz * t)) < collider.r;
  });
}
