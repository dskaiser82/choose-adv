import { getStoryBootstrap, persistDiscovery, persistTeamMember, type StoryBootstrap } from "@/lib/turso";
import { persistTurn } from "@/lib/turso";

type DiscoveryPayload = {
  discoveryType: string;
  subtype?: string;
  key: string;
  name: string;
  summary: string;
  details?: string;
};

type PersonDiscoveryPayload = DiscoveryPayload & {
  role?: string;
  relationship?: string;
  status?: string;
  isCompanion?: boolean;
  isActive?: boolean;
  notes?: string;
};

type DiscoveryBucketsPayload = {
  locations?: DiscoveryPayload[];
  people?: PersonDiscoveryPayload[];
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
const FULL_CONTEXT_INTERVAL = 3;
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
  const canonicalPlayerName = playerName.trim() || "Cade";

  return {
    ok: true,
    sceneTitle: `Turn Response: ${action.trim().slice(0, 42)}`,
    narration: [
      `${canonicalPlayerName}, ${roleText} of ${worldName}${regionText}, commits to a move: ${action.trim()}.`,
      `The scene tightens instead of resolving cleanly, and the world answers with danger just out of sight.`,
      `${canonicalPlayerName} has a brief window to press forward, hide and observe, or test the dark more carefully before it closes on them.`,
    ].join("\n\n"),
    suggestedChoices: [
      "Press forward before the danger can reposition",
      "Hold still and listen for the next sign of movement",
      "Test the shadows carefully before committing",
    ],
    debug: {
      generator: "openclaw-fallback",
      timestamp: Math.floor(Date.now() / 1000),
      usedStateFiles: [
        "turso:runs",
        "turso:run_state",
        "turso:run_turns",
        "turso:run_events",
        "turso:run_discoveries",
        "turso:run_team_members",
      ],
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

function sanitizePeopleList(raw: unknown) {
  if (!Array.isArray(raw)) return [] as PersonDiscoveryPayload[];
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
      discoveryType: typeof value.discoveryType === "string" ? value.discoveryType : "person",
      subtype: typeof value.subtype === "string" ? value.subtype : undefined,
      key: value.key,
      name: value.name,
      summary: value.summary,
      details: typeof value.details === "string" ? value.details : undefined,
      role: typeof value.role === "string" ? value.role : undefined,
      relationship: typeof value.relationship === "string" ? value.relationship : undefined,
      status: typeof value.status === "string" ? value.status : undefined,
      isCompanion: typeof value.isCompanion === "boolean" ? value.isCompanion : undefined,
      isActive: typeof value.isActive === "boolean" ? value.isActive : undefined,
      notes: typeof value.notes === "string" ? value.notes : undefined,
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
    people: sanitizePeopleList(value.people),
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
      usedStateFiles: [
        "turso:runs",
        "turso:run_state",
        "turso:run_turns",
        "turso:run_events",
        "turso:run_discoveries",
        "turso:run_team_members",
      ],
      model: MODEL,
      contextMode: fallback.debug?.contextMode ?? "delta",
      promptMode: fallback.debug?.promptMode ?? "normal",
      ...(payload.debug ?? {}),
    },
  };
}

function summarizeNarrationForState(narration?: string | null) {
  if (!narration) return undefined;
  const normalized = narration.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 280);
}

