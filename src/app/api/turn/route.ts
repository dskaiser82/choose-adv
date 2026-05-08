import fs from "node:fs/promises";
import path from "node:path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { toAsyncIterable } from "@elevenlabs/elevenlabs-js/wrapper/utils";

function buildTurn({
  playerName,
  worldName,
  playerRegion,
  playerRole,
  summaryText,
  action,
  previousNarration,
}: {
  playerName: string;
  worldName: string;
  playerRegion?: string;
  playerRole?: string;
  summaryText: string;
  action: string;
  previousNarration?: string;
}) {
  const regionText = playerRegion ? ` in ${playerRegion}` : "";
  const roleText = playerRole ? `${playerRole}` : "traveler";

  const paragraphs = [
    `${playerName}, ${roleText} of ${worldName}${regionText}, commits to a move: ${action.trim()}.`,
    `The world answers carefully. Old tension from the campaign hangs in the air, and every choice feels like it could expose a lie, awaken a danger, or reveal an ally hiding behind fear.`,
    `Drawing from the current story frame, ${summaryText.slice(0, 220).trim()}${summaryText.length > 220 ? "..." : ""}`,
    previousNarration
      ? `What came just before still matters: ${previousNarration.slice(0, 140).trim()}${previousNarration.length > 140 ? "..." : ""}`
      : `This is the opening pulse of the test run, so the next beat should sharpen the mood and give you something concrete to pursue.`,
    `Ahead, the path forks into consequence: investigate more deeply, press someone for the truth, or act before the world notices your hesitation.`,
  ];

  return {
    sceneTitle: `Turn Response: ${action.trim().slice(0, 42)}`,
    narration: paragraphs.join("\n\n"),
    paragraphs,
    suggestedChoices: [
      "Push deeper instead of waiting",
      "Question the nearest witness aggressively",
      "Hide, observe, and look for a pattern first",
    ],
  };
}

async function saveAudioFromBuffer(buffer: Buffer, extension = "mp3") {
  const outputDir = path.join(process.cwd(), "public", "generated-audio");
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `turn-${Date.now()}.${extension}`;
  const outputFile = path.join(outputDir, fileName);
  await fs.writeFile(outputFile, buffer);
  return `/generated-audio/${fileName}`;
}

async function tryElevenLabsTts(text: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      audioUrl: null,
      debug: {
        hasApiKey: false,
        apiKeyPrefix: null,
        stage: "missing-api-key",
      },
    };
  }

  try {
    const client = new ElevenLabsClient({ apiKey });
    const audioStream = await client.textToSpeech.convert("21m00Tcm4TlvDq8ikWAM", {
      text,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of toAsyncIterable(audioStream)) {
      chunks.push(chunk);
    }

    if (!chunks.length) {
      return {
        audioUrl: null,
        debug: {
          hasApiKey: true,
          apiKeyPrefix: apiKey.slice(0, 4),
          stage: "empty-audio-stream",
          chunkCount: 0,
        },
      };
    }

    const audioUrl = await saveAudioFromBuffer(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))), "mp3");
    return {
      audioUrl,
      debug: {
        hasApiKey: true,
        apiKeyPrefix: apiKey.slice(0, 4),
        stage: "audio-generated",
        chunkCount: chunks.length,
        audioUrl,
      },
    };
  } catch (error) {
    return {
      audioUrl: null,
      debug: {
        hasApiKey: true,
        apiKeyPrefix: apiKey.slice(0, 4),
        stage: "elevenlabs-error",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}


function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    action = "",
    playerName = "Cade",
    worldName = "Veyr",
    playerRegion,
    playerRole,
    summaryText = "",
    previousNarration,
  } = body ?? {};

  const turn = buildTurn({
    action,
    playerName,
    worldName,
    playerRegion,
    playerRole,
    summaryText,
    previousNarration,
  });

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          encodeEvent("meta", {
            sceneTitle: turn.sceneTitle,
            suggestedChoices: turn.suggestedChoices,
          }),
        ),
      );

      for (const paragraph of turn.paragraphs) {
        controller.enqueue(new TextEncoder().encode(encodeEvent("chunk", { text: `${paragraph}\n\n` })));
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      let audioUrl: string | undefined;
      let ttsMode: "elevenlabs" | "none" = "none";
      const ttsResult = await tryElevenLabsTts(turn.narration);
      audioUrl = ttsResult.audioUrl ?? undefined;
      if (audioUrl) {
        ttsMode = "elevenlabs";
      }

      controller.enqueue(
        new TextEncoder().encode(
          encodeEvent("done", {
            narration: turn.narration,
            sceneTitle: turn.sceneTitle,
            suggestedChoices: turn.suggestedChoices,
            usedTts: Boolean(audioUrl),
            audioUrl,
            ttsMode,
            ttsDebug: ttsResult.debug,
          }),
        ),
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
