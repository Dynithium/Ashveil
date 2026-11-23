import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { World } from "./world";
import { WORLD, groundAt, insideKeep, terrainHeight } from "./terrain";
import { NPC, Player, WEAPON_CONFIG, RELIC_IDS, isRelic, selectGrappleAnchor, type Actor, type GameCtx, type PlayerInput, type ProjectileOpts } from "./actors";
import { SETTLEMENTS } from "./settlements";
import { VILLAGE_NPCS, VILLAGE_NPC_BY_ID, RELICS, GRAPPLE_PICKUP } from "./npcData";
import { QUESTS, QUEST_BY_ID, COLLECTIBLE_SPOTS, REACH_RADIUS, type QuestDef } from "./quests";
import { REGIONAL_CULLS, cullKillCounts } from "./regionalEncounters";
import { REGIONAL_STORIES } from "./regionalStories";
import { EPILOGUE_STEPS, EPILOGUE_CLOSING, epilogueDialogue, type EpilogueStep } from "./epilogue";
import { drainFilter, filterStage, hazardAt, type FilterStage, type SafePoint } from "./filterHazards";
import { buildGuardianRig, type GuardianId } from "./guardianRigs";
import { lineBlockedByCircles } from "./guardianAttacks";
import { assignRelicSlot, restoreRelicSlots, type RelicSlots } from "./relicLoadout";
import { SHRINE_BY_ID, shrineBlessingText, type ShrineKind } from "./shrines";
import { JOURNAL_ENTRIES, type JournalEntry, type JournalTrigger } from "./journal";
import { AmbientEmbers, Particles, Shockwaves, SwordTrail } from "./vfx";
import { audio } from "./audio";
import { buildRig, poseRig, type Rig } from "./rig";
import {
  PROLOGUE_BEATS,
  PROLOGUE_DIALOGUE,
  PROLOGUE_MIN_SECONDS,
  PROLOGUE_PATH,
  PROLOGUE_POINTS,
  PROLOGUE_TOTAL_SECONDS,
  advancePrologueFade,
  buildPrologueSet,
  dressKinter,
  type Colliderish,
  type PrologueBeat,
  type PrologueCam,
  type PrologueHandles,
} from "./kinterOpening";

// ---------------------------------------------------------------------------
// The whole build strips QA hooks — and the god-mode mercy key
// ---------------------------------------------------------------------------
const DEV_BUILD = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

// ---------------------------------------------------------------------------
// Quest script
// ---------------------------------------------------------------------------
const DIALOGUE: Record<string, string[]> = {
  // -------- After the prologue — the King's briefing --------
  intro: [
    "You survived the journey, Kinter of Elderville. Few could have. Listen well.",
    "Deep in the Ashveil, a warlord named MALENKAR is siphoning the RAEKU — the elemental core that powers every suit in Uoka.",
    "Without it, this armor becomes an iron coffin. Our defenses fail one by one. The storms close in.",
    "Malenkar took the Raeku to his citadel and scattered eight Shards from its stabilizing lattice among his guardians.",
    "Attune the Shards to your gear. Their power can reach my armor through the Royal Relay behind my throne, wherever your road takes you.",
    "Do that — and I will give you everything you need to find your way home.",
    "But before I stake my kingdom on a stranger, show me how they fight in Gretriyon. Draw your Second Blade. My guards will not interfere.",
  ],
  trialComplete: [
    "Fast. Relentless. Lyekai was right not to cut you down on the shore.",
    "The light in your blade answered the Royal Relay. Our machines remember something our kingdoms forgot.",
    "Take this resonator and Grapple-Line. The eight guardians can be faced in any order — or you may march straight to Malenkar's citadel.",
    "Either way, Uoka's fate is in your hands. Bring our people a morning worth seeing.",
  ],
  blades: [
    "The HALL OF BLADES is up the western stair — two effigies still stand.",
    "Strike with LEFT CLICK — three blows chain together. Hold E for a heavy blow that breaks a guard.",
    "You may carry three arms — press 1 for the Greatsword, 2 for Twin Blades, 3 for the Halberd. Each fights in its own tongue.",
  ],
  arcane: [
    "Good. Your weapons are ready. Now take the eastern stair to the third floor — the TERRACE OF TRIALS.",
    "The warded effigy is insulated against steel. Press Q to fire the Sundered Bolt from your lifesuit's capacitor.",
  ],

  // -------- The overworld briefing — the Gauntlet opens --------
  south: [
    "The road south leads through the gate and down the ash fields to Malenkar's citadel.",
    "Lyekai will give you his resonator from the armory. It will pull toward the Shards. Follow it — or march straight on his gate, if you are foolish enough.",
    "Either way, Uoka's fate is in your hands now. Do not linger in the ash.",
  ],

  // -------- Mid-gauntlet status chatter --------
  huntChoir: [
    "The resonator sings for the nearest Shard. Follow its light.",
    "Eight guardians hold them. Eight Shards to mend my armor and your blade.",
    "The waste respects boldness. It respects preparation rather more.",
    "The throne behind me gutters like a dying candle. Bring it back to its glory.",
  ],
  oneChoirLeft: [
    "The Royal Relay flickers behind my throne. The Raeku itself remains in Malenkar's citadel.",
    "Every Shard you attune makes me... stronger. That is the only mercy this world affords.",
    "One more. One more and the fire remembers what a king is.",
  ],
  finalWar: [
    "Eight fires burn behind me now. No guardian remains between you and the Citadel.",
    "The scouts are ready. The convoys are moving. For the first time in years, Uoka is preparing for a morning instead of an ending.",
    "Go when you are ready, Kinter. I will meet you at Malenkar's gate — not as a dying king, but as Uoka's sword.",
  ],
  // -------- Aldrich arc — the King warms, by two Shards at a time --------
  // Second Shard — he asks about Gretriyon's streets and sunlight.
  aldrichMilestone2: [
    "Two more of the eight. Sit — the hall has heard enough marching for one day.",
    "They tell stories in these halls about your homeland — green forests, quiet power, a people who never needed an iron shell.",
    "...Tell me something true about Gretriyon. About the streets. About the sunlight there.",
    "Sunlight is just light there. It doesn't have to fight through ash to reach you.",
    "Hm. Then the legends aren't all flattery. I had begun to think the old world was a fable men told to keep warm.",
    "Go back out there. Both of us still have work.",
  ],
  // Fourth Shard — he admits the war was mythologized.
  aldrichMilestone4: [
    "Four. Half the lattice, outsider. Sit.",
    "My ancestors taught that the earth tore itself in two for our sins. The old kings sang it. The throne repeated it. The whole court breathed it.",
    "The keepers' tablets say otherwise. Gretriyon and Uoka were one land once — one people. One heart beneath the world.",
    "I have repeated the version most convenient to the throne. I have not asked the tablets if they forgive me for it.",
    "The Shards argue otherwise. Every one you carry home whispers that the old world was whole.",
    "Whole things can still be broken on purpose.",
    "And rebuilt?",
    "...That part belongs to whoever survives this.",
    "Then survive. There is a kingdom counting both of us.",
  ],
  // Sixth Shard — he asks about the boy at home.
  aldrichMilestone6: [
    "Six now. The Relay sings almost every hour. The court pretends not to notice.",
    "...Can I ask you something? Not as your king. Only because I want the answer.",
    "Is there someone waiting for you? A family? A son?",
    "...How did you know?",
    "A king remembers what he asks another man to lose.",
    "I noticed the blade before you drew it. twin to the one resting in your son's hands, I'd wager.",
    "The elders sent me to find life beyond the border. They expected me to die on the way.",
    "Then let it be for something. Come back with what remains of the eight, and together we will finish this.",
    "...He's waiting. I intend to see him.",
    "Then see him. After.",
  ],
  // Eighth Shard — the capital shines again.
  aldrichMilestone8: [
    "The Relay... look behind me. Listen.",
    "Eight seals, outsider. The old halo. It has not burned like this since before the split.",
    "We have not seen the capital shine this way in my lifetime.",
    "I can stand. I can march. I can lift this blade without screaming into my visor.",
    "When Malenkar sees the dark over that citadel, he will expect a dying king come to kneel. Let him see the light instead.",
    "Then let's give him both.",
  ],
  oren: [
    "You felt it too, didn't you? That pull beyond the walls. That is the Raeku, bleeding back into the world.",
    "Take the map. Eight guardians, eight shards — the Rusted Colossus walks the Iron Dunes; the Hollow Captain storms the Sunken Bastion; the Ash-Stalker hunts the Cinderwood; the Prism Warden haunts the Glass Crags.",
    "The Molten Leviathan coils in the Slag Marshes. The Gale Sentinel circles the Whispering Spire. The Iron Forgemaster tends the Forgotten Foundry — and the Pale Herald seals the Ashen Cathedral's doors.",
    "The resonator tugs toward the nearest Shard. Follow it, and don't stop until you hear it sing.",
    "If you mean to march on Malenkar with empty hands — well. I won't stop you. You'll simply have a long walk home.",
  ],
  torin: [
    "Steel doesn't lie to you, friend. Suits do. Armor bandages do. Always check your rivet work before you trust a weld.",
    "So you're the Gretriyon blade the king keeps eyeing. Don't let that hat fool you — he's measuring you for a war he doesn't know he's already lost.",
    "First upgrade's on the nearest forge — Rusthollow or Anvil-Deep will take your coin. I don't do favors twice. Well — almost never.",
  ],
  torinBought: [
    "Here — 300 runes, first rivet's free. Not kindness; just arithmetic. A walking spark draws every ash-beast in the waste.",
    "Spend it on a blade first. You'll need the edge before you need the padding.",
    "Now move along. I've a suit carcass to strip before the next caravan.",
  ],
  pip: [
    "You're the Gretriyon blade! Pip — lookout, scout, occasional thief of good boots.",
    "There's a watchtower in the dunes with a sightline most of the waste. Climb it and you'll see the citadel's black spire on the horizon.",
    "Here — hold this. A resonator. Lyekai's own. It hums toward the Shards of Light. Follow the pull and you'll find them.",
    "And hey — now your map knows where the guardians are. Don't tell the gatekeeper I gave it to you.",
  ],
  milo: [
    "Mind the vapours. Ash gets into the joints and seals the suit from the inside — that's what a filter-brewer is for.",
    "Take two canisters. Drink one when the seal light goes red. Don't drink both at once unless you fancy the coughing.",
    "Bring me bioluminescent spores from the mire and I'll stretch the filter's life. Keep the suit breathing longer.",
  ],
  miloBought: [
    "Two canisters, and don't say I never gave you anything for free.",
    "The grey ones mend. The violet ones make you faster than your own legs can manage — use them when the ash comes down.",
    "Breathe easy, outlander.",
  ],
  vesper: [
    "Vesper. I run the roads — my buggy has six wheels and more sense than most men I've hauled.",
    "Every guardian you put down is coin the road owes me. Bring me the tally and I'll pay fair.",
    "And if you're heading east, fill the tank. The dunes shift, and a stranded walker out there is a dead walker.",
  ],
  vesperPaid: [
    "There's your cut. Every one of them guardians is a little less road ahead of us.",
    "Buy something that keeps you breathing. That's the only currency that counts out here.",
    "Now get moving before the next storm moves in.",
  ],
  bram: [
    "Gatekeeper Bram — yes, THAT Bram. Served Lyekai fifteen years before my gauntlet gave out.",
    "The bounty board over the gate tracks every guardian felled in the waste. Bring me proof of the deed, and the crown pays.",
    "I've heard what the warlord's harvesting out in the deep Ashveil. If you mean to stop it, stop it before he finishes draining the keep's blood.",
  ],
  bramPaid: [
    "Ha! Another guardian carved down and dragged in on a rope. The board doesn't lie — good steel lives long in Uoka.",
    "There's your bounty. Spend it on steel or sake, your choice — but pay for the plate first.",
    "Aldrich won't say it, but this kingdom owes you its lungs. Keep swinging.",
  ],

  // -------- OPTIONAL — the Hollow Captain's taunt, if fought first --------
  captainTaunt: [
    "Another rat from Gretriyon. The Raeku-tithe feeds us all — why do you starve us?",
  ],

  // -------- Lyekai's relationship lines — trust earned beyond the walls ------
  lyekaiDuty: [
    "The gate holds, Ashbearer. Tell me what the road needs and I will see the guard provides it.",
    "A soldier watches the walls. A friend watches the road until you come back through them.",
  ],
  lyekaiRelations3: [
    "Three Shards. I have watched the gate lamps take their color back one by one.",
    "You have reached people my guard could not. I called you a prisoner when you arrived. I was wrong.",
    "My place is still these walls. But when you pass through them, know someone here is watching for your return.",
  ],
  lyekaiRelations6: [
    "Six. The scouts are packing again. They argue over who marches beside you.",
    "Gretriyon is a long road from here. I will not pretend I know what waiting for you costs.",
    "When the Relay sings tonight, I will speak your name into it. Not as a prayer — as a promise that someone in Uoka expects you back.",
  ],

  // -------- The finale — Aldrich's last ride --------
  // (Delivered mid-fight against Malenkar, when Aldrich charges in.)
  aldrichDeath: [
    "MALENKAR! Your siphoning ends HERE!",
    "You cannot hold the world together with your two hands, old king. It will tear — and I will be holding the rope.",
    "Then let it tear — but know it tears with MY KINGDOM beneath it!",
    "...Filings. Kindling. You should have united them, Aldrich. You should have ruled.",
    "There is no heir. Without a king, the lords will fight over the Raeku.",
    "Guard Uoka... and the people who depend on it.",
    "You are now king.",
  ],

  // -------- The finale — Malenkar takes the storm into himself --------
  malenkharPhase2: [
    "AH... THERE it is. The humming heart of the world — right where I always knew it would hide.",
    "Every knight you send me, every Shard you pluck from my hoard... it all leads MY HANDS to that box.",
    "If it will not kneel, Aldrich — then it will answer to me.",
  ],

  // -------- After the final boss — two endings, written by eight names --------
  // Path B — the Radiance of Uoka (all eight Shards gathered).
  epilogueRadiante: [
    "Malenkar is ash. The Raeku sings clean and bright through the keep's bones — bright as a young star.",
    "Aldrich lies beneath the broken pillars, his armor spent. Uoka mourns its king with one hand and builds its future with the other.",
    "Kinter kneels in the ruined citadel, the iron-and-gold circlet heavy in his hands, and does not yet understand why the crown fits.",
    "The lords may fight over the Raeku, and Malenkar's followers still seek Gretriyon. Kinter stays to protect both kingdoms while Uoka rebuilds.",
    "He holds the Second Blade. The First still rests with his son. Perhaps it always will.",
    "So Kinter of Elderville stays. To protect his son, he must rule a foreign land.",
    "Kinter tries to send word through trusted intermediaries, but his messages never reach Minslaire. Ten years later, his son takes the First Blade into the forest.",
    "Across the kingdom, the Royal Relay carries the light of all eight Shards. A father holds the promise he still hopes to keep.",
  ],
  // Path A — the Hollow Charge (Malenkar felled with empty hands).
  epilogueHollow: [
    "Malenkar is ash. The Raeku gutters and catches, gutters and catches — wounded, starving, but alive.",
    "Aldrich is dead in a pillar's shadow. He burned bright for one single glorious moment, and it was never going to be enough — not without the Shards.",
    "Kinter stands in the ruined citadel, a crown in his hands he never asked for and cannot put down.",
    "The lords may fight over the Raeku, and Malenkar's followers still seek Gretriyon. Kinter stays to protect both kingdoms while Uoka rebuilds.",
    "He holds the Second Blade. The First still rests with his son. Perhaps it always will.",
    "So Kinter of Elderville stays. To protect his son, he must rule a foreign land.",
    "Kinter tries to send word through trusted intermediaries, but his messages never reach Minslaire. Ten years later, his son takes the First Blade into the forest.",
    "And every sunrise after, Kinter watches the horizon for a signal from a forest he will never walk again.",
  ],
  epilogueClosing: EPILOGUE_CLOSING,
  epilogue: [
    "Malenkar is ash. The Raeku sings clean and bright through the keep's bones — for now.",
    "Aldrich rests in the vault he could never leave. Uoka mourns its king with one hand, and builds its future with the other.",
    "Kinter stands in the ruined citadel, a crown in his hands that he never asked for.",
    "So Kinter of Elderville stays. To protect his son, he must rule a foreign land.",
  ],
  done: [
    "The Ashveil is quiet. The king watches the horizon. He is waiting for a signal he cannot answer.",
  ],
};

// 10 stages — prologue, the King's Trial, the shard gauntlet, the finale, epilogue.
const OBJECTIVES = [
  "Speak with King Aldrich in the throne hall",                                    // 0
  "THE KING'S TRIAL — Hall of Blades: destroy 2 effigies",                         // 1
  "THE KING'S TRIAL — Terrace of Trials: charge the Sundered Bolt (Q)",            // 2
  "THE ASHVEIL GAUNTLET — Shards of Light: 0/8",                                   // 3 (dynamic)
  "THE ASHVEIL GAUNTLET — Shards of Light",                                        // 4 (dynamic)
  "THE ASHVEIL GAUNTLET — Shards of Light",                                        // 5 (dynamic)
  "THE ASHVEIL GAUNTLET — Shards of Light",                                        // 6 (dynamic)
  "THE ASHVEIL GAUNTLET — Shards of Light",                                        // 7 (dynamic)
  "THE ASHVEIL GAUNTLET — Shards of Light",                                        // 8 (dynamic)
  "THE LAST CROWN — Uoka begins to rebuild",                                      // 9
];

/** Contextual coaching shown under the objective. */
const HINTS = [
  "Walk with W A S D · Press F to speak",
  "LEFT CLICK chains 3 slashes · E is a heavy blow · 1/2/3 swap weapons",
  "Q fires the Sundered Bolt · SPACE dodges · HOLD RIGHT CLICK to guard",
  "The resonator pulls toward the Shards · march on Malenkar or hunt the guardians · G grapple · C ash burst · 4/5 relic slots",
  "The resonator pulls toward the Shards · hunt them in any order",
  "Press M for the map · fast-travel between discovered Graces",
  "Press M to fast-travel · G grapple · C ash burst · 4/5 relic slots",
  "Press M to fast-travel · the world is yours",
  "Press M to fast-travel · the world is yours",
  "The Raeku is free. The kingdom's work continues.",
];

const LORE_STONES: { title: string; body: string[] }[] = [
  { title: "STONE OF THE FIRST SONG", body: [
    "\"Before the world had a shape, three voices sang it into form. They named themselves nothing, for there was nothing to name them against.\"",
    "\"We call them THE CHOIR now, because we need a name for what we broke.\"",
  ] },
  { title: "STONE OF THE SUNDERED TREE", body: [
    "\"The Choir grew tired of singing and set their fire in a tree, that it might warm the world without them. Then they slept.\"",
    "\"Humankind woke, warmed itself, and forgot who lit the hearth.\"",
  ] },
  { title: "STONE OF THE RAEKU THRONE", body: [
    "\"The Raeku is older than Uoka, older than Gretriyon. It was carved to hold a sun, not a kingdom.\"",
    "\"Every Life Armour on this continent breathes through it.\"",
    "\"Every suit. Every door. Every warm meal.\"",
  ] },
  { title: "STONE OF THE FIRST KNIGHT", body: [
    "\"Malenkar was not born in Uoka. He came out of the ash like a storm comes out of the sea.\"",
    "\"Some say the king made him. Some say the Raeku called him. The archive insists he volunteered.\"",
    "\"None of them agree on where the armor ends and the man begins.\"",
  ] },
  { title: "STONE OF THE SHARDS", body: [
    "\"Malenkar took the Raeku and scattered its eight lattice Shards among his guardians, so no one could restore the network unchallenged.\"",
    "\"Every Shard attuned through the Royal Relay strengthens the king, even when its bearer remains far from home.\"",
    "\"Ask him someday whether that is a blessing.\"",
  ] },
  { title: "STONE OF THE ASHEN CATHEDRAL", body: [
    "\"The cathedral was a mint once — a place where the Choir's light was shaped into coins and fed to the starving world.\"",
    "\"Now the furnace stands cold, and the Pale Herald waits for someone to open the door.\"",
    "\"None who do have returned.\"",
  ] },
  { title: "STONE OF THE IRON DUNES", body: [
    "\"The dunes breathe. At dusk the sand exhales rust, and the tanks turn in their sleep — great hulls of a dead world, grinding against their own keels.\"",
    "\"The Colossus does not hate us. It simply cannot stop.\"",
  ] },
  { title: "STONE OF THE LAST KING", body: [
    "\"They say Aldrich was crowned in flame and swore to keep it. They say the coal held him. They say he swallowed it whole.\"",
    "\"They are wrong about one thing.\"",
    "\"He chose to.\"",
  ] },
];

export interface DialogueState {
  speaker: string;
  speakers?: string[];
  lines: string[];
  idx: number;
}

/**
 * Everything the opening-sequence overlay needs to render itself. Produced by
 * the engine and shipped inside HudState + the agent snapshot so both a human
 * and the benchmark AI can read the current prologue beat and objective.
 */
export interface PrologueHud {
  active: boolean;
  complete: boolean;
  beatId: string;
  title: string;
  area: string;
  objective: string;
  hint: string;
  subtitle: { speaker: string; text: string } | null;
  prompt: string | null;
  /** 0..1 across the whole sequence. */
  progress: number;
  /** 0..1 within the current beat. */
  beatProgress: number;
  elapsed: number;
  minSeconds: number;
  /** 0..1 black overlay (waking up / falling / cuts). */
  fade: number;
  /** Live story dialogue, when a scene conversation owns the screen. */
  dialogue: DialogueState | null;
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
  /** Shards of Light carried (0..8). HUD shows these as glowing sigils. */
  shards: number;
  /** Guardians whose Shards Kinter now bears. */
  powers: string[];
  /** Rolling frame-time stats (µs avoided — these are ms). Null until enough frames exist. */
  perf: { avg: number; p95: number; worst: number } | null;
  /** Active side quests — shown as tracker lines in the HUD. */
  quests: { id: string; name: string; hint: string; progress: string }[];
  journalOpen: boolean;
  /** Full questbook for the journal overlay. Only populated while it's open. */
  allQuests: { id: string; name: string; hint: string; giver: string; state: "active" | "done" | "available"; progress: string }[];
  /** IDs of journal entries Kinter has written so far. */
  journalUnlocked: string[];
  target: { name: string; hp: number; maxHp: number } | null;
  boss: { name: string; hp: number; maxHp: number; phase: number; warning: { label: string; remaining: number; duration: number } | null } | null;
  prompt: string | null;
  lockOn: { x: number; y: number } | null;
  enemiesLeft: number;
  fps: number;
  bloodstain: number;
  banner: { title: string; sub?: string; id: number } | null;
  dead: boolean;
  victory: boolean;
  victoryShown: boolean;
  paused: boolean;
  started: boolean;
  area: string;
  popups: Popup[];
  objective: string;
  hint: string;
  marker: { x: number; y: number; dist: number } | null;
  dialogue: DialogueState | null;
  upgrades: { blade: number; vigor: number; arcane: number };
  weapon: string;
  relicLoadout: { owned: string[]; slots: RelicSlots };
  relicHeat: number;
  overheating: boolean;
  overdrive: number;
  overdriveCooldown: number;
  ashBursts: number;
  maxAshBursts: number;
  filter: { condition: number; stage: FilterStage; hazard: string | null };
  grappleKnown: boolean;
  grappleTarget: string | null;
  blessing: boolean;
  mapOpen: boolean;
  map: {
    player: { x: number; z: number; yaw: number };
    villages: { name: string; x: number; z: number; level: number; available: boolean; nextCost: number | null; standing: number; standingLabel: string; discounted: boolean }[];
    bosses: { name: string; x: number; z: number; main: boolean; dead: boolean }[];
    graces: { name: string; x: number; z: number; discovered: boolean; active: boolean; idx: number }[];
    questMarkers: { id: string; name: string; x: number; z: number }[];
    marker: { x: number; z: number } | null;
    /** Oren's Map of Eight — villages/guardians revealed after the Sootfall lesson. */
    beacon: boolean;
  };
  prologue: PrologueHud | null;
}

export type AshveilAgentAction =
  | { action: "move_to"; x: number; z: number; seconds?: number; sprint?: boolean }
  | { action: "attack" | "heavy" | "dodge" | "jump" | "grapple" | "overdrive" | "filter" | "cast" | "heal" | "interact" | "map" | "continue" | "wait"; seconds?: number }
  | { action: "guard"; seconds?: number }
  | { action: "lock_on"; target_index?: number }
  | { action: "weapon"; weapon: "greatsword" | "twinblades" | "halberd" }
  | { action: "relic"; slot: 0 | 1 }
  | { action: "fast_travel"; grace_index: number };

interface Village {
  id: string;
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
  pierce: boolean;
  pierceHit: Set<Actor>;
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
  // rolling frame-time window for the perf HUD (?perf=1)
  private perfRing: number[] = new Array(240).fill(0);
  private perfIdx = 0;
  private perfCount = 0;
  private fpsAcc = 0;
  private fpsCount = 0;
  private basePixelRatio = 1.5;
  private quality = 1;
  private qualityCooldown = 3;
  private lightPool: THREE.PointLight[] = [];
  private lightBusy: boolean[] = [];
  effigies: NPC[] = [];
  private effigyKills = { blade: 0, arcane: 0 };
  private trialActor: NPC | null = null;
  private trialPhase: "strikes" | "dodge" | "parry" | null = null;
  private trialHits = 0;
  private trialParryAttempts = 0;
  villages: Village[] = SETTLEMENTS.map((s) => ({
    id: s.id, name: s.name, x: s.x, z: s.z, type: s.upgrade, level: 0, costs: [...s.costs],
  }));
  upgrades = { blade: 0, vigor: 0, arcane: 0 };
  shardBosses: NPC[] = [];
  /** Shards of Light carried (0..8) — Malenkar's strength scales inversely. */
  shardsCollected = 0;
  /** One-shot: Aldrich's charge into the Malenkar fight. */
  private aldrichChargeInDone = false;
  private finaleGuards: { root: THREE.Object3D; collider: { x: number; z: number; r: number } }[] = [];
  private campaignCompleted = false;
  private postgame = false;
  private epiloguePhase: "pending" | "active" | "closing" | "complete" | null = null;
  private epilogueStage = 0;
  private epilogueCast: { root: THREE.Group; stage: number }[] = [];
  private streamAcc = 0;
  discoveredGraces = new Set<number>();
  activeGraceIdx = 0;
  mapOpen = false;
  loreRead = new Set<number>();
  // ------------------------------------------------------ the black citadel ---
  /** The three conduits feeding the warlord's ward. */
  private pylons: NPC[] = [];
  private pylonKills = 0;
  /** Conduits already broken when the vigil was sealed — spawnPylons breaks them in silence. */
  private journalUnlocked = new Set<string>();
  private aldrichMilestones = new Set<number>();
  private lyekaiRelationsSpoken = new Set<number>();
  private shrinesClaimed = new Set<string>();
  private pylonsBrokenFromLoad = 0;
  private mainPhase2Done = false;
  private preBossWeather: World["weather"] | null = null;
  private southBriefed = false;
  private captainTauntDone = false;
  private filterSafePoints: SafePoint[] = [];
  private filterHazard: string | null = null;
  private filterDamageTimer = 0;
  private filterSaveTimer = 0;
  /** How the finale was bought — "radiance" (eight shards) or "hollow" (empty hands). */
  private endingPath: "radiance" | "hollow" | null = null;
  /** Claimed mid-brawl — the equip waits for the next free breath. */
  private pendingRelicEquip: string | null = null;
  private relicSlots: RelicSlots = [null, null];
  /** One-time reward flags for every named soul in the 23 settlements. */
  private villageNpcClaimed = new Set<string>();
  /** The floating caches scattered across the Ashveil. */
  private relicPickups: { id: string; name: string; title: string; pos: THREE.Vector3; group: THREE.Group; taken: boolean }[] = [];
  private grapplePickup: { pos: THREE.Vector3; group: THREE.Group; taken: boolean } | null = null;
  // ----------------------------------------------------------------- quests ---
  private questsActive = new Set<string>();
  private questsDone = new Set<string>();
  private questKills: Record<string, number> = {};
  /** Token inventory for collect quests (tag → count taken). */
  private collects: Record<string, number> = {};
  private reachedSpots = new Set<string>();
  private collectibles: { id: number; tag: string; name: string; pos: THREE.Vector3; group: THREE.Group; taken: boolean }[] = [];
  private journalOpen = false;

  // ------------------------------------------------------------- the save ---
  static readonly SAVE_KEY = "ashveil-save-v1";

  // flow
  paused = false;
  started = false;
  running = true;
  dead = false;
  victory = false;
  victoryShown = false;
  private victoryDismissed = false;
  private victoryAt = -999;
  private respawnTimer = 0;
  private bossAwake = false;
  private bannerId = 0;
  private lastAlive = 0;
  private banner: { title: string; sub?: string; id: number } | null = null;
  private bannerT = 0;
  bloodstain: { pos: THREE.Vector3; runes: number; mesh: THREE.Mesh } | null = null;
  private prompt: string | null = null;

  // ------------------------------------------------------------ prologue ---
  // "The Long Fall" — Kinter's authored opening. The engine plays the script in
  // kinterOpening.ts: it walks Kinter, drives the establishing camera, exposes
  // one interaction prompt at a time, and gates the Aldrich meeting behind a hard
  // minimum runtime so the sequence is always at least ten authored minutes.
  private prologueStarted = false;
  private prologueActive = false;
  private prologueComplete = false;
  private prologueIdx = 0;
  private prologueBeatTime = 0;
  private prologueShotTime = 0;
  private prologueElapsed = 0;
  private prologueAwaitDone = new Set<string>();
  private prologueCueFired = new Set<string>();
  private prologueFade = 0;
  private prologueMeetingDone = false;
  private prologuePrompt: string | null = null;
  private prologueSubtitle: { speaker: string; text: string } | null = null;
  private prologueCueTimer = 0;
  private prologueCaptureTimer = 0;
  private prologueCaptureElapsed = 0;
  private prologueWalkIdx = 0;
  private prologueSet: PrologueHandles | null = null;
  private prologueCast: { lyekai: Rig; guards: Rig[] } | null = null;
  private prologueCastColliders: { rig: Rig; collider: Colliderish }[] = [];
  private kinterBackBlade: THREE.Group | null = null;
  private prologueDroppedBlade: THREE.Group | null = null;
  private prologueFallStartY = 0;
  private prologueCamYaw = 0;
  private prologueSavedWeather: "clear" | "ash" | "ember" = "clear";
  private prologueDayPhase = 0.5;
  private prologueTreeWasVisible = true;
  private prologueSkyWasVisible = true;
  private prologueSavedBackground: THREE.Scene["background"] = null;
  private prologueTerrainMaterial: THREE.MeshStandardMaterial | null = null;
  private prologueTerrainColor: THREE.Color | null = null;
  private prologuePointLights: { light: THREE.PointLight; intensity: number }[] = [];
  private prologueEmbersWereVisible = true;
  private prologueWorldPropsVisible = { ruins: true, flora: true, mist: true };
  private prologueParkedRuins: { collider: Colliderish; x: number; z: number }[] = [];
  private prologueCollidersStart = 0;

