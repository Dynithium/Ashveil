export type EpilogueStep = 0 | 1 | 2;

export const EPILOGUE_STEPS: { title: string; prompt: string; x: number; z: number }[] = [
  { title: "Secure the Royal Relay", prompt: "Inspect the Royal Relay with Oren and Aldous", x: 0, z: 121 },
  { title: "Protect the frontier", prompt: "Plan the Gatewatch–Sootfall corridor with Lyekai", x: -4, z: 116 },
  { title: "Call the frontier council", prompt: "Convene the representatives", x: 4, z: 116 },
];

/** Dialogue changes with preparation, while both routes reach the same canon ending. */
export function epilogueDialogue(step: EpilogueStep, shards: number, frontierHelp: boolean) {
  if (step === 0) return {
    speakers: ["BROTHER ALDOUS", "OREN", "KINTER", "BROTHER ALDOUS"],
    lines: [
      shards >= 8 ? "The Relay is stable. The eight lattice signals are present, but the recovered core still needs careful monitoring." : "The Raeku is free, but the Relay is uneven. The districts will need power in stages while we repair the network.",
      "A reading belongs to the people who depend on it. Aldous and I can publish the measurements in every ward.",
      "No general or noble house controls the flow alone. Verify it together, and tell the citizens what the numbers mean.",
      "Agreed. We begin with the hospitals, then bring each district online as the Relay can bear it.",
    ],
  };
  if (step === 1) return {
    speakers: ["LYEKAI", "KINTER", "LYEKAI"],
    lines: [
      frontierHelp ? "The people you helped are sending guides and supplies. Gatewatch and Sootfall can secure a corridor together." : "The road from Gatewatch to Sootfall is exposed. We have few volunteers, so the first patrols will move slowly.",
      "Keep the road open for families and repair crews. No village is to be abandoned because it cannot pay.",
      "I'll lead the guard. We'll post the route and its supply reports where the frontier can see them.",
    ],
  };
  return {
    speakers: ["A UOKAN NOBLE", "KINTER", "KINTER", "LYEKAI"],
    lines: [
      "You are not even of our blood. What right have you to command this kingdom?",
      "I know. That's why you should judge what I do, not where I was born.",
      "The frontier will have seats at this council. The throne will not decide alone which communities can breathe.",
      "The guard will answer to the kingdom, Your Majesty. The representatives are ready to begin.",
    ],
  };
}

export const EPILOGUE_CLOSING = [
  "The city lights return one district at a time. The Raeku is safe, but Uoka's work has only begun.",
  "Malenkar's surviving followers know of Gretriyon. An official journey home could lead them to Elderville, and the Relay still depends on Kinter's suit.",
  "He trains replacements, shares the crown's power with the council, and sends private messages toward the forest. None reaches his son.",
  "Years pass. The First Blade waits in Elderville; its twin remains at the side of a king who has never stopped trying to find a safe road home.",
  "Ten years after Kinter left, Minslaire takes up his father's blade and walks into the forest to find him.",
];
