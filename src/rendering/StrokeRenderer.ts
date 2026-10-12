import type { Point, Stroke } from '../types/drawing';

/**
 * Renderer-agnostic contract for the drawing layer.
 *
 * Phase 1 ships `Canvas2DStrokeRenderer`. A future Three.js / React Three Fiber
 * renderer (extruded 3D strokes, tubes, bloom, metal/glass materials) implements
 * this same interface and is swapped in with `DrawEngine.attachRenderer()` —
 * nothing in the engine, hooks or components has to change.
 *
 * The live/history split exists because history is redrawn rarely (undo, clear,
 * resize) while the stroke in progress must be extended every frame without
 * replaying its whole point list.
 */
export interface StrokeRenderer {
  readonly kind: string;

  /** Resize the backing surface. `dpr` is the device pixel ratio to render at. */
  resize(widthCss: number, heightCss: number, dpr: number): void;

  /**
   * Strokes are stored in normalized plane space; the 2D renderer needs the
   * plane→screen transform to draw them (the 3D scene uses its own plane→world
   * transform and ignores this).
   */
  setPlaneToScreen(map: (point: Point) => Point): void;

  /** Replace and redraw all committed history. */
  rebuild(strokes: readonly Stroke[]): void;

  /** Start live drawing. Called again after a tracking gap to open a new segment. */
  beginStroke(stroke: Stroke, firstPoint: Point): void;

  /** Append one point to the live stroke. Must be O(1). */
  extendStroke(point: Point): void;

  /** Bake the finished stroke into history and clear the live layer. */
  commitStroke(stroke: Stroke): void;

  /** Drop the live layer without committing (stroke aborted). */
  discardStroke(): void;

  clear(): void;

  dispose(): void;
}
