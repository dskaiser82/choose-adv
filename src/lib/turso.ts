import crypto from "node:crypto";

export type CharacterRecord = {
  id?: string;
  name: string;
  status: string;
  kingdom?: string | null;
  region?: string | null;
  formerAffiliation?: string | null;
  role?: string | null;
  yearsOfService?: number | null;
  specializations: string[];
  bodyState?: string | null;
  mindState?: string | null;
  conditions?: string[];
  notes?: string[];
};

export type WorldRecord = {
  id?: string;
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
  sceneKey?: string;
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

export type RunRecord = {
  id: string;
  campaignId: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type InventoryAbilityRecord = {
  key: string;
  name: string;
  description: string;
  cost: string;
  downside: string;
  tags: string[];
};

export type InventoryRecord = {
  itemId: string;
  slug: string;
  name: string;
  itemType: string;
  description?: string | null;
  quantity: number;
  equippedSlot?: string | null;
  metadata?: Record<string, unknown> | null;
  abilities?: InventoryAbilityRecord[];
};

export type FlagRecord = {
  flagKey: string;
  flagValue: string;
  updatedAt: string;
};

export type DiscoveryRecord = {
  id: string;
  discoveryType: string;
  key: string;
  name: string;
  summary: string;
  details?: string | null;
  createdAt: string;
};

export type TeamMemberRecord = {
  id: string;
  personKey: string;
  name: string;
  role?: string | null;
  summary: string;
  relationship?: string | null;
  status: string;
  isCompanion: boolean;
  isActive: boolean;
  notes?: string | null;
  updatedAt: string;
};

export type StoryBootstrap = {
  run: RunRecord;
  character: CharacterRecord;
  world: WorldRecord;
  currentScene: SceneRecord | null;
  recentEvents: EventRecord[];
  inventory: InventoryRecord[];
  flags: FlagRecord[];
  discoveries: DiscoveryRecord[];
  teamMembers: TeamMemberRecord[];
};

export type PersistDiscoveryInput = {
  runId?: string;
  discoveryType: string;
  key: string;
  name: string;
  summary: string;
  details?: string | null;
};

export type PersistTeamMemberInput = {
  runId?: string;
  personKey: string;
  name: string;
  role?: string | null;
  summary: string;
  relationship?: string | null;
  status?: string;
  isCompanion?: boolean;
  isActive?: boolean;
  notes?: string | null;
};

export type PersistTurnInput = {
  runId?: string;
  action: string;
  sceneTitle: string;
  narration: string;
  suggestedChoices: string[];
  characterPatch?: Partial<Pick<CharacterRecord, "status" | "kingdom" | "region" | "role" | "yearsOfService" | "bodyState" | "mindState">> & {
    conditions?: string[];
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

const DEFAULT_CAMPAIGN_ID = "campaign-veyr";
const DEFAULT_RUN_ID = "run-main";
const DEFAULT_RUN_SLUG = "main";
const DEFAULT_CHARACTER_ID = "character-cade";
const DEFAULT_WORLD_ID = "world-veyr";
const RECOVERY_CONDITION_TAGS = new Set(["resting", "treated", "safe_shelter"]);
const CRITICAL_BODY_STATES = new Set(["critical", "collapsed"]);
const CRITICAL_MIND_STATES = new Set(["fractured", "broken"]);

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

function sqlNullableString(value?: string | null) {
  return value == null ? "null" : sqlString(value);
}

function sqlNumber(value?: number | null) {
  return value == null ? "null" : String(value);
}

function sqlBoolean(value: boolean) {
  return value ? "1" : "0";
}

function sqlJson(value: unknown) {
  return sqlString(JSON.stringify(value));
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

function parseJsonObject(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseInventoryAbilities(metadata: Record<string, unknown> | null) {
  const raw = metadata?.abilities;
  if (!Array.isArray(raw)) return [] as InventoryAbilityRecord[];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const value = entry as Record<string, unknown>;
    if (typeof value.key !== "string" || typeof value.name !== "string" || typeof value.description !== "string") return [];
    return [{
      key: value.key,
      name: value.name,
      description: typeof value.description === "string" ? value.description : "",
      cost: typeof value.cost === "string" ? value.cost : "",
      downside: typeof value.downside === "string" ? value.downside : "",
      tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
    }];
  });
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function classifySetback(character: CharacterRecord) {
  const conditions = (character.conditions ?? []).map(normalizeTag);
  if (conditions.includes("watched_by_guard") || conditions.includes("wanted_by_guard")) {
    return {
      kind: "jailed",
      title: "Caught and confined",
      sceneTitle: "Cold Stone Holding Cell",
      sceneNarration:
        "Cade comes to behind cold iron bars with a dry mouth, a pounding head, and the stale smell of damp stone. The guards stripped away anything dangerous, but not everything valuable is necessarily gone forever.",
      flag: { key: "setback_state", value: "jailed" },
      dropPreference: "equipment",
      addedConditions: ["confined", "recovering"],
      bodyState: "wounded",
      mindState: "shaken",
      region: character.region ?? "Unknown custody",
      status: "alive",
    };
  }

  if (conditions.includes("bleeding") || conditions.includes("arrow_shoulder") || conditions.includes("limping")) {
    return {
      kind: "rescued",
      title: "Dragged to shelter",
      sceneTitle: "A Stranger's Firelight",
      sceneNarration:
        "Cade wakes beside low firelight in an unfamiliar shelter. Someone patched the worst of the damage, but the body still protests every movement and some gear is missing.",
      flag: { key: "setback_state", value: "rescued" },
      dropPreference: "consumable",
      addedConditions: ["treated", "recovering"],
      bodyState: "wounded",
      mindState: "stressed",
      region: character.region ?? "Unknown shelter",
      status: "alive",
    };
  }

  return {
    kind: "displaced",
    title: "Lost and scattered",
    sceneTitle: "Somewhere Off the Road",
    sceneNarration:
      "Cade wakes in a rough place off the road with only fragments of memory from the last bad turn. The immediate danger has passed, but orientation, footing, and trust are all in short supply.",
    flag: { key: "setback_state", value: "displaced" },
    dropPreference: "equipment",
    addedConditions: ["disoriented", "recovering"],
    bodyState: "strained",
    mindState: "shaken",
    region: character.region ?? "Unknown roadside",
    status: "alive",
  };
}

function shouldTriggerSetback(character: CharacterRecord) {
  const bodyState = normalizeTag(character.bodyState ?? "healthy");
  const mindState = normalizeTag(character.mindState ?? "clear");
  return CRITICAL_BODY_STATES.has(bodyState) || CRITICAL_MIND_STATES.has(mindState);
}

function shouldTriggerRecovery(character: CharacterRecord) {
  const conditions = (character.conditions ?? []).map(normalizeTag);
  return conditions.some((condition) => RECOVERY_CONDITION_TAGS.has(condition));
}

function applyRecovery(character: CharacterRecord): CharacterRecord {
  const normalizedConditions = (character.conditions ?? []).map(normalizeTag);
  const conditions = normalizedConditions.filter((condition) => !RECOVERY_CONDITION_TAGS.has(condition) && condition !== "recovering");

  const bodyState = character.bodyState && normalizeTag(character.bodyState) !== "healthy"
    ? normalizeTag(character.bodyState) === "critical"
      ? "wounded"
      : normalizeTag(character.bodyState) === "wounded"
        ? "strained"
        : "healthy"
    : character.bodyState ?? "healthy";

  const mindState = character.mindState && normalizeTag(character.mindState) !== "clear"
    ? normalizeTag(character.mindState) === "broken"
      ? "shaken"
      : normalizeTag(character.mindState) === "fractured"
        ? "stressed"
        : "clear"
    : character.mindState ?? "clear";

  return {
    ...character,
    bodyState,
    mindState,
    conditions: uniqueStrings([...conditions, "recovering"]),
    notes: uniqueStrings([...(character.notes ?? []), "Recovered slightly after rest or treatment."]),
  };
}

function chooseLostInventory(inventory: InventoryRecord[], preferredType: string) {
  const protectedTypes = new Set(["key", "quest"]);
  const candidates = inventory.filter((item) => !protectedTypes.has(normalizeTag(item.itemType)) && item.quantity > 0);
  const preferred = candidates.find((item) => normalizeTag(item.itemType) === normalizeTag(preferredType));
  return preferred ?? candidates[0] ?? null;
}

async function setFlag(runId: string, flagKey: string, flagValue: string) {
  const now = isoNow();
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_flags (run_id, flag_key, flag_value, updated_at) values (
            ${sqlString(runId)},
            ${sqlString(flagKey)},
            ${sqlString(flagValue)},
            ${sqlString(now)}
          )
          on conflict(run_id, flag_key) do update set
            flag_value = excluded.flag_value,
            updated_at = excluded.updated_at
        `,
      },
    },
  ]);
}

export async function persistDiscovery({
  runId,
  discoveryType,
  key,
  name,
  summary,
  details,
}: PersistDiscoveryInput) {
  await ensureSchema();
  const activeRunId = runId ?? DEFAULT_RUN_ID;
  const now = isoNow();
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_discoveries (
            id, run_id, discovery_type, discovery_key, name, summary, details, created_at
          ) values (
            ${sqlString(crypto.randomUUID())},
            ${sqlString(activeRunId)},
            ${sqlString(discoveryType)},
            ${sqlString(key)},
            ${sqlString(name)},
            ${sqlString(summary)},
            ${sqlNullableString(details ?? null)},
            ${sqlString(now)}
          )
          on conflict(run_id, discovery_type, discovery_key) do update set
            name = excluded.name,
            summary = excluded.summary,
            details = excluded.details
        `,
      },
    },
  ]);
}

export async function persistTeamMember({
  runId,
  personKey,
  name,
  role,
  summary,
  relationship,
  status,
  isCompanion,
  isActive,
  notes,
}: PersistTeamMemberInput) {
  await ensureSchema();
  const activeRunId = runId ?? DEFAULT_RUN_ID;
  const now = isoNow();
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_team_members (
            id, run_id, person_key, name, role, summary, relationship, status, is_companion, is_active, notes, updated_at
          ) values (
            ${sqlString(crypto.randomUUID())},
            ${sqlString(activeRunId)},
            ${sqlString(personKey)},
            ${sqlString(name)},
            ${sqlNullableString(role ?? null)},
            ${sqlString(summary)},
            ${sqlNullableString(relationship ?? null)},
            ${sqlString(status ?? "known")},
            ${sqlBoolean(isCompanion ?? false)},
            ${sqlBoolean(isActive ?? false)},
            ${sqlNullableString(notes ?? null)},
            ${sqlString(now)}
          )
          on conflict(run_id, person_key) do update set
            name = excluded.name,
            role = excluded.role,
            summary = excluded.summary,
            relationship = excluded.relationship,
            status = excluded.status,
            is_companion = excluded.is_companion,
            is_active = excluded.is_active,
            notes = excluded.notes,
            updated_at = excluded.updated_at
        `,
      },
    },
  ]);
}

async function removeInventoryQuantity(runId: string, itemId: string, quantityToRemove: number) {
  const now = isoNow();
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          update run_inventory
          set quantity = case when quantity - ${sqlNumber(quantityToRemove)} < 0 then 0 else quantity - ${sqlNumber(quantityToRemove)} end,
              updated_at = ${sqlString(now)}
          where run_id = ${sqlString(runId)} and item_id = ${sqlString(itemId)}
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `delete from run_inventory where run_id = ${sqlString(runId)} and item_id = ${sqlString(itemId)} and quantity <= 0`,
      },
    },
  ]);
}

async function applySetbackIfNeeded(runId: string, character: CharacterRecord) {
  if (!shouldTriggerSetback(character)) return null;

  const bootstrap = await getStoryBootstrap(runId);
  const setback = classifySetback(character);
  const lostItem = chooseLostInventory(bootstrap.inventory, setback.dropPreference);

  if (lostItem) {
    await removeInventoryQuantity(runId, lostItem.itemId, 1);
    await setFlag(runId, `lost_item_${normalizeTag(lostItem.slug)}`, setback.kind);
  }

  await setFlag(runId, setback.flag.key, setback.flag.value);

  const mergedConditions = uniqueStrings([
    ...(character.conditions ?? []),
    ...setback.addedConditions,
    lostItem ? `lost_${normalizeTag(lostItem.slug)}` : null,
  ]);

  const nextCharacter: CharacterRecord = {
    ...character,
    bodyState: setback.bodyState,
    mindState: setback.mindState,
    region: setback.region,
    status: setback.status,
    conditions: mergedConditions,
    notes: uniqueStrings([
      ...(character.notes ?? []),
      `Setback triggered: ${setback.kind}.`,
      lostItem ? `Lost item: ${lostItem.name}.` : null,
    ]),
  };

  await upsertCharacter({
    id: DEFAULT_CHARACTER_ID,
    name: nextCharacter.name,
    status: nextCharacter.status,
    kingdom: nextCharacter.kingdom,
    region: nextCharacter.region,
    formerAffiliation: nextCharacter.formerAffiliation,
    role: nextCharacter.role,
    yearsOfService: nextCharacter.yearsOfService,
    specializations: nextCharacter.specializations,
    bodyState: nextCharacter.bodyState,
    mindState: nextCharacter.mindState,
    conditions: nextCharacter.conditions,
    notes: nextCharacter.notes,
    updatedAt: isoNow(),
  });

  await upsertScene({
    id: crypto.randomUUID(),
    sceneKey: `setback-${setback.kind}-${Date.now()}`,
    title: setback.sceneTitle,
    narration: setback.sceneNarration,
    suggestedChoices: [
      "Get your bearings and assess what was lost",
      "Search the area for a way back into control",
      "Lie low, recover, and plan the next move",
    ],
    actionDraft: "",
    updatedAt: isoNow(),
    runId,
  });

  await appendEvent({
    runId,
    id: crypto.randomUUID(),
    eventKey: `setback-${runId}-${Date.now()}`,
    title: setback.title,
    summary: lostItem
      ? `${setback.sceneNarration} Cade lost ${lostItem.name} in the process.`
      : setback.sceneNarration,
    action: "Setback resolution",
    createdAt: isoNow(),
  });

  return setback;
}

export async function ensureSchema() {
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists campaigns (
            id text primary key,
            slug text not null unique,
            name text not null,
            summary text not null,
            tone text,
            technology_level text,
            major_powers_json text not null,
            regions_json text not null,
            locations_json text not null,
            notes_json text not null,
            created_at text not null,
            updated_at text not null
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists characters (
            id text primary key,
            campaign_id text not null,
            slug text not null unique,
            name text not null,
            status text not null,
            kingdom text,
            region text,
            former_affiliation text,
            role text,
            years_of_service integer,
            specializations_json text not null,
            notes_json text not null,
            created_at text not null,
            updated_at text not null
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists runs (
            id text primary key,
            campaign_id text not null,
            character_id text not null,
            slug text not null unique,
            name text not null,
            status text not null,
            created_at text not null,
            updated_at text not null
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists run_state (
            run_id text primary key,
            current_scene_id text,
            current_scene_key text,
            current_scene_title text,
            current_scene_narration text,
            current_scene_choices_json text not null,
            current_scene_action_draft text,
            hp_current integer,
            hp_max integer,
            body_state text,
            mind_state text,
            status text,
            region text,
            role text,
            conditions_json text not null,
            notes_json text not null,
            updated_at text not null
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists run_turns (
            id text primary key,
            run_id text not null,
            turn_index integer not null,
            action text not null,
            scene_title text not null,
            narration text not null,
            suggested_choices_json text not null,
            character_patch_json text,
            world_patch_json text,
            created_at text not null,
            unique(run_id, turn_index)
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists run_events (
            id text primary key,
            run_id text not null,
            event_key text not null unique,
            title text not null,
            summary text not null,
            action text,
            created_at text not null
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists items (
            id text primary key,
            campaign_id text not null,
            slug text not null unique,
            name text not null,
            item_type text not null,
            description text,
            stackable integer not null default 0,
            metadata_json text not null,
            created_at text not null,
            updated_at text not null
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists run_inventory (
            run_id text not null,
            item_id text not null,
            quantity integer not null,
            equipped_slot text,
            metadata_json text not null,
            updated_at text not null,
            primary key (run_id, item_id)
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists run_flags (
            run_id text not null,
            flag_key text not null,
            flag_value text not null,
            updated_at text not null,
            primary key (run_id, flag_key)
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists run_discoveries (
            id text primary key,
            run_id text not null,
            discovery_type text not null,
            discovery_key text not null,
            name text not null,
            summary text not null,
            details text,
            created_at text not null,
            unique(run_id, discovery_type, discovery_key)
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists run_team_members (
            id text primary key,
            run_id text not null,
            person_key text not null,
            name text not null,
            role text,
            summary text not null,
            relationship text,
            status text not null,
            is_companion integer not null,
            is_active integer not null,
            notes text,
            updated_at text not null,
            unique(run_id, person_key)
          )
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          create table if not exists authored_scenes (
            id text primary key,
            campaign_id text not null,
            scene_key text not null unique,
            title text not null,
            summary text not null,
            body text not null,
            suggested_choices_json text not null,
            created_at text not null,
            updated_at text not null
          )
        `,
      },
    },
  ]);
}

