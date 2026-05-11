import crypto from "node:crypto";

export type CharacterRecord = {
  name: string;
  status: string;
  kingdom?: string | null;
  region?: string | null;
  formerAffiliation?: string | null;
  role?: string | null;
  yearsOfService?: number | null;
  specializations: string[];
  hitPoints?: number | null;
  notes?: string[];
};

export type WorldRecord = {
  name: string;
  tone?: string | null;
  technologyLevel?: string | null;
  summary: string;
  majorPowers: string[];
  regions: string[];
  locations: string[];
  notes?: string[];
};

export type SceneRecord = {
  id: string;
  title: string;
  narration: string;
  suggestedChoices: string[];
  actionDraft?: string;
  updatedAt: string;
};

export type EventRecord = {
  id: string;
  title: string;
  summary: string;
  action?: string;
  createdAt: string;
};

export type StoryBootstrap = {
  character: CharacterRecord;
  world: WorldRecord;
  currentScene: SceneRecord | null;
  recentEvents: EventRecord[];
};

export type PersistTurnInput = {
  action: string;
  sceneTitle: string;
  narration: string;
  suggestedChoices: string[];
  characterPatch?: Partial<Pick<CharacterRecord, "status" | "kingdom" | "region" | "role" | "yearsOfService" | "hitPoints">> & {
    notes?: string[];
  };
  worldPatch?: Partial<Pick<WorldRecord, "tone" | "technologyLevel" | "summary">> & {
    notes?: string[];
    majorPowers?: string[];
    regions?: string[];
    locations?: string[];
  };
};

type ExecuteSuccess = {
  type: "ok";
  response: {
    type: "execute";
    result: {
      rows?: Array<Array<{ type: string; value: string | null }>>;
    };
  };
};

type PipelineResponse = {
  results?: ExecuteSuccess[];
};

function getTursoConfig() {
  const url = process.env.TURSO_DB_URL;
  const token = process.env.TURSO_DB_TOKEN;

  if (!url) throw new Error("Missing TURSO_DB_URL");
  if (!token) throw new Error("Missing TURSO_DB_TOKEN");

  return {
    url: url.replace("libsql://", "https://"),
    token,
  };
}

async function tursoPipeline(requests: Array<Record<string, unknown>>) {
  const { url, token } = getTursoConfig();
  const response = await fetch(`${url}/v2/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ requests }),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Turso request failed (${response.status}): ${text}`);
  }

  return JSON.parse(text) as PipelineResponse;
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function rows(payload: PipelineResponse, resultIndex: number) {
  return payload.results?.[resultIndex]?.response?.result?.rows ?? [];
}

function rowValue(row: Array<{ type: string; value: string | null }> | undefined, index: number) {
  return row?.[index]?.value ?? null;
}

