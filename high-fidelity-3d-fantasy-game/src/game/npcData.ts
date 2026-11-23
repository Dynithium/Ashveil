// ---------------------------------------------------------------------------
// THE PEOPLE OF THE ASHVEIL — every named soul the design calls for, keyed to
// their settlement. The engine iterates this table once at world-build time.
// Sootfall's crew (Oren, Torin, Bram, Pip, Milo, Vesper) is spawned separately
// in the engine because their conversations are wired to real rewards.
// ---------------------------------------------------------------------------

export interface VillageNpc {
  /** Unique key. Persisted so one-time gifts survive a reload. */
  id: string;
  /** Settlement id from settlements.ts. */
  village: string;
  name: string;
  title: string;
  /** The bark(s) Kinter hears. Kept short for the dialogue box. */
  line: string[];
  /** One-time gift of runes, tabled by the keeper's goodwill. */
  giftRunes?: number;
  /** One-time gift of sacred flasks. */
  giftFlasks?: number;
  /** The Ashen Sanctuary's blessing — +25 max vigor, once. */
  blessing?: boolean;
}

// Villagers take a golden-angle seat per settlement — see engine.buildVillageNpcs.

export const VILLAGE_NPCS: VillageNpc[] = [
  // ================= Violet Pier — the shore where Kinter washed ashore =====
  { id: "joren", village: "violetpier", name: "JOREN", title: "the harbormaster",
    line: ["My crew saw you come down over the falls before the patrol did. Nobody survives that drop. Nobody ever has.",
           "So tell me — what did they send you out here to find, outlander?"],
    giftRunes: 250 },
  { id: "garrick", village: "violetpier", name: "GARRICK", title: "the seal-weaver",
    line: ["Gretriyon leather. Gretriyon weave. Do you know how rarely I get to work on something this fine out here?",
           "Bring me silk-kelp from the sea cave and I'll stitch your suit seals shut for good."] },
  { id: "oswin", village: "violetpier", name: "OSWIN", title: "the tonic-brewer",
    line: ["Tide-surge tonics, friend — unbottled lightning for sore legs.",
           "Scrape me salt off the flats and I'll have you outrunnin' your own shadow."] },
  { id: "dax", village: "violetpier", name: "DAX", title: "the reef-hunter",
    line: ["Razor-Crab been snappin' our pilins like kindlin'. Tough as a knight's shield, that beast.",
           "Put it down for me and there's scrap in it for you."] },
  { id: "toby", village: "violetpier", name: "TOBY", title: "the tide-diver",
    line: ["I saw something shiny under the foam — near the falls, where you came down. A compass, I think. Pre-split.",
           "Maybe it points the old sea road home. You need that more than I do."] },

  // ================= Gatewatch — the garrison on the drawbridge =============
  { id: "vane", village: "gatewatch", name: "VANE", title: "the garrison captain",
    line: ["Holding the line, outlander. Lyekai hand-picked me to watch your progress — though I confess I watch the Ashveil more than you.",
           "Clear the burrowers undermining the bridge foundation and the crown will see it paid."],
    giftRunes: 200 },
  { id: "kell", village: "gatewatch", name: "SERGEANT KELL", title: "the armory quartermaster",
    line: ["Missing the visor, seein' everything. Speed beats steel, that's what I tell the lads.",
           "Two sentries in the courtyard'll give you a spar, if you think your feet are quicker than their plate."] },
  { id: "fenn", village: "gatewatch", name: "CORPORAL FENN", title: "the scout-master",
    line: ["Three-man recon squad went silent near the Cinder Canopy. Last ping came from the fog line.",
           "Bring me their signal beacons and you'll get the alloys off their packs fair and square."] },
  { id: "aldous", village: "gatewatch", name: "BROTHER ALDOUS", title: "the Raeku technician",
    line: ["Remarkable — your suit runs without a tether. Same blueprint we see in our own armor cores, older than either nation.",
           "Bring me a cracked core from the waste and I'll prove it beyond argument."],
    giftRunes: 200 },
  { id: "leo", village: "gatewatch", name: "SQUIRE LEO", title: "the trainee",
    line: ["S-sir! My practice sword — it's up in the rafters and I... I can't climb. The armor's too heavy.",
           "You move like wind. Could you...?"] },

  // ================= Rusthollow — the tank-hull outpost =====================
  { id: "grigg", village: "rusthollow", name: "FOREMAN GRIGG", title: "the hull-master",
    line: ["Pound, cut, weld, repeat. That's the sound of survival out here.",
           "Bring me crystal off the big hulls and I'll make your fist a siege engine."] },
  { id: "bolt", village: "rusthollow", name: "BOLT", title: "the plater",
    line: ["Sparks, mostly. Occasionally a finger. You learn to weld around your own panic.",
           "I'll graft light alloy onto that Gretriyon frame if you've got the scrap for it."] },
  { id: "cinder", village: "rusthollow", name: "OLD MAN CINDER", title: "the war-archivist",
    line: ["One eye for one war, outlander. This one's still burning.",
           "Dog tags, data-slates, hull plates with serials — bring them to me, I'll tell you what the last world died of."] },
  { id: "kade", village: "rusthollow", name: "KADE", title: "the colossus tracker",
    line: ["The Colossus turns in its sleep. Whole dunes shiver when it does.",
           "Plant charges along the ridge before you face it. Even gods stumble."] },

  // ================= Mirage Well — the subterranean oasis ===================
  { id: "sol", village: "miragewell", name: "KEEPER SOL", title: "the well-warden",
    line: ["Water remembers. This shaft has run cold and clean through three wars — it asks very little of us.",
           "Clear the worms nesting in the lower pumps, and the Well will always know your name."] },
  { id: "rory", village: "miragewell", name: "RORY", title: "the vent-smith",
    line: ["Hot suit, slow sword — that's the arithmetic of the waste.",
           "Let me refit your cooling vents and you'll swing long after the other fools cook."] },
  { id: "huck", village: "miragewell", name: "HUCK", title: "the flask-runner",
    line: ["Well water, friend. Sweet as a spring morning and twice as rare.",
           "One swig and your suit forgets it ever saw a desert."] },
  { id: "jace", village: "miragewell", name: "JACE", title: "the derrick-sniper",
    line: ["Twelve hundred paces out, that's where the big cats drink. I can count their whiskers from here.",
           "Crack a longshot for the board while you're at it."] },

  // ================= Driftcamp — the nomadic caravan ========================
  { id: "orlov", village: "driftcamp", name: "CHIEF ORLOV", title: "the caravan master",
    line: ["A city on runners, friend. We outrun the ash-tide, and the ash-tide outruns the fools who stand still.",
           "Secure us a road through the dunes and my rigs will carry you from here to anywhere."] },
  { id: "zeke", village: "driftcamp", name: "ZEKE", title: "the dune-cartographer",
    line: ["Maps are just old lies told with a ruler. This desert rewrites itself weekly.",
           "Buy a chart off me — something buried might be worth the ink."] },
  { id: "bramwell", village: "driftcamp", name: "BRAMWELL", title: "the tread-mechanic",
    line: ["If it rolls, it breaks. If it breaks, I fix it. If it won't fix, I part it out for something that will.",
           "I'll braid a moving-anchor into your grapple line — close range only, mind."] },
  { id: "fennick", village: "driftcamp", name: "FENNICK", title: "the relic-peddler",
    line: ["Antiquities, charms, whispers of the guardians' weaknesses — all priced to move, all slightly haunted.",
           "Everything I sell remembers the old world. I try not to hold that against it."] },

  // ================= Cairnwatch — the tower above the flood =================
  { id: "theron", village: "cairnwatch", name: "ARCHIVIST THERON", title: "the lore-keeper",
    line: ["The Drowned Keep keeps its own archive — every knight who drowned there left his name behind.",
           "Recover their tags, outlander. Even the Raeku weeps for them, though it cannot stop feeding them."],
    giftRunes: 300 },
  { id: "vance", village: "cairnwatch", name: "WARDEN VANCE", title: "the tower-lookout",
    line: ["The water's still rising. A foot a year, maybe less — but it never stops.",
           "I mark the dry paths on the map. The dead ones don't complain about the ink."] },
  { id: "bramley", village: "cairnwatch", name: "BRAMLEY", title: "the rigger",
    line: ["Wet stone, mossy cable, one bad knot — that's the whole sermon right there.",
           "Magnetized pitons for your line. Sticks to glass, sticks to moss, sticks to your conscience."] },
  { id: "corin", village: "cairnwatch", name: "CORIN", title: "the beacon-tender",
    line: ["The beacon hums all night sometimes. I ask it questions. It answers in lightning.",
           "Stay long enough and it might learn your name."] },

  // ================= Lantern-Deep — the catacomb market =====================
  { id: "sly", village: "lanterndeep", name: "SLY", title: "the shadow-broker",
    line: ["Everything in this market is off the books, outlander. Including the books.",
           "Smoke, silencers, routes through the Bastion's bowels — all for the right price, all no questions."] },
  { id: "gideon", village: "lanterndeep", name: "GIDEON", title: "the pike-wright",
    line: ["Royal sentry work. Pre-split forge-line. The old kings armed their best with these.",
           "Found the pike yet? Good. When you do, bring it here — I'll give it its edge back."] },
  { id: "dorian", village: "lanterndeep", name: "DORIAN", title: "the crystal-cutter",
    line: ["Raw Raeku has a temper. Cut it wrong and it bites — cut it right and it sings for a century.",
           "Bring me ore from the catacomb veins and I'll wake your suit's heart a little brighter."] },
  { id: "merek", village: "lanterndeep", name: "MEREK", title: "the tunnel-guide",
    line: ["Every pipe under this place leaks. I know which ones leak air and which ones leak regret.",
           "Clear the crawlers from the east drainage and you'll walk straight to the Captain's hall."] },

  // ================= Ember-Perch — the treetop outpost ======================
  { id: "rowan", village: "emberperch", name: "MASTER FLETCHER ROWAN", title: "the bowyer",
    line: ["A bow is a promise you string with patience. An energy bow — that's a promise with a fuse.",
           "Bring me resin and filament, and I will string you something that outlives kings."] },
  { id: "hawk", village: "emberperch", name: "HAWK", title: "the canopy-runner",
    line: ["Up here the world is rope and prayer and not looking down.",
           "Beat my trial across the spans and the heights will belong to you."] },
  { id: "bramh", village: "emberperch", name: "BRAM", title: "the fog-watcher",
    line: ["Something moves down there that wasn't born with fur or feather.",
           "It casts no shadow and answers no call. If it finds you — run uphill."] },
  { id: "pippin", village: "emberperch", name: "PIPPIN", title: "the resin-tapper",
    line: ["Amber sap, outlander! Pre-war pine, still weeping gold.",
           "Seal your suit with this and the fog can't write its name on your lungs."] },

  // ================= Moss-Haven — the glass biodome =========================
  { id: "cedric", village: "mosshaven", name: "BOTANIST CEDRIC", title: "the dome-keeper",
    line: ["Everything green you see here died a thousand years before you were born — and we teach it to breathe again.",
           "Fetch me panes for the roof. The dome is holding its breath, and I would hate for it to let go."] },
  { id: "alden", village: "mosshaven", name: "ALDEN", title: "the apothecary",
    line: ["Grind, steep, distill. The oldest laboratory is the forest floor.",
           "Bring me spores and leaves and I'll brew something that unmakes the ash in your veins."] },
  { id: "gareth", village: "mosshaven", name: "GARETH", title: "the root-warden",
    line: ["The airlock keeps the outside out and the inside in. Respect both doors or neither opens.",
           "Monster parts for the compost — it's how the dead feed the green."] },
  { id: "tobias", village: "mosshaven", name: "TOBIAS", title: "the seed-archivist",
    line: ["Do you know what these trees share with the dark forest you crossed to get here? The same lineage. The same mother.",
           "Two halves of one green world. War split them just like it split the kingdoms."] },

  // ================= Charwood — the petrified logging camp ==================
  { id: "axel", village: "charwood", name: "FOREMAN AXEL", title: "the timber-boss",
    line: ["Fireproof timber — the only wood the waste can't finish.",
           "Clear the things testing my crews, and the road gets shorter for everyone."] },
  { id: "derrick", village: "charwood", name: "DERRICK", title: "the saw-wright",
    line: ["You want an edge that sings? I tune blades like the old masters tuned choirs.",
           "A minute on the wheel and your Second Blade will remember what it was made for."] },
  { id: "otis", village: "charwood", name: "OTIS", title: "the kiln-master",
    line: ["Kiln runs day and night. Carbon blocks come out black as the inside of a knight's helm.",
           "Double-life filters, that's what I sell the wise ones. Ash waits for no one."] },
  { id: "callum", village: "charwood", name: "CALLUM", title: "the winch-operator",
    line: ["Counterweight, pulley, prayer. That's the holy trinity of the crane tower.",
           "Ride my hoist to the ridge ledges — stumps your legs never will."] },

  // ================= Shard-Vein — the obsidian mining town ==================
  { id: "harlan", village: "shardvein", name: "QUARRY-MASTER HARLAN", title: "the foreman",
    line: ["Black glass, outlander. Whole mountains of the night before last.",
           "Clear the burrowers from my deep shafts and take the obsidian as thanks."] },
  { id: "silas", village: "shardvein", name: "SILAS", title: "the lens-grinder",
    line: ["Light through obsidian doesn't bend — it makes up its mind.",
           "Found the scout-camp projector yet? Bring it here and I'll make its beam worthy of the name."] },
  { id: "kael", village: "shardvein", name: "KAEL", title: "the cliff-climber",
    line: ["Glass holds a rope the way a bishop holds a grudge.",
           "Obsidian pitons for your line — they bite where steel just sings."] },
  { id: "jasper", village: "shardvein", name: "JASPER", title: "the lantern-tender",
    line: ["Keep the lamps lit and the deep stays merely dangerous instead of certain death.",
           "Shock-absorbing boots — the crags will always try to break your ankles."] },

  // ================= Mirror-Rest — the cavern hot springs ===================
  { id: "malcolm", village: "mirrorrest", name: "KEEPER MALCOLM", title: "the bath-master",
    line: ["The springs remember being a volcano before they learned grace.",
           "Soak, friend. The water forgives what the world won't."] },
  { id: "julian", village: "mirrorrest", name: "JULIAN", title: "the glass-weaver",
    line: ["Reflected light keeps its manners, here in the mirror halls.",
           "Wear my charms and the Warden's beams will bounce like bad news."] },
  { id: "tarin", village: "mirrorrest", name: "TARIN", title: "the mineral-chemist",
    line: ["Surge elixir! Instant spark for your suit mid-fight — tastes like pennies and thunder.",
           "Gulp one when the Warden splits the sky."] },
  { id: "lukas", village: "mirrorrest", name: "LUKAS", title: "the cavern-guide",
    line: ["Every wall in these tunnels lies to you. That's the point of them.",
           "I lost a miner in the reflection maze last week. We go in, we go out, we count our shadows."] },

  // ================= Glint-Post — the signal station ========================
  { id: "thorne", village: "glintpost", name: "COMMANDER THORNE", title: "the signal-chief",
    line: ["Every light on this ridge is a sentence. Most of them say 'run'.",
           "Help me align the jammed tower and the whole waste will hear us."] },
  { id: "ellis", village: "glintpost", name: "ELLIS", title: "the prism-tuner",
    line: ["The Warden doesn't dodge — it angles. Light chooses its path like a cautious man choosing a door.",
           "Stand behind the stone pillars. Let the beam choose you not at all."] },
  { id: "darius", village: "glintpost", name: "DARIUS", title: "the ridge-watcher",
    line: ["Longest sightline in the Ashveil, right here on my scope.",
           "Shrines, caches, the citadel's black spire — I see it all. For a fee."] },
  { id: "nolan", village: "glintpost", name: "NOLAN", title: "the wind-runner",
    line: ["Gale-force legs, courier-sharp reflexes, and a death wish redecorated as a job description.",
           "I run the ridge in eleven minutes. Bet you can't buy the route off me."] },

  // ================= Stilt-Haven — the tar-pit docklands ====================
  { id: "brann", village: "stilthaven", name: "FERRY-MASTER BRANN", title: "the skiff-captain",
    line: ["Sludge don't love you and it don't hate you — it just eats whatever stops moving.",
           "Clear the lurkers and I'll pole you over the deep tar any day you ask."] },
  { id: "tink", village: "stilthaven", name: "TINK", title: "the hull-patcher",
    line: ["Black tar in the seams, black tar in the soles — that's the cost of livin' above a stewpot.",
           "Seal your boots with my compound and wade like you were born for it."] },
  { id: "pike", village: "stilthaven", name: "OLD PIKE", title: "the marsh-angler",
    line: ["She hunted me for nine years, that leviathan. Grazed my skiff twice, laughed once.",
           "She follows the warm pipes. Everything down here follows the warm pipes."] },
  { id: "jory", village: "stilthaven", name: "JORY", title: "the plank-runner",
    line: ["Walk the planks quick or not at all — the tar's got opinions.",
           "Race me across the walkways, outlander. Loser carries the fish."] },

  // ================= Valvecross — the pipeline junction ======================
  { id: "garr", village: "valvecross", name: "CHIEF ENGINEER GARR", title: "the pipe-master",
    line: ["Pressure is just patience that lost its temper.",
           "Bring me regulator valves off the old lines and your Phase-Step will fire twice as fast."] },
  { id: "stoker", village: "valvecross", name: "STOKER", title: "the valve-turner",
    line: ["Twelve joints, fourteen leaks, one long afternoon.",
           "Seal the vents before they kiss the sparks — or we all find out together."] },
  { id: "finch", village: "valvecross", name: "FINCH", title: "the gas-refiner",
    line: ["Marsh gas, distilled to lightning. Fuel for the furnace called your body.",
           "One dose and you'll outrun the storm that outruns everything else."] },
  { id: "doyle", village: "valvecross", name: "DOYLE", title: "the pressure-scout",
    line: ["Ground talks, outlander. I listen through a wrench to my ear.",
           "Something enormous keeps surfing the magma pipes south. You'll want your answer before it surfaces."] },

  // ================= Boil-Spring — the steam outpost ========================
  { id: "hollis", village: "boilspring", name: "WARDEN HOLLIS", title: "the wash-master",
    line: ["Steam been peelin' tar off armor since your grandfather's grandfather.",
           "Step into the wash and walk out human again."] },
  { id: "lyle", village: "boilspring", name: "LYLE", title: "the boiler-smith",
    line: ["Geothermal edge, friend. Hotter than a forge, kinder than a pyre.",
           "I'll temper your blade till it bites through knight-plate like ripe fruit."] },
  { id: "barnaby", village: "boilspring", name: "BARNABY", title: "the vapor-brewer",
    line: ["Steam's just air that found religion. I bottle the conversion.",
           "Drink this and the tar will let go of your bones."] },
  { id: "rafe", village: "boilspring", name: "RAFE", title: "the vent-climber",
    line: ["From this stack you can see the Leviathan's boil-fields — the whole simmering basin.",
           "The only safe islands are the stone ones. Follow my poles."] },

  // ================= Gale-Nest — the turbine scaffolding ====================
  { id: "corvus", village: "galenest", name: "WING-MASTER CORVUS", title: "the trial-leader",
    line: ["The wind here doesn't care if you live. That's what makes the trials honest.",
           "Unlock your Sky-Step and come back — I'll race you through the blades till the turbine screams."] },
  { id: "kip", village: "galenest", name: "KIP", title: "the cable-smith",
    line: ["Tension is everything. Too loose, useless. Too tight — snap, goodbye fingers.",
           "Motorized wind-reel on your grapple line. Pull yourself to the heavens."] },
  { id: "soren", village: "galenest", name: "WIND-WATCHER SOREN", title: "the storm-reader",
    line: ["The turbine sings before the storm comes. Low note — run. High note — duel.",
           "Today it hums E-flat. You'll live. Probably."] },
  { id: "lark", village: "galenest", name: "LARK", title: "the sail-weaver",
    line: ["Pre-war parachute silk, outlander. Light as a lie, strong as a grudge.",
           "My glider will carry you over any ridge you point at."] },

  // ================= Cloud-Anchor — the mountain gondola hub ================
  { id: "holt", village: "cloudanchor", name: "STATION-MASTER HOLT", title: "the winch-chief",
    line: ["One cable, two peaks, a thousand feet of nothing between. I sleep fine.",
           "Clear the storm-hawks off my main winch and the gondola runs for the likes of you."] },
  { id: "alistair", village: "cloudanchor", name: "ALISTAIR", title: "the relic-collector",
    line: ["Every artifact up here outlived an empire or two. Curious what survives us, isn't it?",
           "Aerial charms — forged for the turbine riders. You'll want them before the Spire."] },
  { id: "garrett", village: "cloudanchor", name: "PEAK-WARDEN GARRETT", title: "the horizon-guard",
    line: ["From my post I see the citadel across the valley — black as a burnt tooth.",
           "Winged predators nest on the upper spans. Three hundred weight of feathers and bad temper."] },
  { id: "finn", village: "cloudanchor", name: "FINN", title: "the dynamo-tinker",
    line: ["Lightning rods, capacitor banks, and a healthy contempt for the sky.",
           "Storm cells, outlander. Bottled thunder for your thrusters."] },

  // ================= Anvil-Deep — the magma forge ===========================
  { id: "borin", village: "anvildeep", name: "MASTER SMITH BORIN", title: "the forge-chief",
    line: ["Fire remembers. That's why we honor it with work.",
           "Bring me volcanic glass from the Foundry and I'll baptize your edge in magma."] },
  { id: "odo", village: "anvildeep", name: "ODO", title: "the sluice-tinker",
    line: ["Magma's honest, outlander. It kills you exactly the same every time — politely, if you respect it.",
           "Thermal lining for your suit. The Foundry floor won't forgive you twice."] },
  { id: "durn", village: "anvildeep", name: "DURN", title: "the ingot-hauler",
    line: ["Forty pounds of pre-war alloy on this shoulder, friend. I was young once. Allegedly.",
           "Rogue automatons in the lower shafts. Scrap is scrap — bring me their cores."] },
  { id: "renn", village: "anvildeep", name: "RENN", title: "the bellows-runner",
    line: ["Air, fuel, fire — the forge's little trinity. I keep the chord in tune.",
           "The Forgemaster waits past the maintenance tunnels. Mind the conveyor. It remembers work."] },

  // ================= Slag-Gate — the drone checkpoint =======================
  { id: "mercer", village: "slaggate", name: "CAPTAIN MERCER", title: "the perimeter-guard",
    line: ["Assembly line went rogue years back. Now it builds soldiers for a war that never declared itself.",
           "Dismantle the fabricator east of here and this checkpoint stops being a frontier."] },
  { id: "arlo", village: "slaggate", name: "ARLO", title: "the drone-wright",
    line: ["Chirp chirp beep — that's 'hello' in chassis.",
           "Encrypted control chips. Bring me a few and my salvage-drone will work for you forever."] },
  { id: "corwin", village: "slaggate", name: "CORWIN", title: "the salvage-quartermaster",
    line: ["Grade-A plunder, fairly priced, mostly legal.",
           "Everything an outlander needs — if the outlander has runes."] },
  { id: "jude", village: "slaggate", name: "JUDE", title: "the catwalk-lookout",
    line: ["Up here, the whole cathedral of industry glitters like a gutted jewel.",
           "Hidden caches everywhere. The Foundry keeps secrets in its rafters."] },

  // ================= Vigil's End — the final war-camp =======================
  { id: "draven", village: "vigilsend", name: "MARSHAL DRAVEN", title: "the field-commander",
    line: ["Every soldier here chose this hill. That is more than any kingdom can say.",
           "Weaken the Herald's defenses and we will see this war-camp become a monument instead of a pyre."] },
  { id: "sterling", village: "vigilsend", name: "ARMORER STERLING", title: "the royal forgemaster",
    line: ["By order of the throne — your blade gets my full art before the last door.",
           "Aldrich may fall, outlander. Your edge does not have to."],
    giftRunes: 500 },
  { id: "briggs", village: "vigilsend", name: "QUARTERMASTER BRIGGS", title: "the supply-chief",
    line: ["Royal crates. Sealed, waxed, inventoried — and approximately half missing.",
           "Healing stock for the end, friend. Nobody gets shy about it now."] },
  { id: "orion", village: "vigilsend", name: "SCOUT-CAPTAIN ORION", title: "the vanguard-tracker",
    line: ["Months I've spied those gates. The Herald fights like scripture — every motion foretold.",
           "Watch the combo. His blade loves the third swing. So will your ribs."] },

  // ================= Ashen Sanctuary — the pre-split monastery ==============
  { id: "aurelius", village: "ashensanctuary", name: "HIGH KEEPER AURELIUS", title: "the lore-elder",
    line: ["Our oldest records speak of a divided energy system. The Raeku is one surviving part; what remains beyond the forest is a question even these archives cannot answer.",
           "Rest here, Kinter of Elderville. The monastery remembers what kings forget."],
    blessing: true },
  { id: "cassian", village: "ashensanctuary", name: "BROTHER CASSIAN", title: "the tablet-scribe",
    line: ["Every ruin you have read from, I have copied here — three hundred years of the world's last words.",
           "Bring me fragments and I will ink your name beside the saints."] },
  { id: "cyrus", village: "ashensanctuary", name: "CYRUS", title: "the sanctuary-warden",
    line: ["Eight powers you carry. Let me see if the student outran the teacher.",
           "Show me your mastery, outlander — gently, as one shows a candle to the dark."] },
  { id: "lucian", village: "ashensanctuary", name: "NOVICE LUCIAN", title: "the last beacon-keeper",
    line: ["This beacon is the last light before the citadel. When it goes out, the road ahead eats the living.",
           "I keep it lit. Someone must."] },
];

