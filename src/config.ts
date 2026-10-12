/**
 * Central tunables. Everything that affects the feel of drawing lives here so
 * it can be adjusted without hunting through components.
 *
 * Plane space: stroke points are stored normalized (x/y in [0,1]) on a virtual
 * drawing plane, so distances below are plane units unless suffixed _PX.
 */

/** Detection is capped below the camera rate on purpose: 30 Hz is enough for
 *  a finger and leaves headroom for rendering on integrated GPUs. */
export const DETECTION_MAX_FPS = 30;

export const CAMERA_IDEAL = { width: 1280, height: 720 };

/**
 * Short dropouts are ignored so a single missed frame cannot break a stroke.
 * Detection runs 20–30 Hz and inference is single-in-flight, so one slow model
 * pass (150–200 ms on a weak GPU) already leaves a ~200 ms gap: the grace has to
 * cover two of those without delaying a real departure past a third of a second.
 */
export const TRACKING_LOST_GRACE_MS = 320;
/** After this long without a hand, filters reset instead of sweeping across the screen. */
export const TRACKING_RESET_MS = 400;
/** Frames buffered after re-acquisition before the pen may touch down again.
 *  The buffer median becomes the filter reset point, killing re-entry jitter. */
export const RECAPTURE_BUFFER_FRAMES = 3;

/** Pinch is measured as |thumbTip - indexTip| / palmLength, so it is
 *  independent of how far the hand is from the camera and of palm size. */
export const PINCH_START_RATIO = 0.45;
export const PINCH_RELEASE_RATIO = 0.62;
/** Consecutive frames required to flip the pen state (3–5 per design). */
export const PINCH_CONFIRM_FRAMES = 3;

/** One Euro Filter tuning for the index fingertip (plane space). */
export const POINTER_FILTER = { minCutoff: 1.5, beta: 0.02, dCutoff: 1.0 };
/** The pinch ratio is smoothed harder: it only gates on/off, never draws. */
export const PINCH_FILTER_ALPHA = 0.45;

/** Velocity limit in plane units per second: fast-but-real movement passes,
 *  teleport-sized jumps (tracking glitches) are clamped or held. */
export const MAX_POINT_SPEED = 2.2;
/** A single-frame step beyond this is treated as an outlier and held. */
export const OUTLIER_HARD_STEP = 0.28;
/** Consecutive outliers beyond this count mean a genuine teleport (re-entry). */
export const OUTLIER_MAX_STREAK = 3;

/** Palm scale smoothing: rate-clamped EMA so a glitchy frame cannot rescale pinch. */
export const PALM_SCALE_EMA = 0.35;
export const PALM_SCALE_MAX_CHANGE = 0.3;

/** Below this plane-space distance a new point is dropped (keeps strokes light). */
export const MIN_POINT_DISTANCE = 0.0015;
/** Hard cap per segment; beyond it the segment is compressed by resampling. */
export const MAX_POINTS_PER_SEGMENT = 400;

/** Gesture recognition (fingerpose-style curl scoring). */
export const GESTURE_CONFIRM_FRAMES = 3;
export const GESTURE_MIN_SCORE = 6.5;
export const CURL_NO_CURL_DEG = 130;
export const CURL_HALF_CURL_DEG = 60;

/**
 * PlayLab — palm swipe.
 *
 * Every number here is a *starting* value measured in palm widths, not pixels, so
 * it survives the user stepping closer to or further from the camera. The final
 * tuning pass belongs to a real hand (see docs/phase7-log.md); until then the
 * detector is verified against the noisy synthetic hand the pinch detector uses.
 */
export const PALM_SWIPE = {
  /** A swipe is only considered from a hand that is open, facing the camera and steady. */
  minOpenness: 0.6,
  minFacing: 0.55,
  /** Landmark ratios below/above which a hand counts as spread (see `opennessOf`). */
  openRatio: 1.12,
  spreadRatio: 1.62,
  /** How long the open, facing, stable pose must hold before a swipe may start (IDLE→ARMED). */
  armMs: 140,
  /** A swipe that takes shorter than this is a flick/noise; longer than this is a wander. */
  minMs: 160,
  maxMs: 650,
  /** Required horizontal travel, in palm widths. */
  distancePalms: 3,
  /** …or as a fraction of the frame width, whichever is reached first. */
  distanceFrame: 0.2,
  /** Mean travel speed gate, palm widths per second. */
  minSpeed: 3.4,
  /** |Σdx| / Σ|dx| — rejects back-and-forth waving that ends where it started. */
  directionConsistency: 0.72,
  /** Travelling back this share of the way already covered cancels the attempt. */
  reverseShare: 0.45,
  /** |dy| may not exceed this share of |dx|: a mostly-vertical move is not a page turn. */
  maxVerticalDrift: 0.55,
  /** Dead zone before the page starts following the hand, in palm widths. */
  followDeadZone: 0.35,
  /** After a commit, further swipes are ignored for this long — one wave, one page. */
  cooldownMs: 650,
  /** A cancelled attempt must also cool off, or a back-and-forth wave simply commits on its last leg. */
  cancelMs: 350,
  /** Physical cap on palm speed (frame widths per second); beyond it a sample is tracking noise. */
  maxSpeed: 8,
  /** EMA blend for palm velocity; monocular landmarks need this before integration. */
  motionSmoothing: 0.35,
} as const;

