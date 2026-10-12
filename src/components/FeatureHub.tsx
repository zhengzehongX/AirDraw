import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { motionTokens, lineReveal } from '../design/motion';
import { useInteractive } from '../interaction/useInteractive';
import { useText } from '../i18n';
import type { TextKey } from '../i18n/zh';
import type { AppMode } from '../app/AppMode';
import { Logo, Wordmark } from './Logo';
import styles from './FeatureHub.module.css';

export type HubTarget = Extract<AppMode, 'CANVAS_DRAW' | 'SPATIAL_DRAW' | 'MODEL_CONTROL'>;

type Entry = {
  id: HubTarget;
  /** What people call the thing, not what the state machine calls it. */
  titleKey: TextKey;
  captionKey: TextKey;
  /** The internal mode name, kept as a quiet secondary label. */
  latin: string;
  preview: 'ink' | 'tube' | 'solid';
  accent: string;
};

/** Keys, never words: a module-level translated string would freeze the language. */
const ENTRIES: Entry[] = [
  { id: 'CANVAS_DRAW', titleKey: 'hub.canvas', captionKey: 'hub.canvasCaption', latin: 'Canvas', preview: 'ink', accent: '#077692' },
  { id: 'SPATIAL_DRAW', titleKey: 'hub.spatial', captionKey: 'hub.spatialCaption', latin: 'Spatial', preview: 'tube', accent: '#5570aa' },
  { id: 'MODEL_CONTROL', titleKey: 'hub.model', captionKey: 'hub.modelCaption', latin: 'Model', preview: 'solid', accent: '#3b827b' },
];

/**
 * The previews are 2D canvas drawn from the same palette as the surface they
 * describe, and only the card being looked at animates. Three live 3D scenes on a
 * menu would spend the exact GPU budget the workspace needs to feel smooth.
 */
function Preview({ kind, accent, live }: { kind: Entry['preview']; accent: string; live: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let t = 0;
    const w = canvas.width, h = canvas.height;
    const stroke = (path: [number, number][], width: number, alpha: number) => {
      ctx.beginPath();
      path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = accent;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    const curve = (phase: number): [number, number][] =>
      Array.from({ length: 34 }, (_, i) => {
        const u = i / 33;
        return [26 + u * (w - 52), h / 2 + Math.sin(u * 5.4 + phase) * (h * 0.22) * Math.sin(u * Math.PI)];
      });
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // The container paints the band; a second fill inside the canvas would show
      // as a lighter rectangle once the bitmap is letterboxed.
      if (kind === 'ink') {
        ctx.strokeStyle='rgba(82,92,112,.18)';ctx.lineWidth=1;
        ctx.strokeRect(22,12,w-44,h-24);
        const path = curve(live ? t * 0.9 : 0.6);
        const grown = path.slice(0, live ? Math.max(6, Math.floor(((t * 12) % 40))) : 26);
        stroke(grown, 4.2, 0.95);
      } else if (kind === 'tube') {
        // A rounded volumetric mark: the same curve drawn three times, offset.
        const path = curve(live ? t * 0.7 : 0.4);
        stroke(path.map(([x, y]) => [x, y + 4]), 14, 0.2);
        stroke(path, 12, 0.85);
        stroke(path.map(([x, y]) => [x, y - 2.4]), 3, 0.45);
      } else if (kind === 'solid') {
        const angle=live?t*.4+.5:.5,cs=Math.cos(angle),sn=Math.sin(angle),r=32;
        const vertices=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([x,y,z])=>{
          const rx=x*cs+z*sn,rz=z*cs-x*sn;
          return [w/2+rx*r,h/2+(y*.8-rz*.4)*r];
        });
        for(const face of [[0,1,2,3],[4,5,6,7],[0,4,7,3],[1,5,6,2],[0,1,5,4],[3,2,6,7]]){
          ctx.beginPath();face.forEach((v,i)=>{const [x,y]=vertices[v];i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();
          ctx.fillStyle=accent;ctx.globalAlpha=.07;ctx.fill();ctx.globalAlpha=.75;ctx.strokeStyle=accent;ctx.lineWidth=1.6;ctx.stroke();ctx.globalAlpha=1;
        }
      }
      if (live) {
        t += 1 / 60;
        raf = requestAnimationFrame(draw);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [kind, accent, live]);
  return <canvas ref={ref} width={320} height={132} className={styles.preview} aria-hidden="true" />;
}

function HubCard({ entry, order, focused, reduced, onFocus, onBlur, onPick }: { entry: Entry; order: number; focused: boolean; reduced: boolean; onFocus: () => void; onBlur: () => void; onPick: () => void }) {
  const text = useText();
  const { ref, scale, glow } = useInteractive({ id: `hub-${entry.id}`, scope: 'hub', magnet: 12, onActivate: onPick });
  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={styles.card}
      data-testid={`hub-${entry.id}`}
      style={{ scale }}
      onMouseEnter={onFocus}
      onMouseLeave={onBlur}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onPick}
      // The three doors arrive in reading order, one after another; the entrance is on
      // its own transition so hovering keeps answering immediately. Hover and press are
      // CSS (`translate`/`scale`), because `style.scale` belongs to the gesture magnet's
      // MotionValue and Motion will not animate a value style already owns.
      initial={{ opacity: 0, y: reduced ? 0 : 18 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : motionTokens.panel.duration, ease: motionTokens.panel.ease, delay: reduced ? 0 : motionTokens.stagger * order } }}
    >
      <motion.span className={styles.glow} style={{ opacity: glow }} aria-hidden="true" />
      <Preview kind={entry.preview} accent={entry.accent} live={focused && !reduced} />
      <span className={styles.cardText}>
        <span className={styles.cardTitle}>{text(entry.titleKey)}</span>
        <span className={styles.cardCaption}>{text(entry.captionKey)}</span>
      </span>
      <span className={styles.cardLatin}>{entry.latin}</span>
    </motion.button>
  );
}

