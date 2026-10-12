import type { Point, Stroke } from '../../types/drawing';
import type { StrokeRenderer } from '../StrokeRenderer';
import { drawDot, prepareContext, tracePath, tracePolyline } from './polyline';
import { outline, strokePath, paintAlpha, PAPER_WIDTH, PAPER_HEIGHT } from './freehand';

/**
 * Two stacked canvases:
 *  - `historyCanvas` holds every committed stroke and is redrawn from the stored
 *    document points whenever the ink list *or the viewport* changes;
 *  - `liveCanvas` holds the stroke in progress, redrawn from its own document
 *    points for the same reasons.
 *
 * Keeping them apart means a long drawing session never costs more per frame than
 * the single new segment's repaint. Points arrive in document space and are mapped
 * to screen pixels through `setPlaneToScreen`, so history survives window resizes
 * **and** pans and zooms: every layer is re-projected from the same viewport
 * snapshot instead of keeping a private idea of where the sheet is.
 */
export class Canvas2DStrokeRenderer implements StrokeRenderer {
  readonly kind = 'canvas2d';

  private readonly historyCtx: CanvasRenderingContext2D;
  private readonly liveCtx: CanvasRenderingContext2D;

  private history: readonly Stroke[] = [];
  private glow = true;
  private planeToScreen: (point: Point) => Point = (point) => point;

  private color = '#22d3ee';
  private width = 4;
  private liveStroke: Stroke | null = null;
  /** The stroke in progress, in document space, so a nav change re-projects it. */
  private livePoints: Point[] = [];

  constructor(
    private readonly historyCanvas: HTMLCanvasElement,
    private readonly liveCanvas: HTMLCanvasElement,
  ) {
    const historyCtx = historyCanvas.getContext('2d');
    const liveCtx = liveCanvas.getContext('2d');
    if (!historyCtx || !liveCtx) {
      throw new Error('Canvas 2D context unavailable — this browser cannot run AirDraw.');
    }
    this.historyCtx = historyCtx;
    this.liveCtx = liveCtx;
    prepareContext(this.historyCtx);
    prepareContext(this.liveCtx);
  }

  setGlow(enabled: boolean): void {
    this.glow = enabled;
  }

  setPlaneToScreen(map: (point: Point) => Point): void {
    this.planeToScreen = map;
  }

  resize(widthCss: number, heightCss: number, dpr: number): void {
    for (const canvas of [this.historyCanvas, this.liveCanvas]) {
      canvas.width = Math.max(1, Math.round(widthCss * dpr));
      canvas.height = Math.max(1, Math.round(heightCss * dpr));
      canvas.style.width = `${widthCss}px`;
      canvas.style.height = `${heightCss}px`;
    }
    for (const ctx of [this.historyCtx, this.liveCtx]) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      prepareContext(ctx);
    }
    this.repaintHistory();
    this.repaintLive();
  }

  rebuild(strokes: readonly Stroke[]): void {
    this.history = strokes;
    this.repaintHistory();
  }

  /** Re-project the committed ink through the current viewport (pan / zoom). */
  repaintHistory(): void {
    const ctx = this.historyCtx;
    ctx.save();
    ctx.clearRect(0, 0, this.historyCanvas.width, this.historyCanvas.height);
    for (const stroke of this.history) this.drawStroke(ctx, stroke);
    ctx.restore();
  }

  /** Re-project the stroke in progress, so a zoom mid-stroke cannot smear it. */
  repaintLive(): void {
    const ctx = this.liveCtx;
    ctx.save();
    ctx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);
    if (this.livePoints.length > 0) {
      if (this.liveStroke?.mode === 'canvas') this.drawCanvasSegment(ctx, this.livePoints, this.liveStroke);
      else this.drawPoints(ctx, this.livePoints, this.color, this.width);
    }
    ctx.restore();
  }

  beginStroke(stroke: Stroke, firstPoint: Point): void {
    this.color = stroke.color;
    this.width = stroke.width;
    this.liveStroke = stroke;
    this.livePoints = [firstPoint];
    this.repaintLive();
  }

  extendStroke(point: Point): void {
    this.livePoints.push(point);
    this.repaintLive();
  }

  commitStroke(stroke: Stroke): void {
    // Keep the internal history in sync, otherwise the next resize/undo rebuild
    // would redraw from a stale list and drop this stroke.
    // The project bridge may already have rebuilt this ID during the store's commit
    // notification. Painting again would double marker/highlighter alpha.
    if (!this.history.some(saved => saved.id === stroke.id)) {
      this.history = [...this.history, stroke];
      this.drawStroke(this.historyCtx, stroke);
    }
    this.clearLive();
  }

  discardStroke(): void {
    this.clearLive();
  }

  clear(): void {
    this.history = [];
    this.historyCtx.clearRect(0, 0, this.historyCanvas.width, this.historyCanvas.height);
    this.clearLive();
  }

  dispose(): void {
    this.clear();
  }

  private drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
    for (const segment of stroke.segments) {
      if (stroke.mode === 'canvas') {
        this.drawCanvasSegment(ctx, segment, stroke);
        continue;
      }
      if (segment.length === 1) {
        drawDot(ctx, this.planeToScreen(segment[0]), stroke.color, stroke.width);
        continue;
      }
      this.drawPoints(ctx, segment, stroke.color, stroke.width);
    }
  }

  private drawCanvasSegment(ctx: CanvasRenderingContext2D, points: readonly Point[], stroke: Stroke): void {
    // Outline in document space first: zoom scales geometry AND width, while virtual
    // pressure remains independent of viewport size. Export uses this same outline.
    const polygon = outline([...points], stroke).map(([x, y]) => {
      const p = this.planeToScreen({ x: x / PAPER_WIDTH, y: y / PAPER_HEIGHT, z: 0 });
      return [p.x, p.y];
    });
    ctx.save();
    ctx.globalAlpha = paintAlpha(stroke.tool);
    ctx.fillStyle = stroke.color;
    ctx.fill(new Path2D(strokePath(polygon)));
    ctx.restore();
  }

  private drawPoints(ctx: CanvasRenderingContext2D, points: readonly Point[], color: string, width: number): void {
    const screen = points.map((point) => this.planeToScreen(point));
    if (screen.length === 1) {
      drawDot(ctx, screen[0], color, width);
      return;
    }
    tracePolyline(ctx, screen);
    tracePath(ctx, color, width, this.glow);
  }

  private clearLive(): void {
    this.liveCtx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);
    this.livePoints = [];
    this.liveStroke = null;
  }
}
