# Emberstage: Trio Adventures Voice Studio

A voice studio for **Trio Adventures**, built on Google Gemini text-to-speech. Every line from the game is loaded in.
You set how each character sounds, adjust the delivery of any line, generate takes, pick the best ones, and export a zip
the game can use.

There are two tabs:
- **Trio Adventures script:** all 396 game lines with per-character voices and per-line delivery controls.
- **Free studio:** the original Emberstage, for experimenting with any line.

## Running it

You need a **Gemini API key**. It's free from Google AI Studio (https://aistudio.google.com → Get API key).

**Option A: Google AI Studio.** Open the app in AI Studio. It fills in the key for you (Settings → Secrets).
Pull the newest version from GitHub first.

**Option B: on your PC.** Install Node.js (nodejs.org), then in this folder run:
```
npm install --legacy-peer-deps
```
Make a file called `.env` containing `GEMINI_API_KEY="your key"`, then run:
```
npm run dev
```
and open http://localhost:3000.

## How to use the Trio tab

1. **Cast (left).** Click the arrow next to a character to set:
   - their **voice** (30 Gemini voices)
   - **how they talk**, a description used for every one of their lines
   - default **energy** (1 is subtle, 5 is over the top)
   - default **pace**
   - an optional **accent**

   Click a character's name to show only their lines.
2. **Each line** has its own delivery controls. Leave any of them empty to use the character's defaults.
   - **Emotion:** pick from the list or type anything, like "drunk", "betrayed", or "trying not to laugh".
   - **Energy 1–5** and **Pace**.
   - **Director's note:** free text, like "voice cracks on 'dumb'" or "like he just realized he burned the map".
   - **Add pauses, laughs, breaths…:** edit what the voice reads and insert cues like `[pause]`, `<laugh>` or `<sigh>`.
     The game still matches the recording to the original line.
   - **Show what gets sent:** the exact instructions Gemini receives.
3. **Generate** makes a take. **New take** makes another. ▶ plays a take, ★ picks the one you want, and **Approve** marks
   the line as final.
4. **Generate missing** makes one take for every line in the current view that doesn't have one yet. Filter to one
   character or scene first. **Stop** pauses it.
5. **Export approved** downloads a zip containing:
   - the chosen take of every approved line (WAV)
   - `manifest.json`
   - `voice_lines_snippet.gd` for the game
   - your settings

   Give the zip to Claude to put the files in the game.

Your directions and takes are saved in your browser. **More → Save directions to a file** backs up all your voice and
delivery settings, and you can load them on another computer or share them with Asar. Takes stay in the browser they
were made in, so export before switching computers.

## When the game's dialogue changes

You don't need to do anything. Each time the studio opens, it reads the dialogue straight from the game repo on GitHub
(`foundation` branch). Click "↻" in the header to re-check without reloading.
- **New lines** show up as new lines to voice.
- **Reworded lines** count as new lines, because the game matches voices by exact text. If the new wording is close to
  the old one (same idea, a few words changed), the studio **copies over the old line's emotion, energy, pace, note and
  voice choice**. It marks the line "Reworded line" so you can regenerate it.
- **Old takes** for lines that changed or were removed are kept under the status filter **Removed from game**.

If GitHub can't be reached, the studio falls back to the copy bundled with the app. To refresh that copy:
`npx tsx tools/extract_trio_lines.ts /path/to/Trio-Adventures`

## Files
- `src/trio/ScriptStudio.tsx`: the Trio tab
- `src/trio/direction.ts`: turns the character settings and line direction into Gemini's acting instructions
- `src/trio/store.ts`: saving (directions in localStorage, takes in IndexedDB)
- `src/trio/zip.ts`: the zip export
- `src/data/trio/cast.ts`: default voices and directions for each character
- `src/trio/extract.ts`: reads the game's scripts from GitHub and pulls out every line
- `src/data/trio/lines.json`: offline copy of every game line (`tools/extract_trio_lines.ts`)
- `server.ts`: the API route that calls Gemini (now allows all 30 voices and converts raw PCM audio to WAV)
