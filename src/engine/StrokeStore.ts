import { INK_BUDGET_POINTS, INK_LOD_MIN, MAX_POINTS_PER_SEGMENT, MIN_POINT_DISTANCE } from '../config';
import type { MaterialPresetId, Point, Stroke } from '../types/drawing';

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
  private readonly redoStack: {kind:'add'|'erase';stroke:Stroke;index:number}[] = [];
  private readonly undoStack: {kind:'add'|'erase';stroke:Stroke;index:number}[] = [];
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
    if(action.kind==='add'){const index=this.strokes.indexOf(action.stroke);if(index>=0)this.strokes.splice(index,1);}else this.strokes.splice(action.index,0,action.stroke);
    this.redoStack.push(action);
    this.notify();
    return true;
  }

  redo(): boolean {
    const action=this.redoStack.pop();if(!action)return false;
    if(action.kind==='add')this.strokes.splice(action.index,0,action.stroke);else{const index=this.strokes.indexOf(action.stroke);if(index>=0)this.strokes.splice(index,1);}
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

  replaceAll(strokes: readonly Stroke[],notify=true): void {
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
