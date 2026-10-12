import { GESTURE_COOLDOWN_MS, HOVER_DWELL_MS } from '../config';
import type { Point } from '../types/drawing';
import type { ContactState } from '../utils/gesture/PinchContactDetector';

export type InteractionState = 'idle' | 'hover' | 'press' | 'drag' | 'cooling' | 'lost';

export type InteractiveRegion = {
  id: string;
  getElement: () => HTMLElement | null;
  /**
   * Which application context may receive this region's input. Regions from an
   * inactive context are not hit-tested at all, so a Help page's buttons can
   * never be clicked "through" the canvas and vice versa.
   */
  scope?: string;
  /** Pinch released over the region (the spatial "click"). */
  onActivate?: () => void;
  /** Hold-to-confirm regions (destructive actions): progress 0..1 each frame. */
  onHoldProgress?: (progress: number) => void;
  onHoldComplete?: () => void;
  /** Pinch + move inside the region (sliders, colour rings). */
  onDrag?: (point: Point, delta: Point) => void;
  onPressStart?: () => void;
  onPressEnd?: (cancelled:boolean) => void;
  dragThreshold?: number;
  /** When set, activation requires a sustained pinch of this length. */
  holdMs?: number;
  /** Extra snap radius in px beyond the visual bounds. */
  magnet?: number;
  isDisabled?: () => boolean;
};

export type InteractionSnapshot = {
  successId:string|null;
  contactState: ContactState;
  /** 0..1 evidence the pinch is coming, so the cursor can close its ring continuously. */
  contactScore: number;
  state: InteractionState;
  hoverId: string | null;
  /** True when the hovered region would actually do something on release. */
  hoverActionable: boolean;
  /**
   * True when the cursor is over any live region at all (including an inert
   * cluster zone). The pen lifts over that, so a pinch in the gap between two
   * dock buttons can never draw behind the dock — while the magnetic halo
   * *outside* a region still lets you draw normally.
   */
  overTarget: boolean;
  pressId: string | null;
  holdProgress: number;
  /** Raw cursor and the magnetically snapped position used for display. */
  cursor: Point;
  snapped: Point;
};

const COOLDOWN_MS = GESTURE_COOLDOWN_MS;
const DRAG_THRESHOLD_PX = 10;
const HIT_TOLERANCE_PX = 10;
/** Extra band that keeps a hover alive while the cursor trembles on an edge. */
const HOVER_HYSTERESIS_PX = 16;
/**
 * Asking the DOM what is painted on top of a region is a layout query, and the
 * manager runs at display rate. Occlusion only changes when something is mounted,
 * moved or scrolled — all of which already invalidate rects — so the answer is
 * reused for a beat instead of being recomputed per frame.
 */
const OCCLUSION_TTL_MS = 120;

type Rect = { left: number; top: number; right: number; bottom: number; cx: number; cy: number };

/**
 * The single owner of spatial UI semantics. Buttons never interpret gestures
 * themselves — they register a region and receive hover/press/drag/hold
 * callbacks. The manager enforces the interaction grammar:
 *
 *   aim → stable hover (dwell) → pinch (press) → release over target = activate
 *
 * plus a global gesture lock/cooldown so one pinch can never fire two buttons,
 * magnetic hit regions tolerant of camera jitter, drag support for sliders,
 * hold-to-confirm for destructive actions, and a hard cancel when the hand is
 * lost (the last landmark position must never click anything).
 */
export class GestureInteractionManager {
  private readonly regions = new Map<string, InteractiveRegion>();
  private readonly rects = new Map<string, Rect>();
  private readonly coveredCache = new Map<string, { at: number; covered: boolean }>();
  private readonly listeners = new Set<(snapshot: InteractionSnapshot) => void>();

  private state: InteractionState = 'idle';
  private hoverId: string | null = null;
  private hoverSince = 0;
  private overAny = false;
  private pressId: string | null = null;
  private pressPoint: Point = { x: 0, y: 0, z: 0 };
  private pressStartedAt = 0;
  private dragging = false;
  private holdProgress = 0;
  private cooldownUntil = 0;
  private lastRectsAt = 0;
  private activeScope = 'global';
  private owner: 'ui' | 'toy' = 'ui';
  private lastActivated: string | null = null;
  private successUntil=0;
  /** Bumped on every activation, so the value alone cannot look "already done" to a caller. */
  private activations = 0;