/** PlayLab — high-level gesture events. All of these are sustained, not per-frame. */
export const LAB_GESTURES = {
  /** Openness crossings, with a gap between them so a half-open hand is neither. */
  openAt: 0.62,
  closedAt: 0.34,
  /** Frames the crossing must survive before the event fires. */
  confirmFrames: 3,
  /** Pinch travel that counts as "moving", as a fraction of one palm width. */
  movePalmFraction: 0.18,
  /** Palm-width change (relative to a slow reference) that reads as push / pull. */
  pushRatio: 0.16,
  pushCooldownMs: 700,
  /** How fast the push/pull reference follows the real width (0..1). */
  widthFollow: 0.04,
  /** Two-hand separation speed, plane units per second. */
  expandSpeed: 0.12,
  expandCooldownMs: 260,
  /** Twist away from the engaged reference before a rotate is announced, radians. */
  rotateRad: 0.35,
  /** Hands this close (in palm widths) for this long count as a clap. */
  nearPalms: 1.1,
  nearHoldMs: 120,
  /** …and they must open to this far before the follow-up "separate" fires. */
  farPalms: 3.2,
  /** An energy link needs both hands open, apart, but not out of reach of each other. */
  linkPalms: 4.6,
} as const;

/** PlayLab — scene and comfort. */
export const PLAYLAB = {
  /** Frames of a hand's absence tolerated before the toy is paused. */
  handGraceMs: 180,
  /** Both hands must be stable this long before a two-hand interaction begins; it ends with hysteresis. */
  twoHandEngageMs: 200,
  twoHandReleaseMs: 420,
  /** After this much continuous raising, the toy suggests a rest without interrupting play. */
  restNudgeMs: 120_000,
  /** Input is ignored during the first slice of a toy switch, but the cursor keeps tracking. */
  switchLockMs: 260,
  /** A switch animation runs this long; a newer target replaces it. */
  switchMs: 820,
  /** Idle (no hand, no motion) after which toys drop to their cheapest update. */
  idleAfterMs: 2400,
} as const;

/**
 * The welcome sequence's rhythm. The shader eases toward each stage; these numbers are
 * what the state machine waits, so the visible assembly, the readable hold and the
 * burst all land inside the same windows the tests assert.
 */
export const WELCOME = {
  /** Points travel from their drift positions into the glyphs. */
  gatherMs: 1200,
  /** How long "Hello" stays fully readable before it bursts on its own. */
  helloMs: 750,
  /** Outward burst; the next screen rises from behind it. */
  disperseMs: 900,
  /** A returning user gets the short version, and a reduced-motion user skips to the end. */
  gatherReturningMs: 700,
  helloReturningMs: 450,
} as const;

/** Committed-ink GPU budget. */
export const INK_CHUNK_STROKES = 24;
export const INK_BUDGET_POINTS = 1400;
export const INK_LOD_MIN = 0.25;

/** Erase tool reach in plane units. */
export const ERASE_RADIUS_PLANE = 0.045;

/** Spatial UI grammar. */
export const HOVER_DWELL_MS = 90;
export const GESTURE_COOLDOWN_MS = 350;
export const DOCK_OPEN_HOLD_MS = 700;
export const CLEAR_HOLD_MS = 1000;
/** Gesture drags move the smoothed cursor, not the hand, so list scrolling needs a gain
 *  or long panels become unreachable without a mouse wheel. */
export const GESTURE_SCROLL_GAIN = 2.4;
/** A VICTORY must be held this long before it flips view mode: a pinch sweep passes
 *  through two extended fingers on the way, and a blip must not deaden the pen. */
export const VIEW_MODE_HOLD_MS = 400;
export const FOCUS_MODE_RETURN_MS = 1600;

/** Primary-hand stickiness: switching needs a clearly better alternative
 *  sustained over several frames, so left/right flicker cannot jump the pen. */
export const HAND_SWITCH_MARGIN = 0.25;
export const HAND_SWITCH_FRAMES = 10;

/** Metric palm length (metres) used to normalise worldLandmark depth feedback. */
export const WORLD_PALM_REFERENCE_M = 0.09;
export const Z_FEEDBACK_MAX = 0.6;

export const MAX_CANVAS_DPR = 2;

export const BRUSH_PALETTE = [
  '#22d3ee',
  '#a78bfa',
  '#f472b6',
  '#4ade80',
  '#fbbf24',
  '#60a5fa',
  '#fb7185',
  '#f8fafc',
] as const;

export const BRUSH_WIDTHS = [2, 4, 8, 14, 24] as const;

export const DEFAULT_BRUSH = {
  color: BRUSH_PALETTE[0],
  width: BRUSH_WIDTHS[2],
  material: 'candy' as const,
};

export const METRICS_INTERVAL_MS = 200;

/** Hide the pointer after this long without a hand, so a stale ring does not
 *  float over the canvas forever. */
export const CURSOR_HIDE_AFTER_MS = 2500;

export type QualityTierConfig = {
  detectFps: number;
  /** Tube radial segments. */
  radialSegments: number;
  /** Multiplier on tubular segments of the CatmullRom tube. */
  tubularScale: number;
  bloom: boolean;
  /** Environment cube resolution; 0 disables the env map. */
  envResolution: number;
  dprMax: number;
  minPointDistance: number;
};

export const QUALITY_TIERS: Record<'high' | 'medium' | 'low', QualityTierConfig> = {
  high: {
    detectFps: 30,
    radialSegments: 12,
    tubularScale: 1,
    bloom: true,
    envResolution: 64,
    dprMax: 2,
    minPointDistance: MIN_POINT_DISTANCE,
  },
  medium: {
    detectFps: 24,
    radialSegments: 8,
    tubularScale: 0.7,
    bloom: true,
    envResolution: 32,
    dprMax: 1.5,
    minPointDistance: 0.002,
  },
  low: {
    detectFps: 18,
    radialSegments: 6,
    tubularScale: 0.5,
    bloom: false,
    envResolution: 0,
    dprMax: 1,
    minPointDistance: 0.0028,
  },
};
