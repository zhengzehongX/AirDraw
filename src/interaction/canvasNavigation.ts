import { ZOOM_LIMITS, type ViewportState } from '../rendering/canvas2d/viewport';

/** Screen/container pixels: navigation never needs a depth component. */
export type Vec2 = { x: number; y: number };

/**
 * The dot canvas's navigation state machine: idle → pan | zoom → frozen → idle.
 *
 * One owner per frame, chosen by explicit transitions rather than by whichever
 * component happens to recognise a shape: an open palm over the sheet pans it, two
 * open hands zoom it about their midpoint, and anything that belongs to someone
 * else — a pinch, a captured button, an open popover, the pen being down — wins
 * first and ends the session.
 *
 * Every session is **absolute**: the frame that engages it freezes `palmStart` /
 * `midStart` / `distanceStart` together with the viewport it started from, and each
 * later frame recomputes the whole viewport from that baseline
 * (`offset = offsetStart + gain × (palm − palmStart)`,
 * `zoom = clamp(zoomStart × d/d0)`, `offset = mid − base(anchor) × zoom`).
 * Nothing is ever added to the current offset, so a stable hand produces exactly
 * the same viewport on frame 1 and frame 3000, and a 100px hand move is a 100px
 * sheet move no matter how many results arrived in between. The anchor lives in
 * base space (the container mapping before any navigation), which is what keeps the
 * content under the two hands under the two hands instead of drifting to a screen
 * centre.
 *
 * All confirmations are wall-clock milliseconds, not frame counts: at 4 fps a
 * "three frame" hold is a different gesture than at 30 fps.
 */
export type CanvasNavMode = 'idle' | 'pan' | 'zoom' | 'frozen';

export type CanvasNavInput = {
  now: number;
  handPresent: boolean;
  /** Palm centre in container CSS pixels — stable bones, never a fingertip, and
   *  never a point that was inverse-transformed through the live viewport. */
  palmScreen: Vec2 | null;
  /** 0..1 how open the primary hand is. */
  openness: number;
  pinched: boolean;
  drawing: boolean;
  /** Someone else owns this frame: a hovered/pressed control, a popover, inspect. */
  uiBusy: boolean;
  two: { active: boolean; midpointScreen: Vec2 | null; distancePx: number } | null;
  /** A second hand is in frame even before the pair is stable enough to zoom. */
  twoPresent: boolean;
  panSpeed: number;
  zoomSensitivity: number;
  /** The viewport this frame sees; sessions snapshot it when they engage. */
  view: ViewportState;
  /** Screen → document, for freezing the zoom anchor at session start. */
  toDoc: (screen: Vec2) => Vec2;
  /** Document → base screen (zoom 1, offset 0), for re-applying that anchor. */
  toBase: (doc: Vec2) => Vec2;
};

export type CanvasNavEffect = {
  started: boolean;
  ended: boolean;
  /** The complete viewport for this frame, or nothing when the view must not move. */
  view?: ViewportState;
};

