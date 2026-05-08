"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TurnResponse = {
  narration: string;
  sceneTitle: string;
  suggestedChoices: string[];
  usedTts: boolean;
  audioUrl?: string;
  ttsMode: "piper" | "browser" | "none";
};

type TurnHistoryEntry = {
  action: string;
  response: TurnResponse;
  createdAt: number;
};

type PersistedGameState = {
  actionDraft: string;
  currentTurn: TurnResponse;
  history: TurnHistoryEntry[];
};

type GameClientProps = {
  worldName: string;
  playerName: string;
  playerRegion?: string;
  playerRole?: string;
  summaryText: string;
};

const STORAGE_KEY = "choose-adventure-mvp-state";

function buildInitialTurn(worldName: string, playerName: string): TurnResponse {
  return {
    sceneTitle: `${worldName} Test Run`,
    narration:
      `${playerName} stands at the edge of a new story in ${worldName}. ` +
      `Use the field below to tell me what ${playerName} does next, and I’ll answer like a narrator.`,
    suggestedChoices: [
      "Scout the area before entering town",
      "Approach the nearest stranger and ask questions",
      "Inspect the most suspicious landmark nearby",
    ],
    usedTts: false,
    ttsMode: "none",
  };
}

export default function GameClient({
  worldName,
  playerName,
  playerRegion,
  playerRole,
  summaryText,
}: GameClientProps) {
  const initialTurn = useMemo(() => buildInitialTurn(worldName, playerName), [worldName, playerName]);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [turn, setTurn] = useState<TurnResponse>(initialTurn);
  const [history, setHistory] = useState<TurnHistoryEntry[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const context = useMemo(() => {
    return [
      `${playerName}${playerRole ? `, ${playerRole}` : ""}`,
      playerRegion ? `Region: ${playerRegion}` : null,
      `World: ${worldName}`,
    ]
      .filter(Boolean)
      .join(" • ");
  }, [playerName, playerRegion, playerRole, worldName]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<PersistedGameState>;
      if (parsed.actionDraft) setAction(parsed.actionDraft);
      if (parsed.currentTurn) setTurn(parsed.currentTurn);
      if (Array.isArray(parsed.history)) setHistory(parsed.history);
    } catch {
      // Ignore bad local state and continue with defaults.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const payload: PersistedGameState = {
      actionDraft: action,
      currentTurn: turn,
      history,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [action, turn, history, hydrated]);

  async function speakWithBrowser(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function resetSession() {
    setAction("");
    setError(null);
    setHistory([]);
    setTurn(initialTurn);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.speechSynthesis?.cancel();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!action.trim()) return;

    const submittedAction = action.trim();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: submittedAction,
          playerName,
          worldName,
          playerRegion,
          playerRole,
          summaryText,
          previousNarration: turn.narration,
        }),
      });

      if (!response.ok) {
        throw new Error(`Turn request failed: ${response.status}`);
      }

      const data = (await response.json()) as TurnResponse;
      setTurn(data);
      setHistory((prev) => [...prev, { action: submittedAction, response: data, createdAt: Date.now() }]);
      setAction("");

      if (data.audioUrl && audioRef.current) {
        audioRef.current.src = data.audioUrl;
        await audioRef.current.play().catch(() => undefined);
      } else {
        await speakWithBrowser(data.narration);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-emerald-300/20 bg-[linear-gradient(180deg,rgba(16,34,28,0.92),rgba(11,19,17,0.96))] p-5 shadow-[0_0_0_1px_rgba(110,231,183,0.04),0_24px_70px_rgba(0,0,0,0.35)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/70">Playable MVP</p>
          <h2 className="mt-2 text-3xl font-semibold text-emerald-50">Narrator Loop Test</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-100/75">
            Freeform input in, narrated response out. If Piper is installed on the host, the site can use it. If not,
            it falls back to browser speech.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="rounded-2xl border border-emerald-200/15 bg-emerald-50/5 px-4 py-3 text-xs uppercase tracking-[0.16em] text-emerald-100/75">
            {context}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-emerald-100/75">
              Saved turns: {history.length}
            </span>
            <button
              type="button"
              onClick={resetSession}
              className="rounded-full border border-rose-300/20 bg-rose-200/10 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-rose-100 transition hover:bg-rose-200/15"
            >
              Reset session
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-200/10 bg-black/25 p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-emerald-300/65">Current narration</p>
        <h3 className="mt-3 text-2xl font-semibold text-emerald-50">{turn.sceneTitle}</h3>
        <p className="mt-4 whitespace-pre-wrap text-base leading-8 text-emerald-50/95">{turn.narration}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-emerald-100/75">
            Voice mode: {turn.ttsMode}
          </span>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-emerald-100/75">
            Persistence: local browser storage
          </span>
          <button
            type="button"
            onClick={() => speakWithBrowser(turn.narration)}
            className="rounded-full border border-emerald-300/20 bg-emerald-200/10 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-emerald-100 transition hover:bg-emerald-200/15"
          >
            Read aloud
          </button>
        </div>

        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-300/65">Suggested prompts</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {turn.suggestedChoices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setAction(choice)}
                className="rounded-2xl border border-emerald-300/20 bg-[linear-gradient(180deg,rgba(110,231,183,0.10),rgba(110,231,183,0.03))] px-4 py-3 text-left text-sm text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:bg-emerald-200/10"
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="action" className="text-xs uppercase tracking-[0.28em] text-emerald-300/65">
            What does {playerName} do?
          </label>
          <textarea
            id="action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Use your phone dictation or type freely. Example: I move quietly toward the bell tower and look for whoever rang it."
            className="mt-3 min-h-32 w-full rounded-2xl border border-emerald-200/15 bg-[#08100e] px-4 py-4 text-base leading-7 text-emerald-50 outline-none transition placeholder:text-emerald-100/30 focus:border-emerald-300/35"
          />
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {!hydrated ? <p className="text-sm text-emerald-200/60">Restoring saved browser session...</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#0b1512] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Narrating..." : "Send action"}
          </button>
          <p className="text-sm text-emerald-100/65">
            Summary seed: {summaryText.slice(0, 120)}
            {summaryText.length > 120 ? "..." : ""}
          </p>
        </div>
      </form>

      {history.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-emerald-200/10 bg-black/20 p-5">
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-300/65">Recent session history</p>
          <div className="mt-4 space-y-4">
            {history.slice().reverse().map((entry) => (
              <article
                key={`${entry.createdAt}-${entry.action}`}
                className="rounded-2xl border border-emerald-200/10 bg-emerald-50/5 p-4"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/55">Your action</p>
                <p className="mt-2 text-sm leading-7 text-emerald-50">{entry.action}</p>
                <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-emerald-200/55">Narrator response</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-emerald-100/90">
                  {entry.response.narration}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <audio ref={audioRef} className="hidden" />
    </section>
  );
}
