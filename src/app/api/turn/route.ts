import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

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

async function tryPiperTts(text: string) {
  const piperDir = "/home/gobotmini/.openclaw/workspace/tools/piper";
  const voiceDir = path.join(piperDir, "voices");
  const modelPath = path.join(voiceDir, "en_US-lessac-medium.onnx");
  const binaryPath = path.join(piperDir, "piper");

  try {
    await fs.access(binaryPath);
    await fs.access(modelPath);
  } catch {
    return null;
  }

  const outputDir = path.join(process.cwd(), "public", "generated-audio");
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `turn-${Date.now()}.wav`;
  const outputFile = path.join(outputDir, fileName);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(binaryPath, ["--model", modelPath, "--output_file", outputFile], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Piper exited with code ${code}`));
    });

    child.stdin.write(text);
    child.stdin.end();
  });

  return `/generated-audio/${fileName}`;
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
      let ttsMode: "piper" | "browser" | "none" = "browser";

      try {
        audioUrl = (await tryPiperTts(turn.narration)) ?? undefined;
        if (audioUrl) {
          ttsMode = "piper";
        }
      } catch {
        ttsMode = "browser";
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
