import type { Handedness } from './hand';

/**
 * Stroke points live in a normalized "drawing plane" space: x/y in [0,1]
 * (already mirrored), z in [-1,1] as a *small* depth-feedback term derived from
 * the index fingertip's metric depth. Storing plane space (not screen pixels)
 * lets the 2D canvas renderer and the 3D scene consume the same strokes, and
 * keeps history valid across window resizes.
 */
export type Point = { x: number; y: number; z: number };

/**
 * A stroke is one uninterrupted pinch session. Tracking can drop out mid-stroke;
 * instead of connecting the gap with a long jump line, the pen is lifted and the
 * next detected positions start a new segment of the same stroke.
 */
export type Stroke = {
  surface?: 'wood'|'metal'|'stone';
  mode?: 'canvas' | 'spatial';
  tool?: 'pen' | 'marker' | 'highlighter' | 'eraser';
  virtualPressure?: boolean;
  id: number;
  color: string;
  width: number;
  material: MaterialPresetId;
  segments: Point[][];
  /**
   * Tessellation factor stamped at commit time from the scene's ink budget:
   * a full canvas draws later strokes coarser instead of paying per-stroke
   * triangles forever, and ink already on the scene is never rebuilt.
   */
  lod: number;
};

export type MaterialPresetId = 'candy' | 'plastic' | 'metal' | 'glass' | 'neon';

/** The four pens of the dot canvas. Erasing is a pen here, not a separate mode. */
export type CanvasTool = 'pen' | 'marker' | 'highlighter' | 'eraser';

export type Brush = {
  color: string;
  width: number;
  material: MaterialPresetId;
};

/** Perceptual state of the pointer, drives cursor styling and status text. */
export type PointerState = 'searching' | 'tracking' | 'lost' | 'drawing';

export type CursorState = {
  x: number;
  y: number;
  visible: boolean;
  /** 0 = open hand, 1 = fully pinched. */
  pinch: number;
  /** Confirmed pinch state (the spatial "mouse button"). */
  pinched: boolean;
  drawing: boolean;
  pointerState: PointerState;
};

export type GestureName = 'NONE' | 'POINT' | 'PINCH' | 'OPEN_PALM' | 'FIST' | 'VICTORY';

export type GestureState = {
  gesture: GestureName;
  /** 0..10, fingerpose-style weighted score of the winning description. */
  confidence: number;
  durationMs: number;
  handedness: Handedness | null;
};

export type QualityTier = 'high' | 'medium' | 'low';

export type ViewMode = '3d' | '2d';

export type EngineMetrics = {
  renderFps: number;
  sceneFps: number;
  detectFps: number;
  inferenceMs: number;
  /** Smoothed, plane space. */
  index: Point | null;
  thumb: Point | null;
  palm: Point | null;
  indexRaw: Point | null;
  /** thumb-tip ↔ index-tip distance divided by palm length (scale invariant). */
  pinchRatio: number | null;
  /** Latched pinch (hysteresis + confirm frames), i.e. the spatial button. */
  pinched: boolean;
  pinchDistancePx: number;
  palmScalePx: number;
  /** Handedness category score of the primary hand (the only confidence signal). */
  confidence: number;
  drawing: boolean;
  pointerState: PointerState;
  gesture: GestureName;
  gestureConfidence: number;
  gestureDurationMs: number;
  handCount: number;
  primaryHandedness: Handedness | null;
  strokeCount: number;
  activePointCount: number;
  trajectoryPoints: number;
  lostForMs: number;
  smoothingLatencyMs: number;
  /** Detection timestamp → cursor publish, the perceived interaction latency. */
  gestureLatencyMs: number;
  /** Distance between the two palms; drives view-mode zoom. */
  handsDistancePx: number;
  outliersRejected: number;
  videoWidth: number;
  videoHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  mapperScale: number;
  mirrored: boolean;
  delegate: string;
  qualityTier: QualityTier;
  drawCalls: number;
  geometries: number;
  viewMode: ViewMode;
};

export const EMPTY_METRICS: EngineMetrics = {
  renderFps: 0,
  sceneFps: 0,
  detectFps: 0,
  inferenceMs: 0,
  index: null,
  thumb: null,
  palm: null,
  indexRaw: null,
  pinchRatio: null,
  pinched: false,
  pinchDistancePx: 0,
  palmScalePx: 0,
  confidence: 0,
  drawing: false,
  pointerState: 'searching',
  gesture: 'NONE',
  gestureConfidence: 0,
  gestureDurationMs: 0,
  handCount: 0,
  primaryHandedness: null,
  strokeCount: 0,
  activePointCount: 0,
  trajectoryPoints: 0,
  lostForMs: 0,
  smoothingLatencyMs: 0,
  gestureLatencyMs: 0,
  handsDistancePx: 0,
  outliersRejected: 0,
  videoWidth: 0,
  videoHeight: 0,
  canvasWidth: 0,
  canvasHeight: 0,
  mapperScale: 1,
  mirrored: true,
  delegate: '-',
  qualityTier: 'high',
  drawCalls: 0,
  geometries: 0,
  viewMode: '3d',
};
