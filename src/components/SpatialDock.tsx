import {motionTokens} from '../design/motion';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { BRUSH_WIDTHS, CLEAR_HOLD_MS } from '../config';
import type { Popover } from '../app/appState';
import type { WorkspaceMode } from '../app/AppMode';
import { interactionManager } from '../interaction/GestureInteractionManager';
import { useInteractive } from '../interaction/useInteractive';
import { useText } from '../i18n';
import { MATERIAL_PRESETS } from '../rendering/three/materials';
import type { Brush, CanvasTool, MaterialPresetId } from '../types/drawing';
import type { TextKey } from '../i18n/zh';
import styles from './SpatialDock.module.css';

export const DOCK_COLORS = [
  '#243247',
  '#64748b',
  '#22d3ee',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#fb7185',
  '#f97316',
  '#fbbf24',
  '#4ade80',
  '#14b8a6',
  '#f8fafc',
] as const;

const MATERIAL_SPHERE: Record<MaterialPresetId, string> = {
  candy: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95), rgba(255,255,255,0.35) 22%, var(--sphere) 58%, color-mix(in srgb, var(--sphere) 55%, #000) 100%)',
  plastic: 'radial-gradient(circle at 34% 30%, rgba(255,255,255,0.9), rgba(255,255,255,0.15) 18%, var(--sphere) 55%, color-mix(in srgb, var(--sphere) 45%, #000) 100%)',
  metal: 'radial-gradient(circle at 30% 26%, #fff 4%, rgba(255,255,255,0.5) 14%, var(--sphere) 40%, #1a2030 72%, rgba(255,255,255,0.35) 88%, var(--sphere) 100%)',
  glass: 'radial-gradient(circle at 34% 30%, rgba(255,255,255,0.95), rgba(255,255,255,0.25) 26%, color-mix(in srgb, var(--sphere) 45%, transparent) 60%, color-mix(in srgb, var(--sphere) 25%, transparent) 100%)',
  neon: 'radial-gradient(circle at 50% 50%, #fff 6%, var(--sphere) 45%, color-mix(in srgb, var(--sphere) 60%, #000) 100%)',
};

function sphereStyle(color: string, preset?: MaterialPresetId): React.CSSProperties {
  return {
    '--sphere': color,
    background: (preset ? MATERIAL_SPHERE[preset] : MATERIAL_SPHERE.candy).replace(/var\(--sphere\)/g, color),
  } as React.CSSProperties;
}

type DockItemProps = {
  id: string;
  scope?: string;
  label: string;
  icon: React.ReactNode;
  onActivate?: () => void;
  active?: boolean;
  disabled?: boolean;
  holdMs?: number;
  onHoldProgress?: (p: number) => void;
  onHoldComplete?: () => void;
};

