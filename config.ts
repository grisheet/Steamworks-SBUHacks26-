// Authored machine configurations. Pure data — no rendering here.
// Geometry rule: pitch radius = MODULE * teeth / 2, so meshing gears share tooth pitch.
// Socket positions were solved so that the intended gears sit exactly at the sum of pitch radii.

export const MODULE = 5;
export const pitchRadius = (teeth: number) => (MODULE * teeth) / 2;

export interface Point {
  x: number;
  y: number;
}

export interface FixedGear {
  id: "input" | "output";
  teeth: number;
  pos: Point;
}

export interface Socket {
  id: string;
  label: string;
  pos: Point;
}

export interface TrayPart {
  id: string;
  teeth: number;
  note: string;
}

export type Direction = "cw" | "ccw";

/** ratio = output speed ÷ input speed (magnitude). */
export type Goal =
  | { kind: "connect" }
  | { kind: "direction"; direction: Direction }
  | { kind: "ratio"; ratio: number; direction?: Direction };

export const RATIO_TOLERANCE = 0.01;

export interface Challenge {
  id: string;
  number: number;
  title: string;
  objective: string;
  /** One-line learning concept shown in the objective strip. */
  concept: string;
  goal: Goal;
  input: FixedGear;
  /** Output shaft position. When `outputSocket` is set, the player chooses the output gear. */
  output: FixedGear;
  outputSocket?: string;
  outputWheel: Point;
  sockets: Socket[];
  tray: TrayPart[];
  initialSteam: number; // 0–100
  solution: Record<string, string>; // socketId -> partId
  successExplanation: string;
  hints?: [string, string];
}

export const SUCCESS_HOLD_SECONDS = 2;
export const MAX_INPUT_RPM = 60;

const P = (id: string, teeth: number, note: string): TrayPart => ({ id, teeth, note });