function parseJsonArray(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function ensureSchema() {
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists story_world (
            id text primary key,
            name text not null,
            tone text,
            technology_level text,
            summary text not null,
            major_powers_json text not null,
            regions_json text not null,
            locations_json text not null,
            updated_at text not null
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists story_character (
            id text primary key,
            name text not null,
            status text not null,
            kingdom text,
            region text,
            former_affiliation text,
            role text,
            years_of_service integer,
            specializations_json text not null,
            updated_at text not null
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists story_scene (
            id text primary key,
            scene_key text not null unique,
            title text not null,
            narration text not null,
            suggested_choices_json text not null,
            action_draft text,
            updated_at text not null
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists story_events (
            id text primary key,
            event_key text not null unique,
            title text not null,
            summary text not null,
            action text,
            created_at text not null
          )
        `,
      },
    },
  ]);
}

export async function seedStoryDataIfMissing() {
  await ensureSchema();

  const payload = await tursoPipeline([
    { type: "execute", stmt: { sql: "select count(*) from story_world" } },
    { type: "execute", stmt: { sql: "select count(*) from story_character" } },
  ]);

  const worldCount = Number(rowValue(rows(payload, 0)[0], 0) ?? 0);
  const characterCount = Number(rowValue(rows(payload, 1)[0], 0) ?? 0);

  if (worldCount === 0) {
    await upsertWorld({
      id: "world-main",
      name: "Veyr",
      tone: "Dark political fantasy",
      technologyLevel: "Advanced medieval / early renaissance without firearms",
      summary:
        "Veyr is a hard land of rival powers, border intrigue, and quiet violence. Cade operates in the Grey Marches, where decaying loyalties, reconnaissance work, and hidden threats shape every decision.",
      majorPowers: ["Avaren", "Velkan Marches", "The Free Coast"],
      regions: ["The Grey Marches"],
      locations: ["Blackmere"],
    });
  }

  if (characterCount === 0) {
    await upsertCharacter({
      id: "character-main",
      name: "Cade",
      status: "alive",
      kingdom: "Avaren",
      region: "The Grey Marches",
      formerAffiliation: "Black Veil Corps",
      role: "Frontier reconnaissance operative",
      yearsOfService: 11,
      specializations: [
        "Stealth",
        "Reconnaissance",
        "Crossbow marksmanship",
        "Tactical planning",
        "Survival",
        "Infiltration",
        "Assassination",
        "Frontier operations",
      ],
      hitPoints: 100,
      notes: [],
    });
  }
}

export async function upsertWorld({
  id,
  name,
  tone,
  technologyLevel,
  summary,
  majorPowers,
  regions,
  locations,
  updatedAt,
}: {
  id: string;
  name: string;
  tone?: string | null;
  technologyLevel?: string | null;
  summary: string;
  majorPowers: string[];
  regions: string[];
  locations: string[];
  updatedAt?: string;
}) {
  const now = updatedAt ?? new Date().toISOString();
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into story_world (
            id, name, tone, technology_level, summary, major_powers_json, regions_json, locations_json, updated_at
          ) values (
            ${sqlString(id)},
            ${sqlString(name)},
            ${sqlString(tone ?? "")},
            ${sqlString(technologyLevel ?? "")},
            ${sqlString(summary)},
            ${sqlString(JSON.stringify(majorPowers))},
            ${sqlString(JSON.stringify(regions))},
            ${sqlString(JSON.stringify(locations))},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            tone = excluded.tone,
            technology_level = excluded.technology_level,
            summary = excluded.summary,
            major_powers_json = excluded.major_powers_json,
            regions_json = excluded.regions_json,
            locations_json = excluded.locations_json,
            updated_at = excluded.updated_at
        `,
      },
    },
  ]);
}

export async function upsertCharacter({
  id,
  name,
  status,
  kingdom,
  region,
  formerAffiliation,
  role,
  yearsOfService,
  specializations,
  updatedAt,
  hitPoints,
  notes,
}: {
  id: string;
  name: string;
  status: string;
  kingdom?: string | null;
  region?: string | null;
  formerAffiliation?: string | null;
  role?: string | null;
  yearsOfService?: number | null;
  specializations: string[];
  updatedAt?: string;
  hitPoints?: number | null;
  notes?: string[];
}) {
  const now = updatedAt ?? new Date().toISOString();
  const roleWithMeta = role
    ? hitPoints != null || (notes?.length ?? 0) > 0
      ? `${role} | hp:${hitPoints ?? ""}${notes?.length ? ` | notes:${notes.join(" / ")}` : ""}`
      : role
    : hitPoints != null || (notes?.length ?? 0) > 0
      ? `hp:${hitPoints ?? ""}${notes?.length ? ` | notes:${notes.join(" / ")}` : ""}`
      : "";

  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into story_character (
            id, name, status, kingdom, region, former_affiliation, role, years_of_service, specializations_json, updated_at
          ) values (
            ${sqlString(id)},
            ${sqlString(name)},
            ${sqlString(status)},
            ${sqlString(kingdom ?? "")},
            ${sqlString(region ?? "")},
            ${sqlString(formerAffiliation ?? "")},
            ${sqlString(roleWithMeta)},
            ${yearsOfService ?? "null"},
            ${sqlString(JSON.stringify(specializations))},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            status = excluded.status,
            kingdom = excluded.kingdom,
            region = excluded.region,
            former_affiliation = excluded.former_affiliation,
            role = excluded.role,
            years_of_service = excluded.years_of_service,
            specializations_json = excluded.specializations_json,
            updated_at = excluded.updated_at
        `,
      },
    },
  ]);
}

export async function upsertScene({
  id,
  sceneKey,
  title,
  narration,
  suggestedChoices,
  actionDraft,
  updatedAt,
}: {
  id: string;
  sceneKey: string;
  title: string;
  narration: string;
  suggestedChoices: string[];
  actionDraft?: string | null;
  updatedAt?: string;
}) {
  const now = updatedAt ?? new Date().toISOString();
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into story_scene (
            id, scene_key, title, narration, suggested_choices_json, action_draft, updated_at
          ) values (
            ${sqlString(id)},
            ${sqlString(sceneKey)},
            ${sqlString(title)},
            ${sqlString(narration)},
            ${sqlString(JSON.stringify(suggestedChoices))},
            ${sqlString(actionDraft ?? "")},
            ${sqlString(now)}
          )
          on conflict(scene_key) do update set
            title = excluded.title,
            narration = excluded.narration,
            suggested_choices_json = excluded.suggested_choices_json,
            action_draft = excluded.action_draft,
            updated_at = excluded.updated_at
        `,
      },
    },
  ]);
}

