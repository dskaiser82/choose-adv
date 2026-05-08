import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

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

async function readStateFile<T>(fileName: string): Promise<T> {
  const filePath = path.join(process.cwd(), "public", "state", fileName);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export default async function CharacterPage() {
  const characters = await readStateFile<CharactersState>("characters.json");
  const player = characters.player;

  return (
    <main className="min-h-screen bg-[#120d0a] bg-[linear-gradient(180deg,_#1b140f_0%,_#120d0a_100%)] px-4 py-6 text-[#f5e7c8] md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Character</p>
            <h1 className="mt-2 text-4xl font-semibold text-amber-50">{player.name}</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-amber-300/20 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/15"
          >
            Back to run
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Status</p>
            <p className="mt-2 text-lg text-amber-50">{player.status}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Role</p>
            <p className="mt-2 text-lg text-amber-50">{player.background?.role ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Kingdom</p>
            <p className="mt-2 text-lg text-amber-50">{player.origin?.kingdom ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Region</p>
            <p className="mt-2 text-lg text-amber-50">{player.origin?.region ?? "Unknown"}</p>
          </div>
        </div>

        {player.background?.former_affiliation ? (
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Former affiliation</p>
            <p className="mt-3 text-amber-50/90">{player.background.former_affiliation}</p>
          </div>
        ) : null}

        {typeof player.background?.years_of_service === "number" ? (
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Years of service</p>
            <p className="mt-3 text-amber-50/90">{player.background.years_of_service}</p>
          </div>
        ) : null}

        {player.background?.specializations?.length ? (
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Specializations</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {player.background.specializations.map((item) => (
                <span key={item} className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-sm text-amber-50/90">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
