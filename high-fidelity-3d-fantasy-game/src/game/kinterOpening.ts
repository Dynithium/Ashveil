import * as THREE from "three";
import { makeRng, terrainHeight } from "./terrain";
import type { Rig } from "./rig";

// ---------------------------------------------------------------------------
// ASHVEIL — PROLOGUE: "The Long Fall"
//
// Kinter's arrival, ten years before Minslaire's first journey. One authored,
// cinematic sequence that runs from the dark forest through the river and
// waterfall, onto Uoka's shore, through Lyekai's challenge and the drawbridge
// escort, and ends at his first face-to-face meeting with King Aldrich.
//
// This module owns the script (beats, subtitles, objectives, waypoints) and the
// procedural set piece. The engine owns the runtime controller that plays it.
// ---------------------------------------------------------------------------

/** Hard gate: the Aldrich meeting can never open before this many seconds. */
export const PROLOGUE_MIN_SECONDS = 600;

export type PrologueMode = "cinematic" | "traverse";

export interface PrologueCue {
  /** Seconds into the beat. */
  t: number;
  speaker: string;
  text: string;
  /** Seconds the line stays on screen (default 10). */
  hold?: number;
}

export interface PrologueAwaitDef {
  key: string;
  /** Seconds into the beat before the prompt becomes available. */
  at: number;
  prompt: string;
  /** Required prompts hold the beat open until satisfied. */
  required: boolean;
  /** Optional landmark location; prompts appear only within reach. */
  position?: { x: number; z: number };
}

/** Authored camera for a cinematic beat. */
export interface PrologueCam {
  /** World yaw the camera orbits at (the camera sits in this direction from the player). */
  yaw: number;
  pitch: number;
  dist: number;
  /** Slow yaw drift per second — a living establishing shot. */
  drift: number;
  /** Height of the look target above the player's feet. */
  look: number;
  targetX?: number;
  targetZ?: number;
}

export interface PrologueShot {
  /** Seconds into the beat when this composition begins. */
  at: number;
  cam: PrologueCam;
}

export interface PrologueBeat {
  id: string;
  title: string;
  area: string;
  objective: string;
  hint: string;
  mode: PrologueMode;
  /** Minimum seconds on this beat. */
  duration: number;
  waypoint?: { x: number; z: number; label: string };
  awaits: PrologueAwaitDef[];
  cues: PrologueCue[];
  /** Hold the beat open while a story dialogue is on screen. */
  dialogueHold?: boolean;
  /** Start this beat under a black fade (covers a cut / waking up). */
  fadeIn?: boolean;
  /** Fade to black by the end of this beat. */
  fadeOut?: boolean;
  /** Cinematic camera direction. */
  cam?: PrologueCam;
  /** Authored camera compositions that ease into one another during a beat. */
  shots?: PrologueShot[];
  /** Scripted slow walk the player follows during a cinematic beat. */
  walk?: { path: { x: number; z: number }[]; speed: number };
}

/** Named world points the script and the set piece agree on. */
export const PROLOGUE_POINTS = {
  home: { x: 180, z: 286 },
  borderStart: { x: 178, z: 277 },
  borderCairn: { x: 175, z: 273 },
  borderSign: { x: 172, z: 269 },
  borderBird: { x: 173, z: 265 },
  forestStart: { x: 170, z: 260 },
  forestMid: { x: 167, z: 242 },
  riverBank: { x: 165, z: 214 },
  riverEdge: { x: 162, z: 203 },
  pool: { x: 161, z: 196 },
  shore: { x: 161, z: 187 },
  drawbridge: { x: 0, z: 84 },
  gate: { x: 0, z: 98 },
  keepDoor: { x: 0, z: 106 },
  throneApproach: { x: 0, z: 123 },
  king: { x: 0, z: 125.4 },
} as const;

/** Spline the arrival beat follows through the forest (deep wood -> river). */
export const PROLOGUE_PATH: { x: number; z: number }[] = [
  { x: 170, z: 260 },
  { x: 168, z: 251 },
  { x: 165.5, z: 242 },
  { x: 168, z: 233 },
  { x: 170.5, z: 224 },
  { x: 169, z: 216 },
  { x: 166.5, z: 214 },
];

