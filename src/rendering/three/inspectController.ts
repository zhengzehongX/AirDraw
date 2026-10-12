/**
 * View-mode camera controller: damped spherical orbit with hard amplitude
 * limits so inspecting a piece can never cause nausea or lose the artwork.
 * Driven by PINCH+MOVE drags (rotation) and two-hand distance (zoom); inertia
 * decays exponentially once the drag stops.
 */
export class InspectController {
  yaw = 0;
  pitch = 0;
  distance = 13.5;
  private yawVel = 0;
  private pitchVel = 0;
  private targetDistance = 13.5;
  centerX = 0;
  centerY = 0;
  private targetCenterX = 0;
  private targetCenterY = 0;
  active = false;
  framed = false;
  /**
   * While a palm navigation session is live the rig must place the camera exactly
   * where the session computed it: easing here would make the view chase the hand
   * instead of being held by it.
   */
  direct = false;

  static readonly YAW_LIMIT = 0.6;
  static readonly PITCH_LIMIT = 0.42;
  static readonly DIST_MIN = 9;
  static readonly DIST_MAX = 19;
  static readonly CENTRE_LIMIT = 9;

  rotate(dx: number, dy: number): void {
    this.yawVel = dx * 0.0035;
    this.pitchVel = dy * 0.0028;
    this.yaw = clamp(this.yaw + this.yawVel, -InspectController.YAW_LIMIT, InspectController.YAW_LIMIT);
    this.pitch = clamp(this.pitch + this.pitchVel, -InspectController.PITCH_LIMIT, InspectController.PITCH_LIMIT);
  }

  zoomBy(factor: number): void {
    this.targetDistance = clamp(this.targetDistance * factor, InspectController.DIST_MIN, InspectController.DIST_MAX);
  }

  /** Absolute write from a palm navigation session: assigned, never accumulated. */
  navSet(centerX: number, centerY: number, distance: number): void {
    this.targetCenterX = clamp(centerX, -InspectController.CENTRE_LIMIT, InspectController.CENTRE_LIMIT);
    this.targetCenterY = clamp(centerY, -InspectController.CENTRE_LIMIT, InspectController.CENTRE_LIMIT);
    this.targetDistance = clamp(distance, InspectController.DIST_MIN, InspectController.DIST_MAX);
    this.centerX = this.targetCenterX;
    this.centerY = this.targetCenterY;
    this.distance = this.targetDistance;
    this.yawVel = 0;
    this.pitchVel = 0;
  }

  /** The session ended: inertia stays off until a drag deliberately starts again. */
  navEnd(): void {
    this.direct = false;
    this.yawVel = 0;
    this.pitchVel = 0;
  }

  /** Restore a saved viewpoint, inside the same limits a hand cannot exceed. */
  set(yaw: number, pitch: number, distance: number): void {
    this.yaw = clamp(yaw, -InspectController.YAW_LIMIT, InspectController.YAW_LIMIT);
    this.pitch = clamp(pitch, -InspectController.PITCH_LIMIT, InspectController.PITCH_LIMIT);
    this.targetDistance = clamp(distance, InspectController.DIST_MIN, InspectController.DIST_MAX);
    this.yawVel = 0;
    this.pitchVel = 0;
  }

  /** Ease the view onto a piece of ink instead of jumping to it. */
  frame(x: number, y: number, distance: number): void {
    this.targetCenterX = clamp(x, -9, 9);
    this.targetCenterY = clamp(y, -9, 9);
    this.targetDistance = clamp(distance, InspectController.DIST_MIN, InspectController.DIST_MAX);
    this.framed = true;
    this.yawVel = 0;
    this.pitchVel = 0;
  }

  reset(): void {
    this.framed = false;
    this.targetDistance = 13.5;
    this.targetCenterX = 0;
    this.targetCenterY = 0;
  }

  /** Exponential decay + spring back to rest when inspect mode ends. */
  update(dt: number, enabled: boolean): { yaw: number; pitch: number; distance: number; centerX: number; centerY: number } {
    // A live palm session owns the camera: no spring home, no inertia, no easing —
    // the session already computed an absolute target from its frozen baseline.
    if (!this.direct && !enabled) {
      this.yaw += (0 - this.yaw) * Math.min(1, dt * 6);
      this.pitch += (0 - this.pitch) * Math.min(1, dt * 6);
      // Leaving view mode normally springs the camera home, but a piece the user
      // deliberately centred keeps its framing until something resets it.
      if (!this.framed) this.targetDistance = 13.5;
    } else if (!this.direct) {
      // Inertia: keep gliding briefly after the drag ends, then settle.
      this.yaw = clamp(this.yaw + this.yawVel * dt * 8, -InspectController.YAW_LIMIT, InspectController.YAW_LIMIT);
      this.pitch = clamp(
        this.pitch + this.pitchVel * dt * 8,
        -InspectController.PITCH_LIMIT,
        InspectController.PITCH_LIMIT,
      );
      const decay = Math.exp(-dt * 6);
      this.yawVel *= decay;
      this.pitchVel *= decay;
    }
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 5);
    const ease = Math.min(1, dt * 4.5);
    this.centerX += (this.targetCenterX - this.centerX) * ease;
    this.centerY += (this.targetCenterY - this.centerY) * ease;
    if (this.direct) {
      // A live palm session places the view exactly; the ease is for releases only.
      this.distance = this.targetDistance;
      this.centerX = this.targetCenterX;
      this.centerY = this.targetCenterY;
    }
    return { yaw: this.yaw, pitch: this.pitch, distance: this.distance, centerX: this.centerX, centerY: this.centerY };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const inspectController = new InspectController();