// One-time rewards are keyed off these ids so a reload never double-pays.
export const VILLAGE_NPC_BY_ID: Record<string, VillageNpc> = Object.fromEntries(
  VILLAGE_NPCS.map((n) => [n.id, n]),
);

// ===========================================================================
// THE ASHFALL RELICS — scavenged wonders of the old world. Five pickups hide
// in the waste; each is a whole combat style the moment it is claimed.
// ===========================================================================
export interface RelicDef {
  /** Must match a key in RELIC_CONFIG (actors.ts). */
  id: string;
  name: string;
  title: string;
  /** Where it hides — the engine places the glowing cache there. */
  pickup: [number, number];
  /** Prompt + pickup banner text. */
  blurb: string;
  line: string[];
}

export const RELICS: RelicDef[] = [
  { id: "longbow", name: "THE RAEKU LONGBOW", title: "hidden in the Sootfall watchtower rafters",
    pickup: [46.5, 100.5],
    blurb: "A collapsible Uokan alloy bow strung with a filament of living Raeku.",
    line: ["Uokan alloy, pre-split — and the string never slackens. Hits like the sun through a keyhole.",
           "Hold the draw and it will pierce anything that stands in the line — armor, gates, excuses."] },
  { id: "breacher", name: "THE BREACHER GAUNTLET", title: "salvaged from a fallen mech in the Iron Dunes",
    pickup: [163, -205],
    blurb: "A hydraulic fist stripped from heavy Life Armor. Slow, short — final.",
    line: ["Some mech died here mid-siege. Its fist outlived it. Now it outlives your enemies.",
           "Plant it on the earth and the ground itself will argue on your behalf."] },
  { id: "pike", name: "THE VOLTAIC PIKE", title: "armory vault of the Sunken Bastion",
    pickup: [-182, 27],
    blurb: "A royal sentry's extendable lance, humming with a captive storm.",
    line: ["Royal issue. The king's own sentries carried these into the last siege — and out of it.",
           "Pole-vault the charge. Crash down like weather that learned manners."] },
  { id: "chakram", name: "THE CINDER CHAKRAM", title: "molten conveyor room of the Forgotten Foundry",
    pickup: [176, -67],
    blurb: "Volcanic glass and magnetic scrap, sworn to two masters: the return trip, and you.",
    line: ["It cuts on the way out. It cuts on the way back. The Foundry made ten thousand — the Foundry has not been kind since.",
           "Throw it. Then stand very still while the paperwork settles."] },
  { id: "buckler", name: "THE AEGIS BUCKLER", title: "buried scout camp beneath the Glass Crags",
    pickup: [-77, -161],
    blurb: "A scout's wrist-projector — for those who could never wear the heavy shells.",
    line: ["For the scouts too light for Life Armor. A whisper of a shield with a lion's heart.",
           "Widen your guard, watch the enemy's hands — then hand them back their own bolts."] },
];


/** Where the Grapple-Line cache hangs in Sootfall. */
export const GRAPPLE_PICKUP: [number, number] = [41.5, 97.5];