// The eight authored beats. Their durations sum to 670 seconds (11:10), which
// sits above the 600-second gate so the meeting can never arrive early.
export const PROLOGUE_BEATS: PrologueBeat[] = [
  {
    id: "last-night", title: "THE LAST NIGHT", area: "Elderville · Gretriyon",
    objective: "A promise left at home", hint: "Kinter prepares to leave Elderville",
    mode: "cinematic", duration: 28, fadeIn: true, fadeOut: true,
    cam: { yaw: 0.3, pitch: 0.18, dist: 7.5, drift: 0.012, look: 1.25 },
    shots: [
      { at: 0, cam: { yaw: 0.3, pitch: 0.18, dist: 7.5, drift: 0.012, look: 1.25 } },
      { at: 11, cam: { yaw: -0.6, pitch: 0.22, dist: 5.4, drift: 0.01, look: 1.35 } },
      { at: 21, cam: { yaw: 0.5, pitch: 0.2, dist: 6.5, drift: 0.01, look: 1.3 } },
    ],
    awaits: [],
    cues: [
      { t: 2, speaker: "ELDER", text: "The border has not answered us in generations. Someone must discover what lies beyond it.", hold: 7 },
      { t: 10, speaker: "NARRATOR", text: "Kinter leaves the First Blade for his son. The Second Blade carries the same nick in its hilt.", hold: 7 },
      { t: 18, speaker: "KINTER'S NOTE", text: "Learn why you draw a blade before you learn how.", hold: 7 },
      { t: 25, speaker: "NARRATOR", text: "He intends to come home.", hold: 3 },
    ],
  },
  {
    id: "border", title: "THE EDGE OF THE KNOWN WORLD", area: "Beyond Elderville",
    objective: "Walk beyond the last border marker", hint: "W A S D to move · X to jump · SPACE to Phase-Step · F to examine landmarks",
    mode: "traverse", duration: 5,
    waypoint: { x: 170, z: 262, label: "the uncharted forest" },
    awaits: [
      { key: "border-cairn", at: 0, prompt: "F — Examine the broken border cairn", required: false, position: PROLOGUE_POINTS.borderCairn },
      { key: "border-sign", at: 0, prompt: "F — Study the ancient road sign", required: false, position: PROLOGUE_POINTS.borderSign },
      { key: "border-bird", at: 0, prompt: "F — Examine the violet feather", required: false, position: PROLOGUE_POINTS.borderBird },
    ],
    cues: [{ t: 1, speaker: "KINTER", text: "The map ends here. The road doesn't.", hold: 6 }],
  },
  {
    id: "arrival",
    title: "THE LONG FALL",
    area: "Gretriyon Forest",
    objective: "Cross the dark forest",
    hint: "A cinematic opening — watch, and let the beat play",
    mode: "cinematic",
    duration: 80,
    // He walks the first stretch of the trail himself while the camera drifts.
    walk: { path: PROLOGUE_PATH.slice(0, 6), speed: 0.12 },
    cam: { yaw: 0.2, pitch: 0.34, dist: 14.5, drift: 0.05, look: 1.5 },
    shots: [
      { at: 0, cam: { yaw: 0.2, pitch: 0.34, dist: 14.5, drift: 0.035, look: 1.5 } },
      { at: 9, cam: { yaw: 0.45, pitch: 0.24, dist: 12, drift: 0.018, look: 1.45 } },
      { at: 18, cam: { yaw: 3.3, pitch: 0.2, dist: 10.5, drift: -0.01, look: 1.4 } },
      { at: 28, cam: { yaw: 5.9, pitch: 0.34, dist: 13, drift: 0.018, look: 1.7 } },
      { at: 38, cam: { yaw: 3.4, pitch: 0.18, dist: 9.5, drift: 0.012, look: 1.45 } },
      { at: 48, cam: { yaw: 0.1, pitch: 0.32, dist: 12, drift: -0.018, look: 1.65 } },
      { at: 58, cam: { yaw: 3.0, pitch: 0.16, dist: 8.5, drift: 0.016, look: 1.4 } },
      { at: 68, cam: { yaw: 5.9, pitch: 0.24, dist: 10.2, drift: -0.012, look: 1.55 } },
      { at: 77, cam: { yaw: 3.3, pitch: 0.2, dist: 8.4, drift: 0.01, look: 1.45 } },
    ],
    awaits: [],
    cues: [
      { t: 2, speaker: "NARRATOR", text: "Ten years before Minslaire's first journey. Months into the Elders' errand: find life beyond Gretriyon.", hold: 7 },
      { t: 10, speaker: "KINTER", text: "Still sealed. Still breathing. Keep moving.", hold: 6 },
      { t: 20, speaker: "KINTER", text: "The lifesuit hums against my ribs — low, steady, almost a heartbeat.", hold: 7 },
      { t: 29, speaker: "NARRATOR", text: "His heavy coat is worn through at the seams. Rain beads on the old hat.", hold: 7 },
      { t: 38, speaker: "NARRATOR", text: "One blade left with his son. The second rides across his back.", hold: 7 },
      { t: 47, speaker: "KINTER", text: "Roots underfoot. Stone overhead. The Elders asked, and I said yes.", hold: 7 },
      { t: 57, speaker: "NARRATOR", text: "The trail narrows to a strip between the trunks.", hold: 6 },
      { t: 67, speaker: "KINTER", text: "Water runs downhill. Downhill gets me out.", hold: 7 },
      { t: 76, speaker: "NARRATOR", text: "Beyond the map. One more step.", hold: 4 },
    ],
  },
  {
    id: "route",
    title: "FIND A ROUTE",
    area: "Gretriyon Forest",
    objective: "Pick a path through the roots and rock",
    hint: "Walk with W A S D · press F at the prompts",
    mode: "traverse",
    duration: 90,
    waypoint: { x: PROLOGUE_POINTS.riverBank.x, z: PROLOGUE_POINTS.riverBank.z, label: "low ground by the water" },
    shots: [
      { at: 0, cam: { yaw: 0.35, pitch: 0.22, dist: 8, drift: 0.01, look: 1.4 } },
      { at: 12, cam: { yaw: 3.3, pitch: 0.18, dist: 7, drift: 0.008, look: 1.35 } },
      { at: 24, cam: { yaw: 0.6, pitch: 0.26, dist: 9, drift: -0.01, look: 1.55 } },
      { at: 36, cam: { yaw: 3.3, pitch: 0.16, dist: 6.8, drift: 0.01, look: 1.3 } },
      { at: 48, cam: { yaw: 3.4, pitch: 0.24, dist: 8.5, drift: -0.008, look: 1.5 } },
      { at: 60, cam: { yaw: 0.2, pitch: 0.2, dist: 7.2, drift: 0.012, look: 1.4 } },
      { at: 74, cam: { yaw: 3.3, pitch: 0.18, dist: 8, drift: -0.01, look: 1.4 } },
      { at: 84, cam: { yaw: 0.3, pitch: 0.25, dist: 7.6, drift: 0.008, look: 1.5 } },
    ],
    awaits: [
      { key: "seal", at: 14, prompt: "F — Inspect the failing lifesuit seal", required: true },
      { key: "marks", at: 40, prompt: "F — Study the old machine marks", required: false },
      { key: "scan", at: 70, prompt: "F — Scan the exposed control trace", required: false },
    ],
    cues: [
      { t: 3, speaker: "KINTER", text: "Machine marks. Straight lines, cut into the stone.", hold: 6 },
      { t: 14, speaker: "KINTER", text: "Seal's gone soft. Patch it. Move.", hold: 6 },
      { t: 25, speaker: "NARRATOR", text: "A blue status light flickers once beneath the moss.", hold: 6 },
      { t: 36, speaker: "KINTER", text: "That pattern is older than the Elders' maps.", hold: 6 },
      { t: 48, speaker: "NARRATOR", text: "The stone gives way to a narrow descent.", hold: 6 },
      { t: 60, speaker: "KINTER", text: "Keep the water to your left. Don't lose the trail.", hold: 6 },
      { t: 72, speaker: "NARRATOR", text: "The old control trace continues below the roots.", hold: 6 },
      { t: 83, speaker: "KINTER", text: "Low ground. Fast now.", hold: 5 },
    ],
  },
  {
    id: "rockslide",
    title: "THE GROUND GIVES WAY",
    area: "Gretriyon Forest",
    objective: "Ride the fall — do not fight it",
    hint: "The slope is slipping beneath him",
    mode: "cinematic",
    duration: 80,
    cam: { yaw: 1.15, pitch: 0.3, dist: 9.5, drift: -0.03, look: 1.6, targetX: 163, targetZ: 206 },
    walk: { path: [{ x: PROLOGUE_POINTS.riverBank.x, z: PROLOGUE_POINTS.riverBank.z }, { x: 172, z: 211 }, { x: 163, z: 208 }, { x: 170, z: 205 }, { x: PROLOGUE_POINTS.riverEdge.x, z: PROLOGUE_POINTS.riverEdge.z }], speed: 0.18 },
    shots: [
      { at: 0, cam: { yaw: 1.15, pitch: 0.3, dist: 9.5, drift: -0.025, look: 1.6, targetX: 163, targetZ: 206 } },
      { at: 8, cam: { yaw: 2.2, pitch: 0.18, dist: 7.6, drift: 0.015, look: 1.5, targetX: 162, targetZ: 205 } },
      { at: 16, cam: { yaw: 0.1, pitch: 0.28, dist: 9, drift: 0.01, look: 1.7, targetX: 162, targetZ: 203 } },
      { at: 24, cam: { yaw: 3.2, pitch: 0.12, dist: 7.4, drift: 0.015, look: 1.4, targetX: 161, targetZ: 202 } },
      { at: 32, cam: { yaw: 0.7, pitch: 0.32, dist: 10, drift: -0.01, look: 1.8, targetX: 162, targetZ: 206 } },
      { at: 40, cam: { yaw: 3.4, pitch: 0.22, dist: 7.8, drift: 0.018, look: 1.45, targetX: 162, targetZ: 203 } },
      { at: 50, cam: { yaw: 0.4, pitch: 0.3, dist: 9.2, drift: -0.012, look: 1.65, targetX: 162, targetZ: 207 } },
      { at: 60, cam: { yaw: 3.2, pitch: 0.16, dist: 7.4, drift: 0.012, look: 1.35, targetX: 161, targetZ: 202 } },
      { at: 70, cam: { yaw: 0.15, pitch: 0.28, dist: 9, drift: -0.01, look: 1.7, targetX: 161, targetZ: 203 } },
      { at: 78, cam: { yaw: 3.3, pitch: 0.2, dist: 8, drift: 0.01, look: 1.4, targetX: 161, targetZ: 203 } },
    ],
    awaits: [],
    cues: [
      { t: 2, speaker: "KINTER", text: "Ground's soft here. Careful—", hold: 5 },
      { t: 9, speaker: "NARRATOR", text: "The slope tears loose beneath him.", hold: 5 },
      { t: 17, speaker: "KINTER", text: "No—hold—", hold: 5 },
      { t: 26, speaker: "NARRATOR", text: "Stone breaks around his boots.", hold: 5 },
      { t: 35, speaker: "KINTER", text: "The river. Get to the river.", hold: 5 },
      { t: 44, speaker: "NARRATOR", text: "The current takes him under the falling water.", hold: 5 },
      { t: 56, speaker: "KINTER", text: "Up. Get up—", hold: 5 },
      { t: 68, speaker: "SUIT TELEMETRY", text: "Impact warning. Brace. Brace.", hold: 5 },
    ],
  },
  {
    id: "waterfall",
    title: "OVER THE EDGE",
    area: "The Long Fall",
    objective: "Fall",
    hint: "Blackout",
    mode: "cinematic",
    duration: 60,
    cam: { yaw: 2.2, pitch: 0.34, dist: 11, drift: 0.02, look: 2.2, targetX: 162, targetZ: 202 },
    shots: [
      { at: 0, cam: { yaw: 2.2, pitch: 0.34, dist: 11, drift: 0.015, look: 2.2, targetX: 162, targetZ: 202 } },
      { at: 7, cam: { yaw: 3.1, pitch: 0.18, dist: 8.2, drift: 0.01, look: 1.7, targetX: 162, targetZ: 201 } },
      { at: 14, cam: { yaw: 1.05, pitch: 0.16, dist: 6.7, drift: -0.025, look: 1.1, targetX: 161, targetZ: 199 } },
      { at: 21, cam: { yaw: 4.2, pitch: 0.3, dist: 9.2, drift: 0.02, look: 1.8, targetX: 161, targetZ: 196 } },
      { at: 29, cam: { yaw: 2.9, pitch: 0.22, dist: 7.4, drift: -0.015, look: 1.5, targetX: 162, targetZ: 200 } },
      { at: 37, cam: { yaw: 5.0, pitch: 0.34, dist: 10, drift: 0.018, look: 2.0, targetX: 161, targetZ: 196 } },
      { at: 45, cam: { yaw: 1.7, pitch: 0.17, dist: 7, drift: -0.01, look: 1.35, targetX: 161, targetZ: 196 } },
      { at: 53, cam: { yaw: 3.7, pitch: 0.26, dist: 8.8, drift: 0.012, look: 1.75, targetX: 161, targetZ: 196 } },
    ],
    awaits: [],
    fadeOut: true,
    cues: [
      { t: 2, speaker: "NARRATOR", text: "The river narrows. The current pulls hard.", hold: 5 },
      { t: 9, speaker: "KINTER", text: "I can't find the bottom—", hold: 5 },
      { t: 16, speaker: "KINTER", text: "The edge—!", hold: 5 },
      { t: 23, speaker: "NARRATOR", text: "The water folds over the cliff lip.", hold: 5 },
      { t: 30, speaker: "NARRATOR", text: "The edge breaks away. White water swallows the cliff.", hold: 5 },
      { t: 38, speaker: "KINTER", text: "—!", hold: 4 },
      { t: 44, speaker: "NARRATOR", text: "Impact empties the world.", hold: 5 },
      { t: 50, speaker: "SUIT TELEMETRY", text: "…vitals low. seal critical. power reserve eleven percent. …signal lost.", hold: 8 },
    ],
  },
  {
    id: "shore",
    title: "UOKA'S SHORE",
    area: "Uoka — the shore",
    objective: "Regain your footing and read the shore",
    hint: "Rise · press F to check the suit",
    mode: "traverse",
    duration: 90,
    waypoint: { x: PROLOGUE_POINTS.shore.x, z: PROLOGUE_POINTS.shore.z, label: "the stone shore" },
    awaits: [
      { key: "telemetry", at: 16, prompt: "F — Read the lifesuit telemetry", required: true },
    ],
    fadeIn: true,
    shots: [
      { at: 0, cam: { yaw: 0.4, pitch: 0.1, dist: 12, drift: 0.015, look: 1.25, targetX: 145, targetZ: 164 } },
      { at: 10, cam: { yaw: 2.0, pitch: 0.2, dist: 9, drift: -0.01, look: 1.35 } },
      { at: 20, cam: { yaw: 3.7, pitch: 0.14, dist: 8, drift: 0.012, look: 1.45, targetX: 145, targetZ: 164 } },
      { at: 30, cam: { yaw: 1.1, pitch: 0.24, dist: 6.8, drift: 0.01, look: 1.5 } },
      { at: 40, cam: { yaw: 4.8, pitch: 0.16, dist: 10, drift: -0.012, look: 1.45, targetX: 145, targetZ: 164 } },
      { at: 50, cam: { yaw: 0.5, pitch: 0.18, dist: 6.6, drift: 0.01, look: 1.5 } },
      { at: 60, cam: { yaw: 3.2, pitch: 0.12, dist: 8, drift: -0.01, look: 1.5 } },
      { at: 70, cam: { yaw: 5.2, pitch: 0.2, dist: 8.8, drift: 0.01, look: 1.55, targetX: 145, targetZ: 164 } },
      { at: 82, cam: { yaw: 2.6, pitch: 0.13, dist: 7.6, drift: -0.008, look: 1.4 } },
    ],
    cues: [
      { t: 2, speaker: "NARRATOR", text: "Cold stone. Open air. He is alive.", hold: 5 },
      { t: 12, speaker: "KINTER", text: "Eleven percent. That's all I've got.", hold: 5 },
      { t: 22, speaker: "KINTER", text: "Coat's ruined. Suit's still sealed.", hold: 5 },
      { t: 32, speaker: "NARRATOR", text: "Across the water: lights in deliberate rows.", hold: 5 },
      { t: 42, speaker: "KINTER", text: "Built by someone. Kept running by someone.", hold: 5 },
      { t: 52, speaker: "NARRATOR", text: "The Elders wanted signs of life. There it is.", hold: 5 },
      { t: 64, speaker: "KINTER", text: "I'm not alone out here.", hold: 5 },
      { t: 76, speaker: "NARRATOR", text: "Iron sounds behind him. Boots close fast.", hold: 5 },
      { t: 86, speaker: "NARRATOR", text: "A ring of sentries closes around the shore.", hold: 5 },
    ],
  },
  {
    id: "lyekai",
    title: "LYEKAI'S CHALLENGE",
    area: "Uoka — the shore",
    objective: "Answer the commander, then surrender",
    hint: "Advance the lines · press F to lower your blade",
    mode: "cinematic",
    duration: 100,
    dialogueHold: true,
    cam: { yaw: 0.5, pitch: 0.16, dist: 7.5, drift: 0.04, look: 1.5, targetX: 158, targetZ: 184 },
    shots: [
      { at: 0, cam: { yaw: 0.5, pitch: 0.16, dist: 8.2, drift: 0.02, look: 1.5, targetX: 158, targetZ: 184 } },
      { at: 10, cam: { yaw: 3.25, pitch: 0.12, dist: 9, drift: 0.01, look: 1.45 } },
      { at: 20, cam: { yaw: 1.6, pitch: 0.18, dist: 6.5, drift: 0.015, look: 1.55, targetX: 155, targetZ: 182 } },
      { at: 30, cam: { yaw: 4.4, pitch: 0.22, dist: 8.5, drift: -0.01, look: 1.5 } },
      { at: 40, cam: { yaw: 2.25, pitch: 0.16, dist: 6.2, drift: 0.012, look: 1.45, targetX: 155, targetZ: 182 } },
      { at: 50, cam: { yaw: 5.2, pitch: 0.12, dist: 9, drift: -0.012, look: 1.45 } },
      { at: 60, cam: { yaw: 3.5, pitch: 0.2, dist: 7, drift: 0.008, look: 1.5, targetX: 155, targetZ: 182 } },
      { at: 70, cam: { yaw: 0.8, pitch: 0.14, dist: 8.5, drift: 0.012, look: 1.45 } },
      { at: 80, cam: { yaw: 2.7, pitch: 0.1, dist: 8, drift: -0.01, look: 1.5 } },
      { at: 90, cam: { yaw: 4.9, pitch: 0.18, dist: 7.4, drift: 0.01, look: 1.5, targetX: 155, targetZ: 182 } },
    ],
    awaits: [
      { key: "surrender", at: 40, prompt: "F — Lower your blade and surrender", required: true },
    ],
    cues: [
      { t: 2, speaker: "KINTER", text: "Steel out. Breath steady.", hold: 5 },
      { t: 10, speaker: "NARRATOR", text: "Sentries on the stones above. More at the waterline.", hold: 5 },
      { t: 18, speaker: "LYEKAI", text: "Lower it. You are one man in Uoka's water.", hold: 5 },
      { t: 26, speaker: "KINTER", text: "I came to find people. Not to die proving it.", hold: 5 },
      { t: 34, speaker: "KINTER", text: "Lyekai ahead. Eight guards around me. Water at my back.", hold: 5 },
      { t: 42, speaker: "NARRATOR", text: "He weighs the distance. Counts the spearpoints.", hold: 5 },
      { t: 50, speaker: "KINTER", text: "The math is plain. All right. All right.", hold: 5 },
      { t: 58, speaker: "LYEKAI", text: "Make the right choice, stranger.", hold: 5 },
      { t: 66, speaker: "NARRATOR", text: "He lays the second blade in the mud and opens his empty hands.", hold: 5 },
      { t: 74, speaker: "NARRATOR", text: "One sentry steps in to take the weapon.", hold: 5 },
      { t: 82, speaker: "LYEKAI", text: "You'll answer to the king. Walk.", hold: 5 },
      { t: 92, speaker: "NARRATOR", text: "The ring opens. The commander leads him inland.", hold: 5 },
    ],
  },
  {
    id: "escort",
    title: "ACROSS THE DRAWBRIDGE",
    area: "Uoka — Kingsfall",
    objective: "Follow the guards over the drawbridge",
    hint: "Walk with W A S D toward the golden mark",
    mode: "traverse",
    duration: 90,
    waypoint: { x: PROLOGUE_POINTS.keepDoor.x, z: PROLOGUE_POINTS.keepDoor.z, label: "the keep's great doors" },
    awaits: [],
    fadeIn: true,
    shots: [
      { at: 0, cam: { yaw: 0.3, pitch: 0.14, dist: 10, drift: 0.012, look: 1.6 } },
      { at: 10, cam: { yaw: 1.9, pitch: 0.12, dist: 8, drift: -0.008, look: 1.5 } },
      { at: 20, cam: { yaw: 3.4, pitch: 0.18, dist: 9, drift: 0.01, look: 1.6 } },
      { at: 30, cam: { yaw: 4.9, pitch: 0.12, dist: 7, drift: -0.01, look: 1.4 } },
      { at: 42, cam: { yaw: 0.7, pitch: 0.2, dist: 9.5, drift: 0.012, look: 1.6 } },
      { at: 54, cam: { yaw: 2.8, pitch: 0.14, dist: 7.2, drift: -0.01, look: 1.5 } },
      { at: 66, cam: { yaw: 5.5, pitch: 0.18, dist: 9, drift: 0.01, look: 1.6 } },
      { at: 78, cam: { yaw: 1.5, pitch: 0.1, dist: 6.8, drift: -0.008, look: 1.4 } },
      { at: 88, cam: { yaw: 3.2, pitch: 0.15, dist: 8, drift: 0.01, look: 1.5 } },
    ],
    cues: [
      { t: 3, speaker: "NARRATOR", text: "Boots strike the first plank. The bridge answers back.", hold: 5 },
      { t: 14, speaker: "KINTER", text: "Black water below. No rail on the left.", hold: 5 },
      { t: 25, speaker: "NARRATOR", text: "A chain groans above the moat.", hold: 5 },
      { t: 36, speaker: "LYEKAI", text: "Keep moving. The king does not wait twice.", hold: 5 },
      { t: 47, speaker: "KINTER", text: "Heat loops in the walls. They keep this place running by hand.", hold: 5 },
      { t: 58, speaker: "NARRATOR", text: "The gate rises over a city built around failing machines.", hold: 5 },
      { t: 69, speaker: "LYEKAI", text: "Eyes forward, stranger.", hold: 5 },
      { t: 80, speaker: "KINTER", text: "A capital. A throne. Maybe answers.", hold: 5 },
      { t: 88, speaker: "NARRATOR", text: "The doors open. Warm air spills into the rain.", hold: 5 },
    ],
  },
  {
    id: "castle",
    title: "THE THRONE HALL",
    area: "Kingsfall Keep",
    objective: "Approach King Aldrich",
    hint: "Walk to the throne · press F to meet the king",
    mode: "traverse",
    duration: 80,
    waypoint: { x: PROLOGUE_POINTS.throneApproach.x, z: PROLOGUE_POINTS.throneApproach.z, label: "the throne of Kingsfall" },
    awaits: [
      { key: "meet", at: 80, prompt: "F — Meet King Aldrich", required: true },
    ],
    fadeIn: true,
    shots: [
      { at: 0, cam: { yaw: 0.2, pitch: 0.13, dist: 14, drift: 0.01, look: 1.7, targetX: 0, targetZ: 123 } },
      { at: 10, cam: { yaw: 1.1, pitch: 0.18, dist: 12, drift: -0.01, look: 1.55, targetX: 0, targetZ: 124 } },
      { at: 20, cam: { yaw: 2.0, pitch: 0.1, dist: 10.5, drift: 0.008, look: 1.55, targetX: 0, targetZ: 124 } },
      { at: 30, cam: { yaw: 1.6, pitch: 0.12, dist: 9.5, drift: 0.01, look: 1.55, targetX: 0, targetZ: 124 } },
      { at: 40, cam: { yaw: 2.4, pitch: 0.14, dist: 8.8, drift: -0.008, look: 1.55, targetX: 0, targetZ: 124 } },
      { at: 50, cam: { yaw: 3.8, pitch: 0.12, dist: 8, drift: 0.008, look: 1.6, targetX: 0, targetZ: 125 } },
      { at: 58, cam: { yaw: 3.05, pitch: 0.1, dist: 7.2, drift: 0.008, look: 1.6, targetX: 0, targetZ: 125 } },
      { at: 68, cam: { yaw: 4.2, pitch: 0.16, dist: 8.5, drift: -0.008, look: 1.6, targetX: 0, targetZ: 125 } },
      { at: 76, cam: { yaw: 2.6, pitch: 0.1, dist: 7.5, drift: 0.006, look: 1.55, targetX: 0, targetZ: 125 } },
    ],
    cues: [
      { t: 3, speaker: "NARRATOR", text: "The doors shut behind him. The hall goes quiet.", hold: 5 },
      { t: 13, speaker: "KINTER", text: "Warm air. Recycled, but clean.", hold: 5 },
      { t: 23, speaker: "NARRATOR", text: "Two rows of empty chairs. One king at the far end.", hold: 5 },
      { t: 33, speaker: "LYEKAI", text: "Your Majesty. A stranger from beyond Gretriyon.", hold: 5 },
      { t: 43, speaker: "LYEKAI", text: "He says the Elders sent him to find life.", hold: 5 },
      { t: 53, speaker: "NARRATOR", text: "The king rises. The room holds its breath.", hold: 5 },
      { t: 63, speaker: "KINTER", text: "Aldrich. I am Kinter. I came from Elderville.", hold: 5 },
      { t: 73, speaker: "NARRATOR", text: "For the first time since the river, Kinter stands still.", hold: 5 },
    ],
  },
];

