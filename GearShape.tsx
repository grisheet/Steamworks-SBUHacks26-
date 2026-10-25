import { memo } from "react";
import { MODULE, pitchRadius } from "@/game/config";

/** Trapezoid-tooth gear outline centered at 0,0; tooth 0 points along +x. */
export function gearPath(teeth: number) {
  const r = pitchRadius(teeth);
  const ra = r + MODULE * 0.9;
  const rd = r - MODULE * 1.1;
  const step = (Math.PI * 2) / teeth;
  const pts: string[] = [];
  const pt = (rad: number, a: number) => `${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    pts.push(pt(rd, a - step * 0.5), pt(rd, a - step * 0.3), pt(ra, a - step * 0.14), pt(ra, a + step * 0.14), pt(rd, a + step * 0.3));
  }
  return `M${pts.join("L")}Z`;
}

interface Props {
  teeth: number;
  tone: "steel" | "brass" | "copper";
  ghost?: boolean;
  invalid?: boolean;
}

export const GearShape = memo(function GearShape({ teeth, tone, ghost, invalid }: Props) {
  const r = pitchRadius(teeth);
  const hub = Math.max(9, r * 0.28);
  const spokes = teeth >= 20 ? 5 : 0;
  return (
    <g opacity={ghost ? 0.55 : 1} className={ghost ? undefined : "gear-snap"}>
      <path d={gearPath(teeth)} fill={`url(#metal-${invalid ? "bad" : tone})`} stroke="var(--background)" strokeWidth={1.2} />
      <circle r={r - MODULE * 2.2} fill="none" stroke="var(--metal-etch)" strokeWidth={1.5} />
      {spokes > 0 &&
        Array.from({ length: spokes }, (_, i) => {
          const a = (i / spokes) * Math.PI * 2 + Math.PI / spokes;
          const rr = (r - MODULE * 2.2 + hub) / 2;
          return <circle key={i} cx={(rr * Math.cos(a)).toFixed(2)} cy={(rr * Math.sin(a)).toFixed(2)} r={(r - MODULE * 2.2 - hub) * 0.32} fill="var(--gear-cutout)" />;
        })}
      <circle r={hub} fill="url(#metal-steel)" stroke="var(--metal-outline)" />
      <circle r={4} fill="var(--background)" />
      {/* index mark makes rotation direction readable */}
      <line x1={hub + 2} y1={0} x2={r - MODULE * 2.4} y2={0} stroke="var(--ivory)" strokeOpacity={0.7} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
});
