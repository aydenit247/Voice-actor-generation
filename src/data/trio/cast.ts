// Trio Adventures cast: the default voice + acting direction for every speaker in the game.
// Everything here is only a starting point. All of it can be changed in the app (Cast panel),
// and those changes are saved in the browser and can be exported/imported as a settings file.

export interface Variant {
  id: string;
  label: string;
  voice: string;
  direction: string;     // replaces the character's base direction for lines using this variant
  accent?: string;
  intensity?: number;
  pace?: Pace;
}

export interface CastMember {
  id: string;            // matches "who" in the game scripts
  name: string;
  voice: string;         // Gemini prebuilt voice
  direction: string;     // base acting direction, applied to every line
  intensity: number;     // default 1 (subtle) … 5 (over the top)
  pace: Pace;
  accent?: string;
  note?: string;         // shown in the app
  variants?: Variant[];  // alternate voices for the same speaker type (e.g. different goblins)
  nameVariant?: Record<string, string>;  // named speaker (the line's "name") → variant id
}

export type Pace = "very slow" | "slow" | "normal" | "fast" | "very fast";
export const PACES: Pace[] = ["very slow", "slow", "normal", "fast", "very fast"];

export const INTENSITY_LABELS = ["", "subtle", "natural", "expressive", "big", "over the top"];

// Applies to every line (Ebain's answers, 2026-11-21). Editable in the app as the "note for every line".
export const HOUSE_STYLE =
  "Acting: mostly exaggerated and cartoonish, with some lines played realistically so the comedy comes from the words. " +
  "Slang is completely natural, the way they always talk (only once in a while slightly forced, if it's funnier). " +
  "Everyone delivers their slang with a natural Black American (AAVE) cadence and flow, authentic and never exaggerated " +
  "or mocking, layered on top of their own accent: British characters stay British, the narrator stays New Zealand. " +
  "Swearing gets full delivery, occasionally awkward when that's the funniest choice. " +
  "Act out every action written in asterisks (*gasp*, *hic*, *sobbing*) as a real sound, never read it as words.";

const GOBLIN_BASE = "A small goblin with a high-pitched, nasal voice. Scrappy, twitchy, jobless and proud of it. Comedic timing.";

export const CAST: CastMember[] = [
  {
    id: "skorn", name: "Skorn", voice: "Algenib", intensity: 4, pace: "fast",
    direction: "Skorn, a purple orc. Deep, gravelly, loud: just a big dumb orc. Chaotic, quick to rage, proud, never admits " +
      "he's wrong until he has to. Talks in casual modern slang like a hothead.",
  },
  {
    id: "lykor", name: "Lykor", voice: "Algieba", intensity: 3, pace: "normal", accent: "British (smooth, posh-casual)",
    direction: "Lykor, the Mogging Elf. Smooth, smug and confident, with a really nice, attractive leading-man voice. He " +
      "knows he's the best-looking person alive and is a little dramatic about his hair. Uses modern slang naturally, " +
      "in his British accent.",
  },
  {
    id: "xylo", name: "Xylo", voice: "Charon", intensity: 2, pace: "slow",
    direction: "Xylo, a mysterious red dragon. A mix of two sides that he switches between: a deep, wise, ancient-dragon " +
      "voice for lore and serious moments, and a chill, deadpan regular guy the rest of the time. Treats nonsense lore " +
      "with total seriousness.",
  },
  {
    id: "narrator", name: "Narrator", voice: "Sadaltager", intensity: 2, pace: "slow", accent: "New Zealand",
    direction: "The narrator: a kind old man (nothing like Mattias) with a calm, warm, quietly epic voice, like a nature " +
      "documentary narrator in the style of David Attenborough. Not a movie trailer voice. Gentle wonder, " +
      "unhurried, completely sincere even when the words are dumb.",
  },
  {
    id: "goblin", name: "Goblins", voice: "Puck", intensity: 4, pace: "fast", accent: "British",
    direction: GOBLIN_BASE,
    note: "Each goblin can use a different voice. Named goblins are assigned below, and any line can switch.",
    variants: [
      { id: "british", label: "British goblin (default)", voice: "Puck", accent: "British (cheeky, Cockney-ish)", direction: GOBLIN_BASE },
      { id: "new_york", label: "New York goblin", voice: "Achird", accent: "New York", direction: GOBLIN_BASE + " Fast-talking street hustler attitude." },
      { id: "country", label: "Country goblin", voice: "Umbriel", accent: "Southern US country", direction: GOBLIN_BASE + " Slow country drawl, folksy." },
      { id: "weird", label: "Weird-voiced goblin", voice: "Enceladus", accent: "British",
        direction: "A goblin with a strange voice: croaky, wheezy and droning, like a frog that gave up. Monotone but oddly intense." },
      { id: "dumbest", label: "Dumbest goblin alive", voice: "Fenrir", accent: "British",
        direction: "The stupidest creature of all time. A high, dopey goblin voice, painfully slow to process anything, " +
          "proud of every dumb thing he says, confused by his own sentences." },
    ],
    nameVariant: {
      "Sludge (Bartender)": "new_york",
      "Gorbo (Open Mic)": "country",
      "Big Thumbs (Bouncer)": "dumbest",
      "Unemployment Clerk": "weird",
      "Shaman Wuzzle": "weird",
      "Clank (Spoonsmith)": "weird",
    },
  },
  {
    id: "goblins", name: "Goblins (crowd)", voice: "Sadachbia", intensity: 5, pace: "fast", accent: "British",
    direction: "A rowdy crowd of high-pitched goblins chanting and cheering together, chaotic, like a drunk sports crowd.",
  },
  {
    id: "chief", name: "Chief Bogdrinker", voice: "Enceladus", intensity: 3, pace: "normal", accent: "British",
    direction: "Chief Bogdrinker, the ancient goblin chief. High-pitched but raspy, pompous and ceremonial, talks about " +
      "himself in the third person, slips into casual slang. A little drunk on beezy.",
  },
  {
    id: "dulbers", name: "Dulbers Frint", voice: "Fenrir", intensity: 5, pace: "very fast",
    direction: "Dulbers Frint, a little twerp dweeb. High-pitched, nasal, talks REALLY fast, silly and overexcited, with " +
      "fake-friendly YouTuber energy (\"hey guys, it's your boy\"). The kind of voice that makes you giggle just " +
      "listening to it.",
  },
  {
    id: "dulbers_demon", name: "Dulbers (Demon)", voice: "Alnilam", intensity: 5, pace: "slow",
    direction: "Dulbers revealed as a shapeshifting demon. Deep, booming, menacing theatrical villain voice that still " +
      "slips into his dweeby shopkeeper catchphrases.",
  },
  {
    id: "mattias", name: "Metocin Mattias", voice: "Rasalgethi", intensity: 3, pace: "slow",
    direction: "Metocin Mattias, a very wise, very old wizard. Articulate and eloquent, but at certain points in his " +
      "sentences he sounds like he's literally dying of old age: wheezing, a frail crack, a rattly breath, then he " +
      "carries on perfectly composed.",
  },
  {
    id: "giant", name: "Diddy Chud Giant", voice: "Orus", intensity: 5, pace: "slow",
    direction: "Diddy Chud Giant: huge, scary and booming. Deep, thunderous, menacing voice that shakes the mountain.",
  },
];