async function tableExists(tableName: string) {
  const payload = await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `select name from sqlite_master where type = 'table' and name = ${sqlString(tableName)} limit 1`,
      },
    },
  ]);

  return rows(payload, 0).length > 0;
}

async function hasLegacyData() {
  const legacyTables = ["story_world", "story_character", "story_scene", "story_events"];
  for (const table of legacyTables) {
    if (!(await tableExists(table))) continue;
    const payload = await tursoPipeline([
      { type: "execute", stmt: { sql: `select count(*) from ${table}` } },
    ]);
    const count = Number(rowValue(rows(payload, 0)[0], 0) ?? 0);
    if (count > 0) return true;
  }
  return false;
}

async function hasCanonicalData() {
  const payload = await tursoPipeline([
    { type: "execute", stmt: { sql: "select count(*) from campaigns" } },
    { type: "execute", stmt: { sql: "select count(*) from characters" } },
    { type: "execute", stmt: { sql: "select count(*) from runs" } },
  ]);

  const campaigns = Number(rowValue(rows(payload, 0)[0], 0) ?? 0);
  const characters = Number(rowValue(rows(payload, 1)[0], 0) ?? 0);
  const runs = Number(rowValue(rows(payload, 2)[0], 0) ?? 0);
  return campaigns > 0 && characters > 0 && runs > 0;
}

