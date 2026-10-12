import { useCallback, useEffect, useRef, useState } from 'react';
import { workspace } from '../project/workspace';
import { analyzeGeometry, type Suggestion } from '../recognition/geometry';
import type { DrawEngine } from '../engine/DrawEngine';
import { GestureButton } from './GestureButton';
import { useInteractive } from '../interaction/useInteractive';
import { appMode } from '../app/AppMode';
import { getRecognitionProvider } from '../recognition/provider';

/**
 * The last un-locked stroke on the paper, with a fingerprint of its ink. The
 * fingerprint is what lets the effect tell «the drawing moved» from «the same drawing
 * was re-declared» — the project bridge publishes history again when it writes the
 * sheet back after an autosave, and that used to blank a card mid-aim.
 */
function canvasTarget() {
  const list = workspace.project.objects.filter((object) => object.type === 'stroke2d' && !object.locked);
  const object = list.at(-1);
  const ink = `${list.length}|${object?.id ?? 'none'}|${object?.recognition ?? ''}|${object?.stroke?.segments.map((segment) => segment.length).join('.') ?? ''}`;
  return { object, ink };
}

export function RecognitionSuggestion({ engine }: { engine: DrawEngine }) {
  const [candidate, setCandidate] = useState<{ id: string; suggestion?: Suggestion; text?: string } | null>(null);
  const shown = useRef<{ id: string; ink: string } | null>(null);
  const zone = useInteractive({ id: 'recognition-zone' });
  const publish = useCallback((next: { id: string; ink: string; suggestion?: Suggestion; text?: string } | null) => {
    shown.current = next ? { id: next.id, ink: next.ink } : null;
    setCandidate(next);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, fade: ReturnType<typeof setTimeout>, abort = new AbortController();
    const off = engine.onHistoryChange(() => {
      const { ink } = canvasTarget();
      if (shown.current && shown.current.ink === ink && !engine.activeStroke) return;
      abort.abort();
      abort = new AbortController();
      clearTimeout(timer);
      clearTimeout(fade);
      publish(null);
      timer = setTimeout(() => {
        const signal = abort.signal;
        const analyze = async () => {
          if (engine.activeStroke || appMode.getSnapshot().mode !== 'CANVAS_DRAW' || signal.aborted) return;
          const { object, ink: currentInk } = canvasTarget();
          if (!object?.stroke || object.recognition) return;
          const suggestion = analyzeGeometry(object.stroke.segments.flat());
          let text: string | undefined;
          if (!suggestion) {
            try {
              const result = await getRecognitionProvider()?.recognize([object.stroke], signal);
              if (result && result.confidence >= 0.8) text = result.text.slice(0, 80);
            } catch { /* A failed optional provider never interrupts ink. */ }
          }
          if (signal.aborted || engine.activeStroke) return;
          if (!suggestion && !text) return;
          publish({ id: object.id, ink: currentInk, suggestion: suggestion ?? undefined, text });
          fade = setTimeout(() => publish(null), 6500);
        };
        if ('requestIdleCallback' in window) window.requestIdleCallback(() => void analyze(), { timeout: 300 });
        else void analyze();
      }, 850);
    });
    return () => { off(); abort.abort(); clearTimeout(timer); clearTimeout(fade); };
  }, [engine, publish]);

  useEffect(() => engine.onCursor((cursor) => { if (cursor.drawing) publish(null); }), [engine, publish]);

  if (!candidate) return null;
  const object = workspace.project.objects.find((item) => item.id === candidate.id);
  const point = object?.stroke?.segments.at(-1)?.at(-1);
  // The stroke point is a document point: on the dot canvas the sheet can be zoomed and
  // panned, so the card has to follow it through the canvas camera like the ink does.
  const screen = point ? engine.docToScreen(point) : null;
  return (
    <div
      ref={zone.ref as React.RefObject<HTMLDivElement>}
      className="ad-recognition ad-glass"
      style={screen ? { left: Math.min(innerWidth - 190, Math.max(190, screen.x)), top: Math.min(innerHeight - 180, Math.max(100, screen.y + 48)), bottom: 'auto' } : undefined}
    >
      <GestureButton
        id="recognition-confirm"
        label={candidate.suggestion?.label ?? `识别为 ${candidate.text}`}
        onActivate={() => {
          const target = workspace.project.objects.find((item) => item.id === candidate.id);
          if (target?.stroke && !target.locked) {
            workspace.patch(
              target.id,
              candidate.suggestion
                ? { recognition: 'geometry', stroke: { ...target.stroke, segments: [candidate.suggestion.points] } }
                : { recognition: 'text', text: candidate.text },
              '识别转换',
            );
          }
          publish(null);
        }}
      />
    </div>
  );
}
