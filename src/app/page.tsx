import fs from "node:fs/promises";
import path from "node:path";
import GameClient from "./game-client";

type CharactersState = {
  player: {
    name: string;
    origin?: {
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
  const [characters, world, summary, packageRaw] = await Promise.all([
    readStateFile<CharactersState>("characters.json"),
    readStateFile<WorldState>("world.json"),
    readSummary(),
    fs.readFile(path.join(process.cwd(), "package.json"), "utf8"),
  ]);

  const pkg = JSON.parse(packageRaw) as { version?: string };
  const releaseVersion = pkg.version ?? "0.1.0";
  const player = characters.player;
  const summaryBlocks = markdownToParagraphs(summary);
  const storyTeaser = summaryBlocks[0] ?? `${player.name} is ready for the next move.`;

  return (
    <main className="min-h-screen bg-[#07050d] bg-[radial-gradient(circle_at_top,_rgba(109,40,217,0.28),_transparent_38%),linear-gradient(180deg,_#11091f_0%,_#07050d_58%,_#05030a_100%)] px-4 py-5 text-[#f3ecff] md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="relative overflow-hidden rounded-[30px] border border-violet-300/15 bg-[linear-gradient(180deg,rgba(18,10,36,0.94),rgba(8,6,18,0.98))] p-5 shadow-[0_0_0_1px_rgba(196,181,253,0.04),0_30px_90px_rgba(0,0,0,0.5)] md:p-7">
          <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(196,181,253,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(196,181,253,0.08)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.38em] text-violet-200/75">Choose Adventure</p>
              <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-200/10 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-fuchsia-100/90">
                Release {releaseVersion}
              </span>
            </div>

            <div>
              <h1 className="text-3xl font-semibold tracking-[0.06em] text-white md:text-4xl">{world.world.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-violet-100/78 md:text-base">{storyTeaser}</p>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-violet-100/80">
              <span className="rounded-full border border-violet-200/10 bg-white/5 px-3 py-1.5">{player.name}</span>
              {player.background?.role ? (
                <span className="rounded-full border border-violet-200/10 bg-white/5 px-3 py-1.5">{player.background.role}</span>
              ) : null}
              {player.origin?.region ? (
                <span className="rounded-full border border-violet-200/10 bg-white/5 px-3 py-1.5">{player.origin.region}</span>
              ) : null}
              {world.world.tone ? (
                <span className="rounded-full border border-violet-200/10 bg-white/5 px-3 py-1.5">{world.world.tone}</span>
              ) : null}
            </div>
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
      </div>
    </main>
  );
}