function DockItem({ id, scope, label, icon, onActivate, active, disabled, holdMs, onHoldProgress, onHoldComplete, gate }: DockItemProps & { gate?: React.RefObject<boolean> }) {
  const { ref, scale, glow, hold } = useInteractive({
    id,
    scope,
    onActivate,
    holdMs,
    onHoldProgress,
    onHoldComplete,
    magnet: 9,
    isDisabled: () => disabled === true || gate?.current === false,
  });
  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.item} ad-press`}
      style={{ scale, '--glow': glow, '--hold': hold } as unknown as React.CSSProperties}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      data-active={active ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      onClick={onActivate}
      aria-label={label}
      title={label}
      data-dock-item={id}
    >
      <span className={styles.itemIcon}>{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
      <span className={styles.holdRing} aria-hidden="true" />
    </motion.button>
  );
}

const Icon = {
  color: <path d="M12 3.5c3 3.4 5.5 6.4 5.5 9.4a5.5 5.5 0 1 1-11 0c0-3 2.5-6 5.5-9.4Z" />,
  material: <path d="M12 3l8 5-8 5-8-5 8-5Zm-8 9l8 5 8-5" />,
  size: <path d="M4 17h16M7 13h10M10 9h4" />,
  undo: <path d="M8 5L3 10l5 5M3 10h11a5 5 0 0 1 0 10h-3" />,
  redo: <path d="M16 5l5 5-5 5M21 10H10a5 5 0 0 0 0 10h3" />,
  erase: <path d="M7 16l9-9 4 4-9 9H7v-4ZM7 20h13" />,
  // Three pens, three silhouettes: a fine nib, a chisel tip, a wide band.
  brush: <path d="M4 20l3.6-1 10-10-2.6-2.6-10 10L4 20Zm12-13.5 2.5 2.5 1.6-1.6a2 2 0 0 0-2.5-2.5L16 6.5Z" />,
  marker: <path d="M6 18h5l7.5-7.5-4-4L7 14v4Zm10.5-13 4 4M6 18l-2-2 3-3 4 4-5 1Z" />,
  highlighter: <path d="M4 18h16M7 14l6-6 4 4-6 6H7v-4Z" />,
  pressure: <path d="M4 16c3.5 0 4.5-9 8-9s4.5 9 8 9" />,
  clear: <path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12" />,
  center: <path d="M12 4v3m0 10v3M4 12h3m10 0h3M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />,
  more: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  fit: <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M9 12h6" />,
  percent: <path d="M6 18 18 6M8.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
  view: <path d="M12 5c5 0 9 4.5 9 7s-4 7-9 7-9-4.5-9-7 4-7 9-7Zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />,
  save: <path d="M5 5h11l3 3v11H5V5Zm3 0v5h7V5M8 19v-6h8v6" />,
  dev: <path d="M4 18V9m5 9V5m5 13v-6m5 6V8" />,
  hand: <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12m0-6.5v-1a1.5 1.5 0 0 1 3 0V12m0-5.5a1.5 1.5 0 0 1 3 0V13m0-3a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6v-2a1.5 1.5 0 0 1 3 0" />,
};

function Glyph({ d }: { d: React.ReactNode }) {
  return (
    <svg className="ad-icon" viewBox="0 0 24 24" aria-hidden="true">
      <g>{d}</g>
    </svg>
  );
}

export type SpatialDockProps = {
  open: boolean;
  /** The context whose gesture input owns these targets (studio or tutorial). */
  scope: string;
  brush: Brush;
  /** Whose tools the row shows: 3D-only controls must not crowd the dot canvas. */
  mode: WorkspaceMode;
  /** The dot canvas's pen; in 3D this stays unused and the row shows the 3D tools. */
  canvasTool: CanvasTool;
  canvasPressure: boolean;
  strokeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  eraseMode: boolean;
  inspect: boolean;
  focusMode: boolean;
  popover: Popover;
  confirmClear: boolean;
  setColor: (c: string) => void;
  setWidth: (w: number) => void;
  setMaterial: (m: MaterialPresetId) => void;
  setCanvasTool: (t: CanvasTool) => void;
  onTogglePressure: () => void;
  onPopover: (p: Popover) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleErase: () => void;
  onArmClear: () => void;
  onDismissClear: () => void;
  onClear: () => void;
  onToggleInspect: () => void;
  onSave: () => void;
  onCenter: () => void;
  /** Board view controls — the visible fallback when recognition misreads. */
  onFitAll: () => void;
  onZoomReset: () => void;
  onViewLast: () => void;
};

/** Which button each panel rises from, so the panel can sit above it. */
const POPOVER_TRIGGER: Record<Exclude<Popover, 'none'>, string> = {
  color: 'dock-color',
  material: 'dock-material',
  brush: 'dock-brush',
  size: 'dock-size',
  more: 'dock-more',
};

/**
 * The pens behind 画笔 on the dot canvas. Erasing is not in this panel: it is the
 * row's own persistent toggle, so the hand never has to open a panel to put the
 * pen down.
 */
const BRUSH_PANEL: { id: CanvasTool; label: TextKey; icon: React.ReactNode }[] = [
  { id: 'pen', label: 'canvas.pen', icon: Icon.brush },
  { id: 'marker', label: 'canvas.marker', icon: Icon.marker },
  { id: 'highlighter', label: 'canvas.highlighter', icon: Icon.highlighter },
];

/**
 * The Spatial Tool Dock: hidden by default, summoned with a held OPEN_PALM,
 * auto-hidden when the hand wanders away. Every control is a spatial region —
 * colour and material present themselves as small shaded spheres, size is a
 * pinch-draggable arc slider, and Clear demands a one-second hold on a
 * confirmation ring. No control requires a mouse or key.
 */
export function SpatialDock(props: SpatialDockProps) {
  const { open, scope } = props;
  const text = useText();
  const spatial = props.mode === 'SPATIAL_DRAW';
  // A popover opened in one mode must not follow the user into the next: materials
  // belong to the 3D workspace and the pens belong to the dot canvas, so each mode
  // drops the panel it has no trigger button for.
  const panel: Popover =
    (!spatial && props.popover === 'material') || (spatial && props.popover === 'brush') ? 'none' : props.popover;
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const armPosition = useRef({ x: 0, y: 0 });
  const openGate = useRef(open);
  openGate.current = open;
  // The confirmation is modal: while it is up, the controls behind it must not
  // compete for the same pinch (its ring can easily land on top of a button).
  const itemGate = useRef(open);
  itemGate.current = open && !props.confirmClear;

  useEffect(() => {
    // The zone region follows the dock element so auto-hide can test against it.
    const unregister = interactionManager.register({
      id: 'dock-zone',
      scope,
      getElement: () => zoneRef.current,
    });
    return unregister;
  }, [scope]);

  useEffect(() => {
    if (panel==='none') return;
    // Keep auto-hide from firing while the hand works inside a popover.
    const unregister = interactionManager.register({
      id: 'dock-popover',
      scope,
      getElement: () => popoverRef.current,
    });
    return unregister;
  }, [panel,scope]);

  useEffect(() => {
    interactionManager.invalidateRects();
  }, [open, panel, props.confirmClear]);

  /**
   * A panel belongs to the button that opened it. Centring it on the row instead put
   * the colour wheel over Undo and left a person hunting for the control they just
   * pressed, so the panel slides along the row to sit above its trigger — and stops
   * at the screen edge rather than hanging off it. `margin-left` is the shift because
   * Motion owns `transform` on this element.
   */
  const [shift, setShift] = useState(0);
  useEffect(() => {
    if (panel === 'none') {
      setShift(0);
      return undefined;
    }
    const place = () => {
      const anchor = zoneRef.current;
      const trigger = anchor?.querySelector<HTMLElement>(`[data-dock-item="${POPOVER_TRIGGER[panel]}"]`);
      if (!anchor || !trigger) {
        setShift(0);
        return;
      }
      const width = Math.min(320, window.innerWidth - 48);
      const wanted = trigger.getBoundingClientRect().left + trigger.getBoundingClientRect().width / 2;
      const row = anchor.getBoundingClientRect();
      const lowest = 24 + width / 2;
      const highest = Math.max(lowest, window.innerWidth - 24 - width / 2);
      setShift(Math.min(Math.max(wanted, lowest), highest) - (row.left + row.width / 2));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [panel, open]);

  const togglePanel = (name: Exclude<Popover, 'none'>) =>
    props.onPopover(panel === name ? 'none' : name);

  const armClear = () => {
    const cursor = interactionManager.snapshot.cursor;
    armPosition.current = { x: cursor.x, y: cursor.y };
    props.onArmClear();
  };

  return (
    <>
      <AnimatePresence>
        {props.confirmClear && (
          <motion.div
            className={`${styles.confirm} ad-glass`}
            // Motion owns `transform`, so the centering offset has to come from
            // motion too: a CSS translate here gets overwritten mid-animation,
            // the flyout slides out from under the cursor, and the hold cancels.
            style={{
              left: armPosition.current.x,
              top: armPosition.current.y,
              x: '-50%',
              y: '-110%',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionTokens.hover}
            onAnimationComplete={() => interactionManager.invalidateRects()}
            data-testid="clear-confirm"
          >
            <ClearHold
              scope={scope}
              onCancel={props.onDismissClear}
              onConfirm={() => {
                props.onClear();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panel === 'size' && <BrushSizePreview width={props.brush.width} />}
      </AnimatePresence>

      <div className={styles.anchor} ref={zoneRef} data-focus={props.focusMode ? 'true' : 'false'} data-testid="dock-zone">
        <AnimatePresence>
          {panel !== 'none' && open && (
            <motion.div
              ref={popoverRef}
              className={`${styles.popover} ad-glass`}
              style={{ x: '-50%', marginLeft: shift }}
              initial={{ opacity: 0, y: 14, scale: 0.92, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 8, scale: 0.94, filter: 'blur(4px)' }}
              transition={motionTokens.spring}
              onAnimationComplete={() => interactionManager.invalidateRects()}
              data-testid={`popover-${panel}`}
            >
              {panel === 'color' && (
                <div className={styles.sphereRow}>
                  {DOCK_COLORS.map((color) => (
                    <ColorSphere
                      key={color}
                      scope={scope}
                      color={color}
                      active={props.brush.color === color}
                      onPick={() => props.setColor(color)}
                    />
                  ))}
                </div>
              )}
              {panel === 'material' && (
                <div className={styles.sphereRow}>
                  {MATERIAL_PRESETS.map((preset) => (
                    <MaterialSphere
                      key={preset.id}
                      scope={scope}
                      id={preset.id}
                      label={preset.label}
                      active={props.brush.material === preset.id}
                      onPick={() => props.setMaterial(preset.id)}
                    />
                  ))}
                </div>
              )}
              {panel === 'size' && <SizeSlider width={props.brush.width} scope={scope} onChange={props.setWidth} />}
              {/* 画笔 carries the three pens plus the one brush property that changes
                  how they lay down ink; the row's own 橡皮 toggle stays outside so the
                  pen can be put down without opening anything. */}
              {panel === 'brush' && (
                <div className={styles.moreGrid}>
                  {BRUSH_PANEL.map((tool) => (
                    <DockItem
                      key={tool.id}
                      scope={scope}
                      gate={itemGate}
                      id={`canvas-${tool.id}`}
                      label={text(tool.label)}
                      icon={<Glyph d={tool.icon} />}
                      active={props.canvasTool === tool.id}
                      onActivate={() => props.setCanvasTool(tool.id)}
                    />
                  ))}
                  <DockItem scope={scope} gate={itemGate} id="canvas-pressure" label={text('canvas.pressure')} icon={<Glyph d={Icon.pressure} />} active={props.canvasPressure} onActivate={props.onTogglePressure} />
                </div>
              )}
              {panel === 'more' && (
                <div className={styles.moreGrid}>
                  <DockItem scope={scope} gate={itemGate} id="more-undo" label={text('dock.undo')} icon={<Glyph d={Icon.undo}/>} onActivate={props.onUndo} disabled={!props.canUndo}/>
                  <DockItem scope={scope} gate={itemGate} id="more-redo" label={text('dock.redo')} icon={<Glyph d={Icon.redo}/>} onActivate={props.onRedo} disabled={!props.canRedo}/>
                  <DockItem scope={scope} gate={itemGate} id="more-size" label={text('dock.size')} icon={<Glyph d={Icon.size}/>} onActivate={()=>togglePanel('size')}/>
                  <DockItem scope={scope} gate={itemGate} id="dock-clear" label={text('dock.clear')} icon={<Glyph d={Icon.clear} />} disabled={props.strokeCount === 0} onActivate={armClear} />
                  <DockItem scope={scope} gate={itemGate} id="dock-save" label={text('dock.save')} icon={<Glyph d={Icon.save} />} onActivate={props.onSave} />
                  {spatial && <DockItem scope={scope} gate={itemGate} id="dock-view" label={text('dock.view')} icon={<Glyph d={Icon.view} />} active={props.inspect} onActivate={props.onToggleInspect} />}
                  {spatial && <DockItem scope={scope} gate={itemGate} id="dock-center" label={text('dock.center')} icon={<Glyph d={Icon.center} />} disabled={props.strokeCount === 0} onActivate={props.onCenter} />}
                  {/* On the infinite board these are the visible fallbacks for the
                      gestures: show everything, back to 100%, back to where I was. */}
                  {!spatial && <DockItem scope={scope} gate={itemGate} id="canvas-fit" label={text('canvas.fit')} icon={<Glyph d={Icon.fit} />} onActivate={props.onFitAll} />}
                  {!spatial && <DockItem scope={scope} gate={itemGate} id="canvas-zoom-reset" label={text('canvas.zoomReset')} icon={<Glyph d={Icon.percent} />} onActivate={props.onZoomReset} />}
                  {!spatial && <DockItem scope={scope} gate={itemGate} id="canvas-view-last" label={text('canvas.viewLast')} icon={<Glyph d={Icon.undo} />} onActivate={props.onViewLast} />}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className={`${styles.dock} ad-glass`}
          initial={false}
          animate={{
            opacity: open ? 1 : 0,
            y: open ? 0 : 26,
            scale: open ? 1 : 0.9,
            filter: open ? 'blur(0px)' : 'blur(10px)',
            pointerEvents: open ? 'auto' : 'none',
          }}
          transition={motionTokens.spring}
          data-testid="dock"
        >
          {/* The dot canvas row: the pen first, then what it draws with, then history.
              画笔 expands into the three pens, 橡皮 is the row's own persistent toggle —
              the same shape as erase in 3D, so one gesture vocabulary covers both. */}
          {!spatial && <DockItem scope={scope} gate={itemGate} id="dock-brush" label={text('dock.brush')} icon={<Glyph d={Icon.brush} />} active={panel === 'brush'} onActivate={() => togglePanel('brush')} />}
          {!spatial && <DockItem scope={scope} gate={itemGate} id="dock-erase" label={text('dock.erase')} icon={<Glyph d={Icon.erase} />} active={props.canvasTool === 'eraser'} onActivate={() => props.setCanvasTool('eraser')} />}
          {!spatial && <span className={styles.sep} aria-hidden="true" />}
          <DockItem scope={scope} gate={itemGate} id="dock-color" label={text('dock.color')} icon={<Glyph d={Icon.color} />} active={panel === 'color'} onActivate={() => togglePanel('color')} />
          {spatial && <DockItem scope={scope} gate={itemGate} id="dock-material" label={text('dock.material')} icon={<Glyph d={Icon.material} />} active={panel === 'material'} onActivate={() => togglePanel('material')} />}
          <DockItem scope={scope} gate={itemGate} id="dock-size" label={text('dock.size')} icon={<Glyph d={Icon.size} />} active={panel === 'size'} onActivate={() => togglePanel('size')} />
          <span className={styles.sep} aria-hidden="true" />
          <DockItem scope={scope} gate={itemGate} id="dock-undo" label={text('dock.undo')} icon={<Glyph d={Icon.undo} />} onActivate={props.onUndo} disabled={!props.canUndo} />
          <DockItem scope={scope} gate={itemGate} id="dock-redo" label={text('dock.redo')} icon={<Glyph d={Icon.redo} />} onActivate={props.onRedo} disabled={!props.canRedo} />
          {/* Erasing is a persistent mode in 3D. */}
          {spatial && <DockItem scope={scope} gate={itemGate} id="dock-erase" label={text('dock.erase')} icon={<Glyph d={Icon.erase} />} onActivate={props.onToggleErase} active={props.eraseMode} />}
          <span className={styles.sep} aria-hidden="true" />
          {/* The rest of the mode's tools live behind one explicit entry: the row
              people aim at stays short enough to hit without hunting. */}
          <DockItem scope={scope} gate={itemGate} id="dock-more" label={text('dock.more')} icon={<Glyph d={Icon.more} />} active={panel === 'more'} onActivate={() => togglePanel('more')} />
        </motion.div>

        <motion.div
          className={styles.handle}
          animate={{ opacity: open ? 0 : 0.75 }}
          transition={motionTokens.hover}
          aria-hidden="true"
        >
          <span />
        </motion.div>
      </div>
    </>
  );
}

function ColorSphere({ color, active, scope, onPick }: { color: string; active: boolean; scope: string; onPick: () => void }) {
  const text = useText();
  const { ref, scale, glow } = useInteractive({ id: `color-${color}`, scope, onActivate: onPick, magnet: 8 });
  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.sphere} ad-press`}
      style={{ scale, '--glow': glow, ...sphereStyle(color) } as unknown as React.CSSProperties}
      data-active={active ? 'true' : 'false'}
      onClick={onPick}
      aria-label={text('dock.colorName', { color })}
      data-testid={`color-${color}`}
    />
  );
}