async function migrateLegacyDataIfNeeded() {
  await ensureSchema();

  if (await hasCanonicalData()) return;
  if (!(await hasLegacyData())) return;

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
        sql: `select id, title, summary, action, created_at from story_events order by created_at asc`,
      },
    },
  ]);

  const worldRow = rows(payload, 0)[0];
  const characterRow = rows(payload, 1)[0];
  const sceneRow = rows(payload, 2)[0];
  const eventRows = rows(payload, 3);
  const migratedAt = isoNow();

  await seedCanonicalDefaults({
    world: worldRow
      ? {
          name: rowValue(worldRow, 1) ?? "Veyr",
          tone: rowValue(worldRow, 2),
          technologyLevel: rowValue(worldRow, 3),
          summary: rowValue(worldRow, 4) ?? "A dangerous frontier waits.",
          majorPowers: parseJsonArray(rowValue(worldRow, 5)),
          regions: parseJsonArray(rowValue(worldRow, 6)),
          locations: parseJsonArray(rowValue(worldRow, 7)),
          notes: [],
        }
      : undefined,
    character: characterRow
      ? {
          name: rowValue(characterRow, 1) ?? "Cade",
          status: rowValue(characterRow, 2) ?? "alive",
          kingdom: rowValue(characterRow, 3),
          region: rowValue(characterRow, 4),
          formerAffiliation: rowValue(characterRow, 5),
          role: rowValue(characterRow, 6),
          yearsOfService: rowValue(characterRow, 7) ? Number(rowValue(characterRow, 7)) : null,
          specializations: parseJsonArray(rowValue(characterRow, 8)),
          bodyState: "healthy",
          mindState: "clear",
          conditions: [],
          notes: [],
        }
      : undefined,
    scene: sceneRow
      ? {
          id: rowValue(sceneRow, 0) ?? crypto.randomUUID(),
          sceneKey: "legacy-current",
          title: rowValue(sceneRow, 1) ?? "Current Scene",
          narration: rowValue(sceneRow, 2) ?? "",
          suggestedChoices: parseJsonArray(rowValue(sceneRow, 3)),
          actionDraft: rowValue(sceneRow, 4) ?? "",
          updatedAt: rowValue(sceneRow, 5) ?? migratedAt,
        }
      : undefined,
    events: eventRows.map((row) => ({
      id: rowValue(row, 0) ?? crypto.randomUUID(),
      title: rowValue(row, 1) ?? "Untitled event",
      summary: rowValue(row, 2) ?? "",
      action: rowValue(row, 3) ?? undefined,
      createdAt: rowValue(row, 4) ?? migratedAt,
    })),
  });
}

type SeedOptions = {
  world?: Partial<WorldRecord>;
  character?: Partial<CharacterRecord>;
  scene?: Partial<SceneRecord>;
  events?: EventRecord[];
};

