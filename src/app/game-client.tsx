"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TurnResponse = {
  narration: string;
  sceneTitle: string;
  suggestedChoices: string[];
  usedTts: boolean;
  audioUrl?: string;
  ttsMode: "elevenlabs" | "none";
  ttsDebug?: {
    hasApiKey?: boolean;
    apiKeyPrefix?: string | null;
    stage?: string;
    chunkCount?: number;
    byteLength?: number;
    error?: string;
  };
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
  revealSpeed: number;
};

type AudioPlaybackState = "idle" | "loading" | "ready" | "playing" | "blocked" | "error";

type GameClientProps = {
  worldName: string;
  playerName: string;
  playerRegion?: string;
  playerRole?: string;
  summaryText: string;
  releaseVersion: string;
};

const STORAGE_KEY = "choose-adventure-mvp-state";
const DEFAULT_REVEAL_SPEED = 1500;
const CARD_FADE_MS = 420;
const DEFAULT_PHONE_CARD_WORD_LIMIT = 34;
const SWIPE_THRESHOLD_PX = 60;

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
      "Wait, listen, and study the surroundings",
    ],
    usedTts: false,
    ttsMode: "none",
  };
}

export function splitIntoSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimatePhoneCardWordLimit(viewportWidth: number) {
  if (viewportWidth <= 360) return 30;
  if (viewportWidth <= 390) return 34;
  if (viewportWidth <= 430) return 38;
  return 42;
}

export function buildStoryCards(text: string, maxWordsPerCard = DEFAULT_PHONE_CARD_WORD_LIMIT) {
  const sentences = splitIntoSentences(text);
  const cards: string[] = [];
  let currentCard = "";

  for (const sentence of sentences) {
    const nextCard = currentCard ? `${currentCard} ${sentence}` : sentence;
    if (currentCard && countWords(nextCard) > maxWordsPerCard) {
      cards.push(currentCard);
      currentCard = sentence;
      continue;
    }
    currentCard = nextCard;
  }

  if (currentCard) {
    cards.push(currentCard);
  }

  return cards.filter(Boolean);
}