  private cursor: Point = { x: -1, y: -1, z: 0 };
  private snapped: Point = { x: -1, y: -1, z: 0 };
  private pinched = false;
  private handPresent = false;
  private locked = false;
  private contactState:ContactState='OPEN';
  private contactScore=0;
  /** When the current contact began, and when the cursor last moved meaningfully. */
  private contactSince=0;
  private lastMoveAt=0;
  private lastCursor:Point={x:-1,y:-1,z:0};
  private freshContact=false;
  private lastFeed=0;
  private feedInterval=0;

  private rafId = 0;
  private running = false;

  readonly snapshot: InteractionSnapshot = {
    successId:null,
    contactState:'OPEN',
    contactScore:0,
    state: 'idle',
    hoverId: null,
    hoverActionable: false,
    overTarget: false,
    pressId: null,
    holdProgress: 0,
    cursor: { x: -1, y: -1, z: 0 },
    snapped: { x: -1, y: -1, z: 0 },
  };

  register(region: InteractiveRegion): () => void {
    this.regions.set(region.id, region);
    this.invalidateRects();
    return () => {
      // Identity check: a stale unmount must never delete a live region that was
      // registered later under the same id (StrictMode remounts, screen swaps).
      if (this.regions.get(region.id) !== region) return;
      this.regions.delete(region.id);
      this.rects.delete(region.id);
      if (this.hoverId === region.id) this.hoverId = null;
      if (this.pressId === region.id) this.cancelPress();
    };
  }

  /** Only regions in the active scope (or scope-less "global" ones) take input. */
  setActiveScope(scope: string): void {
    if (scope === this.activeScope) return;
    this.activeScope = scope;
    this.hoverId = null;
    this.cancelPress();
    this.invalidateRects();
  }

  /**
   * Who owns the screen for pinches. `'toy'` is set by PlayLab while a toy is
   * playing; every region that is not the toy's own chrome then goes inert, so one
   * pinch can only ever be spent once.
   */
  setScreenOwner(owner: 'ui' | 'toy'): void {
    if (owner === this.owner) return;
    this.owner = owner;
    this.hoverId = null;
    this.cancelPress();
    this.invalidateRects();
  }

  get screenOwner(): 'ui' | 'toy' {
    return this.owner;
  }

  get scope(): string {
    return this.activeScope;
  }

  invalidateRects(): void {
    this.lastRectsAt = 0;
    this.coveredCache.clear();
  }

  /** True when the point lies over any registered region (used for dock auto-hide). */
  containsPoint(point: Point, pad = 0): boolean {
    return this.hitTest(point, pad) !== null;
  }
  distanceToTargets(point:Point):number|null {
    let nearest=Infinity;
    for(const [id,r] of this.rects){const region=this.regions.get(id);if(!this.isLive(region)||region?.isDisabled?.())continue;nearest=Math.min(nearest,Math.hypot(Math.max(r.left-point.x,0,point.x-r.right),Math.max(r.top-point.y,0,point.y-r.bottom)));}
    return Number.isFinite(nearest)?nearest:null;
  }

  /** The most recent region the user confirmed — what tutorial lessons read. */
  get lastActivatedId(): string | null {
    return this.lastActivated;
  }
  /** How many activations have landed since start — a repeat tap on one control changes this, its id may not. */
  get activationCount(): number {
    return this.activations;
  }

  /** Current measured box of a region, for anything that has to point at it. */
  rectOf(id: string): { left: number; top: number; right: number; bottom: number } | null {
    return this.rects.get(id) ?? null;
  }

