import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CHALLENGES, MAX_INPUT_RPM, SUCCESS_HOLD_SECONDS, getChallenge, goalText, pitchRadius } from "@/game/config";
import { canPlace, goalMet, nextHint, outputRpm, solve } from "@/game/mechanics";
import { initialInteraction, interactionReducer } from "@/game/interaction";
import { HAND_DEFAULTS, defaultSaved, loadSaved, writeSaved, type SavedState } from "@/game/persistence";
import { useHandTracking, type HandStatus } from "@/hooks/useHandTracking";
import { Workbench } from "./Workbench";
import { GearShape } from "./GearShape";
import { HandGuideContent } from "./HandGuide";
import { Button } from "@/components/ui/button";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adjacentLevels, advanceHold, campaignProgress, completionLabel, recordCompletion } from "@/game/campaign";

const DRAG_THRESHOLD = 8;
const SNAP_RADIUS_PX = 56;

const HAND_LABEL: Record<HandStatus, string> = {
  off: "Hand control off",
  requesting: "Waiting for camera permission",
  loading: "Loading hand model (first time can take a few seconds)",
  searching: "Searching for hand",
  detected: "Ready",
  pinching: "Pinching",
  lost: "Hand not detected. Raise one hand into view.",
  denied: "Camera permission denied",
  unavailable: "Camera unavailable",
  "model-failed": "Hand model failed to load",
};

type Confirm = null | "resetLevel" | "resetAll";

