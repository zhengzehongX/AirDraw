import * as THREE from 'three';
import { THEMES } from '../../theme/themes';

/**
 * A bridge from the React/Three world to imperative callers: saving an artwork
 * needs a picture of the canvas, and the only place that can take one is inside
 * the renderer. Scene3D registers here on mount; the gallery and the save flow
 * call `captureFrame` without knowing anything about the scene graph.
 */

export type CaptureOptions = {
  /** Pixels per CSS pixel: 1 matches the canvas, 2 exports a sharper image. */
  scale: number;
  /**
   * 'none' leaves the background transparent for compositing, 'theme' keeps the
   * scene lit exactly as the user sees it, and 'day'/'night' swap only the
   * backdrop so a piece can be exported against either end of the theme.
   */
  background: 'none' | 'theme' | 'day' | 'night';
};

export type CaptureResult = { dataUrl: string; width: number; height: number };

type CaptureFn = (options: CaptureOptions) => CaptureResult | null;

let capture: CaptureFn | null = null;

export function registerCapture(fn: CaptureFn | null): void {
  capture = fn;
}

export function captureFrame(options: CaptureOptions): CaptureResult | null {
  return capture ? capture(options) : null;
}

/**
 * Renders one frame at the requested scale and reads it back.
 *
 * Everything the temporary render changes (size, clear alpha, background) is
 * restored, so the session continues exactly as before. Reading back in the same
 * task is what makes this work without `preserveDrawingBuffer`, which would cost
 * the whole frame budget on every frame.
 */
export function renderToDataUrl(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: CaptureOptions,
): CaptureResult | null {
  const size = new THREE.Vector2();
  gl.getSize(size);
  if (size.x === 0 || size.y === 0) return null;

  const previousRatio = gl.getPixelRatio();
  const previousBackground = scene.background;
  const previousClearAlpha = gl.getClearAlpha();
  const scale = Math.min(Math.max(options.scale, 1), 2);

  try {
    gl.setPixelRatio(previousRatio * scale);
    gl.setSize(size.x, size.y, false);
    if (options.background === 'none') {
      scene.background = null;
      gl.setClearAlpha(0);
    } else if (options.background !== 'theme') {
      const rgb = THEMES[options.background].sceneBg;
      scene.background = new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
      gl.setClearAlpha(1);
    }
    gl.render(scene, camera);
    const dataUrl = gl.domElement.toDataURL('image/png');
    return { dataUrl, width: gl.domElement.width, height: gl.domElement.height };
  } catch {
    return null;
  } finally {
    scene.background = previousBackground;
    gl.setClearAlpha(previousClearAlpha);
    gl.setPixelRatio(previousRatio);
    gl.setSize(size.x, size.y, true);
  }
}