function MaterialSphere({ id, label, active, scope, onPick }: { id: MaterialPresetId; label: string; active: boolean; scope: string; onPick: () => void }) {
  const text = useText();
  const { ref, scale, glow } = useInteractive({ id: `material-${id}`, scope, onActivate: onPick, magnet: 8 });
  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.sphereLarge} ad-press`}
      style={{ scale, '--glow': glow, ...sphereStyle('#8fb6d9', id) } as unknown as React.CSSProperties}
      data-active={active ? 'true' : 'false'}
      onClick={onPick}
      aria-label={text('dock.materialName', { material: label })}
      title={label}
      data-testid={`material-${id}`}
    />
  );
}

function SizeSlider({ width, scope, onChange }: { width: number; scope: string; onChange: (w: number) => void }) {
  // The interactive handle's ref must be the element that is measured: attaching
  // a different ref here would leave the region without a box, and a pinch could
  // never grab the slider at all.
  const { ref, glow } = useInteractive({
    id: 'size-slider',
    scope,
    magnet: 14,
    dragThreshold: 2,
    onDrag: (point) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const u = Math.min(Math.max((point.x - rect.left) / rect.width, 0), 1);
      onChange(Math.round(2 + u * 22));
    },
    onActivate: () => undefined,
  });
  const u = (width - 2) / 22;
  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={styles.slider}
      style={{ '--glow': glow } as unknown as React.CSSProperties}
      data-testid="size-slider"
    >
      <span className={styles.sliderTrack} aria-hidden="true" />
      <span className={styles.sliderFill} style={{ width: `${u * 100}%` }} aria-hidden="true" />
      <motion.span className={styles.sliderKnob} style={{ left: `${u * 100}%` }} aria-hidden="true" />
      <div className={styles.sliderMarks} aria-hidden="true">
        {BRUSH_WIDTHS.map((w) => (
          <span key={w} className={styles.sliderMark} style={{ left: `${((w - 2) / 22) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function BrushSizePreview({ width }: { width: number }) {
  return (
    <motion.div
      className={styles.sizePreview}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={motionTokens.hover}
      aria-hidden="true"
    >
      <span className={styles.sizePreviewDot} style={{ width: 8 + width * 2.4, height: 8 + width * 2.4 }} />
      <span className={styles.sizePreviewLabel}>{width}px</span>
    </motion.div>
  );
}

function ClearHold({ scope, onCancel, onConfirm }: { scope: string; onCancel: () => void; onConfirm: () => void }) {
  const { ref, hold } = useInteractive({
    id: 'clear-hold',
    scope,
    holdMs: CLEAR_HOLD_MS,
    magnet: 10,
    onHoldComplete: onConfirm,
  });
  const cancel = useInteractive({ id: 'clear-cancel', scope, onActivate: onCancel, magnet: 10 });
  return (
    <div className={styles.confirmBody}>
      <span className={styles.confirmTitle}>Clear everything?</span>
      <div className={styles.confirmActions}>
        <motion.button
          ref={cancel.ref as React.RefObject<HTMLButtonElement>}
          type="button"
          className={`${styles.confirmCancel} ad-press`}
          style={{ scale: cancel.scale }}
          onClick={onCancel}
          data-testid="clear-cancel"
        >
          Cancel
        </motion.button>
        <motion.button
          ref={ref as React.RefObject<HTMLButtonElement>}
          type="button"
          className={`${styles.confirmHold} ad-press`}
          data-testid="clear-hold"
        >
          <motion.span className={styles.confirmRing} style={{ scale: hold }} aria-hidden="true" />
          Hold to Clear
        </motion.button>
      </div>
    </div>
  );
}