export const CHALLENGES: Challenge[] = [
  {
    id: "c1",
    number: 1,
    title: "Connect the machine",
    objective: "Complete the gear train between the steam-driven input gear and the output wheel.",
    concept: "Motion only travels through gears that actually mesh.",
    goal: { kind: "connect" },
    input: { id: "input", teeth: 24, pos: { x: 170, y: 330 } },
    output: { id: "output", teeth: 20, pos: { x: 486, y: 308 } },
    outputWheel: { x: 630, y: 308 },
    sockets: [
      { id: "s1", label: "Socket A", pos: { x: 270, y: 330 } },
      { id: "s2", label: "Socket B", pos: { x: 366, y: 258 } },
    ],
    tray: [
      P("g12", 12, "Small pinion. Too small to bridge most gaps here."),
      P("g16", 16, "Compact idler."),
      P("g24", 24, "Medium gear, same size as the input."),
      P("g32", 32, "Large idler. Needs plenty of room."),
    ],
    initialSteam: 50,
    solution: { s1: "g16", s2: "g32" },
    successExplanation:
      "Three meshes sit between input and output, so the output turns opposite to the input. The idlers do not change the speed ratio: it depends only on input teeth ÷ output teeth (24 ÷ 20 = 1.2).",
  },
  {
    id: "c2",
    number: 2,
    title: "Match the direction",
    objective: "Make the output wheel turn clockwise, the same direction as the input.",
    concept: "One idler means two meshes, and two reversals cancel out.",
    goal: { kind: "direction", direction: "cw" },
    input: { id: "input", teeth: 24, pos: { x: 170, y: 330 } },
    output: { id: "output", teeth: 20, pos: { x: 356, y: 242 } },
    outputWheel: { x: 540, y: 300 },
    sockets: [{ id: "s1", label: "Socket A", pos: { x: 290, y: 330 } }],
    tray: [P("g16", 16, "Compact idler."), P("g24", 24, "Medium gear."), P("g32", 32, "Large idler.")],
    initialSteam: 50,
    solution: { s1: "g24" },
    successExplanation:
      "With one idler there are two meshes. Two reversals cancel, so the output turns the same way as the input. The ratio is still 24 ÷ 20 = 1.2; the idler only changes direction.",
  },
  {
    id: "c3",
    number: 3,
    title: "Reverse the drive",
    objective: "Make the output wheel turn counter-clockwise, opposite to the input. Two routes exist; only one gives the right direction.",
    concept: "Every external mesh flips direction. Count the meshes along the route.",
    goal: { kind: "direction", direction: "ccw" },
    input: { id: "input", teeth: 24, pos: { x: 170, y: 330 } },
    output: { id: "output", teeth: 20, pos: { x: 420, y: 310 } },
    outputWheel: { x: 600, y: 310 },
    sockets: [
      { id: "t1", label: "Upper", pos: { x: 296.4, y: 269.8 } },
      { id: "b1", label: "Lower A", pos: { x: 266.6, y: 355.9 } },
      { id: "b2", label: "Lower B", pos: { x: 356.5, y: 399.8 } },
    ],
    tray: [
      P("g16", 16, "Compact idler."),
      P("g20", 20, "Small idler."),
      P("g24", 24, "Medium idler."),
      P("g32", 32, "Large idler. Fits the upper route."),
    ],
    initialSteam: 45,
    solution: { b1: "g16", b2: "g24" },
    successExplanation:
      "The lower route has two idlers, so three meshes: an odd number of reversals turns the output counter-clockwise. The upper route has one idler (two meshes) and would keep the output clockwise. Ratio stays 24 ÷ 20 = 1.2 either way.",
  },
  {
    id: "c4",
    number: 4,
    title: "Trade speed for torque",
    objective: "Choose the gear for the output shaft so the output turns at half the input speed (output ÷ input = 0.5).",
    concept: "A driven gear with twice the teeth turns at half the speed, with more turning force.",
    goal: { kind: "ratio", ratio: 0.5 },
    input: { id: "input", teeth: 16, pos: { x: 200, y: 320 } },
    output: { id: "output", teeth: 32, pos: { x: 431.9, y: 310.1 } },
    outputSocket: "out",
    outputWheel: { x: 620, y: 310 },
    sockets: [
      { id: "a", label: "Idler", pos: { x: 294, y: 285.8 } },
      { id: "out", label: "Output shaft", pos: { x: 431.9, y: 310.1 } },
    ],
    tray: [
      P("g12", 12, "Pinion. Would make the output faster than the input."),
      P("g24", 24, "Medium gear."),
      P("g32", 32, "Large gear: twice the input's 16 teeth."),
      P("g40", 40, "Very large gear."),
    ],
    initialSteam: 60,
    solution: { a: "g24", out: "g32" },
    successExplanation:
      "Output speed ÷ input speed = input teeth ÷ output teeth = 16 ÷ 32 = 0.5. In an ideal gear train, halving the speed doubles the available turning force (torque). The idler between them changes neither.",
  },
  {
    id: "c5",
    number: 5,
    title: "Master the workshop",
    objective: "Complete the lower route and choose an output gear for counter-clockwise motion at twice the input speed.",
    concept: "Two idlers reverse the output; the endpoint tooth counts set the speed.",
    goal: { kind: "ratio", ratio: 2, direction: "ccw" },
    input: { id: "input", teeth: 32, pos: { x: 190, y: 320 } },
    output: { id: "output", teeth: 16, pos: { x: 410, y: 300 } },
    outputSocket: "out",
    outputWheel: { x: 590, y: 300 },
    sockets: [
      { id: "b1", label: "Lower A", pos: { x: 280.1, y: 383.1 } },
      { id: "b2", label: "Lower B", pos: { x: 359.6, y: 374.6 } },
      { id: "out", label: "Output shaft", pos: { x: 410, y: 300 } },
    ],
    tray: [
      P("g12", 12, "Smallest pinion."),
      P("g16", 16, "Half the input's 32 teeth."),
      P("g20", 20, "Small idler."),
      P("g24", 24, "Medium idler."),
    ],
    initialSteam: 40,
    solution: { b1: "g12", b2: "g20", out: "g16" },
    hints: ["Start by comparing the input and output tooth counts. Then bridge the two lower sockets.", "Twice the input speed needs half as many output teeth. Two idlers create three reversals, giving counter-clockwise output."],
    successExplanation:
      "Three meshes along the lower route reverse the direction an odd number of times, so the output runs counter-clockwise. Speed ratio = 32 ÷ 16 = 2.0: the small output gear spins twice as fast, with half the turning force.",
  },
  {
    id: "c6", number: 6, title: "Advanced transmission",
    objective: "Choose a route for clockwise output at 1.5 times the input speed (out ÷ in = 1.5).",
    concept: "Choose endpoint teeth for speed and count route meshes for direction.",
    goal: { kind: "ratio", ratio: 1.5, direction: "cw" },
    input: { id: "input", teeth: 24, pos: { x: 190, y: 320 } },
    output: { id: "output", teeth: 16, pos: { x: 490, y: 320 } },
    outputSocket: "out", outputWheel: { x: 660, y: 320 },
    sockets: [
      { id: "a1", label: "Upper A", pos: { x: 268.181818, y: 257.649352 } },
      { id: "a2", label: "Upper B", pos: { x: 368.181818, y: 257.649352 } },
      { id: "a3", label: "Upper C", pos: { x: 458.181818, y: 257.649352 } },
      { id: "b1", label: "Lower A", pos: { x: 304.444444, y: 381.664164 } },
      { id: "b2", label: "Lower B", pos: { x: 424.444444, y: 381.664164 } },
      { id: "out", label: "Output shaft", pos: { x: 490, y: 320 } },
    ],
    tray: [P("out16",16,"16-tooth gear A."), P("g16",16,"16-tooth gear B; interchangeable with A."), P("g24",24,"Medium idler."), P("g12",12,"Small pinion."), P("g28",28,"28-tooth idler."), P("g20",20,"20-tooth gear."), P("g32",32,"Large gear; check clearance.")],
    initialSteam: 45,
    solution: { a1: "g16", a2: "g24", a3: "g12", out: "out16" },
    hints: ["Both routes can transmit motion, but their mesh counts differ. Plan the direction before placing parts.", "Clockwise output needs an even number of meshes. A 24-tooth input needs a 16-tooth output for a 1.5 ratio; idlers do not change that ratio."],
    successExplanation: "The upper route uses three idlers and four external meshes. Four reversals keep the output clockwise. Endpoint ratio = 24 ÷ 16 = 1.5; the idlers carry motion without changing the ratio.",
  },
  {
    id: "c7", number: 7, title: "The Masterwork",
    objective: "Build one route for counter-clockwise output at twice the input speed (out ÷ in = 2.0).",
    concept: "Plan a longer train: direction comes from mesh parity, speed from endpoints.",
    goal: { kind: "ratio", ratio: 2, direction: "ccw" },
    input: { id: "input", teeth: 32, pos: { x: 190, y: 320 } },
    output: { id: "output", teeth: 16, pos: { x: 570, y: 320 } },
    outputSocket: "out", outputWheel: { x: 750, y: 320 },
    sockets: [
      { id: "a1", label: "Upper A", pos: { x: 260, y: 235.147186 } },
      { id: "a2", label: "Upper B", pos: { x: 350, y: 235.147186 } },
      { id: "a3", label: "Upper C", pos: { x: 450, y: 235.147186 } },
      { id: "a4", label: "Upper D", pos: { x: 540, y: 235.147186 } },
      { id: "b1", label: "Lower A", pos: { x: 311.764706, y: 407.597696 } },
      { id: "b2", label: "Lower B", pos: { x: 421.764706, y: 407.597696 } },
      { id: "b3", label: "Lower C", pos: { x: 521.764706, y: 407.597696 } },
      { id: "out", label: "Output shaft", pos: { x: 570, y: 320 } },
    ],
    tray: [P("out16",16,"16-tooth gear A."), P("g16",16,"16-tooth gear B."), P("spare16",16,"16-tooth gear C; same size as A and B."), P("g24",24,"24-tooth gear A."), P("spare24",24,"24-tooth gear B; interchangeable with A."), P("g12",12,"Small pinion."), P("g20",20,"20-tooth gear."), P("g28",28,"28-tooth idler."), P("g32",32,"32-tooth gear; check clearance.")],
    initialSteam: 45,
    solution: { a1: "g12", a2: "g24", a3: "g16", a4: "g20", out: "out16" },
    hints: ["A shorter route is not always the right route. Count reversals, reserve the output gear, then work through the gaps.", "Counter-clockwise needs an odd mesh count. Twice the speed needs half the input teeth at the output. Building both routes locks the train because they demand opposite directions."],
    successExplanation: "Four idlers form five external meshes: an odd number of reversals turns the output counter-clockwise. Input ÷ output teeth = 32 ÷ 16 = 2.0. The longer train still gets its ratio only from its endpoints. You combined fit, direction and speed in one machine.",
  },
];

export function getChallenge(id: string): Challenge {
  const found = CHALLENGES.find((c) => c.id === id) ?? CHALLENGES[0];
  if (!found) throw new Error("Campaign has no levels");
  return found;
}

export function goalText(g: Goal): string {
  const dir = (d: Direction) => (d === "cw" ? "clockwise" : "counter-clockwise");
  if (g.kind === "connect") return "Output connected and running";
  if (g.kind === "direction") return `Output turns ${dir(g.direction)}`;
  return `Speed ratio ${g.ratio.toFixed(1)}${g.direction ? ` · ${dir(g.direction)}` : ""}`;
}