export const PROLOGUE_TOTAL_SECONDS = PROLOGUE_BEATS.reduce((sum, beat) => sum + beat.duration, 0);

/** Ease out the incoming cut before beginning the final fade to black. */
export function advancePrologueFade(previous: number, fadeOut: boolean, duration: number, elapsed: number, dt: number): number {
  const incoming = Math.max(0, previous - dt / 1.6);
  if (!fadeOut) return incoming;
  const remaining = Math.max(0, duration - elapsed);
  return Math.max(incoming, remaining < 6 ? 1 - remaining / 6 : 0);
}

/** Add Kinter's worn travel layers and back-carried second blade to the player rig. */
export function dressKinter(rig: Rig) {
  const coatMat = new THREE.MeshStandardMaterial({ color: 0x39342d, roughness: 0.98, metalness: 0.02, flatShading: true, side: THREE.DoubleSide });
  const wornMat = new THREE.MeshStandardMaterial({ color: 0x75624a, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x282722, roughness: 0.98, metalness: 0.02, flatShading: true });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xb9b4aa, roughness: 0.42, metalness: 0.78, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x242322, roughness: 0.88, metalness: 0.14, flatShading: true });

  if (rig.cape) (rig.cape.material as THREE.MeshStandardMaterial).color.setHex(0x39342d);

  const coatFront = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.76, 0.09), coatMat);
  coatFront.position.set(0, 0.23, 0.155);
  coatFront.castShadow = true;
  rig.torso.add(coatFront);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.15, 0.22), wornMat);
  collar.position.set(0, 0.59, 0.04);
  collar.rotation.x = -0.14;
  collar.castShadow = true;
  rig.torso.add(collar);

  const tailShape = new THREE.Shape();
  tailShape.moveTo(-0.18, 0.1);
  tailShape.lineTo(0.18, 0.1);
  tailShape.lineTo(0.17, -0.45);
  tailShape.lineTo(0.04, -0.36);
  tailShape.lineTo(-0.08, -0.51);
  tailShape.lineTo(-0.18, -0.42);
  tailShape.closePath();
  const coatTailGeo = new THREE.ShapeGeometry(tailShape);
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(coatTailGeo, coatMat);
    tail.position.set(side * 0.2, -0.07, -0.12);
    tail.rotation.y = side * -0.12;
    tail.castShadow = true;
    rig.hips.add(tail);
  }
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.025), wornMat);
  patch.position.set(-0.27, 0.27, 0.205);
  patch.rotation.z = -0.28;
  rig.torso.add(patch);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.36, 0.055, 10), hatMat);
  brim.position.y = 0.315;
  brim.castShadow = true;
  rig.head.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.25, 8), hatMat);
  crown.position.y = 0.45;
  crown.castShadow = true;
  rig.head.add(crown);
  const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.203, 0.203, 0.045, 8), wornMat);
  hatBand.position.y = 0.43;
  rig.head.add(hatBand);

  const backBlade = new THREE.Group();
  backBlade.name = "kinter-back-blade";
  backBlade.position.set(-0.12, 0.16, -0.3);
  backBlade.rotation.z = 0.48;
  const scabbard = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.16, 0.085), darkMat);
  scabbard.position.y = 0.23;
  scabbard.castShadow = true;
  backBlade.add(scabbard);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.92, 0.025), bladeMat);
  blade.position.set(0, 0.38, 0.053);
  blade.castShadow = true;
  backBlade.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.055, 0.11), wornMat);
  guard.position.set(0, -0.22, 0);
  backBlade.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.36, 6), wornMat);
  grip.position.set(0, -0.42, 0);
  backBlade.add(grip);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.075, 0.045), wornMat);
  strap.position.set(0, 0.09, -0.035);
  strap.rotation.z = -0.62;
  backBlade.add(strap);
  rig.torso.add(backBlade);
  return { backBlade };
}

