import { describe, expect, it } from "vitest";
import { CHALLENGES, getChallenge } from "./config";
import { adjacentLevels, advanceHold, campaignProgress, recordCompletion } from "./campaign";
import { goalMet, outputRpm, outputWheelMotion, place, solve } from "./mechanics";
import { initialInteraction, interactionReducer } from "./interaction";
import { parseSaved } from "./persistence";

const expected = [
  ["c1", 1.2, "ccw"], ["c2", 1.2, "cw"], ["c3", 1.2, "ccw"],
  ["c4", 0.5, "cw"], ["c5", 2, "ccw"], ["c6", 1.5, "cw"], ["c7", 2, "ccw"],
] as const;

describe.each(expected)("authored %s", (id, ratio, direction) => {
  const c = getChallenge(id);
  const reducer = interactionReducer(c);
  it("starts incomplete", () => expect(goalMet(c, solve(c, {}))).toBe(false));
  it("places every solution gear through the same placement rules", () => {
    let placements = {};
    for (const [socket, part] of Object.entries(c.solution)) {
      const next = place(c, placements, part, socket);
      expect(next.result.ok).toBe(true);
      placements = next.placements;
    }
    expect(goalMet(c, solve(c, placements))).toBe(true);
  });
  it("has the intended direction", () => expect(solve(c, c.solution).outputDirection).toBe(direction));
  it("has the intended endpoint ratio", () => expect(solve(c, c.solution).ratio).toBeCloseTo(ratio, 9));
  it("removing any required connection fails", () => {
    for (const socket of Object.keys(c.solution)) {
      const incomplete = { ...c.solution };
      delete incomplete[socket];
      expect(goalMet(c, solve(c, incomplete))).toBe(false);
    }
  });
  it("reset restores an empty unassisted attempt", () => {
    const state = reducer(reducer(initialInteraction(), { type: "showSolution" }), { type: "reset" });
    expect(state.placements).toEqual({});
    expect(state.held).toBeNull();
    expect(state.assisted).toBe(false);
    expect(goalMet(c, solve(c, state.placements))).toBe(false);
  });
  it("show solution uses the actual evaluator and is assisted", () => {
    const state = reducer(initialInteraction(), { type: "showSolution" });
    expect(state.assisted).toBe(true);
    expect(goalMet(c, solve(c, state.placements))).toBe(true);
  });
  it("zero input produces zero output", () => expect(outputRpm(solve(c, c.solution), 0)).toBe(0));
  it("equal open-belt pulleys preserve output speed and direction", () => {
    const s = solve(c, c.solution);
    expect(outputWheelMotion(s)?.k).toBeCloseTo(direction === "cw" ? ratio : -ratio, 9);
    expect(outputWheelMotion(solve(c, {}))).toBeUndefined();
  });
});

describe("advanced wrong routes", () => {
  it("level 6 lower route is placeable but has wrong counter-clockwise direction", () => {
    const c = getChallenge("c6");
    let p = {};
    for (const [s, g] of Object.entries({ b1: "g28", b2: "g20", out: "out16" })) {
      const next = place(c, p, g, s);
      expect(next.result.ok).toBe(true);
      p = next.placements;
    }
    expect(solve(c, p).ratio).toBeCloseTo(1.5, 9);
    expect(solve(c, p).outputDirection).toBe("ccw");
    expect(goalMet(c, solve(c, p))).toBe(false);
  });
  it("Masterwork lower route is placeable but clockwise", () => {
    const c = getChallenge("c7");
    let p = {};
    for (const [s, g] of Object.entries({ b1: "g28", b2: "spare16", b3: "spare24", out: "out16" })) {
      const next = place(c, p, g, s);
      expect(next.result.ok).toBe(true);
      p = next.placements;
    }
    expect(solve(c, p).ratio).toBeCloseTo(2, 9);
    expect(solve(c, p).outputDirection).toBe("cw");
    expect(goalMet(c, solve(c, p))).toBe(false);
  });
  it("Masterwork both routes lock rather than falsely complete", () => {
    const c = getChallenge("c7");
    const s = solve(c, { ...c.solution, b1: "g28", b2: "spare16", b3: "spare24" });
    expect(s.jammed).toBe(true);
    expect(goalMet(c, s)).toBe(false);
  });
  it("overlapping gears cannot pass the evaluator", () => {
    const c = getChallenge("c1");
    expect(goalMet(c, solve(c, { s1: "g32", s2: "g24" }))).toBe(false);
  });
});

