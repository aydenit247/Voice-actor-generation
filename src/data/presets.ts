import type { CharacterPreset, CueTag, VoiceOption } from "../types/studio";

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: "campfire-orc",
    name: "Grunk the Campfire Orc",
    archetype: "Loud & Gravelly Bruiser",
    setting: "Night Campfire",
    voiceName: "Fenrir",
    style:
      "Dumb, angry, proud orc. Loud and gravelly, slightly out of breath, yelling across a campfire",
    script: "[angry] Who burned the map?! [pause] ...Oh. That was me.",
    imageUrl: "/src/assets/images/hero_orc_campfire_1795292359854.jpg",
    imageAlt:
      "Burly green-skinned orc yelling across a blazing campfire while holding a smoldering burnt parchment map",
    defaultSpace: "campfire",
    defaultAmbience: true,
  },
  {
    id: "goblin-torchbearer",
    name: "Skrit the Torchbearer",
    archetype: "Twitchy Cavern Scout",
    setting: "Damp Tunnel",
    voiceName: "Puck",
    style:
      "Fast-talking, nervous, shrill goblin scout peering into a dark tunnel, easily startled and whispering loud",
    script:
      "<gasp> Boss, the ceiling is blinking! [pause] Wait—[whisper] ceilings do not blink, right?",
    imageUrl: "/src/assets/images/preset_goblin_torch_1795292357573.jpg",
    imageAlt:
      "Wide-eyed goblin scout clutching a sputtering wooden torch inside a shadowy stone cavern",
    defaultSpace: "cavern",
    defaultAmbience: false,
  },
  {
    id: "dwarf-quartermaster",
    name: "Bram Ironledger",
    archetype: "Gruff Quartermaster",
    setting: "Smoky Tavern",
    voiceName: "Charon",
    style:
      "Gruff, suspicious, heavily bearded dwarf quartermaster muttering over his ledger in a noisy tavern, dry humor",
    script:
      "[skeptical] Three barrels of ale, two broken shields, and one missing mule. <breath> Tell me again how you call this a stealth mission.",
    imageUrl: "/src/assets/images/preset_dwarf_tavern_1795292356737.jpg",
    imageAlt:
      "Bearded dwarf quartermaster leaning over a candlelit ledger beside a pewter tankard in a dimly lit tavern",
    defaultSpace: "dry",
    defaultAmbience: false,
  },
  {
    id: "cinder-warlock",
    name: "Vael of the Brazier",
    archetype: "Ancient Ember Warlock",
    setting: "Stone Sanctum",
    voiceName: "Zephyr",
    style:
      "Ancient, hollow, theatrical warlock speaking softly over glowing embers before swelling into solemn gravitas",
    script:
      "[whisper] The embers remember every oath you broke. [pause] <breath> And tonight, they collect.",
    imageUrl: "/src/assets/images/preset_warlock_cinder_1795292357612.jpg",
    imageAlt:
      "Hooded ancient warlock gazing over a glowing brass brazier with floating embers in a dark stone hall",
    defaultSpace: "cavern",
    defaultAmbience: true,
  },
];

export const VOICE_OPTIONS: VoiceOption[] = [
  {
    name: "Fenrir",
    register: "Deep Bass",
    timbre: "Gravelly, forceful, commanding projection",
  },
  {
    name: "Charon",
    register: "Low Baritone",
    timbre: "Weathered, weighty, measured authority",
  },
  {
    name: "Puck",
    register: "Agile Tenor",
    timbre: "Sharp, mischievous, rapid comedic timing",
  },
  {
    name: "Kore",
    register: "Clear Alto",
    timbre: "Grounded, expressive, dramatic clarity",
  },
  {
    name: "Zephyr",
    register: "Resonant Mid",
    timbre: "Hollow, atmospheric, eerie stillness",
  },
];

export const PERFORMANCE_CUES: CueTag[] = [
  { token: "[angry]", label: "Angry", kind: "emotion" },
  { token: "[proud]", label: "Proud", kind: "emotion" },
  { token: "[sheepish]", label: "Sheepish", kind: "emotion" },
  { token: "[whisper]", label: "Whisper", kind: "emotion" },
  { token: "[pause]", label: "Pause", kind: "timing" },
  { token: "<breath>", label: "Breath", kind: "vocal" },
  { token: "<gasp>", label: "Gasp", kind: "vocal" },
  { token: "<laugh>", label: "Laugh", kind: "vocal" },
];
