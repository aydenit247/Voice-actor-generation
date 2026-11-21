export type PrebuiltVoiceName = "Fenrir" | "Charon" | "Puck" | "Kore" | "Zephyr";

export type TtsModelId = "gemini-3.8-flash-tts" | "gemini-3.8-flash-lite-tts";

export type AcousticSpace = "campfire" | "dry" | "cavern";

export interface CharacterPreset {
  id: string;
  name: string;
  archetype: string;
  setting: string;
  voiceName: PrebuiltVoiceName;
  style: string;
  script: string;
  imageUrl: string;
  imageAlt: string;
  defaultSpace: AcousticSpace;
  defaultAmbience: boolean;
}

export interface VoiceOption {
  name: PrebuiltVoiceName;
  register: string;
  timbre: string;
}

export interface CueTag {
  token: string;
  label: string;
  kind: "emotion" | "timing" | "vocal";
}

export interface AudioTake {
  id: string;
  takeNumber: number;
  characterId: string;
  characterName: string;
  voiceName: PrebuiltVoiceName;
  model: TtsModelId;
  style: string;
  script: string;
  audioBase64: string;
  mimeType: string;
  durationSec: number;
  waveform: number[];
  byteLength: number;
  createdAt: string;
}

export interface ScriptSegment {
  type: "cue" | "speech";
  text: string;
  startWeight: number;
  endWeight: number;
}
