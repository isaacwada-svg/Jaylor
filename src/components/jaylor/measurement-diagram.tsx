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
    id: "neck",
    title: "Neck",
    keywords: ["neck"],
    instructions: "Wrap the tape around the base of the neck, where a shirt collar would sit.",
    diagram: { kind: "around", y: 50, halfWidth: 14 },
  },
  {
    id: "shoulder",
    title: "Shoulder width",
    keywords: ["shoulder width", "shoulder"],
    instructions:
      "Measure straight across the back, from the edge of one shoulder to the edge of the other.",
    diagram: { kind: "horizontal", y: 58, xLeft: 58, xRight: 142 },
  },
  {
    id: "across_back",
    title: "Back width",
    keywords: ["across back", "back width"],
    instructions:
      "Measure straight across the back at shoulder-blade level, from armpit to armpit.",
    diagram: { kind: "horizontal", y: 92, xLeft: 62, xRight: 138 },
  },
  {
    id: "sleeve",
    title: "Sleeve length",
    keywords: ["sleeve", "arm length"],
    instructions:
      "From the shoulder edge, run the tape down over a slightly bent elbow, to the wrist bone.",
    diagram: { kind: "vertical", x: 152, yTop: 58, yBottom: 215 },
  },
  {
    id: "bicep",
    title: "Arm round",
    keywords: ["bicep", "arm round", "upper arm"],
    instructions: "Wrap the tape around the fullest part of the upper arm.",
    diagram: { kind: "around", y: 112, x: 156, halfWidth: 11 },
  },
  {
    id: "chest",
    title: "Chest / bust",
    keywords: ["chest", "bust"],
    instructions:
      "Wrap the tape around the fullest part of the chest/bust, level all the way round, arms relaxed at the sides.",
    diagram: { kind: "around", y: 100, halfWidth: 50 },
  },
  {
    id: "waist",
    title: "Waist",
    keywords: ["waist"],
    instructions:
      "Wrap around the natural waist — the narrowest point, usually just above the belly button. Snug, not tight.",
    diagram: { kind: "around", y: 160, halfWidth: 38 },
  },
  {
    id: "rise",
    title: "Rise",
    keywords: ["rise"],
    instructions: "Sit on a hard chair. Measure from the waist down to the seat, along the body.",
    diagram: { kind: "vertical", x: 100, yTop: 160, yBottom: 225 },
  },
  {
    id: "hip",
    title: "Hip / seat",
    keywords: ["hip", "seat"],
    instructions: "Wrap around the fullest part of the hips/seat, about 20cm below the waist.",
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
    id: "inseam",
    title: "Inseam / inside leg",
    keywords: ["inseam", "inside leg"],
    instructions: "Measure from the crotch straight down the inside of the leg to the ankle bone.",
    diagram: { kind: "vertical", x: 100, yTop: 225, yBottom: 345 },
  },
  {
    id: "trouser_length",
    title: "Trouser length",
    keywords: ["trouser length", "leg length", "pant length"],
    instructions: "Measure from the waist down the outside of the leg to the ankle bone.",
    diagram: { kind: "vertical", x: 118, yTop: 160, yBottom: 345 },
  },
  {
    id: "length",
    title: "Garment length",
    keywords: ["length"],
    instructions: "Measure from the shoulder/nape down to where you want the garment to end.",
    diagram: { kind: "vertical", x: 100, yTop: 58, yBottom: 345 },
  },
];

const GENERIC_GUIDE = {
  title: "General tip",
  instructions:
    "Use a soft measuring tape. Stand normally, keep the tape snug against the body without pulling it tight.",
};

function normalize(label: string) {
  return label.trim().toLowerCase();
}

export function findMeasurementGuide(label: string) {
  const norm = normalize(label);
  return MEASUREMENT_GUIDES.find((g) => g.keywords.some((k) => norm.includes(k))) ?? null;
}

export function measurementGuideText(label: string) {
  return findMeasurementGuide(label)?.instructions ?? GENERIC_GUIDE.instructions;
}

export function MeasurementDiagram({ label, className }: { label: string; className?: string }) {
  const guide = findMeasurementGuide(label);
  const d = guide?.diagram;

  return (
    <svg
      viewBox="0 0 200 360"
      className={className}
      role="img"
      aria-label={`How to measure ${label}`}
    >
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
        </g>
      )}
    </svg>
  );
}
