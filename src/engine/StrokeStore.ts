import { INK_BUDGET_POINTS, INK_LOD_MIN, MAX_POINTS_PER_SEGMENT, MIN_POINT_DISTANCE } from '../config';
import type { MaterialPresetId, Point, Stroke } from '../types/drawing';

type StrokeAction =
  | { kind: 'add'; stroke: Stroke; index: number }
  | { kind: 'erase'; stroke: Stroke; index: number }
  | { kind: 'replace'; before: readonly Stroke[]; after: readonly Stroke[] };

type EraseOptions = {
  /** Eraser path and projected strokes must use this same coordinate space. */
  path: readonly Point[];
  radius: number;
  editable?: (stroke: Stroke) => boolean;
  project?: (stroke: Stroke) => Stroke;
  projectPoint?: (point: Point) => Point;
  strokeRadius?: (stroke: Stroke, projected: Stroke) => number;
};

function distanceToPath(point: Point, path: readonly Point[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return Math.hypot(point.x - path[0].x, point.y - path[0].y, (point.z ?? 0) - (path[0].z ?? 0));
  let best = Infinity;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1], b = path[i];
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z ?? 0) - (a.z ?? 0);
    const lengthSq = dx * dx + dy * dy + dz * dz;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy + ((point.z ?? 0) - (a.z ?? 0)) * dz) / lengthSq));
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t), (point.z ?? 0) - ((a.z ?? 0) + dz * t)));
  }
  return best;
}

function interpolate(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** Clip a sampled segment against the eraser capsule, retaining exact stroke coordinates. */
function clipSegment(
  source: readonly Point[],
  projected: readonly Point[],
  path: readonly Point[],
  radius: number,
  projectPoint: (point: Point) => Point,
): Point[][] | null {
  if (source.length === 0) return null;
  if (source.length !== projected.length) return null;
  const mapped = projected.map(projectPoint);
  const pathMinX = Math.min(...path.map(p => p.x)), pathMaxX = Math.max(...path.map(p => p.x));
  const pathMinY = Math.min(...path.map(p => p.y)), pathMaxY = Math.max(...path.map(p => p.y));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of mapped) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  if (maxX < pathMinX - radius || minX > pathMaxX + radius || maxY < pathMinY - radius || minY > pathMaxY + radius) return null;
  const erased = (p: Point) => distanceToPath(p, path) <= radius;
  if (source.length === 1) return erased(mapped[0]) ? [] : null;

  let touched = erased(mapped[0]);
  const output: Point[][] = [];
  let fragment: Point[] | null = erased(mapped[0]) ? null : [{ ...source[0] }];
  let previousInside = erased(mapped[0]);

  for (let edge = 0; edge < source.length - 1; edge += 1) {
    const sourceA = source[edge], sourceB = source[edge + 1];
    const mapA = mapped[edge], mapB = mapped[edge + 1];
    const length = Math.hypot(mapB.x - mapA.x, mapB.y - mapA.y, (mapB.z ?? 0) - (mapA.z ?? 0));
    const steps = Math.max(1, Math.min(256, Math.ceil(length / Math.max(1, radius * 0.35))));
    let previousT = 0;
    // The first sample is also the previous edge's final sample.
    previousInside = erased(mapA);

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const currentMap = interpolate(mapA, mapB, t);
      const currentInside = erased(currentMap);
      if (currentInside) touched = true;

      if (currentInside !== previousInside) {
        let lo = previousT, hi = t;
        const loInside = previousInside;
        for (let iteration = 0; iteration < 9; iteration += 1) {
          const mid = (lo + hi) / 2;
          if (erased(interpolate(mapA, mapB, mid)) === loInside) lo = mid;
          else hi = mid;
        }
        const boundary = interpolate(sourceA, sourceB, (lo + hi) / 2);
        if (previousInside) {
          fragment = [boundary];
        } else {
          if (fragment) fragment.push(boundary);
          if (fragment && fragment.length > 0) output.push(fragment);
          fragment = null;
        }
      }

      if (step === steps && !currentInside) {
        if (!fragment) fragment = [];
        const last = fragment[fragment.length - 1];
        if (!last || Math.hypot(last.x - sourceB.x, last.y - sourceB.y, last.z - sourceB.z) > 1e-9) fragment.push({ ...sourceB });
      }
      previousInside = currentInside;
      previousT = t;
    }
  }
  if (fragment?.length) output.push(fragment);
  return touched ? output : null;
}

