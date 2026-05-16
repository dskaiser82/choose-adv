import { getStoryBootstrap, type StoryBootstrap } from "@/lib/turso";
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
    bodyState?: string;
    mindState?: string;
    conditions?: string[];
    notes?: string[];
  };
  debug?: {
    generator?: string;
    timestamp?: number;
    usedStateFiles?: string[];
    model?: string;
    contextMode?: "full" | "delta";
    [key: string]: unknown;
  };
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";
const FULL_CONTEXT_INTERVAL = 10;
const MAJOR_FLAG_PREFIXES = ["setback_", "lost_item_"];

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
  contextMode,
}: {
  playerName: string;
  worldName: string;
  playerRegion?: string;
  playerRole?: string;
  action: string;
  contextMode: "full" | "delta";
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
      usedStateFiles: ["turso:runs", "turso:run_state", "turso:run_turns", "turso:run_events"],
      model: MODEL,
      contextMode,
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
      usedStateFiles: ["turso:runs", "turso:run_state", "turso:run_turns", "turso:run_events"],
      model: MODEL,
      contextMode: fallback.debug?.contextMode ?? "delta",
      ...(payload.debug ?? {}),
    },
  };
}

function buildFullNarratorStatePayload(story: StoryBootstrap) {
  return {
    run: {
      id: story.run.id,
      name: story.run.name,
      status: story.run.status,
    },
    character: {
      name: story.character.name,
      status: story.character.status,
      role: story.character.role,
      region: story.character.region,
      kingdom: story.character.kingdom,
      bodyState: story.character.bodyState,
      mindState: story.character.mindState,
      conditions: story.character.conditions ?? [],
      specializations: story.character.specializations,
    },
    world: {
      name: story.world.name,
      tone: story.world.tone,
      technologyLevel: story.world.technologyLevel,
      summary: story.world.summary,
      majorPowers: story.world.majorPowers,
      regions: story.world.regions,
      locations: story.world.locations,
    },
    currentScene: story.currentScene
      ? {
          title: story.currentScene.title,
          narration: story.currentScene.narration,
          suggestedChoices: story.currentScene.suggestedChoices,
        }
      : null,
    inventory: story.inventory.map((item) => ({
      name: item.name,
      slug: item.slug,
      itemType: item.itemType,
      quantity: item.quantity,
      equippedSlot: item.equippedSlot,
      magical: Boolean(item.metadata?.magical),
      protected: Boolean(item.metadata?.protected),
      abilities: (item.abilities ?? []).map((ability) => ({
        name: ability.name,
        description: ability.description,
        cost: ability.cost,
        downside: ability.downside,
        tags: ability.tags,
      })),
    })),
    flags: story.flags.map((flag) => ({
      key: flag.flagKey,
      value: flag.flagValue,
    })),
    recentEvents: story.recentEvents.slice(0, 5).map((event) => ({
      title: event.title,
      summary: event.summary,
      action: event.action,
      createdAt: event.createdAt,
    })),
  };
}

function buildDeltaNarratorStatePayload(story: StoryBootstrap) {
  const magicalInventory = story.inventory.filter((item) => Boolean(item.metadata?.magical));
  const importantFlags = story.flags.filter((flag) => MAJOR_FLAG_PREFIXES.some((prefix) => flag.flagKey.startsWith(prefix)));

  return {
    run: {
      name: story.run.name,
      status: story.run.status,
    },
    character: {
      name: story.character.name,
      role: story.character.role,
      region: story.character.region,
      bodyState: story.character.bodyState,
      mindState: story.character.mindState,
      conditions: story.character.conditions ?? [],
    },
    currentScene: story.currentScene
      ? {
          title: story.currentScene.title,
          narration: story.currentScene.narration.slice(0, 500),
          suggestedChoices: story.currentScene.suggestedChoices,
        }
      : null,
    magicalInventory: magicalInventory.map((item) => ({
      name: item.name,
      itemType: item.itemType,
      equippedSlot: item.equippedSlot,
      abilities: (item.abilities ?? []).map((ability) => ({
        name: ability.name,
        cost: ability.cost,
        downside: ability.downside,
        tags: ability.tags,
      })),
    })),
    flags: importantFlags.map((flag) => ({
      key: flag.flagKey,
      value: flag.flagValue,
    })),
    recentEvents: story.recentEvents.slice(0, 3).map((event) => ({
      title: event.title,
      summary: event.summary,
    })),
  };
}

