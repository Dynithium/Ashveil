// ---------------------------------------------------------------------------
// KINTER'S JOURNAL — the writings he leaves behind, and the ones he can't send.
// Items unlock by story milestone. They are shown in the N-panel's journal tab
// and can only be read there; the game never forces you to.
// ---------------------------------------------------------------------------

export type JournalTrigger =
  | "prologue_complete"
  | "prologue_border"
  | "trial_complete"
  | "guardian_2"
  | "guardian_4"
  | "guardian_6"
  | "guardian_8"
  | "victory"
  | "coronation"
  | "sanctuary_blessed";

export interface JournalEntry {
  id: string;
  title: string;
  /** Sort order in the list. */
  order: number;
  trigger: JournalTrigger;
  text: string[];
}

// --------------------------------------------------------------------------
// KINTER'S JOURNAL — should be trimmed down to the entries he would actually write
// --------------------------------------------------------------------------
export const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: "uncharted-road", order: 1.5, trigger: "prologue_border", title: "The Road Beyond",
    text: [
      "The last marker is behind me. Beyond it the map is blank, but the old road continues.",
      "If they built a road through here, where did it lead?",
    ],
  },
  {
    id: "elderville", order: 1, trigger: "prologue_complete", title: "Elderville",
    text: [
      "The elders think I'm looking for signs of life. I told them I was looking for a way home.",
      "I left the First Blade for Minslaire. Its twin is on my back; the same nick marks both hilts.",
      "Maps aren't made for what's out past the border. There's a reason.",
    ],
  },
  {
    id: "the-fall", order: 2, trigger: "prologue_complete", title: "The Fall",
    text: [
      "I woke up on violet sand. The falls took my coat, most of my strength, and every assumption I had.",
      "Strangers in iron circled me like pallbearers. The commander didn't kill me. He wanted to know why.",
      "I have never seen an entire country wearing machinery. I have never seen a king so tired his suit hardly holds.",
    ],
  },
  {
    id: "the-claim", order: 3, trigger: "trial_complete", title: "The Claim",
    text: [
      "The King made me show him how a Gretriyon fighter stands up in a room full of armor.",
      "Aldrich met my blade himself, and ended the duel when the Relay answered my sword.",
      "Two swords. One world behind me. One world in front of me. And between them, a falling king and a dying kingdom.",
    ],
  },
  {
    id: "eight-wounds", order: 4, trigger: "trial_complete", title: "Eight Wounds",
    text: [
      "Eight guardians hold the Shards of the Raeku's stabilizing lattice. Malenkar keeps the core itself in his citadel.",
      "The Royal Relay can carry a Shard's power back to Aldrich without demanding I abandon the road.",
      "Back home there is a boy with my first blade. This is what I have now.",
    ],
  },
  {
    id: "the-first-fallen", order: 5, trigger: "guardian_2", title: "The First One",
    text: [
      "It wasn't the size that broke something in me.",
      "It was the fact that it was still moving after everything I did to it. It hadn't improved. It hadn't learned.",
      "Something in this world is teaching these things to forget the difference between living and burning.",
    ],
  },
  {
    id: "the-road-back", order: 6, trigger: "guardian_2", title: "The Road Back",
    text: [
      "Something about the path back to that coast glows differently now. The water doesn't feel like the place that killed me. It feels like the place that didn't.",
      "If my people only saw this shore, they'd still send me back for this mission, and I'd still say yes.",
      "That doesn't make the decision easier. It just makes it honest.",
    ],
  },
  {
    id: "the-man-in-the-map", order: 7, trigger: "guardian_4", title: "The Man in the Map",
    text: [
      "Four guardians are silent. The roads between their territories still carry the marks of old machinery.",
      "Aldrich spoke of a world joined before the wars. Every broken road makes that story harder to dismiss.",
      "Someone divided these lands. People on both sides are still paying the price.",
    ],
  },
  {
    id: "the-kings-question", order: 8, trigger: "guardian_6", title: "The King's Question",
    text: [
      "Six Shards. The Relay burns steadier, and Aldrich's armor can carry more of its weight.",
      "I think of the boy waiting in Elderville whenever the road turns toward the forest.",
      "The closer I come to keeping my promise to Uoka, the more I wonder what it will cost to keep my promise to him.",
    ],
  },
  {
    id: "the-truth-of-the-cataract", order: 9, trigger: "guardian_8", title: "The Truth of the Cataract",
    text: [
      "All eight Shards are attuned. Their light reaches the Royal Relay, but Malenkar still holds the Raeku itself.",
      "Uoka's power can breathe again. It will not be safe until the siphon is stopped.",
      "The road to the citadel is open. Aldrich will be able to stand with us when we reach it.",
    ],
  },
  {
    id: "the-crown", order: 10, trigger: "victory", title: "The Crown",
    text: [
      "He said 'You are now king' like he was handing me a debt, not a reward.",
      "I will be the king of a country that doesn't know my name yet, protecting a child who doesn't know where I am.",
      "If I leave, everyone here dies slowly. If I stay, I leave my son to grow up without a father.",
      "Both are deaths. I chose the one that lets the other live.",
    ],
  },
  {
    id: "the-last-road", order: 11, trigger: "coronation", title: "The Last Road",
    text: [
      "There is a path they say might eventually lead home. Eventually. If I tear the Ashveil apart, if I outrun every remnant, if the world cooperates for once.",
      "Until then I will walk the road between these two places and pretend I still know the way.",
      "One day he will come looking. I hope he doesn't have to.",
    ],
  },
  {
    id: "the-quiet", order: 12, trigger: "sanctuary_blessed", title: "The Quiet",
    text: [
      "High in the sanctuary there is a silence that belongs to the old world. Not to any king. Not to any army.",
      "They say if you stand there long enough, the stone remembers being one thing.",
      "I didn't stay long enough to find out. Some days I'm afraid I wouldn't know which world I'd wake up in.",
    ],
  },
];