async function seedCanonicalDefaults(options: SeedOptions = {}) {
  const now = isoNow();
  const world: WorldRecord = {
    id: DEFAULT_WORLD_ID,
    name: options.world?.name ?? "Veyr",
    tone: options.world?.tone ?? "Dark political fantasy",
    technologyLevel: options.world?.technologyLevel ?? "Advanced medieval / early renaissance without firearms",
    summary:
      options.world?.summary ??
      "Veyr is a hard land of rival powers, border intrigue, and quiet violence. Cade operates in the Grey Marches, where decaying loyalties, reconnaissance work, and hidden threats shape every decision. Bound to Cade's dominant shooting arm is an ancient shadow brace that grants dangerous shadow-based abilities at escalating physical cost.",
    majorPowers: options.world?.majorPowers ?? ["Avaren", "Velkan Marches", "The Free Coast"],
    regions: options.world?.regions ?? ["The Grey Marches"],
    locations: options.world?.locations ?? ["The Deep Woods", "Whispering Pass", "Oakhaven"],
    notes: options.world?.notes ?? [],
  };

  const character: CharacterRecord = {
    id: DEFAULT_CHARACTER_ID,
    name: options.character?.name ?? "Cade",
    status: options.character?.status ?? "alive",
    kingdom: options.character?.kingdom ?? "Avaren",
    region: options.character?.region ?? "Whispering Pass Approach",
    formerAffiliation: options.character?.formerAffiliation ?? "Black Veil Corps",
    role: options.character?.role ?? "Frontier reconnaissance operative",
    yearsOfService: options.character?.yearsOfService ?? 11,
    specializations:
      options.character?.specializations ??
      [
        "Stealth",
        "Reconnaissance",
        "Crossbow marksmanship",
        "Tactical planning",
        "Survival",
        "Infiltration",
        "Assassination",
        "Frontier operations",
        "Shadow magic",
        "Shadow brace channeling",
      ],
    bodyState: options.character?.bodyState ?? "healthy",
    mindState: options.character?.mindState ?? "clear",
    conditions: options.character?.conditions ?? [],
    notes: options.character?.notes ?? [],
  };

  const scene: SceneRecord = {
    id: options.scene?.id ?? crypto.randomUUID(),
    sceneKey: options.scene?.sceneKey ?? "start",
    title: options.scene?.title ?? "Approach to Whispering Pass",
    narration:
      options.scene?.narration ??
      "Dawn has not yet broken, and Cade is already moving through the last stretch of dense woodland toward Whispering Pass. Beyond that narrow, dangerous route lies Oakhaven, the frontier town he means to reach next. His bow, dagger, sword, and ancient shadow brace are close at hand as the wind threads through the trees and the pass ahead lives up to its name.",
    suggestedChoices:
      options.scene?.suggestedChoices ??
      [
        "Advance toward the mouth of Whispering Pass with caution",
        "Survey the approach for tracks, ambush points, or recent travelers",
        "Pause under cover and plan the safest route to Oakhaven",
      ],
    actionDraft: options.scene?.actionDraft ?? "",
    updatedAt: options.scene?.updatedAt ?? now,
  };

  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into campaigns (
            id, slug, name, summary, tone, technology_level, major_powers_json, regions_json, locations_json, notes_json, created_at, updated_at
          ) values (
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("veyr")},
            ${sqlString(world.name)},
            ${sqlString(world.summary)},
            ${sqlNullableString(world.tone)},
            ${sqlNullableString(world.technologyLevel)},
            ${sqlJson(world.majorPowers)},
            ${sqlJson(world.regions)},
            ${sqlJson(world.locations)},
            ${sqlJson(world.notes ?? [])},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            summary = excluded.summary,
            tone = excluded.tone,
            technology_level = excluded.technology_level,
            major_powers_json = excluded.major_powers_json,
            regions_json = excluded.regions_json,
            locations_json = excluded.locations_json,
            notes_json = excluded.notes_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into characters (
            id, campaign_id, slug, name, status, kingdom, region, former_affiliation, role, years_of_service, specializations_json, notes_json, created_at, updated_at
          ) values (
            ${sqlString(DEFAULT_CHARACTER_ID)},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("cade")},
            ${sqlString(character.name)},
            ${sqlString(character.status)},
            ${sqlNullableString(character.kingdom)},
            ${sqlNullableString(character.region)},
            ${sqlNullableString(character.formerAffiliation)},
            ${sqlNullableString(character.role)},
            ${sqlNumber(character.yearsOfService)},
            ${sqlJson(character.specializations)},
            ${sqlJson(character.notes ?? [])},
            ${sqlString(now)},
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
            notes_json = excluded.notes_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into runs (
            id, campaign_id, character_id, slug, name, status, created_at, updated_at
          ) values (
            ${sqlString(DEFAULT_RUN_ID)},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString(DEFAULT_CHARACTER_ID)},
            ${sqlString(DEFAULT_RUN_SLUG)},
            ${sqlString("Cade - Main Run")},
            ${sqlString("active")},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            campaign_id = excluded.campaign_id,
            character_id = excluded.character_id,
            slug = excluded.slug,
            name = excluded.name,
            status = excluded.status,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_state (
            run_id, current_scene_id, current_scene_key, current_scene_title, current_scene_narration, current_scene_choices_json, current_scene_action_draft, hp_current, hp_max, body_state, mind_state, status, region, role, conditions_json, notes_json, updated_at
          ) values (
            ${sqlString(DEFAULT_RUN_ID)},
            ${sqlString(scene.id)},
            ${sqlString(scene.sceneKey ?? "start")},
            ${sqlString(scene.title)},
            ${sqlString(scene.narration)},
            ${sqlJson(scene.suggestedChoices)},
            ${sqlString(scene.actionDraft ?? "")},
            100,
            100,
            ${sqlString(character.bodyState ?? "healthy")},
            ${sqlString(character.mindState ?? "clear")},
            ${sqlString(character.status)},
            ${sqlNullableString(character.region)},
            ${sqlNullableString(character.role)},
            ${sqlJson(character.conditions ?? [])},
            ${sqlJson(character.notes ?? [])},
            ${sqlString(scene.updatedAt)}
          )
          on conflict(run_id) do update set
            current_scene_id = excluded.current_scene_id,
            current_scene_key = excluded.current_scene_key,
            current_scene_title = excluded.current_scene_title,
            current_scene_narration = excluded.current_scene_narration,
            current_scene_choices_json = excluded.current_scene_choices_json,
            current_scene_action_draft = excluded.current_scene_action_draft,
            hp_current = excluded.hp_current,
            hp_max = excluded.hp_max,
            body_state = excluded.body_state,
            mind_state = excluded.mind_state,
            status = excluded.status,
            region = excluded.region,
            role = excluded.role,
            conditions_json = excluded.conditions_json,
            notes_json = excluded.notes_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into authored_scenes (
            id, campaign_id, scene_key, title, summary, body, suggested_choices_json, created_at, updated_at
          ) values (
            ${sqlString(scene.id)},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString(scene.sceneKey ?? "start")},
            ${sqlString(scene.title)},
            ${sqlString(scene.title)},
            ${sqlString(scene.narration)},
            ${sqlJson(scene.suggestedChoices)},
            ${sqlString(now)},
            ${sqlString(scene.updatedAt)}
          )
          on conflict(scene_key) do update set
            title = excluded.title,
            summary = excluded.summary,
            body = excluded.body,
            suggested_choices_json = excluded.suggested_choices_json,
            updated_at = excluded.updated_at
        `,
      },
    },
  ]);

  const seedEvents =
    options.events && options.events.length
      ? options.events
      : [
          {
            id: crypto.randomUUID(),
            title: "Story reset",
            summary: "The test story state was reset to a clean starting point.",
            action: "Reset story",
            createdAt: now,
          },
        ];

  for (const event of seedEvents) {
    await appendEvent({
      runId: DEFAULT_RUN_ID,
      id: event.id,
      eventKey: `${DEFAULT_RUN_ID}-${event.createdAt}-${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: event.title,
      summary: event.summary,
      action: event.action,
      createdAt: event.createdAt,
    });
  }

  await ensureDefaultInventoryAndFlags(DEFAULT_RUN_ID);
  await persistDiscovery({
    runId: DEFAULT_RUN_ID,
    discoveryType: "location:town",
    key: "oakhaven",
    name: "Oakhaven",
    summary: "A frontier town beyond Whispering Pass and Cade's immediate destination.",
    details: "A likely settlement, supply point, and source of leads once Cade gets through the pass.",
  });
  await persistDiscovery({
    runId: DEFAULT_RUN_ID,
    discoveryType: "route:pass",
    key: "whispering_pass",
    name: "Whispering Pass",
    summary: "A narrow, dangerous pass Cade must cross to reach Oakhaven.",
    details: "Known for strange windborne whispers, tight ground, and obvious ambush risk.",
  });
}

