// Shared interaction state machine used by mouse, touch, keyboard and hand input.
// idle -> held (selected/grabbed) -> placed | canceled
import type { Challenge } from "./config";
import { place, removePart, type Placements } from "./mechanics";

export interface Feedback {
  tone: "info" | "success" | "warning";
  text: string;
}

export interface InteractionState {
  placements: Placements;
  held: string | null; // partId being held
  feedback: Feedback | null;
  assisted: boolean; // "Show solution" used since last reset
}

export type Action =
  | { type: "pick"; partId: string }
  | { type: "drop"; socketId: string }
  | { type: "cancel"; silent?: boolean }
  | { type: "returnToTray"; partId?: string }
  | { type: "reset"; placements?: Placements; assisted?: boolean }
  | { type: "showSolution" }
  | { type: "feedback"; feedback: Feedback | null };

export const initialInteraction = (placements: Placements = {}): InteractionState => ({
  placements,
  held: null,
  feedback: null,
  assisted: false,
});

export function interactionReducer(ch: Challenge) {
  return (state: InteractionState, action: Action): InteractionState => {
    switch (action.type) {
      case "pick": {
        const part = ch.tray.find((p) => p.id === action.partId);
        if (!part) return state;
        return { ...state, held: part.id, feedback: { tone: "info", text: `${part.teeth}-tooth gear: ${part.note}` } };
      }
      case "drop": {
        if (!state.held) return state;
        const { placements, result } = place(ch, state.placements, state.held, action.socketId);
        if (!result.ok) return { ...state, held: null, feedback: { tone: "warning", text: result.reason + " Gear returned." } };
        return { ...state, placements, held: null, feedback: null };
      }
      case "cancel":
        if (!state.held) return state;
        return { ...state, held: null, feedback: action.silent ? state.feedback : { tone: "info", text: "Canceled — gear stays where it was." } };
      case "returnToTray": {
        const id = action.partId ?? state.held;
        if (!id) return state;
        return { ...state, placements: removePart(state.placements, id), held: null, feedback: { tone: "info", text: "Gear returned to the tray." } };
      }
      case "reset":
        return { ...initialInteraction(action.placements ?? {}), assisted: action.assisted ?? false };
      case "showSolution": {
        let placements: Placements = {};
        for (const [socket, part] of Object.entries(ch.solution)) {
          const next = place(ch, placements, part, socket);
          if (!next.result.ok) return { ...state, feedback: { tone: "warning", text: next.result.reason } };
          placements = next.placements;
        }
        return { placements, held: null, assisted: true, feedback: { tone: "info", text: "Teaching aid: the correct gears were placed for you. Completion will be marked as assisted." } };
      }
      case "feedback":
        return { ...state, feedback: action.feedback };
    }
  };
}
