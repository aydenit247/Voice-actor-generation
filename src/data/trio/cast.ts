// Trio Adventures cast: the default voice + acting direction for every speaker in the game.
// Everything here is only a starting point. All of it can be changed in the app (Cast panel),
// and those changes are saved in the browser and can be exported/imported as a settings file.

export interface CastMember {
  id: string;            // matches "who" in the game scripts
  name: string;
  voice: string;         // Gemini prebuilt voice
  direction: string;     // base acting direction, applied to every line
  intensity: number;     // default 1 (subtle) … 5 (over the top)
  pace: Pace;
  accent?: string;
  note?: string;         // shown in the app (e.g. "being recorded by a friend")
}

export type Pace = "very slow" | "slow" | "normal" | "fast" | "very fast";
export const PACES: Pace[] = ["very slow", "slow", "normal", "fast", "very fast"];

export const INTENSITY_LABELS = ["", "subtle", "natural", "expressive", "big", "over the top"];

export const CAST: CastMember[] = [
  {
    id: "skorn", name: "Skorn", voice: "Algenib", intensity: 4, pace: "fast",
    direction: "A dumb, angry, proud purple orc. Deep, loud, gravelly voice. Talks with chaotic energy, quick to rage, " +
      "never admits he's wrong until he has to. Casual modern slang delivered like a hothead.",
  },
  {
    id: "lykor", name: "Lykor", voice: "Algieba", intensity: 3, pace: "normal",
    direction: "Lykor, the Mogging Elf: a handsome, vain blond elf who knows he's the best-looking person alive. Smooth, " +
      "confident, smug, a little dramatic about his hair and conditioner. Casual modern slang said with total self-assurance.",
  },
  {
    id: "xylo", name: "Xylo", voice: "Charon", intensity: 2, pace: "slow",
    direction: "Xylo, a mysterious red dragon. Low, calm, measured, slightly ominous, but casual and deadpan, like a wise " +
      "old dragon who also talks like a regular guy. Treats nonsense lore with total seriousness.",
  },
  {
    id: "narrator", name: "Narrator", voice: "Sadaltager", intensity: 2, pace: "slow",
    direction: "An epic fantasy narrator, like a movie trailer, played completely straight even when the words are dumb. " +
      "Rich, warm, dramatic pauses. The comedy comes from how serious he sounds.",
  },
  {
    id: "goblin", name: "Goblin", voice: "Puck", intensity: 4, pace: "fast",
    direction: "A small, nasal, scrappy goblin. High, sharp, twitchy, excitable. Jobless and proud of it. Comedic timing.",
  },
  {
    id: "goblins", name: "Goblins (crowd)", voice: "Sadachbia", intensity: 5, pace: "fast",
    direction: "A rowdy crowd of goblins chanting and cheering together, high-pitched and chaotic, like a drunk sports crowd.",
  },
  {
    id: "chief", name: "Chief Bogdrinker", voice: "Enceladus", intensity: 3, pace: "normal",
    direction: "Chief Bogdrinker, the ancient goblin chief. Raspy, pompous, ceremonial, talks about himself in third person, " +
      "slips into casual slang. A little drunk on beezy.",
    note: "Asar recorded 37 of his lines. Those are skipped automatically.",
  },
  {
    id: "dulbers", name: "Dulbers Frint", voice: "Zubenelgenubi", intensity: 4, pace: "fast",
    direction: "Dulbers Frint, a fast-talking shopkeeper with fake-friendly YouTuber energy (\"hey guys, it's your boy\"). " +
      "Slick salesman, overly upbeat, secretly sketchy.",
  },
  {
    id: "dulbers_demon", name: "Dulbers (Demon)", voice: "Alnilam", intensity: 5, pace: "slow",
    direction: "Dulbers revealed as a shapeshifting demon. Deep, booming, menacing, theatrical villain voice that still " +
      "slips into his shopkeeper catchphrases.",
  },
  {
    id: "mattias", name: "Metocin Mattias", voice: "Iapetus", intensity: 2, pace: "slow",
    direction: "Metocin Mattias, a mysterious figure who appears out of nowhere. Calm, smooth, knowing, slightly amused.",
    note: "A friend is recording Mattias. Generate only if you want a stand-in.",
  },
  {
    id: "giant", name: "Diddy Chud Giant", voice: "Orus", intensity: 4, pace: "very slow",
    direction: "A gigantic, dim, sleepy giant. Huge, slow, booming, groggy voice, like he just woke up from a 400-year nap.",
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
export const INLINE_CUES = ["[pause]", "[long pause]", "<breath>", "<sigh>", "<gasp>", "<laugh>", "<scoff>", "[whisper]", "[yell]", "<hic>"];
