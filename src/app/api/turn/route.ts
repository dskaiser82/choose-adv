import { persistTurn } from "@/lib/turso";

type TurnPayload = {
  ok: true;
  sceneTitle: string;
  narration: string;
  suggestedChoices: [string, string, string] | string[];
  worldUpdate?: {
    summary?: string;
    tone?: string;
    notes?: string[];
    regions?: string[];
    locations?: string[];
  };
  characterUpdate?: {
    status?: string;
    role?: string;
    region?: string;
    hitPoints?: number;
    notes?: string[];
  };
  debug?: {
    generator?: string;
    timestamp?: number;
    usedStateFiles?: string[];
    model?: string;
    [key: string]: unknown;
  };
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

function encodeEvent(event: string, data: unknown) {
  const json = JSON.stringify(data);
  const dataLines = json.split("\n").map((line) => `data: ${line}`).join("\n");
  return `event: ${event}\n${dataLines}\n\n`;
}

function buildFallbackTurn({
  playerName,
  worldName,
  playerRegion,
  playerRole,
  action,
}: {
  playerName: string;
  worldName: string;
  playerRegion?: string;
  playerRole?: string;
  action: string;
}): TurnPayload {
  const regionText = playerRegion ? ` in ${playerRegion}` : "";
  const roleText = playerRole ? `${playerRole}` : "traveler";

  return {
    ok: true,
    sceneTitle: `Turn Response: ${action.trim().slice(0, 42)}`,
    narration: [
      `${playerName}, ${roleText} of ${worldName}${regionText}, commits to a move: ${action.trim()}.`,
      `The scene tightens instead of resolving cleanly, and the world answers with danger just out of sight.`,
      `Cade has a brief window to press forward, hide and observe, or test the dark more carefully before it closes on him.`,
    ].join("\n\n"),
    suggestedChoices: [
      "Press forward before the danger can reposition",
      "Hold still and listen for the next sign of movement",
      "Test the shadows carefully before committing",
    ],
    debug: {
      generator: "openclaw-fallback",
      timestamp: Math.floor(Date.now() / 1000),
      usedStateFiles: ["turso:story_character", "turso:story_world", "turso:story_scene", "turso:story_events"],
      model: MODEL,
    },
  };
}

function sanitizeTurnPayload(payload: Partial<TurnPayload>, fallback: TurnPayload): TurnPayload {
  const sceneTitle = typeof payload.sceneTitle === "string" && payload.sceneTitle.trim()
    ? payload.sceneTitle.trim()
    : fallback.sceneTitle;
  const narration = typeof payload.narration === "string" && payload.narration.trim()
    ? payload.narration.trim()
    : fallback.narration;
  const suggestedChoices = Array.isArray(payload.suggestedChoices)
    ? payload.suggestedChoices.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
    : [];

  while (suggestedChoices.length < 3) {
    suggestedChoices.push(fallback.suggestedChoices[suggestedChoices.length] ?? "Keep moving cautiously");
  }

  return {
    ok: true,
    sceneTitle,
    narration,
    suggestedChoices,
    characterUpdate: payload.characterUpdate,
    worldUpdate: payload.worldUpdate,
    debug: {
      generator: "openclaw-openrouter",
      timestamp: Math.floor(Date.now() / 1000),
      usedStateFiles: ["turso:story_character", "turso:story_world", "turso:story_scene", "turso:story_events"],
      model: MODEL,
      ...(payload.debug ?? {}),
    },
  };
}

async function generateTurn(body: {
  action?: string;
  playerName?: string;
  worldName?: string;
  playerRegion?: string;
  playerRole?: string;
  summaryText?: string;
  previousNarration?: string;
}) {
  const {
    action = "",
    playerName = "Cade",
    worldName = "Veyr",
    playerRegion,
    playerRole,
    summaryText = "",
    previousNarration,
  } = body;

  const fallback = buildFallbackTurn({ action, playerName, worldName, playerRegion, playerRole });
  const apiKey = process.env.OPEN_ROUTER_API;
  if (!apiKey) {
    return fallback;
  }

  const systemPrompt = [
    "You are the game master for a personal dark fantasy roleplaying game.",
    "Return ONLY valid JSON with this exact shape:",
    '{"ok":true,"sceneTitle":"...","narration":"...","suggestedChoices":["...","...","..."],"characterUpdate":{"status":"...","role":"...","region":"...","hitPoints":100,"notes":["..."]},"worldUpdate":{"summary":"...","tone":"...","notes":["..."],"regions":["..."],"locations":["..."]},"debug":{"generator":"openclaw-bridge","timestamp":123,"usedStateFiles":["turso:story_character","turso:story_world","turso:story_scene","turso:story_events"]}}',
    "Rules:",
    "- No markdown",
    "- No explanation before or after JSON",
    "- Keep narration to 3-5 short paragraphs max",
    "- Suggested choices must be grounded in the scene",
    "- Only include worldUpdate or characterUpdate fields when something meaningful changed",
    "- Keep updates conservative and cumulative",
  ].join("\n");

  const userPrompt = [
    `Player: ${playerName}`,
    `World: ${worldName}`,
    `Action: ${action}`,
    previousNarration ? `Previous narration: ${previousNarration}` : null,
    playerRegion ? `Region: ${playerRegion}` : null,
    playerRole ? `Role: ${playerRole}` : null,
    "Latest event: The world of Veyr and the character Cade were established.",
    `Campaign summary: ${summaryText}`,
  ].filter(Boolean).join("\n\n");

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://choose-adventure-lake.vercel.app",
        "X-Title": "choose-adventure",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 900,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      return {
        ...fallback,
        debug: {
          ...(fallback.debug ?? {}),
          generator: "openclaw-openrouter-fallback",
          openRouterStatus: response.status,
        },
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return fallback;
    }

    const parsed = JSON.parse(content) as Partial<TurnPayload>;
    return sanitizeTurnPayload(parsed, fallback);
  } catch {
    return fallback;
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const turn = await generateTurn(body ?? {});

  await persistTurn({
    action: typeof body?.action === "string" ? body.action : "",
    sceneTitle: turn.sceneTitle,
    narration: turn.narration,
    suggestedChoices: turn.suggestedChoices,
    characterPatch: turn.characterUpdate,
    worldPatch: turn.worldUpdate,
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

      for (const paragraph of turn.narration.split(/\n\n+/)) {
        if (!paragraph.trim()) continue;
        controller.enqueue(new TextEncoder().encode(encodeEvent("chunk", { text: `${paragraph.trim()}\n\n` })));
      }

      controller.enqueue(
        new TextEncoder().encode(
          encodeEvent("done", {
            narration: turn.narration,
            sceneTitle: turn.sceneTitle,
            suggestedChoices: turn.suggestedChoices,
            debug: turn.debug,
            characterUpdate: turn.characterUpdate,
            worldUpdate: turn.worldUpdate,
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
