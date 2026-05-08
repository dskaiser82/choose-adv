import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

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

export default async function LorePage() {
  const [world, log, summary] = await Promise.all([
    readStateFile<WorldState>("world.json"),
    readStateFile<LogState>("log.json"),
    readSummary(),
  ]);

  const summaryBlocks = markdownToParagraphs(summary);
  const events = log.events ?? [];

  return (
    <main className="min-h-screen bg-[#120d0a] bg-[linear-gradient(180deg,_#1b140f_0%,_#120d0a_100%)] px-4 py-6 text-[#f5e7c8] md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Lore</p>
            <h1 className="mt-2 text-4xl font-semibold text-amber-50">{world.world.name}</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-amber-300/20 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/15"
          >
            Back to run
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Tone</p>
            <p className="mt-2 text-amber-50/90">{world.world.tone ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Technology</p>
            <p className="mt-2 text-amber-50/90">{world.world.technology_level ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Logged events</p>
            <p className="mt-2 text-amber-50/90">{events.length}</p>
          </div>
        </div>

        <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">World summary</p>
          <div className="mt-4 space-y-4">
            {summaryBlocks.map((block, index) => (
              <p key={index} className="text-base leading-8 text-amber-50/90">
                {block}
              </p>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Major powers</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(world.major_powers ?? []).map((power) => (
                <span key={power} className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-sm text-amber-50/90">
                  {power}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Regions</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(world.regions ?? []).map((region) => (
                <span key={region} className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-sm text-amber-50/90">
                  {region}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Locations</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(world.locations ?? []).map((location) => (
                <span key={location} className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-sm text-amber-50/90">
                  {location}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
