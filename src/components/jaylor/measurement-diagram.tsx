import type { CSSProperties } from "react";

export type DiagramKind = "around" | "vertical" | "horizontal";

export type DiagramSpec = {
  kind: DiagramKind;
  /** around: band center; vertical: x + yTop/yBottom; horizontal: y + xLeft/xRight */
  y?: number;
  x?: number;
  yTop?: number;
  yBottom?: number;
  xLeft?: number;
  xRight?: number;
  halfWidth?: number;
};

export const MEASUREMENT_GUIDES: {
  id: string;
  title: string;
  keywords: string[];
  instructions: string;
  diagram: DiagramSpec;
}[] = [
  {
    id: "cap_size",
    title: "Head (cap size)",
    keywords: ["cap size", "head size", "head circumference", "cap"],
    instructions: "Wrap the tape around the head, just above the ears.",
    diagram: { kind: "around", y: 24, halfWidth: 20 },
  },
  {
    id: "neck",
    title: "Neck",
    keywords: ["neck"],
    instructions: "Wrap the tape around the base of the neck, where a shirt collar sits.",
    diagram: { kind: "around", y: 50, halfWidth: 14 },
  },
  {
    id: "shoulder",
    title: "Shoulder width",
    keywords: ["shoulder width", "shoulder"],
    instructions: "Measure straight across the back, from one shoulder edge to the other.",
    diagram: { kind: "horizontal", y: 58, xLeft: 58, xRight: 142 },
  },
  {
    id: "across_back",
    title: "Back width",
    keywords: ["across back", "back width"],
    instructions: "Measure straight across the back, armpit to armpit.",
    diagram: { kind: "horizontal", y: 92, xLeft: 62, xRight: 138 },
  },
  {
    id: "round_sleeve",
    title: "Arm / sleeve round",
    keywords: ["round sleeve", "sleeve round", "sleeve width", "bicep", "arm round", "upper arm"],
    instructions: "Wrap the tape around the top of the arm, where the sleeve ends.",
    diagram: { kind: "around", y: 112, x: 156, halfWidth: 11 },
  },
  {
    id: "sleeve",
    title: "Sleeve length",
    keywords: ["sleeve length", "sleeve", "arm length"],
    instructions: "From the shoulder edge, run the tape down a bent elbow to the wrist.",
    diagram: { kind: "vertical", x: 152, yTop: 58, yBottom: 215 },
  },
  {
    id: "chest",
    title: "Chest / bust",
    keywords: ["chest", "bust"],
    instructions: "Wrap the tape around the fullest part of the chest, arms relaxed.",
    diagram: { kind: "around", y: 100, halfWidth: 50 },
  },
  {
    id: "top_length",
    title: "Top length",
    keywords: ["top length", "shirt length", "blouse length"],
    instructions: "From the shoulder down to where you want the top to end.",
    diagram: { kind: "vertical", x: 100, yTop: 58, yBottom: 345 },
  },
  {
    id: "agbada_length",
    title: "Agbada / gown length",
    keywords: ["agbada length", "gown length", "dress length"],
    instructions: "From the shoulder down to where you want the agbada or gown to end.",
    diagram: { kind: "vertical", x: 100, yTop: 58, yBottom: 345 },
  },
  {
    id: "waist",
    title: "Waist",
    keywords: ["waist"],
    instructions: "Wrap around the narrowest part, just above the belly button. Not tight.",
    diagram: { kind: "around", y: 160, halfWidth: 38 },
  },
  {
    id: "rise",
    title: "Rise",
    keywords: ["rise"],
    instructions: "Sit on a hard chair. Measure from the waist down to the seat.",
    diagram: { kind: "vertical", x: 100, yTop: 160, yBottom: 225 },
  },
  {
    id: "hip",
    title: "Hip / seat",
    keywords: ["hip", "seat"],
    instructions: "Wrap around the fullest part of the hips, below the waist.",
    diagram: { kind: "around", y: 195, halfWidth: 44 },
  },
  {
    id: "thigh",
    title: "Thigh",
    keywords: ["thigh"],
    instructions: "Wrap around the fullest part of the thigh, just below the seat.",
    diagram: { kind: "around", y: 240, halfWidth: 22 },
  },
  {
    id: "knee",
    title: "Knee",
    keywords: ["knee"],
    instructions: "Wrap the tape around the leg at the knee, leg straight.",
    diagram: { kind: "around", y: 285, x: 80, halfWidth: 14 },
  },
  {
    id: "inseam",
    title: "Inseam / inside leg",
    keywords: ["inseam", "inside leg"],
    instructions: "From the crotch, straight down the inside of the leg to the ankle.",
    diagram: { kind: "vertical", x: 100, yTop: 225, yBottom: 345 },
  },
  {
    id: "trouser_bottom",
    title: "Trouser bottom (ankle opening)",
    keywords: ["trouser bottom", "leg opening", "ankle opening", "bottom width"],
    instructions: "Wrap the tape around the leg opening, where the trouser ends at the ankle.",
    diagram: { kind: "around", y: 345, x: 80, halfWidth: 12 },
  },
  {
    id: "trouser_length",
    title: "Trouser length",
    keywords: ["trouser length", "leg length", "pant length"],
    instructions: "From the waist, down the outside of the leg to the ankle.",
    diagram: { kind: "vertical", x: 118, yTop: 160, yBottom: 345 },
  },
  {
    id: "length",
    title: "Garment length",
    keywords: ["length"],
    instructions: "From the shoulder down to where you want the garment to end.",
    diagram: { kind: "vertical", x: 100, yTop: 58, yBottom: 345 },
  },
];

