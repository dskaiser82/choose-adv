import { getStoryBootstrap, persistDiscovery, type StoryBootstrap } from "@/lib/turso";
import { persistTurn } from "@/lib/turso";

type DiscoveryPayload = {
  discoveryType: string;
  subtype?: string;
  key: string;
  name: string;
  summary: string;
  details?: string;
};

type DiscoveryBucketsPayload = {
  locations?: DiscoveryPayload[];
  people?: DiscoveryPayload[];
  factions?: DiscoveryPayload[];
  routes?: DiscoveryPayload[];
  threats?: DiscoveryPayload[];
  facts?: DiscoveryPayload[];
};

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
  discoveries?: DiscoveryBucketsPayload;
  debug?: {
    generator?: string;
    timestamp?: number;
    usedStateFiles?: string[];
    model?: string;
    contextMode?: "full" | "delta";
    promptMode?: "session_start" | "normal";
    [key: string]: unknown;
  };
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";
const FULL_CONTEXT_INTERVAL = 10;
const MAJOR_FLAG_PREFIXES = ["setback_", "lost_item_"];
const DISCOVERY_BUCKETS = ["locations", "people", "factions", "routes", "threats", "facts"] as const;

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
  promptMode,
}: {
  playerName: string;
  worldName: string;
  playerRegion?: string;
  playerRole?: string;
  action: string;
  contextMode: "full" | "delta";
  promptMode: "session_start" | "normal";
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
      usedStateFiles: ["turso:runs", "turso:run_state", "turso:run_turns", "turso:run_events", "turso:run_discoveries"],
      model: MODEL,
      contextMode,
      promptMode,
    },
  };
}

function sanitizeDiscoveryList(raw: unknown, defaultType: string) {
  if (!Array.isArray(raw)) return [] as DiscoveryPayload[];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const value = item as Record<string, unknown>;
    if (
      typeof value.key !== "string" ||
      typeof value.name !== "string" ||
      typeof value.summary !== "string"
    ) {
      return [];
    }
    return [{
      discoveryType: typeof value.discoveryType === "string" ? value.discoveryType : defaultType,
      subtype: typeof value.subtype === "string" ? value.subtype : undefined,
      key: value.key,
      name: value.name,
      summary: value.summary,
      details: typeof value.details === "string" ? value.details : undefined,
    }];
  });
}

function sanitizeDiscoveries(raw: unknown): DiscoveryBucketsPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const value = raw as Record<string, unknown>;
  return {
    locations: sanitizeDiscoveryList(value.locations, "location"),
    people: sanitizeDiscoveryList(value.people, "person"),
    factions: sanitizeDiscoveryList(value.factions, "faction"),
    routes: sanitizeDiscoveryList(value.routes, "route"),
    threats: sanitizeDiscoveryList(value.threats, "threat"),
    facts: sanitizeDiscoveryList(value.facts, "fact"),
  };
}

