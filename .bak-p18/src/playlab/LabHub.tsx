import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import { TOY_CARDS, TOY_ORDER, type ToyCard } from './catalog';
import { GestureButton } from '../components/GestureButton';
import { useInteractive } from '../interaction/useInteractive';
import { useText } from '../i18n';
import { themeController } from '../theme/themeController';
import type { LabRuntime, LabStatus } from './runtime';
import type { ToyId } from './types';
import styles from './PlayLab.module.css';

/**
 * The card previews are little pictures of toys that glow on a dark scene, so their
 * ink has to follow the theme: a white core on a white card is exactly how the rail
 * became "the toys are missing" in day mode.
 */
function usePreviewInk(): { text: string; accent: string } {
  const [ink, setInk] = useState({ text: '232, 236, 244', accent: '34, 211, 238' });
  useEffect(
    () =>
      themeController.subscribe((_t, vars) => {
        const tri = (c: [number, number, number]) => `${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}`;
        setInk({ text: tri(vars.text), accent: tri(vars.accent) });
      }),
    [],
  );
  return ink;
}

/**
 * The PlayLab rail: five toys laid out in space rather than in a grid.
 *
 * The card under the hand is centred and the neighbours peek in from the sides, so
 * the rail reads as one continuous space you move through, not a menu you page
 * through. During a swipe the whole rail is dragged by the palm and only settles
 * after the commit — a page that teleports to its new position after recognition
 * feels like a slideshow.
 *
 * Previews are 2D canvas, drawn from the same palette and motion vocabulary as the
 * toy itself, and only the centred one animates: five live shaders on a card rail
 * is a waste of the GPU budget the toys need.
 */
const SPACING = 268;

