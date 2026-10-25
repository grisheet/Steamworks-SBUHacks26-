import { CHALLENGES } from "./config";
import { canPlace, type Placements } from "./mechanics";

export const STORAGE_KEY = "steamworks:v1";

export interface SavedState {
  version: 2;
  challengeId: string;
  placements: Record<string, Placements>;
  completed: Record<string, "solved" | "assisted">;
  assistedAttempts: Record<string, boolean>;
  settings: { sensitivity: number; smoothing: number; reducedMotion: boolean; inputMode: "pointer" | "hand" };
  seenWelcome: boolean;
  seenHandGuide: boolean;
}

export const HAND_DEFAULTS = { sensitivity: 1, smoothing: 0.5 };

export const defaultSaved = (): SavedState => ({
  version: 2,
  challengeId: CHALLENGES[0]?.id ?? "c1",
  placements: {},
  completed: {},
  assistedAttempts: {},
  settings: { ...HAND_DEFAULTS, reducedMotion: false, inputMode: "pointer" },
  seenWelcome: false,
  seenHandGuide: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { [K in "version" | "challengeId" | "placements" | "completed" | "assistedAttempts" | "settings" | "seenWelcome" | "seenHandGuide" | "smoothing" | "sensitivity" | "reducedMotion" | "inputMode"]?: any };
const isObj = (v: unknown): v is Loose => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validate untrusted JSON; drops anything that doesn't match current challenges. */
export function parseSaved(raw: string | null): SavedState {
  const d = defaultSaved();
  if (!raw) return d;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return d;
  }
  if (!isObj(data) || (data.version !== 1 && data.version !== 2)) return d;
  const out = d;
  if (typeof data.challengeId === "string" && CHALLENGES.some((c) => c.id === data.challengeId)) out.challengeId = data.challengeId;
  if (isObj(data.placements)) {
    for (const ch of CHALLENGES) {
      const p: unknown = (data.placements as Record<string, unknown>)[ch.id];
      if (!isObj(p)) continue;
      const clean: Placements = {};
      const used = new Set<string>();
      let incompatibleLegacy = false;
      for (const [s, part] of Object.entries(p)) {
        if (typeof part !== "string") continue;
        if (!ch.sockets.some((k) => k.id === s) || !ch.tray.some((t) => t.id === part) || used.has(part) || !canPlace(ch, clean, part, s).ok) {
          if (data.version === 1 && ch.id === "c5") incompatibleLegacy = true;
          continue;
        }
        used.add(part);
        clean[s] = part;
      }
      out.placements[ch.id] = incompatibleLegacy ? {} : clean;
    }
  }
  if (isObj(data.completed)) {
    for (const [k, v] of Object.entries(data.completed as Record<string, unknown>))
      if (CHALLENGES.some((c) => c.id === k) && (v === "solved" || v === "assisted")) out.completed[k] = v;
  }
  for (const ch of CHALLENGES) {
    const explicit = isObj(data.assistedAttempts) && (data.assistedAttempts as Record<string, unknown>)[ch.id] === true;
    const attempt = out.placements[ch.id] ?? {};
    // V1 didn't store assistance per attempt. Conservatively retain a solution-shaped
    // unfinished attempt as assisted rather than silently promoting it on reload.
    const legacySolution = data.version === 1 && out.completed[ch.id] !== "solved" &&
      Object.entries(ch.solution).every(([socket, part]) => attempt[socket] === part);
    out.assistedAttempts[ch.id] = explicit || !!legacySolution;
  }
  if (isObj(data.settings)) {
    const s = data.settings;
    if (typeof s.sensitivity === "number" && s.sensitivity >= 0.5 && s.sensitivity <= 1.5) out.settings.sensitivity = s.sensitivity;
    if (typeof s.smoothing === "number" && s.smoothing >= 0 && s.smoothing <= 1) out.settings.smoothing = s.smoothing;
    if (typeof s.reducedMotion === "boolean") out.settings.reducedMotion = s.reducedMotion;
    if (s.inputMode === "pointer" || s.inputMode === "hand") out.settings.inputMode = s.inputMode;
  }
  if (typeof data.seenWelcome === "boolean") out.seenWelcome = data.seenWelcome;
  if (typeof data.seenHandGuide === "boolean") out.seenHandGuide = data.seenHandGuide;
  return out;
}

export function loadSaved(): SavedState {
  if (typeof window === "undefined") return defaultSaved();
  try {
    return parseSaved(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultSaved();
  }
}

export function writeSaved(s: SavedState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — ignore */
  }
}
