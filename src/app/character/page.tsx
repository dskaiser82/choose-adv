import Link from "next/link";
import { getStoryBootstrap } from "@/lib/turso";

export default async function CharacterPage() {
  const { character, inventory } = await getStoryBootstrap();

  return (
    <main className="min-h-screen bg-[#120d0a] bg-[linear-gradient(180deg,_#1b140f_0%,_#120d0a_100%)] px-4 py-6 text-[#f5e7c8] md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Character</p>
            <h1 className="mt-2 text-4xl font-semibold text-amber-50">{character.name}</h1>
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
            <p className="mt-2 text-lg text-amber-50">{character.status}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Body state</p>
            <p className="mt-2 text-lg text-amber-50">{character.bodyState ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Mind state</p>
            <p className="mt-2 text-lg text-amber-50">{character.mindState ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Role</p>
            <p className="mt-2 text-lg text-amber-50">{character.role ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Kingdom</p>
            <p className="mt-2 text-lg text-amber-50">{character.kingdom ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Region</p>
            <p className="mt-2 text-lg text-amber-50">{character.region ?? "Unknown"}</p>
          </div>
        </div>

        {character.formerAffiliation ? (
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Former affiliation</p>
            <p className="mt-3 text-amber-50/90">{character.formerAffiliation}</p>
          </div>
        ) : null}

        {typeof character.yearsOfService === "number" ? (
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Years of service</p>
            <p className="mt-3 text-amber-50/90">{character.yearsOfService}</p>
          </div>
        ) : null}

        {character.conditions?.length ? (
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Conditions</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {character.conditions.map((item) => (
                <span key={item} className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-sm text-amber-50/90">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {inventory.some((item) => item.abilities?.length) ? (
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Magical abilities</p>
            <div className="mt-4 space-y-3">
              {inventory.flatMap((item) => (item.abilities ?? []).map((ability) => ({ ability, itemName: item.name }))).map(({ ability, itemName }) => (
                <div key={`${itemName}-${ability.key}`} className="rounded-2xl border border-amber-200/10 bg-amber-50/5 p-4">
                  <p className="text-sm font-semibold text-amber-50/95">{ability.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-amber-200/60">Granted by {itemName}</p>
                  <p className="mt-2 text-sm leading-6 text-amber-50/80">{ability.description}</p>
                  <p className="mt-2 text-sm text-amber-100/75"><span className="font-semibold">Cost:</span> {ability.cost}</p>
                  <p className="mt-1 text-sm text-amber-100/75"><span className="font-semibold">Downside:</span> {ability.downside}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {character.specializations.length ? (
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Specializations</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {character.specializations.map((item) => (
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