function Preview({ card, live }: { card: ToyCard; live: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ink = usePreviewInk();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(${ink.text}, 0.06)`;
      ctx.fillRect(0, 0, w, h);
      const accent = card.thumbnail.accent;
      if (card.thumbnail.preview === 'orb') {
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
        const gradient = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, 26 + pulse * 8);
        gradient.addColorStop(0, `rgba(${ink.text}, 0.9)`);
        gradient.addColorStop(0.35, accent);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 30 + pulse * 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (card.thumbnail.preview === 'points') {
        for (let i = 0; i < 90; i += 1) {
          const a = i * 2.399 + t * 0.5;
          const r = 4 + Math.sqrt(i) * 4.4;
          ctx.fillStyle = `rgba(${ink.accent}, ${Math.max(0, 0.85 - r / 90)})`;
          ctx.beginPath();
          ctx.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r * 0.45, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (card.thumbnail.preview === 'fluid') {
        for (let i = 0; i < 5; i += 1) {
          const x = w / 2 + Math.cos(t * 0.7 + i) * (18 + i * 5);
          const y = h / 2 + Math.sin(t * 0.9 + i * 1.7) * (10 + i * 3);
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, 26);
          gradient.addColorStop(0, accent);
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, w, h);
        }
      } else if (card.thumbnail.preview === 'water') {
        ctx.strokeStyle = accent;
        for (let row = 0; row < 5; row += 1) {
          ctx.globalAlpha = 0.18 + row * 0.13;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 6) ctx.lineTo(x, h * 0.35 + row * 9 + Math.sin(x * 0.06 + t * 1.4 + row) * 4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        for (let i = 0; i < 26; i += 1) {
          const a = (i / 26) * Math.PI * 2;
          const life = ((t * 0.6 + i * 0.13) % 1);
          ctx.fillStyle = `rgba(${ink.accent}, ${1 - life})`;
          ctx.beginPath();
          ctx.arc(w / 2 + Math.cos(a) * life * 34, h / 2 + Math.sin(a) * life * 26 + life * life * 12, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    const loop = () => {
      t += 0.016;
      draw();
      raf = requestAnimationFrame(loop);
    };
    if (live) raf = requestAnimationFrame(loop);
    else draw();
    return () => cancelAnimationFrame(raf);
  }, [card, live, ink]);
  return <canvas ref={ref} width={220} height={132} className={styles.preview} aria-hidden="true" />;
}

function Card({ card, selected, offset, onEnter }: { card: ToyCard; selected: boolean; offset: number; onEnter: () => void }) {
  const text = useText();
  const zone = useInteractive({ id: `lab-card-${card.id}`, scope: 'playlab', onActivate: onEnter, magnet: 10 });
  const depth = Math.min(1, Math.abs(offset) / SPACING);
  return (
    <motion.div
      ref={zone.ref as React.RefObject<HTMLDivElement>}
      data-testid={`lab-card-${card.id}`}
      data-selected={selected ? 'true' : 'false'}
      className={`${styles.card} ad-glass`}
      style={{
        transform: `translate3d(${offset}px, 0, ${-depth * 220}px) rotateY(${-offset * 0.035}deg) scale(${1 - depth * 0.16})`,
        opacity: 1 - depth * 0.42,
      }}
    >
      <Preview card={card} live={selected} />
      <h3>{text(card.titleKey)}</h3>
      <p>{text(card.descriptionKey)}</p>
      {selected && <span className={styles.hint}>{text('playlab.enter')} · {text('playlab.twoHands')}</span>}
    </motion.div>
  );
}

/**
 * The five states a player is allowed to see, each with the reason it is in that
 * state. `ready` is only reached once the toy is mounted and a hand is present —
 * an empty scene never claims to be playable.
 */
const STATUS: Record<LabStatus, { key: 'playlab.loading' | 'playlab.waitingHand' | 'playlab.ready' | 'playlab.paused' | 'playlab.failed'; tone: 'dim' | 'warn' | 'ok' }> = {
  loading: { key: 'playlab.loading', tone: 'dim' },
  waiting: { key: 'playlab.waitingHand', tone: 'warn' },
  ready: { key: 'playlab.ready', tone: 'ok' },
  paused: { key: 'playlab.paused', tone: 'warn' },
  failed: { key: 'playlab.failed', tone: 'warn' },
};

export function LabChrome({ runtime, onReturnToCanvas }: { runtime: LabRuntime; onReturnToCanvas: () => void }) {
  const state = useSyncExternalStore(runtime.subscribe, () => runtime.state);
  const text = useText();
  const card = state.toy ? TOY_CARDS[state.toy] : null;
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    setFaded(false);
    const timer = setTimeout(() => setFaded(true), 9000);
    return () => clearTimeout(timer);
  }, [state.toy]);
  const status = STATUS[state.status];
  const detail = state.status === 'ready' ? null : state.detail;
  return (
    <div className={styles.chrome} data-testid="lab-chrome" data-status={state.status}>
      <header className={styles.chromeHead}>
        {card && (
          <>
            <h2>{text(card.titleKey)}</h2>
            <small>{card.title}</small>
          </>
        )}
        <span className={styles.status} data-tone={status.tone} data-testid="lab-status">
          <span className={styles.statusDot} aria-hidden="true" />
          {text(status.key)}
          {detail && <em>{detail}</em>}
        </span>
      </header>
      {state.status === 'ready' && card && (
        <motion.p className={styles.lesson} animate={{ opacity: faded ? 0 : 1 }} transition={{ duration: 0.8 }}>
          {text(card.promptKey)}
        </motion.p>
      )}
      <div className={styles.chromeFoot}>
        {state.status === 'failed' && (
          <GestureButton id="lab-retry" scope="toy" label={text('common.retry')} onActivate={() => runtime.retry()} />
        )}
        {/* Two permanent doors, always in the same place: the rail, and straight
            back to the board the player came from. A toy that failed to render
            still has to be leaveable in one move. */}
        <GestureButton id="lab-canvas" scope="toy" label={text('playlab.leave')} onActivate={onReturnToCanvas} />
        <GestureButton id="lab-back" scope="toy" label={text('playlab.backToRail')} onActivate={() => runtime.back()} />
      </div>
    </div>
  );
}

export function LabHub({ runtime, onLeave }: { runtime: LabRuntime; onLeave: () => void }) {
  const text = useText();
  const state = useSyncExternalStore(runtime.subscribe, () => runtime.state);
  const swipe = state.swipeState === 'TRACKING' || state.swipeState === 'COMMIT' ? state.swipe : 0;
  // The rail follows the palm while a swipe is in flight, then settles on the index.
  const centre = state.index * SPACING - swipe * SPACING * 0.55;
  return (
    <div className={styles.railPosition} data-testid="lab-hub">
      <div className={styles.lede}>
        <h2>PlayLab</h2>
        <p>{text('playlab.intro')}</p>
        <GestureButton id="lab-leave" scope="playlab" label={text('playlab.leave')} onActivate={onLeave} />
      </div>
      <div className={styles.rail}>
        {TOY_ORDER.map((id: ToyId, index) => (
          <Card key={id} card={TOY_CARDS[id]} selected={index === state.index} offset={index * SPACING - centre} onEnter={() => runtime.request(id)} />
        ))}
      </div>
      <div className={styles.dots} aria-hidden="true">
        {TOY_ORDER.map((id, index) => (
          <span
            key={id}
            className={styles.dot}
            data-current={index === state.index ? 'true' : 'false'}
            style={{ transform: `scaleX(${index === state.index ? 1 + Math.abs(swipe) * 0.9 : 1})`, opacity: index === state.index ? 1 : 0.45 }}
          />
        ))}
      </div>
    </div>
  );
}