  subscribe(listener: (snapshot: InteractionSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Engine feed: cursor position, pinch state and hand presence per detection. */
  feed(cursor: Point, pinched: boolean, handPresent: boolean, contactState:ContactState=pinched?'HOLD':'OPEN', contactScore = pinched ? 1 : 0): void {
    this.cursor = cursor;
    this.contactState=contactState;
    this.contactScore=Math.min(1, Math.max(0, Number.isFinite(contactScore) ? contactScore : 0));
    const nowFeed = performance.now();
    this.freshContact=pinched&&!this.pinched;
    if (this.freshContact) this.contactSince = nowFeed;
    // A held pinch that has stopped moving is "aimed", whatever order the contact
    // and the arrival happened in. People pinch while still gliding onto a target.
    if (this.lastCursor.x >= 0 && Math.hypot(cursor.x - this.lastCursor.x, cursor.y - this.lastCursor.y) > 6) this.lastMoveAt = nowFeed;
    this.lastCursor = { ...cursor };
    if (this.lastFeed > 0 && handPresent) {
      const gap = nowFeed - this.lastFeed;
      if (gap > 0 && gap < 2000) this.feedInterval = this.feedInterval ? this.feedInterval * 0.8 + gap * 0.2 : gap;
    }
    this.lastFeed = nowFeed;
    this.pinched = pinched;
    if (!handPresent && this.handPresent) this.onHandLost();
    this.handPresent = handPresent;

    // Interaction state advances with the *input*, not the display frame, so a
    // stalled rAF can never delay a hover, press or activation.
    const now = performance.now();
    if (now - this.lastRectsAt > 500) this.refreshRects(now);
    this.update(now);
    this.publish();
    this.freshContact=false;
  }

  /** FIST pause: freeze all UI interaction while keeping the cursor visible. */
  setLocked(locked: boolean): void {
    if (locked === this.locked) return;
    this.locked = locked;
    if (locked) this.cancelPress();
  }
  cancel():void {this.onHandLost();this.pinched=false;}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);
    // "Lost" means the source went quiet, not that this thread was busy: a stalled
    // renderer must not read as a withdrawn hand, or every slow frame would suspend
    // the pen and cool the buttons. The threshold follows the observed feed cadence.
    if (this.handPresent && now - this.lastFeed > Math.max(350, this.feedInterval * 3)) {
      this.handPresent=false;this.pinched=false;this.onHandLost();
    }
    if (now - this.lastRectsAt > 500) this.refreshRects(now);
    this.update(now);
    this.publish();
  };

  private refreshRects(now: number): void {
    this.lastRectsAt = now;
    for (const [id, region] of this.regions) {
      if (!this.isLive(region)) {
        this.rects.delete(id);
        continue;
      }
      const el = region.getElement();
      if (!el) {
        this.rects.delete(id);
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        this.rects.delete(id);
        continue;
      }
      this.rects.set(id, {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      });
    }
  }

  /** Regions only take input while their scope is the active one. */
  private isLive(region: InteractiveRegion | undefined): boolean {
    if (!region) return false;
    if((region.onActivate||region.onDrag||region.holdMs)&&region.getElement()?.closest('[data-focus="true"]'))return false;
    // A toy owns the whole screen while it is playing: scope-less affordances
    // (theme, camera, material popover) would otherwise eat the pinch meant for
    // the toy, and the toy has no way to know it lost it. Only the toy's own
    // chrome — status, retry, back — stays reachable.
    if (this.screenOwner === 'toy') return region.scope === 'toy';
    return !region.scope || region.scope === 'global' || region.scope === this.activeScope;
  }

  private contains(rect: Rect, point: Point, pad: number): boolean {
    return (
      point.x >= rect.left - pad &&
      point.x <= rect.right + pad &&
      point.y >= rect.top - pad &&
      point.y <= rect.bottom + pad
    );
  }

  /**
   * The smallest region containing the point wins — but only if it is really the
   * topmost thing painted there. A panel that sits *under* a full-screen surface
   * (the camera preview behind the gallery, a popover under the settings sheet)
   * still has a rect, and being smaller it used to take the pinch from the control
   * the user can actually see. The occlusion answer is a layout query, so it is
   * memoised briefly and only asked when two or more regions claim one point.
   */
  private hitTest(point: Point, extra: number): string | null {
    const hits: { id: string; area: number }[] = [];
    for (const [id, rect] of this.rects) {
      const region = this.regions.get(id);
      if (!this.isLive(region) || region?.isDisabled?.()) continue;
      if (!this.contains(rect, point, extra + (region?.magnet ?? 0))) continue;
      hits.push({ id, area: (rect.right - rect.left) * (rect.bottom - rect.top) });
    }
    if (hits.length === 0) return null;
    if (hits.length === 1) return this.isCovered(hits[0].id, performance.now()) ? null : hits[0].id;
    hits.sort((a, b) => a.area - b.area);
    const now = performance.now();
    for (const hit of hits) if (!this.isCovered(hit.id, now)) return hit.id;
    return null;
  }

