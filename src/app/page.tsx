import fs from "node:fs/promises";
import path from "node:path";
import GameClient from "./game-client";
import { getStoryBootstrap } from "@/lib/turso";

export default async function Home() {
  const [{ character, world, currentScene }, packageRaw] = await Promise.all([
    getStoryBootstrap(),
    fs.readFile(path.join(process.cwd(), "package.json"), "utf8"),
  ]);

  const pkg = JSON.parse(packageRaw) as { version?: string };
  const releaseVersion = pkg.version ?? "0.1.0";
  const storyTeaser = currentScene?.narration ?? world.summary;

  return (
    <main className="min-h-screen bg-[#07050d] bg-[radial-gradient(circle_at_top,_rgba(109,40,217,0.28),_transparent_38%),linear-gradient(180deg,_#11091f_0%,_#07050d_58%,_#05030a_100%)] px-4 py-5 text-[#f3ecff] md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <GameClient
          worldName={world.name}
          playerName={character.name}
          playerRegion={character.region ?? undefined}
          playerRole={character.role ?? undefined}
          summaryText={world.summary}
          initialTurn={{
            sceneTitle: currentScene?.title ?? `${world.name} Test Run`,
            narration: currentScene?.narration ?? storyTeaser,
            suggestedChoices: currentScene?.suggestedChoices ?? [
              "Study the darkness beyond the firelight",
              "Inspect the shadow brace and feel for its pull",
              "Rest, listen, and prepare for what comes next",
            ],
            usedTts: false,
            ttsMode: "none",
          }}
        />

        <header className="relative overflow-hidden rounded-[30px] border border-violet-300/15 bg-[linear-gradient(180deg,rgba(18,10,36,0.94),rgba(8,6,18,0.98))] p-4 shadow-[0_0_0_1px_rgba(196,181,253,0.04),0_24px_70px_rgba(0,0,0,0.45)] md:p-6">
          <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(196,181,253,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(196,181,253,0.08)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.38em] text-violet-200/75">Choose Adventure</p>
            </div>

            <div>
              <h1 className="text-3xl font-semibold tracking-[0.06em] text-white md:text-4xl">{world.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-violet-100/78 md:text-base">Story and world context live below the action console now, so the next move stays first.</p>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-violet-100/80">
              <span className="rounded-full border border-violet-200/10 bg-white/5 px-3 py-1.5">{character.name}</span>
              <span className="rounded-full border border-violet-200/10 bg-white/5 px-3 py-1.5">Body: {character.bodyState ?? "healthy"}</span>
              <span className="rounded-full border border-violet-200/10 bg-white/5 px-3 py-1.5">Mind: {character.mindState ?? "clear"}</span>
              {character.role ? (
                <span className="rounded-full border border-violet-200/10 bg-white/5 px-3 py-1.5">{character.role}</span>
              ) : null}
              {character.region ? (
                <span className="rounded-full border border-violet-200/10 bg-white/5 px-3 py-1.5">{character.region}</span>
              ) : null}
            </div>
          </div>
        </header>
      </div>
    </main>
  );
}