// ---------------------------------------------------------------------------
// Story dialogue shown through the engine's existing dialogue reader so both a
// human (F / click) and the benchmark (interact) can advance it.
// ---------------------------------------------------------------------------
export const PROLOGUE_DIALOGUE: Record<string, { speaker: string; speakers?: string[]; lines: string[] }> = {
  lyekai: {
    speaker: "LYEKAI",
    speakers: ["LYEKAI", "KINTER", "LYEKAI"],
    lines: [
      "Who are you, and why are you here?",
      "My name is Kinter, from Elderville. The Elders sent me to find life beyond Gretriyon. I think I just found it.",
      "Come with us.",
    ],
  },
  kinterMeeting: {
    speaker: "KING ALDRICH",
    speakers: ["KING ALDRICH", "KINTER", "KING ALDRICH", "KINTER", "KING ALDRICH", "KINTER", "KING ALDRICH", "KINTER", "KING ALDRICH", "KINTER", "KING ALDRICH", "KINTER", "KING ALDRICH"],
    lines: [
      "You're a fighter, aren't you?",
      "Yes.",
      "You're from Gretriyon, right?",
      "H-how did you know?",
      "The lifesuit. People in Uoka, we have something similar — we call them Life Armor. It is bulkier, with layered pressure plates and external air lines. From a distance, a wearer can look like a machine.",
      "Us Kings have heard legends about Gretriyon. There was a time where the whole world was one — but wars tore it apart, and the survivors built Life Armor so people could keep breathing in the dead regions.",
      "If you knew Gretriyon existed, why didn't you ever send anyone across the border?",
      "Because we cannot. Our Life Armor keeps us alive, but it is heavy. Slow. Out in the shifting ruins and ash storms of the Ashveil, my knights sink like stones.",
      "Worse still, our armor is failing. Deep in the waste, a warlord named Malenkar is siphoning the energy from the Raeku — the elemental core that powers every suit in Uoka.",
      "Without it, this armor becomes an iron coffin. Malenkar took the Raeku to his citadel and scattered eight Shards of its stabilizing lattice among his guardians. The light behind my throne is the Royal Relay, linked to the stolen core.",
      "And you think I can make it through the Ashveil because my suit is lighter.",
      "You survived the dark forest and the violet falls. If you venture into the Ashveil and reclaim the Shards of Light, you can attune them to your gear. The Royal Relay will carry their power to my armor, wherever you travel, and help us break Malenkar's hold on the Raeku. Do that, and I will give you everything you need to find your way home.",
      "Lyekai, return his blade. Before I stake my kingdom on a stranger, I will see how he fights.",
    ],
  },
};

