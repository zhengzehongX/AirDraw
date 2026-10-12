import { useEffect, useRef } from 'react';
import { MAX_CANVAS_DPR } from '../config';
import type { DrawEngine } from '../engine/DrawEngine';
import { Canvas2DStrokeRenderer } from '../rendering/canvas2d/Canvas2DStrokeRenderer';
import { dotLayout, drawDots } from '../rendering/canvas2d/viewport';
import { themeController } from '../theme/themeController';
import styles from './DrawingSurface.module.css';
import { workspace } from '../project/workspace';
import { paperCss } from '../rendering/canvas2d/freehand';

type DrawingSurfaceProps = { engine: DrawEngine; dotDensity: number };

/**
 * The full-screen drawing area: a dot grid under a history canvas under the live
 * stroke. Canvas sizing is driven imperatively by a ResizeObserver — a resize must
 * not push React state, or dragging a window edge would re-render 60x/sec.
 *
 * The grid belongs to the document, not to the screen: it is repainted from the
 * viewport controller whenever the sheet moves, so the dots stay glued to the ink
 * at every pan and zoom instead of sliding under it.
 */
export function DrawingSurface({ engine, dotDensity }: DrawingSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const gridCanvas = gridRef.current;
    const historyCanvas = historyRef.current;
    const liveCanvas = liveRef.current;
    if (!container || !gridCanvas || !historyCanvas || !liveCanvas) return;

    const renderer = new Canvas2DStrokeRenderer(historyCanvas, liveCanvas);
    // The renderer only ever asks "which pixel of this buffer is this document point?",
    // so the canvas camera lives in one place and the ink follows it for free.
    renderer.setPlaneToScreen((point) => engine.docToInk(point));
    engine.attachRenderer(renderer);

    let ink = 'rgb(28, 34, 48)';
    const updatePaper = () => {
      container.style.backgroundColor = paperCss(engine.canvasBackground);
      ink = engine.canvasBackground === 'dark' ? 'rgb(222, 231, 242)' : 'rgb(28, 34, 48)';
      repaint();
    };
    const gridCtx = gridCanvas.getContext('2d');
    const repaint = () => {
      if (!gridCtx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
      gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gridCtx.clearRect(0, 0, gridCanvas.clientWidth, gridCanvas.clientHeight);
      const state = engine.canvasNav.state();
      drawDots(
        gridCtx,
        engine.canvasNav,
        { x: gridCanvas.clientWidth, y: gridCanvas.clientHeight },
        dotLayout(state.zoom, dotDensity, 0.5),
        ink,
      );
    };
    const offTheme = themeController.subscribe((_t, vars) => {
      void vars;
      updatePaper();
    });

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
      // Ink buffers belong to the renderer: assigning width/height resets its DPR transform.
      for (const canvas of [gridCanvas]) {
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
      // The window stays the viewport's owner (App measures it); this element only says
      // where it begins inside that window, so ink and pointer keep one shared frame.
      engine.setDrawingArea({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      repaint();
    };
    const offNav = engine.onCanvasNav(() => {
      // One viewport snapshot, three layers: the dots, the committed ink and the
      // stroke in progress are all re-projected together, so the ink can never sit
      // still while the sheet moves under it.
      repaint();
      renderer.repaintHistory();
      renderer.repaintLive();
    });

    applySize();
    updatePaper();
    const offPaper = workspace.subscribe(updatePaper);
    const observer = new ResizeObserver(applySize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      offNav();
      offTheme();
      offPaper();
      engine.detachRenderer();
      renderer.dispose();
    };
  }, [engine, dotDensity]);

  return (
    <div className={styles.surface} ref={containerRef} data-testid="drawing-surface">
      <canvas ref={gridRef} className={styles.layer} aria-hidden="true" />
      <canvas ref={historyRef} className={styles.layer} aria-label="已完成的笔画" />
      <canvas ref={liveRef} className={styles.layer} aria-label="正在绘制的笔画" />
    </div>
  );
}