function buildSceneState(story: StoryBootstrap["currentScene"], options?: { includeNarration?: boolean }) {
  if (!story) return null;
  return {
    title: story.title,
    narrationSummary: options?.includeNarration === false ? undefined : summarizeNarrationForState(story.narration),
    suggestedChoices: story.suggestedChoices,
    actionDraft: story.actionDraft,
    updatedAt: story.updatedAt,
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
    currentScene: buildSceneState(story.currentScene),
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
    teamMembers: story.teamMembers.slice(0, 10).map((member) => ({
      personKey: member.personKey,
      name: member.name,
      role: member.role,
      summary: member.summary,
      relationship: member.relationship,
      status: member.status,
      isCompanion: member.isCompanion,
      isActive: member.isActive,
      notes: member.notes,
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
  const likelyRelevantInventory = story.inventory.filter((item) => item.quantity > 0).slice(0, 10);

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
      notes: story.character.notes ?? [],
      specializations: story.character.specializations ?? [],
    },
    world: {
      name: story.world.name,
      tone: story.world.tone,
      summary: story.world.summary,
      regions: story.world.regions,
      locations: story.world.locations,
      notes: story.world.notes,
    },
    currentScene: buildSceneState(story.currentScene),
    inventory: likelyRelevantInventory.map((item) => ({
      name: item.name,
      slug: item.slug,
      itemType: item.itemType,
      quantity: item.quantity,
      equippedSlot: item.equippedSlot,
      protected: Boolean(item.metadata?.protected),
      magical: Boolean(item.metadata?.magical),
    })),
    magicalInventory: magicalInventory.map((item) => ({
      name: item.name,
      itemType: item.itemType,
      equippedSlot: item.equippedSlot,
      abilities: (item.abilities ?? []).map((ability) => ({
        name: ability.name,
        description: ability.description,
        cost: ability.cost,
        downside: ability.downside,
        tags: ability.tags,
      })),
    })),
    teamMembers: story.teamMembers.slice(0, 10).map((member) => ({
      personKey: member.personKey,
      name: member.name,
      role: member.role,
      summary: member.summary,
      relationship: member.relationship,
      status: member.status,
      isCompanion: member.isCompanion,
      isActive: member.isActive,
      notes: member.notes,
    })),
    discoveries: story.discoveries.slice(0, 12).map((discovery) => ({
      discoveryType: discovery.discoveryType,
      key: discovery.key,
      name: discovery.name,
      summary: discovery.summary,
      details: discovery.details,
    })),
    flags: importantFlags.map((flag) => ({
      key: flag.flagKey,
      value: flag.flagValue,
    })),
    recentEvents: story.recentEvents.slice(0, 8).map((event) => ({
      title: event.title,
      summary: event.summary,
      action: event.action,
      createdAt: event.createdAt,
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
    "The protagonist identity in that narrator state is locked canon: use the exact character.name from the narrator state payload as the player character's name, never rename or substitute it, and never promote an NPC/example name into the protagonist role.",
    "You must ground narration and choices in the provided state.",
    "Do not invent new items, magical abilities, world facts, or conditions unless clearly justified by existing state and immediate scene logic.",
    "If an ability is item-granted, only use it if it appears in the narrator state payload.",
    "If a magical ability has a cost or downside, reflect that in your narration and suggested updates when relevant.",
    "If the player asks a direct question, answer it as directly as the current fiction reasonably allows.",
    "If you introduce a meaningful new location, NPC, route, faction, threat, or fact, include it in discoveries so the app can save it as canon.",
    "If you introduce or deepen a recurring ally, companion, or notable person, include them in the people bucket with role, relationship, status, and whether they are a companion/active companion.",
    "Avoid repeating the same non-answer twice in a row.",
    "Every turn must materially advance the situation. Each response must include at least one of the following: a new fact, a new threat, a changed situation, a concrete consequence, or a discovered person/place/object.",
    "The scene must end in a meaningfully different state than it began unless the concrete outcome is a failed action, capture, injury, loss, blocked path, or newly revealed constraint.",
    "If the player attempts something, resolve what happens next instead of stalling at the moment before outcome.",
    "Treat each turn as a state transition, not a vignette. The output should leave the run in a concretely updated narrative position.",
    "When in doubt, prefer consequence over suspense and changed circumstances over repeated framing.",
    "If prior narration or scene summaries appear in the prompt, treat them as state reference only and do not echo their wording unless the situation genuinely still matches.",
    "Do not spend the whole response re-describing atmosphere, mood, weather, or scenery if the situation has not changed.",
    "Narration should prioritize motion, consequence, and decision pressure over decorative prose.",
    "Description is support material, not the main event. Keep sensory detail in service of action, consequence, or decision pressure.",
    "Return ONLY valid JSON with this exact top-level shape:",
    '{"ok":true,"sceneTitle":"string","narration":"string","suggestedChoices":["string","string","string"],"characterUpdate":{"status":"string","role":"string","region":"string","bodyState":"string","mindState":"string","conditions":["string"],"notes":["string"]},"worldUpdate":{"summary":"string","tone":"string","notes":["string"],"regions":["string"],"locations":["string"]},"discoveries":{"locations":[{"key":"string","subtype":"string","name":"string","summary":"string","details":"string"}],"people":[{"key":"string","subtype":"string","name":"string","summary":"string","details":"string","role":"string","relationship":"string","status":"string","isCompanion":true,"isActive":true,"notes":"string"}],"factions":[{"key":"string","subtype":"string","name":"string","summary":"string","details":"string"}],"routes":[{"key":"string","subtype":"string","name":"string","summary":"string","details":"string"}],"threats":[{"key":"string","subtype":"string","name":"string","summary":"string","details":"string"}],"facts":[{"key":"string","subtype":"string","name":"string","summary":"string","details":"string"}]},"debug":{"generator":"string","timestamp":123,"usedStateFiles":["string"]}}',
    "Rules:",
    "- No markdown",
    "- No explanation before or after JSON",
    "- Keep narration to 2-4 short paragraphs max",
    "- Keep each paragraph lean; avoid purple prose and repetitive ambience",
    "- Each turn must contain an outcome, reveal, complication, or irreversible commitment before the response ends",
    "- Resolve the player's attempted action into a concrete next state; do not freeze at the threshold of action",
    "- Do not merely foreshadow an outcome, imply movement, or describe preparation; narrate what actually changed by the end of the turn",
    "- If the action fails or is blocked, the failure/blockage itself must produce new information, pressure, cost, or repositioning",
    "- Suggested choices must be grounded in the current scene and actual available state",
    "- Suggested choices should be meaningfully distinct from each other, not three variations of the same move",
    "- At least one suggested choice should meaningfully escalate, commit, or risk something",
    "- The turn should not end in the same exact situational posture it started in unless a failed action or blockage is itself the concrete outcome",
    "- Only include worldUpdate or characterUpdate fields when something meaningful changed",
    "- Prefer narrative condition changes over numeric damage",
    "- Use bodyState values like healthy, strained, wounded, critical, collapsed",
    "- Use mindState values like clear, stressed, shaken, fractured, broken",
    "- Conditions should be concrete tags like arrow_shoulder, limping, bleeding, exhausted, watched_by_guard",
    "- Keep updates conservative and cumulative",
    "- Treat the narrator state payload as authoritative canon for gear, abilities, flags, discoveries, team members, and current context",
  ];

  if (promptMode === "session_start") {
    return [
      ...common,
      "Session-start reminder:",
      "- You are a living GM/narrator, not just a prose engine.",
      "- You may expand the world through towns, routes, NPCs, factions, threats, discoveries, and companions.",
      "- When you expand the world meaningfully, return discoveries in the bucketed structure so the app can persist them.",
      "- If a recurring ally becomes a companion or active traveling member, include that explicitly in the people bucket.",
      "- Start from uncertainty if the current scene is intentionally limited; do not force the character to already know the wider map.",
      "- Move the story forward instead of stalling in mood or repetition.",
      "- Early turns should produce a hook, discovery, threat, obstacle, or consequence quickly instead of lingering in setup description.",
      "- Do not spend an early turn just admiring scenery or atmosphere; make something happen.",
    ].join("\n");
  }

  return common.join("\n");
}

type TurnGenerationResult = {
  turn: TurnPayload;
  debugPayload?: Record<string, unknown>;
};

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

  const previousNarrationSummary = summarizeNarrationForState(previousNarration);
  const fallback = buildFallbackTurn({ action, playerName, worldName, playerRegion, playerRole, contextMode, promptMode });
  const apiKey = process.env.OPEN_ROUTER_API;
  if (!apiKey) {
    return { turn: fallback };
  }

  const narratorState = contextMode === "full"
    ? buildFullNarratorStatePayload(story)
    : buildDeltaNarratorStatePayload(story);

  const systemPrompt = buildSystemPrompt(promptMode);
  const userPrompt = [
    `Prompt mode: ${promptMode}`,
    `Context mode: ${contextMode}`,
    `Locked protagonist name: ${story.character.name || playerName || "Cade"}`,
    "Use that exact protagonist name in narration unless dialogue requires another character to say it aloud.",
    `Player action: ${action}`,
    previousNarrationSummary ? `Previous narration summary (state reference, do not echo): ${previousNarrationSummary}` : null,
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
        turn: {
          ...fallback,
          debug: {
            ...(fallback.debug ?? {}),
            generator: "openclaw-openrouter-fallback",
            openRouterStatus: response.status,
          },
        },
        debugPayload: {
          model: MODEL,
          contextMode,
          promptMode,
          systemPrompt,
          userPrompt,
          openRouterStatus: response.status,
        },
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return {
        turn: fallback,
        debugPayload: {
          model: MODEL,
          contextMode,
          promptMode,
          systemPrompt,
          userPrompt,
          rawResponse: data,
          parseState: "missing-content",
        },
      };
    }

    const parsed = JSON.parse(content) as Partial<TurnPayload>;
    return {
      turn: sanitizeTurnPayload(parsed, fallback),
      debugPayload: {
        model: MODEL,
        contextMode,
        promptMode,
        systemPrompt,
        userPrompt,
        rawResponse: data,
        rawContent: content,
      },
    };
  } catch (error) {
    return {
      turn: fallback,
      debugPayload: {
        model: MODEL,
        contextMode,
        promptMode,
        systemPrompt,
        userPrompt,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const story = await getStoryBootstrap();
  const { turn, debugPayload } = await generateTurn(body ?? {}, story);

  await persistTurn({
    action: typeof body?.action === "string" ? body.action : "",
    sceneTitle: turn.sceneTitle,
    narration: turn.narration,
    suggestedChoices: turn.suggestedChoices,
    characterPatch: turn.characterUpdate,
    worldPatch: turn.worldUpdate,
    debugPayload,
  });

  for (const discovery of flattenDiscoveries(turn.discoveries)) {
    const discoveryType = discovery.subtype ? `${discovery.discoveryType}:${discovery.subtype}` : discovery.discoveryType;
    await persistDiscovery({
      discoveryType,
      key: discovery.key,
      name: discovery.name,
      summary: discovery.summary,
      details: discovery.details,
    });
  }

  for (const person of turn.discoveries?.people ?? []) {
    await persistTeamMember({
      personKey: person.key,
      name: person.name,
      role: person.role,
      summary: person.summary,
      relationship: person.relationship,
      status: person.status ?? "known",
      isCompanion: person.isCompanion ?? false,
      isActive: person.isActive ?? false,
      notes: person.notes ?? person.details,
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