  // quest / king
  questStage = 0;
  dialogue: DialogueState | null = null;
  private dialogueKind: string = "intro";
  private king!: Rig;
  private kingPos = new THREE.Vector3();
  private kingYaw = Math.PI;
  private kingArmorTiers: { group: THREE.Group; minShards: number }[] = [];
  private kingRelayTrim: THREE.MeshStandardMaterial[] = [];
  /** The frontier cast — rig, position and identity for each named character. */
  private frontierNpcs = new Map<string, { rig: Rig; pos: THREE.Vector3; name: string; title: string; guard: boolean; yaw: number }>();
  /** Number of guardian bounties Bram has already paid out. */
  private bramPaid = 0;
  private torinPaid = false;
  /** Torin's quest promise: the next three forge upgrades are half price. */
  private torinDiscountsLeft = 0;
  private miloPaid = false;
  private vesperPaid = 0;
  /** Pip has taught Kinter to read the resonator — the guardians show on the map. */
  private shardBeaconKnown = false;
  private beacon!: THREE.Group;
  private beaconTarget = new THREE.Vector3();
  private beaconMats: THREE.MeshBasicMaterial[] = [];

  private keys: Record<string, boolean> = {};
  private mouse = { left: false, right: false };
  private agentControlActive = false;
  private agentThinking = false;
  private agentMove: { targetX: number; targetZ: number; sprint: boolean; remaining: number } | null = null;
  private agentGuardRemaining = 0;
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
    this.filterSafePoints = [
      { x: WORLD.castle.x, z: WORLD.castle.z, radius: 30 },
      ...this.villages.map((v) => ({ x: v.x, z: v.z, radius: 12 })),
      ...this.world.graceSites.map((site) => ({ x: site.pos.x, z: site.pos.z, radius: 8 })),
    ];
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
    this.kinterBackBlade = dressKinter(this.player.rig).backBlade;
    this.kinterBackBlade.visible = false;
    this.player.trail = new SwordTrail(24, 0xbfe4ff);
    scene.add(this.player.trail.mesh);
    scene.add(this.player.rig.root);
    // spawn just inside the keep's great doors, facing the throne
    this.player.pos.set(0, this.world.keep.base, 112.5);
    this.player.yaw = 0;

    this.initLightPool();
    this.buildKing();
    this.buildFrontierNpcs();
    this.buildVillageNpcs();
    this.buildRelicPickups();
    this.buildCollectibles();
    this.buildBeacon();
    this.spawnEnemies();
    this.spawnEffigies();
    this.syncWorldReactions();
    this.setupPost();
    this.bindEvents();

