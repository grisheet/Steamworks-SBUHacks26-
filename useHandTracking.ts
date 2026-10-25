import { useEffect, useRef, useState } from "react";

export type HandStatus =
  | "off"
  | "requesting"
  | "loading"
  | "searching"
  | "detected"
  | "pinching"
  | "lost"
  | "denied"
  | "unavailable"
  | "model-failed";

export interface HandCallbacks {
  /** Viewport coords; called on every inference with a hand. The same point is used for hit-testing. */
  onMove: (x: number, y: number, pinching: boolean) => void;
  onPinchStart: (x: number, y: number) => void;
  onPinchEnd: (x: number, y: number) => void;
  /** Tracking lost for longer than grace period. */
  onLost: () => void;
}

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const INFERENCE_INTERVAL_MS = 33; // ~30 Hz, independent of render rate
const LOST_GRACE_MS = 600;
const ACTIVATION_GUARD_MS = 90; // pinch must hold this long before it counts
const RELEASE_GUARD_MS = 60; // and must stay open this long before it releases
const MIN_HAND_SIZE = 0.02; // normalized; smaller = unreliable

type Landmark = { x: number; y: number; z: number };
type Tracker = { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks: Landmark[][] }; close: () => void };

/** Map a smoothing setting 0..1 to a time constant in ms (0 = snappy, 1 = calm). */
export const smoothingTau = (s: number) => 20 + s * 140;