export async function appendEvent({
  id,
  eventKey,
  title,
  summary,
  action,
  createdAt,
}: {
  id: string;
  eventKey: string;
  title: string;
  summary: string;
  action?: string | null;
  createdAt?: string;
}) {
  const now = createdAt ?? new Date().toISOString();
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into story_events (
            id, event_key, title, summary, action, created_at
          ) values (
            ${sqlString(id)},
            ${sqlString(eventKey)},
            ${sqlString(title)},
            ${sqlString(summary)},
            ${sqlString(action ?? "")},
            ${sqlString(now)}
          )
          on conflict(event_key) do nothing
        `,
      },
    },
  ]);
}

export async function persistTurn(input: PersistTurnInput) {
  await seedStoryDataIfMissing();
  const now = new Date().toISOString();
  const bootstrap = await getStoryBootstrap();

  const nextCharacter: CharacterRecord = {
    ...bootstrap.character,
    ...(input.characterPatch ?? {}),
    notes: input.characterPatch?.notes ?? bootstrap.character.notes ?? [],
  };

  const nextWorld: WorldRecord = {
    ...bootstrap.world,
    ...(input.worldPatch ?? {}),
    majorPowers: input.worldPatch?.majorPowers ?? bootstrap.world.majorPowers,
    regions: input.worldPatch?.regions ?? bootstrap.world.regions,
    locations: input.worldPatch?.locations ?? bootstrap.world.locations,
    notes: input.worldPatch?.notes ?? bootstrap.world.notes ?? [],
  };

  await upsertScene({
    id: crypto.randomUUID(),
    sceneKey: "current",
    title: input.sceneTitle,
    narration: input.narration,
    suggestedChoices: input.suggestedChoices,
    actionDraft: "",
    updatedAt: now,
  });

  await appendEvent({
    id: crypto.randomUUID(),
    eventKey: `turn-${now}`,
    title: input.sceneTitle,
    summary: input.narration,
    action: input.action,
    createdAt: now,
  });

  await upsertCharacter({
    id: "character-main",
    name: nextCharacter.name,
    status: nextCharacter.status,
    kingdom: nextCharacter.kingdom,
    region: nextCharacter.region,
    formerAffiliation: nextCharacter.formerAffiliation,
    role: nextCharacter.role,
    yearsOfService: nextCharacter.yearsOfService,
    specializations: nextCharacter.specializations,
    hitPoints: nextCharacter.hitPoints,
    notes: nextCharacter.notes,
    updatedAt: now,
  });

  await upsertWorld({
    id: "world-main",
    name: nextWorld.name,
    tone: nextWorld.tone,
    technologyLevel: nextWorld.technologyLevel,
    summary: nextWorld.summary,
    majorPowers: nextWorld.majorPowers,
    regions: nextWorld.regions,
    locations: nextWorld.locations,
    updatedAt: now,
  });

  return getStoryBootstrap();
}

export async function upsertSampleStoryState() {
  await seedStoryDataIfMissing();

  const sceneTime = new Date().toISOString();
  await upsertScene({
    id: crypto.randomUUID(),
    sceneKey: "current",
    title: "Current Scene",
    narration: "Cade tests the story engine and confirms the campaign now uses a cleaner multi-table Turso model.",
    suggestedChoices: ["Continue scouting", "Review the world", "Ask what changed"],
    actionDraft: "Scout the area before entering town",
    updatedAt: sceneTime,
  });

  await appendEvent({
    id: crypto.randomUUID(),
    eventKey: `event-${sceneTime}`,
    title: "Schema update complete",
    summary: "The campaign was moved back onto a sane multi-table story model.",
    action: "Migration / schema cleanup",
    createdAt: sceneTime,
  });

  return {
    tableCounts: await getTableCounts(),
    currentScene: (await getStoryBootstrap()).currentScene,
  };
}

export async function getTableCounts() {
  await ensureSchema();
  const payload = await tursoPipeline([
    { type: "execute", stmt: { sql: "select count(*) from story_world" } },
    { type: "execute", stmt: { sql: "select count(*) from story_character" } },
    { type: "execute", stmt: { sql: "select count(*) from story_scene" } },
    { type: "execute", stmt: { sql: "select count(*) from story_events" } },
  ]);

  return {
    world: Number(rowValue(rows(payload, 0)[0], 0) ?? 0),
    character: Number(rowValue(rows(payload, 1)[0], 0) ?? 0),
    scene: Number(rowValue(rows(payload, 2)[0], 0) ?? 0),
    event: Number(rowValue(rows(payload, 3)[0], 0) ?? 0),
  };
}

export async function getStoryBootstrap(): Promise<StoryBootstrap> {
  await seedStoryDataIfMissing();

  const payload = await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `select id, name, tone, technology_level, summary, major_powers_json, regions_json, locations_json, updated_at from story_world order by updated_at desc limit 1`,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `select id, name, status, kingdom, region, former_affiliation, role, years_of_service, specializations_json, updated_at from story_character order by updated_at desc limit 1`,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `select id, title, narration, suggested_choices_json, action_draft, updated_at from story_scene where scene_key = 'current' limit 1`,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `select id, title, summary, action, created_at from story_events order by created_at desc limit 8`,
      },
    },
  ]);

  const worldRow = rows(payload, 0)[0];
  const characterRow = rows(payload, 1)[0];
  const sceneRow = rows(payload, 2)[0];
  const eventRows = rows(payload, 3);
  const rawRole = rowValue(characterRow, 6) ?? "";
  const [baseRole] = rawRole.split(" | hp:");

  return {
    world: {
      name: rowValue(worldRow, 1) ?? "Veyr",
      tone: rowValue(worldRow, 2),
      technologyLevel: rowValue(worldRow, 3),
      summary: rowValue(worldRow, 4) ?? "A dangerous frontier waits.",
      majorPowers: parseJsonArray(rowValue(worldRow, 5)),
      regions: parseJsonArray(rowValue(worldRow, 6)),
      locations: parseJsonArray(rowValue(worldRow, 7)),
      notes: [],
    },
    character: {
      name: rowValue(characterRow, 1) ?? "Cade",
      status: rowValue(characterRow, 2) ?? "alive",
      kingdom: rowValue(characterRow, 3),
      region: rowValue(characterRow, 4),
      formerAffiliation: rowValue(characterRow, 5),
      role: baseRole || rawRole || null,
      yearsOfService: rowValue(characterRow, 7) ? Number(rowValue(characterRow, 7)) : null,
      specializations: parseJsonArray(rowValue(characterRow, 8)),
      notes: [],
      hitPoints: null,
    },
    currentScene: sceneRow
      ? {
          id: rowValue(sceneRow, 0) ?? crypto.randomUUID(),
          title: rowValue(sceneRow, 1) ?? "Current Scene",
          narration: rowValue(sceneRow, 2) ?? "",
          suggestedChoices: parseJsonArray(rowValue(sceneRow, 3)),
          actionDraft: rowValue(sceneRow, 4) ?? undefined,
          updatedAt: rowValue(sceneRow, 5) ?? new Date().toISOString(),
        }
      : null,
    recentEvents: eventRows.map((row) => ({
      id: rowValue(row, 0) ?? crypto.randomUUID(),
      title: rowValue(row, 1) ?? "Untitled event",
      summary: rowValue(row, 2) ?? "",
      action: rowValue(row, 3) ?? undefined,
      createdAt: rowValue(row, 4) ?? new Date().toISOString(),
    })),
  };
}
