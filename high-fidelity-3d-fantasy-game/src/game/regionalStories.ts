import type { QuestDef } from "./quests";

type StoryStep = { place: string; spot: [number, number]; verb: string; text: string[] };
type RegionalStory = {
  id: string; name: string; giver: string; settlement: string; guardianId: string; guardianName: string;
  offer: string[]; steps: [StoryStep, StoryStep]; finding: string[]; guardianOffer: string[]; aftermath: string[];
};

/** Optional regional investigations. Guardians remain accessible at all times. */
export const REGIONAL_STORIES: RegionalStory[] = [
  {
    id: "iron", name: "The Walking Grave", giver: "grigg", settlement: "rusthollow", guardianId: "colossus", guardianName: "The Rusted Colossus",
    offer: ["The Colossus is moving toward the routes that keep Mirage Well supplied. If its hull collapses in the wrong place, the water crews may be buried.", "Read the old tracks and find the targeting record. We need to know where the machine will turn."],
    steps: [
      { place: "THE BROKEN TRACK", spot: [153, -195], verb: "Examine the tracks", text: ["A furrow cuts across the old supply road. The footprints point away from Rusthollow and toward the wells.", "Kinter marks a route the water crews can avoid."] },
      { place: "THE TARGETING RECORD", spot: [163, -191], verb: "Read the targeting record", text: ["A damaged targeting plate lists an evacuation corridor as an enemy approach. The machine has followed the same obsolete order for years.", "The plate bears two kinds of armor in the same unit insignia."] },
    ],
    finding: ["The Colossus is following an old targeting order. The supply crews can use the marked detour while Kinter decides when to face it."],
    guardianOffer: ["Your notes give the crews a road clear of the hull's path. The machine itself will keep walking until someone stops it.", "The Rusted Colossus holds a Shard. Face it when you are ready; I will keep the detour open."],
    aftermath: ["Grigg's crews have begun moving salvage along the marked detour. Mirage Well's water wagons have room to pass again."],
  },
  {
    id: "bastion", name: "Names Beneath the Water", giver: "theron", settlement: "cairnwatch", guardianId: "captain", guardianName: "The Hollow Captain",
    offer: ["The captain held the Drowned Keep when the power failed. I have orders and names, but the account has gaps.", "Find the withdrawal order and the shelter ledger. The dead deserve more than a simple story."],
    steps: [
      { place: "THE WITHDRAWAL ORDER", spot: [-202, 50], verb: "Read the order", text: ["The order diverted power from the fort to civilian shelters. Its seal is Aldrich's; its date is the night the flood reached the gates."] },
      { place: "THE SHELTER LEDGER", spot: [-197, 43], verb: "Read the ledger", text: ["The last entries record wounded soldiers carried to a sealed shelter. The captain signed each transfer until his handwriting failed.", "Both the withdrawal and his stand saved lives. Neither spared the fort."] },
    ],
    finding: ["The order and ledger tell different parts of the same night. Theron's archive can hold both."],
    guardianOffer: ["The captain's armor still patrols the flooded keep, repeating a duty no living officer can release him from.", "If you meet the Hollow Captain, end that vigil gently if you can."],
    aftermath: ["Cairnwatch has added the captain's name to the memorial beside the shelter ledger. The lanterns are sent for the soldiers and the civilians alike."],
  },
  {
    id: "canopy", name: "The Forest That Remembers", giver: "bramh", settlement: "emberperch", guardianId: "stalker", guardianName: "The Ash-Stalker",
    offer: ["The fog hides the paths and something in it copies the sounds of our runners. Hawk has marked two safe lines through the trees.", "Check the lantern and the runner's trail before you follow anything that calls your name."],
    steps: [
      { place: "THE FOG LANTERN", spot: [-238, 80], verb: "Inspect the lantern", text: ["A hooded lantern reveals tracks that vanish as soon as the beam moves. One set of prints has been deliberately copied over another."] },
      { place: "THE RUNNER'S TRAIL", spot: [-244, 72], verb: "Follow the trail", text: ["Hawk's knots mark a route above the fog. Below it, claw marks circle a mechanical projector embedded in a dead tree.", "The sound in the canopy is a warning as well as a lure."] },
    ],
    finding: ["Kinter records the safe trail and the projector's position. The forest's danger is easier to read, even while the fog remains."],
    guardianOffer: ["The Ash-Stalker follows the route beyond those markers. Keep the lantern at your back and listen before it moves.", "You can leave the hunt for later. My runners will use the trail you found."],
    aftermath: ["Ember-Perch's runners have hung fresh lanterns along the marked trail. People are carrying supplies through the canopy again."],
  },
  {
    id: "glass", name: "The Broken Signal", giver: "thorne", settlement: "glintpost", guardianId: "warden", guardianName: "The Prism Warden",
    offer: ["Our mirrors are sending rescue parties toward ambushes. Ellis thinks the fault is in an old relay, not the people operating it.", "Inspect the false signal and the relay's record before another crew follows it."],
    steps: [
      { place: "THE FALSE SIGNAL", spot: [-67, -143], verb: "Inspect the signal", text: ["A mirror catches a legitimate warning and sends its reflection toward the wrong ridge. The mounting has been adjusted by hand."] },
      { place: "THE OPTICAL RELAY", spot: [-69, -155], verb: "Read the relay record", text: ["The relay once shared power readings across the old network. Its emergency command has been replaced with a repeating diversion.", "Kinter marks the correct alignment for Thorne's crew."] },
    ],
    finding: ["The false warning can be separated from the original signal. Glint-Post has the alignment needed to repair its tower."],
    guardianOffer: ["The Prism Warden still guards the old relay approaches. Our crew cannot reach the array safely while it fires on every moving reflection.", "Find the Warden when you choose; I will prepare the repair team."],
    aftermath: ["Glint-Post's signal crew is sending checked warnings across the ridges. The mirrors no longer repeat the false rescue route."],
  },
  {
    id: "marsh", name: "The Last Pressure Line", giver: "garr", settlement: "valvecross", guardianId: "leviathan", guardianName: "The Molten Leviathan",
    offer: ["Close the line and people lose heat. Leave it pulsing and the Leviathan follows the pipes toward the houses.", "Read the regulator and the pressure gauge. There has to be a safer setting than either extreme."],
    steps: [
      { place: "THE REGULATOR", spot: [-145, -325], verb: "Inspect the regulator", text: ["The regulator is intact, but a siphon surge forces its valve to cycle too quickly. Each pulse travels through the marsh pipes."] },
      { place: "THE PRESSURE GAUGE", spot: [-139, -319], verb: "Read the gauge", text: ["The pressure falls between surges. A slower setting would leave the villages with heat while the crews reinforce the line.", "Something large answers the strongest pulse beneath the ground."] },
    ],
    finding: ["Kinter records the safer setting. Garr can reduce the pulses without abandoning the villages to the cold."],
    guardianOffer: ["The lower setting buys us time, not safety. The Molten Leviathan still follows the network.", "Its lair lies south. Come back to me when the line is no longer its hunting ground."],
    aftermath: ["Valvecross crews are holding the line at a steady pressure. Brann's ferries can hear the pumps without mistaking each pulse for the Leviathan."],
  },
  {
    id: "spire", name: "Above the Storm", giver: "corvus", settlement: "galenest", guardianId: "sentinel", guardianName: "The Gale Sentinel",
    offer: ["The gondola is stranded and the Sentinel treats every moving object as a threat. The wind vanes may tell us where the old control line failed.", "Inspect the lower vane and the maintenance record before you approach the tower."],
    steps: [
      { place: "THE LOWER VANE", spot: [211, 99], verb: "Inspect the vane", text: ["A vane points into the gust instead of away from it. Its restraint cable is scored by an electrical discharge."] },
      { place: "THE MAINTENANCE RECORD", spot: [211, 103], verb: "Read the record", text: ["The last technician logged a changed recognition command: the Sentinel now identifies the gondola as an intruder.", "Corvus can use the record to prepare a safe repair after the machine is stopped."] },
    ],
    finding: ["The fault is in the Sentinel's command rather than the gondola cable. Corvus has a route for the repair crews."],
    guardianOffer: ["The Gale Sentinel circles the turbine. We cannot put people back on the line while it attacks the cars.", "Challenge it only when you are ready. The families above the clouds have waited this long."],
    aftermath: ["Gale-Nest's crews have inspected the marked cable. A gondola moves between the towers again, carrying the first supplies across."],
  },
  {
    id: "foundry", name: "A Thousand Empty Suits", giver: "borin", settlement: "anvildeep", guardianId: "forgemaster", guardianName: "The Iron Forgemaster",
    offer: ["The factory still builds armor. Malenkar's command signal sends the finished shells away, but the same furnaces could repair civilian seals.", "Read the production order and the control record before anyone tears the whole plant down."],
    steps: [
      { place: "THE PRODUCTION ORDER", spot: [201, -92], verb: "Read the order", text: ["The stamping schedule has run for years without a living operator. A newer dispatch order sends finished shells toward the Citadel."] },
      { place: "THE CONTROL RECORD", spot: [199, -87], verb: "Inspect the control record", text: ["The hostile dispatch can be isolated from the furnace controls. Both carry the marks of an older shared manufacturing system.", "Borin's crew could preserve the heat while disabling the shipment line."] },
    ],
    finding: ["The furnace and the dispatch line are separate systems. Borin can protect the heat that Anvil-Deep needs."],
    guardianOffer: ["The Iron Forgemaster enforces the old quota. My people cannot reach its controls while it keeps the line running.", "Stop it, and we can turn the furnace toward repairing armor instead of feeding an army."],
    aftermath: ["Anvil-Deep's smiths have redirected the surviving furnace toward seals and repairs. The empty-shell dispatch has stopped."],
  },
  {
    id: "cathedral", name: "The Truth of Two Hearts", giver: "aurelius", settlement: "ashensanctuary", guardianId: "herald", guardianName: "The Pale Herald",
    offer: ["Our oldest diagrams describe a power system divided after the wars. One piece is the Raeku; the other was carried beyond the forest.", "Compare the broken diagram with the sanctuary's border record. The distinction matters to both your homes."],
    steps: [
      { place: "THE BROKEN DIAGRAM", spot: [-21, 77], verb: "Study the diagram", text: ["Two separate cores are drawn as surviving parts of one older system. The Raeku's mark matches the lattice on the sanctuary wall."] },
      { place: "THE BORDER RECORD", spot: [-16, 70], verb: "Read the border record", text: ["The record names Gretriyon as the refuge of the other core. Later accounts replaced the decision to divide the network with a story of naturally divided peoples.", "Malenkar's notes show that he has found the same trail."] },
    ],
    finding: ["Gretriyon's core and Uoka's Raeku are separate survivors of one system. Malenkar knows enough to threaten both."],
    guardianOffer: ["The Pale Herald guards the cathedral road by choice. He believes a single ruler can end the struggle over power.", "Speak with your blade if you must. The Citadel road is still yours to take without his Shard."],
    aftermath: ["The sanctuary has copied the diagrams for the frontier. Its keepers are preserving the history of both cores instead of letting another ruler bury it."],
  },
];

export const REGIONAL_QUESTS: QuestDef[] = REGIONAL_STORIES.flatMap((story) => {
  const investigation = `region-${story.id}-investigation`;
  const guardian = `region-${story.id}-guardian`;
  return [
    { id: investigation, name: story.name, giver: story.giver, kind: "chain", count: story.steps.length,
      hint: "Investigate the two marked sites and return to the local contact",
      offer: story.offer, reminder: ["Follow the marked evidence, then return to me with what you learn."],
      steps: story.steps.map((step, index) => ({ ...step, id: String(index + 1) })),
      done: story.finding, reward: { runes: 300 } },
    { id: guardian, name: `${story.name}: ${story.guardianName}`, giver: story.giver, kind: "guardian", count: 1,
      requires: investigation, guardianId: story.guardianId,
      hint: `Defeat ${story.guardianName}, then speak to the local contact`,
      offer: story.guardianOffer, reminder: [`${story.guardianName} remains at its lair. Return when the Shard is yours.`],
      done: story.aftermath, reward: { runes: 500 } },
  ];
});
