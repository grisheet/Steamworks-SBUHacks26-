import { describe, expect, it } from "vitest";
import { CHALLENGES, getChallenge } from "./config";
import { canPlace, goalMet, outputRpm, place, solve } from "./mechanics";
import { initialInteraction, interactionReducer } from "./interaction";

const ch = (id: string) => getChallenge(id);

describe("seven levels", () => {
  it("there are exactly seven levels with unique ids", () => {
    expect(CHALLENGES).toHaveLength(7);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(7);
  });

  it("every authored solution is placeable one part at a time and passes the evaluator", () => {
    for (const c of CHALLENGES) {
      let p = {};
      for (const [socket, part] of Object.entries(c.solution)) {
        const r = place(c, p, part, socket);
        expect(r.result.ok, `${c.id} ${part}->${socket}`).toBe(true);
        p = r.placements;
      }
      expect(goalMet(c, solve(c, p)), c.id).toBe(true);
    }
  });

  it("every level starts incomplete", () => {
    for (const c of CHALLENGES) expect(goalMet(c, solve(c, {})), c.id).toBe(false);
  });

  it("level 3: upper route (2 meshes) turns clockwise and is rejected", () => {
    const s = solve(ch("c3"), { t1: "g32" });
    expect(s.outputDirection).toBe("cw");
    expect(goalMet(ch("c3"), s)).toBe(false);
    expect(solve(ch("c3"), ch("c3").solution).outputDirection).toBe("ccw");
  });

  it("level 3: upper and lower routes cannot both be built", () => {
    expect(canPlace(ch("c3"), { b1: "g16" }, "g32", "t1").ok).toBe(false);
  });

  it("level 4: ratio is 16/32 = 0.5 and output rpm is half of input rpm", () => {
    const s = solve(ch("c4"), { a: "g24", out: "g32" });
    expect(s.ratio).toBeCloseTo(0.5, 9);
    expect(outputRpm(s, 30)).toBeCloseTo(15, 9);
    expect(outputRpm(s, 0)).toBe(0);
  });

  it("level 4: a wrong output gear does not connect", () => {
    expect(solve(ch("c4"), { a: "g24", out: "g12" }).outputConnected).toBe(false);
    expect(canPlace(ch("c4"), { a: "g24" }, "g40", "out").ok).toBe(false);
  });

  it("level 5 removes the upper route while preserving the lower solution", () => {
    expect(ch("c5").sockets.map((s) => s.id)).toEqual(["b1", "b2", "out"]);
    const s = solve(ch("c5"), ch("c5").solution);
    expect(s.ratio).toBeCloseTo(2, 9);
    expect(s.outputDirection).toBe("ccw");
    expect(goalMet(ch("c5"), s)).toBe(true);
  });

  it("level 5: wrong output gear cannot complete", () => {
    expect(goalMet(ch("c5"), solve(ch("c5"), { b1: "g12", b2: "g20", out: "g24" }))).toBe(false);
  });

  it("changing steam never changes the ratio", () => {
    const s = solve(ch("c5"), ch("c5").solution);
    expect(outputRpm(s, 10) / 10).toBeCloseTo(outputRpm(s, 50) / 50, 9);
  });
});

describe("reset level", () => {
  it("reset clears placements, held gear, feedback and assisted flag", () => {
    const r = interactionReducer(ch("c3"));
    let s = r(initialInteraction(), { type: "showSolution" });
    s = r(s, { type: "pick", partId: "g20" });
    expect(s.held).toBe("g20");
    s = r(s, { type: "reset" });
    expect(s.placements).toEqual({});
    expect(s.held).toBeNull();
    expect(s.feedback).toBeNull();
    expect(s.assisted).toBe(false);
  });
});
