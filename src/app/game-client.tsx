"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createAnalyser(audio: HTMLAudioElement) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  const source = context.createMediaElementSource(audio);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  source.connect(analyser);
  analyser.connect(context.destination);

  return { context, analyser };
}

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

type AudioPlaybackState = "idle" | "loading" | "ready" | "playing" | "blocked" | "error";

type GameClientProps = {
  worldName: string;
  playerName: string;
  playerRegion?: string;
  playerRole?: string;
  summaryText: string;
};

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
}: GameClientProps) {
  const initialTurn = useMemo(() => buildInitialTurn(worldName, playerName), [worldName, playerName]);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showStoryDetails, setShowStoryDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const narrationBoxRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const orbAnimationFrameRef = useRef<number | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const [orbLevel, setOrbLevel] = useState(0.18);

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

    const updateWordLimit = () => {
      setPhoneCardWordLimit(estimatePhoneCardWordLimit(window.innerWidth));
    };

    updateWordLimit();
    window.addEventListener("resize", updateWordLimit);
    return () => window.removeEventListener("resize", updateWordLimit);
  }, []);

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
      setOrbLevel(0.18);
      return;
    }

    audioRef.current.src = turn.audioUrl;
    audioRef.current.load();
  }, [turn.audioUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = audioRef.current;
    if (!audio) return;

    const ensureAnalyser = async () => {
      if (audioAnalyserRef.current && audioContextRef.current) {
        if (audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume().catch(() => undefined);
        }
        return true;
      }

      const created = createAnalyser(audio);
      if (!created) return false;

      audioContextRef.current = created.context;
      audioAnalyserRef.current = created.analyser;
      audioDataRef.current = new Uint8Array(new ArrayBuffer(created.analyser.frequencyBinCount));
      if (created.context.state === "suspended") {
        await created.context.resume().catch(() => undefined);
      }
      return true;
    };

    const tick = () => {
      const analyser = audioAnalyserRef.current;
      const data = audioDataRef.current;
      if (!analyser || !data) {
        setOrbLevel((current) => current * 0.92 + 0.16 * 0.08);
        orbAnimationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      analyser.getByteFrequencyData(data);

      let sum = 0;
      for (const value of data) sum += value;
      const average = data.length ? sum / data.length / 255 : 0;
      const nextLevel = clamp(0.14 + average * 1.35, 0.14, 1);
      setOrbLevel((current) => current * 0.72 + nextLevel * 0.28);
      orbAnimationFrameRef.current = window.requestAnimationFrame(tick);
    };

    const handlePlay = () => {
      ensureAnalyser().then(() => {
        if (orbAnimationFrameRef.current == null) {
          orbAnimationFrameRef.current = window.requestAnimationFrame(tick);
        }
      });
    };

    const handleStop = () => {
      if (orbAnimationFrameRef.current != null) {
        window.cancelAnimationFrame(orbAnimationFrameRef.current);
        orbAnimationFrameRef.current = null;
      }
      setOrbLevel((current) => current * 0.7 + 0.18 * 0.3);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handleStop);
    audio.addEventListener("ended", handleStop);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handleStop);
      audio.removeEventListener("ended", handleStop);
      if (orbAnimationFrameRef.current != null) {
        window.cancelAnimationFrame(orbAnimationFrameRef.current);
        orbAnimationFrameRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
      audioAnalyserRef.current = null;
      audioDataRef.current = null;
    };
  }, []);

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
  const actionChoices = turn.suggestedChoices.slice(0, 4);
  const orbScale = 1 + orbLevel * 0.22;
  const orbGlow = 0.28 + orbLevel * 0.4;
  const orbHaloScale = 1 + orbLevel * 0.32;
  const orbSubtitle = displayedCardText || (loading ? "Gathering the next beat of the story..." : turn.narration);
  const hasCardPagination = storyCards.length > 1;

  return (
    <>
      <section className="space-y-4 rounded-[30px] border border-violet-300/15 bg-[linear-gradient(180deg,rgba(14,9,28,0.96),rgba(6,5,14,0.98))] p-4 shadow-[0_0_0_1px_rgba(196,181,253,0.04),0_24px_80px_rgba(0,0,0,0.45)] md:p-6">
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

            </div>
          </form>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[24px] border border-violet-200/10 bg-black/20 p-4 md:p-5">
            <button
              type="button"
              onClick={() => setShowStoryDetails((prev) => !prev)}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-violet-300/70">Story</p>
                <h3 className="mt-2 text-xl font-semibold text-white md:text-2xl">{turn.sceneTitle}</h3>
              </div>
              <span className="rounded-full border border-violet-300/20 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-violet-100/80">
                {showStoryDetails ? "Hide" : "Show"}
              </span>
            </button>

            {showStoryDetails ? (
              <div className="mt-4 animate-fadeIn rounded-[24px] border border-violet-200/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 md:p-5">
                <div ref={narrationBoxRef} className="max-h-[44vh] overflow-y-auto">
                  <p className="whitespace-pre-wrap text-base leading-8 text-violet-50/95 md:text-lg">{turn.narration}</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-7 text-violet-100/72">Latest scene hidden. Scroll down only when you want the full catch-up.</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-violet-200/10 bg-black/20 p-4 md:p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-violet-300/70">Quick context</p>
              <div className="mt-4 space-y-3 text-sm text-violet-100/80">
                <p><span className="font-semibold text-violet-50">Current scene:</span> {turn.sceneTitle}</p>
                <p><span className="font-semibold text-violet-50">Saved turns:</span> {history.length}</p>
                {audioStatusMessage ? <p><span className="font-semibold text-violet-50">Voice:</span> {audioStatusMessage}</p> : null}
              </div>
            </div>

          </div>
        </div>
      </section>

      {shouldShowOverlay ? (
        <div className="fixed inset-0 z-50 bg-[#04020a] text-white">
          <button
            type="button"
            onClick={() => setShowOverlay(false)}
            className="absolute right-4 top-4 z-20 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/80 backdrop-blur transition hover:bg-white/10 md:right-6 md:top-6"
          >
            Close
          </button>

          <div
            className="flex h-full w-full flex-col px-4 pb-5 pt-18 md:px-8 md:pb-8 md:pt-24"
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
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-start gap-5 md:justify-center md:gap-8">
                <div className="flex w-full justify-center pt-2 md:pt-0">
                  <div className="relative flex h-[13.5rem] w-[13.5rem] items-center justify-center sm:h-[15rem] sm:w-[15rem] md:h-[20rem] md:w-[20rem]">
                    <div
                      className="absolute inset-0 rounded-full bg-violet-500/20 blur-3xl transition-transform duration-200"
                      style={{ transform: `scale(${1.08 + orbLevel * 0.2})`, opacity: orbGlow }}
                    />
                    <div
                      className="absolute inset-[10%] rounded-full border border-fuchsia-200/20 transition-transform duration-150"
                      style={{ transform: `scale(${orbHaloScale})`, boxShadow: `0 0 60px rgba(217, 70, 239, ${0.18 + orbLevel * 0.18})` }}
                    />
                    <div
                      className="absolute inset-[18%] rounded-full border border-cyan-200/12 opacity-80 transition-transform duration-150"
                      style={{ transform: `scale(${1 + orbLevel * 0.18}) rotate(${orbLevel * 10}deg)` }}
                    />
                    <div
                      className="story-orb relative h-[66%] w-[66%] rounded-full transition-transform duration-150"
                      style={{
                        transform: `scale(${orbScale})`,
                        boxShadow: `0 0 40px rgba(139, 92, 246, ${0.34 + orbLevel * 0.18}), 0 0 110px rgba(59, 130, 246, ${0.12 + orbLevel * 0.12})`,
                      }}
                    >
                      <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,0.75),rgba(255,255,255,0.16)_20%,transparent_42%)] opacity-85" />
                      <div className="absolute inset-[14%] rounded-full border border-white/10" />
                      <div className="absolute inset-[-10%] rounded-full bg-[conic-gradient(from_180deg,rgba(217,70,239,0.18),rgba(59,130,246,0.12),rgba(168,85,247,0.2),rgba(217,70,239,0.18))] blur-2xl" />
                    </div>
                  </div>
                </div>

                <div className="w-full max-w-3xl flex-1 rounded-[28px] border border-violet-200/10 bg-[linear-gradient(180deg,rgba(20,14,40,0.52),rgba(8,6,18,0.74))] px-4 py-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm md:flex-none md:px-8 md:py-6">
                  {storyModeDone ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center md:py-10">
                      <p className="text-2xl leading-[1.45] text-violet-50 md:text-4xl">End of passage.</p>
                      <p className="text-xs uppercase tracking-[0.26em] text-white/45 md:text-sm">
                        Swipe down to revisit or close to continue
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-violet-200/55 md:text-[11px]">Narration</p>
                        <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/65 md:text-[11px]">
                          Voice {audioPlaybackState}
                        </span>
                      </div>
                      <div className="max-h-[34vh] overflow-y-auto pr-1 md:max-h-[28vh] md:pr-2">
                        <p
                          className={`whitespace-pre-wrap text-[1rem] leading-[1.72] text-violet-50 transition-all sm:text-[1.08rem] md:text-[1.45rem] md:leading-[1.75] ${isCardVisible || !displayedCardText ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
                          style={{ transitionDuration: `${revealSpeed}ms` }}
                        >
                          {orbSubtitle}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-col items-center gap-3 pb-safe md:mt-6">
                <div className="flex w-full max-w-md items-center justify-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={goToPreviousCard}
                    disabled={loading || isTransitioningCard || cardIndex === 0}
                    className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-3 text-[11px] uppercase tracking-[0.18em] text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 md:flex-none md:px-4 md:py-2 md:text-xs"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={playCurrentAudio}
                    disabled={!turn.audioUrl || audioPlaybackState === "loading"}
                    className="min-w-0 flex-1 rounded-full border border-fuchsia-200/20 bg-fuchsia-200/10 px-3 py-3 text-[11px] uppercase tracking-[0.18em] text-fuchsia-50 transition hover:bg-fuchsia-200/15 disabled:cursor-not-allowed disabled:opacity-40 md:flex-none md:px-4 md:py-2 md:text-xs"
                  >
                    {audioPlaybackState === "loading"
                      ? "Loading"
                      : audioPlaybackState === "playing"
                        ? "Playing"
                        : "Play voice"}
                  </button>
                  <button
                    type="button"
                    onClick={goToNextCard}
                    disabled={loading || isTransitioningCard || storyModeDone || storyCards.length === 0}
                    className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-3 text-[11px] uppercase tracking-[0.18em] text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 md:flex-none md:px-4 md:py-2 md:text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