/**
 * Owns stroke history.
 *
 * A stroke is one pinch session. When tracking drops out mid-stroke the pen is
 * lifted (`lift`) instead of the stroke being finished, so resuming appends a
 * new segment rather than a long jump line — and a single undo still removes the
 * whole gesture the user made.
 *
 * Points are stored in normalized plane space, so history stays valid across
 * window resizes and can feed both the 2D and 3D renderers.
 */
export class StrokeStore {
  private readonly strokes: Stroke[] = [];
  private readonly redoStack: StrokeAction[] = [];
  private readonly undoStack: StrokeAction[] = [];
  private eraseBefore: readonly Stroke[] | null = null;
  private active: Stroke | null = null;
  private openSegment = false;
  private nextId = 1;
  private readonly listeners = new Set<() => void>();
  private minPointDistance = MIN_POINT_DISTANCE;

  get committed(): readonly Stroke[] {
    return this.strokes;
  }

  get activeStroke(): Stroke | null {
    return this.active;
  }

  get strokeCount(): number {
    return this.strokes.length;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  private countPoints(strokes: readonly Stroke[]): number {
    let total = 0;
    for (const stroke of strokes) for (const segment of stroke.segments) total += segment.length;
    return total;
  }

  /** Ink already committed, in raw sample points — drives the commit-time LOD. */
  get committedPointCount(): number {
    return this.countPoints(this.strokes);
  }

  get activePointCount(): number {
    if (!this.active) return 0;
    return this.countPoints([this.active]);
  }

  /** Performance governor: coarser sampling on weak devices. */
  setMinPointDistance(value: number): void {
    this.minPointDistance = value;
  }
  get samplingDistance(): number { return this.minPointDistance; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  begin(color: string, width: number, material: MaterialPresetId, point: Point): Stroke {
    this.active = { id: this.nextId++, color, width, material, segments: [[{ ...point }]], lod: 1 };
    this.openSegment = true;
    this.redoStack.length = 0;
    return this.active;
  }

  /** @returns false when the point was too close to the previous one to keep. */
  append(point: Point, measuredDistance?: number, minimum = this.minPointDistance): boolean {
    const segment = this.currentSegment();
    if (!segment) return false;
    const last = segment[segment.length - 1];
    if ((measuredDistance ?? Math.hypot(point.x - last.x, point.y - last.y)) < minimum) return false;
    segment.push({ ...point });
    // Bound memory/GPU cost of marathon strokes: compress instead of growing.
    if (segment.length > MAX_POINTS_PER_SEGMENT) this.compress(segment);
    return true;
  }

  /** Pen stays logically down, but the current polyline ends here. */
  lift(): void {
    this.openSegment = false;
  }

  /** Continue the same stroke after tracking came back. */
  resume(point: Point): void {
    if (!this.active) return;
    this.active.segments.push([{ ...point }]);
    this.openSegment = true;
  }

  /** Finalise the pinch session. @returns the committed stroke, if it has ink. */
  commit(): Stroke | null {
    const stroke = this.active;
    this.active = null;
    this.openSegment = false;
    if (!stroke) return null;

    stroke.segments = stroke.segments.filter((segment) => segment.length > 0);
    if (stroke.segments.length === 0) return null;

    // Ink already on the scene keeps its tessellation; only what comes next is
    // allowed to be cheaper, so frame cost grows sub-linearly with the canvas.
    let points = 0;
    for (const segment of stroke.segments) points += segment.length;
    stroke.lod = Math.min(1, Math.max(INK_LOD_MIN, INK_BUDGET_POINTS / (this.committedPointCount + points)));

    this.strokes.push(stroke);
    this.undoStack.push({kind:'add',stroke,index:this.strokes.length-1});
    this.notify();
    return stroke;
  }

  abort(): void {
    this.active = null;
    this.openSegment = false;
  }

  undo(): boolean {
    const action=this.undoStack.pop();if(!action)return false;
    if(action.kind==='add'){const index=this.strokes.indexOf(action.stroke);if(index>=0)this.strokes.splice(index,1);}
    else if(action.kind==='erase')this.strokes.splice(action.index,0,action.stroke);
    else this.strokes.splice(0,this.strokes.length,...action.before);
    this.redoStack.push(action);
    this.notify();
    return true;
  }

  redo(): boolean {
    const action=this.redoStack.pop();if(!action)return false;
    if(action.kind==='add')this.strokes.splice(action.index,0,action.stroke);
    else if(action.kind==='erase'){const index=this.strokes.indexOf(action.stroke);if(index>=0)this.strokes.splice(index,1);}
    else this.strokes.splice(0,this.strokes.length,...action.after);
    this.undoStack.push(action);
    this.notify();
    return true;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Erase tool: remove whichever stroke the tip is touching. */
  removeNear(point: Point, radius: number, editable:(stroke:Stroke)=>boolean=()=>true,project:(stroke:Stroke)=>Stroke=s=>s): boolean {
    for (let i = this.strokes.length - 1; i >= 0; i -= 1) {
      const stroke = this.strokes[i];
      if(!editable(stroke))continue;
      const hit = project(stroke).segments.some((segment) =>
        segment.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < radius),
      );
      if (hit) {
        this.strokes.splice(i, 1);
        this.undoStack.push({kind:'erase',stroke,index:i});this.redoStack.length=0;
        this.notify();
        return true;
      }
    }
    return false;
  }

  /** Start one local-erase undo transaction for a continuous pinch session. */
  beginEraseSession(): void {
    if (!this.eraseBefore) this.eraseBefore = [...this.strokes];
  }

  /**
   * Erase only the portions touched by the path. Geometry is clipped in a projected
   * coordinate space, while the retained samples remain in the original document
   * space so transforms, save/open and redo keep the same data model.
   */
  eraseAlong(options: EraseOptions): boolean {
    if (options.path.length === 0 || !Number.isFinite(options.radius) || options.radius <= 0) return false;
    this.beginEraseSession();
    const editable = options.editable ?? (() => true);
    const project = options.project ?? ((stroke: Stroke) => stroke);
    const projectPoint = options.projectPoint ?? ((point: Point) => point);
    let changed = false;

    for (let i = this.strokes.length - 1; i >= 0; i -= 1) {
      const stroke = this.strokes[i];
      if (!editable(stroke)) continue;
      const projected = project(stroke);
      if (projected.segments.length !== stroke.segments.length) continue;
      const radius = options.radius + Math.max(0, options.strokeRadius?.(stroke, projected) ?? 0);
      let strokeChanged = false;
      const segments: Point[][] = [];
      for (let s = 0; s < stroke.segments.length; s += 1) {
        const clipped = clipSegment(stroke.segments[s], projected.segments[s], options.path, radius, projectPoint);
        if (clipped === null) segments.push(stroke.segments[s]);
        else {
          strokeChanged = true;
          segments.push(...clipped);
        }
      }
      if (strokeChanged) {
        if (segments.length === 0) this.strokes.splice(i, 1);
        else this.strokes[i] = { ...stroke, segments };
        changed = true;
      }
    }
    if (changed) this.notify();
    return changed;
  }

  /** Commit all local clipping from one pinch as a single undo/redo step. */
  finishEraseSession(): boolean {
    const before = this.eraseBefore;
    this.eraseBefore = null;
    if (!before || (before.length === this.strokes.length && before.every((stroke, index) => stroke === this.strokes[index]))) return false;
    this.undoStack.push({ kind: 'replace', before, after: [...this.strokes] });
    this.redoStack.length = 0;
    return true;
  }

  replaceAll(strokes: readonly Stroke[],notify=true): void {
    this.eraseBefore = null;
    this.undoStack.length=0;
    this.strokes.length = 0;
    for (const stroke of strokes) {
      this.strokes.push(stroke);
      this.undoStack.push({kind:'add',stroke,index:this.strokes.length-1});
      this.nextId = Math.max(this.nextId, stroke.id + 1);
    }
    this.redoStack.length = 0;
    if(notify)this.notify();
  }

  clear(): boolean {
    this.eraseBefore = null;
    this.redoStack.length = 0;
    this.undoStack.length=0;
    if (this.strokes.length === 0) return false;
    this.strokes.length = 0;
    this.notify();
    return true;
  }

  /** Uniform-ish decimation keeping endpoints, halving the point count. */
  private compress(segment: Point[]): void {
    const kept: Point[] = [segment[0]];
    for (let i = 1; i < segment.length - 1; i += 2) kept.push(segment[i]);
    kept.push(segment[segment.length - 1]);
    segment.length = 0;
    segment.push(...kept);
  }

  private currentSegment(): Point[] | null {
    if (!this.active || !this.openSegment) return null;
    const segments = this.active.segments;
    return segments.length > 0 ? segments[segments.length - 1] : null;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
