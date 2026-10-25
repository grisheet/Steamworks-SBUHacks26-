import { describe, expect, it } from "vitest";
import { CHALLENGES, getChallenge } from "./config";
import { canPlace, goalMet, place, solve } from "./mechanics";
import { initialInteraction, interactionReducer } from "./interaction";
import { parseSaved } from "./persistence";

const c1 = getChallenge("c1")!;
const c2 = getChallenge("c2")!;

describe("mechanics", () => {
  it("endpoint ratio is input teeth / output teeth (24/20 = 1.2), idlers add no multiplier", () => {
    const s = solve(c1, { s1: "g16", s2: "g32" });
    expect(s.outputConnected).toBe(true);
    expect(s.ratio).toBeCloseTo(1.2, 9);
  });

  it("each mesh reverses direction: 3 meshes -> ccw, 2 meshes -> cw", () => {
    const s = solve(c1, { s1: "g16", s2: "g32" });
    expect(s.motion["g16"]!.k).toBeLessThan(0);
    expect(s.motion["g32"]!.k).toBeGreaterThan(0);
    expect(s.outputDirection).toBe("ccw");
    expect(solve(c2, { s1: "g24" }).outputDirection).toBe("cw");
  });

  it("disconnected output stays stopped", () => {
    const s = solve(c1, { s1: "g16" });
    expect(s.outputConnected).toBe(false);
    expect(s.motion["output"]).toBeUndefined();
    expect(s.ratio).toBeNull();
    const gap = solve(c1, { s1: "g12", s2: "g32" });
    expect(gap.motion["g12"]).toBeUndefined();
    expect(gap.outputConnected).toBe(false);
  });

  it("rejects gears that collide, accepts ones that fit", () => {
    expect(canPlace(c1, {}, "g24", "s1").ok).toBe(false);
    expect(canPlace(c1, {}, "g32", "s1").ok).toBe(false);
    expect(canPlace(c1, {}, "g16", "s1").ok).toBe(true);
  });

  it("prevents two gears in one socket and duplicate instances", () => {
    expect(canPlace(c1, { s1: "g16" }, "g12", "s1").ok).toBe(false);
    const { placements } = place(c1, { s1: "g16" }, "g16", "s2");
    expect(Object.values(placements).filter((p) => p === "g16")).toHaveLength(1);
    expect(placements["s1"]).toBeUndefined();
  });

  it("goal requires correct direction in challenge 2", () => {
    expect(goalMet(c2, solve(c2, { s1: "g24" }))).toBe(true);
    expect(goalMet(c2, solve(c2, {}))).toBe(false);
  });

  it("solutions are valid for every challenge", () => {
    for (const ch of CHALLENGES) expect(goalMet(ch, solve(ch, ch.solution))).toBe(true);
  });
});

describe("interaction", () => {
  const r = interactionReducer(c1);
  it("cancel restores the gear to its previous location", () => {
    let s = r(initialInteraction({ s1: "g16" }), { type: "pick", partId: "g16" });
    expect(s.held).toBe("g16");
    s = r(s, { type: "cancel" });
    expect(s.held).toBeNull();
    expect(s.placements["s1"]).toBe("g16");
  });
  it("invalid drop releases the hold without losing the gear", () => {
    let s = r(initialInteraction(), { type: "pick", partId: "g32" });
    s = r(s, { type: "drop", socketId: "s1" });
    expect(s.held).toBeNull();
    expect(s.placements).toEqual({});
    expect(s.feedback?.tone).toBe("warning");
  });
  it("show solution places parts and marks assisted", () => {
    const s = r(initialInteraction(), { type: "showSolution" });
    expect(s.placements).toEqual(c1.solution);
    expect(s.assisted).toBe(true);
  });
});

describe("saved state", () => {
  it("falls back safely on garbage", () => {
    expect(parseSaved("not json").challengeId).toBe("c1");
    expect(parseSaved(JSON.stringify({ version: 99 })).completed).toEqual({});
  });
  it("drops unknown sockets, parts and duplicates", () => {
    const s = parseSaved(
      JSON.stringify({ version: 1, challengeId: "c2", placements: { c1: { s1: "g16", s2: "g16", zz: "g12" } }, completed: { c1: "solved", bogus: "solved" } }),
    );
    expect(s.challengeId).toBe("c2");
    expect(s.placements["c1"]).toEqual({ s1: "g16" });
    expect(s.completed).toEqual({ c1: "solved" });
  });
});