describe("history and migration", () => {
  it("migrates five-level history, settings and compatible attempts", () => {
    const old = { version: 1, challengeId: "c4", completed: { c1: "solved", c2: "assisted", c5: "solved" }, placements: { c1: { s1: "g16" }, c5: { t1: "g24", out: "g16" } }, settings: { sensitivity: 1.25, smoothing: 0.7 }, seenHandGuide: true };
    const migrated = parseSaved(JSON.stringify(old));
    expect(migrated.version).toBe(2);
    expect(migrated.challengeId).toBe("c4");
    expect(migrated.completed).toEqual(old.completed);
    expect(migrated.placements["c1"]).toEqual({ s1: "g16" });
    expect(migrated.placements["c5"]).toEqual({});
    expect(migrated.settings.sensitivity).toBe(1.25);
    expect(migrated.settings.smoothing).toBe(0.7);
    expect(migrated.seenHandGuide).toBe(true);
    expect(migrated.completed["c6"]).toBeUndefined();
  });
  it("keeps a compatible legacy level 5 solution", () => {
    expect(parseSaved(JSON.stringify({ version: 1, placements: { c5: getChallenge("c5").solution } })).placements["c5"]).toEqual(getChallenge("c5").solution);
  });
  it("rejects saved colliding parts", () => {
    expect(parseSaved(JSON.stringify({ version: 2, placements: { c1: { s1: "g32", s2: "bad" } } })).placements["c1"]).toEqual({});
  });
  it("restores assistance for unfinished attempts", () => {
    const saved = parseSaved(JSON.stringify({ version: 2, placements: { c6: getChallenge("c6").solution }, assistedAttempts: { c6: true } }));
    const state = interactionReducer(getChallenge("c6"))(initialInteraction(), { type: "reset", placements: saved.placements["c6"] ?? {}, assisted: saved.assistedAttempts["c6"] ?? false });
    expect(state.assisted).toBe(true);
  });
  it("does not downgrade independent completion after viewing a solution", () => {
    expect(recordCompletion({ c1: "solved" }, "c1", true)).toEqual({ c1: "solved" });
  });
  it("reset does not erase historical completion", () => {
    const saved = parseSaved(JSON.stringify({ version: 2, completed: { c7: "solved" } }));
    interactionReducer(getChallenge("c7"))(initialInteraction(getChallenge("c7").solution), { type: "reset" });
    expect(saved.completed["c7"]).toBe("solved");
  });
  it("level 7 alone does not finish the workshop", () => expect(campaignProgress({ c7: "solved" }).complete).toBe(false));
  it("all seven finish the workshop with honest counts", () => {
    const completed = Object.fromEntries(CHALLENGES.map((c) => [c.id, c.id === "c7" ? "assisted" : "solved"])) as Record<string, "solved" | "assisted">;
    expect(campaignProgress(completed)).toEqual({ independent: 6, assisted: 1, total: 7, complete: true });
  });
  it("navigation has bounds at 1 and 7", () => {
    expect(adjacentLevels("c1").previous).toBeUndefined();
    expect(adjacentLevels("c1").next?.id).toBe("c2");
    expect(adjacentLevels("c7").next).toBeUndefined();
    expect(adjacentLevels("c7").previous?.id).toBe("c6");
  });
  it("pausing resets the stable running interval", () => {
    expect(advanceHold(1.9, false, 0.1)).toBe(0);
    expect(advanceHold(0, true, 1.9)).toBe(1.9);
    expect(advanceHold(1.9, true, 0.1)).toBe(2);
  });
});