  /** True when something else is painted over the middle of this region. */
  private isCovered(id: string, now: number): boolean {
    const cached = this.coveredCache.get(id);
    if (cached && now - cached.at < OCCLUSION_TTL_MS) return cached.covered;
    const element = this.regions.get(id)?.getElement();
    const rect = this.rects.get(id);
    if (!element || !rect) return false;
    // A region that opts out of pointer hit-testing can never be the answer to
    // `elementFromPoint`, so the query says nothing about it — treating that as
    // "covered" would silently disable the control for hands as well as the mouse.
    if (getComputedStyle(element).pointerEvents === 'none') return false;
    const x = Math.min(Math.max((rect.left + rect.right) / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max((rect.top + rect.bottom) / 2, 0), window.innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    // No element at all means the region is not painted where it claims to be.
    const covered = !top || !(element.contains(top) || top.contains(element));
    this.coveredCache.set(id, { at: now, covered });
    return covered;
  }

  /**
   * Hover hysteresis: a hand tremor that walks the cursor across a button's edge
   * must not bounce the highlight (and the drawing block) on and off, so the
   * current target keeps the hover while the cursor stays in a wider band.
   */
  private stickyHover(point: Point): string | null {
    if (!this.hoverId) return null;
    const region = this.regions.get(this.hoverId);
    if (!this.isLive(region) || region?.isDisabled?.()) return null;
    const rect = this.rects.get(this.hoverId);
    if (!rect || !this.contains(rect, point, HOVER_HYSTERESIS_PX + (region?.magnet ?? 0))) return null;
    return this.hoverId;
  }

  private update(now: number): void {
    if (!this.handPresent || this.locked) {
      if (this.state !== 'lost' && !this.handPresent) this.state = 'lost';
      else if (this.locked) this.state = 'idle';
      this.overAny = false;
      this.snapped = this.cursor;
      return;
    }

    // Aim: a real hit wins, otherwise the current target is kept by hysteresis.
    const hoverCandidate = this.hitTest(this.cursor, HIT_TOLERANCE_PX) ?? this.stickyHover(this.cursor);
    this.overAny = this.pressId !== null || this.hitTest(this.cursor, 0) !== null;

    // Magnetic snap: pull the displayed cursor toward the hovered target so
    // camera jitter cannot shake the selection.
    const hoverRect = hoverCandidate ? this.rects.get(hoverCandidate) : null;
    if (hoverRect) {
      const clampedX = Math.min(Math.max(this.cursor.x, hoverRect.left), hoverRect.right);
      const clampedY = Math.min(Math.max(this.cursor.y, hoverRect.top), hoverRect.bottom);
      this.snapped = {
        x: this.cursor.x + (clampedX - this.cursor.x) * 0.4,
        y: this.cursor.y + (clampedY - this.cursor.y) * 0.4,
        z: 0,
      };
    } else {
      this.snapped = this.cursor;
    }

    // Hover with dwell: a target only becomes pressable after a stable aim.
    if (hoverCandidate !== this.hoverId) {
      this.hoverId = hoverCandidate;
      this.hoverSince = now;
    }
    const stableHover = this.hoverId !== null && now - this.hoverSince >= HOVER_DWELL_MS;

    const cooling = now < this.cooldownUntil;

    if (!this.pinched) {
      if (this.pressId !== null) this.release(now);
      this.state = cooling ? 'cooling' : this.hoverId ? 'hover' : 'idle';
      this.holdProgress = 0;
      return;
    }

    // Pinched this frame. The press arms on the contact's rising edge, or — once
    // the contact has been held a moment and the cursor has come to rest over a
    // stable hover — belatedly: pinching while still gliding onto a button must
    // still click, instead of dead-locking until the user fully reopens the hand.
    // The belated arm is capped at 1.5 s so a stroke that merely parks over the dock
    // on its way somewhere else does not turn into a button press.
    const heldStill = now - this.contactSince > 150 && now - this.lastMoveAt > 150 && now - this.contactSince < 1500;
    if (this.pressId === null) {
      if (!cooling && stableHover && this.hoverId && (this.freshContact || heldStill)) {
        this.pressId = this.hoverId;
        this.pressPoint = { ...this.snapped };
        this.pressStartedAt = now;
        this.regions.get(this.pressId)?.onPressStart?.();
        this.dragging = false;
        this.holdProgress = 0;
      }
      this.state = this.pressId ? 'press' : cooling ? 'cooling' : this.hoverId ? 'hover' : 'idle';
      return;
    }

    const region = this.regions.get(this.pressId);
    const rect = this.rects.get(this.pressId);
    if (!region || !rect) {
      this.cancelPress();
      return;
    }
    // A pinching hand dips and trembles; the region's own magnet radius is how
    // sticky it promised to be, so the press gets the same leeway as the hover.
    const tolerance = HIT_TOLERANCE_PX + (region.magnet ?? 0);
    if(!region.onDrag && !this.contains(rect,this.cursor,tolerance)){this.cancelPress();return;}

    const moved = Math.hypot(this.snapped.x - this.pressPoint.x, this.snapped.y - this.pressPoint.y);

    if (region.onDrag && moved > (region.dragThreshold ?? DRAG_THRESHOLD_PX)) {
      this.dragging = true;
      this.state = 'drag';
      region.onDrag(this.snapped, {
        x: this.snapped.x - this.pressPoint.x,
        y: this.snapped.y - this.pressPoint.y,
        z: 0,
      });
      this.pressPoint = { ...this.snapped };
      return;
    }

    if (region.holdMs) {
      this.holdProgress = Math.min(1, (now - this.pressStartedAt) / region.holdMs);
      region.onHoldProgress?.(this.holdProgress);
      if (this.holdProgress >= 1) {
        const id = this.pressId;
        this.cancelPress();
        this.cooldownUntil = now + COOLDOWN_MS;
        this.regions.get(id)?.onHoldComplete?.();
        this.lastActivated=id;this.activations++;this.successUntil=now+220;
      }
      this.state = 'press';
      return;
    }

    // Still inside the pressed target? Leaving cancels (no stray activation).
    const slack = HIT_TOLERANCE_PX + (region.magnet ?? 0);
    const inside =
      this.snapped.x >= rect.left - slack &&
      this.snapped.x <= rect.right + slack &&
      this.snapped.y >= rect.top - slack &&
      this.snapped.y <= rect.bottom + slack;
    if (!inside) this.cancelPress();
    else this.state = 'press';
  }

  private release(now: number): void {
    const id = this.pressId;
    const region = id ? this.regions.get(id) : undefined;
    const wasDrag = this.dragging;
    this.pressId = null;
    this.dragging = false;
    this.holdProgress = 0;
    region?.onHoldProgress?.(0);
    region?.onPressEnd?.(false);
    if (!id || !region || wasDrag) return;
    const rect=this.rects.get(id);
    if(!rect||!this.contains(rect,this.cursor,HIT_TOLERANCE_PX+(region.magnet??0)))return;
    if (region.holdMs) return; // hold regions only fire via onHoldComplete
    this.cooldownUntil = now + COOLDOWN_MS;
    this.lastActivated = id;
    this.activations++;
    this.successUntil=now+220;
    region.onActivate?.();
  }

  private cancelPress(): void {
    const region = this.pressId ? this.regions.get(this.pressId) : undefined;
    this.pressId = null;
    this.dragging = false;
    this.holdProgress = 0;
    region?.onHoldProgress?.(0);
    region?.onPressEnd?.(true);
  }

  private onHandLost(): void {
    this.cancelPress();
    this.hoverId = null;
    this.cooldownUntil = performance.now() + COOLDOWN_MS;
    this.state = 'lost';
  }

  private publish(): void {
    const s = this.snapshot;
    s.successId=performance.now()<this.successUntil?this.lastActivated:null;
    s.contactState=this.contactState;
    s.contactScore=this.contactScore;
    s.state = this.state;
    s.hoverId = this.hoverId;
    s.overTarget = this.overAny;
    // A hover only suppresses drawing if releasing would actually do something;
    // otherwise inert "zones" would create dead zones that swallow the pen.
    const region = this.hoverId ? this.regions.get(this.hoverId) : undefined;
    s.hoverActionable =
      region !== undefined &&
      (region.onActivate !== undefined || region.onDrag !== undefined || region.holdMs !== undefined);
    s.pressId = this.pressId;
    s.holdProgress = this.holdProgress;
    s.cursor = this.cursor;
    s.snapped = this.snapped;
    for (const listener of this.listeners) listener(s);
  }
}

export const interactionManager = new GestureInteractionManager();