// ---------------------------------------------------------------------------
// Procedural set piece. Built from the same primitives as the rest of the game
// — no new assets, no new dependencies.
// ---------------------------------------------------------------------------

export interface Colliderish {
  x: number;
  z: number;
  r: number;
}

export interface PrologueHandles {
  root: THREE.Group;
  /** River + pool surfaces, animated by the engine. */
  waterMats: THREE.MeshStandardMaterial[];
  /** Waterfall sheet, animated by the engine. */
  waterfallMats: THREE.MeshBasicMaterial[];
  foam: THREE.Mesh;
}

function stripeTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const grd = ctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "rgba(235,244,255,0.95)");
  grd.addColorStop(0.5, "rgba(190,214,236,0.72)");
  grd.addColorStop(1, "rgba(150,180,210,0.28)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 256);
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#b8cfe6";
    ctx.fillRect((i * 53) % 64, 0, 2 + (i % 3), 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

export function buildPrologueSet(scene: THREE.Scene, colliders: Colliderish[]): PrologueHandles {
  const root = new THREE.Group();
  root.name = "prologue-set";
  scene.add(root);
  const rng = makeRng(0xa5f1);
  const waterMats: THREE.MeshStandardMaterial[] = [];
  const waterfallMats: THREE.MeshBasicMaterial[] = [];
  const P = PROLOGUE_POINTS;

  // Elderville's last night: an open-sided room keeps the camera clear while
  // showing the table, paired blades and note that anchor Kinter's promise.
  const home = new THREE.Group();
  home.position.set(P.home.x, terrainHeight(P.home.x, P.home.z), P.home.z);
  const timber = new THREE.MeshStandardMaterial({ color: 0x594431, roughness: 0.9 });
  const plaster = new THREE.MeshStandardMaterial({ color: 0x8a795f, roughness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc2c6c8, roughness: 0.35, metalness: 0.8 });
  const parchment = new THREE.MeshStandardMaterial({ color: 0xd8c99b, roughness: 1 });
  const homeBox = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    home.add(mesh);
    return mesh;
  };
  homeBox(8, 0.18, 7, timber, 0, 0.03, 0);
  homeBox(8, 4.2, 0.18, plaster, 0, 2.1, -3.4);
  homeBox(0.2, 4.2, 7, timber, -3.9, 2.1, 0);
  homeBox(0.2, 4.2, 7, timber, 3.9, 2.1, 0);
  homeBox(3.4, 0.16, 1.65, timber, 0, 1.05, -1.7);
  for (const x of [-1.35, 1.35]) for (const z of [-2.25, -1.15]) homeBox(0.16, 1, 0.16, timber, x, 0.5, z);
  for (const x of [-0.55, 0.55]) {
    homeBox(0.13, 0.06, 1.15, steel, x, 1.17, -1.78);
    homeBox(0.44, 0.07, 0.08, timber, x, 1.19, -1.17);
    homeBox(0.1, 0.07, 0.35, timber, x, 1.19, -0.98);
  }
  homeBox(0.58, 0.025, 0.42, parchment, 1.05, 1.16, -1.9);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffd891 }));
  lamp.position.set(-1.25, 1.35, -1.8);
  home.add(lamp);
  const warm = new THREE.PointLight(0xffbb67, 18, 18, 2);
  warm.position.copy(lamp.position);
  home.add(warm);
  root.add(home);

  const stone = new THREE.MeshStandardMaterial({ color: 0x777668, roughness: 1, flatShading: true });
  const violet = new THREE.MeshBasicMaterial({ color: 0xc49aff });
  const cairn = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48 - i * 0.1, 0), stone);
    rock.position.y = 0.25 + i * 0.34;
    cairn.add(rock);
  }
  cairn.position.set(P.borderCairn.x, terrainHeight(P.borderCairn.x, P.borderCairn.z), P.borderCairn.z);
  root.add(cairn);
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), timber);
  post.position.y = 1.1;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.38, 0.12), timber);
  board.position.y = 1.75;
  sign.add(post, board);
  sign.position.set(P.borderSign.x, terrainHeight(P.borderSign.x, P.borderSign.z), P.borderSign.z);
  root.add(sign);
  const feather = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 5), violet);
  feather.rotation.z = 0.65;
  feather.position.set(P.borderBird.x, terrainHeight(P.borderBird.x, P.borderBird.z) + 0.38, P.borderBird.z);
  root.add(feather);

  // ---------------------------------------------------------- dark forest ---
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x1b1512, roughness: 0.97, flatShading: true });
  const branchMat = new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 0.98, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.24, 1.05, 14, 6, 3);
  const branchGeo = new THREE.CylinderGeometry(0.08, 0.3, 5, 4);
  const canopyGeo = new THREE.ConeGeometry(4.5, 9.5, 6, 1);
  // Dark forest canopy — instanceColor alone wasn't darkening these enough
  // under the sun (they rendered pale lime); bake the darkness into the base.
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x272c1e, roughness: 1, metalness: 0, flatShading: true });
  const trunkCount = 150;
  const branchCount = 460;
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, trunkCount);
  const branches = new THREE.InstancedMesh(branchGeo, branchMat, branchCount);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, trunkCount);
  trunks.castShadow = branches.castShadow = canopies.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  let ti = 0;
  let bi = 0;
  let guard = 0;
  while (ti < trunkCount && guard++ < 8000) {
    // Dense band hugging the path so the wood reads as closed and dark.
    const along = rng();
    const px = 169 + Math.sin(along * 7) * 3 + (rng() - 0.5) * 34;
    const pz = 260 - along * 52 + (rng() - 0.5) * 22;
    const arrivalLane = pz > 212 && Math.abs(px - 168) < 11.5;
    const tumbleLane = pz > 199 && pz <= 216 && px > 158 && px < 176;
    if (arrivalLane || tumbleLane) continue; // keep both authored paths collision-free
    const y = terrainHeight(px, pz);
    const sc = 0.58 + rng() * 0.78;
    v.set(px, y + 6.5 * sc, pz);
    e.set((rng() - 0.5) * 0.22, rng() * 6.28, (rng() - 0.5) * 0.22);
    q.setFromEuler(e);
    s.set(sc, sc * (0.85 + rng() * 0.5), sc);
    m.compose(v, q, s);
    const treeIndex = ti++;
    trunks.setMatrixAt(treeIndex, m);
    colliders.push({ x: px, z: pz, r: 1.05 * sc });
    const nearTrail = (Math.abs(px - 168) < 16 && pz > 212) || (pz > 199 && pz <= 216 && px > 150 && px < 184);
    {
      const canopyScale = Math.min(sc, 1.35);
      // Sit the canopy on the trunk top (y + ~13.4·sc) instead of a flat 19 —
      // the old floor left canopies floating in open air.
      const canopyBase = 13.4 * sc;
      const canopyY = pz > 212
        ? Math.max(y + canopyBase, terrainHeight(168, pz) + 18.5)
        : y + canopyBase;
      v.set(px, canopyY, pz);
      e.set((rng() - 0.5) * 0.12, rng() * 6.28, (rng() - 0.5) * 0.12);
      q.setFromEuler(e);
      s.set(canopyScale, canopyScale, canopyScale);
      m.compose(v, q, s);
    }
    canopies.setMatrixAt(treeIndex, m);
    if (!nearTrail) {
      const nb = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < nb && bi < branchCount; k++) {
        const ba = rng() * Math.PI * 2;
        v.set(px + Math.cos(ba) * 1.4 * sc, y + (7 + rng() * 4) * sc, pz + Math.sin(ba) * 1.4 * sc);
        e.set(Math.sin(ba), ba, -Math.cos(ba));
        q.setFromEuler(e);
        s.set(sc, sc * (0.7 + rng() * 0.6), sc);
        m.compose(v, q, s);
        branches.setMatrixAt(bi++, m);
      }
    }
  }
  const placedTrees = ti;
  for (let i = placedTrees; i < trunkCount; i++) { m.makeScale(0, 0, 0); canopies.setMatrixAt(i, m); }
  for (; ti < trunkCount; ti++) { m.makeScale(0, 0, 0); trunks.setMatrixAt(ti, m); }
  for (; bi < branchCount; bi++) { m.makeScale(0, 0, 0); branches.setMatrixAt(bi, m); }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;
  root.add(trunks, branches, canopies);

  // ------------------------------------------------------------ rock ledge --
  // The terrain itself bluffs off here: the path drops 3.66 -> 1.65 -> -0.17
  // over z 214 -> 208 -> 203, then falls to the pool at -4.03. We dress that
  // bluff with flanking boulders and a backing rock face — never a slab that
  // encloses the authored path, the fall or the water.
  const poolY = terrainHeight(P.pool.x, P.pool.z);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3b3730, roughness: 0.95, metalness: 0.04, flatShading: true });
  // Backing slab for the falls — kept below the lip so it reads as cliff face,
  // never as a wall jutting out of the slope.
  const faceH = 4.6;
  const faceRock = new THREE.Mesh(new THREE.BoxGeometry(26, faceH, 1.6), rockMat);
  faceRock.position.set(P.riverEdge.x, -0.2 - faceH / 2 + 0.2, P.riverEdge.z + 1.15);
  faceRock.castShadow = faceRock.receiveShadow = true;
  root.add(faceRock);
  // The upstream lip is solid; the scripted fall passes over it, while a free
  // walk cannot step over the edge into the pool.
  for (let x = P.riverEdge.x - 10.5; x <= P.riverEdge.x + 10.5; x += 1.75) {
    colliders.push({ x, z: P.riverEdge.z - 1.7, r: 1.05 });
  }
  // flanking buttress rocks that frame the waterfall sheet
  for (const sx of [-1, 1]) {
    const butt = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), rockMat);
    butt.position.set(P.riverEdge.x + sx * 5.6, poolY + 2.1, P.riverEdge.z - 0.6);
    butt.rotation.set(0.6, sx * 1.2, 0.3);
    butt.castShadow = butt.receiveShadow = true;
    root.add(butt);
    colliders.push({ x: butt.position.x, z: butt.position.z, r: 2.1 });
  }
  // rough boulder clusters along the lip
  for (let i = 0; i < 22; i++) {
    const bx = P.riverEdge.x + (rng() - 0.5) * 22;
    const bz = P.riverEdge.z + 8 + (rng() - 0.5) * 6;
    // Keep the authored tumble lane open; the rest of the visible rocks are solid.
    if (bx > 158 && bx < 174 && bz > 201 && bz < 216) continue;
    const by = terrainHeight(bx, bz);
    const radius = 0.6 + rng() * 1.3;
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), rockMat);
    boulder.position.set(bx, by + 0.3, bz);
    boulder.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    boulder.castShadow = true;
    root.add(boulder);
    colliders.push({ x: bx, z: bz, r: radius * 0.92 });
  }

  // ---------------------------------------------------------------- water ---
  const riverMat = new THREE.MeshStandardMaterial({ color: 0x16303a, roughness: 0.1, metalness: 0.45, transparent: true, opacity: 0.9 });
  waterMats.push(riverMat);
  // A chute ribbon hugging the bluff — sampled per-vertex so it always sits
  // exactly on the descending terrain (a flat plane floated over the trail).
  const riverSegs = 22, riverHalf = 5.0, rz0 = 201.9, rz1 = 215.8;
  const rPos = new Float32Array((riverSegs + 1) * 2 * 3);
  const rIdx: number[] = [];
  for (let i = 0; i <= riverSegs; i++) {
    const z = rz0 + (i / riverSegs) * (rz1 - rz0);
    for (let k = 0; k < 2; k++) {
      const sx = P.riverEdge.x + (k === 0 ? -riverHalf : riverHalf);
      const o = i * 6 + k * 3;
      rPos[o] = sx;
      rPos[o + 1] = terrainHeight(sx, z) + 0.07;
      rPos[o + 2] = z;
    }
  }
  for (let i = 0; i < riverSegs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    rIdx.push(a, c, b, b, c, d);
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute("position", new THREE.BufferAttribute(rPos, 3));
  riverGeo.setIndex(rIdx);
  riverGeo.computeVertexNormals();
  const river = new THREE.Mesh(riverGeo, riverMat);
  river.receiveShadow = true;
  root.add(river);

  const poolMat = new THREE.MeshStandardMaterial({ color: 0x122730, roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.92 });
  waterMats.push(poolMat);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(9.5, 36), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(P.pool.x, poolY + 0.05, P.pool.z);
  pool.receiveShadow = true;
  root.add(pool);

  // ------------------------------------------------------------- waterfall --
  const stripe = stripeTexture();
  const fallMat = new THREE.MeshBasicMaterial({
    map: stripe,
    color: 0xdfeeff,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  waterfallMats.push(fallMat);
  const fallH = Math.max(4, 0.1 - poolY + 0.3);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(8, fallH), fallMat);
  fall.position.set(P.riverEdge.x, 0.1 - fallH / 2, P.riverEdge.z - 0.75);
  root.add(fall);

  const foam = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 26),
    new THREE.MeshBasicMaterial({ color: 0xeaf4ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(P.riverEdge.x, poolY + 0.12, P.pool.z + 2.6);
  root.add(foam);

  // --------------------------------------------------------------- shore ----
  const sandMat = new THREE.MeshStandardMaterial({ color: 0x4a463c, roughness: 0.98, metalness: 0.02 });
  const shore = new THREE.Mesh(new THREE.CircleGeometry(13, 28), sandMat);
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(P.shore.x, terrainHeight(P.shore.x, P.shore.z) + 0.06, P.shore.z);
  shore.receiveShadow = true;
  root.add(shore);

  // unfamiliar lights and architecture across the water
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const lx = 132 + (i % 3) * 9 + (rng() - 0.5) * 3;
    const lz = 176 - Math.floor(i / 3) * 10;
    const ly = terrainHeight(lx, lz) + 3 + (i % 2) * 2;
    const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), lampMat);
    lamp.position.set(lx, ly, lz);
    root.add(lamp);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6.2, 5), barkMat);
    post.position.set(lx, ly - 3.1, lz); // always rooted — the old 4.6 length floated the odd-i lamps
    root.add(post);
    colliders.push({ x: lx, z: lz, r: 0.38 });
  }
  // no bare bulb — the lamps across the water carry Uoka's warmth by themselves

  // Uoka's outer ward: a compact industrial silhouette beyond the surf.
  // Warm windows and heat-loop stacks make it feel inhabited and distinct.
  const cityStone = new THREE.MeshStandardMaterial({ color: 0x252a2d, roughness: 0.9, metalness: 0.12, flatShading: true });
  const cityTrim = new THREE.MeshStandardMaterial({ color: 0x414449, roughness: 0.7, metalness: 0.58, flatShading: true });
  const warmWindow = new THREE.MeshBasicMaterial({ color: 0xffb65f, transparent: true, opacity: 0.92 });
  const buildings = [
    { x: 126, z: 153, w: 8, h: 15, d: 10 },
    { x: 137, z: 159, w: 10, h: 22, d: 12 },
    { x: 148, z: 151, w: 8, h: 13, d: 9 },
    { x: 157, z: 161, w: 11, h: 19, d: 10 },
    { x: 116, z: 162, w: 10, h: 11, d: 8 },
  ];
  for (const b of buildings) {
    const base = terrainHeight(b.x, b.z);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), cityStone);
    tower.position.set(b.x, base + b.h / 2, b.z);
    tower.castShadow = tower.receiveShadow = true;
    root.add(tower);
    colliders.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) * 0.58 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.65, b.d + 0.6), cityTrim);
    roof.position.set(b.x, base + b.h + 0.33, b.z);
    roof.castShadow = true;
    root.add(roof);
    const floors = Math.max(2, Math.floor(b.h / 4));
    for (let floor = 1; floor < floors; floor++) {
      for (const side of [-1, 1]) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.08), warmWindow);
        window.position.set(b.x + side * b.w * 0.23, base + floor * 4, b.z + b.d / 2 + 0.055);
        root.add(window);
      }
    }
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 2.6, 6), cityTrim);
    stack.position.set(b.x + b.w * 0.27, base + b.h + 1.6, b.z - b.d * 0.22);
    root.add(stack);
  }
  const outerWall = new THREE.Mesh(new THREE.BoxGeometry(48, 4.5, 1.4), cityTrim);
  outerWall.position.set(137, terrainHeight(137, 169) + 2.25, 169);
  outerWall.castShadow = outerWall.receiveShadow = true;
  root.add(outerWall);
  for (let x = 113; x <= 161; x += 1.8) colliders.push({ x, z: 169, r: 1.0 });

  // The drawbridge + moat water are permanent parts of the keep (built by
  // the world itself); the prologue no longer owns them.

  return { root, waterMats, waterfallMats, foam };
}
