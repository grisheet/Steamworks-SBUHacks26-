import { useEffect, useRef } from "react";
import type { Challenge } from "@/game/config";
import { canPlace, outputWheelMotion, type Placements, type Solution } from "@/game/mechanics";
import { pitchRadius } from "@/game/config";
import { GearShape } from "./GearShape";

interface Props {
  challenge: Challenge;
  placements: Placements;
  solution: Solution;
  held: string | null;
  hoverSocket: string | null;
  running: boolean;
  rpm: number;
  reducedMotion: boolean;
  onSocketKey: (socketId: string) => void;
  onSocketFocus: (socketId: string | null) => void;
  /** Changing this resets the animation phase to a deterministic start. */
  resetKey: number;
}

const CRANK = 24;

export function Workbench({ challenge: ch, placements, solution, held, hoverSocket, running, rpm, reducedMotion, onSocketKey, onSocketFocus, resetKey }: Props) {
  const gearRefs = useRef(new Map<string, SVGGElement>());
  const wheelRef = useRef<SVGGElement>(null);
  const pistonRef = useRef<SVGGElement>(null);
  const rodRef = useRef<SVGLineElement>(null);
  const psi = useRef(0);
  const live = useRef({ running, rpm, solution, reducedMotion });
  live.current = { running, rpm, solution, reducedMotion };

  const inX = ch.input.pos.x;
  const inY = ch.input.pos.y;
  const inR = pitchRadius(ch.input.teeth);
  const ROD = inR + 50;
  const cylX = inX - inR - 98; // cylinder sits just left of the input gear
  useEffect(() => {
    psi.current = 0;
  }, [resetKey]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { running, rpm, solution } = live.current;
      if (running && rpm > 0) psi.current += ((rpm * Math.PI * 2) / 60) * dt;
      const P = psi.current;
      for (const g of solution.gears) {
        const el = gearRefs.current.get(g.id);
        if (!el) continue;
        const m = solution.motion[g.id];
        const ang = m ? m.phase + m.k * P : 0;
        el.setAttribute("transform", `translate(${g.pos.x} ${g.pos.y}) rotate(${(ang * 180) / Math.PI})`);
      }
      const out = outputWheelMotion(solution);
      wheelRef.current?.setAttribute("transform", `translate(${ch.outputWheel.x} ${ch.outputWheel.y}) rotate(${out ? ((out.phase + out.k * P) * 180) / Math.PI : 0})`);
      // Crank pin rides on the input gear face.
      const px = inX + CRANK * Math.cos(P);
      const py = inY + CRANK * Math.sin(P);
      const headX = px - Math.sqrt(ROD * ROD - (py - inY) ** 2);
      pistonRef.current?.setAttribute("transform", `translate(${headX} 0)`);
      rodRef.current?.setAttribute("x1", String(px));
      rodRef.current?.setAttribute("y1", String(py));
      rodRef.current?.setAttribute("x2", String(headX));
      rodRef.current?.setAttribute("y2", String(inY));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ch, inX, inY, ROD]);

  const heldPart = held ? ch.tray.find((p) => p.id === held) : null;
  const steaming = running && rpm > 0 && !reducedMotion;
  const outGear = ch.output;
  const outR = pitchRadius(outGear.teeth);
  const outputPart = ch.outputSocket ? placements[ch.outputSocket] : null;
  const beltLength = Math.hypot(ch.outputWheel.x - outGear.pos.x, ch.outputWheel.y - outGear.pos.y);
  const beltX = beltLength ? -12 * (ch.outputWheel.y - outGear.pos.y) / beltLength : 0;
  const beltY = beltLength ? 12 * (ch.outputWheel.x - outGear.pos.x) / beltLength : 12;
  // Stable authored bounds, including every physically placeable gear, not animated teeth.
  const extents = ch.sockets.map((s) => ({
    ...s.pos,
    r: Math.max(46, ...ch.tray.filter((p) => canPlace(ch, {}, p.id, s.id).ok).map((p) => pitchRadius(p.teeth) + 20)),
  }));
  const left = Math.min(0, cylX - 16, ...extents.map((s) => s.x - s.r)) - 12;
  const top = Math.min(inY - 112, ch.outputWheel.y - 76, outGear.pos.y - outR - 20, ...extents.map((s) => s.y - s.r)) - 12;
  const right = Math.max(ch.outputWheel.x + 115, outGear.pos.x + outR + 20, ...extents.map((s) => s.x + s.r)) + 12;
  const bottom = Math.max(inY + inR + 38, ch.outputWheel.y + 98, outGear.pos.y + outR + 38, ...extents.map((s) => s.y + s.r + 14)) + 12;

  return (
    <svg viewBox={`${left} ${top} ${right - left} ${bottom - top}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full select-none" role="group" aria-label="Machine workbench">
      <defs>
        <linearGradient id="metal-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--metal-steel-light)" />
          <stop offset="0.5" stopColor="var(--metal-steel-mid)" />
          <stop offset="1" stopColor="var(--metal-steel-end)" />
        </linearGradient>
        <linearGradient id="metal-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--metal-brass-light)" />
          <stop offset="0.5" stopColor="var(--metal-brass-mid)" />
          <stop offset="1" stopColor="var(--metal-brass-end)" />
        </linearGradient>
        <linearGradient id="metal-copper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--metal-copper-light)" />
          <stop offset="0.5" stopColor="var(--metal-copper-mid)" />
          <stop offset="1" stopColor="var(--metal-copper-end)" />
        </linearGradient>
        <linearGradient id="metal-bad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--metal-bad-light)" />
          <stop offset="1" stopColor="var(--metal-bad-end)" />
        </linearGradient>
        <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="var(--gear-shadow)" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Steam supply pipe + valve */}
      <path d={`M0 ${inY - 70} H${cylX + 26} V${inY - 22}`} fill="none" stroke="url(#metal-copper)" strokeWidth="12" strokeLinejoin="round" />
      <circle cx={cylX + 26} cy={inY - 58} r="10" fill="url(#metal-brass)" stroke="var(--metal-outline)" />
      <text x={cylX + 44} y={inY - 76} className="fill-ivory font-mono" fontSize="11">STEAM {Math.round((rpm / 60) * 100)}%</text>

      {/* Cylinder */}
      <rect x={cylX} y={inY - 22} width="92" height="44" rx="6" fill="url(#metal-steel)" stroke="var(--metal-heavy-outline)" />
      <rect x={cylX + 4} y={inY - 15} width="84" height="30" rx="3" fill="var(--cylinder-interior)" />
      <g ref={pistonRef}>
        <rect x={-14} y={inY - 13} width="14" height="26" rx="2" fill="url(#metal-brass)" />
      </g>
      <line ref={rodRef} stroke="url(#metal-steel)" strokeWidth="6" strokeLinecap="round" />
      {steaming &&
        [0, 0.8, 1.6].map((d) => (
          <circle key={d} className="steam-puff" cx={cylX + 16} cy={inY - 30} r="9" fill="var(--steam-vapor)" style={{ animationDelay: `${d}s` }} />
        ))}

      {/* Belt to output wheel */}
      {[-1, 1].map((sign) => <line key={sign} x1={outGear.pos.x + sign * beltX} y1={outGear.pos.y + sign * beltY} x2={ch.outputWheel.x + sign * beltX} y2={ch.outputWheel.y + sign * beltY} stroke="var(--drive-belt)" strokeWidth="4" />)}
      <circle cx={outGear.pos.x} cy={outGear.pos.y} r="12" fill="url(#metal-steel)" stroke="var(--drive-belt)" strokeWidth="3" />
      <g ref={wheelRef} filter="url(#drop)">
        <circle r="56" fill="none" stroke="url(#metal-copper)" strokeWidth="9" />
        {Array.from({ length: 6 }, (_, i) => (
          <line key={i} x1="0" y1="0" x2={(52 * Math.cos((i * Math.PI) / 3)).toFixed(2)} y2={(52 * Math.sin((i * Math.PI) / 3)).toFixed(2)} stroke="url(#metal-steel)" strokeWidth="4" />
        ))}
        <circle r="13" fill="url(#metal-brass)" />
        <circle r="12" fill="none" stroke="var(--drive-belt)" strokeWidth="3" />
        <circle cx="52" cy="0" r="5" fill="var(--ivory)" />
      </g>
      <text x={ch.outputWheel.x} y={ch.outputWheel.y + 80} textAnchor="middle" className="fill-ivory font-mono" fontSize="12">
        OUTPUT WHEEL {solution.outputConnected ? "" : "· STOPPED"}
      </text>

      {/* Sockets */}
      {ch.sockets.map((s) => {
        const occupant = placements[s.id];
        const preview = hoverSocket === s.id && !!heldPart && occupant !== heldPart.id;
        const ok = preview && heldPart ? canPlace(ch, placements, heldPart.id, s.id).ok : false;
        const validTarget = !!heldPart && occupant !== heldPart.id && canPlace(ch, placements, heldPart.id, s.id).ok;
        return (
          <g key={s.id}>
            {preview && heldPart && (
              <g transform={`translate(${s.pos.x} ${s.pos.y})`} pointerEvents="none">
                <GearShape teeth={heldPart.teeth} tone="brass" ghost invalid={!ok} />
              </g>
            )}
            <g
              data-socket={s.id}
              role="button"
              tabIndex={0}
              aria-label={`${s.label}${occupant ? `, holds ${ch.tray.find((p) => p.id === occupant)?.teeth}-tooth gear` : ", empty"}${held ? ". Press Enter to place held gear" : occupant ? ". Press Enter to pick up" : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSocketKey(s.id);
                }
              }}
              onFocus={() => onSocketFocus(s.id)}
              onBlur={() => onSocketFocus(null)}
              className="cursor-pointer outline-none [&:focus-visible>.ring]:stroke-ring [&:focus-visible>.ring]:[stroke-width:4]"
              style={{ touchAction: "none" }}
            >
              <circle data-socket-hit={s.id} cx={s.pos.x} cy={s.pos.y} r="46" fill="transparent" />
              {!occupant && (
                <>
                  <circle className={`ring ${validTarget ? "socket-pulse" : ""}`} cx={s.pos.x} cy={s.pos.y} r="30" fill="var(--socket-fill)" stroke={preview ? (ok ? "var(--success)" : "var(--destructive)") : validTarget ? "var(--success)" : "var(--brass)"} strokeDasharray="5 5" strokeWidth="2" />
                  <circle cx={s.pos.x} cy={s.pos.y} r="6" fill="url(#metal-steel)" />
                  <text x={s.pos.x} y={s.pos.y < inY ? s.pos.y - 42 : s.pos.y + 48} textAnchor="middle" className="fill-ivory font-mono" fontSize="12">{s.label.toUpperCase()}</text>
                </>
              )}
              {occupant && <circle className="ring" cx={s.pos.x} cy={s.pos.y} r="12" fill="none" stroke="transparent" />}
            </g>
          </g>
        );
      })}

      {/* Gears */}
      {solution.gears.map((g) => {
        const tone = g.id === "input" ? "steel" : g.id === "output" || g.id === outputPart ? "copper" : "brass";
        const movable = g.id !== "input" && g.id !== "output";
        const isHeld = held === g.id;
        const disconnected = movable && !solution.motion[g.id];
        return (
          <g
            key={`${g.id}-${g.socketId ?? ""}`}
            ref={(el) => {
              if (el) gearRefs.current.set(g.id, el);
              else gearRefs.current.delete(g.id);
            }}
            transform={`translate(${g.pos.x} ${g.pos.y})`}
            filter="url(#drop)"
            data-part={movable ? g.id : undefined}
            data-socket={g.socketId}
            className={movable ? "cursor-grab" : undefined}
            style={{ touchAction: movable ? "none" : undefined, opacity: isHeld ? 0.45 : 1 }}
          >
            <GearShape teeth={g.teeth} tone={tone} />
            {disconnected && <circle r={pitchRadius(g.teeth) + 8} fill="none" stroke="var(--warning)" strokeWidth="2" strokeDasharray="3 6" />}
          </g>
        );
      })}

      {/* Labels for fixed gears (not rotating) */}
      <text x={inX} y={inY + inR + 24} textAnchor="middle" className="fill-ivory font-mono" fontSize="12">INPUT · {ch.input.teeth}T</text>
      {!ch.outputSocket && (
        <text x={outGear.pos.x} y={outGear.pos.y + outR + 24} textAnchor="middle" className="fill-ivory font-mono" fontSize="12">OUTPUT · {outGear.teeth}T</text>
      )}
    </svg>
  );
}