function chooseNarratorContextMode(story: StoryBootstrap) {
  const turnCount = story.recentEvents.filter((event) => event.action && event.action !== "Reset story").length;
  const hasMajorFlag = story.flags.some((flag) => MAJOR_FLAG_PREFIXES.some((prefix) => flag.flagKey.startsWith(prefix)));
  const isCritical = [story.character.bodyState, story.character.mindState].some((value) => ["critical", "collapsed", "fractured", "broken"].includes((value ?? "").toLowerCase()));

  if (!story.currentScene) return "full" as const;
  if (turnCount === 0) return "full" as const;
  if (turnCount % FULL_CONTEXT_INTERVAL === 0) return "full" as const;
  if (hasMajorFlag || isCritical) return "full" as const;
  return "delta" as const;
}

async function generateTurn(body: {
  action?: string;
  playerName?: string;
  worldName?: string;
  playerRegion?: string;
  playerRole?: string;
  summaryText?: string;
  previousNarration?: string;
}, story: StoryBootstrap) {
  const contextMode = chooseNarratorContextMode(story);
  const {
    action = "",
    playerName = story.character.name || "Cade",
    worldName = story.world.name || "Veyr",
    playerRegion = story.character.region ?? undefined,
    playerRole = story.character.role ?? undefined,
    summaryText = story.world.summary ?? "",
    previousNarration = story.currentScene?.narration,
  } = body;

  const fallback = buildFallbackTurn({ action, playerName, worldName, playerRegion, playerRole, contextMode });
  const apiKey = process.env.OPEN_ROUTER_API;
  if (!apiKey) {
    return fallback;
  }

  const narratorState = contextMode === "full"
    ? buildFullNarratorStatePayload(story)
    : buildDeltaNarratorStatePayload(story);

  const systemPrompt = [
    "You are the game master for a personal dark fantasy roleplaying game.",
    "The database-backed narrator state provided by the app is canonical truth.",
    "You must ground narration and choices in the provided state.",
    "Do not invent new items, magical abilities, world facts, or conditions unless clearly justified by existing state and immediate scene logic.",
    "If an ability is item-granted, only use it if it appears in the narrator state payload.",
    "If a magical ability has a cost or downside, reflect that in your narration and suggested updates when relevant.",
    "Return ONLY valid JSON with this exact shape:",
    '{"ok":true,"sceneTitle":"...","narration":"...","suggestedChoices":["...","...","..."],"characterUpdate":{"status":"...","role":"...","region":"...","bodyState":"wounded","mindState":"stressed","conditions":["arrow_shoulder"],"notes":["..."]},"worldUpdate":{"summary":"...","tone":"...","notes":["..."],"regions":["..."],"locations":["..."]},"debug":{"generator":"openclaw-bridge","timestamp":123,"usedStateFiles":["turso:runs","turso:run_state","turso:run_turns","turso:run_events"]}}',
    "Rules:",
    "- No markdown",
    "- No explanation before or after JSON",
    "- Keep narration to 3-5 short paragraphs max",
    "- Suggested choices must be grounded in the current scene and actual available state",
    "- Only include worldUpdate or characterUpdate fields when something meaningful changed",
    "- Prefer narrative condition changes over numeric damage",
    "- Use bodyState values like healthy, strained, wounded, critical, collapsed",
    "- Use mindState values like clear, stressed, shaken, fractured, broken",
    "- Conditions should be concrete tags like arrow_shoulder, limping, bleeding, exhausted, watched_by_guard",
    "- Keep updates conservative and cumulative",
    "- Treat the narrator state payload as authoritative canon for gear, abilities, flags, and current context",
  ].join("\n");

  const userPrompt = [
    `Context mode: ${contextMode}`,
    `Player action: ${action}`,
    previousNarration ? `Previous narration: ${previousNarration}` : null,
    `Campaign summary: ${summaryText}`,
    "Canonical narrator state payload:",
    JSON.stringify(narratorState, null, 2),
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
        temperature: 0.7,
        max_tokens: 1100,
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
  const story = await getStoryBootstrap();
  const turn = await generateTurn(body ?? {}, story);

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
