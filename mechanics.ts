import { type Challenge, type Point, RATIO_TOLERANCE, pitchRadius } from "./config";

export const MESH_TOLERANCE = 1.5;

export interface GearInstance {
  id: string; // "input" | "output" | partId
  teeth: number;
  pos: Point;
  radius: number;
  socketId?: string;
}

export type Placements = Record<string, string>; // socketId -> partId

export function buildGears(ch: Challenge, placements: Placements): GearInstance[] {
  const gears: GearInstance[] = [{ ...ch.input, radius: pitchRadius(ch.input.teeth) }];
  if (!ch.outputSocket) gears.push({ ...ch.output, radius: pitchRadius(ch.output.teeth) });
  for (const s of ch.sockets) {
    const partId = placements[s.id];
    const part = ch.tray.find((p) => p.id === partId);
    if (part) gears.push({ id: part.id, teeth: part.teeth, pos: s.pos, radius: pitchRadius(part.teeth), socketId: s.id });
  }
  return gears;
}

/** Id of the gear that drives the output wheel, or null if the output shaft is empty. */
export function outputGearId(ch: Challenge, placements: Placements): string | null {
  if (!ch.outputSocket) return "output";
  return placements[ch.outputSocket] ?? null;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function meshes(a: GearInstance, b: GearInstance) {
  return Math.abs(dist(a.pos, b.pos) - (a.radius + b.radius)) <= MESH_TOLERANCE;
}
export function collides(a: GearInstance, b: GearInstance) {
  return dist(a.pos, b.pos) < a.radius + b.radius - MESH_TOLERANCE;
}

export type PlaceResult = { ok: true } | { ok: false; reason: string };

export function canPlace(ch: Challenge, placements: Placements, partId: string, socketId: string): PlaceResult {
  const socket = ch.sockets.find((s) => s.id === socketId);
  const part = ch.tray.find((p) => p.id === partId);
  if (!socket) return { ok: false, reason: "That is not a socket." };
  if (!part) return { ok: false, reason: "Unknown part." };
  const occupant = placements[socketId];
  if (occupant && occupant !== partId) return { ok: false, reason: `${socket.label} is already occupied.` };
  const without: Placements = {};
  for (const [s, p] of Object.entries(placements)) if (p !== partId && s !== socketId) without[s] = p;
  const others = buildGears(ch, without);
  const candidate: GearInstance = { id: part.id, teeth: part.teeth, pos: socket.pos, radius: pitchRadius(part.teeth) };
  const hit = others.find((g) => collides(candidate, g));
  if (hit) {
    const name = hit.id === "input" ? "the input gear" : hit.id === "output" ? "the output gear" : `the ${hit.teeth}-tooth gear`;
    return { ok: false, reason: `A ${part.teeth}-tooth gear is too large for ${socket.label}: it would collide with ${name}.` };
  }
  return { ok: true };
}

export function place(ch: Challenge, placements: Placements, partId: string, socketId: string): { placements: Placements; result: PlaceResult } {
  const result = canPlace(ch, placements, partId, socketId);
  if (!result.ok) return { placements, result };
  const next: Placements = {};
  for (const [s, p] of Object.entries(placements)) if (p !== partId) next[s] = p;
  next[socketId] = partId;
  return { placements: next, result };
}

export function removePart(placements: Placements, partId: string): Placements {
  const next: Placements = {};
  for (const [s, p] of Object.entries(placements)) if (p !== partId) next[s] = p;
  return next;
}

export interface GearMotion {
  /** Speed multiplier relative to input (signed; + = clockwise like input). */
  k: number;
  /** Initial angle (radians) so teeth interleave. */
  phase: number;
}

export interface Solution {
  gears: GearInstance[];
  motion: Record<string, GearMotion>; // only connected gears
  jammed: boolean;
  outputId: string | null;
  outputConnected: boolean;
  ratio: number | null; // output speed / input speed magnitude
  outputDirection: "cw" | "ccw" | null; // given input turning clockwise
  meshPairs: [string, string][];
}

export function solve(ch: Challenge, placements: Placements): Solution {
  const gears = buildGears(ch, placements);
  const byId = new Map(gears.map((g) => [g.id, g]));
  const outputId = outputGearId(ch, placements);
  const meshPairs: [string, string][] = [];
  const invalid = new Set(gears.map((g) => g.id)).size !== gears.length ||
    gears.some((a, i) => gears.slice(i + 1).some((b) => collides(a, b)));
  if (invalid) return { gears, motion: {}, jammed: true, outputId, outputConnected: false, ratio: null, outputDirection: null, meshPairs };
  for (let i = 0; i < gears.length; i++)
    for (let j = i + 1; j < gears.length; j++) {
      const a = gears[i], b = gears[j];
      if (!a || !b) continue;
      if (meshes(a, b)) meshPairs.push([a.id, b.id]);
    }

  const motion: Record<string, GearMotion> = { input: { k: 1, phase: 0 } };
  const queue = ["input"];
  let jammed = false;
  while (queue.length) {
    const aId = queue.shift();
    if (!aId) continue;
    const a = byId.get(aId);
    const ma = motion[aId];
    if (!a || !ma) continue;
    for (const [x, y] of meshPairs) {
      const bId = x === aId ? y : y === aId ? x : null;
      if (!bId) continue;
      const b = byId.get(bId);
      if (!b) continue;
      const k = -ma.k * (a.teeth / b.teeth);
      if (motion[bId]) {
        if (Math.abs(motion[bId].k - k) > 1e-9) jammed = true;
        continue;
      }
      const phi = Math.atan2(b.pos.y - a.pos.y, b.pos.x - a.pos.x);
      const phase = phi + Math.PI - Math.PI / b.teeth - (a.teeth / b.teeth) * (ma.phase - phi);
      motion[bId] = { k, phase };
      queue.push(bId);
    }
  }
  if (jammed) {
    return { gears, motion: {}, jammed, outputId, outputConnected: false, ratio: null, outputDirection: null, meshPairs };
  }
  const out = outputId ? motion[outputId] : undefined;
  return {
    gears,
    motion,
    jammed,
    outputId,
    outputConnected: !!out,
    ratio: out ? Math.abs(out.k) : null,
    outputDirection: out ? (out.k > 0 ? "cw" : "ccw") : null,
    meshPairs,
  };
}

/** Output RPM from actual input RPM; 0 when input is off or output disconnected. */
export function outputRpm(s: Solution, inputRpm: number): number {
  if (!s.outputConnected || s.ratio === null || inputRpm <= 0) return 0;
  return inputRpm * s.ratio;
}

/** Equal shaft pulleys and an open (uncrossed) belt drive the wheel 1:1,
 * preserving direction. The large decorative rim is not the belt pulley. */
export function outputWheelMotion(s: Solution): GearMotion | undefined {
  return s.outputId ? s.motion[s.outputId] : undefined;
}

export function goalMet(ch: Challenge, s: Solution): boolean {
  if (!s.outputConnected || s.jammed) return false;
  const g = ch.goal;
  if (g.kind === "connect") return true;
  if (g.kind === "direction") return s.outputDirection === g.direction;
  if (s.ratio === null || Math.abs(s.ratio - g.ratio) > RATIO_TOLERANCE) return false;
  return !g.direction || s.outputDirection === g.direction;
}

/** Plain-language hint describing what is missing, based on the actual state. */
export function nextHint(ch: Challenge, placements: Placements, s: Solution): string {
  if (s.jammed) return "The gears are locked: two routes reach the same gear with opposite directions. Remove one route.";
  if (s.outputConnected) {
    if (!goalMet(ch, s)) {
      const g = ch.goal;
      if (g.kind !== "connect" && g.direction && s.outputDirection !== g.direction)
        return "Connected, but the output turns the wrong way. Try a route with a different number of meshes.";
      if (g.kind === "ratio") return `Connected, but the speed ratio is ${s.ratio?.toFixed(2)}. The target is ${g.ratio.toFixed(1)}.`;
      return "Connected, but the objective is not met yet.";
    }
    return "Objective met. Keep steam on and the machine running to finish.";
  }
  const empty = ch.sockets.filter((sk) => !placements[sk.id]);
  if (empty.length === ch.sockets.length) return `Pick a gear from the tray and place it in a socket next to the input.`;
  for (const sk of ch.sockets) {
    const partId = placements[sk.id];
    if (partId && !s.motion[partId]) return `The gear in ${sk.label} isn't meshing with a driven gear. It may be too small for that gap.`;
  }
  if (ch.outputSocket && !placements[ch.outputSocket]) return "Motion is ready. Now choose a gear for the output shaft.";
  if (empty.length) return `Motion stops at the last gear. Try filling ${empty[0]?.label}.`;
  return "The chain doesn't reach the output. Try a different size.";
}
