import Link from "next/link";
import { getStoryBootstrap } from "@/lib/turso";

export default async function LorePage() {
  const { world, currentScene } = await getStoryBootstrap();

  return (
    <main className="min-h-screen bg-[#120d0a] bg-[linear-gradient(180deg,_#1b140f_0%,_#120d0a_100%)] px-4 py-6 text-[#f5e7c8] md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Lore</p>
            <h1 className="mt-2 text-4xl font-semibold text-amber-50">{world.name}</h1>
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
            <p className="mt-2 text-amber-50/90">{world.tone ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Technology</p>
            <p className="mt-2 text-amber-50/90">{world.technologyLevel ?? "Unknown"}</p>
          </div>
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Current scene</p>
            <p className="mt-2 text-amber-50/90">{currentScene?.title ?? "None yet"}</p>
          </div>
        </div>

        <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">World summary</p>
          <p className="mt-4 text-base leading-8 text-amber-50/90">{world.summary}</p>
        </div>

        {currentScene?.narration ? (
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Latest scene narration</p>
            <p className="mt-4 text-base leading-8 text-amber-50/90">{currentScene.narration}</p>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Major powers</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {world.majorPowers.map((power) => (
                <span key={power} className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-sm text-amber-50/90">
                  {power}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Regions</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {world.regions.map((region) => (
                <span key={region} className="rounded-full border border-amber-200/10 bg-amber-50/5 px-3 py-1.5 text-sm text-amber-50/90">
                  {region}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-amber-300/20 bg-black/20 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-200/55">Locations</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {world.locations.map((location) => (
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
