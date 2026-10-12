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
let captureCanvas: ((options: CaptureOptions) => HTMLCanvasElement | null) | null = null;
export let lastCaptureError: string | null = null;

export function registerCapture(fn: CaptureFn | null, canvasFn: typeof captureCanvas = null): void {
  capture = fn;
  captureCanvas = canvasFn;
}

export function captureArtworkCanvas(options: CaptureOptions): HTMLCanvasElement | null {
  return captureCanvas?.(options) ?? null;
}

export type ArtworkInk = { background: string; paint: (ctx: CanvasRenderingContext2D) => void };

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
  ink?: ArtworkInk,
): CaptureResult | null {
  const canvas = renderArtworkCanvas(gl, scene, camera, options, ink);
  if (!canvas) return null;
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

export function renderArtworkCanvas(
  gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  options: CaptureOptions, ink?: ArtworkInk,
): HTMLCanvasElement | null {
  const size = new THREE.Vector2();
  gl.getSize(size);
  if (size.x === 0 || size.y === 0) return null;

  const previousRatio = gl.getPixelRatio();
  const previousBackground = scene.background;
  const previousClearAlpha = gl.getClearAlpha();
  const scale = Math.min(Math.max(options.scale, 1), 2);
  const hidden: THREE.Object3D[] = [];
  scene.traverse(object => {
    if (object.visible && (object.userData.excludeFromArtwork || ink && object.userData.canvasPaper)) {
      hidden.push(object); object.visible = false;
    }
  });

  try {
    lastCaptureError = null;
    gl.setPixelRatio(previousRatio * scale);
    gl.setSize(size.x, size.y, false);
    if (options.background === 'none' || ink) {
      scene.background = null;
      gl.setClearAlpha(0);
    } else if (options.background !== 'theme') {
      const rgb = THEMES[options.background].sceneBg;
      scene.background = new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
      gl.setClearAlpha(1);
    }
    gl.render(scene, camera);
    const output = document.createElement('canvas');
    output.width = gl.domElement.width; output.height = gl.domElement.height;
    const ctx = output.getContext('2d');
    if (!ctx) return null;
    // Copy before restoring the drawing buffer. No DOM UI or camera is composited.
    ctx.drawImage(gl.domElement, 0, 0);
    if (ink) {
      ctx.setTransform(output.width / size.x, 0, 0, output.height / size.y, 0, 0);
      // Paper goes behind the WebGL artwork: clearing here erased mixed-project models.
      if (options.background !== 'none' && ink.background !== 'transparent') {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = ink.background; ctx.fillRect(0, 0, size.x, size.y);
        ctx.globalCompositeOperation = 'source-over';
      }
      ink.paint(ctx);
    }
    return output;
  } catch (error) {
    lastCaptureError = error instanceof Error ? error.message : String(error);
    return null;
  } finally {
    hidden.forEach(object => { object.visible = true; });
    scene.background = previousBackground;
    gl.setClearAlpha(previousClearAlpha);
    gl.setPixelRatio(previousRatio);
    gl.setSize(size.x, size.y, true);
  }
}
