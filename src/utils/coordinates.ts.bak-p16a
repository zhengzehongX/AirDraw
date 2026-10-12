import type { Point } from '../types/drawing';

export type CoordinateMapper = {
  /** Plane coords (0..1, mirroring already applied) → CSS pixels on screen. */
  toScreen(planeX: number, planeY: number): Point;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
};

/**
 * Raw normalized video coords → normalized drawing-plane coords. Mirroring
 * happens exactly once, here, so everything downstream (strokes, 2D renderer,
 * 3D scene) works in a stable mirrored plane space.
 */
export function toPlane(normalizedX: number, normalizedY: number, mirror: boolean): Point {
  return { x: mirror ? 1 - normalizedX : normalizedX, y: normalizedY, z: 0 };
}

/**
 * "Cover" mapping: the plane (same aspect as the video frame) is scaled to fill
 * the drawing surface while keeping its aspect ratio, centred, with overflow
 * cropped. Compared with stretching, hand motion and on-screen motion stay
 * proportional on any window shape, so a circle drawn in the air is a circle
 * on screen.
 */
export function createCoverMapper(
  videoWidth: number,
  videoHeight: number,
  screenWidth: number,
  screenHeight: number,
): CoordinateMapper {
  const scale =
    videoWidth > 0 && videoHeight > 0
      ? Math.max(screenWidth / videoWidth, screenHeight / videoHeight)
      : 1;
  const offsetX = (screenWidth - videoWidth * scale) / 2;
  const offsetY = (screenHeight - videoHeight * scale) / 2;

  return {
    scale,
    offsetX,
    offsetY,
    toScreen(planeX: number, planeY: number): Point {
      return {
        x: offsetX + planeX * videoWidth * scale,
        y: offsetY + planeY * videoHeight * scale,
        z: 0,
      };
    },
  };
}

export function clampToViewport(point: Point, width: number, height: number): Point {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
    z: point.z,
  };
}
