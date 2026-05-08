import fs from "node:fs/promises";
import path from "node:path";
import GameClient from "./game-client";

type CharactersState = {
  player: {
    name: string;
    aliases?: string[];
    status: string;
    origin?: {
      kingdom?: string;
      region?: string;
    };
    background?: {
      former_affiliation?: string;
      role?: string;
      years_of_service?: number;
      specializations?: string[];
    };
  };
};

type WorldState = {
  world: {
    name: string;
    tone?: string;
    technology_level?: string;
  };
  major_powers?: string[];
  regions?: string[];
  locations?: string[];
};

type LogState = {
  events?: Array<{
    id: number;
    type: string;
    details: string;
  }>;
};

async function readStateFile<T>(fileName: string): Promise<T> {
  const filePath = path.join(process.cwd(), "public", "state", fileName);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function readSummary(): Promise<string> {
  const filePath = path.join(process.cwd(), "public", "state", "summary.md");
  return fs.readFile(filePath, "utf8");
}

function markdownToParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((block) => block.replace(/^#+\s*/gm, "").trim())
    .filter(Boolean);
}

export default async function Home() {
  const [characters, world, log, summary, packageRaw] = await Promise.all([
    readStateFile<CharactersState>("characters.json"),
    readStateFile<WorldState>("world.json"),
    readStateFile<LogState>("log.json"),
    readSummary(),
    fs.readFile(path.join(process.cwd(), "package.json"), "utf8"),
  ]);

  const pkg = JSON.parse(packageRaw) as { version?: string };
  const releaseVersion = pkg.version ?? "0.1.0";
  const player = characters.player;
  const summaryBlocks = markdownToParagraphs(summary);
  const events = log.events ?? [];

  return (
    <main className="min-h-screen bg-[#120d0a] bg-[radial-gradient(circle_at_top,_rgba(255,180,80,0.12),_transparent_35%),linear-gradient(180deg,_#1b140f_0%,_#120d0a_100%)] px-4 py-6 text-[#f5e7c8] md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-[28px] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(55,36,23,0.92),rgba(24,16,11,0.96))] p-6 shadow-[0_0_0_1px_rgba(255,220,160,0.04),0_30px_80px_rgba(0,0,0,0.45)] md:p-8">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,220,170,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,220,170,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.4em] text-amber-300/80">Choose Adventure</p>
              <span className="rounded-full border border-sky-300/20 bg-sky-200/10 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-sky-100/85">
                Release {releaseVersion}
              </span>
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[0.08em] text-amber-50 md:text-5xl">
              {world.world.name} Campaign Console
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-amber-100/80 md:text-base">
              A living campaign brief for {player.name}, with world notes, character background, and a playable MVP for
              freeform narrated turns.
            </p>
          </div>
        </header>

        <GameClient
          worldName={world.world.name}
          playerName={player.name}
          playerRegion={player.origin?.region}
          playerRole={player.background?.role}
          summaryText={summary}
          releaseVersion={releaseVersion}
        />

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="space-y-6">
            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] backdrop-blur-sm md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Campaign summary</p>
                  <h2 className="mt-2 text-3xl font-semibold text-amber-50">
                    {player.name} of {player.origin?.kingdom ?? "Unknown Kingdom"}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-amber-100/80">
                  {player.status ? (
                    <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1.5">{player.status}</span>
                  ) : null}
                  {player.origin?.region ? (
                    <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1.5">{player.origin.region}</span>
                  ) : null}
                  {world.world.tone ? (
                    <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1.5">{world.world.tone}</span>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 space-y-4 rounded-2xl border border-amber-200/10 bg-[linear-gradient(180deg,rgba(255,248,220,0.05),rgba(255,248,220,0.02))] p-5">
                {summaryBlocks.map((block, index) => (
                  <p key={index} className="text-base leading-8 text-amber-50/95 md:text-lg">
                    {block}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] md:p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/70">Adventure log</h3>
                <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-amber-100/70">
                  {events.length} entries
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {events.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-2xl border border-amber-200/10 bg-[linear-gradient(180deg,rgba(255,248,220,0.05),rgba(255,248,220,0.015))] p-4"
                  >
                    <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-amber-200/55">
                      <span>{entry.type.replaceAll("_", " ")}</span>
                      <span>Event {entry.id}</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-amber-50/90">{entry.details}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] md:p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/70">Raw summary markdown</h3>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-amber-200/10 bg-[#0d0a08] p-4 text-sm leading-7 whitespace-pre-wrap text-amber-100/85">
                {summary}
              </pre>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] md:p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/70">Character profile</h3>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Name</p>
                  <p className="mt-1 text-lg font-medium text-amber-50">{player.name}</p>
                </div>

                {player.background?.role ? (
                  <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Role</p>
                    <p className="mt-1 text-lg font-medium text-amber-50">{player.background.role}</p>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3">
                  {player.background?.former_affiliation ? (
                    <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Former affiliation</p>
                      <p className="mt-1 text-amber-50">{player.background.former_affiliation}</p>
                    </div>
                  ) : null}

                  {typeof player.background?.years_of_service === "number" ? (
                    <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Years of service</p>
                      <p className="mt-1 text-amber-50">{player.background.years_of_service}</p>
                    </div>
                  ) : null}
                </div>

                {player.background?.specializations?.length ? (
                  <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Specializations</p>
                    <ul className="mt-3 space-y-2 text-sm text-amber-50/90">
                      {player.background.specializations.map((item) => (
                        <li key={item} className="rounded-xl bg-black/20 px-3 py-2">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] md:p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/70">World state</h3>
              <div className="mt-4 space-y-4 text-sm text-amber-50/90">
                {world.world.technology_level ? (
                  <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Technology level</p>
                    <p className="mt-2 leading-7">{world.world.technology_level}</p>
                  </div>
                ) : null}

                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Major powers</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(world.major_powers ?? []).map((power) => (
                      <span
                        key={power}
                        className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-xs uppercase tracking-[0.12em]"
                      >
                        {power}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Regions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(world.regions ?? []).map((region) => (
                      <span
                        key={region}
                        className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-xs uppercase tracking-[0.12em]"
                      >
                        {region}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Locations</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(world.locations ?? []).map((location) => (
                      <span
                        key={location}
                        className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-xs uppercase tracking-[0.12em]"
                      >
                        {location}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