const GENERIC_GUIDE = {
  title: "General tip",
  instructions: "Use a soft tape. Stand normally. Keep the tape snug, not tight.",
};

function normalize(label: string) {
  return label.trim().toLowerCase();
}

/** Picks the guide whose matching keyword is the longest (most specific) match in the label. */
export function findMeasurementGuide(label: string) {
  const norm = normalize(label);
  let best: { guide: (typeof MEASUREMENT_GUIDES)[number]; len: number } | null = null;
  for (const guide of MEASUREMENT_GUIDES) {
    for (const keyword of guide.keywords) {
      if (norm.includes(keyword) && (!best || keyword.length > best.len)) {
        best = { guide, len: keyword.length };
      }
    }
  }
  return best?.guide ?? null;
}

export function measurementGuideText(label: string) {
  return findMeasurementGuide(label)?.instructions ?? GENERIC_GUIDE.instructions;
}

export function MeasurementDiagram({ label, className }: { label: string; className?: string }) {
  const guide = findMeasurementGuide(label);
  const d = guide?.diagram;

  const dotStyle: CSSProperties | undefined = (() => {
    if (!d) return undefined;
    const vars: Record<string, string | number> = {};
    if (d.kind === "around") {
      vars["--dx0"] = (d.x ?? 100) - (d.halfWidth ?? 30);
      vars["--dx1"] = (d.x ?? 100) + (d.halfWidth ?? 30);
      vars["animationName"] = "measure-move-x";
    } else if (d.kind === "horizontal") {
      vars["--dx0"] = d.xLeft ?? 0;
      vars["--dx1"] = d.xRight ?? 0;
      vars["animationName"] = "measure-move-x";
    } else {
      vars["--dy0"] = d.yTop ?? 0;
      vars["--dy1"] = d.yBottom ?? 0;
      vars["animationName"] = "measure-move-y";
    }
    return vars as unknown as CSSProperties;
  })();

  return (
    <svg
      viewBox="0 0 200 360"
      className={className}
      role="img"
      aria-label={`How to measure ${label}`}
    >
      <style>{`
        @keyframes measure-move-x {
          0%, 100% { cx: var(--dx0); }
          50% { cx: var(--dx1); }
        }
        @keyframes measure-move-y {
          0%, 100% { cy: var(--dy0); }
          50% { cy: var(--dy1); }
        }
      `}</style>
      <g
        className="text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx={100} cy={30} r={18} fill="currentColor" fillOpacity={0.08} />
        <polygon
          points="58,58 54,100 66,160 60,195 100,225 140,195 134,160 146,100 142,58"
          fill="currentColor"
          fillOpacity={0.08}
        />
        <polyline points="58,58 40,140 30,215" />
        <polyline points="142,58 160,140 170,215" />
        <polyline points="80,225 80,285 75,345" />
        <polyline points="120,225 120,285 125,345" />
      </g>

      {d && (
        <g
          className="text-gold"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        >
          {d.kind === "around" && (
            <>
              <line
                x1={(d.x ?? 100) - (d.halfWidth ?? 30)}
                y1={d.y}
                x2={(d.x ?? 100) + (d.halfWidth ?? 30)}
                y2={d.y}
              />
              <line
                x1={(d.x ?? 100) - (d.halfWidth ?? 30)}
                y1={(d.y ?? 0) - 5}
                x2={(d.x ?? 100) - (d.halfWidth ?? 30)}
                y2={(d.y ?? 0) + 5}
              />
              <line
                x1={(d.x ?? 100) + (d.halfWidth ?? 30)}
                y1={(d.y ?? 0) - 5}
                x2={(d.x ?? 100) + (d.halfWidth ?? 30)}
                y2={(d.y ?? 0) + 5}
              />
            </>
          )}
          {d.kind === "horizontal" && (
            <>
              <line x1={d.xLeft} y1={d.y} x2={d.xRight} y2={d.y} />
              <line x1={d.xLeft} y1={(d.y ?? 0) - 5} x2={d.xLeft} y2={(d.y ?? 0) + 5} />
              <line x1={d.xRight} y1={(d.y ?? 0) - 5} x2={d.xRight} y2={(d.y ?? 0) + 5} />
            </>
          )}
          {d.kind === "vertical" && (
            <>
              <line x1={d.x} y1={d.yTop} x2={d.x} y2={d.yBottom} strokeDasharray="6 5" />
              <line x1={(d.x ?? 0) - 5} y1={d.yTop} x2={(d.x ?? 0) + 5} y2={d.yTop} />
              <line x1={(d.x ?? 0) - 5} y1={d.yBottom} x2={(d.x ?? 0) + 5} y2={d.yBottom} />
            </>
          )}
          <circle
            r={5}
            fill="currentColor"
            stroke="none"
            style={{
              ...dotStyle,
              animationDuration: "1.6s",
              animationIterationCount: "infinite",
              animationTimingFunction: "ease-in-out",
            }}
            cx={
              d.kind === "vertical"
                ? d.x
                : d.kind === "around"
                  ? (d.x ?? 100) - (d.halfWidth ?? 30)
                  : d.xLeft
            }
            cy={d.kind === "vertical" ? d.yTop : d.y}
          />
        </g>
      )}
    </svg>
  );
}