export function Steamworks() {
  const [saved, setSaved] = useState<SavedState>(defaultSaved);
  const [hydrated, setHydrated] = useState(false);
  const challenge = getChallenge(saved.challengeId);
  const reducer = useMemo(() => interactionReducer(challenge), [challenge]);
  const [state, dispatch] = useReducer(reducer, undefined, () => initialInteraction());
  const [running, setRunning] = useState(true);
  const [steam, setSteam] = useState(challenge.initialSteam);
  const [hoverSocket, setHoverSocket] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [panel, setPanel] = useState<null | "help" | "settings" | "how" | "guide" | "progress">(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraConsent, setCameraConsent] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [debug, setDebug] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [success, setSuccess] = useState<null | { assisted: boolean }>(null);
  const [resetKey, setResetKey] = useState(0);
  const [hintStep, setHintStep] = useState(0);
  const [gestureToken, setGestureToken] = useState(0);
  const attemptFinished = useRef(false);
  const session = useRef(0);
  const overlayOpen = !!(showWelcome || panel || confirm || cameraConsent || success);
  const overlayRef = useRef(overlayOpen);
  overlayRef.current = overlayOpen;
  const progress = campaignProgress(saved.completed);

  const rpm = running ? (steam / 100) * MAX_INPUT_RPM : 0;
  const solution = useMemo(() => solve(challenge, state.placements), [challenge, state.placements]);
  const met = goalMet(challenge, solution);
  const hint = nextHint(challenge, state.placements, solution);
  const reducedMotion = saved.settings.reducedMotion;
  const outRpm = outputRpm(solution, rpm);

  // Load persisted state after hydration.
  useEffect(() => {
    const s = loadSaved();
    if (!s.settings.reducedMotion && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) s.settings.reducedMotion = true;
    s.settings.inputMode = "pointer"; // never auto-activate the camera
    setSaved(s);
    setSteam(getChallenge(s.challengeId).initialSteam);
    dispatch({ type: "reset", placements: s.placements[s.challengeId] ?? {}, assisted: s.assistedAttempts[s.challengeId] ?? false });
    setShowWelcome(!s.seenWelcome);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeSaved(saved);
  }, [saved, hydrated]);

  // Persist placements per level id.
  useEffect(() => {
    if (!hydrated) return;
    setSaved((s) => ({ ...s, placements: { ...s.placements, [challenge.id]: state.placements }, assistedAttempts: { ...s.assistedAttempts, [challenge.id]: state.assisted } }));
  }, [state.placements, state.assisted, challenge.id, hydrated]);

  // Success: goal met with positive input power for SUCCESS_HOLD_SECONDS of continuous running.
  const holdRef = useRef(0);
  useEffect(() => {
    if (success || attemptFinished.current) return;
    const generation = session.current;
    let last = performance.now();
    const id = window.setInterval(() => {
      if (generation !== session.current || attemptFinished.current) return;
      const now = performance.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      holdRef.current = advanceHold(holdRef.current, met && rpm > 0 && !state.held && !overlayRef.current && !document.hidden, dt);
      setHoldProgress(holdRef.current / SUCCESS_HOLD_SECONDS);
      if (holdRef.current >= SUCCESS_HOLD_SECONDS) {
        attemptFinished.current = true;
        holdRef.current = 0;
        setSuccess({ assisted: state.assisted });
        setSaved((s) => ({ ...s, completed: recordCompletion(s.completed, challenge.id, state.assisted) }));
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [met, rpm, state.held, state.assisted, success, challenge.id, resetKey]);

  useEffect(() => {
    holdRef.current = 0;
    setHoldProgress(0);
  }, [state.placements, challenge.id, resetKey]);
  useEffect(() => {
    if (rpm <= 0 || state.held || overlayOpen) {
      holdRef.current = 0;
      setHoldProgress(0);
    }
  }, [rpm, state.held, overlayOpen]);

  // ---------- Unified activation (pointer, touch, hand) ----------
  const drag = useRef<{ partId: string; x: number; y: number; moved: boolean; source: "pointer" | "hand" } | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const handCursorRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef(state.held);
  heldRef.current = state.held;

  /** Nearest socket centre within the snap radius (screen px), only while a gear is held. */
  const snapSocket = (x: number, y: number): string | null => {
    let best: string | null = null;
    let bestD = SNAP_RADIUS_PX;
    document.querySelectorAll<SVGCircleElement>("[data-socket-hit]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestD) {
        bestD = d;
        best = el.getAttribute("data-socket-hit");
      }
    });
    return best;
  };

  const hit = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    const directSocket = el?.closest("[data-socket]")?.getAttribute("data-socket") ?? null;
    const onBench = !!el?.closest("#bench");
    return {
      el,
      part: el?.closest<HTMLElement | SVGElement>("[data-part]")?.getAttribute("data-part") ?? null,
      socket: directSocket ?? (heldRef.current && onBench ? snapSocket(x, y) : null),
      tray: !!el?.closest("[data-tray]"),
      control: el?.closest<HTMLElement>("button, input, summary, [role=button]") ?? null,
    };
  };

  const moveGhost = (x: number, y: number) => {
    const g = ghostRef.current;
    if (g) g.style.transform = `translate(${x}px, ${y}px)`;
  };

  const pressAt = useCallback((x: number, y: number, source: "pointer" | "hand") => {
    const h = hit(x, y);
    if (overlayRef.current) {
      if (source === "hand" && h.el?.closest("[role=dialog]") && h.control) h.control.click();
      return;
    }
    const held = heldRef.current;
    if (held) {
      if (h.socket && !(h.part === held)) return dispatch({ type: "drop", socketId: h.socket });
      if (h.part && h.part !== held) {
        dispatch({ type: "pick", partId: h.part });
        drag.current = { partId: h.part, x, y, moved: false, source };
        moveGhost(x, y);
        return;
      }
      if (h.tray) return dispatch({ type: "returnToTray" });
      if (h.part === held) {
        drag.current = { partId: held, x, y, moved: false, source };
        return;
      }
      if (source === "hand" && h.control) return h.control.click();
      if (!h.control) dispatch({ type: "cancel" });
      return;
    }
    if (h.part) {
      dispatch({ type: "pick", partId: h.part });
      drag.current = { partId: h.part, x, y, moved: false, source };
      moveGhost(x, y);
      return;
    }
    if (source === "hand" && h.control) {
      if (h.control instanceof HTMLInputElement && h.control.type === "range") return;
      h.control.click(); // edge-triggered: called once per pinch start
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveAt = useCallback((x: number, y: number) => {
    if (overlayRef.current) return;
    const d = drag.current;
    if (d && !d.moved && Math.hypot(x - d.x, y - d.y) > DRAG_THRESHOLD) d.moved = true;
    if (d) moveGhost(x, y);
    if (heldRef.current) {
      const s = hit(x, y).socket;
      setHoverSocket((prev) => (prev === s ? prev : s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const releaseAt = useCallback((x: number, y: number) => {
    const d = drag.current;
    drag.current = null;
    if (overlayRef.current || !d || !d.moved) return; // a tap: keep the part selected for tap-to-place
    const h = hit(x, y);
    if (h.socket) dispatch({ type: "drop", socketId: h.socket });
    else if (h.tray) dispatch({ type: "returnToTray", partId: d.partId });
    else dispatch({ type: "cancel" });
    setHoverSocket(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer & touch
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element;
      if (target.closest("[data-part]")) e.preventDefault();
      pressAt(e.clientX, e.clientY, "pointer");
    };
    const move = (e: PointerEvent) => moveAt(e.clientX, e.clientY);
    const up = (e: PointerEvent) => {
      if (drag.current?.source === "pointer") releaseAt(e.clientX, e.clientY);
    };
    const cancel = () => {
      if (drag.current?.source === "pointer") {
        drag.current = null;
        dispatch({ type: "cancel" });
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        drag.current = null;
        dispatch({ type: "cancel" });
        setPanel(null);
        setConfirm(null);
        setCameraConsent(false);
        setSuccess(null);
        setShowWelcome(false);
        setSaved((s) => ({ ...s, seenWelcome: true }));
      }
    };
    const root = document.getElementById("steam-stage");
    root?.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      root?.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [pressAt, moveAt, releaseAt, hydrated]);

  // Hand tracking
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hand = useHandTracking({
    enabled: cameraOn,
    sensitivity: saved.settings.sensitivity,
    smoothing: saved.settings.smoothing,
    videoRef,
    canvasRef,
    debug,
    resetToken: gestureToken,
    callbacks: {
      onMove: (x, y, pinching) => {
        const c = handCursorRef.current;
        if (c) {
          c.style.transform = `translate(${x}px, ${y}px)`;
          c.dataset["pinch"] = pinching ? "1" : "0";
          c.style.opacity = "1";
        }
        moveAt(x, y);
      },
      onPinchStart: (x, y) => pressAt(x, y, "hand"),
      onPinchEnd: (x, y) => {
        if (drag.current?.source === "hand") {
          drag.current.moved = true; // a grab released means "try to drop here"
          releaseAt(x, y);
        }
      },
      onLost: () => {
        if (handCursorRef.current) handCursorRef.current.style.opacity = "0.3";
        if (drag.current?.source === "hand") {
          drag.current = null;
          setHoverSocket(null);
          dispatch({ type: "feedback", feedback: { tone: "warning", text: "Hand tracking lost. The gear went back where it was." } });
          dispatch({ type: "cancel", silent: true });
        }
      },
    },
  });
  useEffect(() => {
    drag.current = null;
    setHoverSocket(null);
    dispatch({ type: "cancel", silent: true });
    setGestureToken((n) => n + 1);
    holdRef.current = 0;
    setHoldProgress(0);
  }, [panel, confirm, cameraConsent, showWelcome, success]);
  const handFailed = ["denied", "unavailable", "model-failed"].includes(hand.status);

  // Turning the camera off must never leave a grab active.
  const setCamera = (on: boolean) => {
    if (!on && drag.current?.source === "hand") {
      drag.current = null;
      dispatch({ type: "cancel", silent: true });
    }
    setCameraOn(on);
    setSaved((s) => ({ ...s, settings: { ...s.settings, inputMode: on ? "hand" : "pointer" } }));
    if (on && !saved.seenHandGuide) {
      setPanel("guide");
      setSaved((s) => ({ ...s, seenHandGuide: true }));
    }
  };

  // ---------- Level actions ----------
  /** Shared clean-up for level switch and reset: cancel grabs, previews, timers, overlays. */
  const clearTransient = () => {
    drag.current = null;
    heldRef.current = null;
    session.current += 1;
    attemptFinished.current = false;
    holdRef.current = 0;
    setHoldProgress(0);
    setHoverSocket(null);
    setHintStep(0);
    setGestureToken((n) => n + 1);
    setSuccess(null);
    setConfirm(null);
    setResetKey((k) => k + 1);
  };

  const switchChallenge = (id: string, replay = false) => {
    if (id === challenge.id && !replay) { setPanel(null); return; }
    clearTransient();
    setPanel(null);
    const next = getChallenge(id);
    setSteam(next.initialSteam);
    setRunning(true);
    setSaved((s) => ({ ...s, challengeId: next.id }));
    dispatch({ type: "reset", placements: replay ? {} : saved.placements[next.id] ?? {}, assisted: replay ? false : saved.assistedAttempts[next.id] ?? false });
  };
  const doResetLevel = () => {
    clearTransient();
    setSteam(challenge.initialSteam);
    setRunning(true);
    dispatch({ type: "reset" });
  };
  const requestResetLevel = () => {
    const meaningful = Object.keys(state.placements).length > 0 || state.assisted;
    if (meaningful) setConfirm("resetLevel");
    else doResetLevel();
  };
  const doResetAll = () => {
    const d = defaultSaved();
    d.seenWelcome = true;
    d.seenHandGuide = saved.seenHandGuide;
    d.settings = { ...saved.settings };
    d.challengeId = challenge.id;
    setRunning(true);
    setSaved(d);
    clearTransient();
    setSteam(challenge.initialSteam);
    dispatch({ type: "reset" });
    setPanel(null);
  };
  const closeWelcome = (camera: boolean) => {
    setShowWelcome(false);
    setSaved((s) => ({ ...s, seenWelcome: true }));
    if (camera) setCameraConsent(true);
  };

  const heldPart = state.held ? challenge.tray.find((p) => p.id === state.held) : null;
  const placedIds = new Set(Object.values(state.placements));
  const { previous: prevChallenge, next: nextChallenge } = adjacentLevels(challenge.id);
  const isLast = !nextChallenge;
  const outTeeth = solution.outputId === "output" ? challenge.output.teeth : challenge.tray.find((p) => p.id === solution.outputId)?.teeth;

  const handLine = (() => {
    if (!cameraOn) return null;
    if (hand.status === "detected" || hand.status === "pinching") {
      if (state.held) return hoverSocket ? (hand.status === "pinching" ? "Release to place" : "Pinch to place here") : "Move to a highlighted socket";
      return hand.status === "pinching" ? "Pinching" : "Ready";
    }
    return HAND_LABEL[hand.status];
  })();

  const authoredHints = challenge.hints ?? [
    challenge.goal.kind === "connect" ? "Look for gaps between the input and output. Start next to the input." : challenge.goal.kind === "direction" ? "Count the reversals on each route before choosing your gears." : "Compare the input and output tooth counts before filling the gaps.",
    challenge.concept,
  ];
  const placementPreview = heldPart && hoverSocket ? canPlace(challenge, state.placements, heldPart.id, hoverSocket) : null;
  const previewMessage = placementPreview ? placementPreview.ok ? "Fits here · release to place" : placementPreview.reason : null;
  const feedbackText = previewMessage ?? (state.feedback?.tone === "warning" ? state.feedback.text : solution.jammed || (solution.outputConnected && !met) ? hint : hintStep ? authoredHints[hintStep - 1] : state.feedback?.text ?? hint);
  const statusTone = placementPreview && !placementPreview.ok ? "warning" : state.feedback?.tone === "warning" ? "warning" : met ? "success" : "info";

  return (
    <div className={`flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden ${reducedMotion ? "reduce-motion" : ""}`}>
      {/* Top bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2">
        <h1 className="font-display text-2xl font-black leading-none text-brass">STEAMWORKS</h1>
        <span className="text-xs text-muted-foreground">Simplified gear simulation</span>
        <nav className="ml-auto flex items-center gap-1" aria-label="Levels">
          <NavBtn disabled={!prevChallenge} onClick={() => prevChallenge && switchChallenge(prevChallenge.id)} label="Previous level">
            <ChevronLeft aria-hidden />
          </NavBtn>
          <ol className="flex items-center gap-1">
            {CHALLENGES.map((c) => {
              const done = saved.completed[c.id];
              const current = c.id === challenge.id;
              return (
                <li key={c.id}>
                  <Button variant="outline"
                    onClick={() => switchChallenge(c.id)}
                    aria-current={current ? "step" : undefined}
                    aria-label={`Level ${c.number}: ${c.title}${done === "solved" ? ", completed" : done === "assisted" ? ", completed with teaching aid" : ""}`}
                    title={c.title}
                    className={`relative h-8 w-8 rounded-md border font-mono text-sm transition-colors ${
                      current ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"
                    }`}
                  >
                    {c.number}
                    {done && (
                      <span
                        aria-hidden
                        className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${done === "solved" ? "bg-success" : "bg-background ring-1 ring-success"}`}
                      />
                    )}
                  </Button>
                </li>
              );
            })}
          </ol>
          <NavBtn disabled={!nextChallenge} onClick={() => nextChallenge && switchChallenge(nextChallenge.id)} label="Next level">
            <ChevronRight aria-hidden />
          </NavBtn>
        </nav>
        <div className="flex items-center gap-1">
          <TextBtn onClick={() => setPanel("progress")}>Progress {progress.total}/{CHALLENGES.length}</TextBtn>
          <TextBtn onClick={() => setPanel("how")}>How gears work</TextBtn>
          <TextBtn onClick={() => setPanel("help")}>Help</TextBtn>
          <TextBtn onClick={() => setPanel("settings")}>Settings</TextBtn>
        </div>
      </header>

      {/* Objective strip */}
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border bg-card/50 px-4 py-2">
        <p className="font-mono text-xs text-muted-foreground">Level {challenge.number}/{CHALLENGES.length}</p>
        <h2 className="font-display text-xl font-bold leading-none">{challenge.title}</h2>
        <p className="min-w-0 flex-1 text-sm">{challenge.objective}</p>
        <p className="font-mono text-xs text-brass">Goal: {goalText(challenge.goal)}</p>
      </div>

      <main id="steam-stage" className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Stage */}
        <section className="flex min-h-0 min-w-0 flex-col gap-2">
          <div id="bench" className="bench relative min-h-[260px] flex-1 overflow-hidden rounded-md border border-border lg:min-h-0">
            <Workbench
              challenge={challenge}
              placements={state.placements}
              solution={solution}
              held={state.held}
              hoverSocket={hoverSocket}
              running={running}
              rpm={rpm}
              reducedMotion={reducedMotion}
              resetKey={resetKey}
              onSocketKey={(id) => {
                if (state.held) dispatch({ type: "drop", socketId: id });
                else if (state.placements[id]) dispatch({ type: "pick", partId: state.placements[id] });
              }}
              onSocketFocus={(id) => setHoverSocket(id)}
            />
          </div>
          <div
            className={`flex shrink-0 items-center gap-3 rounded-md border px-3 py-2 text-sm ${
              statusTone === "warning" ? "border-warning text-warning" : statusTone === "success" ? "border-success text-success" : "border-border"
            }`}
            role="status"
            aria-live="polite"
          >
            <strong className="font-mono text-xs uppercase">{statusTone === "warning" ? "Warning" : met ? "Goal met" : "Next"}</strong>
            <span className="min-w-0 flex-1">{feedbackText}</span>
            {met && !success && !attemptFinished.current && (
              <span className="flex shrink-0 items-center gap-2 font-mono text-xs">
                {rpm > 0 ? (
                  <>
                    <span className="h-1.5 w-16 overflow-hidden rounded bg-muted">
                      <span className="block h-full bg-success" style={{ width: `${holdProgress * 100}%` }} />
                    </span>
                    running
                  </>
                ) : (
                  "needs steam"
                )}
              </span>
            )}
          </div>
          <p className="hidden shrink-0 text-xs text-muted-foreground lg:block">
            {cameraOn
              ? "Move to aim · Pinch to grab · Release to place"
              : "Drag a gear onto a socket, or tap a gear then a socket. Keyboard: Tab to a gear, Enter, Tab to a socket, Enter. Esc cancels."}
          </p>
        </section>

        {/* Utility rail */}
        <aside className="utility-rail flex min-h-0 flex-col gap-2 lg:overflow-y-auto">
          {/* Hand control */}
          <section className="rail-section p-3" aria-label="Hand control">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${handFailed ? "bg-destructive" : cameraOn && hand.status !== "lost" ? "bg-success" : cameraOn ? "bg-warning" : "bg-muted-foreground"}`}
              />
              <p className="min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite" title={handLine ?? undefined}>
                {handFailed ? HAND_LABEL[hand.status] : (handLine ?? "Hand control off")}
              </p>
              <TextBtn onClick={() => setPanel("guide")}>Hand guide</TextBtn>
            </div>
            {cameraOn && !handFailed && (
              <div className="mt-2 flex items-start gap-2">
                <div className={`relative overflow-hidden rounded border border-border bg-background ${previewOpen ? "w-24" : "hidden"}`}>
                  <video ref={videoRef} className="block aspect-[4/3] w-full -scale-x-100 object-cover" muted playsInline />
                  <canvas ref={canvasRef} width={320} height={240} className="pointer-events-none absolute inset-0 h-full w-full" />
                  {(hand.status === "requesting" || hand.status === "loading") && (
                    <p className="absolute inset-0 flex items-center justify-center bg-background/80 p-2 text-center text-[11px]">{hand.status === "loading" ? "Loading model…" : "Allow camera…"}</p>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-background/80 px-1 font-mono text-[10px]">{["detected", "pinching", "searching", "lost"].includes(hand.status) ? "LIVE" : ""}</span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Btn small onClick={() => setCamera(false)}>Camera off</Btn>
                  <Btn small onClick={() => setPreviewOpen((o) => !o)}>{previewOpen ? "Hide preview" : "Show preview"}</Btn>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> Landmarks
                  </label>
                </div>
              </div>
            )}
            {!cameraOn && !hand.error && (
              <div className="mt-2">
                <Btn small onClick={() => setCameraConsent(true)}>Enable hand control</Btn>
              </div>
            )}
            {hand.error && (
              <div className="mt-2 text-sm" role="alert">
                <p className="text-muted-foreground">{hand.error}</p>
                <div className="mt-2 flex gap-2">
                  <Btn small onClick={() => { setCamera(false); setTimeout(() => setCamera(true), 50); }}>Retry</Btn>
                  <Btn small onClick={() => setCamera(false)}>Use mouse</Btn>
                </div>
              </div>
            )}
          </section>

          {/* Parts */}
          <section className="rail-section p-3" data-tray aria-label="Parts tray">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Parts</h3>
              {heldPart ? (
                <span className="font-mono text-xs text-primary">Holding {heldPart.teeth}T</span>
              ) : (
                <span className="text-xs text-muted-foreground">Drag back here to remove</span>
              )}
            </div>
            <ul className={`grid gap-1.5 ${cameraOn ? "grid-cols-5" : "grid-cols-4"}`}>
              {challenge.tray.map((p) => {
                const placed = placedIds.has(p.id);
                const isHeld = state.held === p.id;
                return (
                  <li key={p.id}>
                    <Button variant="outline"
                      data-part={p.id}
                      aria-pressed={isHeld}
                      title={p.note}
                      aria-label={`${p.teeth}-tooth gear. ${p.note}${placed ? " Placed on bench." : ""}${isHeld ? " Held." : ""}`}
                      onClick={(e) => {
                        if (e.detail === 0) dispatch(isHeld ? { type: "cancel" } : { type: "pick", partId: p.id });
                      }}
                      style={{ touchAction: "none" }}
                      className={`tray-part flex h-auto w-full flex-col items-center gap-0 rounded-md border p-1.5 transition-colors [&_svg]:size-auto ${
                        isHeld ? "border-primary bg-accent" : placed ? "border-dashed border-border opacity-45" : "border-border hover:bg-accent"
                      }`}
                    >
                      <svg viewBox={`${-pitchRadius(p.teeth) - 10} ${-pitchRadius(p.teeth) - 10} ${2 * (pitchRadius(p.teeth) + 10)} ${2 * (pitchRadius(p.teeth) + 10)}`} className="h-11 w-11 cursor-grab" aria-hidden>
                        <g>
                          <GearShape teeth={p.teeth} tone="brass" />
                        </g>
                      </svg>
                      <span className="font-mono text-xs">{p.teeth}T</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex min-h-8 gap-2">
              {heldPart && <>
                {placedIds.has(heldPart.id) && <Btn small onClick={() => dispatch({ type: "returnToTray" })}>Return to tray</Btn>}
                <Btn small onClick={() => dispatch({ type: "cancel" })}>Cancel (Esc)</Btn>
              </>}
            </div>
          </section>

          {/* Operate */}
          <section className="rail-section flex flex-col gap-2 p-3" aria-label="Operate">
            <div className="flex items-center gap-2">
              <Btn primary onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Start"}</Btn>
              <label className="flex flex-1 flex-col text-xs text-muted-foreground">
                <span className="flex justify-between">
                  <span>Steam</span>
                  <span className="font-mono text-foreground">{steam}%</span>
                </span>
                <input type="range" min={0} max={100} value={steam} onChange={(e) => setSteam(Number(e.target.value))} aria-label="Steam input" className="w-full accent-primary" />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Btn small onClick={requestResetLevel}>Reset level</Btn>
              <Btn small onClick={() => setHintStep((n) => Math.min(2, n + 1))}>Hint {Math.min(2, hintStep + 1)}</Btn>
              <Btn small onClick={() => { clearTransient(); dispatch({ type: "showSolution" }); }}>Show solution</Btn>
            </div>
          </section>

          {/* Telemetry */}
          <section className="rail-section p-3" aria-label="Telemetry">
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Input</dt>
              <dd className="text-right font-mono">{rpm.toFixed(1)} RPM ↻</dd>
              <dt className="text-muted-foreground">Output</dt>
              <dd className="text-right font-mono">
                {outRpm.toFixed(1)} RPM {solution.outputDirection === "cw" ? "↻" : solution.outputDirection === "ccw" ? "↺" : ""}
              </dd>
              <dt className="text-muted-foreground">Direction</dt>
              <dd className="text-right font-mono">{solution.outputDirection === "cw" ? "Clockwise" : solution.outputDirection === "ccw" ? "Counter-clockwise" : "Stopped"}</dd>
              <dt className="text-muted-foreground" title="Output speed divided by input speed">Speed ratio (out ÷ in)</dt>
              <dd className="text-right font-mono">{solution.ratio !== null && outTeeth ? `${challenge.input.teeth}÷${outTeeth} = ${solution.ratio.toFixed(2)}` : "—"}</dd>
              <dt className="text-muted-foreground">Link</dt>
              <dd className={`text-right font-mono ${solution.outputConnected ? "text-success" : "text-warning"}`}>{solution.jammed ? "Jammed" : solution.outputConnected ? "Connected" : "Open"}</dd>
            </dl>
            <p className="mt-1.5 text-xs text-muted-foreground">{challenge.concept}</p>
          </section>
        </aside>
      </main>

      {/* Drag ghost */}
      <div ref={ghostRef} className="pointer-events-none fixed left-0 top-0 z-40" aria-hidden>
        {heldPart && drag.current && (
          <svg viewBox="-90 -90 180 180" className="-ml-10 -mt-10 h-20 w-20 opacity-80">
            <GearShape teeth={heldPart.teeth} tone="brass" />
          </svg>
        )}
      </div>
      {/* Hand cursor: the same point used for hit-testing */}
      {cameraOn && (
        <div ref={handCursorRef} className="pointer-events-none fixed left-0 top-0 z-50 opacity-0 [&[data-pinch='1']>div]:scale-75 [&[data-pinch='1']>div]:bg-primary/40" aria-hidden>
          <div className="-ml-5 -mt-5 h-10 w-10 rounded-full border-4 border-primary transition-transform" />
        </div>
      )}

      {/* Overlays */}
      {showWelcome && (
        <Modal label="Welcome" onClose={() => closeWelcome(false)}>
          <h2 className="font-display text-4xl font-black leading-none text-brass">Build a machine. Power it with steam.</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Seven short levels about meshing, direction and speed ratio. Place gears to connect the steam-driven input to the output wheel. Hand control with your camera is optional.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Btn primary onClick={() => closeWelcome(false)}>Start with mouse or touch</Btn>
            <Btn onClick={() => closeWelcome(true)}>Enable hand control</Btn>
          </div>
        </Modal>
      )}
      {cameraConsent && (
        <Modal label="Enable hand control" onClose={() => setCameraConsent(false)}>
          <h2 className="font-display text-3xl font-bold">Enable hand control</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Camera frames are processed in this browser tab. They are not uploaded or recorded.</li>
            <li>The hand-tracking runtime and model (about 8&nbsp;MB) are downloaded from jsDelivr and Google the first time.</li>
            <li>Move to aim, pinch thumb and index to grab, open to release.</li>
          </ul>
          <div className="mt-5 flex gap-2">
            <Btn primary onClick={() => { setCameraConsent(false); setCamera(true); }}>Allow camera</Btn>
            <Btn onClick={() => setCameraConsent(false)}>Not now</Btn>
          </div>
        </Modal>
      )}
      {confirm === "resetLevel" && (
        <Modal label="Reset this level?" onClose={() => setConfirm(null)} small>
          <h2 className="text-lg font-semibold">Reset this level?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Placed parts and this attempt will be cleared. Other levels and settings are kept.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Btn onClick={() => setConfirm(null)}>Cancel</Btn>
            <Btn primary onClick={doResetLevel}>Reset level</Btn>
          </div>
        </Modal>
      )}
      {confirm === "resetAll" && (
        <Modal label="Reset all progress?" onClose={() => setConfirm(null)} small>
          <h2 className="text-lg font-semibold">Reset all progress?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Completion marks and saved gear placements for all seven levels will be erased. Settings are kept.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Btn onClick={() => setConfirm(null)}>Cancel</Btn>
            <Btn danger onClick={doResetAll}>Reset all progress</Btn>
          </div>
        </Modal>
      )}
      {success && (
        <Modal label={progress.complete ? "Workshop complete" : isLast ? "Masterwork complete" : "Level complete"} onClose={() => setSuccess(null)}>
          <div className="success-in">
            <p className="font-mono text-xs uppercase text-success">{success.assisted ? "Completed with teaching aid" : `Level ${challenge.number} complete`}</p>
            <h2 className="font-display text-4xl font-black text-brass">{progress.complete ? "Workshop complete." : isLast ? "The Masterwork runs." : "The machine runs."}</h2>
            <p className="mt-2 font-mono text-sm">
              Output {solution.outputDirection === "cw" ? "clockwise" : "counter-clockwise"} · ratio {solution.ratio?.toFixed(2)} · {outRpm.toFixed(1)} RPM
            </p>
            <p className="mt-3 text-sm text-muted-foreground">{challenge.successExplanation}</p>
            <p className="mt-3 text-sm text-success">{progress.total}/7 complete · {progress.independent} independently · {progress.assisted} with solution</p>
            {progress.complete && <p className="mt-2 text-sm">You brought the workshop to life.</p>}
            {isLast && !progress.complete && <p className="mt-2 text-sm text-muted-foreground">Masterwork complete. Other levels still await your machines.</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <Btn onClick={() => setSuccess(null)}>Keep experimenting</Btn>
              <Btn onClick={doResetLevel}>Replay level</Btn>
              <Btn onClick={() => { setSuccess(null); setPanel("progress"); }}>Explore the levels</Btn>
              {nextChallenge && <Btn primary onClick={() => switchChallenge(nextChallenge.id)}>Next level</Btn>}
            </div>
          </div>
        </Modal>
      )}
      {panel === "progress" && (
        <Modal label="Workshop progress" onClose={() => setPanel(null)}>
          <h2 className="font-display text-3xl font-bold text-brass">Workshop progress</h2>
          <p className="mt-2 font-mono text-xs">{progress.total}/7 complete · {progress.independent} independently · {progress.assisted} with solution</p>
          <ol className="mt-3 divide-y divide-border">
            {CHALLENGES.map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-2">
                <span className="pt-1 font-mono text-brass">{c.number}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{c.title}</h3>
                  <p className="text-xs text-muted-foreground">{c.concept}</p>
                  <p className={`mt-1 text-xs ${saved.completed[c.id] ? "text-success" : "text-muted-foreground"}`}>{completionLabel(saved.completed[c.id])}</p>
                </div>
                <Btn small onClick={() => switchChallenge(c.id, !!saved.completed[c.id])}>{saved.completed[c.id] ? "Replay" : "Play"}</Btn>
              </li>
            ))}
          </ol>
          <div className="mt-3"><Btn primary onClick={() => setPanel(null)}>Return to workbench</Btn></div>
        </Modal>
      )}
      {panel === "guide" && (
        <Modal label="Hand guide" onClose={() => setPanel(null)}>
          <h2 className="font-display text-3xl font-bold">Hand guide</h2>
          <p className="text-sm text-muted-foreground">Move to aim · Pinch to grab · Release to place</p>
          <HandGuideContent />
          <div className="mt-4"><Btn primary onClick={() => setPanel(null)}>Got it</Btn></div>
        </Modal>
      )}
      {panel === "help" && (
        <Modal label="Help" onClose={() => setPanel(null)}>
          <h2 className="font-display text-3xl font-bold">Controls</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><b>Mouse:</b> drag a gear to a socket, or click a gear then click a socket. Drag a placed gear back to the parts tray to remove it.</li>
            <li><b>Touch:</b> tap a gear, then tap a socket.</li>
            <li><b>Keyboard:</b> Tab to a gear, press Enter; Tab to a socket, press Enter. Enter on a filled socket picks its gear up. Esc cancels.</li>
            <li><b>Hand:</b> move to aim the ring, pinch to grab or press a button, release near a socket to place. Losing your hand returns the gear.</li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Invalid placements never lose a gear; it goes back where it was.</p>
          <h3 className="mt-4 font-semibold">About and privacy</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>A simplified educational simulation of ideal spur gears on fixed sockets. Not an engineering tool.</li>
            <li>The camera is optional and only starts after you allow it. Frames are processed in this tab and are never recorded or uploaded.</li>
            <li>The hand-tracking runtime and model are downloaded from jsDelivr and Google Cloud Storage on first use.</li>
            <li>Progress and settings are stored in this browser only. Clear them with Settings → Reset all progress, or by clearing site data.</li>
          </ul>
          <div className="mt-4"><Btn onClick={() => setPanel(null)}>Close</Btn></div>
        </Modal>
      )}
      {panel === "how" && (
        <Modal label="How gears work" onClose={() => setPanel(null)}>
          <h2 className="font-display text-3xl font-bold">How gears transmit motion</h2>
          <svg viewBox="0 0 300 90" className="mt-3 w-full" aria-hidden>
            {[{ x: 50, r: 36, d: "↻" }, { x: 136, r: 50, d: "↺" }, { x: 236, r: 50, d: "↻" }].map((g, i) => (
              <g key={i}>
                <circle cx={g.x} cy={45} r={g.r - 6} fill="none" stroke="var(--brass)" strokeWidth={3} />
                <text x={g.x} y={52} textAnchor="middle" fontSize={22} className="fill-ivory">{g.d}</text>
              </g>
            ))}
          </svg>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Meshed gears turn in opposite directions.</li>
            <li>Speed scales by tooth count: driven speed = driver speed × driver teeth ÷ driven teeth.</li>
            <li>Idlers flip direction but cancel out in the ratio. Only input teeth ÷ output teeth matter.</li>
            <li>Speed ratio here always means output speed ÷ input speed. Below 1 is slower with more turning force; above 1 is faster with less.</li>
            <li>A gap anywhere in the chain means no motion beyond it.</li>
          </ul>
          <div className="mt-4"><Btn onClick={() => setPanel(null)}>Close</Btn></div>
        </Modal>
      )}
      {panel === "settings" && (
        <Modal label="Settings" onClose={() => setPanel(null)}>
          <h2 className="font-display text-3xl font-bold">Settings</h2>
          <h3 className="mt-3 text-sm font-semibold">Hand control</h3>
          <label className="mt-2 block text-sm">
            Pinch sensitivity <span className="font-mono text-xs text-muted-foreground">{saved.settings.sensitivity.toFixed(2)}</span>
            <span className="block text-xs text-muted-foreground">Higher accepts a looser pinch.</span>
            <input
              type="range" min={0.5} max={1.5} step={0.05} value={saved.settings.sensitivity}
              onChange={(e) => setSaved((s) => ({ ...s, settings: { ...s.settings, sensitivity: Number(e.target.value) } }))}
              className="mt-1 w-full accent-primary"
            />
          </label>
          <label className="mt-2 block text-sm">
            Cursor smoothing <span className="font-mono text-xs text-muted-foreground">{saved.settings.smoothing.toFixed(2)}</span>
            <span className="block text-xs text-muted-foreground">Higher is calmer but trails your hand more.</span>
            <input
              type="range" min={0} max={1} step={0.05} value={saved.settings.smoothing}
              onChange={(e) => setSaved((s) => ({ ...s, settings: { ...s.settings, smoothing: Number(e.target.value) } }))}
              className="mt-1 w-full accent-primary"
            />
          </label>
          <div className="mt-2"><Btn small onClick={() => setSaved((s) => ({ ...s, settings: { ...s.settings, ...HAND_DEFAULTS } }))}>Restore hand-control defaults</Btn></div>
          <h3 className="mt-4 text-sm font-semibold">Display</h3>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reducedMotion} onChange={(e) => setSaved((s) => ({ ...s, settings: { ...s.settings, reducedMotion: e.target.checked } }))} />
            Reduced motion (no steam puffs or transitions)
          </label>
          <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
            <Btn danger small onClick={() => { setPanel(null); setConfirm("resetAll"); }}>Reset all progress</Btn>
            <Btn primary onClick={() => setPanel(null)}>Done</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Btn({ children, onClick, primary, danger, small }: { children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean; small?: boolean }) {
  return <Button onClick={onClick} variant={danger ? "destructive" : primary ? "default" : "secondary"} size={small ? "sm" : "default"} className={small ? "px-2.5" : ""}>{children}</Button>;
}

function TextBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <Button variant="ghost" size="sm" onClick={onClick} className="px-2 text-muted-foreground">{children}</Button>;
}

function NavBtn({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="h-8 w-8 text-muted-foreground">{children}</Button>;
}

function Modal({ children, label, onClose, small }: { children: React.ReactNode; label: string; onClose?: () => void; small?: boolean }) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-30 bg-background/75" />
        <DialogPrimitive.Content aria-describedby={undefined} className={`panel fixed left-1/2 top-1/2 z-30 max-h-[90dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto ${small ? "max-w-sm p-5" : "max-w-lg p-6"}`}>
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