// Gemini text-to-speech prebuilt voices. "tone" is Google's own one-word description.
export const GEMINI_VOICES: { name: string; tone: string; sounds: "male" | "female" }[] = [
  { name: "Algenib", tone: "Gravelly", sounds: "male" },
  { name: "Algieba", tone: "Smooth", sounds: "male" },
  { name: "Alnilam", tone: "Firm", sounds: "male" },
  { name: "Charon", tone: "Informative", sounds: "male" },
  { name: "Enceladus", tone: "Breathy", sounds: "male" },
  { name: "Fenrir", tone: "Excitable", sounds: "male" },
  { name: "Iapetus", tone: "Clear", sounds: "male" },
  { name: "Orus", tone: "Firm", sounds: "male" },
  { name: "Puck", tone: "Upbeat", sounds: "male" },
  { name: "Rasalgethi", tone: "Informative", sounds: "male" },
  { name: "Sadachbia", tone: "Lively", sounds: "male" },
  { name: "Sadaltager", tone: "Knowledgeable", sounds: "male" },
  { name: "Schedar", tone: "Even", sounds: "male" },
  { name: "Umbriel", tone: "Easy-going", sounds: "male" },
  { name: "Zubenelgenubi", tone: "Casual", sounds: "male" },
  { name: "Achird", tone: "Friendly", sounds: "male" },
  { name: "Achernar", tone: "Soft", sounds: "female" },
  { name: "Aoede", tone: "Breezy", sounds: "female" },
  { name: "Autonoe", tone: "Bright", sounds: "female" },
  { name: "Callirrhoe", tone: "Easy-going", sounds: "female" },
  { name: "Despina", tone: "Smooth", sounds: "female" },
  { name: "Erinome", tone: "Clear", sounds: "female" },
  { name: "Gacrux", tone: "Mature", sounds: "female" },
  { name: "Kore", tone: "Firm", sounds: "female" },
  { name: "Laomedeia", tone: "Upbeat", sounds: "female" },
  { name: "Leda", tone: "Youthful", sounds: "female" },
  { name: "Pulcherrima", tone: "Forward", sounds: "female" },
  { name: "Sulafat", tone: "Warm", sounds: "female" },
  { name: "Vindemiatrix", tone: "Gentle", sounds: "female" },
  { name: "Zephyr", tone: "Bright", sounds: "female" },
];

// Quick emotion picks for a line. Free text is always allowed too.
export const EMOTIONS = [
  "angry", "furious", "proud", "smug", "sheepish", "embarrassed", "scared", "panicked", "excited", "hyped",
  "confused", "suspicious", "sad", "crying", "laughing", "deadpan", "bored", "tired", "drunk", "high",
  "mysterious", "dramatic", "reverent", "flirty", "disgusted", "shocked", "whispering", "yelling",
];

// Inline cues that can be dropped into the performance text. The model acts them, it doesn't say them.
export const INLINE_CUES = ["[pause]", "[long pause]", "<breath>", "<sigh>", "<gasp>", "<laugh>", "<giggle>", "<scoff>", "<cough>", "<wheeze>", "<groan>", "<sob>", "[whisper]", "[yell]", "<hic>"];

// Actions written the way the game scripts write them. Acted out, not read.
export const ACTIONS = ["*gasp*", "*hic*", "*sobbing*", "*laughs*", "*burps*", "*coughs*", "*wheezes*", "*sniffs*", "*groans*", "*clears throat*", "*ba dum tss*"];