async function ensureDefaultInventoryAndFlags(runId: string) {
  const now = isoNow();
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into items (
            id, campaign_id, slug, name, item_type, description, stackable, metadata_json, created_at, updated_at
          ) values (
            ${sqlString("item-worn-cloak")},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("worn-cloak")},
            ${sqlString("Worn Cloak")},
            ${sqlString("equipment")},
            ${sqlString("A weathered traveler cloak suited for frontier scouting.")},
            0,
            ${sqlJson({ starter: true, protected: false })},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            item_type = excluded.item_type,
            description = excluded.description,
            stackable = excluded.stackable,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into items (
            id, campaign_id, slug, name, item_type, description, stackable, metadata_json, created_at, updated_at
          ) values (
            ${sqlString("item-signet-ring")},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("signet-ring")},
            ${sqlString("Avaren Signet Ring")},
            ${sqlString("key")},
            ${sqlString("A personal seal Cade would never willingly abandon.")},
            0,
            ${sqlJson({ starter: true, protected: true })},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            item_type = excluded.item_type,
            description = excluded.description,
            stackable = excluded.stackable,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into items (
            id, campaign_id, slug, name, item_type, description, stackable, metadata_json, created_at, updated_at
          ) values (
            ${sqlString("item-travel-rations")},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("travel-rations")},
            ${sqlString("Travel Rations")},
            ${sqlString("consumable")},
            ${sqlString("A few preserved meals for the road.")},
            1,
            ${sqlJson({ starter: true, protected: false })},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            item_type = excluded.item_type,
            description = excluded.description,
            stackable = excluded.stackable,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into items (
            id, campaign_id, slug, name, item_type, description, stackable, metadata_json, created_at, updated_at
          ) values (
            ${sqlString("item-shadow-brace")},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("shadow-brace")},
            ${sqlString("Ancient Shadow Brace")},
            ${sqlString("key")},
            ${sqlString("An ancient magical harness bound to Cade's shooting arm that channels dangerous shadow magic at escalating physical cost.")},
            0,
            ${sqlJson({
              starter: true,
              protected: true,
              magical: true,
              grants: ["shadow_magic"],
              abilities: [
                {
                  key: "veil_step",
                  name: "Veil Step",
                  description: "Slip a short distance through deep shadow to reposition or escape notice.",
                  cost: "Body strain through the brace and lingering pain in the shooting arm.",
                  downside: "Repeated use can push Cade from strained to wounded and leave the arm shaking.",
                  tags: ["shadow", "mobility", "stealth"],
                },
                {
                  key: "umbral_sight",
                  name: "Umbral Sight",
                  description: "Read movement, traces, and unnatural disturbance in darkness.",
                  cost: "Mental strain, disorientation, and a sense of cold pressure behind the eyes.",
                  downside: "Overuse can shift Cade from clear to stressed or shaken.",
                  tags: ["shadow", "awareness", "perception"],
                },
                {
                  key: "shadow_snare",
                  name: "Shadow Snare",
                  description: "Bind, slow, or hinder a target with a lash of living shadow.",
                  cost: "Pain spikes through the brace and loss of fine control in the arm.",
                  downside: "Can trigger backlash conditions like arrow_arm_pain, bleeding, or exhaustion if forced.",
                  tags: ["shadow", "control", "combat"],
                },
              ],
            })},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            item_type = excluded.item_type,
            description = excluded.description,
            stackable = excluded.stackable,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into items (
            id, campaign_id, slug, name, item_type, description, stackable, metadata_json, created_at, updated_at
          ) values (
            ${sqlString("item-hunting-bow")},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("hunting-bow")},
            ${sqlString("Hunting Bow")},
            ${sqlString("weapon")},
            ${sqlString("A sturdy bow suited for scouting, silent kills, and careful shots at range.")},
            0,
            ${sqlJson({ starter: true, protected: false, weaponStyle: "ranged", usesAmmo: "arrows" })},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            item_type = excluded.item_type,
            description = excluded.description,
            stackable = excluded.stackable,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into items (
            id, campaign_id, slug, name, item_type, description, stackable, metadata_json, created_at, updated_at
          ) values (
            ${sqlString("item-arrows")},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("arrows")},
            ${sqlString("Arrows")},
            ${sqlString("ammo")},
            ${sqlString("A bundled quiver of arrows for Cade's bow.")},
            1,
            ${sqlJson({ starter: true, protected: false, ammoFor: "hunting-bow" })},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            item_type = excluded.item_type,
            description = excluded.description,
            stackable = excluded.stackable,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into items (
            id, campaign_id, slug, name, item_type, description, stackable, metadata_json, created_at, updated_at
          ) values (
            ${sqlString("item-quiet-dagger")},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("quiet-dagger")},
            ${sqlString("Quiet Dagger")},
            ${sqlString("weapon")},
            ${sqlString("A balanced dagger Cade can draw quickly for stealth work and close fighting.")},
            0,
            ${sqlJson({ starter: true, protected: false, weaponStyle: "light_melee", tags: ["stealth", "backup"] })},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            item_type = excluded.item_type,
            description = excluded.description,
            stackable = excluded.stackable,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into items (
            id, campaign_id, slug, name, item_type, description, stackable, metadata_json, created_at, updated_at
          ) values (
            ${sqlString("item-travel-sword")},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("travel-sword")},
            ${sqlString("Travel Sword")},
            ${sqlString("weapon")},
            ${sqlString("A practical sword for open combat when subtlety fails.")},
            0,
            ${sqlJson({ starter: true, protected: false, weaponStyle: "melee", tags: ["combat", "sidearm"] })},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            item_type = excluded.item_type,
            description = excluded.description,
            stackable = excluded.stackable,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into items (
            id, campaign_id, slug, name, item_type, description, stackable, metadata_json, created_at, updated_at
          ) values (
            ${sqlString("item-silver-coins")},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("silver-coins")},
            ${sqlString("Silver Coins")},
            ${sqlString("currency")},
            ${sqlString("A purse of silver coin used for food, lodging, supplies, favors, and the ordinary costs of staying alive on the road.")},
            1,
            ${sqlJson({ starter: true, protected: false, currency: true, denomination: "silver" })},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            item_type = excluded.item_type,
            description = excluded.description,
            stackable = excluded.stackable,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_inventory (
            run_id, item_id, quantity, equipped_slot, metadata_json, updated_at
          ) values (
            ${sqlString(runId)},
            ${sqlString("item-worn-cloak")},
            1,
            ${sqlString("body")},
            ${sqlJson({ starter: true })},
            ${sqlString(now)}
          )
          on conflict(run_id, item_id) do update set
            quantity = excluded.quantity,
            equipped_slot = excluded.equipped_slot,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_inventory (
            run_id, item_id, quantity, equipped_slot, metadata_json, updated_at
          ) values (
            ${sqlString(runId)},
            ${sqlString("item-shadow-brace")},
            1,
            ${sqlString("arm")},
            ${sqlJson({ starter: true, protected: true, magical: true })},
            ${sqlString(now)}
          )
          on conflict(run_id, item_id) do update set
            quantity = excluded.quantity,
            equipped_slot = excluded.equipped_slot,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_inventory (
            run_id, item_id, quantity, equipped_slot, metadata_json, updated_at
          ) values (
            ${sqlString(runId)},
            ${sqlString("item-signet-ring")},
            1,
            ${sqlString("hand")},
            ${sqlJson({ starter: true, protected: true })},
            ${sqlString(now)}
          )
          on conflict(run_id, item_id) do update set
            quantity = excluded.quantity,
            equipped_slot = excluded.equipped_slot,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_inventory (
            run_id, item_id, quantity, equipped_slot, metadata_json, updated_at
          ) values (
            ${sqlString(runId)},
            ${sqlString("item-travel-rations")},
            3,
            null,
            ${sqlJson({ starter: true })},
            ${sqlString(now)}
          )
          on conflict(run_id, item_id) do update set
            quantity = excluded.quantity,
            equipped_slot = excluded.equipped_slot,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_inventory (
            run_id, item_id, quantity, equipped_slot, metadata_json, updated_at
          ) values (
            ${sqlString(runId)},
            ${sqlString("item-hunting-bow")},
            1,
            ${sqlString("hands")},
            ${sqlJson({ starter: true, preferred: true, combatRole: "ranged_primary" })},
            ${sqlString(now)}
          )
          on conflict(run_id, item_id) do update set
            quantity = excluded.quantity,
            equipped_slot = excluded.equipped_slot,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_inventory (
            run_id, item_id, quantity, equipped_slot, metadata_json, updated_at
          ) values (
            ${sqlString(runId)},
            ${sqlString("item-arrows")},
            20,
            ${sqlString("quiver")},
            ${sqlJson({ starter: true, combatRole: "ammo" })},
            ${sqlString(now)}
          )
          on conflict(run_id, item_id) do update set
            quantity = excluded.quantity,
            equipped_slot = excluded.equipped_slot,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_inventory (
            run_id, item_id, quantity, equipped_slot, metadata_json, updated_at
          ) values (
            ${sqlString(runId)},
            ${sqlString("item-quiet-dagger")},
            1,
            ${sqlString("belt")},
            ${sqlJson({ starter: true, combatRole: "stealth_sidearm" })},
            ${sqlString(now)}
          )
          on conflict(run_id, item_id) do update set
            quantity = excluded.quantity,
            equipped_slot = excluded.equipped_slot,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_inventory (
            run_id, item_id, quantity, equipped_slot, metadata_json, updated_at
          ) values (
            ${sqlString(runId)},
            ${sqlString("item-travel-sword")},
            1,
            ${sqlString("hip")},
            ${sqlJson({ starter: true, combatRole: "melee_sidearm" })},
            ${sqlString(now)}
          )
          on conflict(run_id, item_id) do update set
            quantity = excluded.quantity,
            equipped_slot = excluded.equipped_slot,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_inventory (
            run_id, item_id, quantity, equipped_slot, metadata_json, updated_at
          ) values (
            ${sqlString(runId)},
            ${sqlString("item-silver-coins")},
            24,
            ${sqlString("pouch")},
            ${sqlJson({ starter: true, spendable: true })},
            ${sqlString(now)}
          )
          on conflict(run_id, item_id) do update set
            quantity = excluded.quantity,
            equipped_slot = excluded.equipped_slot,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_flags (run_id, flag_key, flag_value, updated_at) values (
            ${sqlString(runId)},
            ${sqlString("starting_region")},
            ${sqlString("Whispering Pass Approach")},
            ${sqlString(now)}
          )
          on conflict(run_id, flag_key) do update set
            flag_value = excluded.flag_value,
            updated_at = excluded.updated_at
        `,
      },
    },
  ]);
}

export async function seedStoryDataIfMissing() {
  await ensureSchema();
  await migrateLegacyDataIfNeeded();
  if (await hasCanonicalData()) return;
  await seedCanonicalDefaults();
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
  id?: string;
  name: string;
  tone?: string | null;
  technologyLevel?: string | null;
  summary: string;
  majorPowers: string[];
  regions: string[];
  locations: string[];
  updatedAt?: string;
}) {
  await seedStoryDataIfMissing();
  const now = updatedAt ?? isoNow();
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into campaigns (
            id, slug, name, summary, tone, technology_level, major_powers_json, regions_json, locations_json, notes_json, created_at, updated_at
          ) values (
            ${sqlString(id ?? DEFAULT_CAMPAIGN_ID)},
            ${sqlString("veyr")},
            ${sqlString(name)},
            ${sqlString(summary)},
            ${sqlNullableString(tone)},
            ${sqlNullableString(technologyLevel)},
            ${sqlJson(majorPowers)},
            ${sqlJson(regions)},
            ${sqlJson(locations)},
            ${sqlJson([])},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(id) do update set
            name = excluded.name,
            summary = excluded.summary,
            tone = excluded.tone,
            technology_level = excluded.technology_level,
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
  bodyState,
  mindState,
  conditions,
  notes,
}: {
  id?: string;
  name: string;
  status: string;
  kingdom?: string | null;
  region?: string | null;
  formerAffiliation?: string | null;
  role?: string | null;
  yearsOfService?: number | null;
  specializations: string[];
  updatedAt?: string;
  bodyState?: string | null;
  mindState?: string | null;
  conditions?: string[];
  notes?: string[];
}) {
  await seedStoryDataIfMissing();
  const now = updatedAt ?? isoNow();
  const characterId = id ?? DEFAULT_CHARACTER_ID;

  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into characters (
            id, campaign_id, slug, name, status, kingdom, region, former_affiliation, role, years_of_service, specializations_json, notes_json, created_at, updated_at
          ) values (
            ${sqlString(characterId)},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString("cade")},
            ${sqlString(name)},
            ${sqlString(status)},
            ${sqlNullableString(kingdom)},
            ${sqlNullableString(region)},
            ${sqlNullableString(formerAffiliation)},
            ${sqlNullableString(role)},
            ${sqlNumber(yearsOfService)},
            ${sqlJson(specializations)},
            ${sqlJson(notes ?? [])},
            ${sqlString(now)},
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
            notes_json = excluded.notes_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          update run_state
          set
            body_state = coalesce(${sqlNullableString(bodyState)}, body_state),
            mind_state = coalesce(${sqlNullableString(mindState)}, mind_state),
            status = ${sqlString(status)},
            region = ${sqlNullableString(region)},
            role = ${sqlNullableString(role)},
            conditions_json = ${sqlJson(conditions ?? [])},
            notes_json = ${sqlJson(notes ?? [])},
            updated_at = ${sqlString(now)}
          where run_id = ${sqlString(DEFAULT_RUN_ID)}
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `update runs set character_id = ${sqlString(characterId)}, updated_at = ${sqlString(now)} where id = ${sqlString(DEFAULT_RUN_ID)}`,
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
  runId,
}: {
  id: string;
  sceneKey?: string;
  title: string;
  narration: string;
  suggestedChoices: string[];
  actionDraft?: string | null;
  updatedAt?: string;
  runId?: string;
}) {
  await seedStoryDataIfMissing();
  const now = updatedAt ?? isoNow();
  const activeRunId = runId ?? DEFAULT_RUN_ID;

  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into authored_scenes (
            id, campaign_id, scene_key, title, summary, body, suggested_choices_json, created_at, updated_at
          ) values (
            ${sqlString(id)},
            ${sqlString(DEFAULT_CAMPAIGN_ID)},
            ${sqlString(sceneKey ?? id)},
            ${sqlString(title)},
            ${sqlString(title)},
            ${sqlString(narration)},
            ${sqlJson(suggestedChoices)},
            ${sqlString(now)},
            ${sqlString(now)}
          )
          on conflict(scene_key) do update set
            title = excluded.title,
            summary = excluded.summary,
            body = excluded.body,
            suggested_choices_json = excluded.suggested_choices_json,
            updated_at = excluded.updated_at
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `
          update run_state
          set
            current_scene_id = ${sqlString(id)},
            current_scene_key = ${sqlString(sceneKey ?? id)},
            current_scene_title = ${sqlString(title)},
            current_scene_narration = ${sqlString(narration)},
            current_scene_choices_json = ${sqlJson(suggestedChoices)},
            current_scene_action_draft = ${sqlString(actionDraft ?? "")},
            updated_at = ${sqlString(now)}
          where run_id = ${sqlString(activeRunId)}
        `,
      },
    },
    {
      type: "execute",
      stmt: {
        sql: `update runs set updated_at = ${sqlString(now)} where id = ${sqlString(activeRunId)}`,
      },
    },
  ]);
}

export async function appendEvent({
  runId,
  id,
  eventKey,
  title,
  summary,
  action,
  createdAt,
}: {
  runId?: string;
  id: string;
  eventKey: string;
  title: string;
  summary: string;
  action?: string | null;
  createdAt?: string;
}) {
  await seedStoryDataIfMissing();
  const now = createdAt ?? isoNow();
  const activeRunId = runId ?? DEFAULT_RUN_ID;
  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_events (
            id, run_id, event_key, title, summary, action, created_at
          ) values (
            ${sqlString(id)},
            ${sqlString(activeRunId)},
            ${sqlString(eventKey)},
            ${sqlString(title)},
            ${sqlString(summary)},
            ${sqlNullableString(action ?? null)},
            ${sqlString(now)}
          )
          on conflict(event_key) do nothing
        `,
      },
    },
  ]);
}