export type FeatureHubProps = {
  reduced?: boolean;
  onPick: (target: HubTarget) => void;
  onGallery: () => void;
  onGuide: () => void;
  onSettings: () => void;
  /** Continued creation is offered only when there is something to continue. */
  recent?: { name: string; when: string } | null;
  onResume?: () => void;
  /** Truthful device readiness; never claims a hand or a microphone that is not there. */
  deviceNote?: string | null;
};

/**
 * The first screen after the welcome: not a parameter panel, but three obvious
 * doors. Everything here is reachable by mouse, touch, keyboard and pinch, and
 * nothing here needs the camera — the device is only asked for once a door is
 * chosen.
 */
function HubAction({id,onActivate,children}:{id:string;onActivate:()=>void;children:React.ReactNode}) {
  const {ref,scale}=useInteractive({id,scope:'hub',onActivate});
  return <motion.button ref={ref as React.RefObject<HTMLButtonElement>} style={{scale}} type="button" className={`${styles.textAction} ad-press`} data-testid={id} onClick={onActivate}>{children}</motion.button>;
}

export function FeatureHub({ onPick, onGallery, onGuide, onSettings, recent, onResume, deviceNote, reduced=false }: FeatureHubProps) {
  const text = useText();
  const reveal=(order:number)=>reduced?{initial:false as const,transition:{duration:0}}:lineReveal(order);
  const [focused, setFocused] = useState<HubTarget | null>(null);
  return (
    <motion.div
      className={styles.screen}
      data-testid="feature-hub"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -8, transition: motionTokens.pageExit }}
      transition={{ duration: reduced ? 0 : 0.24, ease: motionTokens.page.ease }}
    >
      {/* The entrance is layered: brand, invitation, the three doors, then the quiet
          row beneath. Nothing arrives at once, and nothing waits for a scroll. */}
      <motion.header className={styles.header} {...reveal(0)}>
        <span className={styles.brand}>
          <Logo size={26} />
          <Wordmark className={styles.wordmark} />
          <span className={styles.pageName}>{text('hub.pageName')}</span>
        </span>
        {/* The right half of the header belongs to the shared chrome — theme, device
            status and voice — so nothing here competes with it. */}
        <span className={styles.headerSpace} aria-hidden="true" />
      </motion.header>

      <main className={styles.main}>
        <motion.h1 className={styles.title} {...reveal(1)}>{text('hub.title')}</motion.h1>
        <motion.p className={styles.sub} {...reveal(2)}>{text('hub.sub')}</motion.p>

        <div className={styles.grid}>
          {ENTRIES.map((entry, index) => (
            <HubCard
              key={entry.id}
              entry={entry}
              order={3 + index}
              focused={focused === entry.id}
              reduced={reduced}
              onFocus={() => setFocused(entry.id)}
              onBlur={() => setFocused((current) => (current === entry.id ? null : current))}
              onPick={() => onPick(entry.id)}
            />
          ))}
        </div>

        {recent && (
          <motion.div className={styles.recent} data-testid="hub-recent" {...reveal(7)}>
            <span className={styles.recentText}>
              <span className={styles.recentLabel}>{text('hub.resume')}</span>
              <span className={styles.recentName}>{recent.name}</span>
              <span className={styles.recentWhen}>{recent.when}</span>
            </span>
            <HubAction id="hub-resume" onActivate={()=>onResume?.()}>{text('hub.resumeOpen')}</HubAction>
          </motion.div>
        )}

        <motion.div className={styles.secondary} {...reveal(8)}>
          <HubAction id="hub-gallery" onActivate={onGallery}>{text('common.gallery')}</HubAction>
          <HubAction id="hub-guide" onActivate={onGuide}>{text('common.help')}</HubAction>
          <HubAction id="hub-settings" onActivate={onSettings}>{text('common.settings')}</HubAction>
          {deviceNote && <span className={styles.deviceNote} data-testid="hub-device-note">{deviceNote}</span>}
        </motion.div>
      </main>
    </motion.div>
  );
}