    this.camYaw = Math.PI;
    this.updateCamera(0, true);
    this.renderer.compile(scene, this.camera);
  }

  // ------------------------------------------------------------------ setup
  private setupPost() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.world.scene, this.camera));
    // bloom at half resolution — the glow is soft anyway; same look, half the fill
    this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(320, w >> 1), Math.max(180, h >> 1)), 0.55, 0.28, 0.55);
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

    // ---- the boss ----
    const b = new NPC("boss");
    b.pos.set(0, terrainHeight(0, -18), -18);
    b.yaw = 0;
    b.trail = new SwordTrail(28, 0xff8a2a);
    scene.add(b.trail.mesh);
    scene.add(b.rig.root);
    this.enemies.push(b);
    this.boss = b;

    // ------- The Shard Gauntlet — eight guardians hoard the Shards of Light -------
    // Eight shard-bosses, one per region of the Ashveil. Any order is legal;
    // Malenkar waits at the cathedral for whoever is foolish enough to rush him.
    const shardSpecs: { id: GuardianId; name: string; x: number; z: number; hp: number; trail: number; runes: number; speed: number; tint: number }[] = [
      { id: "colossus", name: "THE RUSTED COLOSSUS",  x: 170,  z: -215, hp: 4600, trail: 0xd8b25a, runes: 15000, speed: 4.2, tint: 0.08 },
      { id: "captain",  name: "THE HOLLOW CAPTAIN",    x: -185, z: 25,   hp: 3100, trail: 0x8a97a6, runes: 13000, speed: 5.2, tint: 0.55 },
      { id: "stalker",  name: "THE ASH-STALKER",       x: -265, z: 55,   hp: 3200, trail: 0xff7a22, runes: 13000, speed: 5.4, tint: 0.28 },
      { id: "warden",   name: "THE PRISM WARDEN",      x: -85,  z: -175, hp: 3800, trail: 0xb7e6ff, runes: 14000, speed: 4.8, tint: 0.58 },
      { id: "leviathan",name: "THE MOLTEN LEVIATHAN",  x: -120, z: -300, hp: 4600, trail: 0xff6a2a, runes: 15000, speed: 4.2, tint: 0.02 },
      { id: "sentinel", name: "THE GALE SENTINEL",     x: 190,  z: 115,  hp: 3600, trail: 0xc8f0ff, runes: 14000, speed: 5.2, tint: 0.52 },
      { id: "forgemaster", name: "THE IRON FORGEMASTER", x: 178, z: -70, hp: 4400, trail: 0xffb060, runes: 15000, speed: 4.6, tint: 0.12 },
      { id: "herald",   name: "THE PALE HERALD",       x: 0,    z: 48,   hp: 4800, trail: 0xd8d4e8, runes: 18000, speed: 4.6, tint: 0.7 },
    ];
    for (const spec of shardSpecs) {
      const r = new NPC("boss", buildGuardianRig(spec.id));
      r.bossRole = "shard";
      r.shardId = spec.id;
      r.name = spec.name;
      r.maxHp = r.hp = spec.hp;
      r.runeValue = spec.runes;
      r.effectsColor = spec.trail;
      r.radius = 2.3;
      r.centerY = 1.15;
      r.moveSpeed = spec.speed;
      r.attackRange = 7.6;
      // Several settlements stand near their region's lair. The guardian
      // should wake at the arena, not while someone is speaking to villagers.
      r.aggroRange = 20;
      r.maxPoise = 190;
      r.pos.set(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      r.yaw = Math.random() * Math.PI * 2;
      r.trail = new SwordTrail(24, spec.trail);
      scene.add(r.trail.mesh);
      scene.add(r.rig.root);
      // only the warlord gets a real light — the guardians wear emissive hides
      if (r.glowLight) {
        r.glowLight.parent?.remove(r.glowLight);
        r.glowLight = undefined;
      }
      this.enemies.push(r);
      this.shardBosses.push(r);
    }

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
  // ---------------------------------------------------------------
  // The frontier cast — Sootfall's crew and the Violet Pier's dockers.
  // Each is a living character with something real to give the player.
  // ---------------------------------------------------------------
  private buildFrontierNpcs() {
    const cast: {
      id: string; name: string; title: string; x: number; z: number;
      scale: number; bulk: number; armor: number; armorDark: number; cloth: number;
      accent: number; accentI: number; weapon: "none" | "greatsword" | "twinblades" | "halberd" | "swordshield";
      hunched?: boolean; tattered?: boolean; cape?: boolean; guard?: boolean;
    }[] = [
      { id: "lyekai", name: "LYEKAI", title: "commander of the keep", x: -4.6, z: 98.2, scale: 1.12, bulk: 1.34, armor: 0x4a4f58, armorDark: 0x1e2026, cloth: 0x2c3a52, accent: 0xffd27a, accentI: 2.0, weapon: "greatsword", cape: true, guard: true },
      { id: "oren", name: "OREN", title: "the cartographer", x: 40, z: 103, scale: 1.02, bulk: 1.28, armor: 0x3f3a33, armorDark: 0x201d18, cloth: 0x2e3b2a, accent: 0x6fe0c0, accentI: 1.4, weapon: "none", hunched: true, tattered: true },
      { id: "torin", name: "TORIN", title: "the scrap-smith", x: 28, z: 94, scale: 1.02, bulk: 1.22, armor: 0x53331e, armorDark: 0x241a12, cloth: 0x44281c, accent: 0xffb060, accentI: 1.8, weapon: "halberd", tattered: true },
      { id: "bram", name: "BRAM", title: "the gatekeeper", x: 34, z: 82, scale: 1.14, bulk: 1.42, armor: 0x4a4f58, armorDark: 0x1e2026, cloth: 0x31241c, accent: 0x9fb4c8, accentI: 1.5, weapon: "halberd", cape: true, guard: true },
      { id: "pip", name: "PIP", title: "the watchtower lookout", x: 46, z: 100, scale: 0.9, bulk: 0.92, armor: 0x4c5a3c, armorDark: 0x232a1c, cloth: 0x6a5a32, accent: 0xbfe4ff, accentI: 1.6, weapon: "twinblades" },
      { id: "milo", name: "MILO", title: "the filter-brewer", x: 24, z: 100, scale: 0.98, bulk: 1.1, armor: 0x3a4a58, armorDark: 0x1d242b, cloth: 0x2c4a3e, accent: 0x8fffc8, accentI: 1.5, weapon: "none" },
      { id: "vesper", name: "VESPER", title: "the caravan runner", x: 44, z: 92, scale: 1.0, bulk: 1.0, armor: 0x4a4030, armorDark: 0x241f18, cloth: 0x5a2f22, accent: 0xffb060, accentI: 1.4, weapon: "swordshield", cape: true },
    ];
    for (const c of cast) {
      const rig = buildRig({
        scale: c.scale, bulk: c.bulk,
        armor: c.armor, armorDark: c.armorDark, cloth: c.cloth,
        accent: c.accent, accentIntensity: c.accentI,
        weapon: c.weapon,
        hunched: c.hunched, tattered: c.tattered, cape: c.cape,
      });
      rig.root.traverse((o) => { o.castShadow = false; });
      const pos = new THREE.Vector3(c.x, terrainHeight(c.x, c.z), c.z);
      rig.root.position.copy(pos);
      rig.root.rotation.y = Math.PI * 0.8;
      this.world.scene.add(rig.root);
      this.world.colliders.push({ x: c.x, z: c.z, r: 0.9 });
      // named folk read by their accent glow — no bare bulbs in the waste
      this.frontierNpcs.set(c.id, { rig, pos, name: c.name, title: c.title, guard: !!c.guard, yaw: rig.root.rotation.y });
    }
  }

  // ---------------------------------------------------------------
  // The hundred named souls of the twenty-three settlements. Cheap rigs, no
  // lights, no shadow-casters — but they all have names, faces and opinions.
  // ---------------------------------------------------------------
  private buildVillageNpcs() {
    const settlementById = new Map(SETTLEMENTS.map((s) => [s.id, s]));
    // deterministic variety without burning the world RNG
    const hash = (s: string) => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0) / 4294967295;
    };
    const capeIds = new Set(["vane", "kell", "mercer", "draven", "thorne", "garret", "hollis", "brann", "pike", "aurelius", "cyrus"]);
    const palettes: [number, number, number][] = [
      [0x3f3a33, 0x201d18, 0x2e3b2a], [0x53331e, 0x241a12, 0x44281c], [0x4a4f58, 0x1e2026, 0x31241c],
      [0x3a4a58, 0x1d242b, 0x2c4a3e], [0x4c5a3c, 0x232a1c, 0x55503a], [0x5c4030, 0x2a1f16, 0x6a3a2a],
    ];
    const accents = [0xffd27a, 0x8fffd4, 0x9fb4c8, 0xffb060, 0xbfe4ff, 0x8a97a6];
    // one golden-angle seat per named soul — no two villagers share a doorstep
    const seatCount = new Map<string, number>();
    for (const npc of VILLAGE_NPCS) {
      const home = settlementById.get(npc.village);
      if (!home) continue;
      const seat = seatCount.get(npc.village) ?? 0;
      seatCount.set(npc.village, seat + 1);
      const angle = seat * 2.39996 + 0.9;
      const radius = 2.7 + (seat % 3) * 1.7;
      const x = home.x + Math.cos(angle) * radius;
      const z = home.z + Math.sin(angle) * radius;
      const h = hash(npc.id);
      const guard = capeIds.has(npc.id);
      const pal = palettes[Math.floor(h * 61) % palettes.length];
      const rig = buildRig({
        scale: 0.92 + h * 0.22,
        bulk: 0.9 + ((h * 7.13) % 1) * 0.45,
        armor: pal[0],
        armorDark: pal[1],
        cloth: pal[2],
        accent: accents[Math.floor(h * 89) % accents.length],
        accentIntensity: guard ? 1.8 : 0.9,
        weapon: guard ? "swordshield" : "none",
        cape: guard,
      });
      rig.root.traverse((o) => { o.castShadow = false; });
      const pos = new THREE.Vector3(x, terrainHeight(x, z), z);
      rig.root.position.copy(pos);
      rig.root.rotation.y = h * Math.PI * 2;
      this.world.scene.add(rig.root);
      this.world.colliders.push({ x, z, r: 0.85 });
      this.frontierNpcs.set(`v_${npc.id}`, { rig, pos, name: npc.name, title: npc.title, guard, yaw: rig.root.rotation.y });
    }
  }

  // ---------------------------------------------------------------
  // The Ashfall Relics — five glowing caches hidden across the waste.
  // Each one is a whole combat style the moment it is claimed.
  // ---------------------------------------------------------------
  private buildRelicPickups() {
    const mkCache = (color: number) => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 0),
        new THREE.MeshStandardMaterial({ color: 0x54401e, emissive: color, emissiveIntensity: 2.2, metalness: 0.7, roughness: 0.3, flatShading: true }),
      );
      core.position.y = 1.35;
      g.add(core);
      const halo = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.72, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.position.y = 1.35;
      g.add(halo);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.34, 26, 8, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beacon.position.y = 13;
      g.add(beacon);
      return g;
    };
    for (const relic of RELICS) {
      const [x, z] = relic.pickup;
      const group = mkCache(0xffd98a);
      const y = terrainHeight(x, z);
      group.position.set(x, y, z);
      this.world.scene.add(group);
      this.relicPickups.push({ id: relic.id, name: relic.name, title: relic.title, pos: new THREE.Vector3(x, y, z), group, taken: false });
    }
    {
      const [x, z] = GRAPPLE_PICKUP;
      const group = mkCache(0x8fd4ff);
      const y = terrainHeight(x, z);
      group.position.set(x, y, z);
      this.world.scene.add(group);
      this.grapplePickup = { pos: new THREE.Vector3(x, y, z), group, taken: false };
    }
  }

  // ---------------------------------------------------------------
  // The scattered tokens of the waste — the collect-quests of the frontier.
  // ---------------------------------------------------------------
  private buildCollectibles() {
    const hueFor = (tag: string) => {
      if (/spores|resin|salts|keepsake/.test(tag)) return 0x8fffd4;   // living things — teal
      if (/wrench|plates|chips/.test(tag)) return 0xffd98a;           // worked metal — amber
      return 0xbfe8ff;                                                // stone & glass — ice
    };
    for (let i = 0; i < COLLECTIBLE_SPOTS.length; i++) {
      const spot = COLLECTIBLE_SPOTS[i];
      const color = hueFor(spot.tag);
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshStandardMaterial({ color: 0x54401e, emissive: color, emissiveIntensity: 2.4, metalness: 0.7, roughness: 0.3, flatShading: true }),
      );
      core.position.y = 1.0;
      g.add(core);
      const halo = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.position.y = 1.0;
      g.add(halo);
      const y = terrainHeight(spot.x, spot.z);
      g.position.set(spot.x, y, spot.z);
      this.world.scene.add(g);
      this.collectibles.push({ id: i, tag: spot.tag, name: spot.name, pos: new THREE.Vector3(spot.x, y, spot.z), group: g, taken: false });
    }
  }

  private buildKing() {
    this.king = buildRig({
      scale: 1.06,
      bulk: 1.04,
      armor: 0x71603c,
      armorDark: 0x2e2718,
      cloth: 0x431640,
      accent: 0xffd27a,
      accentIntensity: 2.0,
      weapon: "greatsword",
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
    this.buildKingArmor();
    // the crown is its own beacon — no bare bulb behind the throne
  }

  /** Every returned Shard reinforces the king as well as Kinter. */
  private buildKingArmor() {
    const plate = new THREE.MeshStandardMaterial({ color: 0x9b844c, roughness: 0.32, metalness: 0.94, emissive: 0x2a1c08, emissiveIntensity: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x40371f, roughness: 0.46, metalness: 0.86 });
    const trim = () => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd98a, roughness: 0.28, metalness: 0.55, emissive: 0xffbd55, emissiveIntensity: 0.35 });
      this.kingRelayTrim.push(mat);
      return mat;
    };
    const tier = (minShards: number, parent: THREE.Group, meshes: THREE.Mesh[]) => {
      const group = new THREE.Group();
      for (const mesh of meshes) {
        mesh.castShadow = true;
        group.add(mesh);
      }
      group.visible = false;
      parent.add(group);
      this.kingArmorTiers.push({ group, minShards });
    };
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      return mesh;
    };

    const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 6, 16), plate);
    gorget.rotation.x = Math.PI / 2;
    gorget.position.y = 0.65;
    tier(2, this.king.torso, [gorget]);
    for (const elbow of [this.king.elbowL, this.king.elbowR]) tier(2, elbow, [box(0.18, 0.25, 0.18, dark, 0, -0.17, 0)]);

    tier(4, this.king.torso, [
      box(0.7, 0.48, 0.12, plate, 0, 0.37, 0.22),
      box(0.08, 0.4, 0.025, trim(), 0, 0.38, 0.295),
    ]);
    for (const shoulder of [this.king.shoulderL, this.king.shoulderR]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.235, 8, 6), plate);
      pauldron.scale.set(1.15, 0.78, 1.15);
      tier(4, shoulder, [pauldron]);
    }

    tier(6, this.king.torso, [
      box(0.16, 0.52, 0.34, dark, -0.35, 0.32, 0),
      box(0.16, 0.52, 0.34, dark, 0.35, 0.32, 0),
      box(0.58, 0.055, 0.035, trim(), 0, 0.57, 0.25),
    ]);
    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.026, 5, 18), trim());
    crownRing.rotation.x = Math.PI / 2;
    crownRing.position.y = 0.36;
    tier(6, this.king.head, [crownRing]);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.115, 0), trim());
    core.position.set(0, 0.4, 0.35);
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 5, 20), trim());
    coreRing.position.set(0, 0.4, 0.34);
    tier(8, this.king.torso, [core, coreRing]);
    for (const shoulder of [this.king.shoulderL, this.king.shoulderR]) {
      const guard = box(0.42, 0.09, 0.38, plate, 0, 0.12, 0);
      guard.rotation.z = shoulder === this.king.shoulderL ? -0.18 : 0.18;
      tier(8, shoulder, [guard]);
    }
  }

  private syncKingArmor() {
    for (const tier of this.kingArmorTiers) tier.group.visible = this.shardsCollected >= tier.minShards;
    for (const mat of this.kingRelayTrim) mat.emissiveIntensity = 0.35 + this.shardsCollected * 0.32;
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
    if (this.trialActor) {
      this.beacon.visible = false;
      return;
    }
    const K = this.world.keep;
    if (this.epiloguePhase === "active") {
      const step = EPILOGUE_STEPS[this.epilogueStage];
      if (step) {
        this.beacon.visible = true;
        this.beaconTarget.set(step.x, K.base, step.z);
        this.beacon.scale.set(0.45, 0.055, 0.45);
        this.beacon.position.set(step.x, K.base + 2.6, step.z);
        return;
      }
    }
    const kingAt = { x: WORLD.kingAt.x, y: K.base, z: WORLD.kingAt.z - 2.4 };
    let t: { x: number; y: number; z: number } | null;
    switch (this.questStage) {
      case 0: t = kingAt; break;
      case 1: t = { x: 0, y: K.f2, z: 121 }; break;
      case 2: t = { x: 0, y: K.f3, z: 122 }; break;
      case 3: {
        // The resonator (taught by Pip) pulls toward the nearest living Shard;
        // before that, the King's beacon points at Malenkar's citadel.
        if (this.shardBeaconKnown) {
          const alive = this.shardBosses.filter((b) => !b.dead);
          if (alive.length > 0) {
            alive.sort((a, b) =>
              Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z) -
              Math.hypot(b.pos.x - this.player.pos.x, b.pos.z - this.player.pos.z));
            const near = alive[0];
            t = { x: near.pos.x, y: terrainHeight(near.pos.x, near.pos.z), z: near.pos.z };
            break;
          }
        }
        t = { x: 0, y: terrainHeight(0, -18), z: -18 };
        break;
      }
      default: t = null;
    }
    if (!t) {
      this.beacon.visible = false;
      return;
    }
    this.beacon.visible = true;
    this.beaconTarget.set(t.x, t.y, t.z);
    // Indoors: short pillar. Outdoors: full 46-tall beam that punches sky.
    const indoor = this.questStage < 3;
    this.beacon.scale.set(1, indoor ? 0.055 : 1, 1);
    this.beacon.position.set(t.x, t.y + (indoor ? 2.6 : 46), t.z);
  }

  /** The king leaves his throne — Aldrich rides into the Malenkar fight, once. */
  private startAldrichChargeIn() {
    if (this.aldrichChargeInDone) return;
    this.aldrichChargeInDone = true;
    const boss = this.boss;
    const shards = this.shardsCollected;
    const devastating = shards >= 8;
    this.endingPath = devastating ? "radiance" : "hollow";
    // Lyekai holds the doorway with the last knights of Uoka
    const overworldLyekai = this.frontierNpcs.get("lyekai");
    if (overworldLyekai) overworldLyekai.rig.root.visible = false;
    const mkKnight = (x: number, z: number, yaw: number, accent: number, scale: number, bulk: number) => {
      const rig = buildRig({ scale, bulk, armor: 0x4a4f58, armorDark: 0x1e2026, cloth: 0x2c3a52, accent, accentIntensity: 2.0, weapon: "greatsword", cape: true });
      const pos = new THREE.Vector3(x, terrainHeight(x, z), z);
      rig.root.position.copy(pos);
      rig.root.rotation.y = yaw;
      this.world.scene.add(rig.root);
      poseRig(rig, { dt: 0.016, time: this.time, speed: 0, state: "guard", phase: 0.5, combo: 0, weapon: "greatsword" });
      const collider = { x, z, r: 0.9 };
      this.world.colliders.push(collider);
      this.finaleGuards.push({ root: rig.root, collider });
    };
    mkKnight(-2.4, 50.5, Math.PI, 0xffd27a, 1.16, 1.38); // Lyekai — the king's shadow
    mkKnight(2.6, 50.5, Math.PI, 0x9fd8ff, 1.04, 1.2);
    mkKnight(0.2, 52.6, Math.PI, 0x9fd8ff, 1.04, 1.2);
    // Aldrich arrives at the arena mouth — the king leaves his throne for the last time.
    const ally = this.king.root;
    ally.position.set(0, terrainHeight(0, 56), 56);
    ally.rotation.y = Math.PI;
    poseRig(this.king, { dt: 0.016, time: this.time, speed: 1.3, state: "heavy", phase: 0.58, combo: 0, weapon: "greatsword" });
    const dmg = Math.max(1, boss.hp * (devastating ? 0.65 : 0.06 * shards / 7));
    boss.hp = Math.max(1, boss.hp - dmg);
    boss.flash();
    boss.aggro = false;
    boss.setState("stagger", 7);
    boss.vel.set(0, 0, 0);
    this.shakeAmt = Math.max(this.shakeAmt, 1.4);
    this.shakeT = Math.max(this.shakeT, 1.6);
    this.addPopup(boss.pos.clone().setY(boss.pos.y + 3.6), "-" + Math.round(dmg).toLocaleString(), "crit");
    this.particles.emit({ x: boss.pos.x, y: boss.pos.y + 2.5, z: boss.pos.z, count: 90, speed: 15, size: 9, life: 0.9, color: 0xffd27a, grav: -4 });
    this.waves.spawn(boss.pos.clone(), 0xffd27a, 10, 0.9);
    audio.roar();
    if (devastating) {
      // eight Shards at once — the sky itself flinches
      this.waves.spawn(boss.pos.clone(), 0xfff0c0, 16, 1.3);
      this.particles.emit({ x: boss.pos.x, y: boss.pos.y + 3, z: boss.pos.z, count: 120, speed: 19, size: 10, life: 1.2, color: 0xfff3c8, grav: -2 });
      this.shakeAmt = Math.max(this.shakeAmt, 1.8);
      this.shakeT = Math.max(this.shakeT, 2.0);
    }
    this.graceFx = 1.6;
    this.showBanner(devastating ? "THE RADIANCE OF UOKA" : "THE HOLLOW CHARGE", devastating
      ? "Aldrich strikes with the full Raeku behind him"
      : "Aldrich burns bright — but not bright enough");
    // The king collapses where he stood — the empty throne is the last thing he sees.
    poseRig(this.king, { dt: 0.016, time: this.time, speed: 0, state: "death", phase: 1, combo: 0, weapon: "greatsword" });
    this.dialogueKind = "aldrichDeath";
    this.dialogue = { speaker: "KING ALDRICH", speakers: ["KING ALDRICH", "MALENKAR", "KING ALDRICH", "MALENKAR", "KING ALDRICH", "KING ALDRICH", "KING ALDRICH"], lines: DIALOGUE.aldrichDeath, idx: 0 };
    audio.setIntensity(1);
    this.lockTarget = boss;
    this.emit();
  }

  /** Aldrich's nonlethal introduction to the core combat controls. */
  private startKingTrial() {
    if (this.trialActor) return;
    const opponent = new NPC("warden");
    // The combat actor uses the actual king's rig; the temporary warden rig
    // is never added to the world and can be released immediately.
    opponent.rig.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) material.dispose();
    });
    opponent.rig = this.king;
    opponent.scale = this.king.height / 1.85;
    opponent.name = "KING ALDRICH — THE TRIAL";
    opponent.tutorialTag = "king-trial";
    opponent.runeValue = 0;
    opponent.moveSpeed = 2.0;
    opponent.aggroRange = 35;
    opponent.aggro = true;
    opponent.pos.set(0, this.world.keep.base, 120);
    opponent.yaw = Math.PI;
    opponent.rig.root.position.copy(opponent.pos);
    this.trialActor = opponent;
    this.trialPhase = "strikes";
    this.trialHits = 0;
    this.trialParryAttempts = 0;
    this.enemies.push(opponent);
    this.player.pos.set(0, this.world.keep.base, 114);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = 0;
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.setState("idle", 0.1);
    this.camYaw = Math.PI;
    this.camPitch = 0.16;
    this.camTargetDist = 6.4;
    this.lockTarget = opponent;
    this.syncBeacon();
    this.updateCamera(0, true);
    this.showBanner("THE KING'S TRIAL", "Land three light or heavy strikes");
    this.emit();
  }

  private trialObjective(): string | null {
    if (this.trialPhase === "strikes") return `THE KING'S TRIAL — Strike Aldrich: ${this.trialHits}/3`;
    if (this.trialPhase === "dodge") return "THE KING'S TRIAL — Use Phase-Step to evade";
    if (this.trialPhase === "parry") return "THE KING'S TRIAL — Parry Aldrich or create an opening with your blade";
    return null;
  }

  private trialHint(): string | null {
    if (this.trialPhase === "strikes") return "LEFT CLICK to strike · E for a heavy attack · TAB locks on";
    if (this.trialPhase === "dodge") return "SPACE Phase-Steps · hold a movement key to choose a direction";
    if (this.trialPhase === "parry") return "Tap RIGHT CLICK as the blow lands · or land five more strikes";
    return null;
  }

  private onKingTrialHit(npc: NPC): boolean {
    if (npc !== this.trialActor) return false;
    npc.flash();
    if (this.trialPhase === "strikes") {
      this.trialHits++;
      if (this.trialHits >= 3) {
        this.trialPhase = "dodge";
        this.showBanner("READ HIS WEIGHT", "Press SPACE to Phase-Step out of the king's reach");
      }
    } else if (this.trialPhase === "parry") {
      // A player who struggles with the parry can still earn an opening by
      // fighting; no tutorial timing window can lock the campaign.
      this.trialParryAttempts++;
      if (this.trialParryAttempts >= 5) this.finishKingTrial();
      else if (this.trialParryAttempts === 2) this.showBanner("FIND AN OPENING", "Tap RIGHT CLICK as his strike lands, or keep pressing the attack");
    }
    return true;
  }

  private finishKingTrial() {
    if (!this.trialActor) return;
    this.clearKingTrial();
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.fp = this.player.maxFp;
    this.questStage = 3;
    this.unlockEntries("trial_complete");
    this.shardBeaconKnown = true;
    this.player.grappleKnown = true;
    this.syncBeacon();
    this.waves.spawn(this.player.pos.clone().setY(this.player.pos.y + 1), 0x9fd8ff, 4, 0.6);
    this.showBanner("THE KING'S TRIAL COMPLETE", "The Royal Relay answers the Second Blade");
    this.startDialogue("trialComplete");
    this.saveGame();
  }

  private clearKingTrial() {
    const opponent = this.trialActor;
    if (!opponent) return;
    this.enemies = this.enemies.filter((enemy) => enemy !== opponent);
    if (this.lockTarget === opponent) this.lockTarget = null;
    this.trialActor = null;
    this.trialPhase = null;
    const king = WORLD.kingAt;
    this.kingPos.set(king.x, terrainHeight(king.x, king.z), king.z);
    this.kingYaw = Math.PI;
    this.king.root.position.copy(this.kingPos);
    this.king.root.rotation.y = this.kingYaw;
    poseRig(this.king, { dt: 0.016, time: this.time, speed: 0, state: "idle", phase: 0.5, combo: 0 });
  }

  /** Kinter's first responsibilities as king, before the pre-Citadel postgame. */
  private beginEpilogue(resuming: boolean) {
    this.epiloguePhase = "active";
    this.epilogueStage = Math.max(0, Math.min(EPILOGUE_STEPS.length - 1, this.epilogueStage));
    this.resetEnemies(); // clear remaining projectiles while keeping the defeated boss down
    this.player.clearAfterimage(this.world.scene);
    this.player.cancelGrapple();
    this.king.root.visible = false;
    this.player.dead = false;
    this.dead = false;
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.fp = this.player.maxFp;
    this.player.pos.set(0, this.world.keep.base, 112);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = 0;
    this.player.setState("idle", 0.1);
    if (this.player.rig.weapon) this.player.rig.weapon.visible = false;
    this.camYaw = Math.PI;
    this.camPitch = 0.16;
    this.camTargetDist = 6.4;
    this.lockTarget = null;
    this.buildEpilogueCast();
    this.syncBeacon();
    this.updateCamera(0, true);
    this.showBanner("A KING NOT BORN HERE", "The kingdom needs more than a crown");
    if (!resuming) {
      this.dialogueKind = "epilogueArrival";
      this.dialogue = { speaker: "LYEKAI", speakers: ["LYEKAI", "KINTER", "LYEKAI"], lines: [
        "The lords will come for the Relay when they hear Aldrich is gone. Some will say you stole his crown.",
        "There is someone waiting for me. I need this place to stand — for him, too.",
        "Then let us make a kingdom that can stand without hiding the truth from its people.",
      ], idx: 0 };
    }
    this.saveGame();
    this.emit();
  }

  private buildEpilogueCast() {
    this.clearEpilogueCast();
    const add = (stage: number, x: number, z: number, accent: number, guard = false) => {
      const rig = buildRig({ scale: 1, bulk: guard ? 1.25 : 1, armor: guard ? 0x4a4f58 : 0x51483b,
        armorDark: 0x24242a, cloth: guard ? 0x2c3a52 : 0x3b332a, accent, accentIntensity: 1.4,
        weapon: guard ? "greatsword" : "none", cape: guard });
      rig.root.position.set(x, this.world.keep.base, z);
      rig.root.rotation.y = Math.PI;
      poseRig(rig, { dt: 0.016, time: this.time, speed: 0, state: "idle", phase: 0.5, combo: 0 });
      this.world.scene.add(rig.root);
      this.epilogueCast.push({ root: rig.root, stage });
    };
    add(0, -2.4, 123, 0x8fd4ff); // Aldous
    add(0, 2.4, 123, 0x6fe0c0);  // Oren
    add(1, -5.4, 118, 0xffd27a, true); // Lyekai
    if (this.hasFrontierHelp()) add(1, -7.1, 118, 0x9fd8ff);
    add(2, 5.8, 118, 0xffd27a); // noble
    add(2, 3.8, 119, 0x9fd8ff, true); // Lyekai
    add(2, 7.2, 118, 0x8fffc8); // frontier representative
    this.updateEpilogueCast();
  }

  private updateEpilogueCast() {
    for (const member of this.epilogueCast) member.root.visible = member.stage === this.epilogueStage;
    this.world.setShardTier(Math.max(Math.floor(this.shardsCollected / 2), this.epilogueStage));
  }

  private clearEpilogueCast() {
    for (const member of this.epilogueCast) {
      this.world.scene.remove(member.root);
      member.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) material.dispose();
      });
    }
    this.epilogueCast = [];
  }

  private hasFrontierHelp(): boolean {
    return ["missing-core", "holding-the-line", "the-missing-patrol", "region-iron-guardian"].some((id) => this.questsDone.has(id));
  }

  private beginEpilogueStep() {
    const step = this.epilogueStage as EpilogueStep;
    const scene = epilogueDialogue(step, this.shardsCollected, this.hasFrontierHelp());
    this.dialogueKind = "epilogueStep";
    this.dialogue = { speaker: scene.speakers[0], speakers: scene.speakers, lines: scene.lines, idx: 0 };
    audio.ui("click");
    this.emit();
  }

  private startDialogue(kind: string) {
    this.dialogueKind = kind;
    const speakerFor: Record<string, string> = {
      oren: "OREN",
      lyekaiDuty: "LYEKAI",
      lyekaiRelations3: "LYEKAI",
      lyekaiRelations6: "LYEKAI",
      torin: "TORIN",
      torinBought: "TORIN",
      bram: "BRAM",
      bramPaid: "BRAM",
      pip: "PIP",
      milo: "MILO",
      miloBought: "MILO",
      vesper: "VESPER",
      vesperPaid: "VESPER",
      epilogue: "NARRATOR",
      epilogueRadiante: "NARRATOR",
      epilogueHollow: "NARRATOR",
      epilogueClosing: "NARRATOR",
      aldrichMilestone2: "KING ALDRICH",
      aldrichMilestone4: "KING ALDRICH",
      aldrichMilestone6: "KING ALDRICH",
      aldrichMilestone8: "KING ALDRICH",
      malenkharPhase2: "MALENKAR",
      aldrichDeath: "KING ALDRICH",
    };
    const speaker = speakerFor[kind] ?? "KING ALDRICH";
    const speakers = kind === "aldrichDeath"
      ? ["KING ALDRICH", "MALENKAR", "KING ALDRICH", "MALENKAR", "KING ALDRICH", "KING ALDRICH", "KING ALDRICH"]
      : kind === "aldrichMilestone2"
        ? ["KING ALDRICH", "KING ALDRICH", "KING ALDRICH", "KINTER", "KING ALDRICH", "KING ALDRICH"]
        : kind === "aldrichMilestone4"
          ? ["KING ALDRICH", "KING ALDRICH", "KING ALDRICH", "KING ALDRICH", "KING ALDRICH", "KINTER", "KING ALDRICH", "KINTER", "KING ALDRICH"]
          : kind === "aldrichMilestone6"
            ? ["KING ALDRICH", "KING ALDRICH", "KING ALDRICH", "KINTER", "KING ALDRICH", "KING ALDRICH", "KINTER", "KING ALDRICH", "KINTER", "KING ALDRICH"]
            : kind === "aldrichMilestone8"
              ? ["KING ALDRICH", "KING ALDRICH", "LYEKAI", "KING ALDRICH", "KING ALDRICH", "KINTER"]
              : undefined;
    this.dialogue = { speaker, speakers, lines: DIALOGUE[kind] ?? DIALOGUE.done, idx: 0 };
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
        this.startKingTrial();
      } else if (kind === "south") {
        this.southBriefed = true;
        this.saveGame();
      } else if (kind.startsWith("lyekaiRelations")) {
        // Commit only after the final line; reloading mid-conversation can no
        // longer permanently consume Lyekai's relationship scene.
        const n = parseInt(kind.slice("lyekaiRelations".length), 10);
        if (Number.isFinite(n)) this.lyekaiRelationsSpoken.add(n);
        this.saveGame();
        const pending = [3, 6].find((m) => this.shardsCollected >= m && !this.lyekaiRelationsSpoken.has(m));
        if (pending !== undefined) this.startDialogue(`lyekaiRelations${pending}`);
      } else if (kind.startsWith("aldrichMilestone")) {
        // Remember which of the king's milestone speeches have landed —
        // and pour any backlogged ones into the same scene, like the Relay
        // attuning every gathered Shard in a single visit.
        const n = parseInt(kind.slice("aldrichMilestone".length), 10);
        if (Number.isFinite(n)) this.aldrichMilestones.add(n);
        this.saveGame();
        const pending = [2, 4, 6, 8].find((m) => this.shardsCollected >= m && !this.aldrichMilestones.has(m));
        if (pending !== undefined) this.startDialogue(`aldrichMilestone${pending}`);
      } else if (kind === "epilogue" || kind === "epilogueRadiante" || kind === "epilogueHollow") {
        this.questStage = 9;
        this.unlockEntries("coronation");
        this.beginEpilogue(false);
      } else if (kind === "epilogueStep") {
        this.epilogueStage++;
        if (this.epilogueStage >= EPILOGUE_STEPS.length) {
          this.epiloguePhase = "closing";
          this.world.setShardTier(Math.max(Math.floor(this.shardsCollected / 2), EPILOGUE_STEPS.length));
          this.clearEpilogueCast();
          this.syncBeacon();
          this.startDialogue("epilogueClosing");
        } else {
          this.updateEpilogueCast();
          this.syncBeacon();
        }
        this.saveGame();
      } else if (kind === "epilogueClosing") {
        this.epiloguePhase = "complete";
        this.victoryAt = this.time - 6.5;
        this.saveGame();
      } else if (kind === "aldrichDeath") {
        // The fight is already engaged — the king lies fallen in the arena.
        this.boss.aggro = true;
        this.boss.setState("idle", 0.1);
        this.shakeAmt = Math.max(this.shakeAmt, 1.1);
        this.shakeT = Math.max(this.shakeT, 1.0);
        audio.roar();
      } else if (kind === "prologue:kinterMeeting") {
        // The opening ends the instant the king finishes his first greeting.
        this.finishPrologue();
      }
    }
    this.emit();
  }

  private updateKing(dt: number) {
    if (this.trialActor || this.epiloguePhase === "active") return;
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
    // The frontier cast — far figures keep their last pose; the near ones turn to face you
    for (const npc of this.frontierNpcs.values()) {
      const dx = p.pos.x - npc.pos.x;
      const dz = p.pos.z - npc.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 42) continue; // cheaper than skinning every idle skeleton in the Ashveil
      const want = dist < 9 ? Math.atan2(dx, dz) : npc.yaw;
      let d = ((want - npc.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      npc.yaw += d * Math.min(1, dt * 2.5);
      npc.rig.root.rotation.y = npc.yaw;
      poseRig(npc.rig, {
        dt, time: this.time, speed: 0,
        state: npc.guard ? "guard" : "idle",
        phase: 0.5, combo: 0, guard: npc.guard,
      });
    }
  }

  // =====================================================================
  // PROLOGUE — "The Long Fall"
  // =====================================================================

  /** Kick off the opening sequence (called from start()). */
  private beginPrologue() {
    if (this.prologueComplete || this.prologueActive) return;
    this.prologueStarted = true;
    this.prologueActive = true;
    const overworldLyekai = this.frontierNpcs.get("lyekai");
    if (overworldLyekai) overworldLyekai.rig.root.visible = false;
    this.prologueIdx = 0;
    this.prologueBeatTime = 0;
    this.prologueElapsed = 0;
    this.prologueAwaitDone.clear();
    this.prologueCueFired.clear();
    this.prologueMeetingDone = false;
    this.prologueFade = 0;
    this.prologueSubtitle = null;
    this.prologuePrompt = null;
    this.prologueCueTimer = 0;
    this.prologueCaptureTimer = 0;
    this.prologueCaptureElapsed = 0;
    this.lockTarget = null;
    this.player.rig.weapon && (this.player.rig.weapon.visible = false);
    if (this.kinterBackBlade) this.kinterBackBlade.visible = true;
    this.player.flasks = 1;

    // Hold the world in a low, ash-lit dusk through the whole sequence.
    this.prologueSavedWeather = this.world.weather;
    this.prologueTreeWasVisible = this.world.treeRoot.visible;
    this.world.treeRoot.visible = false;
    this.prologueWorldPropsVisible = {
      ruins: this.world.ruinsRoot.visible,
      flora: this.world.floraRoot.visible,
      mist: this.world.mistRoot.visible,
    };
    this.world.ruinsRoot.visible = false;
    this.world.floraRoot.visible = false;
    this.world.mistRoot.visible = false;
    this.prologueParkedRuins = this.world.ruinColliders.map((collider) => ({ collider, x: collider.x, z: collider.z }));
    for (const item of this.prologueParkedRuins) {
      item.collider.x = 100000;
      item.collider.z = 100000;
    }
    this.player.aura.color.setHex(0x8fd4ff);
    this.player.aura.intensity = 0;
    this.prologueSkyWasVisible = this.world.skyRoot.visible;
    this.prologueSavedBackground = this.world.scene.background;
    this.world.skyRoot.visible = false;
    this.world.scene.background = new THREE.Color(0x090e12);
    const terrain = this.world.scene.getObjectByName("terrain") as THREE.Mesh | null;
    if (terrain?.material && !Array.isArray(terrain.material) && terrain.material instanceof THREE.MeshStandardMaterial) {
      this.prologueTerrainMaterial = terrain.material;
      this.prologueTerrainColor = terrain.material.color.clone();
      terrain.material.color.multiplyScalar(0.34);
    }
    this.prologuePointLights = [];
    this.world.scene.traverse((object) => {
      if (!(object instanceof THREE.PointLight)) return;
      if (object === this.player.aura) return; // the lifesuit glow is driven every frame below
      this.prologuePointLights.push({ light: object, intensity: object.intensity });
      object.intensity = 0;
    });
    this.prologueEmbersWereVisible = this.embers.points.visible;
    this.embers.points.visible = false;
    this.prologueDayPhase = this.world.dayPhase;
    this.world.dayPhase = 0.6;
    this.world.setWeather("ash");
    audio.setIntensity(0);

    this.prologueCollidersStart = this.world.colliders.length;
    this.prologueSet = buildPrologueSet(this.world.scene, this.world.colliders);
    this.buildPrologueCast();
    this.king.root.visible = false;

    this.enterPrologueBeat(0);
  }

  private buildPrologueCast() {
    const lyekai = buildRig({
      scale: 1.05, bulk: 1.06,
      armor: 0x6a6f78, armorDark: 0x23252b, cloth: 0x1f3550,
      accent: 0x8fd4ff, accentIntensity: 2.0, weapon: "swordshield", cape: true,
    });
    lyekai.root.visible = false;
    this.world.scene.add(lyekai.root);

    const guards: Rig[] = [];
    for (let i = 0; i < 8; i++) {
      const g = buildRig({
        scale: 0.98, bulk: 1.0,
        armor: 0x575c66, armorDark: 0x24262c, cloth: 0x3a2b20,
        accent: 0x9fd8ff, accentIntensity: 1.6, weapon: "halberd",
      });
      g.root.visible = false;
      this.world.scene.add(g.root);
      guards.push(g);
    }
    this.prologueCast = { lyekai, guards };
    this.prologueCastColliders = [lyekai, ...guards].map((rig) => {
      const collider: Colliderish = { x: 100000, z: 100000, r: 0 };
      this.world.colliders.push(collider);
      return { rig, collider };
    });
  }

  private syncPrologueCastColliders() {
    for (const { rig, collider } of this.prologueCastColliders) {
      collider.x = rig.root.visible ? rig.root.position.x : 100000;
      collider.z = rig.root.visible ? rig.root.position.z : 100000;
      collider.r = rig.root.visible ? 0.72 : 0;
    }
  }

  private enterPrologueBeat(idx: number) {
    this.prologueIdx = idx;
    this.prologueBeatTime = 0;
    this.prologueShotTime = 0;
    this.prologueWalkIdx = 0;
    this.prologueCamYaw = 0;
    this.prologuePrompt = null;
    this.prologueSubtitle = null;
    this.prologueCueTimer = 0;
    const beat = PROLOGUE_BEATS[idx];
    if (beat.fadeIn) this.prologueFade = 1;

    // Place the player and the camera for this beat.
    if (beat.id === "last-night") {
      if (this.kinterBackBlade) this.kinterBackBlade.visible = false;
      this.placePlayerAt(PROLOGUE_POINTS.home.x, PROLOGUE_POINTS.home.z, Math.PI);
    } else if (beat.id === "border") {
      if (this.kinterBackBlade) this.kinterBackBlade.visible = true;
      this.placePlayerAt(PROLOGUE_POINTS.borderStart.x, PROLOGUE_POINTS.borderStart.z, Math.PI);
    } else if (beat.id === "arrival") {
      this.unlockEntries("prologue_border");
      const p0 = PROLOGUE_POINTS.forestStart;
      this.placePlayerAt(p0.x, p0.z, Math.atan2(PROLOGUE_PATH[1].x - p0.x, PROLOGUE_PATH[1].z - p0.z));
      this.prologueWalkIdx = 1;
      audio.gust();
    } else if (beat.id === "shore") {
      this.placePlayerAt(PROLOGUE_POINTS.shore.x, PROLOGUE_POINTS.shore.z, Math.PI);
      this.player.setState("hurt", 2.2);
      audio.splash();
      audio.water(0.6);
    } else if (beat.id === "escort") {
      this.placePlayerAt(PROLOGUE_POINTS.drawbridge.x, 84, 0);
      this.removeDroppedPrologueBlade();
      this.player.rig.weapon && (this.player.rig.weapon.visible = false);
    } else if (beat.id === "rockslide") {
      this.placePlayerAt(PROLOGUE_POINTS.riverBank.x, PROLOGUE_POINTS.riverBank.z, Math.PI);
    } else if (beat.id === "waterfall") {
      this.prologueFallStartY = this.player.pos.y;
    } else if (beat.id === "castle") {
      this.placePlayerAt(0, 112, 0);
      this.king.root.visible = true;
    }

    // Traverse beats look at the waypoint; cinematic beats run their own rig.
    if (beat.mode === "traverse" && beat.waypoint) {
      const wp = beat.waypoint;
      this.camYaw = Math.atan2(this.player.pos.x - wp.x, this.player.pos.z - wp.z);
      this.camPitch = 0.16;
      this.camTargetDist = 6.4;
      this.camDist = 6.4;
    }
    if (beat.id === "lyekai") audio.water(1);
    if (beat.id === "waterfall") audio.water(1);
    if (beat.id === "rockslide") audio.gust();
    if (beat.id === "lyekai") {
      if (this.kinterBackBlade) this.kinterBackBlade.visible = false;
      if (this.player.rig.weapon) this.player.rig.weapon.visible = true;
      this.player.setState("guard", 1.4);
    }

    this.placePrologueCast();
    this.syncPrologueBeacon();
    if (beat.dialogueHold) this.startPrologueDialogue("lyekai");
    this.updateCamera(0, true);
    this.emit();
  }

  /** Teleport the player, kill momentum, and face a direction. */
  private placePlayerAt(x: number, z: number, yaw: number) {
    const p = this.player;
    p.pos.set(x, terrainHeight(x, z), z);
    p.vel.set(0, 0, 0);
    p.vertical = 0;
    p.yaw = yaw;
    p.setState("idle", 0.2);
    p.rig.root.position.copy(p.pos);
    p.rig.root.rotation.y = yaw;
    this.lockTarget = null;
  }

  private placePrologueCast() {
    if (!this.prologueCast) return;
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    const show = ["lyekai", "escort", "castle"].includes(beat.id);
    const { lyekai, guards } = this.prologueCast;
    lyekai.root.visible = show;
    for (const g of guards) g.root.visible = show;
    if (!show) { this.syncPrologueCastColliders(); return; }

    const p = this.player.pos;
    const place = (rig: Rig, x: number, z: number) => {
      const y = terrainHeight(x, z);
      rig.root.position.set(x, y, z);
      rig.root.rotation.y = Math.atan2(p.x - x, p.z - z);
    };

    if (beat.id === "lyekai") {
      place(lyekai, 155, 182);
      const ring = 6.5;
      guards.forEach((g, i) => {
        // Southern arc only — the pool owns the north side of the shore
        const a = Math.PI + (i / (guards.length - 1)) * Math.PI;
        place(g, PROLOGUE_POINTS.shore.x + Math.cos(a) * ring, PROLOGUE_POINTS.shore.z + Math.sin(a) * ring);
      });
    } else if (beat.id === "escort") {
      place(lyekai, p.x - 1.8, p.z + 5.5);
      const offsets: [number, number][] = [
        [-2.5, -2.5], [2.5, -2.5], [-2.5, -5.5], [2.5, -5.5],
        [-2.2, -8.5], [2.2, -8.5], [-1.7, -11.5], [1.7, -11.5],
      ];
      guards.forEach((g, i) => { const [x, z] = offsets[i]; place(g, p.x + x, p.z + z); });
    } else {
      place(lyekai, -3, 119);
      const spots: [number, number][] = [[4, 117], [-4, 117], [5, 113], [-5, 113], [6, 122], [-6, 122], [3, 126], [-3, 126]];
      guards.forEach((g, i) => { const s = spots[i % spots.length]; place(g, s[0], s[1]); });
    }
    this.syncPrologueCastColliders();
  }

  private updatePrologueCast(dt: number) {
    if (!this.prologueCast || !["lyekai", "escort", "castle"].includes(PROLOGUE_BEATS[this.prologueIdx].id)) return;
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    if (beat.id === "escort") this.placePrologueCast();
    const { lyekai, guards } = this.prologueCast;
    const holding = beat.id === "lyekai" && !!this.dialogue;
    poseRig(lyekai, { dt, time: this.time, speed: 0, state: holding ? "guard" : "idle", phase: 0.5, combo: 0, guard: holding });
    const capturing = beat.id === "escort" && this.prologueCaptureTimer > 0;
    if (capturing && guards[0]) {
      const g = guards[0];
      const x = this.player.pos.x + 0.85;
      const z = this.player.pos.z - 0.55;
      g.root.position.set(x, terrainHeight(x, z), z);
      g.root.rotation.y = Math.atan2(this.player.pos.x - x, this.player.pos.z - z);
      this.syncPrologueCastColliders();
    }
    guards.forEach((g, i) => {
      const attacking = capturing && i === 0;
      poseRig(g, {
        dt,
        time: this.time,
        speed: 0,
        state: attacking ? "attack" : "idle",
        phase: attacking ? Math.min(1, this.prologueCaptureElapsed / 1.25) : 0.5,
        combo: 0,
      });
    });
  }

  private disposePrologueCast() {
    if (!this.prologueCast) return;
    const rigs = [this.prologueCast.lyekai, ...this.prologueCast.guards];
    for (const rig of rigs) {
      this.world.scene.remove(rig.root);
      rig.root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.MeshStandardMaterial)?.map?.dispose?.();
          mat?.dispose?.();
        }
      });
    }
    this.prologueCast = null;
    this.prologueCastColliders = [];
  }

  private disposePrologueSet() {
    if (!this.prologueSet) return;
    this.world.scene.remove(this.prologueSet.root);
    this.prologueSet.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        (mat as THREE.MeshStandardMaterial)?.map?.dispose?.(); // canvas stripe textures etc.
        (mat as THREE.MeshStandardMaterial)?.emissiveMap?.dispose?.();
        (mat as THREE.MeshStandardMaterial)?.normalMap?.dispose?.();
        mat?.dispose?.();
      }
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) im.dispose?.();
    });
    this.world.colliders.length = this.prologueCollidersStart;
    this.prologueSet = null;
  }

  private syncPrologueBeacon() {
    if (!this.prologueActive || this.prologueComplete) return;
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    const wp = beat.waypoint;
    if (!wp) {
      this.beacon.visible = false;
      return;
    }
    const y = terrainHeight(wp.x, wp.z);
    this.beacon.visible = true;
    this.beaconTarget.set(wp.x, y, wp.z);
    // Keep the opening's route marker low so it guides without covering Kinter.
    this.beacon.scale.set(0.24, 0.012, 0.24);
    this.beacon.position.set(wp.x, y + 0.55, wp.z);
  }

  private animatePrologueWater(dt: number) {
    if (!this.prologueSet) return;
    const { waterfallMats, waterMats, foam } = this.prologueSet;
    for (const m of waterfallMats) {
      if (m.map) m.map.offset.y = (m.map.offset.y - dt * 1.4) % 1;
    }
    waterMats.forEach((m, i) => {
      m.opacity = Math.min(0.97, 0.86 + Math.sin(this.time * 1.7 + i * 1.3) * 0.05);
    });
    const fm = foam.material as THREE.MeshBasicMaterial;
    fm.opacity = 0.3 + Math.sin(this.time * 3.1) * 0.12;
  }

  private removeDroppedPrologueBlade() {
    if (!this.prologueDroppedBlade) return;
    this.world.scene.remove(this.prologueDroppedBlade);
    this.prologueDroppedBlade = null;
  }

  private dropPrologueBlade() {
    if (!this.kinterBackBlade || this.prologueDroppedBlade) return;
    const blade = this.kinterBackBlade.clone(true);
    blade.visible = true;
    blade.position.set(this.player.pos.x + 0.55, terrainHeight(this.player.pos.x + 0.55, this.player.pos.z) + 0.08, this.player.pos.z + 0.3);
    blade.rotation.set(Math.PI / 2, 0, 0.2);
    blade.scale.set(0.9, 0.9, 0.9);
    this.world.scene.add(blade);
    this.prologueDroppedBlade = blade;
    const guard = this.prologueCast?.guards[0];
    if (guard) {
      guard.root.position.set(this.player.pos.x + 1.1, terrainHeight(this.player.pos.x + 1.1, this.player.pos.z), this.player.pos.z + 0.2);
      guard.root.rotation.y = Math.PI / 2;
      this.syncPrologueCastColliders();
    }
  }

  /** Timed body motion and impacts for the fall, layered over the authored camera. */
  private updatePrologueMotion(raw: number) {
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    const t = this.prologueBeatTime;
    const player = this.player;
    const trigger = (key: string, at: number, shake: number, duration: number, sound?: "splash" | "gust") => {
      const id = `fx:${beat.id}:${key}`;
      if (t < at || this.prologueCueFired.has(id)) return;
      this.prologueCueFired.add(id);
      this.shakeAmt = Math.max(this.shakeAmt, shake);
      this.shakeT = Math.max(this.shakeT, duration);
      if (sound === "splash") audio.splash();
      else if (sound === "gust") audio.gust();
    };

    if (beat.id === "rockslide") {
      if (t >= 10) trigger("slide-impact", 10, 0.42, 0.55, "gust");
      if (t >= 30) trigger("river-impact", 30, 0.78, 0.85, "splash");
      if (t >= 58) trigger("ledge-break", 58, 0.52, 0.65, "gust");
      if (t > 10 && t < 45) {
        poseRig(player.rig, { dt: raw, time: this.time, speed: 0.7, state: "roll", phase: (t % 1.05) / 1.05, combo: 0 });
      }
      if (t >= 45) poseRig(player.rig, { dt: raw, time: this.time, speed: 0, state: "hurt", phase: Math.min(1, (t - 45) / 2), combo: 0 });
    } else if (beat.id === "waterfall") {
      trigger("edge-break", 26, 0.58, 0.7, "gust");
      trigger("water-impact", 42, 1.05, 1.1, "splash");
      if (t >= 26 && t <= 42) {
        const progress = THREE.MathUtils.smoothstep((t - 26) / 16, 0, 1);
        const from = this.prologueFallStartY + 1.3;
        const to = terrainHeight(PROLOGUE_POINTS.pool.x, PROLOGUE_POINTS.pool.z) + 0.28;
        player.pos.set(
          THREE.MathUtils.lerp(PROLOGUE_POINTS.riverEdge.x, PROLOGUE_POINTS.pool.x, progress),
          THREE.MathUtils.lerp(from, to, progress) + Math.sin(progress * Math.PI) * 1.4,
          THREE.MathUtils.lerp(PROLOGUE_POINTS.riverEdge.z, PROLOGUE_POINTS.pool.z, progress),
        );
        player.vel.set(0, 0, 0);
        player.vertical = 0;
        player.rig.root.position.copy(player.pos);
        player.rig.root.rotation.y = Math.PI;
        poseRig(player.rig, { dt: raw, time: this.time, speed: 0.25, state: "hurt", phase: progress, combo: 0 });
      }
    }
  }

  /** The one interaction prompt the current beat is offering, if any. */
  private currentProloguePrompt(): string | null {
    if (this.dialogue) return null; // nothing to prompt while a conversation owns the screen
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    for (const a of beat.awaits) {
      if (a.at > this.prologueBeatTime) continue;
      if (this.prologueAwaitDone.has(`${beat.id}:${a.key}`)) continue;
      if (a.position && Math.hypot(this.player.pos.x - a.position.x, this.player.pos.z - a.position.z) > 3.2) continue;
      // The meeting with Aldrich is hard-gated behind the minimum runtime.
      if (beat.id === "castle" && a.key === "meet" && this.prologueElapsed < PROLOGUE_MIN_SECONDS) continue;
      if (beat.id === "castle" && a.key === "meet" && this.player.pos.distanceTo(this.kingPos) > 6.2) continue;
      return a.prompt;
    }
    return null;
  }

  private prologueRequiredPending(): boolean {
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    return beat.awaits.some(
      (a) => a.required && a.at <= this.prologueBeatTime && !this.prologueAwaitDone.has(`${beat.id}:${a.key}`),
    );
  }

  /** Called when the player presses F on the live prompt (or the AI interacts). */
  private satisfyPrologueAwait() {
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    const prompt = this.prologuePrompt;
    if (!prompt) return false;
    const idx = beat.awaits.findIndex(
      (a) => a.prompt === prompt && a.at <= this.prologueBeatTime && !this.prologueAwaitDone.has(`${beat.id}:${a.key}`),
    );
    if (idx < 0) return false;
    const a = beat.awaits[idx];
    this.prologueAwaitDone.add(`${beat.id}:${a.key}`);
    this.prologuePrompt = null;

    if (a.key.startsWith("border-")) {
      const lines: Record<string, string> = {
        "border-cairn": "Someone repaired this marker long after our maps stopped at the border.",
        "border-sign": "An old road sign, written in a script I cannot read. The road once led somewhere.",
        "border-bird": "A violet feather. Whatever crossed this forest came from farther away than I have.",
      };
      this.prologueSubtitle = { speaker: "KINTER", text: lines[a.key] };
      this.prologueCueTimer = 6;
      this.unlockEntries("prologue_border");
      audio.ui("click");
    } else if (a.key === "seal") audio.suit(false);
    else if (a.key === "telemetry") audio.suit(true);
    else if (a.key === "marks") audio.ui("hover");
    else if (a.key === "surrender") {
      audio.sheathe();
      if (this.player.rig.weapon) this.player.rig.weapon.visible = false;
      this.dropPrologueBlade();
      this.player.setState("idle", 0.4);
    } else if (a.key === "meet") {
      this.prologueMeetingDone = true;
      this.startPrologueDialogue("kinterMeeting");
    } else audio.ui("click");
    return true;
  }

  private startPrologueDialogue(kind: "lyekai" | "kinterMeeting") {
    const d = PROLOGUE_DIALOGUE[kind];
    if (!d) return;
    this.dialogueKind = `prologue:${kind}`;
    this.dialogue = { speaker: d.speaker, speakers: d.speakers?.slice(), lines: d.lines.slice(), idx: 0 };
    if (kind === "kinterMeeting") {
      // A sentry forces Kinter to one knee before Aldrich speaks.
      this.player.setState("kneel", 1);
      this.player.vel.set(0, 0, 0);
      this.shakeAmt = Math.max(this.shakeAmt, 0.34);
      this.shakeT = Math.max(this.shakeT, 0.24);
      audio.hit("metal");
    }
    audio.ui("click");
    this.emit();
  }

  private advancePrologueBeat() {
    if (this.prologueIdx >= PROLOGUE_BEATS.length - 1) {
      this.finishPrologue();
      return;
    }
    this.enterPrologueBeat(this.prologueIdx + 1);
  }

  /** The sequence is over: hand the world back to the normal campaign. */
  private restorePrologueEnvironment() {
    this.removeDroppedPrologueBlade();
    if (this.kinterBackBlade) this.kinterBackBlade.visible = false;
    if (this.player.rig.weapon) this.player.rig.weapon.visible = true;
    this.disposePrologueCast();
    this.disposePrologueSet();
    this.world.setWeather(this.prologueSavedWeather);
    this.world.treeRoot.visible = this.prologueTreeWasVisible;
    this.world.ruinsRoot.visible = this.prologueWorldPropsVisible.ruins;
    this.world.floraRoot.visible = this.prologueWorldPropsVisible.flora;
    this.world.mistRoot.visible = this.prologueWorldPropsVisible.mist;
    for (const item of this.prologueParkedRuins) {
      item.collider.x = item.x;
      item.collider.z = item.z;
    }
    this.prologueParkedRuins = [];
    this.world.skyRoot.visible = this.prologueSkyWasVisible;
    this.world.scene.background = this.prologueSavedBackground;
    if (this.prologueTerrainMaterial && this.prologueTerrainColor) this.prologueTerrainMaterial.color.copy(this.prologueTerrainColor);
    for (const item of this.prologuePointLights) item.light.intensity = item.intensity;
    this.prologuePointLights = [];
    this.embers.points.visible = this.prologueEmbersWereVisible;
    this.prologueTerrainMaterial = null;
    this.prologueTerrainColor = null;
    this.world.dayPhase = this.prologueDayPhase; // hand the clock back untouched
    this.king.root.visible = true;
    const overworldLyekai = this.frontierNpcs.get("lyekai");
    if (overworldLyekai) overworldLyekai.rig.root.visible = true;
  }

  private finishPrologue() {
    if (this.prologueComplete) return;
    this.prologueComplete = true;
    this.prologueActive = false;
    this.prologuePrompt = null;
    this.prologueSubtitle = null;
    this.prologueCueTimer = 0;
    this.prompt = null;
    this.dialogue = null;
    this.prologueFade = 0;
    this.player.setState("idle", 0.1);
    this.player.flasks = this.player.maxFlasks;
    this.restorePrologueEnvironment();
    this.camTargetDist = 6.4; // drop the last cinematic boom distance
    this.syncBeacon();
    this.unlockEntries("prologue_complete");
    // A ledger the Grace does not honour — the keeper's vigil, sealed.
    this.saveGame();
    // He is still standing at the throne: show the real Aldrich encounter prompt.
    this.emit();
  }

  private updatePrologue(raw: number) {
    if (!this.prologueActive || this.prologueComplete) return;
    this.player.aura.color.setHex(0x8fd4ff);
    this.player.aura.intensity = 0.22;
    for (const item of this.prologuePointLights) item.light.intensity = 0;
    if (this.world.scene.fog instanceof THREE.FogExp2) {
      this.world.scene.fog.color.setHex(0x111714);
      this.world.scene.fog.density = 0.0065;
    }
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    const talking = !!this.dialogue;
    const capturing = this.prologueCaptureTimer > 0;
    if (!capturing) this.prologueShotTime += raw;

    // An open story dialogue pauses the authored timer (and its subtitles).
    if (!talking && !capturing) {
      this.prologueBeatTime += raw;
      this.prologueElapsed += raw;
    }

    // ---- fade: decay a fade-in, ramp a fade-out over the last 6 seconds ----
    this.prologueFade = advancePrologueFade(this.prologueFade, !!beat.fadeOut, beat.duration, this.prologueBeatTime, raw);

    if (capturing) {
      // Freeze the interaction layer during the guard-attack cinematic.
      this.prologuePrompt = null;
      this.prompt = null;
      this.prologueCaptureTimer = Math.max(0, this.prologueCaptureTimer - raw);
      this.prologueCaptureElapsed += raw;
      this.prologueCueTimer = Math.max(0, this.prologueCueTimer - raw);
      if (this.prologueCueTimer === 0) this.prologueSubtitle = null;
      if (this.prologueCaptureTimer < 0.35) {
        this.prologueFade = Math.max(this.prologueFade, 1 - this.prologueCaptureTimer / 0.35);
      }
      this.updatePrologueCast(raw);
      if (this.prologueCaptureTimer === 0) {
        this.prologueCaptureElapsed = 0;
        const escortIdx = PROLOGUE_BEATS.findIndex((item) => item.id === "escort");
        this.enterPrologueBeat(escortIdx >= 0 ? escortIdx : this.prologueIdx);
      }
      return;
    }

    // ---- cues -> subtitle ----
    for (let i = 0; i < beat.cues.length; i++) {
      const key = `${beat.id}:${i}`;
      if (this.prologueCueFired.has(key)) continue;
      const cue = beat.cues[i];
      if (this.prologueBeatTime < cue.t) continue;
      this.prologueCueFired.add(key);
      this.prologueSubtitle = { speaker: cue.speaker, text: cue.text };
      this.prologueCueTimer = cue.hold ?? 10;
      if (cue.speaker === "SUIT TELEMETRY") audio.suit(false);
      else if (cue.speaker === "KINTER" || cue.speaker === "LYEKAI") audio.ui("hover");
    }
    if (this.prologueCueTimer > 0) {
      this.prologueCueTimer -= raw;
      if (this.prologueCueTimer <= 0) this.prologueSubtitle = null;
    }

    // Hide the subtitle while a dialogue owns the screen.
    if (talking) this.prologueSubtitle = null;

    // ---- one live interaction prompt ----
    this.prologuePrompt = this.currentProloguePrompt();
    this.prompt = this.prologuePrompt;
    if (this.prologuePrompt && this.interactBuffer > 0) {
      this.interactBuffer = 0;
      this.satisfyPrologueAwait();
    }

    // ---- world flavour + cast ----
    this.animatePrologueWater(raw);
    this.updatePrologueCast(raw);

    if (beat.id === "escort") {
      // Bridge/escort route only — once he is through the doors (inside the
      // keep) the waypoint logic owns the scene; no capture punts indoors.
      const escaped = Math.abs(this.player.pos.x) > 6.5 || this.player.pos.z < 78;
      if (escaped) {
        this.prologueCaptureTimer = 1.25;
        this.prologueCaptureElapsed = 0;
        this.prologueSubtitle = { speaker: "LYEKAI", text: "Stop him! Bring him back to the bridge." };
        this.prologueCueTimer = 1.2;
        this.player.hp = Math.max(20, this.player.hp - 12);
        this.player.invuln = Math.max(this.player.invuln, 1.25);
        this.player.setState("hurt", 0.42);
        this.player.vel.set(0, 0, 0);
        this.shakeAmt = Math.max(this.shakeAmt, 0.55);
        this.shakeT = Math.max(this.shakeT, 0.38);
        audio.swing(0.8);
        audio.hit("metal");
      }
    }

    // ---- completion ----
    if (beat.id === "castle") {
      // Safety valve: if the player never interacts, meet the king anyway.
      // (Distance is intentionally NOT required — a player parked away from
      // the throne used to soft-lock the opening forever.)
      if (!this.dialogue && !this.prologueMeetingDone && this.prologueBeatTime >= beat.duration + 45) {
        this.startPrologueDialogue("kinterMeeting");
      }
      return;
    }
    const routeDistance = beat.waypoint ? Math.hypot(this.player.pos.x - beat.waypoint.x, this.player.pos.z - beat.waypoint.z) : 0;
    const reachedWaypoint = !beat.waypoint || routeDistance <= 5.2;
    if (!talking && !this.prologueCaptureTimer && this.prologueBeatTime >= beat.duration && !this.prologueRequiredPending() && reachedWaypoint) {
      this.advancePrologueBeat();
    }
  }

  /** Neutral input used whenever a cinematic should hold the player still. */
  private neutralInput(): PlayerInput {
    return {
      moveX: 0, moveZ: 0, sprint: false,
      attack: false, heavy: false, roll: false, guard: false, cast: false, heal: false,
      camYaw: this.camYaw + Math.PI, faceYaw: null,
    };
  }

  /** Scripted input for a cinematic beat: a slow walk, or holding still. */
  private prologueCinematicInput(beat: PrologueBeat): PlayerInput {
    this.attackBuffer = this.heavyBuffer = this.rollBuffer = this.castBuffer = this.healBuffer = 0;
    if (this.dialogue) return this.neutralInput();
    let mx = 0;
    let mz = 0;
    let faceYaw: number | null = null;
    if (beat.walk && this.prologueWalkIdx < beat.walk.path.length) {
      const t = beat.walk.path[this.prologueWalkIdx];
      const dx = t.x - this.player.pos.x;
      const dz = t.z - this.player.pos.z;
      if (Math.hypot(dx, dz) <= 0.9) {
        this.prologueWalkIdx++;
      } else {
        const dir = Math.atan2(dx, dz);
        const m = beat.walk.speed;
        mx = Math.sin(dir) * m;
        mz = Math.cos(dir) * m;
        faceYaw = dir;
      }
    }
    return {
      moveX: mx, moveZ: mz, sprint: false,
      attack: false, heavy: false, roll: false, guard: false, cast: false, heal: false,
      camYaw: 0, faceYaw,
    };
  }

  /** The scripted establishing camera for a cinematic beat. */
  private prologueCamera(cam: PrologueCam, dt: number, instant: boolean) {
    const p = this.player;
    this.prologueCamYaw += cam.drift * dt;
    const yaw = cam.yaw + this.prologueCamYaw;
    const cp = Math.cos(cam.pitch);
    const off = new THREE.Vector3(
      Math.sin(yaw) * cp * cam.dist,
      Math.sin(cam.pitch) * cam.dist + 1.9,
      Math.cos(yaw) * cp * cam.dist,
    );
    const fx = cam.targetX ?? p.pos.x;
    const fz = cam.targetZ ?? p.pos.z;
    const target = new THREE.Vector3(fx, p.pos.y + cam.look, fz);
    const desired = target.clone().add(off);
    const gh = groundAt(desired.x, desired.z, p.pos.y + 2.2) + 0.9;
    if (desired.y < gh) desired.y = gh;

    // Sweep the authored camera boom against terrain and solid scene colliders
    // so cuts cannot place the lens inside a trunk, wall, or the ground.
    const ray = desired.clone().sub(target);
    const lastClear = target.clone();
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const sample = target.clone().addScaledVector(ray, t);
      const floor = groundAt(sample.x, sample.z, p.pos.y + 2.2);
      const hitsSolid = sample.y < floor + 0.8 || (sample.y < floor + 18 && this.world.colliders.some((c) => {
        const dx = sample.x - c.x;
        const dz = sample.z - c.z;
        const r = c.r + 0.42;
        return dx * dx + dz * dz < r * r;
      }));
      if (hitsSolid) {
        desired.copy(lastClear);
        break;
      }
      lastClear.copy(sample);
    }

    // The authored cuts compose the frame hard, but the player's movement
    // frame eases across them — a hard cut must never invert WASD instantly.
    let yd = ((yaw - this.camYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (yd < -Math.PI) yd += Math.PI * 2;
    this.camYaw += yd * Math.min(1, dt * 3.2);
    this.camPitch = cam.pitch;
    this.camDist = this.camTargetDist = cam.dist;

    if (instant) {
      this.camPos.copy(desired);
      this.camLook.copy(target);
    } else {
      this.camPos.lerp(desired, Math.min(1, dt * 3));
      this.camLook.lerp(target, Math.min(1, dt * 4));
    }
    this.camera.position.copy(this.camPos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmt * Math.max(0, this.shakeT) * 1.6;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
      this.camera.position.z += (Math.random() - 0.5) * k;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }
    this.camera.lookAt(this.camLook);
  }

  /** HUD payload for the opening overlay; null once the sequence is over. */
  private prologueHud(): PrologueHud | null {
    if (!this.prologueStarted || this.prologueComplete) return null;
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    return {
      active: this.prologueActive,
      complete: this.prologueComplete,
      beatId: beat.id,
      title: beat.title,
      area: beat.area,
      objective: beat.objective,
      hint: beat.hint,
      subtitle: this.prologueSubtitle,
      prompt: this.prologuePrompt,
      progress: Math.min(1, this.prologueElapsed / PROLOGUE_TOTAL_SECONDS),
      beatProgress: Math.min(1, this.prologueBeatTime / beat.duration),
      elapsed: this.prologueElapsed,
      minSeconds: PROLOGUE_MIN_SECONDS,
      fade: this.prologueFade,
      dialogue: this.dialogue,
    };
  }

  private performPrologueAction(action: AshveilAgentAction): { ok: boolean; note: string } {
    const beat = PROLOGUE_BEATS[this.prologueIdx];
    switch (action.action) {
      case "wait":
        return { ok: true, note: `let the opening beat play for ${Math.max(0.2, Math.min(30, action.seconds ?? 30)).toFixed(1)} seconds` };
      case "interact":
        if (this.dialogue) {
          this.advanceDialogue();
          return { ok: true, note: "advanced the current dialogue line" };
        }
        if (this.prologuePrompt) {
          const note = this.prologuePrompt;
          this.satisfyPrologueAwait();
          return { ok: true, note };
        }
        return { ok: false, note: "no prologue prompt is available yet; wait for the beat to play" };
      case "move_to":
        if (beat.mode === "cinematic") {
          return { ok: true, note: "a cutscene is playing — the scene moves itself; use wait" };
        }
        return this.queueMoveTo(action);
      case "dodge":
        if (beat.id !== "border") return { ok: false, note: "Phase-Step is unavailable during this scene" };
        this.rollBuffer = 0.22;
        return { ok: true, note: "Phase-Step queued" };
      case "jump":
        return beat.id === "border" && this.player.jump(this.ctx(0))
          ? { ok: true, note: "jumped" } : { ok: false, note: "jump is unavailable here" };
      default:
        return { ok: false, note: "that action is unavailable during the opening sequence" };
    }
  }

  // ----------------------------------------------------------------- events
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    // While the benchmark has control, leave only pause/map available to the
    // player. The benchmark panel itself remains usable for Return Control.
    if (this.agentControlActive && k !== "escape" && k !== "m") return;
    this.keys[k] = true;
    if (!this.started) return; // title screen: no gameplay hotkeys
    if (this.dialogue && (k === "f" || k === " " || k === "enter")) {
      e.preventDefault();
      this.advanceDialogue();
      return;
    }
    if (this.dialogue) return; // a conversation owns the screen — hotkeys stay inert
    if (k === "escape") {
      e.preventDefault();
      if (this.mapOpen) this.toggleMap();
      else if (this.journalOpen) this.toggleJournal();
      else if (!this.victoryShown) this.setPaused(!this.paused);
      return;
    }
    if (this.epiloguePhase === "active") {
      if (k === "f") this.interactBuffer = 0.3;
      return;
    }
    // Paused / dead / victory: don't buffer a roll or drink a flask for later.
    if (this.paused || this.dead || this.victoryShown) return;
    // The Long Fall is a cinematic — only the talk key survives it
    if (this.prologueActive && !this.prologueComplete) {
      if (k === "f") this.interactBuffer = 0.3;
      if (k === " " && PROLOGUE_BEATS[this.prologueIdx].id === "border") { this.rollBuffer = 0.22; e.preventDefault(); }
      if (k === "x" && PROLOGUE_BEATS[this.prologueIdx].id === "border") this.player.jump(this.ctx(0));
      return;
    }
    if (k === " ") { this.rollBuffer = 0.22; e.preventDefault(); }
    if (k === "e") this.heavyBuffer = 0.22;
    if (k === "q") this.castBuffer = 0.22;
    if (k === "r") this.healBuffer = 0.22;
    if (k === "f") this.interactBuffer = 0.3;
    if (k === "tab") { e.preventDefault(); this.toggleLock(); }
    if (k === "h" && DEV_BUILD) this.toggleGodMode(); // the mercy key — development only
    if (k === "m") this.toggleMap();
    if (k === "n") this.toggleJournal();
    if (k === "1") this.requestWeapon("greatsword");
    if (k === "2") this.requestWeapon("twinblades");
    if (k === "3") this.requestWeapon("halberd");
    if (k === "4") this.equipRelicSlot(0);
    if (k === "5") this.equipRelicSlot(1);
    if (k === "g") this.fireGrapple();
    if (k === "c") this.fireAshBurst();
    if (k === "b") this.replaceFilter();
    if (k === "x") this.player.jump(this.ctx(0));
    if (k === "v") {
      if (this.player.activateOverdrive(this.ctx(0))) this.showBanner("CORE OVERDRIVE", "Suit output boosted for 15 seconds");
    }
  };

  switchWeapon(kind: string, persist = true): boolean {
    if (this.prologueActive && !this.prologueComplete) return false;
    const p = this.player;
    if (p.weaponKind === kind) return true;
    if (!p.canAct() || (isRelic(kind) && (!p.relicsOwned.has(kind) || !this.relicSlots.includes(kind as (typeof RELIC_IDS)[number])))) return false;
    const cfg = WEAPON_CONFIG[kind];
    if (!cfg) return false;
    // swap the rig — free the old one first so GPU buffers don't accumulate
    const disposeTree = (root: THREE.Object3D) => {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) (mat as THREE.Material)?.dispose?.();
      });
    };
    const oldRoot = p.rig.root;
    disposeTree(oldRoot);
    this.world.scene.remove(oldRoot);
    const newRig = p.buildWeaponRig(kind);
    this.kinterBackBlade = dressKinter(newRig).backBlade;
    this.kinterBackBlade.visible = kind !== "greatsword";
    p.adoptRig(newRig, kind);
    this.world.scene.add(newRig.root);
    // retint the trail to match the weapon
    if (p.trail) {
      disposeTree(p.trail.mesh);
      this.world.scene.remove(p.trail.mesh);
    }
    p.trail = new SwordTrail(kind === "twinblades" ? 18 : 24, cfg.trailColor);
    this.world.scene.add(p.trail.mesh);
    audio.swing(0.7);
    this.showBanner(cfg.label.toUpperCase(), "Weapon drawn");
    if (persist && this.started && this.prologueComplete) this.saveGame();
    this.emit();
    return true;
  }

  private requestWeapon(kind: string): boolean {
    if (!WEAPON_CONFIG[kind] || (isRelic(kind) && (!this.player.relicsOwned.has(kind) || !this.relicSlots.includes(kind as (typeof RELIC_IDS)[number])))) return false;
    if (this.player.weaponKind === kind) { this.pendingRelicEquip = null; return true; }
    if (this.player.canAct()) { this.pendingRelicEquip = null; return this.switchWeapon(kind); }
    this.pendingRelicEquip = kind;
    this.showBanner("WEAPON QUEUED", `${WEAPON_CONFIG[kind].label} · equipped after the current move`);
    this.emit();
    return true;
  }

  private equipRelicSlot(slot: 0 | 1): boolean {
    const id = this.relicSlots[slot];
    if (!id) {
      this.showBanner("RELIC SLOT EMPTY", "Pause and open Equipment to assign a collected relic");
      this.emit();
      return false;
    }
    return this.requestWeapon(id);
  }

  setRelicSlot(slot: 0 | 1, id: string | null): boolean {
    if (!this.paused || (slot !== 0 && slot !== 1)) return false;
    const next = assignRelicSlot(this.relicSlots, slot, id, this.player.relicsOwned);
    if (!next) return false;
    this.relicSlots = next;
    if (isRelic(this.player.weaponKind) && !next.includes(this.player.weaponKind as (typeof RELIC_IDS)[number])) this.requestWeapon("greatsword");
    if (this.pendingRelicEquip && isRelic(this.pendingRelicEquip) && !next.includes(this.pendingRelicEquip as (typeof RELIC_IDS)[number])) this.pendingRelicEquip = "greatsword";
    this.saveGame();
    this.emit();
    return true;
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
  private onKeyUp = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = false; };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.started || this.paused) return;
    if (this.agentControlActive) return;
    // Clicks on the map / victory overlays must not re-lock the pointer or
    // queue an attack underneath the UI.
    if (this.mapOpen || this.victoryShown) return;
    if (this.prologueActive && !this.prologueComplete) {
      // During the opening only dialogue and interaction prompts respond.
      if (e.button === 0) {
        if (this.dialogue) this.advanceDialogue();
        else if (this.prologuePrompt) this.satisfyPrologueAwait();
      }
      return;
    }
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
    if (this.agentControlActive || document.pointerLockElement !== this.renderer.domElement) return;
    const s = 0.0022;
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
    if (!this.started || this.paused || this.mapOpen || this.journalOpen || this.dead || this.victoryShown || this.agentControlActive) return;
    if (document.pointerLockElement !== this.renderer.domElement) this.setPaused(true);
  };

  setPaused(v: boolean, opts?: { pointerLock?: boolean }) {
    const wantLock = opts?.pointerLock ?? true;
    this.paused = v;
    if (v) document.exitPointerLock?.();
    else if (this.started && wantLock) this.requestPointerLock();
    this.emit();
  }

  start() {
    this.started = true;
    this.paused = false;
    audio.resume();
    // A fresh campaign opens on Kinter's arrival — the title banner would cut it.
    if (!this.prologueStarted && !this.prologueComplete) {
      this.beginPrologue();
    } else {
      this.requestPointerLock();
      this.showBanner("THE ASHVEIL", "Lands Between the Sundered Flame");
    }
    this.emit();
  }

  dismissVictory() {
    this.clearEpilogueCast();
    this.epiloguePhase = null;
    if (this.player.rig.weapon) this.player.rig.weapon.visible = true;
    this.victoryShown = false;
    this.victoryDismissed = true;
    this.campaignCompleted = true;
    this.postgame = true;
    this.victory = false;
    this.questStage = 3;
    this.resetEnemies();
    // Postgame is a pre-Citadel snapshot: restore the ward for a replay.
    this.pylonsBrokenFromLoad = 0;
    this.pylonKills = 0;
    for (const pylon of this.pylons) {
      pylon.dead = false;
      pylon.hp = pylon.maxHp;
      pylon.dissolve = 0;
      pylon.rig.root.visible = true;
      for (const material of pylon.rig.flashMats) { material.opacity = 1; material.transparent = false; }
      for (const material of pylon.rig.glowMats) (material as THREE.MeshBasicMaterial).opacity = 0.9;
      pylon.setState("idle", 1);
    }
    this.placeAtGrace(WORLD.graceAt.x, WORLD.graceAt.z);
    this.activeGraceIdx = 0;
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.fp = this.player.maxFp;
    this.player.flasks = this.player.maxFlasks;
    this.player.filterCondition = 100;
    this.filterDamageTimer = 0;
    this.syncWorldReactions(); // postgame returns to the pre-Citadel world
    this.syncBeacon();
    this.updateCamera(0, true);
    this.saveGame();
    this.requestPointerLock();
    this.showBanner("BEFORE THE CITADEL", "Explore the Ashveil and challenge Malenkar again");
    this.emit();
  }

  quitToTitle() {
    this.saveGame(); // the vigil persists — tuck it into the ledger
    this.player.clearAfterimage(this.world.scene);
    this.player.cancelGrapple();
    this.clearEpilogueCast();
    this.epiloguePhase = null;
    if (this.player.rig.weapon) this.player.rig.weapon.visible = true;
    this.clearKingTrial();
    if (this.prologueActive && !this.prologueComplete) {
      this.prologueActive = false;
      this.prologueStarted = false;
      this.prologueComplete = false;
      this.prologuePrompt = null;
      this.prologueSubtitle = null;
      this.prologueCueTimer = 0;
      this.prologueCaptureTimer = 0;
      this.prologueCaptureElapsed = 0;
      this.prologueFade = 0;
      this.prologueElapsed = 0;
      this.prologueBeatTime = 0;
      this.prologueShotTime = 0;
      this.prologueAwaitDone.clear();
      this.prologueCueFired.clear();
      this.dialogue = null;
      this.dialogueKind = "intro";
      this.prompt = null;
      this.restorePrologueEnvironment();
      this.player.pos.set(0, this.world.keep.base, 112.5);
      this.player.vel.set(0, 0, 0);
      this.player.vertical = 0;
      this.player.yaw = 0;
      this.player.rig.root.position.copy(this.player.pos);
      this.player.rig.root.rotation.y = 0;
      this.syncBeacon();
    }
    // Cross-session hygiene: no overlay or control state survives the title.
    this.dialogue = null;
    this.dialogueKind = "intro";
    this.prompt = null;
    this.mapOpen = false;
    this.dead = false;
    this.respawnTimer = 0;
    this.deathFx = 0;
    this.victory = false;
    this.victoryShown = false;
    this.victoryDismissed = false;
    this.postgame = false;
    this.campaignCompleted = false;
    this.lockTarget = null;
    this.agentGuardRemaining = 0;
    this.setAgentControl(false);
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
  private toggleLock() {
    if (this.prologueActive && !this.prologueComplete) return;
    if (this.lockTarget) { this.lockTarget = null; this.camTargetDist = 6.4; audio.ui("hover"); return; }
    let best: NPC | null = null;
    let bestScore = -Infinity;
    // View/forward direction is camYaw + PI (the camera sits BEHIND the player).
    const fwd = new THREE.Vector3(Math.sin(this.camYaw + Math.PI), 0, Math.cos(this.camYaw + Math.PI));
    const to = new THREE.Vector3();
    for (const e of this.enemies) {
      if (e.dead || e.dormant) continue;
      to.subVectors(e.pos, this.player.pos).setY(0);
      const d = to.length();
      if (d > 42) continue;
      to.normalize();
      const dot = to.dot(fwd);
      if (dot < 0.1) continue;
      const score = dot * 2.4 - d * 0.05;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    this.lockTarget = best;
    if (best) audio.ui("click");
  }

  showBanner(title: string, sub?: string) {
    this.bannerId++;
    this.banner = { title, sub, id: this.bannerId };
    this.bannerT = 4.2;
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
      grappleAnchors: this.world.grappleAnchors,
      grappleEnemy: this.lockTarget,
      lineBlocked: (from, to) => lineBlockedByCircles(from, to, this.world.colliders),
      resolve: (x, z, r) => this.world.resolveColliders(x, z, r),
      shake: (a, d = 0.3) => { this.shakeAmt = Math.max(this.shakeAmt, a); this.shakeT = Math.max(this.shakeT, d); },
      hitStop: (d) => { this.hitStopT = Math.max(this.hitStopT, d); },
      popup: (pos, text, kind) => this.addPopup(pos, text, kind),
      spawnProjectile: (o) => this.spawnProjectile(o),
      onKill: (npc) => this.handleKill(npc),
      onTrialHit: (npc) => this.onKingTrialHit(npc),
      onTrialParry: (npc) => {
        if (npc === this.trialActor && this.trialPhase === "parry") this.finishKingTrial();
      },
      onBossThreshold: (npc) => {
        if (npc !== this.boss || this.aldrichChargeInDone || npc.hp > npc.maxHp * 0.25) return false;
        if (!this.mainPhase2Done) {
          npc.hp = npc.maxHp * 0.5;
          this.enterMalenkarPhase2();
          return true;
        }
        npc.hp = Math.max(1, npc.hp);
        this.startAldrichChargeIn();
        return true;
      },
      onPlayerDeath: () => this.handlePlayerDeath(),
      onLethalPlayerDamage: () => {
        if (!this.trialActor) return false;
        this.player.hp = Math.max(1, Math.round(this.player.maxHp * 0.6));
        this.player.stamina = this.player.maxStamina;
        this.player.setState("idle", 0.1);
        this.player.invuln = 1.5;
        this.showBanner("THE KING HOLDS HIS BLADE", "Rise, Kinter. This is a trial, not an execution.");
        return true;
      },
      slowmo: (scale, dur) => { this.slowmoScale = scale; this.slowmoT = dur; },
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
    // Hard cap — meteor volleys are 9; a cast-spam burst shouldn't flood the scene
    if (this.projectiles.length >= 56) {
      const oldest = this.projectiles.shift()!;
      if (oldest.lightIdx >= 0) this.releaseLight(oldest.lightIdx);
      this.world.scene.remove(oldest.mesh);
      oldest.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        m.material && (m.material as THREE.Material).dispose();
      });
    }
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
      pierce: !!o.pierce,
      pierceHit: new Set(),
    });
  }

  /** Shared direct-damage path with feedback — used by piercing shots and retaliations. */
  private damageWithPopup(npc: NPC, dmg: number, fromPos: THREE.Vector3) {
    const ctx = this.ctx(0.016);
    npc.damage(dmg, fromPos, ctx, 34);
    this.addPopup(npc.pos.clone().setY(npc.pos.y + 2.6), Math.round(dmg).toString(), "magic");
    this.particles.emit({ x: npc.pos.x, y: npc.pos.y + 1, z: npc.pos.z, count: 12, speed: 4, size: 6, life: 0.35, color: 0xffd98a, grav: -4 });
    audio.hit("flesh");
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
    // shake scales with distance — a meteor storm across the arena shouldn't rattle the camera flat
    const shakeDist = this.player.pos.distanceTo(pos);
    const shakeScale = Math.max(0, 1 - shakeDist / 60);
    this.shakeAmt = Math.max(this.shakeAmt, 0.7 * shakeScale);
    this.shakeT = Math.max(this.shakeT, 0.35 * shakeScale);

    if (p.explode > 0) {
      if (p.fromPlayer) {
        const c = new THREE.Vector3();
        for (const e of this.enemies) {
          if (e.dead || e.dormant) continue;
          e.worldCenter(c);
          const d = c.distanceTo(pos);
          if (d < p.explode + e.radius) {
            const dmg = p.damage * (1 - (d / (p.explode + e.radius)) * 0.5);
            e.damage(dmg, pos, ctx, 34);
            this.addPopup(c.clone().setY(c.y + 0.6), Math.round(dmg).toString(), "magic");
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
      // low fliers get stopped by solid geometry; meteors arc over walls — range-limited below
      this.particles.emit({
        x: pos.x, y: pos.y, z: pos.z, count: 2, speed: 1.2, size: 7, life: 0.42, color: p.color, grav: 0.4, spread: p.radius,
      });

      let hit = false;
      let pierceTarget: NPC | null = null;
      if (pos.y <= terrainHeight(pos.x, pos.z) + p.radius * 0.5) hit = true;
      if (!hit) {
        if (p.fromPlayer) {
          for (const e of this.enemies) {
            if (e.dead || e.dormant || p.pierceHit.has(e)) continue; // don't fizzle bolts on the sleeping Act IV boss
            e.worldCenter(c);
            if (c.distanceTo(pos) < e.radius + p.radius + 0.35) {
              if (p.pierce) pierceTarget = e;
              else hit = true;
              break;
            }
          }
        } else {
          if (!this.player.dead) { // don't waste an explosion on a corpse
            this.player.worldCenter(c);
            if (c.distanceTo(pos) < this.player.radius + p.radius + 0.25) hit = true;
          }
        }
      }
      if (pierceTarget) {
        // Luminous Arc tears straight through — full damage, no detonation
        p.pierceHit.add(pierceTarget);
        this.damageWithPopup(pierceTarget, p.damage, pos);
      }
      // low fliers get stopped by solid geometry; meteors arc over walls
      if (!hit && !pierceTarget && pos.y - terrainHeight(pos.x, pos.z) < 6) {
        const [nx, nz] = this.world.resolveColliders(pos.x, pos.z, p.radius);
        if (nx !== pos.x || nz !== pos.z) hit = true;
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

    // ---- the side ledger — cull tallies tick mid-battle ----
    for (const qid of this.questsActive) {
      const def = QUEST_BY_ID[qid];
      if (def && def.kind === "cull" && cullKillCounts(qid, npc.questCullId)) {
        this.questKills[qid] = Math.min(def.count, (this.questKills[qid] ?? 0) + 1);
      }
    }
    // ---- marks fall to the blade that raised them ----
    for (const [qid, mark] of this.questMarks) {
      if (mark === npc) {
        this.questMarks.delete(qid);
        const def = QUEST_BY_ID[qid];
        if (def) this.completeQuest(def, this.giverName(def.giver));
        break;
      }
    }

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
      this.saveGame();
      return;
    }
    if (npc.tutorialTag === "pylon") {
      // a conduit of the warlord's ward — break all three and he is mortal
      this.pylonKills++;
      this.particles.emit({ x: npc.pos.x, y: npc.pos.y + 2, z: npc.pos.z, count: 90, speed: 8, size: 8, life: 0.9, color: 0x3aa0ff, grav: -1 });
      this.waves.spawn(npc.pos.clone().setY(npc.pos.y + 0.5), 0x3aa0ff, 7, 0.7);
      audio.explosion();
      const boss = this.boss;
      if (this.pylonKills >= 3) {
        this.showBanner("THE WARD SHATTERS", "the conduits gutter out — Malenkar belongs to you now");
        if (!boss.dead) boss.setState("stagger", 2.6);
        this.waves.spawn(boss.pos.clone().setY(boss.pos.y + 1), 0x9fd8ff, 11, 0.9);
      } else {
        this.showBanner(`CONDUIT DOWN — ${this.pylonKills}/3`, "the ward drinks less of your fury");
      }
      this.saveGame();
      return;
    }
    if (npc.tutorialTag === "arcane") {
      this.effigyKills.arcane++;
      if (this.questStage === 2) {
        this.questStage = 3;
        this.syncBeacon();
        this.showBanner("THE WARD IS BROKEN", "Now take the road south");
        audio.grace();
        this.unlockEntries("trial_complete");
        this.saveGame();
      }
      return;
    }
    if (npc.kind === "boss") {
      // ---- Regional (Choir) bosses — Act II progression ----
      if (npc.bossRole === "shard") {
        this.shardsCollected = Math.min(8, this.shardsCollected + 1);
        this.player.shards = this.shardsCollected; // HUD shard count
        if (npc.shardId) this.player.shardPowers.add(npc.shardId); // unlocks Kinter's awakened power
        this.showBanner(`SHARD OF LIGHT — ${this.shardsCollected}/8`, `${npc.name}  ·  +${npc.runeValue.toLocaleString()} runes`);
        this.addPopup(npc.pos.clone().setY(npc.pos.y + 2.6), "+" + npc.runeValue, "runes");
        audio.grace();
        audio.setIntensity(0);
        if (this.shardsCollected >= 8) {
          this.showBanner("THE RAEKU IS MAXIMIZED", "Aldrich will march on the citadel — bring the full storm");
        }
        this.bossAwake = false; // re-arm boss music for the next fight
        const s = this.shardsCollected;
        if (s === 2) this.unlockEntries("guardian_2");
        else if (s === 4) this.unlockEntries("guardian_4");
        else if (s === 6) this.unlockEntries("guardian_6");
        else if (s >= 8) this.unlockEntries("guardian_8");
        this.syncBeacon();
        this.syncWorldReactions();
        this.saveGame();
        return;
      }

      // ---- Malenkar (main) — the true finale ----
      const rad = this.endingPath === "radiance" || this.shardsCollected >= 8;
      this.endingPath = rad ? "radiance" : "hollow";
      // the warlord's ward dies with him — sweep the conduits from the field
      for (const p of this.pylons) {
        if (p.dead) continue;
        p.hp = 0;
        p.dead = true;
        p.setState("death", 0.01);
        p.dissolve = 1;
        p.rig.root.visible = false;
      }
      this.victory = true;
      this.campaignCompleted = true;
      this.postgame = false;
      this.victoryDismissed = false;
      this.epiloguePhase = "pending";
      this.epilogueStage = 0;
      this.victoryAt = this.time;
      this.questStage = 9;
      this.unlockEntries("victory");
      this.syncBeacon();
      this.showBanner("MALENKAR FALLS", rad ? "THE RADIANCE OF UOKA — the crown changes heads" : "THE HOLLOW CHARGE — bought with a king's blood");
      audio.setIntensity(0);
      this.bossAwake = false;
      // The coronation monologue — delivered here, in the ash, over the body.
      if (!this.dialogue) this.startDialogue(rad ? "epilogueRadiante" : "epilogueHollow");
      this.saveGame();
    } else {
      this.addPopup(npc.pos.clone().setY(npc.pos.y + 2), "+" + npc.runeValue, "runes");
      this.saveGame();
    }
  }

  private villagerLines(data: (typeof VILLAGE_NPCS)[number]): string[] {
    const home = this.villages.find((v) => v.id === data.village);
    if (!home) return data.line.slice();
    const standing = this.settlementStanding(home);
    const deeds = QUESTS.filter((q) => this.questsDone.has(q.id) && this.questHome(q.giver) === home.id).length;
    const reaction: string[] = [];
    switch (data.id) {
      case "brann":
        if (this.questsDone.has("the-sludge-lurkers")) {
          reaction.push(this.questsDone.has("the-skiff-passage")
            ? "Hear that pole knock against the hull? Your marked channel and an open dock. The first free skiff in nine years."
            : "The Tar King's dead and my hull is loose. Jory's eastern chart will give us somewhere safe to pole.");
        }
        break;
      case "jory":
        if (this.questsDone.has("the-skiff-passage")) {
          reaction.push(this.questsDone.has("the-sludge-lurkers")
            ? "Brann ran the whole channel on your marks. Didn't so much as scuff the bow. That line's a road now."
            : "The stones are marked and the channel holds. Once Brann clears the Tar King, that line becomes a road.");
        }
        break;
      case "sol":
        if (this.questsDone.has("the-lower-pumps")) reaction.push("Listen to the flywheels. Both pumps are drawing sweet water again; no static left in the current.");
        break;
      case "holt":
        if (this.questsDone.has("the-storm-hawks")) reaction.push("The cabin's crossing to Gale-Nest and back without a shriek from the winch. You gave us back the sky-road.");
        break;
    }
    if (deeds > 0) reaction.push(`${home.name} remembers what you did for us. That debt does not blow away with the ash.`);
    if (standing >= 60) reaction.push("Steel, shelter, a guide through the waste — ask us first. You are not an outlander at this fire anymore.");
    const story = REGIONAL_STORIES.find((item) => item.settlement === home.id && this.questsDone.has(`region-${item.id}-guardian`));
    if (story && data.id !== story.giver) reaction.push(...story.aftermath);
    if (this.shardsCollected >= 8) reaction.push("The whole capital shines on the horizon. People are making plans for after the war. Real ones.");
    else if (this.shardsCollected >= 4) reaction.push("The keep's upper windows are lit again. My people saw them from here.");
    else if (this.shardsCollected >= 2) reaction.push("The gate lamps burn steadier now. Even this far out, we noticed.");
    return [...reaction, ...data.line];
  }

  /** Speak with a frontier character. Some of them pay out; some just talk. */
  private talkToFrontier(npc: { id: string; name: string; title: string }) {
    // ---- the named souls of the settlements ----
    // frontier special-cases route through the quest flow when one's pending
    if (npc.id.startsWith("v_")) {
      const data = VILLAGE_NPC_BY_ID[npc.id.slice(2)];
      if (!data) {
        this.dialogue = { speaker: npc.name, lines: ["Safe roads, outlander."], idx: 0 };
        this.dialogueKind = "lore";
        this.emit();
        return;
      }
      const firstVisit = !this.villageNpcClaimed.has(data.id);
      if (firstVisit) {
        this.villageNpcClaimed.add(data.id);
        if (data.giftRunes) {
          this.player.runes += data.giftRunes;
          this.addPopup(this.player.pos.clone().setY(this.player.pos.y + 2.1), `+${data.giftRunes}`, "runes");
        }
        if (data.giftFlasks) {
          this.player.flasks = Math.min(this.player.maxFlasks, this.player.flasks + data.giftFlasks);
        }
        if (data.blessing) {
          this.player.sanctuaryBlessing = true;
          this.player.maxHp += 25;
          this.player.hp = this.player.maxHp;
          this.showBanner("THE SANCTUARY'S BLESSING", "+25 Vigor — the keepers shore up what the war hollowed out");
          this.unlockEntries("sanctuary_blessed");
          audio.grace();
        }
      }
      if (this.promptQuestFor(data.id, data.name)) return;
      // no outstanding business — plain flavor
      this.dialogue = { speaker: data.name, speakers: [data.name], lines: this.villagerLines(data), idx: 0 };
      this.dialogueKind = "villager";
      audio.ui("click");
      this.saveGame();
      this.emit();
      return;
    }
    const id = npc.id;
    if (id === "lyekai") {
      const pending = [3, 6].find((m) => this.shardsCollected >= m && !this.lyekaiRelationsSpoken.has(m));
      this.startDialogue(pending === undefined ? "lyekaiDuty" : `lyekaiRelations${pending}`);
      return;
    }
    if (id === "torin") {
      if (!this.torinPaid) {
        this.torinPaid = true;
        this.player.runes += 300;
        this.addPopup(this.player.pos.clone().setY(this.player.pos.y + 2.1), "+300", "runes");
        audio.ui("click");
        this.startDialogue("torinBought");
        this.saveGame();
        return;
      }
      if (this.promptQuestFor("torin", "TORIN")) return;
      this.startDialogue("torin");
      return;
    }
    if (id === "oren") {
      if (this.promptQuestFor("oren", "OREN")) return;
      this.startDialogue("oren");
      return;
    }
    if (id === "bram") {
      const due = this.shardsCollected - this.bramPaid;
      if (due > 0) {
        this.bramPaid = this.shardsCollected;
        const payout = due * 400;
        this.player.runes += payout;
        this.addPopup(this.player.pos.clone().setY(this.player.pos.y + 2.1), `+${payout.toLocaleString()}`, "runes");
        audio.grace();
        this.startDialogue("bramPaid");
        this.saveGame();
        return;
      }
      this.startDialogue("bram");
      return;
    }
    if (id === "pip") {
      // Pip teaches Kinter to read the resonator — the guardians show on the map.
      if (!this.shardBeaconKnown) {
        this.shardBeaconKnown = true;
        this.startDialogue("pip");
        this.saveGame();
        return;
      }
      if (this.promptQuestFor("pip", "PIP")) return;
      this.startDialogue("pip");
      return;
    }
    if (id === "milo") {
      // Milo brews filter canisters — two flasks and a little coin.
      if (!this.miloPaid) {
        this.miloPaid = true;
        this.player.runes += 250;
        this.player.flasks = Math.min(this.player.maxFlasks, this.player.flasks + 2);
        this.addPopup(this.player.pos.clone().setY(this.player.pos.y + 2.1), "+2 FLASKS", "heal");
        // Milo boils the ash out of your filters — three charges of Ash Burst
        this.player.ashBursts = Math.min(this.player.maxAshBursts, this.player.ashBursts + 3);
        audio.ui("click");
        this.startDialogue("miloBought");
        this.saveGame();
        return;
      }
      if (this.promptQuestFor("milo", "MILO")) return;
      this.startDialogue("milo");
      return;
    }
    if (id === "vesper") {
      // Vesper's buggy opens the long roads — coin for every guardian felled.
      const due = this.shardsCollected - this.vesperPaid;
      if (due > 0) {
        this.vesperPaid = this.shardsCollected;
        const payout = due * 300;
        this.player.runes += payout;
        this.addPopup(this.player.pos.clone().setY(this.player.pos.y + 2.1), `+${payout.toLocaleString()}`, "runes");
        audio.grace();
        this.startDialogue("vesperPaid");
        this.saveGame();
        return;
      }
      this.startDialogue("vesper");
      return;
    }
    this.startDialogue(id);
  }

  private handlePlayerDeath() {
    // The opening is damage-proof by design (every HP source floors it); make
    // that structural so no script can dead-end the prologue into a respawn.
    if (this.prologueActive && !this.prologueComplete) {
      this.player.hp = Math.max(this.player.hp, 1);
      return;
    }
    this.player.pikeVault = false;
    this.player.clearAfterimage(this.world.scene);
    this.player.cancelGrapple();
    this.player.orbitSawT = 0;
    this.player.overheatT = 0;
    this.player.coreRegenDelay = 0;
    this.player.overdriveT = 0;
    this.player.overdriveCooldown = 0;
    this.player.relicHeat = 0;
    this.dead = true;
    this.dialogue = null;
    this.respawnTimer = 5.2;
    // drop bloodstain
    this.clearBloodstain();
    if (this.player.runes > 0) {
      this.createBloodstain(this.player.pos.clone().setY(this.player.pos.y + 0.6), this.player.runes);
    }
    this.player.runes = 0;
    this.saveGame();
    this.emit();
  }

  private clearBloodstain() {
    if (!this.bloodstain) return;
    const { mesh } = this.bloodstain;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    this.world.scene.remove(mesh);
    this.bloodstain = null;
  }

  private createBloodstain(pos: THREE.Vector3, runes: number) {
    this.clearBloodstain();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.copy(pos);
    this.world.scene.add(mesh);
    this.bloodstain = { pos: pos.clone(), runes, mesh };
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.pikeVault = false;
    p.orbitSawT = 0;
    p.overheatT = 0;
    p.coreRegenDelay = 0;
    p.overdriveT = 0;
    p.overdriveCooldown = 0;
    p.relicHeat = 0;
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.fp = p.maxFp;
    p.flasks = p.maxFlasks;
    p.filterCondition = 100;
    this.filterDamageTimer = 0;
    p.poise = 0;
    p.invuln = 1.2;
    p.setState("grace", 1.6);
    const grace = this.world.graceSites[this.activeGraceIdx] ?? this.world.graceSites[0];
    this.placeAtGrace(grace.pos.x, grace.pos.z);
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
    this.saveGame();
    this.emit();
  }

  restAtGrace() {
    const p = this.player;
    p.clearAfterimage(this.world.scene);
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.fp = p.maxFp;
    p.flasks = p.maxFlasks;
    p.ashBursts = p.maxAshBursts;
    p.filterCondition = 100;
    this.filterDamageTimer = 0;
    p.relicHeat = 0;
    p.overheatT = 0;
    p.coreRegenDelay = 0;
    p.overdriveT = 0;
    p.overdriveCooldown = 0;
    p.pikeVault = false;
    p.orbitSawT = 0;
    this.resetEnemies();
    this.graceFx = 1;
    audio.grace();
    audio.setIntensity(0);
    this.bossAwake = false;
    this.lockTarget = null; // teleporting with a locked target yanked the camera across the map
    this.showBanner("GRACE RESTORED", "Foes have returned to the ash · canisters refilled");
    this.saveGame();
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
    this.saveGame();
  }

  /** Keep the camera outside the Grace's large translucent halo after travel. */
  private placeAtGrace(x: number, z: number) {
    this.player.cancelGrapple();
    // Both the player and the camera boom need room. A single fixed offset can
    // fall between overlapping props and force the camera into Kinter's body.
    let px = x, pz = z - 5.5, yaw = Math.PI;
    let found = false;
    for (const distance of [6, 9, 12]) {
      for (let i = 0; i < 16; i++) {
        const angle = Math.PI + i * Math.PI / 8;
        const dx = Math.sin(angle), dz = Math.cos(angle);
        const tx = x + dx * distance, tz = z + dz * distance;
        if (Math.abs(tx) > WORLD.wall - 8 || Math.abs(tz) > WORLD.wall - 8) continue;
        const clear = [0, 2, 4, 6].every((step) => this.world.colliders.every((c) =>
          Math.hypot(tx + dx * step - c.x, tz + dz * step - c.z) >= c.r + 0.8));
        if (!clear) continue;
        px = tx; pz = tz; yaw = angle; found = true;
        break;
      }
      if (found) break;
    }
    if (!found) [px, pz] = this.world.resolveColliders(px, pz, this.player.radius);
    this.player.pos.set(px, terrainHeight(px, pz), pz);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = yaw + Math.PI;
    this.lockTarget = null;
    this.camYaw = yaw;
    this.camPitch = 0.16;
    this.camTargetDist = 6.4;
    this.updateCamera(0, true);
  }

  /** Fast travel to a discovered grace by index. */
  fastTravel(idx: number): boolean {
    if (this.epiloguePhase === "active") return false;
    if (this.prologueActive && !this.prologueComplete) return false;
    if (!this.discoveredGraces.has(idx) || !this.world.graceSites[idx]) return false;
    if (this.inCombat()) return false;
    const site = this.world.graceSites[idx];
    const p = this.player;
    p.clearAfterimage(this.world.scene);
    // fast travel never strands a vault mid-arc
    p.pikeVault = false;
    p.orbitSawT = 0;
    p.overheatT = 0;
    p.coreRegenDelay = 0;
    this.placeAtGrace(site.pos.x, site.pos.z);
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.fp = p.maxFp;
    p.flasks = p.maxFlasks;
    p.filterCondition = 100;
    this.filterDamageTimer = 0;
    this.activeGraceIdx = idx;
    this.mapOpen = false;
    this.resetEnemies();
    this.bossAwake = false;
    this.lockTarget = null;
    this.graceFx = 1;
    this.updateCamera(0, true);
    audio.grace();
    audio.setIntensity(0);
    this.showBanner("SPIRIT SPRING", "Arrived · " + site.name);
    if (!this.agentControlActive) this.requestPointerLock();
    this.saveGame();
    this.emit();
    return true;
  }

  private inCombat(): boolean {
    return this.enemies.some((enemy) => !enemy.dead && !enemy.dormant && enemy.aggro &&
      Math.hypot(enemy.pos.x - this.player.pos.x, enemy.pos.z - this.player.pos.z) < 45);
  }

  toggleMap() {
    if (!this.started || this.dead || this.paused || this.dialogue || this.victoryShown || this.journalOpen || (this.prologueActive && !this.prologueComplete)) return;
    if (this.epiloguePhase === "active") return;
    if (!this.mapOpen && this.inCombat()) {
      this.showBanner("TRAVEL UNAVAILABLE", "Leave combat before opening the map");
      this.emit();
      return;
    }
    this.mapOpen = !this.mapOpen;
    if (this.mapOpen) document.exitPointerLock?.();
    else if (!this.agentControlActive) this.requestPointerLock();
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
      this.saveGame();
    }
    this.dialogue = { speaker: text.title, lines: text.body, idx: 0 };
    this.dialogueKind = "lore";
    audio.ui("click");
    this.emit();
  }

  private resetEnemies() {
    // clear anything mid-flight so enemy fire can't land on a fresh life
    for (const p of this.projectiles) {
      if (p.lightIdx >= 0) this.releaseLight(p.lightIdx);
      this.world.scene.remove(p.mesh);
      p.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        m.material && (m.material as THREE.Material).dispose();
      });
    }
    this.projectiles.length = 0;
    for (const e of this.enemies) {
      e.cancelGuardianSignature(this.world.scene);
      if (e.kind === "boss" && this.victory) continue;
      if (e.kind === "boss" && e.bossRole === "shard" && e.dead) continue; // felled guardians stay felled
      if (e.questCullId && e.dead) continue; // each local target counts only once
      if (e.tutorialTag) continue; // felled effigies and conduits stay felled
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
      e.shieldDisarmedT = 0;
      if (e.rig.shield) e.rig.shield.visible = e.shieldEnabled;
      e.vel.set(0, 0, 0);
      e.setState("idle", 1);
      if (e.glowLight) e.glowLight.intensity = 6;
    }
    if (!this.victory) {
      this.resetFinaleCast();
      this.boss.pos.set(0, terrainHeight(0, -18), -18);
      this.boss.yaw = 0;
      this.boss.moveSpeed = 5.2;
      // per-attempt: the engine regrows its cables, the fight re-earns its ruin
      this.mainPhase2Done = false;
      if (this.preBossWeather) {
        this.world.setWeather(this.preBossWeather);
        this.preBossWeather = null;
      }
      if (this.world.citadelCables) this.world.citadelCables.visible = true;
      if (this.world.citadelBeam) this.world.citadelBeam.visible = true;
    }
    this.pylonKills = Math.max(this.pylonsBrokenFromLoad, this.pylons.filter((p) => p.dead).length);
  }

  /** A failed attempt or a postgame replay must be able to stage the charge again. */
  private resetFinaleCast() {
    this.aldrichChargeInDone = false;
    for (const guard of this.finaleGuards) {
      this.world.scene.remove(guard.root);
      const index = this.world.colliders.indexOf(guard.collider);
      if (index >= 0) this.world.colliders.splice(index, 1);
      guard.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) material.dispose();
      });
    }
    this.finaleGuards = [];
    const lyekai = this.frontierNpcs.get("lyekai");
    if (lyekai) lyekai.rig.root.visible = true;
    const king = WORLD.kingAt;
    this.kingPos.set(king.x, terrainHeight(king.x, king.z), king.z);
    this.kingYaw = Math.PI;
    this.king.root.position.copy(this.kingPos);
    this.king.root.rotation.y = this.kingYaw;
    this.king.root.visible = true;
    poseRig(this.king, { dt: 0.016, time: this.time, speed: 0, state: "idle", phase: 0.5, combo: 0 });
  }

  // ----------------------------------------------------------------- quests ---
  /** Whether the active quest's objective is met (not yet turned in). */
  private questReady(def: QuestDef): boolean {
    // completion paths differ per objective shape; only cull/collect/lore are
    // turned in at the giver. reach/mark/chain/deliverTo complete in-field.
    switch (def.kind) {
      case "cull": return (this.questKills[def.id] ?? 0) >= def.count;
      case "collect": return (this.collects[def.tag ?? ""] ?? 0) >= def.count;
      case "lore": return this.loreRead.size >= def.count;
      case "guardian": return !!def.guardianId && (this.player.shardPowers.has(def.guardianId) ||
        this.shardBosses.some((boss) => boss.shardId === def.guardianId && boss.dead));
      default: return false;
    }
  }

  /** Progress line for the HUD / journal, e.g. "3/6". */
  private questProgress(def: QuestDef): string {
    switch (def.kind) {
      case "cull": return `${Math.min(def.count, this.questKills[def.id] ?? 0)}/${def.count}`;
      case "collect": return `${Math.min(def.count, this.collects[def.tag ?? ""] ?? 0)}/${def.count}`;
      case "reach": return this.reachedSpots.has(def.id) ? "done" : "out there";
      case "lore": return `${Math.min(def.count, this.loreRead.size)}/${def.count}`;
      case "mark": return "hunt";
      case "chain": return `${this.chainDone[def.id] ?? 0}/${def.steps?.length ?? 0}`;
      case "deliverTo": return "deliver";
      case "guardian": return this.questsDone.has(def.id) ? "done" : this.questReady(def) ? "return to contact" : "hunt";
    }
  }

  private activeQuestMarkers(): HudState["map"]["questMarkers"] {
    const markers: HudState["map"]["questMarkers"] = [];
    for (const id of this.questsActive) {
      const def = QUEST_BY_ID[id];
      if (!def) continue;
      if (def.kind === "chain" && def.steps) {
        const step = def.steps[this.chainDone[id] ?? 0];
        if (step) markers.push({ id, name: `${def.name} · ${step.place}`, x: step.spot[0], z: step.spot[1] });
      } else if (def.kind === "guardian") {
        if (this.questReady(def)) {
          const home = this.villages.find((v) => v.id === this.questHome(def.giver));
          if (home) markers.push({ id, name: `${def.name} · return to ${this.giverName(def.giver)}`, x: home.x, z: home.z });
        } else {
          const boss = this.shardBosses.find((b) => b.shardId === def.guardianId);
          if (boss) markers.push({ id, name: def.name, x: boss.pos.x, z: boss.pos.z });
        }
      }
    }
    return markers;
  }

  /** Display name for a quest's giver. */
  private giverName(id: string): string {
    if (VILLAGE_NPC_BY_ID[id]) return VILLAGE_NPC_BY_ID[id].name;
    return { torin: "TORIN", pip: "PIP", milo: "MILO", oren: "OREN", bram: "BRAM", vesper: "VESPER" }[id] ?? "SOMEONE";
  }

  private questMarks = new Map<string, NPC>();
  private questCullEnemies = new Map<string, NPC[]>();
  private chainDone: Record<string, number> = {};
  private questStepMarkers: { id: string; group: THREE.Group; taken: boolean }[] = [];

  private spawnQuestMark(def: QuestDef) {
    if (def.kind !== "mark" || !def.mark) return;
    const m = new NPC(def.mark.kind);
    m.name = def.mark.name;
    m.maxHp = m.hp = def.mark.hp;
    m.runeValue = Math.round(def.reward.runes * 0.55);
    m.radius = 1.6;
    m.centerY = 1.15;
    m.aggroRange = 34;
    m.moveSpeed = 4.8;
    m.pos.set(def.mark.spot[0], terrainHeight(def.mark.spot[0], def.mark.spot[1]), def.mark.spot[1]);
    m.yaw = Math.random() * Math.PI * 2;
    m.scale = def.mark.scale;
    m.rig.root.scale.setScalar(def.mark.scale / 1.85);
    for (const mt of m.rig.flashMats) {
      mt.color.multiplyScalar(0.72);
      mt.color.offsetHSL(def.mark.tint, 0.07, -0.03);
    }
    this.world.scene.add(m.rig.root);
    this.enemies.push(m);
    this.questMarks.set(def.id, m);
  }

  /** Spawn only the remaining targets, so a saved partial cull is resumable. */
  private spawnRegionalCull(def: QuestDef) {
    const spec = REGIONAL_CULLS[def.id];
    if (def.kind !== "cull" || !spec || this.questCullEnemies.has(def.id)) return;
    const home = this.villages.find((v) => v.id === this.questHome(def.giver));
    if (!home) return;
    const killed = Math.max(0, Math.min(def.count, this.questKills[def.id] ?? 0));
    const encounter: NPC[] = [];
    for (let i = killed; i < def.count; i++) {
      const distance = 21 + (i % 3) * 5;
      let angle = (i * 2.399963229728653) + 0.7;
      let x = home.x, z = home.z;
      for (let attempt = 0; attempt < 16; attempt++) {
        angle = (i * 2.399963229728653) + 0.7 + attempt * Math.PI / 8;
        [x, z] = this.world.resolveColliders(home.x + Math.cos(angle) * distance, home.z + Math.sin(angle) * distance, 1);
        if (this.shardBosses.every((boss) => Math.hypot(x - boss.pos.x, z - boss.pos.z) > boss.aggroRange + 8)) break;
      }
      const enemy = new NPC(def.tag === "warden" ? "warden" : "wretch");
      enemy.name = spec.name;
      enemy.questCullId = def.id;
      enemy.runeValue = 45;
      enemy.aggroRange = 16;
      enemy.pos.set(x, terrainHeight(x, z), z);
      enemy.yaw = angle + Math.PI;
      enemy.rig.root.position.copy(enemy.pos);
      if (spec.form !== "humanoid") this.dressRegionalCreature(enemy, spec.form, spec.color);
      this.world.scene.add(enemy.rig.root);
      this.enemies.push(enemy);
      encounter.push(enemy);
    }
    this.questCullEnemies.set(def.id, encounter);
  }

  private dressRegionalCreature(enemy: NPC, form: "burrower" | "hawk", color: number) {
    // Keep the existing animated rig and hit detection, but replace its visible
    // human silhouette with a lightweight procedural regional creature.
    enemy.shieldEnabled = false;
    for (const child of enemy.rig.root.children) child.visible = false;
    const body = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: form === "hawk" ? 0.35 : 0.08 });
    const accent = new THREE.MeshBasicMaterial({ color: form === "hawk" ? 0x8ddcff : 0xffb36c });
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const part = new THREE.Mesh(geometry, material);
      part.position.set(x, y, z);
      body.add(part);
      return part;
    };
    if (form === "burrower") {
      mesh(new THREE.SphereGeometry(0.72, 8, 6), shell, 0, 0.65, 0).scale.set(1.2, 0.65, 1.5);
      mesh(new THREE.SphereGeometry(0.38, 8, 6), shell, 0, 0.65, 0.9);
      for (const side of [-1, 1]) {
        mesh(new THREE.SphereGeometry(0.08, 6, 4), accent, side * 0.18, 0.78, 1.19);
        for (const z of [-0.65, 0, 0.65]) {
          const leg = mesh(new THREE.CapsuleGeometry(0.09, 0.8, 2, 4), shell, side * 0.8, 0.38, z);
          leg.rotation.z = side * 1.0;
        }
      }
    } else {
      mesh(new THREE.SphereGeometry(0.45, 8, 6), shell, 0, 1.45, 0).scale.set(0.8, 0.8, 1.5);
      mesh(new THREE.ConeGeometry(0.18, 0.55, 5), accent, 0, 1.48, 0.9).rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const wing = mesh(new THREE.BoxGeometry(1.6, 0.1, 0.55), shell, side * 0.9, 1.55, 0);
        wing.rotation.z = side * 0.18;
      }
    }
    enemy.rig.root.add(body);
  }

  private clearRegionalCull(id: string) {
    const encounter = this.questCullEnemies.get(id);
    if (!encounter) return;
    const targets = new Set(encounter);
    if (this.lockTarget && targets.has(this.lockTarget)) this.lockTarget = null;
    this.enemies = this.enemies.filter((enemy) => !targets.has(enemy));
    for (const enemy of encounter) {
      this.world.scene.remove(enemy.rig.root);
      enemy.rig.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) material.dispose();
      });
    }
    this.questCullEnemies.delete(id);
  }

  private spawnChainMarkers(def: QuestDef) {
    if (def.kind !== "chain" || !def.steps) return;
    const done = this.chainDone[def.id] ?? 0;
    def.steps.forEach((step, i) => {
      if (i < done) return; // felled waypoints stay felled
      if (this.questStepMarkers.some((marker) => marker.id === `${step.id}:${def.id}` && !marker.taken)) return;
      const color = 0x7ae0ff;
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        new THREE.MeshStandardMaterial({ color: 0x16283a, emissive: color, emissiveIntensity: 2.6, metalness: 0.6, roughness: 0.3, flatShading: true }),
      );
      core.position.y = 1.25;
      g.add(core);
      const halo = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.position.y = 1.25;
      g.add(halo);
      const y = terrainHeight(step.spot[0], step.spot[1]);
      g.position.set(step.spot[0], y, step.spot[1]);
      this.world.scene.add(g);
      this.questStepMarkers.push({ id: step.id + ":" + def.id, group: g, taken: false });
    });
  }

  private activeDeliverToFor(npcId: string): QuestDef | null {
    for (const qid of this.questsActive) {
      const def = QUEST_BY_ID[qid];
      if (def && def.deliverTo === npcId) return def;
    }
    return null;
  }

  private activeQuestByGiver(id: string): QuestDef | null {
    for (const qid of this.questsActive) {
      const def = QUEST_BY_ID[qid];
      if (def && def.giver === id) return def;
    }
    return null;
  }

  private nextOfferableQuest(id: string): QuestDef | null {
    return QUESTS.find((q) => q.giver === id && !this.questsDone.has(q.id) && (!q.requires || this.questsDone.has(q.requires))) ?? null;
  }

  private acceptQuest(def: QuestDef, speakerName: string) {
    this.questsActive.add(def.id);
    this.spawnQuestMark(def);
    this.spawnChainMarkers(def);
    this.spawnRegionalCull(def);
    this.showBanner("NEW QUEST — " + def.name.toUpperCase(), def.hint);
    audio.grace();
    const lines = def.offer.slice();
    if (def.kind === "guardian" && this.questReady(def)) lines.push("You have already faced this guardian. Tell me what happened when you are ready.");
    this.dialogue = { speaker: speakerName, speakers: [speakerName], lines, idx: 0 };
    this.dialogueKind = "villager";
    this.saveGame();
    this.emit();
  }

  /** Shared quest flow for any speaker — deliveries first, then giver's business, then fresh offers. */
  private promptQuestFor(npcId: string, name: string): boolean {
    const deliverable = this.activeDeliverToFor(npcId);
    if (deliverable) { this.completeQuest(deliverable, name); return true; }
    const active = this.activeQuestByGiver(npcId);
    if (active) {
      if (this.questReady(active)) { this.completeQuest(active, name); return true; }
      this.dialogue = { speaker: name, speakers: [name], lines: active.reminder.slice(), idx: 0 };
      this.dialogueKind = "villager";
      audio.ui("click");
      this.emit();
      return true;
    }
    const offer = this.nextOfferableQuest(npcId);
    if (offer) { this.acceptQuest(offer, name); return true; }
    return false;
  }

  private completeQuestStep(def: QuestDef, step: NonNullable<QuestDef["steps"]>[number]) {
    const idx = (this.chainDone[def.id] ?? 0) + 1;
    this.chainDone[def.id] = idx;
    this.syncWorldReactions();
    const markerId = step.id + ":" + def.id;
    const marker = this.questStepMarkers.find((m) => m.id === markerId);
    if (marker) {
      marker.taken = true;
      this.world.scene.remove(marker.group);
      marker.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) (mat as THREE.Material).dispose();
      });
    }
    audio.grace();
    if (def.steps && idx >= def.steps.length) {
      this.completeQuest(def, step.text?.length ? "KINTER'S JOURNAL" : this.giverName(def.giver), step.text);
      return;
    }
    this.showBanner(step.place, `${idx}/${def.steps?.length ?? 0}`);
    if (step.text?.length) {
      this.dialogue = { speaker: "KINTER'S JOURNAL", lines: step.text.slice(), idx: 0 };
      this.dialogueKind = "villager";
    }
    this.saveGame();
    this.emit();
  }

  /** Unlock journal entries tagged with a milestone trigger. Silent banner unless fresh. */
  private unlockEntries(trigger: JournalTrigger) {
    const fresh: JournalEntry[] = [];
    for (const e of JOURNAL_ENTRIES) {
      if (e.trigger !== trigger || this.journalUnlocked.has(e.id)) continue;
      this.journalUnlocked.add(e.id);
      fresh.push(e);
    }
    if (fresh.length === 0) return;
    const title = fresh.length === 1 ? fresh[0].title.toUpperCase() : `${fresh.length} NEW WRITINGS`;
    this.showBanner(`JOURNAL ENTRY — ${title}`, "N — read it in your journal");
  }

  // ------------------------------------------------------- Shrines of Light
  /** How many claimed shrines grant a given blessing kind. */
  private shrineKindCount(kind: ShrineKind) {
    let n = 0;
    for (const id of this.shrinesClaimed) {
      if (SHRINE_BY_ID.get(id)?.kind === kind) n++;
    }
    return n;
  }

  /** Recompute every shrine-derived stat from base + blessings. */
  private recomputeShrineStats() {
    const p = this.player;
    p.maxHp = 140 + this.upgrades.vigor * 28 + (p.sanctuaryBlessing ? 25 : 0) + this.shrineKindCount("vigor") * 8;
    p.maxStamina = 120 + this.upgrades.vigor * 12 + this.shrineKindCount("stamina") * 10;
    p.maxFp = 80 + this.shrineKindCount("core") * 10;
    p.maxAshBursts = 5 + this.shrineKindCount("filter");
    p.relicHeatRate = Math.pow(0.88, this.shrineKindCount("relic"));
  }

  /** Rebuild every visible progression payoff from authoritative campaign state. */
  private syncWorldReactions() {
    this.world.setShardTier(Math.floor(this.shardsCollected / 2));
    this.syncKingArmor();
    this.world.setQuestReactions({
      lanternsLit: Math.max(0, Math.min(3, this.chainDone["the-lantern-grid"] ?? 0)),
      caravan: this.questsDone.has("the-long-road") || this.questsDone.has("region-iron-guardian"),
      scoutsHonored: this.questsDone.has("the-missing-patrol"),
      domeRestored: this.questsDone.has("the-dome-roof"),
      signalArray: this.questsDone.has("eyes-on-the-storm") || this.questsDone.has("region-glass-guardian"),
      sanctuaryBeacon: this.questsDone.has("the-last-light") || this.questsDone.has("region-cathedral-guardian"),
      skiffFreed: this.questsDone.has("the-sludge-lurkers") && this.questsDone.has("the-skiff-passage"),
      pumpsRunning: this.questsDone.has("the-lower-pumps"),
      gondolaRunning: this.questsDone.has("the-storm-hawks") || this.questsDone.has("region-spire-guardian"),
    });
  }

  /** The nearest unclaimed Shrine of Light, within reach. */
  private nearestShrine(): { pos: THREE.Vector3; name: string; id: string; kind: string } | null {
    let best: { pos: THREE.Vector3; name: string; id: string; kind: string } | null = null;
    let bd = 3.4;
    for (const s of this.world.shrineSites) {
      if (this.shrinesClaimed.has(s.id)) continue;
      const d = Math.hypot(this.player.pos.x - s.pos.x, this.player.pos.z - s.pos.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Claim a Shrine of Light — one ancient blessing, remembered forever. */
  private claimShrine(site: { id: string; name: string; kind: string }) {
    if (this.shrinesClaimed.has(site.id)) return;
    const p = this.player;
    const before = { maxHp: p.maxHp, maxStamina: p.maxStamina, maxFp: p.maxFp, maxAshBursts: p.maxAshBursts };
    this.shrinesClaimed.add(site.id);
    this.recomputeShrineStats();
    p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - before.maxHp));
    p.stamina = Math.min(p.maxStamina, p.stamina + (p.maxStamina - before.maxStamina));
    p.fp = Math.min(p.maxFp, p.fp + (p.maxFp - before.maxFp));
    p.ashBursts = Math.min(p.maxAshBursts, p.ashBursts + (p.maxAshBursts - before.maxAshBursts));
    this.world.dimShrine(site.id);
    const total = this.shrinesClaimed.size;
    this.showBanner(site.name.toUpperCase(), `${shrineBlessingText(site.kind as ShrineKind)}  ·  ${total}/24 shrines claimed`);
    audio.grace();
    this.saveGame();
  }

  /**
   * Lyekai's relationship lines — the Bible's "the men we work with know"
   * progression: at 3 Shards he admits he can see what the guard could not
   * reach; at 6 he carries your name when you're gone. A whisper the player
   * hears as he walks through the gate — LYEKAI speaks, not YOU.
   */
  private lyekaiRelationsTick() {
    if (!this.started || this.paused || this.mapOpen || this.journalOpen || this.dialogue || this.victoryShown || this.epiloguePhase === "active"
        || (this.prologueActive && !this.prologueComplete) || this.aldrichChargeInDone) return;
    const gateD = Math.hypot(this.player.pos.x, this.player.pos.z - 96);
    if (gateD > 10) return;
    const n = [3, 6].find((m) => this.shardsCollected >= m && !this.lyekaiRelationsSpoken.has(m));
    if (n !== undefined) this.startDialogue(n === 3 ? "lyekaiRelations3" : "lyekaiRelations6");
  }

  /** Quest complete — reward, ceremony, persist. */
  private completeQuest(def: QuestDef, speaker: string, preface?: string[]) {
    this.questsActive.delete(def.id);
    this.questsDone.add(def.id);
    if (def.kind === "cull") this.clearRegionalCull(def.id);
    if (def.id === "missing-core") this.torinDiscountsLeft = 3;
    this.syncWorldReactions();
    this.player.runes += def.reward.runes;
    this.addPopup(this.player.pos.clone().setY(this.player.pos.y + 2.1), `+${def.reward.runes}`, "runes");
    if (def.reward.flasks) this.player.flasks = Math.min(this.player.maxFlasks, this.player.flasks + def.reward.flasks);
    this.graceFx = 0.9;
    audio.grace();
    this.showBanner("QUEST COMPLETE — " + def.name.toUpperCase(), `${def.reward.runes.toLocaleString()} runes${def.reward.flasks ? ` · +${def.reward.flasks} flask` : ""}`);
    this.dialogue = { speaker, speakers: [speaker], lines: [...(preface ?? []), ...def.done], idx: 0 };
    this.dialogueKind = "villager";
    this.saveGame();
    this.emit();
  }

  /** The nearest unclaimed quest waypoint — a take-the-moment reach spot or a chain step. */
  private nearestReachQuest(): { def: QuestDef; step?: NonNullable<QuestDef["steps"]>[number] } | null {
    for (const qid of this.questsActive) {
      const def = QUEST_BY_ID[qid];
      if (def.kind === "reach" && def.spot && !this.reachedSpots.has(qid)) {
        if (Math.hypot(this.player.pos.x - def.spot[0], this.player.pos.z - def.spot[1]) < REACH_RADIUS) return { def };
      } else if (def.kind === "chain" && def.steps) {
        const step = def.steps[this.chainDone[qid] ?? 0];
        if (step && Math.hypot(this.player.pos.x - step.spot[0], this.player.pos.z - step.spot[1]) < REACH_RADIUS) return { def, step };
      }
    }
    return null;
  }

  /** The nearest unclaimed collectible token, or null. */
  private nearestCollectible() {
    for (const c of this.collectibles) {
      if (c.taken) continue;
      if (Math.hypot(this.player.pos.x - c.pos.x, this.player.pos.z - c.pos.z) < 2.6) return c;
    }
    return null;
  }

  toggleJournal() {
    if (!this.started || this.dead || this.paused || this.dialogue || this.victoryShown || this.mapOpen || (this.prologueActive && !this.prologueComplete)) return;
    this.journalOpen = !this.journalOpen;
    if (this.journalOpen) document.exitPointerLock?.();
    else if (!this.agentControlActive) this.requestPointerLock();
    audio.ui("click");
    this.emit();
  }

  private collectToken(c: (typeof this.collectibles)[number]) {
    c.taken = true;
    this.collects[c.tag] = (this.collects[c.tag] ?? 0) + 1;
    this.world.scene.remove(c.group);
    c.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) (mat as THREE.Material).dispose();
    });
    audio.ui("click");
    this.addPopup(this.player.pos.clone().setY(this.player.pos.y + 2.0), `+1`, "runes");
    this.saveGame();
    this.emit();
  }

  // ----------------------------------------------------------- save & resume
  /** Seal the vigil into localStorage. Called on every meaningful threshold. */
  saveGame() {
    try {
      const save = {
        v: 1,
        runes: this.player.runes,
        bloodstain: this.bloodstain ? { x: this.bloodstain.pos.x, y: this.bloodstain.pos.y, z: this.bloodstain.pos.z, runes: this.bloodstain.runes } : null,
        weapon: this.player.weaponKind,
        shardsCollected: this.shardsCollected,
        shardPowers: [...this.player.shardPowers],
        upgrades: { ...this.upgrades },
        villageLevels: Object.fromEntries(this.villages.map((v) => [v.name, v.level])),
        discoveredGraces: [...this.discoveredGraces],
        activeGraceIdx: this.activeGraceIdx,
        loreRead: [...this.loreRead],
        questStage: this.questStage,
        prologueComplete: this.prologueComplete,
        effigyKills: { ...this.effigyKills },
        effigiesDead: this.effigies.map((effigy, index) => effigy.dead ? index : -1).filter((index) => index >= 0),
        bramPaid: this.bramPaid,
        torinPaid: this.torinPaid,
        torinDiscountsLeft: this.torinDiscountsLeft,
        miloPaid: this.miloPaid,
        vesperPaid: this.vesperPaid,
        shardBeaconKnown: this.shardBeaconKnown,
        southBriefed: this.southBriefed,
        grappleKnown: this.player.grappleKnown,
        sanctuaryBlessing: this.player.sanctuaryBlessing,
        relicsOwned: [...this.player.relicsOwned],
        relicSlots: [...this.relicSlots],
        ashBursts: this.player.ashBursts,
        filterCondition: this.player.filterCondition,
        villageNpcClaimed: [...this.villageNpcClaimed],
        guardiansDead: this.shardBosses.filter((b) => b.dead).map((b) => b.shardId),
        victory: this.victory,
        campaignCompleted: this.campaignCompleted,
        postgame: this.postgame,
        epiloguePhase: this.epiloguePhase,
        epilogueStage: this.epilogueStage,
        endingPath: this.endingPath,
        weather: this.world.weather,
        dayPhase: this.world.dayPhase,
        mainPhase2Done: this.mainPhase2Done,
        preBossWeather: this.preBossWeather,
        pylonKills: this.pylonKills,
        questsActive: [...this.questsActive],
        questsDone: [...this.questsDone],
        questKills: { ...this.questKills },
        collects: { ...this.collects },
        reachedSpots: [...this.reachedSpots],
        collectiblesTaken: this.collectibles.filter((c) => c.taken).map((c) => c.id),
        chainDone: { ...this.chainDone },
        journalUnlocked: [...this.journalUnlocked],
        aldrichMilestones: [...this.aldrichMilestones],
        lyekaiRelationsSpoken: [...this.lyekaiRelationsSpoken],
        shrinesClaimed: [...this.shrinesClaimed],
      };
      localStorage.setItem(Game.SAVE_KEY, JSON.stringify(save));
    } catch {
      /* a full or blocked store must never crash the vigil */
    }
  }

  /** Resume a sealed vigil. Returns false when there is nothing to resume. */
  loadSave(): boolean {
    try {
      const raw = localStorage.getItem(Game.SAVE_KEY);
      if (!raw) return false;
      const save = JSON.parse(raw);
      if (!save || save.v !== 1) return false;
      const p = this.player;
      this.campaignCompleted = !!save.campaignCompleted || !!save.victory;
      this.postgame = !!save.postgame;
      this.preBossWeather = ["clear", "ash", "ember"].includes(save.preBossWeather) ? save.preBossWeather : null;
      this.epiloguePhase = ["pending", "active", "closing", "complete"].includes(save.epiloguePhase) ? save.epiloguePhase : null;
      this.epilogueStage = Number.isInteger(save.epilogueStage) ? Math.max(0, Math.min(3, save.epilogueStage)) : 0;
      this.victoryDismissed = this.postgame;
      this.shrinesClaimed = new Set<string>(save.shrinesClaimed ?? []);
      p.runes = save.runes ?? 0;
      this.clearBloodstain();
      const stain = save.bloodstain;
      if (stain && [stain.x, stain.y, stain.z, stain.runes].every(Number.isFinite) && stain.runes > 0) {
        this.createBloodstain(new THREE.Vector3(stain.x, stain.y, stain.z), stain.runes);
      }
      this.shardsCollected = Math.max(0, Math.min(8, save.shardsCollected ?? 0));
      p.shards = this.shardsCollected;
      p.shardPowers = new Set<string>(save.shardPowers ?? []);
      this.upgrades = { blade: save.upgrades?.blade ?? 0, vigor: save.upgrades?.vigor ?? 0, arcane: save.upgrades?.arcane ?? 0 };
      const levelOf = (v: { name: string }) => save.villageLevels?.[v.name];
      for (const v of this.villages) {
        const lvl = levelOf(v);
        if (typeof lvl === "number") v.level = Math.max(0, Math.min(v.costs.length, lvl));
      }
      for (const type of ["blade", "vigor", "arcane"] as const) {
        const bestVillage = Math.max(0, ...this.villages.filter((v) => v.type === type).map((v) => v.level));
        this.upgrades[type] = Math.max(this.upgrades[type], bestVillage);
      }
      p.bladePower = 1 + this.upgrades.blade * 0.18;
      p.magicPower = 1 + this.upgrades.arcane * 0.22;
      this.discoveredGraces = new Set<number>(save.discoveredGraces ?? []);
      this.activeGraceIdx = Number.isInteger(save.activeGraceIdx) && this.discoveredGraces.has(save.activeGraceIdx) && this.world.graceSites[save.activeGraceIdx]
        ? save.activeGraceIdx : 0;
      this.loreRead = new Set<number>(save.loreRead ?? []);
      this.questStage = Math.max(0, Math.min(9, save.questStage ?? 0));
      this.effigyKills = { blade: save.effigyKills?.blade ?? 0, arcane: save.effigyKills?.arcane ?? 0 };
      const oldBladeKills = Math.max(0, Math.min(2, this.effigyKills.blade));
      const oldArcaneKills = Math.max(0, Math.min(1, this.effigyKills.arcane));
      const deadEffigies = new Set<number>(Array.isArray(save.effigiesDead)
        ? save.effigiesDead
        : [...Array.from({ length: oldBladeKills }, (_, index) => index), ...(oldArcaneKills ? [2] : [])]);
      for (const [index, effigy] of this.effigies.entries()) {
        if (!deadEffigies.has(index)) continue;
        effigy.dead = true;
        effigy.hp = 0;
        effigy.dissolve = 1;
        effigy.rig.root.visible = false;
        for (const material of effigy.rig.flashMats) { material.opacity = 0; material.transparent = true; }
        for (const material of effigy.rig.glowMats) (material as THREE.MeshBasicMaterial).opacity = 0;
      }
      this.bramPaid = save.bramPaid ?? 0;
      this.torinPaid = !!save.torinPaid;
      this.miloPaid = !!save.miloPaid;
      this.vesperPaid = save.vesperPaid ?? 0;
      this.shardBeaconKnown = !!save.shardBeaconKnown;
      this.southBriefed = !!save.southBriefed;
      p.grappleKnown = !!save.grappleKnown;
      p.sanctuaryBlessing = !!save.sanctuaryBlessing;
      // Blessings and upgrades fold into the numbers — then fill the bars.
      this.recomputeShrineStats();
      p.hp = p.maxHp;
      p.stamina = p.maxStamina;
      p.fp = p.maxFp;
      for (const id of this.shrinesClaimed) this.world.dimShrine(id);
      p.relicsOwned = new Set<string>(save.relicsOwned ?? []);
      this.relicSlots = restoreRelicSlots(save.relicSlots, p.relicsOwned, save.weapon);
      for (const pickup of this.relicPickups) {
        if (!p.relicsOwned.has(pickup.id)) continue;
        pickup.taken = true;
        this.world.scene.remove(pickup.group);
      }
      if (p.grappleKnown && this.grapplePickup) {
        this.grapplePickup.taken = true;
        this.world.scene.remove(this.grapplePickup.group);
      }
      p.ashBursts = Math.max(0, Math.min(p.maxAshBursts, save.ashBursts ?? 3));
      p.filterCondition = typeof save.filterCondition === "number" && Number.isFinite(save.filterCondition)
        ? Math.max(0, Math.min(100, save.filterCondition)) : 100;
      this.filterDamageTimer = 0;
      this.filterHazard = null;
      this.villageNpcClaimed = new Set<string>(save.villageNpcClaimed ?? []);
      // guardians already felled stay felled
      const felled = new Set<string>(save.guardiansDead ?? []);
      // the waste keeps what it gave — felled tokens stay felled
      const takenTokens = new Set<number>(save.collectiblesTaken ?? []);
      for (const c of this.collectibles) {
        if (!takenTokens.has(c.id)) continue;
        c.taken = true;
        this.world.scene.remove(c.group);
        c.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
          for (const mat of mats) (mat as THREE.Material).dispose();
        });
      }
      this.questsActive = new Set<string>(save.questsActive ?? []);
      this.questsDone = new Set<string>(save.questsDone ?? []);
      this.torinDiscountsLeft = typeof save.torinDiscountsLeft === "number"
        ? Math.max(0, Math.min(3, Math.floor(save.torinDiscountsLeft)))
        : this.questsDone.has("missing-core") ? 3 : 0;
      this.questKills = { ...(save.questKills ?? {}) };
      this.collects = { ...(save.collects ?? {}) };
      this.reachedSpots = new Set<string>(save.reachedSpots ?? []);
      this.journalOpen = false;
      this.chainDone = { ...(save.chainDone ?? {}) };
      this.journalUnlocked = new Set<string>(save.journalUnlocked ?? []);
      this.aldrichMilestones = new Set<number>(save.aldrichMilestones ?? []);
      this.lyekaiRelationsSpoken = new Set<number>(save.lyekaiRelationsSpoken ?? []);
      // in-field quests respawn their encounters — marks re-hunt, chain markers remain
      for (const qid of this.questsActive) {
        const def = QUEST_BY_ID[qid];
        if (def?.kind === "mark" && def.mark && !this.questMarks.has(qid)) this.spawnQuestMark(def);
        if (def?.kind === "chain" && def.steps) this.spawnChainMarkers(def);
        if (def?.kind === "cull") this.spawnRegionalCull(def);
      }
      for (const b of this.shardBosses) {
        if (b.shardId && felled.has(b.shardId)) {
          b.hp = 0;
          b.dead = true;
          b.aggro = false;
          b.dissolve = 1;
          for (const m of b.rig.flashMats) { m.opacity = 0; m.transparent = true; }
          for (const m of b.rig.glowMats) (m as THREE.MeshBasicMaterial).opacity = 0;
          b.rig.root.visible = false;
        }
      }
      if (save.victory) {
        this.victory = true;
        this.victoryAt = -999;
        this.victoryDismissed = true;
        this.endingPath = save.endingPath ?? "hollow";
        this.questStage = 9;
        this.boss.hp = 0;
        this.boss.dead = true;
        this.boss.aggro = false;
        this.boss.dissolve = 1;
        for (const m of this.boss.rig.flashMats) { m.opacity = 0; m.transparent = true; }
        for (const m of this.boss.rig.glowMats) (m as THREE.MeshBasicMaterial).opacity = 0;
        this.boss.rig.root.visible = false;
      }
      // Older saves predate this flag and were written after the opening.
      // An interrupted opening starts again instead of silently skipping it.
      this.prologueComplete = save.prologueComplete !== false;
      this.prologueStarted = this.prologueComplete;
      this.prologueActive = false;
      this.restorePrologueEnvironment();
      if (this.kinterBackBlade) this.kinterBackBlade.visible = false;
      const resumeGrace = this.world.graceSites[this.activeGraceIdx] ?? this.world.graceSites[0];
      this.placeAtGrace(resumeGrace.pos.x, resumeGrace.pos.z);
      this.dialogue = null;
      this.mapOpen = false;
      // per-attempt state that must never fossilise inside a save
      p.pikeVault = false;
      p.orbitSawT = 0;
      p.overheatT = 0;
      p.coreRegenDelay = 0;
      p.overdriveT = 0;
      p.overdriveCooldown = 0;
      p.relicHeat = 0;
      this.aldrichChargeInDone = false;
      // A loaded game resumes at a Grace, so a partially completed fight is a
      // fresh attempt even when the same Game instance was used before quit.
      if (!save.victory) this.resetEnemies();
      // the king always finds his way back to the throne on a reload —
      // unless he fell for good at the Citadel
      if (!save.victory) {
        const K = WORLD.kingAt;
        this.kingPos.set(K.x, terrainHeight(K.x, K.z), K.z);
        this.kingYaw = Math.PI;
        this.king.root.position.copy(this.kingPos);
        this.king.root.rotation.y = this.kingYaw;
        this.king.root.visible = true;
        poseRig(this.king, { dt: 0.016, time: this.time, speed: 0, state: "idle", phase: 0.5, combo: 0 });
      }
      this.mainPhase2Done = false;
      // felled conduits stay felled — spawnPylons breaks these in silence on first aggro
      this.pylonsBrokenFromLoad = Math.max(0, Math.min(3, save.pylonKills ?? 0));
      this.pylonKills = this.pylonsBrokenFromLoad;
      const resumeWeather = !save.victory && save.mainPhase2Done ? (save.preBossWeather ?? "clear") : (save.weather ?? "clear");
      this.world.setWeather(["clear", "ash", "ember"].includes(resumeWeather) ? resumeWeather : "clear");
      if (typeof save.dayPhase === "number") this.world.dayPhase = save.dayPhase;
      this.syncWorldReactions();
      this.syncBeacon();
      if (typeof save.weapon === "string" && WEAPON_CONFIG[save.weapon] &&
          (!RELIC_IDS.includes(save.weapon as (typeof RELIC_IDS)[number]) || p.relicsOwned.has(save.weapon))) {
        this.switchWeapon(save.weapon, false);
      }
      this.updateCamera(0, true);
      this.showBanner("THE WATCH RESUMES", "some things the Grace does not take");
      // If the player reloaded during the coronation monologue, free roam must
      // still own the writing earned by the finished campaign.
      if (save.victory) {
        this.unlockEntries("coronation");
        this.victoryDismissed = false;
        if (this.epiloguePhase === "pending") this.startDialogue(this.endingPath === "radiance" ? "epilogueRadiante" : "epilogueHollow");
        else if (this.epiloguePhase === "active") this.beginEpilogue(true);
        else if (this.epiloguePhase === "closing") this.startDialogue("epilogueClosing");
        else if (this.epiloguePhase === "complete") this.victoryAt = -999;
        else this.dismissVictory(); // completed saves from before this epilogue
      }
      return true;
    } catch {
      return false;
    }
  }

  hasSave(): boolean {
    try {
      return !!localStorage.getItem(Game.SAVE_KEY);
    } catch {
      return false;
    }
  }

  eraseSave() {
    try {
      localStorage.removeItem(Game.SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  // ----------------------------------------------------------------- relics
  /** Claim a floating cache. The world opens when they do. */
  private grantRelic(pickup: { id: string; name: string; title: string; group: THREE.Group; taken: boolean }) {
    pickup.taken = true;
    this.player.relicsOwned.add(pickup.id);
    this.world.scene.remove(pickup.group);
    pickup.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) (mat as THREE.Material).dispose();
    });
    audio.grace();
    this.addPopup(this.player.pos.clone().setY(this.player.pos.y + 2.2), "RELIC", "heal");
    const empty = this.relicSlots.findIndex((item) => item === null);
    if (empty >= 0 && isRelic(pickup.id)) {
      this.relicSlots[empty as 0 | 1] = pickup.id as (typeof RELIC_IDS)[number];
      this.requestWeapon(pickup.id);
    }
    this.showBanner("RELIC CLAIMED", empty >= 0 ? `${pickup.name} · assigned to slot ${empty + 1}` : `${pickup.name} · assign it in Equipment`);
    this.saveGame();
    this.emit();
  }

  private grantGrapple(pickup: { group: THREE.Group; taken: boolean } | null) {
    if (!pickup || pickup.taken) return;
    pickup.taken = true;
    this.player.grappleKnown = true;
    this.world.scene.remove(pickup.group);
    pickup.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) (mat as THREE.Material).dispose();
    });
    audio.grace();
    this.showBanner("THE GRAPPLE-LINE", "Aim at an anchor or enemy · G to pull toward it");
    this.saveGame();
    this.emit();
  }

  /** G — the Sootfall grapple. */
  private fireGrapple(): boolean {
    const ctx = this.ctx(0.016);
    this.player.yaw = this.grappleAimYaw();
    const fired = this.player.grapple(ctx);
    if (!fired && this.player.grappleKnown && this.player.fp < 12) this.showBanner("CORE ENERGY LOW", "The Grapple-Line needs 12 core energy");
    this.emit();
    return fired;
  }

  private grappleAimYaw(): number {
    if (this.lockTarget && !this.lockTarget.dead && !this.lockTarget.dormant) {
      return Math.atan2(this.lockTarget.pos.x - this.player.pos.x, this.lockTarget.pos.z - this.player.pos.z);
    }
    return this.camYaw + Math.PI;
  }

  /** C — the Ash Burst, a canister of bottled storm. */
  private fireAshBurst() {
    const ctx = this.ctx(0.016);
    if (this.player.ashBurst(ctx)) this.saveGame();
    this.emit();
  }

  private replaceFilter(): boolean {
    if (!this.player.replaceFilter()) return false;
    this.filterDamageTimer = 0;
    this.showBanner("FILTER REPLACED", "One spare canister fitted · B replaces the filter");
    this.saveGame();
    this.emit();
    return true;
  }

  private updateFilter(dt: number, ctx: GameCtx) {
    const p = this.player;
    if (p.dead || p.godMode || this.trialActor || this.epiloguePhase || this.victory || (this.prologueActive && !this.prologueComplete)) {
      this.filterHazard = null;
      return;
    }
    const hazard = hazardAt(p.pos.x, p.pos.z, this.world.weather, this.filterSafePoints);
    const before = filterStage(p.filterCondition);
    const previousHazard = this.filterHazard;
    this.filterHazard = hazard?.name ?? null;
    p.filterCondition = drainFilter(p.filterCondition, hazard, this.shrineKindCount("filter"), dt);
    const after = filterStage(p.filterCondition);
    if (hazard && !previousHazard) {
      this.showBanner("HAZARDOUS AIR", `${hazard.name} · B fits a spare filter`);
      audio.suit(false);
    }
    if (hazard && before !== after) {
      const text = after === "worn" ? "Filter wearing · prepare a spare" : after === "critical" ? "Filter critical · B fits a spare" : "Filter exhausted · leave the hazard or replace it";
      this.showBanner("LIFESUIT WARNING", text);
      audio.suit(false);
      this.saveGame();
    }
    if (hazard && p.filterCondition <= 0) {
      this.filterDamageTimer += dt;
      if (this.filterDamageTimer >= 3) {
        this.filterDamageTimer -= 1;
        p.damageFromExposure(4, ctx);
      }
    } else this.filterDamageTimer = 0;
    if (hazard) {
      this.filterSaveTimer += dt;
      if (this.filterSaveTimer >= 10) { this.filterSaveTimer = 0; this.saveGame(); }
    } else this.filterSaveTimer = 0;
  }

  // ------------------------------------------------------ the black citadel
  /** The three conduits drinking Malenkar's charge — break them and the ward falls. */
  private spawnPylons() {
    if (this.pylons.length > 0) return;
    const spots: [number, number][] = [[13, -8], [-13, -8], [0, -30]];
    for (const [x, z] of spots) {
      const p = new NPC("wretch");
      p.passive = true;
      p.tutorialTag = "pylon";
      p.name = "CONDUIT PYLON";
      p.maxHp = p.hp = 260;
      p.runeValue = 0;
      p.aggroRange = 0;
      p.attackRange = 0;
      p.radius = 1.4;
      p.centerY = 2.1;
      p.pos.set(x, terrainHeight(x, z), z);
      p.yaw = 0;
      p.rig.root.scale.setScalar(2.6);
      p.scale = 2.6;
      for (const m of p.rig.flashMats) {
        m.color.multiplyScalar(0.42);
        m.color.offsetHSL(0.58, 0.12, -0.04);
      }
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.4, 0),
        new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      core.position.y = 2.2;
      p.rig.root.add(core);
      this.world.scene.add(p.rig.root);
      this.world.colliders.push({ x, z, r: 1.35 });
      this.enemies.push(p);
      this.pylons.push(p);
    }
    // felled in a past life — these conduits stay felled (save/reload keeps the tally)
    if (this.pylonsBrokenFromLoad > 0) {
      for (let i = 0; i < Math.min(this.pylonsBrokenFromLoad, this.pylons.length); i++) {
        const p = this.pylons[i];
        p.hp = 0;
        p.dead = true;
        p.setState("death", 0.01);
        p.dissolve = 1;
        p.rig.root.visible = false;
      }
      this.pylonKills = this.pylonsBrokenFromLoad;
      this.pylonsBrokenFromLoad = 0;
      const left = this.pylons.filter((p) => !p.dead).length;
      if (left > 0) this.showBanner("THE WARLORD'S WARD", `the conduits drink your blows — bring down the ${left === 1 ? "last" : "remaining"} pylon${left === 1 ? "" : "s"}`);
      else this.showBanner("THE WARD IS BROKEN", "the conduits lie silent — Malenkar belongs to you");
      return;
    }
    this.showBanner("THE WARLORD'S WARD", "his conduits drink your blows — bring down the three pylons");
  }

  /** 50% — Malenkar takes the storm into himself. */
  private enterMalenkarPhase2() {
    if (this.mainPhase2Done) return;
    this.mainPhase2Done = true;
    this.preBossWeather = this.world.weather;
    const boss = this.boss;
    for (const p of this.pylons) {
      if (p.dead) continue;
      p.hp = 0;
      p.dead = true;
      p.setState("death", 0.01);
      p.dissolve = 1;
      p.rig.root.visible = false;
    }
    boss.moveSpeed = 6.9;
    boss.setState("stagger", 4.2);
    boss.move = null;
    this.world.setWeather("ash");
    if (this.world.citadelCables) this.world.citadelCables.visible = false;
    if (this.world.citadelBeam) this.world.citadelBeam.visible = false;
    this.showBanner("THE ENGINE IS SEIZED", "Malenkar rips the cables free — and the storm takes him as its own");
    this.dialogueKind = "malenkharPhase2";
    this.dialogue = { speaker: "MALENKAR", speakers: ["MALENKAR"], lines: DIALOGUE.malenkharPhase2, idx: 0 };
    audio.roar();
    audio.explosion();
    this.shakeAmt = Math.max(this.shakeAmt, 1.4);
    this.shakeT = Math.max(this.shakeT, 1.3);
    this.waves.spawn(boss.pos.clone().setY(terrainHeight(boss.pos.x, boss.pos.z) + 0.4), 0x3aa0ff, 13, 1.1);
    this.saveGame();
    this.emit();
  }

  /** QA / visual-check helpers — harmless in normal play. */
  qaGrantShards(n: number) {
    const order = ["colossus", "captain", "stalker", "warden", "leviathan", "sentinel", "forgemaster", "herald"];
    const count = Math.max(0, Math.min(8, Math.floor(n)));
    this.player.shardPowers = new Set(order.slice(0, count));
    this.shardsCollected = count;
    this.player.shards = count;
    this.syncWorldReactions();
    this.syncBeacon();
    this.emit();
  }

  qaGrantRelics() {
    for (const r of RELICS) this.player.relicsOwned.add(r.id);
    this.relicSlots = restoreRelicSlots(undefined, this.player.relicsOwned);
    this.player.grappleKnown = true;
    this.emit();
  }

  /** Open a local quest encounter for development visual checks. */
  qaRegionalCull(id: string) {
    if (!DEV_BUILD) return;
    const def = QUEST_BY_ID[id];
    if (!def || def.kind !== "cull" || !REGIONAL_CULLS[id]) return;
    this.finishPrologue();
    this.questStage = 3;
    this.acceptQuest(def, this.giverName(def.giver));
    const home = this.villages.find((v) => v.id === this.questHome(def.giver));
    const enemy = this.questCullEnemies.get(id)?.[0];
    if (home && enemy) {
      const dx = enemy.pos.x - home.x, dz = enemy.pos.z - home.z;
      const len = Math.hypot(dx, dz) || 1;
      this.player.pos.set(enemy.pos.x - dx / len * 5, terrainHeight(enemy.pos.x - dx / len * 5, enemy.pos.z - dz / len * 5), enemy.pos.z - dz / len * 5);
      this.player.vel.set(0, 0, 0);
      this.camYaw = Math.atan2(-dx, -dz);
      this.camPitch = 0.16;
      this.updateCamera(0, true);
    }
  }

  qaRegionalStory(id: string) {
    if (!DEV_BUILD) return;
    const def = QUEST_BY_ID[`region-${id}-investigation`];
    const step = def?.steps?.[0];
    if (!def || !step) return;
    this.finishPrologue();
    this.questStage = 3;
    this.shardBeaconKnown = true;
    this.acceptQuest(def, this.giverName(def.giver));
    const [x, z] = this.world.resolveColliders(step.spot[0], step.spot[1] - 2.5, this.player.radius);
    this.player.pos.set(x, terrainHeight(x, z), z);
    this.player.vel.set(0, 0, 0);
    this.camYaw = Math.PI;
    this.camPitch = 0.16;
    this.updateCamera(0, true);
  }

  qaEpilogue() {
    if (!DEV_BUILD) return;
    this.finishPrologue();
    this.questStage = 9;
    this.victory = true;
    this.campaignCompleted = true;
    this.boss.dead = true;
    this.boss.hp = 0;
    this.epilogueStage = 0;
    this.beginEpilogue(false);
  }

  qaGrapple() {
    if (!DEV_BUILD) return;
    const anchor = this.world.grappleAnchors[0];
    if (!anchor) return;
    this.finishPrologue();
    this.questStage = 3;
    this.player.grappleKnown = true;
    const x = anchor.pos.x + 9, z = anchor.pos.z + 3;
    this.player.pos.set(x, terrainHeight(x, z), z);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = Math.atan2(anchor.pos.x - x, anchor.pos.z - z);
    this.camYaw = this.player.yaw + Math.PI;
    this.camPitch = 0.16;
    this.updateCamera(0, true);
  }

  qaGuardian(id: string, signature = false) {
    if (!DEV_BUILD) return;
    const guardian = this.shardBosses.find((boss) => boss.shardId === id);
    if (!guardian) return;
    this.finishPrologue();
    this.questStage = 3;
    const [x, z] = this.world.resolveColliders(guardian.pos.x + 13, guardian.pos.z + 13, this.player.radius);
    this.player.pos.set(x, terrainHeight(x, z), z);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = Math.atan2(guardian.pos.x - x, guardian.pos.z - z);
    this.camYaw = this.player.yaw + Math.PI;
    this.camPitch = 0.16;
    if (signature) {
      guardian.hp = guardian.maxHp * 0.5;
      guardian.phaseIdx = 1;
      guardian.aggro = true;
      (guardian as unknown as { signatureCooldown: number }).signatureCooldown = 0;
    }
    this.updateCamera(0, true);
  }

  qaFilterHazard() {
    if (!DEV_BUILD) return;
    this.finishPrologue();
    this.questStage = 3;
    const x = -160, z = -278;
    this.player.pos.set(x, terrainHeight(x, z), z);
    this.player.vel.set(0, 0, 0);
    this.player.filterCondition = 12;
    this.player.ashBursts = 3;
    this.camYaw = Math.PI;
    this.camPitch = 0.16;
    this.updateCamera(0, true);
  }

  /** The nearest unclaimed relic cache within arm's reach, or null. */
  private nearestRelicPickup() {
    for (const pickup of this.relicPickups) {
      if (pickup.taken) continue;
      if (Math.hypot(this.player.pos.x - pickup.pos.x, this.player.pos.z - pickup.pos.z) < 2.7) return pickup;
    }
    return null;
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

  private questHome(giver: string): string | null {
    if (["oren", "torin", "bram", "pip", "milo", "vesper"].includes(giver)) return "sootfall";
    return VILLAGE_NPC_BY_ID[giver]?.village ?? null;
  }

  /** Reputation is derived from deeds, local relationships, and forge work. */
  private settlementStanding(v: Village): number {
    let score = v.level * 8;
    for (const quest of QUESTS) {
      if (!this.questsDone.has(quest.id)) continue;
      if (this.questHome(quest.giver) === v.id) score += 24;
      if (quest.deliverTo && this.questHome(quest.deliverTo) === v.id) score += 12;
    }
    for (const npc of VILLAGE_NPCS) {
      if (npc.village === v.id && this.villageNpcClaimed.has(npc.id)) score += 2;
    }
    return Math.min(100, score);
  }

  private standingLabel(score: number): string {
    return score >= 75 ? "Honored" : score >= 45 ? "Trusted" : score >= 20 ? "Known" : "Stranger";
  }

  private villageUpgradeQuote(v: Village): { cost: number; discounted: boolean; torin: boolean } {
    const base = v.costs[v.level];
    if (this.torinDiscountsLeft > 0) return { cost: Math.ceil(base * 0.5), discounted: true, torin: true };
    if (this.settlementStanding(v) >= 60) return { cost: Math.max(1, Math.round(base * 0.85 / 10) * 10), discounted: true, torin: false };
    return { cost: base, discounted: false, torin: false };
  }

  private upgradeAtVillage(v: Village) {
    if (v.level >= v.costs.length) {
      this.showBanner(v.name.toUpperCase(), "Already fully upgraded");
      audio.ui("hover");
      return;
    }
    const quote = this.villageUpgradeQuote(v);
    const cost = quote.cost;
    if (this.player.runes < cost) {
      this.showBanner(v.name.toUpperCase(), `${cost.toLocaleString()} runes required`);
      audio.ui("hover");
      return;
    }
    this.player.runes -= cost;
    if (quote.torin) this.torinDiscountsLeft = Math.max(0, this.torinDiscountsLeft - 1);
    v.level++;
    this.upgrades[v.type] = Math.max(this.upgrades[v.type], v.level);
    if (v.type === "blade") this.player.bladePower = 1 + this.upgrades.blade * 0.18;
    if (v.type === "arcane") this.player.magicPower = 1 + this.upgrades.arcane * 0.22;
    if (v.type === "vigor") {
      this.recomputeShrineStats();
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 28);
      this.player.stamina = this.player.maxStamina;
    }
    const title = v.type === "blade" ? "BLADE REFORGED" : v.type === "arcane" ? "ARCANE FLAME DEEPENED" : "VIGOR RESTORED";
    this.showBanner(title, `${v.name} · rank ${v.level}${quote.torin ? ` · Torin's favor (${this.torinDiscountsLeft} left)` : quote.discounted ? " · Honored discount" : ""}`);
    this.graceFx = 0.8;
    audio.grace();
    this.saveGame();
  }

  // ---------------------------------------------------------------- camera
  private updateCamera(dt: number, instant = false) {
    if (this.prologueActive && !this.prologueComplete) {
      const cbeat = PROLOGUE_BEATS[this.prologueIdx];
      let shot: PrologueCam | undefined;
      for (let i = (cbeat.shots?.length ?? 0) - 1; i >= 0; i--) {
        const item = cbeat.shots![i];
        if (item.at <= this.prologueShotTime) { shot = item.cam; break; }
      }
      const prologueCam = shot ?? cbeat.cam;
      if (prologueCam && (cbeat.mode === "cinematic" || shot)) {
        this.prologueCamera(prologueCam, dt, instant);
        return;
      }
    }
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
    const indoors = insideKeep(p.pos.x, p.pos.z);
    const wanted = indoors ? Math.min(this.camTargetDist, 4.3) : this.camTargetDist;
    this.camDist += (wanted - this.camDist) * (instant ? 1 : Math.min(1, dt * 6));

    const cp = Math.cos(this.camPitch);
    const off = new THREE.Vector3(
      Math.sin(this.camYaw) * cp * this.camDist,
      Math.sin(this.camPitch) * this.camDist + 1.9,
      Math.cos(this.camYaw) * cp * this.camDist,
    );

    const target = new THREE.Vector3(p.pos.x, focusY, p.pos.z);
    const desired = target.clone().add(off);

    // keep the camera above whatever floor the player is standing on
    const gh = groundAt(desired.x, desired.z, p.pos.y + 2.2) + 0.9;
    if (desired.y < gh) desired.y = gh;

    // Sphere-vs-collider push-in — don't let the boom clip through walls,
    // ruins or the keep's stonework when the player backs into them.
    const ray = desired.clone().sub(target);
    const lastClear = target.clone();
    let boomHit = false;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const sample = target.clone().addScaledVector(ray, t);
      const floor = groundAt(sample.x, sample.z, p.pos.y + 2.2);
      let solid = sample.y < floor + 0.8;
      if (!solid && sample.y < floor + 18) {
        for (const c of this.world.colliders) {
          const dx = sample.x - c.x;
          const dz = sample.z - c.z;
          const r = c.r + 0.42;
          if (dx * dx + dz * dz < r * r) { solid = true; break; }
        }
      }
      if (solid) {
        desired.copy(lastClear);
        boomHit = true;
        break;
      }
      lastClear.copy(sample);
    }
    if (boomHit) this.camDist = Math.min(this.camDist, Math.max(1.4, desired.distanceTo(target) * 0.92));

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
    const prologueOn = this.prologueActive && !this.prologueComplete;
    if (prologueOn && this.prologueCaptureTimer > 0) return this.neutralInput();
    if (prologueOn) {
      // A cinematic beat owns the player: either a scripted slow walk or stillness.
      const pbeat = PROLOGUE_BEATS[this.prologueIdx];
      if (pbeat.mode === "cinematic") return this.prologueCinematicInput(pbeat);
    }
    if (this.dialogue) {
      // conversation locks combat but leaves the camera free
      this.attackBuffer = this.heavyBuffer = this.rollBuffer = this.castBuffer = this.healBuffer = 0;
      return { moveX: 0, moveZ: 0, sprint: false, attack: false, heavy: false, roll: false, guard: false, cast: false, heal: false, camYaw: this.camYaw + Math.PI, faceYaw: null };
    }
    const k = this.keys;
    if (this.agentControlActive && this.agentGuardRemaining > 0) {
      this.agentGuardRemaining = Math.max(0, this.agentGuardRemaining - dt);
    }
    let mx = 0;
    let mz = 0;
    if (this.agentControlActive && this.agentMove) {
      this.agentMove.remaining -= dt;
      const dx = this.agentMove.targetX - this.player.pos.x;
      const dz = this.agentMove.targetZ - this.player.pos.z;
      if (this.agentMove.remaining <= 0 || Math.hypot(dx, dz) <= 1.2) {
        this.agentMove = null;
      } else {
        // Recompute the live heading every frame and stop as soon as the
        // target radius is reached; fixed-duration key holds overshot stairs.
        const relativeYaw = Math.atan2(dx, dz) - (this.camYaw + Math.PI);
        mx = Math.sin(relativeYaw);
        mz = Math.cos(relativeYaw);
      }
    } else if (!this.agentControlActive) {
      if (k["w"] || k["arrowup"]) mz += 1;
      if (k["s"] || k["arrowdown"]) mz -= 1;
      if (k["a"] || k["arrowleft"]) mx += 1;
      if (k["d"] || k["arrowright"]) mx -= 1;
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    this.heavyBuffer = Math.max(0, this.heavyBuffer - dt);
    this.rollBuffer = Math.max(0, this.rollBuffer - dt);
    this.castBuffer = Math.max(0, this.castBuffer - dt);
    this.healBuffer = Math.max(0, this.healBuffer - dt);
    this.interactBuffer = Math.max(0, this.interactBuffer - dt);

    const canAct = this.player.canAct() && !prologueOn && this.epiloguePhase !== "active";
    const attack = this.attackBuffer > 0 && canAct;
    const heavy = this.heavyBuffer > 0 && canAct;
    const roll = this.rollBuffer > 0 && this.player.canAct() && this.epiloguePhase !== "active" && (!prologueOn || PROLOGUE_BEATS[this.prologueIdx].id === "border");
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
      sprint: this.agentControlActive ? !!this.agentMove?.sprint : !!k["shift"],
      attack, heavy, roll, cast, heal,
      guard: prologueOn ? false : this.agentControlActive ? this.agentGuardRemaining > 0 : this.mouse.right,
      camYaw: this.camYaw + Math.PI,
      faceYaw,
      flyUp: !!k[" "],
      flyDown: !!k["control"] || !!k["c"],
      glide: !!k["x"] && this.epiloguePhase !== "active",
    };
  }

  private frame = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.frame);

    let raw = Math.min(this.clock.getDelta(), 0.05);
    this.fpsAcc += raw;
    this.fpsCount++;
    // perf ring — captures the true frame cost, independent of the adaptive res scaler
    this.perfRing[this.perfIdx] = raw * 1000;
    this.perfIdx = (this.perfIdx + 1) % this.perfRing.length;
    if (this.perfCount < this.perfRing.length) this.perfCount++;
    if (this.fpsAcc > 0.5) {
      this.fps = Math.round(this.fpsCount / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsCount = 0;
      // ---- adaptive resolution: protect the frame budget automatically ----
      this.qualityCooldown -= 0.5;
      if (this.qualityCooldown <= 0) {
        let q = this.quality;
        if (this.fps < 46 && q > 0.62) q = Math.max(0.62, q - 0.18);
        else if (this.fps > 58 && q < 1) q = Math.min(1, q + 0.09);
        if (Math.abs(q - this.quality) > 0.01) {
          this.quality = q;
          const pr = this.basePixelRatio * q;
          this.renderer.setPixelRatio(pr);
          this.composer.setPixelRatio(pr);
          this.qualityCooldown = 2.5;
        }
      }
    }

    // Match Minslaire's benchmark pacing: enemies and the world wait while the
    // remote model decides, so a slow free-model response cannot kill the player.
    // The render loop and UI stay responsive; clock.getDelta() above keeps time
    // from catching up when the next action arrives.
    if (this.agentThinking && this.started && !this.paused && !this.mapOpen) {
      this.composer.render();
      this.emit(); // keep HUD/popups/banners fresh while the model is thinking
      return;
    }

    if (!this.started || this.paused || this.mapOpen) {
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

    // Conversations must not leave Kinter defenseless while enemies continue
    // attacking, especially during the mandatory final-boss transitions.
    if (this.dialogue && !(this.prologueActive && !this.prologueComplete)) {
      this.updateCamera(raw);
      this.composer.render();
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

    const prologueOn = this.prologueActive && !this.prologueComplete;

    if (this.trialActor && (Math.hypot(this.player.pos.x, this.player.pos.z - 120) > 15 ||
        Math.abs(this.player.pos.y - this.world.keep.base) > 4)) {
      this.player.pos.set(0, this.world.keep.base, 114);
      this.player.vel.set(0, 0, 0);
      this.trialActor.pos.set(0, this.world.keep.base, 120);
      this.trialActor.vel.set(0, 0, 0);
      this.trialActor.aggro = true;
      this.showBanner("THE KING'S TRIAL", "Aldrich calls you back to the hall");
    }
    if (this.epiloguePhase === "active" && (Math.abs(this.player.pos.x) > 10 || this.player.pos.z < 109 || this.player.pos.z > 130 || Math.abs(this.player.pos.y - this.world.keep.base) > 4)) {
      this.player.pos.set(0, this.world.keep.base, 112);
      this.player.vel.set(0, 0, 0);
      this.showBanner("THE COUNCIL WAITS", "The kingdom's first decisions are in the hall");
    }

    const ctx = this.ctx(dt);

    // ---- player ----
    const input = this.buildInput(raw);
    const beforePlayerState = this.player.state;
    this.player.update(input, ctx);
    this.updateFilter(dt, ctx);
    if (this.trialPhase === "dodge" && beforePlayerState !== this.player.state &&
        (this.player.state === "roll" || this.player.state === "backstep")) {
      this.trialPhase = "parry";
      this.showBanner("TRUST THE TIMING", "Tap RIGHT CLICK as Aldrich's strike lands");
      this.emit();
    }

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
      if (this.epiloguePhase === "active") { e.rig.root.visible = false; continue; }
      if (e.dormant) { e.rig.root.visible = false; continue; } // Act IV boss stays hidden until the story wakes him
      if (prologueOn) { e.rig.root.visible = false; continue; }
      const dx = e.pos.x - px;
      const dz = e.pos.z - pz;
      const d2 = dx * dx + dz * dz;
      const near = d2 < 80 * 80;
      const veryFar = d2 > 220 * 220;
      // Bosses always render (their bars need to work), effigies always render.
      const alwaysVisible = e.kind === "boss" || e.tutorialTag !== "";
      e.rig.root.visible = alwaysVisible || !veryFar;
      if (near) {
        e.update(ctx);
      } else if (doFarTick) {
        // Cheap sleep tick — still ages state timers and the death dissolve,
        // still respects aggro reset, but skips full AI/animation per frame.
        e.update(ctx);
      }
      if (!e.dead && e.kind !== "boss") alive++;
    }

    // boss music trigger
    // Boss music trigger — Malenkar or a shard guardian.
    const anyBossActive = !prologueOn && (
      (this.boss.aggro && !this.boss.dead) ||
      this.shardBosses.some((b) => b.aggro && !b.dead));

    // ---- the warlord's ward — spawn the conduits the moment he takes the field ----
    if (this.boss.aggro && !this.boss.dead && this.pylons.length === 0) {
      this.spawnPylons();
    }
    const wardAlive = this.pylons.some((p) => !p.dead) && !this.mainPhase2Done;
    this.boss.damageTakenMul = wardAlive ? 0.38 : 1;
    // conduit pylons bleed stolen light while they stand
    for (const p of this.pylons) {
      if (!p.dead && Math.random() < 0.3) {
        this.particles.emit({ x: p.pos.x, y: p.pos.y + 3.6, z: p.pos.z, count: 1, speed: 1.5, size: 6, life: 0.8, color: 0x3aa0ff, grav: -2 });
      }
    }

    // ---- 50% — Malenkar seizes the engine ----
    if (this.boss.aggro && !this.boss.dead && !this.mainPhase2Done
        && this.boss.hp <= this.boss.maxHp * 0.5) {
      this.enterMalenkarPhase2();
    }

    // ---- the Hollow Captain's old grief, spoken once ----
    const captain = this.shardBosses.find((b) => b.shardId === "captain");
    if (captain && !this.captainTauntDone && !captain.dead && captain.hp < captain.maxHp) {
      this.captainTauntDone = true;
      this.showBanner("THE HOLLOW CAPTAIN", DIALOGUE.captainTaunt[0]);
    }
    if (this.bossAwake && !anyBossActive) {
      this.bossAwake = false;
      audio.setIntensity(0);
    }
    if (!this.bossAwake && anyBossActive) {
      this.bossAwake = true;
      audio.setIntensity(1);
      // Pick the most-relevant boss for the banner + lock target.
      let engaged: NPC | null = null;
      if (this.boss.aggro && !this.boss.dead) engaged = this.boss;
      else engaged = this.shardBosses.find((b) => b.aggro && !b.dead) ?? null;
      if (engaged) {
        this.showBanner(engaged.name, engaged === this.boss ? "The Warlord of the Ashveil" : "A Guardian of the Shards");
        this.lockTarget = engaged;
      }
    }

    // The king breaks at a quarter health — blood first drawn, glory or ruin.
    if (!this.aldrichChargeInDone && !this.boss.dead
        && this.boss.hp <= this.boss.maxHp * 0.25 && this.boss.hp > 0) {
      this.startAldrichChargeIn();
    }

    this.updateProjectiles(dt);
    this.particles.update(dt);
    this.waves.update(dt, this.camera);
    this.embers.update(dt, this.time, this.camera.position);
    this.world.update(dt, this.player.pos);
    this.updatePrologue(raw);
    this.updatePrologueMotion(raw);
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
        this.clearBloodstain();
        this.saveGame();
      }
    }

    // ---- the Raeku in Kingsfall Keep — every Shard drags its light back ----
    {
      const k = this.shardsCollected / 8;
      if (this.world.keepRaekuCore) {
        this.world.keepRaekuCore.emissiveIntensity = 0.85 + k * 2.1 + Math.sin(this.time * 2.1) * 0.18 * (0.4 + k);
      }
      if (this.world.keepRaekuLight) {
        this.world.keepRaekuLight.intensity = 3.2 + k * 9.5 + Math.sin(this.time * 2.2) * 0.7 * (0.3 + k);
      }
    }

    // ---- the Ashfall Relics — caches glimmer in the dark ----
    for (const pickup of this.relicPickups) {
      if (pickup.taken) continue;
      pickup.group.rotation.y += dt * 1.4;
      const bob = Math.sin(this.time * 2.1 + pickup.pos.x) * 0.16;
      pickup.group.children[0].position.y = 1.35 + bob;
      pickup.group.children[1].position.y = 1.35 + bob;
      if (Math.random() < 0.08) {
        this.particles.emit({ x: pickup.pos.x, y: pickup.pos.y + 1.5, z: pickup.pos.z, count: 1, speed: 0.7, size: 5, life: 0.9, color: 0xffd98a, grav: -1.2 });
      }
    }
    if (this.grapplePickup && !this.grapplePickup.taken) {
      this.grapplePickup.group.rotation.y += dt * 1.4;
      const bob = Math.sin(this.time * 2.1 + 4) * 0.16;
      this.grapplePickup.group.children[0].position.y = 1.35 + bob;
      this.grapplePickup.group.children[1].position.y = 1.35 + bob;
      if (Math.random() < 0.08) {
        this.particles.emit({ x: this.grapplePickup.pos.x, y: this.grapplePickup.pos.y + 1.5, z: this.grapplePickup.pos.z, count: 1, speed: 0.7, size: 5, life: 0.9, color: 0x8fd4ff, grav: -1.2 });
      }
    }
    for (const c of this.collectibles) {
      if (c.taken) continue;
      c.group.rotation.y += dt * 1.1;
      const bob = Math.sin(this.time * 2.1 + c.pos.x * 0.7) * 0.14;
      c.group.children[0].position.y = 1.0 + bob;
      c.group.children[1].position.y = 1.0 + bob;
    }

    // ---- a claimed relic waits for the next free breath, then takes Kinter's hand ----
    if (this.pendingRelicEquip && this.player.canAct() && !prologueOn && this.epiloguePhase !== "active" && !this.dialogue) {
      const id = this.pendingRelicEquip;
      if (this.player.weaponKind !== id) this.switchWeapon(id);
      this.pendingRelicEquip = null;
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
    this.lyekaiRelationsTick();
    const graceIdx = this.nearestGraceIdx();
    let nearestFrontier: { id: string; name: string; title: string } | null = null;
    let frontierBest = 9.5;
    let nearestVillager: { id: string; name: string; title: string } | null = null;
    let villagerBest = 4.3;
    for (const [key, npc] of this.frontierNpcs) {
      const d = Math.hypot(this.player.pos.x - npc.pos.x, this.player.pos.z - npc.pos.z);
      if (key.startsWith("v_")) {
        if (d < villagerBest) { villagerBest = d; nearestVillager = { id: key, name: npc.name, title: npc.title }; }
      } else if (d < frontierBest) {
        frontierBest = d;
        nearestFrontier = { id: npc.name.toLowerCase(), name: npc.name, title: npc.title };
      }
    }
    if (graceIdx >= 0) this.discoverGrace(graceIdx);
    const village = this.nearestVillage();
    const lore = this.nearestLore();
    if (!prologueOn) this.prompt = null;
    if (!prologueOn && !this.dead && !this.dialogue && !this.mapOpen && !this.trialActor) {
      if (this.epiloguePhase === "active") {
        const step = EPILOGUE_STEPS[this.epilogueStage];
        if (step && Math.hypot(this.player.pos.x - step.x, this.player.pos.z - step.z) < 3.2) {
          this.prompt = `F — ${step.prompt}`;
          if (this.interactBuffer > 0) {
            this.interactBuffer = 0;
            this.beginEpilogueStep();
          }
        }
      } else if (kd < 5.5) {
        this.prompt = "F — Speak with King Aldrich";
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          // Route to the right speech based on where in the story we are.
          let kind: string;
          switch (this.questStage) {
            case 0: kind = "intro"; break;
            case 1: kind = "blades"; break;
            case 2: kind = "arcane"; break;
            case 3: {
              const s = this.shardsCollected;
              // The king's arc — undelivered milestone speeches take precedence.
              const MILESTONES: Array<[number, string]> = [
                [2, "aldrichMilestone2"],
                [4, "aldrichMilestone4"],
                [6, "aldrichMilestone6"],
                [8, "aldrichMilestone8"],
              ];
              kind = this.southBriefed
                ? (s >= 8 ? "finalWar" : s === 7 ? "oneChoirLeft" : "huntChoir")
                : "south";
              if (this.southBriefed) {
                for (const [n, k] of MILESTONES) {
                  if (s >= n && !this.aldrichMilestones.has(n)) { kind = k; break; }
                }
              }
              break;
            }
            case 9: kind = "done"; break;
            default: kind = "done";
          }
          this.startDialogue(kind);
        }
      } else if (this.nearestReachQuest()) {
        const hit = this.nearestReachQuest()!;
        this.prompt = `F — ${hit.step ? hit.step.verb : (hit.def.verb ?? "Survey")}`;
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          if (hit.step) this.completeQuestStep(hit.def, hit.step);
          else {
            this.reachedSpots.add(hit.def.id);
            this.completeQuest(hit.def, this.giverName(hit.def.giver));
          }
        }
      } else if (nearestFrontier) {
        const npc = nearestFrontier;
        this.prompt = `F — Speak with ${npc.name} ${npc.title}`;
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.talkToFrontier(npc);
        }
      } else if (nearestVillager) {
        const npc = nearestVillager;
        this.prompt = `F — Speak with ${npc.name} ${npc.title}`;
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.talkToFrontier(npc);
        }
      } else if (this.nearestRelicPickup()) {
        const pickup = this.nearestRelicPickup()!;
        this.prompt = `F — Take the ${pickup.name}`;
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.grantRelic(pickup);
        }
      } else if (this.grapplePickup && !this.grapplePickup.taken
          && Math.hypot(this.player.pos.x - this.grapplePickup.pos.x, this.player.pos.z - this.grapplePickup.pos.z) < 2.7) {
        this.prompt = "F — Take the Grapple-Line";
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.grantGrapple(this.grapplePickup);
        }
      } else if (this.nearestCollectible()) {
        const c = this.nearestCollectible()!;
        this.prompt = `F — Take ${c.name}`;
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.collectToken(c);
        }
      } else if (village) {
        const quote = village.level < village.costs.length ? this.villageUpgradeQuote(village) : null;
        const label = village.type === "blade" ? "Forge blade" : village.type === "vigor" ? "Strengthen body" : "Deepen arcane fire";
        this.prompt = village.level >= village.costs.length
          ? `F — ${village.name} · fully upgraded`
          : `F — ${label} at ${village.name} (${quote!.cost.toLocaleString()} runes${quote!.discounted ? quote!.torin ? " · Torin 50%" : " · Honored -15%" : ""})`;
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.upgradeAtVillage(village);
        }
      } else if (this.nearestShrine()) {
        const s = this.nearestShrine()!;
        this.prompt = `F — Claim the ${s.name}`;
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.claimShrine(s);
        }
      } else if (graceIdx >= 0) {
        this.prompt = "F — Rest at Grace   ·   M — Map & Travel";
        if (this.interactBuffer > 0) {
          this.interactBuffer = 0;
          this.activeGraceIdx = graceIdx;
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

    // ---- post fx uniforms ----
    this.damageFx += ((1 - this.player.hp / this.player.maxHp > 0.65 ? 0.4 : 0) - this.damageFx) * 0.05;
    const hurtPulse = this.player.hurtCooldown > 0 ? this.player.hurtCooldown / 0.35 : 0;
    this.graceFx = Math.max(0, this.graceFx - raw * 0.55);
    this.grade.uniforms.uTime.value = this.time;
    this.grade.uniforms.uDamage.value = Math.min(0.55, this.damageFx + hurtPulse * 0.35);
    this.grade.uniforms.uGrace.value = this.graceFx;
    this.grade.uniforms.uDeath.value = this.deathFx;
    this.bloom.strength = 0.5 + (this.boss.aggro && !this.boss.dead ? 0.18 : 0) + this.graceFx * 0.5;

    if (this.bannerT > 0) this.bannerT -= raw;

    if (this.victory && (this.epiloguePhase === null || this.epiloguePhase === "complete") && !this.dialogue && !this.victoryShown && !this.victoryDismissed && this.time - this.victoryAt > 6.5) {
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
    if (alive !== undefined) this.lastAlive = alive;
    const p = this.player;
    const pro = this.prologueStarted && !this.prologueComplete ? PROLOGUE_BEATS[this.prologueIdx] : null;
    // rolling perf readout for ?perf=1 — avg / p95 / worst frame times in ms
    let perf: { avg: number; p95: number; worst: number } | null = null;
    if (this.perfCount >= 30) {
      const sample = this.perfRing.slice(0, this.perfCount).sort((a, b) => a - b);
      const sum = sample.reduce((a, b) => a + b, 0);
      perf = {
        avg: sum / sample.length,
        p95: sample[Math.floor((sample.length - 1) * 0.95)],
        worst: sample[sample.length - 1],
      };
    }
    let lockOn: { x: number; y: number } | null = null;
    if (this.lockTarget && !this.lockTarget.dead) {
      const t = this.lockTarget;
      const v = new THREE.Vector3(t.pos.x, t.pos.y + t.centerY * t.scale, t.pos.z).project(this.camera);
      if (v.z < 1) {
        lockOn = {
          x: Math.max(2, Math.min(98, (v.x * 0.5 + 0.5) * 100)),
          y: Math.max(3, Math.min(95, (-v.y * 0.5 + 0.5) * 100)),
        };
      }
    }
    const state: HudState = {
      perf,
      hp: p.hp, maxHp: p.maxHp,
      stamina: p.stamina, maxStamina: p.maxStamina,
      fp: p.fp, maxFp: p.maxFp,
      flasks: p.flasks, maxFlasks: p.maxFlasks,
      shards: this.shardsCollected,
      powers: [...this.player.shardPowers],
      runes: p.runes,
      target: this.lockTarget && !this.lockTarget.dead && this.lockTarget.kind !== "boss"
        ? { name: this.lockTarget.name, hp: this.lockTarget.hp, maxHp: this.lockTarget.maxHp }
        : null,
      boss: this.lockTarget && !this.lockTarget.dead && this.lockTarget.kind === "boss"
        ? { name: this.lockTarget.name, hp: this.lockTarget.hp, maxHp: this.lockTarget.maxHp, phase: this.lockTarget.phaseIdx, warning: this.lockTarget.signatureWarning }
        : this.boss.aggro && !this.victory
          ? { name: this.boss.name, hp: this.boss.hp, maxHp: this.boss.maxHp, phase: this.boss.phaseIdx, warning: this.boss.signatureWarning }
          : null,
      prompt: pro ? null : this.prompt,
      lockOn,
      enemiesLeft: this.lastAlive,
      fps: this.fps,
      bloodstain: this.bloodstain?.runes ?? 0,
      banner: this.bannerT > 0 ? this.banner : null,
      dead: this.dead,
      victory: this.victory,
      victoryShown: this.victoryShown,
      paused: this.paused,
      started: this.started,
      area: pro
        ? pro.area
        : Math.hypot(p.pos.x, p.pos.z) < WORLD.arenaRadius + 8
          ? "The Black Citadel"
          : Math.hypot(p.pos.x - WORLD.castle.x, p.pos.z - WORLD.castle.z) < WORLD.castle.r + 6
            ? "Kingsfall Keep"
            : "Ashveil Plains",
      popups: this.popups,
      objective: pro && pro.objective ? pro.objective : this.epiloguePhase === "active" ? `A KING NOT BORN HERE — ${EPILOGUE_STEPS[this.epilogueStage].title}` : this.trialObjective() ?? (this.questStage === 3
        ? `THE ASHVEIL GAUNTLET — Shards of Light: ${this.shardsCollected}/8`
        : OBJECTIVES[Math.min(this.questStage, OBJECTIVES.length - 1)]),
      hint: pro ? "" : this.epiloguePhase === "active" ? "Follow the light · press F to make the kingdom's next decision" : this.trialHint() ?? HINTS[Math.min(this.questStage, HINTS.length - 1)],
      marker: this.computeMarker(),
      dialogue: this.dialogue,
      upgrades: this.upgrades,
      weapon: p.weaponKind,
      relicLoadout: { owned: [...p.relicsOwned], slots: [...this.relicSlots] },
      relicHeat: Math.round(p.relicHeat),
      overheating: p.overheatT > 0,
      overdrive: p.overdriveT,
      overdriveCooldown: p.overdriveCooldown,
      ashBursts: p.ashBursts,
      maxAshBursts: p.maxAshBursts,
      filter: { condition: p.filterCondition, stage: filterStage(p.filterCondition), hazard: this.filterHazard },
      grappleKnown: p.grappleKnown,
      grappleTarget: p.grappleKnown
        ? this.lockTarget && !this.lockTarget.dead && !this.lockTarget.dormant && Math.hypot(this.lockTarget.pos.x - p.pos.x, this.lockTarget.pos.z - p.pos.z) <= 18
          ? this.lockTarget.name
          : selectGrappleAnchor(p.pos, this.grappleAimYaw(), this.world.grappleAnchors)?.name ?? null
        : null,
      blessing: p.sanctuaryBlessing,
      quests: [...this.questsActive].slice(0, 4).map((qid) => {
        const def = QUEST_BY_ID[qid];
        const home = def.kind === "cull" ? this.villages.find((v) => v.id === this.questHome(def.giver)) : null;
        return { id: def.id, name: def.name, hint: home ? `${def.hint} · Search near ${home.name}` : def.hint, progress: this.questProgress(def) };
      }),
      journalOpen: this.journalOpen,
      journalUnlocked: [...this.journalUnlocked],
      allQuests: this.journalOpen
        ? QUESTS.map((q) => ({
            id: q.id,
            name: q.name,
            hint: q.hint,
            giver: this.giverName(q.giver),
            state: (this.questsDone.has(q.id) ? "done" : this.questsActive.has(q.id) ? "active" : "available") as "active" | "done" | "available",
            progress: this.questsActive.has(q.id) || this.questsDone.has(q.id) ? this.questProgress(q) : "—",
          }))
        : [],
      mapOpen: this.mapOpen,
      map: {
        player: { x: p.pos.x, z: p.pos.z, yaw: p.yaw },
        // the Map of Eight stays a blank chart until Pip teaches the resonator
        villages: this.shardBeaconKnown ? this.villages.map((v) => {
          const quote = v.level < v.costs.length ? this.villageUpgradeQuote(v) : null;
          const standing = this.settlementStanding(v);
          return {
            name: v.name,
            x: v.x,
            z: v.z,
            level: v.level,
            available: !!quote && p.runes >= quote.cost,
            nextCost: quote?.cost ?? null,
            standing,
            standingLabel: this.standingLabel(standing),
            discounted: quote?.discounted ?? false,
          };
        }) : [],
        bosses: this.shardBeaconKnown ? [this.boss, ...this.shardBosses].map((b) => ({
          name: b.name,
          x: b.pos.x,
          z: b.pos.z,
          main: b.bossRole === "main",
          dead: b.dead,
        })) : [],
        graces: this.world.graceSites.map((g, i) => ({
          name: g.name,
          x: g.pos.x,
          z: g.pos.z,
          discovered: this.discoveredGraces.has(i),
          active: i === this.activeGraceIdx,
          idx: i,
        })),
        questMarkers: this.activeQuestMarkers(),
        marker: this.beacon.visible ? { x: this.beaconTarget.x, z: this.beaconTarget.z } : null,
        beacon: this.shardBeaconKnown,
      },
      prologue: this.prologueHud(),
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
    this.setAgentControl(false);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.renderer.domElement.removeEventListener("wheel", this.onWheel);
    this.renderer.domElement.removeEventListener("contextmenu", this.onContext);
    this.composer.dispose();
    this.disposePrologueCast();
    this.disposePrologueSet();
    this.world.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
      else mesh.material?.dispose?.();
    });
    this.world.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Give the benchmark exclusive movement/combat input, or return it to the player. */
  setAgentControl(active: boolean) {
    this.agentControlActive = active;
    this.agentThinking = false;
    this.agentMove = null;
    this.agentGuardRemaining = 0;
    this.mouse.left = false;
    this.mouse.right = false;
    this.attackBuffer = this.heavyBuffer = this.rollBuffer = this.castBuffer = this.healBuffer = this.interactBuffer = 0;
    for (const key of Object.keys(this.keys)) this.keys[key] = false;
  }

  /** Freeze the live world while a remote benchmark decision is in flight. */
  setAgentThinking(thinking: boolean) {
    this.agentThinking = thinking && this.agentControlActive && this.started && !this.paused;
  }

  /** Compact, live, structured state for an AI benchmark observation. */
  getAgentSnapshot() {
    const p = this.player;
    const pro = this.prologueStarted && !this.prologueComplete ? PROLOGUE_BEATS[this.prologueIdx] : null;
    const distance = (x: number, z: number) => Math.hypot(p.pos.x - x, p.pos.z - z);
    const kingPromptStages = [0, 3, 9];
    const prompt = this.prompt?.includes("King Aldrich") && !kingPromptStages.includes(this.questStage) ? null : this.prompt;
    const bosses = [this.boss, ...this.shardBosses].map((enemy) => ({
      index: this.enemies.indexOf(enemy),
      role: enemy.bossRole,
      name: enemy.name,
      x: Number(enemy.pos.x.toFixed(1)),
      z: Number(enemy.pos.z.toFixed(1)),
      distance: Number(distance(enemy.pos.x, enemy.pos.z).toFixed(1)),
      verticalGap: Number(Math.abs(p.pos.y - enemy.pos.y).toFixed(1)),
      hp: Math.ceil(enemy.hp),
      maxHp: enemy.maxHp,
      dead: enemy.dead,
      dormant: enemy.dormant,
      phase: enemy.phaseIdx,
      warning: enemy.signatureWarning,
    }));
    const enemies = this.enemies.map((enemy, index) => ({
      index,
      name: enemy.name,
      kind: enemy.kind,
      x: Number(enemy.pos.x.toFixed(1)),
      z: Number(enemy.pos.z.toFixed(1)),
      distance: Number(distance(enemy.pos.x, enemy.pos.z).toFixed(1)),
      verticalGap: Number(Math.abs(p.pos.y - enemy.pos.y).toFixed(1)),
      hp: Math.ceil(enemy.hp),
      maxHp: enemy.maxHp,
      dead: enemy.dead,
      dormant: enemy.dormant,
      tutorial: enemy.tutorialTag || undefined,
    })).filter((enemy) => !enemy.dead && !enemy.dormant && (enemy.distance < 72 || enemy.tutorial));
    const area = Math.hypot(p.pos.x, p.pos.z) < WORLD.arenaRadius + 8
      ? "The Black Citadel"
      : Math.hypot(p.pos.x - WORLD.castle.x, p.pos.z - WORLD.castle.z) < WORLD.castle.r + 6
        ? "Kingsfall Keep"
        : "Ashveil Plains";
    return {
      started: this.started,
      paused: this.paused,
      mapOpen: this.mapOpen,
      dead: this.dead,
      victory: this.victory || this.postgame,
      victoryShown: this.victoryShown,
      victoryDismissed: this.victoryDismissed,
      epilogue: { active: this.epiloguePhase === "active", stage: this.epilogueStage, phase: this.epiloguePhase },
      area,
      questStage: this.questStage,
      objective: pro && pro.objective ? pro.objective : this.epiloguePhase === "active" ? `A KING NOT BORN HERE — ${EPILOGUE_STEPS[this.epilogueStage].title}` : this.trialObjective() ?? (this.questStage === 3
        ? `THE ASHVEIL GAUNTLET — Shards of Light: ${this.shardsCollected}/8`
        : OBJECTIVES[Math.min(this.questStage, OBJECTIVES.length - 1)]),
      hint: pro ? pro.hint : this.epiloguePhase === "active" ? "Follow the light and interact" : this.trialHint() ?? HINTS[Math.min(this.questStage, HINTS.length - 1)],
      player: {
        x: Number(p.pos.x.toFixed(1)),
        y: Number(p.pos.y.toFixed(1)),
        z: Number(p.pos.z.toFixed(1)),
        yaw: Number(p.yaw.toFixed(2)),
        hp: Math.ceil(p.hp),
        maxHp: p.maxHp,
        stamina: Math.ceil(p.stamina),
        maxStamina: p.maxStamina,
        fp: Math.ceil(p.fp),
        maxFp: p.maxFp,
        flasks: p.flasks,
        maxFlasks: p.maxFlasks,
        shards: this.shardsCollected,
      powers: [...this.player.shardPowers],
      runes: p.runes,
        weapon: p.weaponKind,
        upgrades: { ...this.upgrades },
      },
      keepRoute: {
        groundToHall: { x: -7.6, z: 111, y: Number(this.world.keep.base.toFixed(1)), label: "western stair entrance" },
        hallLanding: { x: -7.6, z: 129, y: Number(this.world.keep.f2.toFixed(1)), label: "Hall of Blades landing beyond the stair opening" },
        hallSafeCrossing: { x: -3.4, z: 129, y: Number(this.world.keep.f2.toFixed(1)), label: "Hall floor beyond the western stair opening" },
        hallToTerrace: { x: 7.6, z: 129, y: Number(this.world.keep.f2.toFixed(1)), label: "eastern stair entrance beyond the floor opening" },
        terraceLanding: { x: 7.6, z: 109.6, y: Number(this.world.keep.f3.toFixed(1)), label: "Terrace of Trials landing beyond the stair opening" },
        terraceSafeCrossing: { x: 0, z: 109.6, y: Number(this.world.keep.f3.toFixed(1)), label: "Terrace floor south of the eastern stair opening" },
      },
      keepExitRoute: {
        terraceSouthCrossing: { x: 0, z: 109.6, y: Number(this.world.keep.f3.toFixed(1)), label: "Terrace floor south of the eastern stair opening" },
        terraceStairTop: { x: 7.6, z: 110, y: Number(this.world.keep.f3.toFixed(1)), label: "Terrace end of the eastern stair" },
        easternStairLanding: { x: 7.6, z: 129, y: Number(this.world.keep.f2.toFixed(1)), label: "second-floor end of the eastern stair" },
        westernStairTop: { x: -7.6, z: 129, y: Number(this.world.keep.f2.toFixed(1)), label: "second-floor end of the western stair" },
        westernStairLanding: { x: -7.6, z: 111, y: Number(this.world.keep.base.toFixed(1)), label: "ground-floor end of the western stair" },
        keepDoor: { x: 0, z: 106, y: Number(this.world.keep.base.toFixed(1)), label: "south keep doorway" },
        castleGate: { x: 0, z: 94, label: "center of the south castle gate" },
        beyondCastle: { x: 0, z: 87, label: "outside Kingsfall Keep" },
      },
      prompt: pro ? this.prologuePrompt : prompt,
      dialogue: this.dialogue ? {
        speaker: this.dialogue.speakers?.[this.dialogue.idx] ?? this.dialogue.speaker,
        line: this.dialogue.lines[this.dialogue.idx],
        index: this.dialogue.idx + 1,
        total: this.dialogue.lines.length,
      } : null,
      king: {
        x: Number(this.kingPos.x.toFixed(1)),
        z: Number(this.kingPos.z.toFixed(1)),
        distance: Number(distance(this.kingPos.x, this.kingPos.z).toFixed(1)),
        visible: this.king.root.visible,
      },
      effigies: this.effigies.map((effigy) => ({
        index: this.enemies.indexOf(effigy),
        name: effigy.name,
        tutorial: effigy.tutorialTag,
        x: Number(effigy.pos.x.toFixed(1)),
        z: Number(effigy.pos.z.toFixed(1)),
        y: Number(effigy.pos.y.toFixed(1)),
        distance: Number(distance(effigy.pos.x, effigy.pos.z).toFixed(1)),
        verticalGap: Number(Math.abs(p.pos.y - effigy.pos.y).toFixed(1)),
        hp: Math.ceil(effigy.hp),
        dead: effigy.dead,
      })),
      enemies,
      bosses,
      villages: this.villages.map((v) => {
        const quote = v.level < v.costs.length ? this.villageUpgradeQuote(v) : null;
        return {
          name: v.name,
          x: v.x,
          z: v.z,
          distance: Number(distance(v.x, v.z).toFixed(1)),
          upgrade: v.type,
          level: v.level,
          standing: this.settlementStanding(v),
          nextCost: quote?.cost ?? null,
          affordable: !!quote && p.runes >= quote.cost,
        };
      }),
      graces: this.world.graceSites.map((site, index) => ({
        index,
        name: site.name,
        x: site.pos.x,
        z: site.pos.z,
        distance: Number(distance(site.pos.x, site.pos.z).toFixed(1)),
        discovered: this.discoveredGraces.has(index),
        active: index === this.activeGraceIdx,
      })),
      lore: this.world.loreStones.map((stone) => ({
        id: stone.id,
        x: stone.pos.x,
        z: stone.pos.z,
        distance: Number(distance(stone.pos.x, stone.pos.z).toFixed(1)),
        read: this.loreRead.has(stone.id),
      })),
      beacon: this.beacon.visible ? {
        x: Number(this.beaconTarget.x.toFixed(1)),
        z: Number(this.beaconTarget.z.toFixed(1)),
        distance: Number(distance(this.beaconTarget.x, this.beaconTarget.z).toFixed(1)),
      } : null,
      conduits: (() => {
        const live = this.pylons.filter((p) => !p.dead);
        return { alive: live.length, total: 3, ward: live.length > 0 && !this.mainPhase2Done, ripped: this.mainPhase2Done };
      })(),
      relics: {
        owned: [...this.player.relicsOwned],
        slots: [...this.relicSlots],
        current: this.player.weaponKind,
        heat: Math.round(this.player.relicHeat),
        overheating: this.player.overheatT > 0,
        overdrive: Number(this.player.overdriveT.toFixed(1)),
        overdriveCooldown: Number(this.player.overdriveCooldown.toFixed(1)),
        grappleKnown: this.player.grappleKnown,
        ashBursts: this.player.ashBursts,
        filterCondition: Math.round(this.player.filterCondition),
        filterHazard: this.filterHazard,
      },
      prologue: this.prologueStarted ? {
        active: this.prologueActive,
        complete: this.prologueComplete,
        beatId: PROLOGUE_BEATS[this.prologueIdx].id,
        title: PROLOGUE_BEATS[this.prologueIdx].title,
        area: PROLOGUE_BEATS[this.prologueIdx].area,
        objective: PROLOGUE_BEATS[this.prologueIdx].objective,
        hint: PROLOGUE_BEATS[this.prologueIdx].hint,
        prompt: this.prologuePrompt,
        beatElapsed: Number(this.prologueBeatTime.toFixed(1)),
        beatDuration: PROLOGUE_BEATS[this.prologueIdx].duration,
        beatProgress: Number(Math.min(1, this.prologueBeatTime / PROLOGUE_BEATS[this.prologueIdx].duration).toFixed(2)),
        progress: Number(Math.min(1, this.prologueElapsed / PROLOGUE_TOTAL_SECONDS).toFixed(2)),
        elapsed: Number(this.prologueElapsed.toFixed(1)),
        minSeconds: PROLOGUE_MIN_SECONDS,
        meetingAtSeconds: PROLOGUE_TOTAL_SECONDS,
      } : null,
    };
  }

  /** Queue a walk/run toward a world-space target (shared by player + benchmark). */
  private queueMoveTo(action: { x: number; z: number; seconds?: number; sprint?: boolean }): { ok: boolean; note: string } {
    if (!Number.isFinite(action.x) || !Number.isFinite(action.z)) return { ok: false, note: "move_to needs finite world x and z" };
    const dx = action.x - this.player.pos.x;
    const dz = action.z - this.player.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1.8) return { ok: true, note: "already at the target" };
    const seconds = Math.max(0.2, Math.min(4, Number.isFinite(action.seconds) ? action.seconds! : Math.min(3, distance / (action.sprint ? 8.4 : 4.6))));
    this.agentMove = {
      targetX: action.x,
      targetZ: action.z,
      sprint: !!action.sprint,
      remaining: seconds,
    };
    return { ok: true, note: `moving toward (${action.x.toFixed(1)}, ${action.z.toFixed(1)}), ${distance.toFixed(1)} units away` };
  }

  /** Apply one validated benchmark action through the live player/game systems. */
  performAgentAction(action: AshveilAgentAction): { ok: boolean; note: string } {
    if (!this.agentControlActive) return { ok: false, note: "benchmark control is not active" };
    if (!this.started) return { ok: false, note: "game has not started" };
    if (this.paused) return { ok: false, note: "game is paused" };
    if (this.dead) return { ok: false, note: "player is down; wait for the Grace respawn" };
    // The opening sequence owns the input contract until it hands the world back.
    if (this.prologueActive && !this.prologueComplete) return this.performPrologueAction(action);
    if (this.dialogue && action.action !== "interact" && action.action !== "wait") return { ok: false, note: "finish the current conversation first" };
    if (this.epiloguePhase === "active" && !["move_to", "interact", "wait"].includes(action.action)) return { ok: false, note: "only movement and conversation are available during the epilogue" };
    if (this.mapOpen && action.action !== "map" && action.action !== "fast_travel" && action.action !== "wait") {
      return { ok: false, note: "map is open; close it or choose a discovered Grace to travel" };
    }
    const kingPromptStages = [0, 3, 9];
    const interactionPrompt = this.prompt?.includes("King Aldrich") && !kingPromptStages.includes(this.questStage) ? null : this.prompt;
    if (this.victoryShown && action.action !== "continue" && action.action !== "wait") {
      return { ok: false, note: "victory screen is open; continue to finish the benchmark" };
    }

    const boundedSeconds = (seconds: number | undefined, fallback = 1) => Math.max(0.2, Math.min(4, Number.isFinite(seconds) ? seconds! : fallback));
    switch (action.action) {
      case "move_to": return this.queueMoveTo(action);
      case "attack": this.attackBuffer = 0.22; return { ok: true, note: "light attack queued" };
      case "heavy": this.heavyBuffer = 0.22; return { ok: true, note: "heavy attack queued" };
      case "dodge": this.rollBuffer = 0.22; return { ok: true, note: "dodge queued" };
      case "jump": return this.player.jump(this.ctx(0)) ? { ok: true, note: "jumped" } : { ok: false, note: "cannot jump now" };
      case "grapple": return this.fireGrapple() ? { ok: true, note: "Grapple-Line fired" } : { ok: false, note: "Grapple-Line unavailable or insufficient core energy" };
      case "filter": return this.replaceFilter() ? { ok: true, note: "filter replaced" } : { ok: false, note: "filter is full, no spare remains, or Kinter cannot act" };
      case "overdrive": return this.player.activateOverdrive(this.ctx(0)) ? { ok: true, note: "Core Overdrive active" } : { ok: false, note: "Core Overdrive unavailable, cooling down, or insufficient energy" };
      case "cast": this.castBuffer = 0.22; return { ok: true, note: "Sundered Bolt queued" };
      case "heal": this.healBuffer = 0.22; return { ok: true, note: "Sacred Flask queued" };
      case "guard": this.agentGuardRemaining = boundedSeconds(action.seconds, 0.7); return { ok: true, note: "guard held; the first 0.2 seconds are the parry window" };
      case "interact":
        if (this.dialogue) { this.advanceDialogue(); return { ok: true, note: "advanced the current dialogue line" }; }
        if (this.victoryShown) { this.dismissVictory(); return { ok: true, note: "continued beyond the victory screen" }; }
        if (!interactionPrompt) return { ok: false, note: "there is no objective-relevant interaction prompt here" };
        this.interactBuffer = 0.3;
        return { ok: true, note: interactionPrompt };
      case "map": {
        const wasOpen = this.mapOpen;
        this.toggleMap();
        return this.mapOpen !== wasOpen
          ? { ok: true, note: this.mapOpen ? "map opened" : "map closed" }
          : { ok: false, note: "map unavailable during combat or another scene" };
      }
      case "fast_travel": {
        if (!Number.isInteger(action.grace_index) || !this.discoveredGraces.has(action.grace_index)) return { ok: false, note: "Grace is not discovered" };
        if (!this.mapOpen) this.toggleMap();
        if (!this.fastTravel(action.grace_index)) return { ok: false, note: "cannot travel during combat or this scene" };
        return { ok: true, note: `traveled to ${this.world.graceSites[action.grace_index].name}` };
      }
      case "lock_on": {
        const target = Number.isInteger(action.target_index) ? this.enemies[action.target_index!] : null;
        if (!target || target.dead || target.dormant) return { ok: false, note: "target is not available" };
        this.lockTarget = target;
        return { ok: true, note: `locked onto ${target.name}` };
      }
      case "weapon": return this.requestWeapon(action.weapon) ? { ok: true, note: `equipped or queued ${action.weapon}` } : { ok: false, note: "weapon is unavailable" };
      case "relic": return this.equipRelicSlot(action.slot) ? { ok: true, note: `equipped or queued relic slot ${action.slot + 1}` } : { ok: false, note: "relic slot is empty" };
      case "continue":
        if (!this.victoryShown) return { ok: false, note: "there is no victory screen to continue from" };
        this.dismissVictory();
        return { ok: true, note: "continued into free roam" };
      case "wait": return { ok: true, note: `waited ${boundedSeconds(action.seconds, 1).toFixed(1)} seconds` };
      default: return { ok: false, note: "unknown action" };
    }
  }
}
