import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import GameClient from "./game-client";

type CharactersState = {
  player: {
    name: string;
    status: string;
    origin?: {
      kingdom?: string;
      region?: string;
    };
    background?: {
      role?: string;
    };
  };
};

type WorldState = {
  world: {
    name: string;
    tone?: string;
  };
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
  const events = log.events ?? [];
  const summaryBlocks = markdownToParagraphs(summary);
  const latestEvent = events.at(-1);
  const storyTeaser = summaryBlocks[0] ?? `${player.name} is ready for the next move.`;

  return (
    <main className="min-h-screen bg-[#120d0a] bg-[radial-gradient(circle_at_top,_rgba(255,180,80,0.12),_transparent_35%),linear-gradient(180deg,_#1b140f_0%,_#120d0a_100%)] px-4 py-6 text-[#f5e7c8] md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-[28px] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(55,36,23,0.92),rgba(24,16,11,0.96))] p-6 shadow-[0_0_0_1px_rgba(255,220,160,0.04),0_30px_80px_rgba(0,0,0,0.45)] md:p-8">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,220,170,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,220,170,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs uppercase tracking-[0.4em] text-amber-300/80">Choose Adventure</p>
                <span className="rounded-full border border-sky-300/20 bg-sky-200/10 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-sky-100/85">
                  Release {releaseVersion}
                </span>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-[0.08em] text-amber-50 md:text-5xl">Current run</h1>
              <p className="mt-4 text-base leading-8 text-amber-100/85 md:text-lg">{storyTeaser}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[22rem]">
              <div className="rounded-2xl border border-amber-200/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Player</p>
                <p className="mt-2 text-xl font-medium text-amber-50">{player.name}</p>
                <p className="mt-1 text-sm text-amber-100/70">{player.background?.role ?? "Traveler"}</p>
              </div>
              <div className="rounded-2xl border border-amber-200/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">World</p>
                <p className="mt-2 text-xl font-medium text-amber-50">{world.world.name}</p>
                <p className="mt-1 text-sm text-amber-100/70">{world.world.tone ?? "Campaign active"}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="rounded-[24px] border border-amber-300/15 bg-black/20 p-5 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Now playing</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-amber-100/80">
              {player.status ? (
                <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1.5">{player.status}</span>
              ) : null}
              {player.origin?.region ? (
                <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1.5">{player.origin.region}</span>
              ) : null}
              {player.origin?.kingdom ? (
                <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-3 py-1.5">{player.origin.kingdom}</span>
              ) : null}
            </div>
            {latestEvent ? (
              <p className="mt-4 text-sm leading-7 text-amber-50/80">
                <span className="font-semibold text-amber-50">Latest beat:</span> {latestEvent.details}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link
              href="/lore"
              className="rounded-full border border-amber-300/20 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/15"
            >
              Lore
            </Link>
            <Link
              href="/character"
              className="rounded-full border border-amber-300/20 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/15"
            >
              Character
            </Link>
          </div>
        </section>

        <GameClient
          worldName={world.world.name}
          playerName={player.name}
          playerRegion={player.origin?.region}
          playerRole={player.background?.role}
          summaryText={summary}
          releaseVersion={releaseVersion}
        />
      </div>
    </main>
  );
}
