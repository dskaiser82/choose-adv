import fs from "node:fs/promises";
import path from "node:path";

type PlayerState = {
  name: string;
  health: number;
  status: string;
  inventory: string[];
  flags: Record<string, boolean>;
  activeObjectives: string[];
};

type WorldState = {
  currentScene: {
    id: string;
    title: string;
    summary: string;
    choices: string[];
  };
  location: string;
  timeOfDay: string;
  weather: string;
  worldFlags: Record<string, boolean>;
  npcs: Record<string, { mood: string; trust: number }>;
  unlockedLocations: string[];
};

type LogEntry = {
  id: number;
  type: string;
  text: string;
  timestamp: string;
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

export default async function Home() {
  const [player, world, log, summary] = await Promise.all([
    readStateFile<PlayerState>("player.json"),
    readStateFile<WorldState>("world.json"),
    readStateFile<LogEntry[]>("log.json"),
    readSummary(),
  ]);

  return (
    <main className="min-h-screen bg-[#120d0a] bg-[radial-gradient(circle_at_top,_rgba(255,180,80,0.12),_transparent_35%),linear-gradient(180deg,_#1b140f_0%,_#120d0a_100%)] px-4 py-6 text-[#f5e7c8] md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-[28px] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(55,36,23,0.92),rgba(24,16,11,0.96))] p-6 shadow-[0_0_0_1px_rgba(255,220,160,0.04),0_30px_80px_rgba(0,0,0,0.45)] md:p-8">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,220,170,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,220,170,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="relative">
            <p className="text-xs uppercase tracking-[0.4em] text-amber-300/80">Choose Adventure</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[0.08em] text-amber-50 md:text-5xl">
              Retro Story Console
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-amber-100/80 md:text-base">
              A moody single-page logbook for your voice-driven adventure sessions. The homepage is meant to feel like a
              mix of old terminal, worn fantasy handbook, and glowing tavern notice board.
            </p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="space-y-6">
            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] backdrop-blur-sm md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Current Scene</p>
                  <h2 className="mt-2 text-3xl font-semibold text-amber-50">{world.currentScene.title}</h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-amber-100/80">
                  <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1.5">{world.location}</span>
                  <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1.5">{world.timeOfDay}</span>
                  <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1.5">{world.weather}</span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-amber-200/10 bg-[linear-gradient(180deg,rgba(255,248,220,0.05),rgba(255,248,220,0.02))] p-5">
                <p className="text-lg leading-8 text-amber-50/95">{world.currentScene.summary}</p>
              </div>

              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/70">Available choices</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {world.currentScene.choices.map((choice, index) => (
                    <div
                      key={choice}
                      className="rounded-2xl border border-amber-300/20 bg-[linear-gradient(180deg,rgba(255,210,120,0.12),rgba(255,210,120,0.04))] px-4 py-3 text-sm text-amber-50 shadow-[inset_0_1px_0_rgba(255,240,200,0.08)]"
                    >
                      <span className="mr-2 text-amber-300/80">0{index + 1}.</span>
                      {choice}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] md:p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/70">Adventure log</h3>
                <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-amber-100/70">
                  {log.length} entries
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {log.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-2xl border border-amber-200/10 bg-[linear-gradient(180deg,rgba(255,248,220,0.05),rgba(255,248,220,0.015))] p-4"
                  >
                    <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-amber-200/55">
                      <span>{entry.type}</span>
                      <span>{entry.timestamp}</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-amber-50/90">{entry.text}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] md:p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/70">Summary markdown</h3>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-amber-200/10 bg-[#0d0a08] p-4 text-sm leading-7 whitespace-pre-wrap text-amber-100/85">
                {summary}
              </pre>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] md:p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/70">Player state</h3>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Name</p>
                  <p className="mt-1 text-lg font-medium text-amber-50">{player.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Health</p>
                    <p className="mt-1 text-lg font-medium text-amber-50">{player.health}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Status</p>
                    <p className="mt-1 text-lg font-medium text-amber-50 capitalize">{player.status}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Inventory</p>
                  <ul className="mt-3 space-y-2 text-sm text-amber-50/90">
                    {player.inventory.map((item) => (
                      <li key={item} className="rounded-xl bg-black/20 px-3 py-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Objectives</p>
                  <ul className="mt-3 space-y-2 text-sm text-amber-50/90">
                    {player.activeObjectives.map((objective) => (
                      <li key={objective} className="rounded-xl bg-black/20 px-3 py-2">
                        {objective}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-amber-300/20 bg-black/25 p-5 shadow-[inset_0_1px_0_rgba(255,220,160,0.06)] md:p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/70">World state</h3>
              <div className="mt-4 space-y-4 text-sm text-amber-50/90">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Unlocked locations</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {world.unlockedLocations.map((location) => (
                      <span
                        key={location}
                        className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-xs uppercase tracking-[0.12em]"
                      >
                        {location}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">NPC status</p>
                  <div className="mt-3 space-y-2">
                    {Object.entries(world.npcs).map(([name, npc]) => (
                      <div key={name} className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium capitalize text-amber-50">{name}</p>
                          <p className="text-xs uppercase tracking-[0.14em] text-amber-200/55">Trust {npc.trust}</p>
                        </div>
                        <p className="mt-2 text-sm capitalize text-amber-100/80">Mood: {npc.mood}</p>
                      </div>
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
