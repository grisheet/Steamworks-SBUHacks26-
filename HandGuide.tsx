// Short hand-control guide with original line illustrations. Static drawings, so it
// reads the same with reduced motion on.

type Pose = "open" | "aim" | "pinch" | "carry" | "release";

function HandSketch({ pose }: { pose: Pose }) {
  const closed = pose === "pinch" || pose === "carry";
  // Thumb and index tips; closed = touching.
  const thumb = closed ? { x: 52, y: 34 } : { x: 44, y: 44 };
  const index = closed ? { x: 54, y: 30 } : { x: 62, y: 18 };
  const cx = (thumb.x + index.x) / 2;
  const cy = (thumb.y + index.y) / 2;
  return (
    <svg viewBox="0 0 96 80" className="h-16 w-20 shrink-0" aria-hidden>
      {/* palm */}
      <path d="M22 74 C14 58 18 46 28 42 L40 40" fill="none" stroke="var(--steel)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M22 74 C36 76 46 70 50 60 L56 46" fill="none" stroke="var(--steel)" strokeWidth="2.5" strokeLinecap="round" />
      {/* thumb */}
      <path d={`M40 40 Q42 44 ${thumb.x} ${thumb.y}`} fill="none" stroke="var(--brass)" strokeWidth="3" strokeLinecap="round" />
      {/* index */}
      <path d={`M56 46 Q58 32 ${index.x} ${index.y}`} fill="none" stroke="var(--brass)" strokeWidth="3" strokeLinecap="round" />
      {pose === "open" && <rect x="4" y="4" width="88" height="72" rx="6" fill="none" stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
      {pose !== "open" && (
        <circle cx={cx + 18} cy={cy - 6} r={closed ? 6 : 8} fill={closed ? "color-mix(in oklab, var(--primary) 40%, transparent)" : "none"} stroke="var(--primary)" strokeWidth="2.5" />
      )}
      {pose === "aim" && <path d={`M${cx + 30} ${cy - 6} h10 m-4 -4 l4 4 l-4 4`} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" />}
      {pose === "carry" && (
        <>
          <circle cx={cx + 18} cy={cy - 6} r="11" fill="none" stroke="var(--brass)" strokeWidth="1.5" strokeDasharray="2 3" />
          <path d={`M${cx + 32} ${cy - 6} h10 m-4 -4 l4 4 l-4 4`} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" />
        </>
      )}
      {pose === "release" && <circle cx={cx + 18} cy={cy - 6} r="14" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeDasharray="5 4" />}
    </svg>
  );
}

const STEPS: { pose: Pose; title: string; text: string }[] = [
  { pose: "open", title: "Get in frame", text: "Keep one hand visible to the camera with your fingers comfortably separated." },
  { pose: "aim", title: "Aim", text: "Move your hand. The ring follows the point between your thumb and index fingertip." },
  { pose: "pinch", title: "Pick up", text: "Bring your thumb and index finger together over a gear." },
  { pose: "carry", title: "Move", text: "Keep pinching while you move toward a socket. The nearest socket highlights." },
  { pose: "release", title: "Place", text: "Separate your thumb and index finger to release." },
];

export function HandGuideContent() {
  return (
    <>
      <ol className="mt-3 grid gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3 border-b border-border/60 pb-2 last:border-0">
            <HandSketch pose={s.pose} />
            <div>
              <p className="text-sm font-semibold">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                {s.title}
              </p>
              <p className="text-sm text-muted-foreground">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">If it isn't working</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Improve the lighting; avoid a bright window behind you.</li>
          <li>Keep your whole hand in view. Move slightly farther away if fingers are cropped.</li>
          <li>Pinch a little firmer, or adjust pinch sensitivity in Settings.</li>
          <li>Tracking does not work equally well for everyone or every camera. Mouse, touch and keyboard always work.</li>
        </ul>
      </details>
    </>
  );
}
