import type { Point } from '../../types/drawing';

/**
 * Canvas 2D polyline helpers.
 *
 * Points are connected with quadratic curves through segment midpoints instead
 * of straight lines: the curve always passes through the midpoints and uses the
 * sampled points as control points, which turns the residual jitter of hand
 * tracking into smooth, continuous ink.
 */

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

export function prepareContext(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** A single tap should still leave a visible dot. */
export function drawDot(ctx: CanvasRenderingContext2D, point: Point, color: string, width: number): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, Math.max(width / 2, 0.6), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function strokePath(ctx: CanvasRenderingContext2D, color: string, width: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

/** Wide translucent pass under the solid core, for a bright neon look without
 *  the per-segment cost of `shadowBlur`. */
export function tracePath(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  glow: boolean,
): void {
  if (glow) strokePath(ctx, color, width * 2.6, 0.14);
  strokePath(ctx, color, width, 1);
}

/** Build the smooth path for a whole polyline (used for history redraws). */
export function tracePolyline(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  if (points.length === 0) return;
  ctx.beginPath();
  if (points.length === 1) {
    // Zero-length path: moveTo + lineTo to the same point keeps round caps rendering a dot.
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[0].x + 0.01, points[0].y);
    return;
  }

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = midpoint(points[i], points[i + 1]);
    ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

/**
 * Incremental piece of the same curve: from the previous midpoint, through the
 * previous point, to the new midpoint. Matches `tracePolyline` output exactly,
 * so live ink looks identical once it is baked into history.
 */
export function traceIncrement(
  ctx: CanvasRenderingContext2D,
  fromMid: Point,
  control: Point,
  toMid: Point,
): void {
  ctx.beginPath();
  ctx.moveTo(fromMid.x, fromMid.y);
  ctx.quadraticCurveTo(control.x, control.y, toMid.x, toMid.y);
}

export { midpoint };