async function getRunState(runId = DEFAULT_RUN_ID) {
  await seedStoryDataIfMissing();
  const payload = await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          select
            r.id, r.campaign_id, r.slug, r.name, r.status, r.created_at, r.updated_at,
            c.id, c.name, c.status, c.kingdom, c.region, c.former_affiliation, c.role, c.years_of_service, c.specializations_json, c.notes_json,
            camp.id, camp.name, camp.tone, camp.technology_level, camp.summary, camp.major_powers_json, camp.regions_json, camp.locations_json, camp.notes_json,
            rs.current_scene_id, rs.current_scene_key, rs.current_scene_title, rs.current_scene_narration, rs.current_scene_choices_json, rs.current_scene_action_draft,
            rs.hp_current, rs.hp_max, rs.body_state, rs.mind_state, rs.status, rs.region, rs.role, rs.conditions_json, rs.notes_json, rs.updated_at
          from runs r
          join characters c on c.id = r.character_id
          join campaigns camp on camp.id = r.campaign_id
          left join run_state rs on rs.run_id = r.id
          where r.id = ${sqlString(runId)}
          limit 1
        `,
      },
    },
  ]);

  return rows(payload, 0)[0];
}

async function getNextTurnIndex(runId = DEFAULT_RUN_ID) {
  const payload = await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `select coalesce(max(turn_index), 0) + 1 from run_turns where run_id = ${sqlString(runId)}`,
      },
    },
  ]);
  return Number(rowValue(rows(payload, 0)[0], 0) ?? 1);
}

export async function persistTurn(input: PersistTurnInput) {
  await seedStoryDataIfMissing();
  const runId = input.runId ?? DEFAULT_RUN_ID;
  const now = isoNow();
  const bootstrap = await getStoryBootstrap(runId);
  const turnIndex = await getNextTurnIndex(runId);

  let nextCharacter: CharacterRecord = {
    ...bootstrap.character,
    ...(input.characterPatch ?? {}),
    notes: input.characterPatch?.notes ?? bootstrap.character.notes ?? [],
    bodyState: input.characterPatch?.bodyState ?? bootstrap.character.bodyState ?? "healthy",
    mindState: input.characterPatch?.mindState ?? bootstrap.character.mindState ?? "clear",
    conditions: input.characterPatch?.conditions ?? bootstrap.character.conditions ?? [],
  };

  if (shouldTriggerRecovery(nextCharacter)) {
    nextCharacter = applyRecovery(nextCharacter);
  }

  const nextWorld: WorldRecord = {
    ...bootstrap.world,
    ...(input.worldPatch ?? {}),
    majorPowers: input.worldPatch?.majorPowers ?? bootstrap.world.majorPowers,
    regions: input.worldPatch?.regions ?? bootstrap.world.regions,
    locations: input.worldPatch?.locations ?? bootstrap.world.locations,
    notes: input.worldPatch?.notes ?? bootstrap.world.notes ?? [],
  };

  await upsertWorld({
    id: DEFAULT_WORLD_ID,
    name: nextWorld.name,
    tone: nextWorld.tone,
    technologyLevel: nextWorld.technologyLevel,
    summary: nextWorld.summary,
    majorPowers: nextWorld.majorPowers,
    regions: nextWorld.regions,
    locations: nextWorld.locations,
    updatedAt: now,
  });

  await upsertCharacter({
    id: DEFAULT_CHARACTER_ID,
    name: nextCharacter.name,
    status: nextCharacter.status,
    kingdom: nextCharacter.kingdom,
    region: nextCharacter.region,
    formerAffiliation: nextCharacter.formerAffiliation,
    role: nextCharacter.role,
    yearsOfService: nextCharacter.yearsOfService,
    specializations: nextCharacter.specializations,
    bodyState: nextCharacter.bodyState,
    mindState: nextCharacter.mindState,
    conditions: nextCharacter.conditions,
    notes: nextCharacter.notes,
    updatedAt: now,
  });

  await upsertScene({
    id: crypto.randomUUID(),
    sceneKey: `turn-${turnIndex}`,
    title: input.sceneTitle,
    narration: input.narration,
    suggestedChoices: input.suggestedChoices,
    actionDraft: "",
    updatedAt: now,
    runId,
  });

  await tursoPipeline([
    {
      type: "execute",
      stmt: {
        sql: `
          insert into run_turns (
            id, run_id, turn_index, action, scene_title, narration, suggested_choices_json, character_patch_json, world_patch_json, created_at
          ) values (
            ${sqlString(crypto.randomUUID())},
            ${sqlString(runId)},
            ${sqlNumber(turnIndex)},
            ${sqlString(input.action)},
            ${sqlString(input.sceneTitle)},
            ${sqlString(input.narration)},
            ${sqlJson(input.suggestedChoices)},
            ${sqlNullableString(input.characterPatch ? JSON.stringify(input.characterPatch) : null)},
            ${sqlNullableString(input.worldPatch ? JSON.stringify(input.worldPatch) : null)},
            ${sqlString(now)}
          )
        `,
      },
    },
  ]);

  await appendEvent({
    runId,
    id: crypto.randomUUID(),
    eventKey: `turn-${runId}-${turnIndex}`,
    title: input.sceneTitle,
    summary: input.narration,
    action: input.action,
    createdAt: now,
  });

  await applySetbackIfNeeded(runId, nextCharacter);

  return getStoryBootstrap(runId);
}

export async function upsertSampleStoryState() {
  await seedStoryDataIfMissing();

  const sceneTime = isoNow();
  await upsertScene({
    id: crypto.randomUUID(),
    sceneKey: "sample-story-state",
    title: "Current Scene",
    narration: "Cade tests the story engine and confirms the campaign now uses a run-based Turso model with DB-backed canonical state.",
    suggestedChoices: ["Continue scouting", "Review the world", "Ask what changed"],
    actionDraft: "Scout the area before entering town",
    updatedAt: sceneTime,
  });

  await appendEvent({
    runId: DEFAULT_RUN_ID,
    id: crypto.randomUUID(),
    eventKey: `sample-${sceneTime}`,
    title: "Schema update complete",
    summary: "The campaign now runs through canonical run_state, turns, inventory, flags, discoveries, team members, and narrative condition tables.",
    action: "Migration / schema cleanup",
    createdAt: sceneTime,
  });

  return {
    tableCounts: await getTableCounts(),
    currentScene: (await getStoryBootstrap()).currentScene,
  };
}

// Development/testing helper only. Not part of normal player-facing story flow.
export async function resetStoryRun(runId = DEFAULT_RUN_ID) {
  await ensureSchema();
  const now = isoNow();

  await tursoPipeline([
    { type: "execute", stmt: { sql: `delete from run_turns where run_id = ${sqlString(runId)}` } },
    { type: "execute", stmt: { sql: `delete from run_events where run_id = ${sqlString(runId)}` } },
    { type: "execute", stmt: { sql: `delete from run_inventory where run_id = ${sqlString(runId)}` } },
    { type: "execute", stmt: { sql: `delete from run_flags where run_id = ${sqlString(runId)}` } },
    { type: "execute", stmt: { sql: `delete from run_discoveries where run_id = ${sqlString(runId)}` } },
    { type: "execute", stmt: { sql: `delete from run_team_members where run_id = ${sqlString(runId)}` } },
  ]);

  await seedCanonicalDefaults({
    character: {
      bodyState: "healthy",
      mindState: "clear",
      conditions: [],
      notes: [],
      region: "Whispering Pass Approach",
    },
    scene: {
      id: crypto.randomUUID(),
      sceneKey: "start",
      title: "Approach to Whispering Pass",
      narration:
        "Dawn has not yet broken, and Cade is already moving through the last stretch of dense woodland toward Whispering Pass. Beyond that narrow, dangerous route lies Oakhaven, the frontier town he means to reach next. His bow, dagger, sword, and ancient shadow brace are close at hand as the wind threads through the trees and the pass ahead lives up to its name.",
      suggestedChoices: [
        "Advance toward the mouth of Whispering Pass with caution",
        "Survey the approach for tracks, ambush points, or recent travelers",
        "Pause under cover and plan the safest route to Oakhaven",
      ],
      actionDraft: "",
      updatedAt: now,
    },
    events: [
      {
        id: crypto.randomUUID(),
        title: "Story reset",
        summary: "The test story state was reset to a clean starting point.",
        action: "Reset story",
        createdAt: now,
      },
    ],
  });

  return getStoryBootstrap(runId);
}

export async function getTableCounts() {
  await ensureSchema();
  const payload = await tursoPipeline([
    { type: "execute", stmt: { sql: "select count(*) from campaigns" } },
    { type: "execute", stmt: { sql: "select count(*) from characters" } },
    { type: "execute", stmt: { sql: "select count(*) from runs" } },
    { type: "execute", stmt: { sql: "select count(*) from run_state" } },
    { type: "execute", stmt: { sql: "select count(*) from run_turns" } },
    { type: "execute", stmt: { sql: "select count(*) from run_events" } },
    { type: "execute", stmt: { sql: "select count(*) from items" } },
    { type: "execute", stmt: { sql: "select count(*) from run_inventory" } },
    { type: "execute", stmt: { sql: "select count(*) from run_flags" } },
    { type: "execute", stmt: { sql: "select count(*) from run_discoveries" } },
    { type: "execute", stmt: { sql: "select count(*) from run_team_members" } },
    { type: "execute", stmt: { sql: "select count(*) from authored_scenes" } },
  ]);

  return {
    campaigns: Number(rowValue(rows(payload, 0)[0], 0) ?? 0),
    characters: Number(rowValue(rows(payload, 1)[0], 0) ?? 0),
    runs: Number(rowValue(rows(payload, 2)[0], 0) ?? 0),
    runState: Number(rowValue(rows(payload, 3)[0], 0) ?? 0),
    turns: Number(rowValue(rows(payload, 4)[0], 0) ?? 0),
    events: Number(rowValue(rows(payload, 5)[0], 0) ?? 0),
    items: Number(rowValue(rows(payload, 6)[0], 0) ?? 0),
    inventory: Number(rowValue(rows(payload, 7)[0], 0) ?? 0),
    flags: Number(rowValue(rows(payload, 8)[0], 0) ?? 0),
    discoveries: Number(rowValue(rows(payload, 9)[0], 0) ?? 0),
    teamMembers: Number(rowValue(rows(payload, 10)[0], 0) ?? 0),
    scenes: Number(rowValue(rows(payload, 11)[0], 0) ?? 0),
  };
}

export async function getStoryBootstrap(runId = DEFAULT_RUN_ID): Promise<StoryBootstrap> {
  await seedStoryDataIfMissing();

  const [stateRow, payload] = await Promise.all([
    getRunState(runId),
    tursoPipeline([
      {
        type: "execute",
        stmt: {
          sql: `select id, title, summary, action, created_at from run_events where run_id = ${sqlString(runId)} order by created_at desc limit 8`,
        },
      },
      {
        type: "execute",
        stmt: {
          sql: `
            select i.id, i.slug, i.name, i.item_type, i.description, ri.quantity, ri.equipped_slot, ri.metadata_json
            from run_inventory ri
            join items i on i.id = ri.item_id
            where ri.run_id = ${sqlString(runId)}
            order by i.name asc
          `,
        },
      },
      {
        type: "execute",
        stmt: {
          sql: `select flag_key, flag_value, updated_at from run_flags where run_id = ${sqlString(runId)} order by flag_key asc`,
        },
      },
      {
        type: "execute",
        stmt: {
          sql: `select id, discovery_type, discovery_key, name, summary, details, created_at from run_discoveries where run_id = ${sqlString(runId)} order by created_at desc limit 20`,
        },
      },
      {
        type: "execute",
        stmt: {
          sql: `select id, person_key, name, role, summary, relationship, status, is_companion, is_active, notes, updated_at from run_team_members where run_id = ${sqlString(runId)} order by updated_at desc limit 20`,
        },
      },
    ]),
  ]);

  if (!stateRow) {
    throw new Error(`Run not found: ${runId}`);
  }

  const eventRows = rows(payload, 0);
  const inventoryRows = rows(payload, 1);
  const flagRows = rows(payload, 2);
  const discoveryRows = rows(payload, 3);
  const teamMemberRows = rows(payload, 4);

  return {
    run: {
      id: rowValue(stateRow, 0) ?? runId,
      campaignId: rowValue(stateRow, 1) ?? DEFAULT_CAMPAIGN_ID,
      slug: rowValue(stateRow, 2) ?? DEFAULT_RUN_SLUG,
      name: rowValue(stateRow, 3) ?? "Main Run",
      status: rowValue(stateRow, 4) ?? "active",
      createdAt: rowValue(stateRow, 5) ?? isoNow(),
      updatedAt: rowValue(stateRow, 6) ?? isoNow(),
    },
    character: {
      id: rowValue(stateRow, 7) ?? DEFAULT_CHARACTER_ID,
      name: rowValue(stateRow, 8) ?? "Cade",
      status: rowValue(stateRow, 37) ?? rowValue(stateRow, 9) ?? "alive",
      kingdom: rowValue(stateRow, 10),
      region: rowValue(stateRow, 38) ?? rowValue(stateRow, 11),
      formerAffiliation: rowValue(stateRow, 12),
      role: rowValue(stateRow, 39) ?? rowValue(stateRow, 13),
      yearsOfService: rowValue(stateRow, 14) ? Number(rowValue(stateRow, 14)) : null,
      specializations: parseJsonArray(rowValue(stateRow, 15)),
      bodyState: rowValue(stateRow, 35) ?? "healthy",
      mindState: rowValue(stateRow, 36) ?? "clear",
      conditions: parseJsonArray(rowValue(stateRow, 40)),
      notes: parseJsonArray(rowValue(stateRow, 41) ?? rowValue(stateRow, 16)),
    },
    world: {
      id: rowValue(stateRow, 17) ?? DEFAULT_WORLD_ID,
      name: rowValue(stateRow, 18) ?? "Veyr",
      tone: rowValue(stateRow, 19),
      technologyLevel: rowValue(stateRow, 20),
      summary: rowValue(stateRow, 21) ?? "A dangerous frontier waits.",
      majorPowers: parseJsonArray(rowValue(stateRow, 22)),
      regions: parseJsonArray(rowValue(stateRow, 23)),
      locations: parseJsonArray(rowValue(stateRow, 24)),
      notes: parseJsonArray(rowValue(stateRow, 25)),
    },
    currentScene: rowValue(stateRow, 26)
      ? {
          id: rowValue(stateRow, 26) ?? crypto.randomUUID(),
          sceneKey: rowValue(stateRow, 27) ?? undefined,
          title: rowValue(stateRow, 28) ?? "Current Scene",
          narration: rowValue(stateRow, 29) ?? "",
          suggestedChoices: parseJsonArray(rowValue(stateRow, 30)),
          actionDraft: rowValue(stateRow, 31) ?? undefined,
          updatedAt: rowValue(stateRow, 42) ?? isoNow(),
        }
      : null,
    recentEvents: eventRows.map((row) => ({
      id: rowValue(row, 0) ?? crypto.randomUUID(),
      title: rowValue(row, 1) ?? "Untitled event",
      summary: rowValue(row, 2) ?? "",
      action: rowValue(row, 3) ?? undefined,
      createdAt: rowValue(row, 4) ?? isoNow(),
    })),
    inventory: inventoryRows.map((row) => {
      const metadata = parseJsonObject(rowValue(row, 7));
      return {
        itemId: rowValue(row, 0) ?? crypto.randomUUID(),
        slug: rowValue(row, 1) ?? "unknown-item",
        name: rowValue(row, 2) ?? "Unknown item",
        itemType: rowValue(row, 3) ?? "misc",
        description: rowValue(row, 4),
        quantity: Number(rowValue(row, 5) ?? 0),
        equippedSlot: rowValue(row, 6),
        metadata,
        abilities: parseInventoryAbilities(metadata),
      };
    }),
    flags: flagRows.map((row) => ({
      flagKey: rowValue(row, 0) ?? "unknown_flag",
      flagValue: rowValue(row, 1) ?? "",
      updatedAt: rowValue(row, 2) ?? isoNow(),
    })),
    discoveries: discoveryRows.map((row) => ({
      id: rowValue(row, 0) ?? crypto.randomUUID(),
      discoveryType: rowValue(row, 1) ?? "fact",
      key: rowValue(row, 2) ?? "unknown",
      name: rowValue(row, 3) ?? "Unknown discovery",
      summary: rowValue(row, 4) ?? "",
      details: rowValue(row, 5),
      createdAt: rowValue(row, 6) ?? isoNow(),
    })),
    teamMembers: teamMemberRows.map((row) => ({
      id: rowValue(row, 0) ?? crypto.randomUUID(),
      personKey: rowValue(row, 1) ?? "unknown_person",
      name: rowValue(row, 2) ?? "Unknown person",
      role: rowValue(row, 3),
      summary: rowValue(row, 4) ?? "",
      relationship: rowValue(row, 5),
      status: rowValue(row, 6) ?? "known",
      isCompanion: rowValue(row, 7) === "1",
      isActive: rowValue(row, 8) === "1",
      notes: rowValue(row, 9),
      updatedAt: rowValue(row, 10) ?? isoNow(),
    })),
  };
}