export function useHandTracking(opts: {
  enabled: boolean;
  sensitivity: number;
  smoothing: number;
  callbacks: HandCallbacks;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  debug: boolean;
  resetToken?: number;
  blocked?: boolean;
}) {
  const [status, setStatus] = useState<HandStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(opts.callbacks);
  cb.current = opts.callbacks;
  const sens = useRef(opts.sensitivity);
  sens.current = opts.sensitivity;
  const smooth = useRef(opts.smoothing);
  smooth.current = opts.smoothing;
  const debug = useRef(opts.debug);
  debug.current = opts.debug;
  const gate = useRef({ token: opts.resetToken, blocked: opts.blocked });
  gate.current = { token: opts.resetToken, blocked: opts.blocked };

  useEffect(() => {
    if (!opts.enabled) {
      setStatus("off");
      setError(null);
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let landmarker: Tracker | null = null;
    let raf = 0;
    let lastInference = 0;
    let lastVideoTime = -1;
    let busy = false;
    let pinching = false;
    let candidateSince = 0;
    let releaseSince = 0;
    let needOpen = true; // require an open hand before the first/next pinch after (re)acquisition
    let lastSeen = 0;
    let lastFrame = 0;
    let wasLost = true;
    let sx = -1;
    let sy = -1;
    let statusNow: HandStatus = "requesting";
    let gateToken = gate.current.token;
    const set = (s: HandStatus) => {
      if (statusNow !== s) {
        statusNow = s;
        if (!cancelled) setStatus(s);
      }
    };

    setError(null);
    set("requesting");

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        set("unavailable");
        setError("This browser does not expose a camera here. If you're inside an embedded preview, open the app in its own tab.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException)?.name;
        if (name === "NotAllowedError" || name === "SecurityError") {
          set("denied");
          setError("Camera permission was denied. Allow camera access in your browser, or open the app in its own tab if this is an embedded preview.");
        } else {
          set("unavailable");
          setError("No usable camera was found, or it is in use by another app.");
        }
        return;
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());
      const video = opts.videoRef.current;
      if (!video) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      try {
        await video.play();
      } catch {
        /* autoplay quirk; frames still arrive */
      }
      if (cancelled) return;
      set("loading");
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        const create = (delegate: "GPU" | "CPU") =>
          vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: "VIDEO",
            numHands: 1, // one active hand: no switching between hands mid-grab
          });
        try {
          landmarker = (await create("GPU")) as unknown as Tracker;
        } catch {
          landmarker = (await create("CPU")) as unknown as Tracker;
        }
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop());
        if (cancelled) return;
        console.error(e);
        set("model-failed");
        setError("The hand-tracking model could not be loaded. Check your connection and try again. Mouse, touch and keyboard still work.");
        return;
      }
      if (cancelled) {
        landmarker?.close();
        return;
      }
      set("searching");

      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (gateToken !== gate.current.token || gate.current.blocked) {
          gateToken = gate.current.token;
          pinching = false;
          needOpen = true;
          candidateSince = releaseSince = 0;
        }
        const loseIfStale = () => {
          if (!wasLost && now - lastSeen > LOST_GRACE_MS) {
            wasLost = true;
            pinching = false;
            needOpen = true;
            candidateSince = releaseSince = 0;
            set("lost");
            cb.current.onLost();
          }
        };
        if (document.hidden || busy || !landmarker) { loseIfStale(); return; }
        if (now - lastInference < INFERENCE_INTERVAL_MS) return;
        if (video.readyState < 2 || video.currentTime === lastVideoTime) { loseIfStale(); return; }
        lastVideoTime = video.currentTime;
        lastInference = now;
        busy = true;
        let lm: Landmark[] | undefined;
        try {
          lm = landmarker.detectForVideo(video, now).landmarks[0];
        } catch {
          busy = false;
          loseIfStale();
          return;
        }
        busy = false;
        drawDebug(lm);
        if (!lm) {
          loseIfStale();
          return;
        }
        const thumb = lm[4];
        const index = lm[8];
        const wrist = lm[0];
        const mcp = lm[9];
        if (!thumb || !index || !wrist || !mcp) { loseIfStale(); return; }
        const handSize = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y);
        if (handSize < MIN_HAND_SIZE) { loseIfStale(); return; }

        const dt = lastFrame ? Math.min(200, now - lastFrame) : 0;
        lastFrame = now;
        if (wasLost) sx = sy = -1; // fresh start after loss, no stale trail
        lastSeen = now;
        wasLost = false;

        // Cursor = midpoint of thumb & index tips; x mirrored to match the mirrored preview.
        const mx = 1 - (thumb.x + index.x) / 2;
        const my = (thumb.y + index.y) / 2;
        // Expand the central region so users needn't reach the frame edges. Read viewport each frame (resize/zoom safe).
        const map = (v: number) => Math.min(1, Math.max(0, (v - 0.15) / 0.7));
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;
        const tx = map(mx) * vw;
        const ty = map(my) * vh;
        const alpha = dt ? 1 - Math.exp(-dt / smoothingTau(smooth.current)) : 1;
        sx = sx < 0 ? tx : sx + (tx - sx) * alpha;
        sy = sy < 0 ? ty : sy + (ty - sy) * alpha;

        // Pinch, normalized by hand size, with hysteresis + short stability windows.
        const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y) / handSize;
        const s = sens.current;
        const closeT = 0.32 * s;
        const openT = 0.5 * s;
        if (pinchDist > openT && !gate.current.blocked) needOpen = false;
        if (!pinching) {
          if (!needOpen && pinchDist < closeT) {
            if (!candidateSince) candidateSince = now;
            if (now - candidateSince >= ACTIVATION_GUARD_MS) {
              pinching = true;
              candidateSince = 0;
              cb.current.onPinchStart(sx, sy);
            }
          } else candidateSince = 0;
        } else if (pinchDist > openT) {
          if (!releaseSince) releaseSince = now;
          if (now - releaseSince >= RELEASE_GUARD_MS) {
            pinching = false;
            releaseSince = 0;
            cb.current.onPinchEnd(sx, sy);
          }
        } else releaseSince = 0;
        set(pinching ? "pinching" : "detected");
        cb.current.onMove(sx, sy, pinching);
      };
      raf = requestAnimationFrame(loop);
    })();

    function drawDebug(lm?: Landmark[]) {
      const c = opts.canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      if (!debug.current || !lm) return;
      ctx.fillStyle = "#f2b05e";
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc((1 - p.x) * c.width, p.y * c.height, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (pinching) cb.current.onLost();
      stream?.getTracks().forEach((t) => t.stop());
      const v = opts.videoRef.current;
      if (v) v.srcObject = null;
      try {
        landmarker?.close();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled]);

  return { status, error };
}