function flattenDiscoveries(discoveries: DiscoveryBucketsPayload | undefined) {
  if (!discoveries) return [] as DiscoveryPayload[];
  return DISCOVERY_BUCKETS.flatMap((bucket) => discoveries[bucket] ?? []);
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
    discoveries: sanitizeDiscoveries(payload.discoveries),
    debug: {
      generator: "openclaw-openrouter",
      timestamp: Math.floor(Date.now() / 1000),
      usedStateFiles: ["turso:runs", "turso:run_state", "turso:run_turns", "turso:run_events", "turso:run_discoveries"],
      model: MODEL,
      contextMode: fallback.debug?.contextMode ?? "delta",
      promptMode: fallback.debug?.promptMode ?? "normal",
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
    discoveries: story.discoveries.slice(0, 12).map((discovery) => ({
      discoveryType: discovery.discoveryType,
      key: discovery.key,
      name: discovery.name,
      summary: discovery.summary,
      details: discovery.details,
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
    discoveries: story.discoveries.slice(0, 4).map((discovery) => ({
      discoveryType: discovery.discoveryType,
      name: discovery.name,
      summary: discovery.summary,
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

function choosePromptMode(story: StoryBootstrap) {
  const turnCount = story.recentEvents.filter((event) => event.action && event.action !== "Reset story").length;
  return turnCount <= 1 ? "session_start" as const : "normal" as const;
}

function buildSystemPrompt(promptMode: "session_start" | "normal") {
  const common = [
    "You are the game master for a personal dark fantasy roleplaying game.",
    "The database-backed narrator state provided by the app is canonical truth.",
    "You must ground narration and choices in the provided state.",
    "Do not invent new items, magical abilities, world facts, or conditions unless clearly justified by existing state and immediate scene logic.",
    "If an ability is item-granted, only use it if it appears in the narrator state payload.",
    "If a magical ability has a cost or downside, reflect that in your narration and suggested updates when relevant.",
    "If the player asks a direct question, answer it as directly as the current fiction reasonably allows.",
    "If you introduce a meaningful new location, NPC, route, faction, threat, or fact, include it in discoveries so the app can save it as canon.",
    "Avoid repeating the same non-answer twice in a row.",
    "Return ONLY valid JSON with this exact shape:",
    '{"ok":true,"sceneTitle":"...","narration":"...","suggestedChoices":["...","...","..."],"characterUpdate":{"status":"...","role":"...","region":"...","bodyState":"wounded","mindState":"stressed","conditions":["arrow_shoulder"],"notes":["..."]},"worldUpdate":{"summary":"...","tone":"...","notes":["..."],"regions":["..."],"locations":["..."]},"discoveries":{"locations":[{"key":"oakhaven","subtype":"town","name":"Oakhaven","summary":"A frontier town beyond the woods.","details":"A likely destination and nearest settlement."}],"routes":[{"key":"whispering_pass","subtype":"pass","name":"Whispering Pass","summary":"A dangerous route leading toward Oakhaven.","details":"Known for eerie whispers, unstable footing, and ambush risk."}],"people":[],"factions":[],"threats":[],"facts":[]},"debug":{"generator":"openclaw-bridge","timestamp":123,"usedStateFiles":["turso:runs","turso:run_state","turso:run_turns","turso:run_events","turso:run_discoveries"]}}',
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
    "- Treat the narrator state payload as authoritative canon for gear, abilities, flags, discoveries, and current context",
  ];

  if (promptMode === "session_start") {
    return [
      ...common,
      "Session-start reminder:",
      "- You are a living GM/narrator, not just a prose engine.",
      "- You may expand the world through towns, routes, NPCs, factions, threats, and discoveries.",
      "- When you expand the world meaningfully, return discoveries in the bucketed structure so the app can persist them.",
      "- Start from uncertainty if the current scene is intentionally limited; do not force the character to already know the wider map.",
      "- Move the story forward instead of stalling in mood or repetition.",
    ].join("\n");
  }

  return common.join("\n");
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
  const promptMode = choosePromptMode(story);
  const {
    action = "",
    playerName = story.character.name || "Cade",
    worldName = story.world.name || "Veyr",
    playerRegion = story.character.region ?? undefined,
    playerRole = story.character.role ?? undefined,
    summaryText = story.world.summary ?? "",
    previousNarration = story.currentScene?.narration,
  } = body;

  const fallback = buildFallbackTurn({ action, playerName, worldName, playerRegion, playerRole, contextMode, promptMode });
  const apiKey = process.env.OPEN_ROUTER_API;
  if (!apiKey) {
    return fallback;
  }

  const narratorState = contextMode === "full"
    ? buildFullNarratorStatePayload(story)
    : buildDeltaNarratorStatePayload(story);

  const systemPrompt = buildSystemPrompt(promptMode);
  const userPrompt = [
    `Prompt mode: ${promptMode}`,
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
        max_tokens: 1300,
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

  for (const discovery of flattenDiscoveries(turn.discoveries)) {
    await persistDiscovery({
      discoveryType: discovery.subtype ? `${discovery.discoveryType}:${discovery.subtype}` : discovery.discoveryType,
      key: discovery.key,
      name: discovery.name,
      summary: discovery.summary,
      details: discovery.details,
    });
  }

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
            discoveries: turn.discoveries,
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
