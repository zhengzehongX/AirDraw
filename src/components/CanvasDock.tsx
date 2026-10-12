import { useState } from 'react';
import type { DrawEngine } from '../engine/DrawEngine';
import { GestureButton } from './GestureButton';
import { useInteractive } from '../interaction/useInteractive';
import { workspace } from '../project/workspace';
import { useText } from '../i18n';
const PAPER_LABELS = ['canvas.paperWhite', 'common.transparent', 'canvas.paperDark'] as const;

/**
 * The dot canvas's property rail. Only what the bottom row cannot carry lives here:
 * the paper the ink sits on, and the panel entries that turn ink into something else.
 * Pens, colours, widths, history and exports are reached from the row and the project
 * menu, so no control appears twice and no group holds a single button.
 */
export function CanvasDock({
  engine,
  focus,
  onWorkspace,
  hasInk,
}: {
  engine: DrawEngine;
  focus: boolean;
  onWorkspace?: (panel: 'make3d' | 'layers') => void;
  /** A conversion needs something to convert, so the entry waits for ink. */
  hasInk: boolean;
}) {
  const [, refresh] = useState(0);
  const text = useText();
  const change = (fn: () => void) => {
    fn();
    refresh((n) => n + 1);
  };
  // The zone itself is the drag target: the rail body scrolls, its buttons must not.
  const zone = useInteractive({ id: 'canvas-tools-zone', onDrag: (_p, d) => { if (zone.ref.current) zone.ref.current.scrollTop -= d.y; } });
  return (
    <aside
      ref={zone.ref as React.RefObject<HTMLElement>}
      className="ad-context-dock ad-glass"
      data-focus={focus}
      aria-label={text('canvas.aria')}
      data-testid="canvas-dock"
    >
      <section className="ad-railGroup">
        <h3 className="ad-railGroupTitle">{text('canvas.appearance')}</h3>
        <div className="ad-tool-grid">
          {(['white', 'transparent', 'dark'] as const).map((bg, i) => (
            <GestureButton key={bg} id={`paper-${bg}`} label={text(PAPER_LABELS[i])} active={engine.canvasBackground === bg} onActivate={() => change(() => { workspace.environment({ paper: bg }); })} />
          ))}
        </div>
      </section>
      <section className="ad-railGroup">
        <h3 className="ad-railGroupTitle">{text('canvas.layersGroup')}</h3>
        <div className="ad-tool-grid">
          <GestureButton id="canvas-layers" label={text('project.layers')} onActivate={() => onWorkspace?.('layers')} />
          {hasInk && <GestureButton id="canvas-make3d" label={text('canvas.make3d')} onActivate={() => onWorkspace?.('make3d')} />}
        </div>
      </section>
    </aside>
  );
}
