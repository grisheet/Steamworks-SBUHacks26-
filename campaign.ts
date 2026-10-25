import { CHALLENGES, SUCCESS_HOLD_SECONDS } from "./config";
import type { SavedState } from "./persistence";

export function recordCompletion(completed: SavedState["completed"], id: string, assisted: boolean): SavedState["completed"] {
  if (!CHALLENGES.some((c) => c.id === id)) return completed;
  return { ...completed, [id]: completed[id] === "solved" || !assisted ? "solved" : "assisted" };
}

export function campaignProgress(completed: SavedState["completed"]) {
  const independent = CHALLENGES.filter((c) => completed[c.id] === "solved").length;
  const assisted = CHALLENGES.filter((c) => completed[c.id] === "assisted").length;
  return { independent, assisted, total: independent + assisted, complete: independent + assisted === CHALLENGES.length };
}

export function adjacentLevels(id: string) {
  const index = CHALLENGES.findIndex((c) => c.id === id);
  return { previous: CHALLENGES[index - 1], next: index < 0 ? undefined : CHALLENGES[index + 1] };
}

/** Continuous valid operation only; callers reset this on attempt or level changes. */
export function advanceHold(elapsed: number, eligible: boolean, seconds: number) {
  return eligible ? Math.min(SUCCESS_HOLD_SECONDS, elapsed + Math.max(0, seconds)) : 0;
}

export const completionLabel = (value: "solved" | "assisted" | undefined) =>
  value === "solved" ? "Completed independently" : value === "assisted" ? "Completed with solution" : "Not completed";