export default function GameClient({
  worldName,
  playerName,
  playerRegion,
  playerRole,
  summaryText,
  releaseVersion,
}: GameClientProps) {
  const initialTurn = useMemo(() => buildInitialTurn(worldName, playerName), [worldName, playerName]);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showStoryDetails, setShowStoryDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [turn, setTurn] = useState<TurnResponse>(initialTurn);
  const [history, setHistory] = useState<TurnHistoryEntry[]>([]);
  const [revealSpeed, setRevealSpeed] = useState(DEFAULT_REVEAL_SPEED);
  const [storyCards, setStoryCards] = useState<string[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [displayedCardText, setDisplayedCardText] = useState("");
  const [isCardVisible, setIsCardVisible] = useState(false);
  const [storyModeDone, setStoryModeDone] = useState(false);
  const [isTransitioningCard, setIsTransitioningCard] = useState(false);
  const [phoneCardWordLimit, setPhoneCardWordLimit] = useState(DEFAULT_PHONE_CARD_WORD_LIMIT);
  const [audioPlaybackState, setAudioPlaybackState] = useState<AudioPlaybackState>("idle");
  const [audioStatusMessage, setAudioStatusMessage] = useState<string | null>(null);
  const [bridgeTestState, setBridgeTestState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [bridgeTestMessage, setBridgeTestMessage] = useState<string | null>(null);
  const [dbTestState, setDbTestState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [dbTestMessage, setDbTestMessage] = useState<string | null>(null);
  const [resetState, setResetState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const narrationBoxRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef<number | null>(null);

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
      if (typeof parsed.revealSpeed === "number") setRevealSpeed(parsed.revealSpeed);
    } catch {
      // Ignore bad local state and continue with defaults.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateWordLimit = () => {
      setPhoneCardWordLimit(estimatePhoneCardWordLimit(window.innerWidth));
    };

    updateWordLimit();
    window.addEventListener("resize", updateWordLimit);
    return () => window.removeEventListener("resize", updateWordLimit);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const payload: PersistedGameState = {
      actionDraft: action,
      currentTurn: turn,
      history,
      revealSpeed,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [action, turn, history, revealSpeed, hydrated]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = showOverlay ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showOverlay]);

  useEffect(() => {
    narrationBoxRef.current?.scrollTo({ top: narrationBoxRef.current.scrollHeight, behavior: "smooth" });
  }, [turn.narration]);

  useEffect(() => {
    if (!showOverlay) return;
    if (!storyCards.length) return;
    if (cardIndex >= storyCards.length) {
      setStoryModeDone(true);
      setDisplayedCardText("");
      setIsCardVisible(false);
      setIsTransitioningCard(false);
      return;
    }

    setDisplayedCardText(storyCards[cardIndex]);
    setIsCardVisible(false);
    setStoryModeDone(false);
    setIsTransitioningCard(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setIsCardVisible(true);
      setIsTransitioningCard(false);
      timerRef.current = null;
    }, 40);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [showOverlay, storyCards, cardIndex]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (!turn.audioUrl) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      return;
    }

    audioRef.current.src = turn.audioUrl;
    audioRef.current.load();
  }, [turn.audioUrl]);

  function resetStoryMode() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStoryCards([]);
    setCardIndex(0);
    setDisplayedCardText("");
    setIsCardVisible(false);
    setStoryModeDone(false);
    setIsTransitioningCard(false);
  }

  function resetSession() {
    setAction("");
    setError(null);
    setHistory([]);
    setTurn(initialTurn);
    setShowOverlay(false);
    setShowRecap(false);
    setAudioPlaybackState("idle");
    setAudioStatusMessage(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    resetStoryMode();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  function goToNextCard() {
    if (loading || isTransitioningCard) return;
    if (!storyCards.length) return;
    if (cardIndex >= storyCards.length - 1) {
      setStoryModeDone(true);
      setDisplayedCardText("");
      setIsCardVisible(false);
      return;
    }

    setIsTransitioningCard(true);
    setIsCardVisible(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setCardIndex((prev) => prev + 1);
      timerRef.current = null;
    }, CARD_FADE_MS);
  }

  function goToPreviousCard() {
    if (loading || isTransitioningCard) return;
    if (cardIndex <= 0) return;

    setStoryModeDone(false);
    setIsTransitioningCard(true);
    setIsCardVisible(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setCardIndex((prev) => Math.max(prev - 1, 0));
      timerRef.current = null;
    }, CARD_FADE_MS);
  }

  async function playCurrentAudio() {
    if (!turn.audioUrl) {
      setAudioPlaybackState("error");
      setAudioStatusMessage("No narration audio is ready yet.");
      return;
    }

    if (!audioRef.current) {
      setAudioPlaybackState("error");
      setAudioStatusMessage("Audio player is not ready yet.");
      return;
    }

    setAudioPlaybackState("loading");
    setAudioStatusMessage("Preparing audio...");
    try {
      if (audioRef.current.paused) {
        audioRef.current.currentTime = 0;
      }
      await audioRef.current.play();
      setAudioPlaybackState("playing");
      setAudioStatusMessage("Audio playing");
      setShowOverlay(true);
    } catch (err) {
      setAudioPlaybackState("blocked");
      setAudioStatusMessage(err instanceof Error ? err.message : "Browser blocked audio playback.");
    }
  }

  async function runBridgeTest() {
    setBridgeTestState("loading");
    setBridgeTestMessage("Testing bridge...");

    try {
      const response = await fetch("/api/bridge-turn-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "vercel-ui",
          action: "bridge test ping",
          worldName,
          playerName,
          timestamp: Date.now(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; error?: string; sceneTitle?: string; narration?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? `Bridge test failed: ${response.status}`);
      }

      setBridgeTestState("success");
      setBridgeTestMessage(
        payload.sceneTitle
          ? `Bridge turn ok: ${payload.sceneTitle}`
          : `Bridge reached: ${payload.message ?? "ok"}`,
      );
    } catch (err) {
      setBridgeTestState("error");
      setBridgeTestMessage(err instanceof Error ? err.message : "Bridge test failed.");
    }
  }

  async function runDatabaseTest() {
    setDbTestState("loading");
    setDbTestMessage("Testing Turso save/read...");

    try {
      const response = await fetch("/api/turso-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            tableCounts?: { world?: number; character?: number; scene?: number; event?: number };
            state?: { currentScene?: { title?: string | null } | null };
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? `DB test failed: ${response.status}`);
      }

      setDbTestState("success");
      setDbTestMessage(
        `Turso ok: world ${payload.tableCounts?.world ?? 0}, character ${payload.tableCounts?.character ?? 0}, scene ${payload.tableCounts?.scene ?? 0}, event ${payload.tableCounts?.event ?? 0}; current scene ${payload.state?.currentScene?.title ?? "?"}`,
      );
    } catch (err) {
      setDbTestState("error");
      setDbTestMessage(err instanceof Error ? err.message : "Database test failed.");
    }
  }

  async function resetStory() {
    setResetState("loading");
    setResetMessage("Resetting story...");

    try {
      const response = await fetch("/api/reset-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; tableCounts?: { world?: number; character?: number; scene?: number; event?: number } }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? `Reset failed: ${response.status}`);
      }

      resetSession();
      setResetState("success");
      setResetMessage(
        `Story reset: world ${payload.tableCounts?.world ?? 0}, character ${payload.tableCounts?.character ?? 0}, scene ${payload.tableCounts?.scene ?? 0}, event ${payload.tableCounts?.event ?? 0}`,
      );
    } catch (err) {
      setResetState("error");
      setResetMessage(err instanceof Error ? err.message : "Reset failed.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!action.trim()) return;

    const submittedAction = action.trim();
    setLoading(true);
    setShowOverlay(true);
    setError(null);
    setAudioPlaybackState("loading");
    setAudioStatusMessage(null);
    resetStoryMode();

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

      if (!response.ok || !response.body) {
        throw new Error(`Turn request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalTurn: TurnResponse | null = null;
      let fullNarration = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }

      const events = buffer.split("\n\n").filter(Boolean);
      for (const rawEvent of events) {
        const lines = rawEvent.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event: "));
        const dataLine = lines.find((line) => line.startsWith("data: "));
        if (!eventLine || !dataLine) continue;
        const eventName = eventLine.slice(7).trim();
        const payload = JSON.parse(dataLine.slice(6));

        if (eventName === "chunk") {
          fullNarration += String(payload.text ?? "");
        } else if (eventName === "done") {
          finalTurn = payload as TurnResponse;
        }
      }

      if (!finalTurn) {
        throw new Error("Stream completed without final turn data.");
      }

      const ttsResponse = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullNarration || finalTurn.narration }),
      });

      let playbackTurn: TurnResponse = {
        ...finalTurn,
        usedTts: false,
        ttsMode: "none",
        ttsDebug: {
          stage: "tts-not-requested",
        },
      };

      if (ttsResponse.ok) {
        const audioBlob = await ttsResponse.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioPlaybackState("ready");
        setAudioStatusMessage(`Audio ready (${Math.round(audioBlob.size / 1024)} KB)`);
        playbackTurn = {
          ...finalTurn,
          usedTts: true,
          audioUrl,
          ttsMode: "elevenlabs",
          ttsDebug: {
            hasApiKey: ttsResponse.headers.get("x-tts-key-prefix") !== null,
            apiKeyPrefix: ttsResponse.headers.get("x-tts-key-prefix"),
            stage: ttsResponse.headers.get("x-tts-stage") ?? "audio-generated",
            chunkCount: Number(ttsResponse.headers.get("x-tts-chunk-count") ?? "0"),
            byteLength: Number(ttsResponse.headers.get("x-tts-byte-length") ?? "0"),
          },
        };
      } else {
        setAudioPlaybackState("error");
        const ttsError = (await ttsResponse.json().catch(() => null)) as
          | { debug?: TurnResponse["ttsDebug"]; error?: string }
          | null;
        setAudioStatusMessage(ttsError?.debug?.error ?? ttsError?.error ?? `TTS request failed: ${ttsResponse.status}`);
        playbackTurn = {
          ...finalTurn,
          usedTts: false,
          ttsMode: "none",
          ttsDebug: {
            ...ttsError?.debug,
            error: ttsError?.debug?.error ?? ttsError?.error ?? `TTS request failed: ${ttsResponse.status}`,
          },
        };
      }

      const cards = buildStoryCards(fullNarration || finalTurn.narration, phoneCardWordLimit);
      setStoryCards(cards);
      setTurn(playbackTurn);
      setHistory((prev) => [...prev, { action: submittedAction, response: playbackTurn, createdAt: Date.now() }]);
      setAction("");

      if (playbackTurn.audioUrl && audioRef.current) {
        audioRef.current.src = playbackTurn.audioUrl;
        audioRef.current.load();
        try {
          await audioRef.current.play();
          setAudioPlaybackState("playing");
          setAudioStatusMessage("Audio playing");
        } catch (err) {
          setAudioPlaybackState("blocked");
          setAudioStatusMessage(err instanceof Error ? err.message : "Tap play to start narration audio.");
        }
      }
    } catch (err) {
      setAudioPlaybackState("error");
      setAudioStatusMessage(err instanceof Error ? err.message : "Something went wrong.");
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setShowOverlay(false);
    } finally {
      setLoading(false);
    }
  }

  const shouldShowOverlay = showOverlay;
  const currentCardWords = displayedCardText ? countWords(displayedCardText) : 0;
  const actionChoices = turn.suggestedChoices.slice(0, 4);

  return (
    <>
      <section className="rounded-[30px] border border-violet-300/15 bg-[linear-gradient(180deg,rgba(14,9,28,0.96),rgba(6,5,14,0.98))] p-4 shadow-[0_0_0_1px_rgba(196,181,253,0.04),0_24px_80px_rgba(0,0,0,0.45)] md:p-6">
        <audio
          ref={audioRef}
          preload="auto"
          className="hidden"
          onLoadedMetadata={() => {
            setAudioPlaybackState("ready");
            setAudioStatusMessage((current) => current ?? "Audio ready");
          }}
          onCanPlay={() => {
            setAudioPlaybackState((current) => (current === "playing" ? current : "ready"));
          }}
          onPlay={() => {
            setAudioPlaybackState("playing");
            setAudioStatusMessage("Audio playing");
          }}
          onPause={() => {
            setAudioPlaybackState((current) => (current === "error" ? current : "ready"));
          }}
          onEnded={() => {
            setAudioPlaybackState("ready");
            setAudioStatusMessage("Audio finished");
          }}
          onError={() => {
            setAudioPlaybackState("error");
            setAudioStatusMessage("Audio element failed to load or play");
          }}
        />

        <div className="rounded-[24px] border border-violet-200/10 bg-black/25 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-violet-300/70">Action console</p>
              <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">What happens next?</h2>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-violet-100/55">{context}</p>
            </div>
            <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-200/10 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-fuchsia-100/90">
              Release {releaseVersion}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="action" className="text-xs uppercase tracking-[0.28em] text-violet-300/70">
                Enter the next move
              </label>
              <textarea
                id="action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Type the next move or use phone dictation."
                className="mt-3 min-h-28 w-full rounded-[24px] border border-violet-200/15 bg-[#090611] px-4 py-4 text-base leading-7 text-violet-50 outline-none transition placeholder:text-violet-100/25 focus:border-violet-300/35"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {actionChoices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setAction(choice)}
                  className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(180deg,rgba(168,85,247,0.12),rgba(168,85,247,0.04))] px-4 py-3 text-left text-sm text-violet-50 transition hover:bg-violet-300/12"
                >
                  {choice}
                </button>
              ))}
            </div>

            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            {!hydrated ? <p className="text-sm text-violet-200/60">Restoring saved browser session...</p> : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#120a22] transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#120a22]/25 border-t-[#120a22]" />
                    Building scene
                  </>
                ) : (
                  "Send action"
                )}
              </button>

              <button
                type="button"
                onClick={playCurrentAudio}
                disabled={!turn.audioUrl || audioPlaybackState === "loading"}
                className="rounded-full border border-fuchsia-200/18 bg-fuchsia-200/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-50 transition hover:bg-fuchsia-200/14 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {audioPlaybackState === "loading"
                  ? "Loading audio"
                  : audioPlaybackState === "playing"
                    ? "Voice playing"
                    : "Play voice"}
              </button>

              <button
                type="button"
                onClick={() => setShowRecap((prev) => !prev)}
                className="rounded-full border border-violet-300/20 bg-white/5 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-violet-100 transition hover:bg-white/10"
              >
                {showRecap ? "Hide recap" : "Show recap"}
              </button>

              <button
                type="button"
                onClick={runBridgeTest}
                disabled={bridgeTestState === "loading"}
                className="rounded-full border border-sky-300/20 bg-sky-200/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-50 transition hover:bg-sky-200/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bridgeTestState === "loading" ? "Testing bridge" : "Test bridge"}
              </button>

              <button
                type="button"
                onClick={runDatabaseTest}
                disabled={dbTestState === "loading"}
                className="rounded-full border border-emerald-300/20 bg-emerald-200/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-50 transition hover:bg-emerald-200/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dbTestState === "loading" ? "Testing Turso" : "Test Turso DB"}
              </button>

              <button
                type="button"
                onClick={resetStory}
                disabled={resetState === "loading"}
                className="rounded-full border border-amber-300/20 bg-amber-200/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-amber-50 transition hover:bg-amber-200/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetState === "loading" ? "Resetting" : "Reset story"}
              </button>
            </div>
          </form>
        </div>

        <div className="mt-4 rounded-[24px] border border-violet-200/10 bg-black/20 p-4 md:p-5">
          <button
            type="button"
            onClick={() => setShowStoryDetails((prev) => !prev)}
            className="flex w-full items-center justify-between gap-4 text-left"
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-violet-300/70">Story panel</p>
              <h3 className="mt-2 text-xl font-semibold text-white md:text-2xl">{turn.sceneTitle}</h3>
            </div>
            <span className="rounded-full border border-violet-300/20 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-violet-100/80">
              {showStoryDetails ? "Hide" : "Show"}
            </span>
          </button>

          {showStoryDetails ? (
            <div className="mt-4 animate-fadeIn rounded-[24px] border border-violet-200/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 md:p-5">
              <div ref={narrationBoxRef} className="max-h-[52vh] overflow-y-auto">
                <p className="whitespace-pre-wrap text-base leading-8 text-violet-50/95 md:text-lg">{turn.narration}</p>
              </div>
            </div>
          ) : null}
        </div>

        {showRecap ? (
          <div className="mt-4 rounded-[24px] border border-violet-200/10 bg-black/20 p-4 md:p-5">
            <p className="text-[11px] uppercase tracking-[0.28em] text-violet-300/70">Recap</p>
            <p className="mt-3 text-sm leading-7 text-violet-100/78">
              Summary seed: {summaryText.slice(0, 220)}
              {summaryText.length > 220 ? "..." : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-violet-100/80">
              <span className="rounded-full border border-violet-300/20 bg-white/5 px-3 py-1.5">Voice {turn.ttsMode}</span>
              <span className="rounded-full border border-violet-300/20 bg-white/5 px-3 py-1.5">Saved turns {history.length}</span>
              <span className="rounded-full border border-violet-300/20 bg-white/5 px-3 py-1.5">Card target ~{phoneCardWordLimit} words</span>
              <span className="rounded-full border border-violet-300/20 bg-white/5 px-3 py-1.5">Fade {(revealSpeed / 1000).toFixed(1)}s</span>
            </div>
            {audioStatusMessage ? <p className="mt-4 text-sm text-fuchsia-100/80">{audioStatusMessage}</p> : null}
          </div>
        ) : null}

        {bridgeTestMessage ? (
          <div className="mt-4 rounded-[20px] border border-sky-300/15 bg-sky-200/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-sky-200/75">Bridge test</p>
            <p className={`mt-2 text-sm ${bridgeTestState === "error" ? "text-rose-300" : "text-sky-100/85"}`}>
              {bridgeTestMessage}
            </p>
          </div>
        ) : null}

        {dbTestMessage ? (
          <div className="mt-4 rounded-[20px] border border-emerald-300/15 bg-emerald-200/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-200/75">Turso test</p>
            <p className={`mt-2 text-sm ${dbTestState === "error" ? "text-rose-300" : "text-emerald-100/85"}`}>
              {dbTestMessage}
            </p>
          </div>
        ) : null}

        {resetMessage ? (
          <div className="mt-4 rounded-[20px] border border-amber-300/15 bg-amber-200/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200/75">Story reset</p>
            <p className={`mt-2 text-sm ${resetState === "error" ? "text-rose-300" : "text-amber-100/85"}`}>
              {resetMessage}
            </p>
          </div>
        ) : null}
      </section>

      {shouldShowOverlay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04020a]">
          <button
            type="button"
            onClick={() => setShowOverlay(false)}
            className="absolute right-5 top-5 z-10 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/80 transition hover:bg-white/10"
          >
            Close
          </button>

          <div
            className="flex h-full w-full items-center justify-center px-5 text-center md:px-8"
            onTouchStart={(e) => {
              touchStartYRef.current = e.changedTouches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const startY = touchStartYRef.current;
              const endY = e.changedTouches[0]?.clientY;
              touchStartYRef.current = null;
              if (startY == null || endY == null) return;
              const deltaY = startY - endY;
              if (deltaY > SWIPE_THRESHOLD_PX) goToNextCard();
              if (deltaY < -SWIPE_THRESHOLD_PX) goToPreviousCard();
            }}
          >
            <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center gap-8">
              {displayedCardText ? (
                <div className="w-full max-w-[22rem] rounded-[32px] border border-violet-200/10 bg-[linear-gradient(180deg,rgba(20,14,40,0.86),rgba(8,6,18,0.92))] px-5 py-8 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur-sm md:max-w-3xl md:px-10 md:py-12">
                  <p
                    className={`whitespace-pre-wrap text-[1.65rem] leading-[1.55] text-violet-50 transition-all md:text-5xl ${isCardVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
                    style={{ transitionDuration: `${revealSpeed}ms` }}
                  >
                    {displayedCardText}
                  </p>
                </div>
              ) : loading ? (
                <div className="flex flex-col items-center gap-4 text-white/75">
                  <div className="space-y-2 text-center">
                    <p className="animate-pulse text-base font-medium uppercase tracking-[0.38em] text-violet-100/90">
                      Building scene
                    </p>
                    <p className="animate-fadeIn text-xs uppercase tracking-[0.22em] text-violet-200/45">
                      Gathering the next beat of the story...
                    </p>
                  </div>
                </div>
              ) : storyModeDone ? (
                <div className="space-y-4">
                  <p className="text-3xl leading-[1.55] text-violet-50 md:text-5xl">End of passage.</p>
                  <p className="text-sm uppercase tracking-[0.28em] text-white/45">
                    Swipe down to revisit or close to continue
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="absolute bottom-5 left-1/2 flex w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 flex-col items-center justify-center gap-3 text-center sm:w-auto">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70">
                Release {releaseVersion}
              </span>
              <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70">
                Fade {(revealSpeed / 1000).toFixed(1)}s
              </span>
              <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70">
                Cards {storyCards.length === 0 ? 0 : Math.min(cardIndex + 1, storyCards.length)}/{Math.max(storyCards.length, 1)}
              </span>
              <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70">
                Voice {audioPlaybackState}
              </span>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={goToPreviousCard}
                disabled={loading || isTransitioningCard || cardIndex === 0}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={playCurrentAudio}
                disabled={!turn.audioUrl || audioPlaybackState === "loading"}
                className="rounded-full border border-fuchsia-200/20 bg-fuchsia-200/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-fuchsia-50 transition hover:bg-fuchsia-200/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {audioPlaybackState === "loading"
                  ? "Loading audio"
                  : audioPlaybackState === "playing"
                    ? "Voice playing"
                    : "Play voice"}
              </button>
              <button
                type="button"
                onClick={goToNextCard}
                disabled={loading || isTransitioningCard || storyModeDone || storyCards.length === 0}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
