import { useEffect, useRef, useState } from 'react';
import type { DrawEngine } from '../engine/DrawEngine';
import { useInteractive } from '../interaction/useInteractive';
import { useText } from '../i18n';
import styles from './CanvasMinimap.module.css';

/**
 * The collapsible navigator for the infinite board: where the ink is, and which
 * part of it you are looking at. It is a wayfinding aid, not a second canvas —
 * one small 2D surface, repainted only when the view or the ink changes.
 */
export function CanvasMinimap({ engine, scope }: { engine: DrawEngine; scope: string }) {
  const text = useText();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(() => window.innerWidth >= 900);
  const [revision, setRevision] = useState(0);
  useEffect(() => engine.onCanvasNav(() => setRevision((value) => value + 1)), [engine]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const view = engine.canvasNav.state();
    const surface = engine.canvasNav.getSurface();
    const visible = {
      minX: engine.canvasNav.screenToDoc({ x: 0, y: 0 }).x,
      maxX: engine.canvasNav.screenToDoc({ x: surface.x, y: 0 }).x,
      minY: engine.canvasNav.screenToDoc({ x: 0, y: 0 }).y,
      maxY: engine.canvasNav.screenToDoc({ x: 0, y: surface.y }).y,
    };
    const ink = engine.canvasContentBounds();
    const box = {
      minX: Math.min(visible.minX, ink?.minX ?? visible.minX),
      maxX: Math.max(visible.maxX, ink?.maxX ?? visible.maxX),
      minY: Math.min(visible.minY, ink?.minY ?? visible.minY),
      maxY: Math.max(visible.maxY, ink?.maxY ?? visible.maxY),
    };
    const pad = 10;
    const scale = Math.min((width - pad * 2) / Math.max(box.maxX - box.minX, 1e-3), (height - pad * 2) / Math.max(box.maxY - box.minY, 1e-3));
    const at = (x: number, y: number) => ({ x: pad + (x - box.minX) * scale, y: pad + (y - box.minY) * scale });
    const css = getComputedStyle(document.documentElement);
    const inkColour = css.getPropertyValue('--ad-text').trim() || '#888';
    const accent = css.getPropertyValue('--ad-accent').trim() || '#22d3ee';

    if (ink) {
      const from = at(ink.minX, ink.minY);
      const to = at(ink.maxX, ink.maxY);
      ctx.fillStyle = `rgb(${inkColour.replace(/^rgb\(|\)$/g, '')})`;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(from.x, from.y, Math.max(2, to.x - from.x), Math.max(2, to.y - from.y));
      ctx.globalAlpha = 1;
    }
    const v0 = at(visible.minX, visible.minY);
    const v1 = at(visible.maxX, visible.maxY);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(v0.x, v0.y, Math.max(6, v1.x - v0.x), Math.max(6, v1.y - v0.y));
    void view;
  }, [engine, open, revision]);

  const jump = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // The minimap maps document coordinates linearly into its own box; invert that
    // and centre the board on the picked point.
    const fx = (clientX - rect.left) / Math.max(1, rect.width);
    const fy = (clientY - rect.top) / Math.max(1, rect.height);
    const surface = engine.canvasNav.getSurface();
    const a = engine.canvasNav.screenToDoc({ x: 0, y: 0 });
    const b = engine.canvasNav.screenToDoc({ x: surface.x, y: surface.y });
    const ink = engine.canvasContentBounds();
    const box = {
      minX: Math.min(a.x, b.x, ink?.minX ?? Infinity),
      maxX: Math.max(a.x, b.x, ink?.maxX ?? -Infinity),
      minY: Math.min(a.y, b.y, ink?.minY ?? Infinity),
      maxY: Math.max(a.y, b.y, ink?.maxY ?? -Infinity),
    };
    engine.canvasCentreOn({ x: box.minX + (box.maxX - box.minX) * fx, y: box.minY + (box.maxY - box.minY) * fy, z: 0 });
  };

  const zone = useInteractive({
    id: 'minimap-zone',
    scope,
    onDrag: (point) => jump(point.x, point.y),
    onPressStart: () => engine.rememberView(),
  });

  return (
    <div className={styles.wrap} data-open={open ? 'true' : 'false'}>
      <button type="button" className={`${styles.toggle} ad-press`} data-testid="minimap-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {text('canvas.minimap')}
      </button>
      {open && (
        <div ref={zone.ref as React.RefObject<HTMLDivElement>} className={styles.card} data-testid="minimap" onPointerDown={(event) => { engine.rememberView(); jump(event.clientX, event.clientY); }}>
          <canvas ref={canvasRef} className={styles.canvas} aria-label={text('canvas.minimap')} />
        </div>
      )}
    </div>
  );
}
