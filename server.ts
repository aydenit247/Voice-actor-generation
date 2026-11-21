import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_VOICES = new Set(["Fenrir", "Charon", "Puck", "Kore", "Zephyr"]);
const ALLOWED_TTS_MODELS = new Set([
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
]);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please verify your API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 2
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: unknown) {
      lastError = err;
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? Number((err as { status?: unknown }).status)
          : undefined;
      const isTransient =
        status === 429 || (status !== undefined && status >= 500);
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 650 * attempt));
    }
  }
  throw lastError;
}

function formatApiError(err: unknown): { status: number; message: string } {
  const rawMessage =
    err instanceof Error ? err.message : "Unexpected speech generation error.";
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : 500;

  if (
    status === 403 ||
    rawMessage.includes("PERMISSION_DENIED") ||
    rawMessage.includes("API_KEY_INVALID")
  ) {
    return {
      status: 403,
      message:
        "Gemini API key was rejected or is missing. Check your key in Settings > Secrets.",
    };
  }
  if (status === 429 || rawMessage.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message:
        "Rate limit reached for Gemini speech generation. Wait a moment and try again.",
    };
  }
  return {
    status: Number.isFinite(status) && status >= 400 && status < 600 ? status : 500,
    message: rawMessage,
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Generate character voice performance audio using Gemini 3.8 TTS
  app.post("/api/tts", async (req, res) => {
    try {
      const { script, style, voiceName, model } = req.body as {
        script?: string;
        style?: string;
        voiceName?: string;
        model?: string;
      };

      const trimmedScript = typeof script === "string" ? script.trim() : "";
      if (!trimmedScript) {
        return res.status(400).json({ error: "Please enter a script line to perform." });
      }
      if (trimmedScript.length > 2000) {
        return res.status(400).json({
          error: "Script is too long for a single take (2,000 character maximum).",
        });
      }

      const selectedVoice =
        typeof voiceName === "string" && ALLOWED_VOICES.has(voiceName)
          ? voiceName
          : "Fenrir";
      const selectedModel =
        typeof model === "string" && ALLOWED_TTS_MODELS.has(model)
          ? model
          : "gemini-3.8-flash-tts";

      const rawStyle = typeof style === "string" ? style.trim() : "";
      const styleDirective = rawStyle
        ? `${rawStyle}. Treat square-bracketed cues such as [angry] or [pause] strictly as acting and timing directions—never pronounce the bracketed words aloud.`
        : "Expressive theatrical character voice acting. Treat square-bracketed cues such as [angry] or [pause] strictly as acting and timing directions—never pronounce the bracketed words aloud.";

      const ai = getGeminiClient();

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: selectedModel,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: trimmedScript,
                  speechMetadata: {
                    style: styleDirective,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        })
      );

      const audioPart = response.candidates?.[0]?.content?.parts?.find(
        (part) => part.inlineData?.data
      );
      const base64Audio = audioPart?.inlineData?.data;
      const mimeType = audioPart?.inlineData?.mimeType || "audio/wav";

      if (!base64Audio) {
        return res.status(502).json({
          error:
            "No audio data was returned for this line. Try adjusting the script or direction and generate again.",
        });
      }

      const byteLength = Buffer.from(base64Audio, "base64").byteLength;

      return res.json({
        audioBase64: base64Audio,
        mimeType,
        voiceName: selectedVoice,
        model: selectedModel,
        byteLength,
      });
    } catch (err) {
      console.error("[/api/tts] Error:", err);
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Generate a fresh dramatic character line using Gemini 4 Hydrogen
  app.post("/api/write-line", async (req, res) => {
    try {
      const { characterName, style, currentScript } = req.body as {
        characterName?: string;
        style?: string;
        currentScript?: string;
      };

      const ai = getGeminiClient();
      const prompt = [
        `Write ONE short, punchy, memorable voice-acting line (1 to 2 sentences max) for a fantasy character.`,
        `Character: ${characterName || "Campfire Orc"}`,
        `Voice & acting direction: ${style || "Dumb, angry, proud orc. Loud and gravelly, slightly out of breath, yelling across a campfire."}`,
        currentScript ? `Previous line (write a fresh scenario, do not repeat it): ${currentScript}` : "",
        `Include 1 or 2 natural performance cues like [angry], [pause], [proud], [sheepish], <breath>, <gasp>, or <laugh> to give it comedic or dramatic timing.`,
        `Return ONLY the raw spoken script line with cues—no quotation marks, no character name prefix, no commentary.`,
      ]
        .filter(Boolean)
        .join("\n");

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.LOW,
            },
          },
        })
      );

      const generatedLine = (response.text ?? "").trim().replace(/^["']|["']$/g, "");
      if (!generatedLine) {
        return res.status(502).json({ error: "Could not generate a new line." });
      }

      return res.json({ script: generatedLine });
    } catch (err) {
      console.error("[/api/write-line] Error:", err);
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Emberstage server running on http://localhost:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error("Failed to start Emberstage server:", err);
  process.exit(1);
});