export const CANVAS_NAV = {
  /** An open palm has to hold still this long before it owns the sheet. */
  engageMs: 240,
  openness: 0.62,
  /** Below this the two hands are one blob, not a pinch-to-zoom gesture. */
  minTwoDistancePx: 70,
  /** A hand gone this long ends the session outright; shorter only freezes. */
  lossResetMs: 700,
  /** Smaller view changes than this are not worth a repaint. */
  viewEpsilon: 0.01,
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const sameView = (a: ViewportState, b: ViewportState): boolean =>
  Math.abs(a.zoom - b.zoom) < CANVAS_NAV.viewEpsilon &&
  Math.abs(a.offsetX - b.offsetX) < CANVAS_NAV.viewEpsilon &&
  Math.abs(a.offsetY - b.offsetY) < CANVAS_NAV.viewEpsilon;

export class CanvasNavigation {
  mode: CanvasNavMode = 'idle';
  reason: string | null = null;
  twoDistancePx = 0;

  private engagedAt = 0;
  private lostSince = 0;
  /** Immutable pan baseline. */
  private palmStart: Vec2 | null = null;
  private offsetStart: Vec2 | null = null;
  /** Immutable zoom baseline. */
  private midStart: Vec2 | null = null;
  private distanceStart = 0;
  private zoomStart = 1;
  private anchorBase: Vec2 | null = null;

  snapshot() {
    return { mode: this.mode, reason: this.reason, twoDistancePx: Math.round(this.twoDistancePx) };
  }

  /** Leaving the canvas (or the mode) must not leave a session holding a baseline. */
  reset(reason: string | null = null): void {
    this.mode = 'idle';
    this.reason = reason;
    this.engagedAt = 0;
    this.lostSince = 0;
    this.palmStart = null;
    this.offsetStart = null;
    this.midStart = null;
    this.distanceStart = 0;
    this.zoomStart = 1;
    this.anchorBase = null;
  }

  update(input: CanvasNavInput): CanvasNavEffect {
    const effect: CanvasNavEffect = { started: false, ended: false };
    this.twoDistancePx = input.two?.distancePx ?? 0;

    if (!input.handPresent) {
      // Freeze first: the sheet must not coast on a trajectory nobody is making.
      if (this.mode === 'pan' || this.mode === 'zoom') {
        this.mode = 'frozen';
        this.reason = 'hand lost';
        this.lostSince = input.now;
        this.palmStart = null;
        this.midStart = null;
        effect.ended = true;
      } else if (this.mode === 'frozen' && input.now - this.lostSince > CANVAS_NAV.lossResetMs) {
        this.reset('hand lost');
      }
      return effect;
    }

    const busy = input.pinched || input.drawing || input.uiBusy;
    if (busy) {
      if (this.mode !== 'idle') {
        this.reset(input.pinched ? 'pinch took over' : input.drawing ? 'pen down' : 'ui captured');
        effect.ended = true;
      }
      this.engagedAt = 0;
      return effect;
    }

    const twoReady =
      !!input.two?.active &&
      !!input.two.midpointScreen &&
      input.two.distancePx >= CANVAS_NAV.minTwoDistancePx &&
      input.openness >= CANVAS_NAV.openness;

    // Upgrade: a panning hand joined by a second one becomes a zoom session with a
    // fresh baseline, never a pan that keeps dragging with two anchors.
    if (twoReady && this.mode !== 'zoom') {
      this.mode = 'zoom';
      this.reason = null;
      const mid0 = input.two!.midpointScreen as Vec2;
      this.midStart = mid0;
      this.distanceStart = input.two!.distancePx;
      this.zoomStart = input.view.zoom;
      this.anchorBase = input.toBase(input.toDoc(mid0));
      this.palmStart = null;
      this.offsetStart = null;
      effect.started = true;
      return effect;
    }

    if (this.mode === 'zoom') {
      const mid = input.two?.midpointScreen ?? null;
      const distance = input.two?.distancePx ?? 0;
      if (!input.two?.active || !mid || distance < CANVAS_NAV.minTwoDistancePx * 0.7) {
        // One hand left or the hands crossed: freeze, then let a stable remainder
        // start its own session from its own baseline.
        this.mode = 'frozen';
        this.reason = 'hands separated';
        this.lostSince = input.now;
        this.midStart = null;
        this.distanceStart = 0;
        effect.ended = true;
        return effect;
      }
      if (this.midStart && this.anchorBase && this.distanceStart > 0) {
        // Invalid geometry never divides: a collapsed or swapped pair holds the view.
        const zoom = clamp(
          this.zoomStart * Math.pow(distance / this.distanceStart, input.zoomSensitivity),
          ZOOM_LIMITS.min,
          ZOOM_LIMITS.max,
        );
        const next: ViewportState = {
          zoom,
          offsetX: mid.x - this.anchorBase.x * zoom,
          offsetY: mid.y - this.anchorBase.y * zoom,
        };
        if (!sameView(next, input.view)) effect.view = next;
      }
      return effect;
    }

    const palmOpen = input.openness >= CANVAS_NAV.openness && !!input.palmScreen;
    // A second hand in frame means the pair is about to own the sheet: a lone-palm
    // pan must not run on half of an undecided pair, or the board saws back and
    // forth while the zoom session is still earning its engage hold.
    if (input.twoPresent && this.mode === 'pan') {
      this.mode = 'frozen';
      this.reason = 'second hand arrived';
      this.lostSince = input.now;
      this.palmStart = null;
      effect.ended = true;
      return effect;
    }
    if (!palmOpen || input.twoPresent) {
      if (this.mode === 'pan') {
        this.reset('hand closed');
        effect.ended = true;
      }
      this.engagedAt = 0;
      this.palmStart = null;
      return effect;
    }

    if (this.mode === 'frozen') {
      // A returning hand waits out the engage hold again before it owns anything.
      this.mode = 'idle';
      this.reason = null;
      this.engagedAt = 0;
      this.palmStart = null;
    }

    if (this.mode === 'idle') {
      if (!this.engagedAt) this.engagedAt = input.now;
      if (input.now - this.engagedAt >= CANVAS_NAV.engageMs) {
        this.mode = 'pan';
        this.reason = null;
        this.palmStart = input.palmScreen;
        this.offsetStart = { x: input.view.offsetX, y: input.view.offsetY };
        effect.started = true;
      }
      return effect;
    }

    // pan: the whole viewport is recomputed from the session baseline, so a still
    // hand yields the same offset forever and no per-frame error can accumulate.
    if (this.palmStart && this.offsetStart && input.palmScreen) {
      const next: ViewportState = {
        zoom: input.view.zoom,
        offsetX: this.offsetStart.x + (input.palmScreen.x - this.palmStart.x) * input.panSpeed,
        offsetY: this.offsetStart.y + (input.palmScreen.y - this.palmStart.y) * input.panSpeed,
      };
      if (!sameView(next, input.view)) effect.view = next;
    }
    return effect;
  }
}
