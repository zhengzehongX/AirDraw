import type { GestureName } from '../types/drawing';

/**
 * A procedural hand, drawn from the same geometry the tracker reports: a palm
 * and five capsules whose tips are interpolated between a curled and an extended
 * pose. One component serves the tutorial coach (large) and the guide's gesture
 * cheat-sheet (small), so a pose never looks different in two places.
 */

type FingerName = 'index' | 'middle' | 'ring' | 'pinky';

/** 0 = fully curled, 1 = fully extended. */
const EXTENSION: Record<GestureName, Record<FingerName | 'thumb', number>> = {
  NONE: { index: 0.15, middle: 0.15, ring: 0.15, pinky: 0.15, thumb: 0.2 },
  POINT: { index: 1, middle: 0.08, ring: 0.08, pinky: 0.08, thumb: 0.25 },
  PINCH: { index: 0.86, middle: 0.06, ring: 0.06, pinky: 0.06, thumb: 0.72 },
  OPEN_PALM: { index: 1, middle: 1, ring: 1, pinky: 1, thumb: 1 },
  FIST: { index: 0, middle: 0, ring: 0, pinky: 0, thumb: 0.1 },
  VICTORY: { index: 1, middle: 1, ring: 0.06, pinky: 0.06, thumb: 0.2 },
};

const KNUCKLE: Record<FingerName, [number, number]> = {
  index: [38, 62],
  middle: [51, 59],
  ring: [63, 61],
  pinky: [73, 66],
};

const STRAIGHT: Record<FingerName, [number, number]> = {
  index: [35, 20],
  middle: [51, 12],
  ring: [67, 19],
  pinky: [79, 31],
};

const CURLED: Record<FingerName, [number, number]> = {
  index: [40, 49],
  middle: [52, 47],
  ring: [63, 49],
  pinky: [73, 53],
};

const THUMB_BASE: [number, number] = [29, 82];
const THUMB_OUT: [number, number] = [8, 60];
const THUMB_IN: [number, number] = [36, 60];
/** Pinch brings the thumb and the index tip together. */
const THUMB_PINCH: [number, number] = [27, 34];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function tip(name: FingerName, extension: number): [number, number] {
  const [cx, cy] = CURLED[name];
  const [sx, sy] = STRAIGHT[name];
  return [lerp(cx, sx, extension), lerp(cy, sy, extension)];
}

export function HandGlyph({
  pose = 'OPEN_PALM',
  size = 96,
  highlight,
  className,
}: {
  pose?: GestureName;
  size?: number;
  /** Fingers this lesson is really about; they get the accent stroke. */
  highlight?: Array<FingerName | 'thumb'>;
  className?: string;
}) {
  const extension = EXTENSION[pose] ?? EXTENSION.NONE;
  const lit = new Set(highlight ?? []);
  const indexTip = tip('index', extension.index);
  const thumbTip: [number, number] =
    pose === 'PINCH'
      ? THUMB_PINCH
      : [
          lerp(THUMB_IN[0], THUMB_OUT[0], extension.thumb),
          lerp(THUMB_IN[1], THUMB_OUT[1], extension.thumb),
        ];

  return (
    <svg
      className={className}
      width={size}
      height={(size * 120) / 100}
      viewBox="0 0 100 120"
      role="img"
      aria-label={pose}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="27" y="60" width="49" height="42" rx="19" className="ad-glyph-palm" stroke="currentColor" strokeWidth="5" />
      {(Object.keys(KNUCKLE) as FingerName[]).map((name) => {
        const [kx, ky] = KNUCKLE[name];
        const [tx, ty] = tip(name, extension[name]);
        return (
          <line
            key={name}
            x1={kx}
            y1={ky}
            x2={tx}
            y2={ty}
            stroke="currentColor"
            strokeWidth={lit.has(name) ? 11 : 9}
            className={lit.has(name) ? 'ad-glyph-lit' : undefined}
          />
        );
      })}
      <line
        x1={THUMB_BASE[0]}
        y1={THUMB_BASE[1]}
        x2={thumbTip[0]}
        y2={thumbTip[1]}
        stroke="currentColor"
        strokeWidth={lit.has('thumb') ? 11 : 9}
        className={lit.has('thumb') ? 'ad-glyph-lit' : undefined}
      />
      {pose === 'PINCH' && (
        <circle cx={(thumbTip[0] + indexTip[0]) / 2} cy={(thumbTip[1] + indexTip[1]) / 2} r="4.5" fill="currentColor" />
      )}
    </svg>
  );
}
