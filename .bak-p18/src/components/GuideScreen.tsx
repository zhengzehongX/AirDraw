import {motionTokens} from '../design/motion';
import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { HandGlyph } from './HandGlyph';
import { useInteractive } from '../interaction/useInteractive';
import { useText } from '../i18n';
import { GESTURE_CARDS, GUIDE_SECTIONS, type GestureKey, type GuideBlock } from '../guide/content';
import type { GestureName } from '../types/drawing';
import styles from './GuideScreen.module.css';

const SCOPE = 'help';
const PAGE_TRIGGER_PX = 70;

export type GuideScreenProps = {
  section: number;
  practice: GestureKey | null;
  gesture: GestureName;
  pinched: boolean;
  handPresent: boolean;
  confidence: number;
  devMode: boolean;
  reduced: boolean;
  onSection: (index: number) => void;
  onPractice: (gesture: GestureKey | null) => void;
  onClose: () => void;
};

/**
 * The built-in user guide.
 *
 * It is not a wall of text: the gesture cards light up from the live tracker, so
 * reading about a pinch and proving one happen in the same place, and the whole
 * sheet is navigable by the same POINT + PINCH the guide is describing.
 */
export function GuideScreen({
  section,
  practice,
  gesture,
  pinched,
  handPresent,
  confidence,
  devMode,
  reduced,
  onSection,
  onPractice,
  onClose,
}: GuideScreenProps) {
  const text = useText();
  const travel = useRef(0);
  const { ref: sheetRef } = useInteractive({
    id: 'guide-sheet',
    scope: SCOPE,
    magnet: 0,
    dragThreshold: 4,
    onDrag: (_point, delta) => {
      travel.current += delta.y;
      if (Math.abs(travel.current) < PAGE_TRIGGER_PX) return;
      const direction = travel.current < 0 ? 1 : -1;
      travel.current = 0;
      onSection((section + direction + total) % total);
    },
  });

  const total = GUIDE_SECTIONS.length + 1;
  const inPractice = practice !== null || section >= GUIDE_SECTIONS.length;
  const current = inPractice ? null : GUIDE_SECTIONS[section];
  return (
    <div className={styles.scrim} data-testid="guide">
      <div className={styles.inner}>
        <motion.section
          ref={sheetRef as React.RefObject<HTMLElement>}
          className={`${styles.sheet} ad-glass`}
          initial={{ opacity: 0, y: reduced ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced?{duration:0}:motionTokens.panel}
        >
          <header className={styles.head}>
            <p className="ad-eyebrow">{text('guide.eyebrow')}</p>
            <GuideButton id="guide-close" label={text('common.close')} onActivate={onClose} className={styles.close}>
              <svg className="ad-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </GuideButton>
          </header>

          <nav className={styles.nav} aria-label={text('guide.chapters')} data-testid="guide-chapter-nav">
            {GUIDE_SECTIONS.map((item, index) => (
              <GuideButton
                key={item.id}
                id={`guide-section-${index}`}
                label={item.title}
                className={styles.navItem}
                active={!inPractice && section === index}
                onActivate={() => {
                  onPractice(null);
                  onSection(index);
                }}
              >
                {item.title}
              </GuideButton>
            ))}
            <GuideButton
              id="guide-practice-tab"
              label={text('guide.practice')}
              className={styles.navItem}
              active={inPractice && practice === null}
              onActivate={() => {
                onPractice(null);
                onSection(GUIDE_SECTIONS.length);
              }}
            >
              {text('guide.practice')}
            </GuideButton>
          </nav>

          <div className={styles.body} data-testid="guide-body">
            <AnimatePresence mode="wait">
              <motion.div
                key={inPractice ? `practice-${practice ?? 'menu'}` : current?.id}
                initial={{ opacity: 0, y: reduced ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : -8 }}
                transition={reduced?{duration:0}:motionTokens.panel}
                className={styles.pane}
              >
                {inPractice ? (
                  <PracticePane
                    gesture={gesture}
                    handPresent={handPresent}
                    confidence={confidence}
                    devMode={devMode}
                    practice={practice}
                    onPractice={onPractice}
                  />
                ) : (
                  <>
                    <h2 className={styles.title}>{current?.title}</h2>
                    <p className={styles.summary}>{current?.summary}</p>
                    {current?.id === 'gestures' && <GestureGrid gesture={gesture} pinched={pinched} />}
                    {current?.blocks.map((block, index) => (
                      <Block key={index} block={block} gesture={gesture} pinched={pinched} handPresent={handPresent} />
                    ))}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className={styles.foot}>
            <GuideButton id="guide-prev" label={text('guide.prev')} onActivate={() => onSection((section - 1 + total) % total)}>
              ← {text('guide.prev')}
            </GuideButton>
            <span className={styles.pageHint}>
              {inPractice ? text('guide.practice') : `${section + 1} / ${GUIDE_SECTIONS.length}`} · {text('guide.dragToPage')}
            </span>
            <GuideButton id="guide-next" label={text('guide.next')} onActivate={() => onSection((section + 1) % total)}>
              {text('guide.next')} →
            </GuideButton>
          </footer>
        </motion.section>
      </div>
    </div>
  );
}

function Block({
  block,
  gesture,
  pinched,
  handPresent,
}: {
  block: GuideBlock;
  gesture: GestureName;
  pinched: boolean;
  handPresent: boolean;
}) {
  const text = useText();
  if (block.kind === 'p') return <p className={styles.p}>{block.text}</p>;
  if (block.kind === 'list')
    return (
      <ul className={styles.list}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  if (block.kind === 'steps')
    return (
      <ol className={styles.steps}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  if (block.kind === 'table')
    return (
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{block.head[0]}</th>
            <th>{block.head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row[0]}>
              <td>{row[0]}</td>
              <td>{row[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  return (
    <div className={styles.live}>
      <div className={styles.liveReadout} data-on={handPresent ? 'true' : 'false'}>
        <span className={styles.liveLabel}>{handPresent ? gesture === 'NONE' ? text('guide.handSeen') : gesture : 'Show your hand'}</span>
        <span className={styles.livePinch} data-on={pinched ? 'true' : 'false'} />
      </div>
      <p className={styles.p}>{block.text}</p>
    </div>
  );
}

/** The cheat-sheet: one card per gesture, lighting up as the tracker sees it. */
function GestureGrid({ gesture, pinched }: { gesture: GestureName; pinched: boolean }) {
  return (
    <div className={styles.grid} data-testid="guide-gestures">
      {GESTURE_CARDS.map((card) => {
        const live =
          card.key === 'PINCH_MOVE'
            ? gesture === 'PINCH' && pinched
            : card.key === 'PINCH'
              ? gesture === 'PINCH' && !pinched
              : gesture === card.gesture;
        return (
          <div key={card.key} className={styles.card} data-live={live ? 'true' : 'false'} data-testid={`guide-card-${card.key}`}>
            <HandGlyph pose={card.gesture} size={54} />
            <div className={styles.cardText}>
              <span className={styles.cardName}>{card.name}</span>
              <span className={styles.cardPurpose}>{card.purpose}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PracticePane({
  gesture,
  handPresent,
  confidence,
  devMode,
  practice,
  onPractice,
}: {
  gesture: GestureName;
  handPresent: boolean;
  confidence: number;
  devMode: boolean;
  practice: GestureKey | null;
  onPractice: (g: GestureKey | null) => void;
}) {
  const text = useText();
  const card = GESTURE_CARDS.find((item) => item.key === practice);
  if (!card)
    return (
      <>
        <h2 className={styles.title}>{text('guide.practice')}</h2>
        <p className={styles.summary}>{text('guide.practiceIntro')}</p>
        <div className={styles.grid}>
          {GESTURE_CARDS.map((item) => (
            <GuideButton
              key={item.key}
              id={`guide-practice-${item.key}`}
              label={item.name}
              className={styles.card}
              onActivate={() => onPractice(item.key)}
            >
              <HandGlyph pose={item.gesture} size={54} />
              <div className={styles.cardText}>
                <span className={styles.cardName}>{item.name}</span>
                <span className={styles.cardPurpose}>{item.purpose}</span>
              </div>
            </GuideButton>
          ))}
        </div>
      </>
    );

  const matched =
    card.key === 'PINCH' || card.key === 'PINCH_MOVE' ? gesture === 'PINCH' : gesture === card.gesture;
  return (
    <>
      <h2 className={styles.title}>{card.name}</h2>
      <p className={styles.summary}>{card.purpose}</p>
      <div className={styles.practice}>
        <HandGlyph pose={card.gesture} size={132} highlight={card.key === 'FIST' ? undefined : ['index', 'thumb']} />
        <div className={styles.verdict} data-on={matched ? 'true' : 'false'} data-testid="practice-verdict">
          <span className={styles.verdictDot} aria-hidden="true" />
          <div>
            <p className={styles.verdictTitle}>{!handPresent ? text('guide.putHand') : matched ? text('guide.recognised') : text('guide.tryAgain')}</p>
            {devMode && <p className={styles.verdictMetric}>confidence {confidence.toFixed(2)}</p>}
          </div>
        </div>
      </div>
      <GuideButton id="guide-practice-back" label={text('guide.changeGesture')} className={styles.back} onActivate={() => onPractice(null)}>
        ← {text('guide.changeGesture')}
      </GuideButton>
    </>
  );
}

/** A text or card target that behaves exactly like every other spatial control. */
function GuideButton({
  id,
  label,
  className,
  active,
  onActivate,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  active?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  const { ref, scale, glow } = useInteractive({ id, scope: SCOPE, magnet: 8, onActivate });
  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.button} ad-press ${className ?? ''}`}
      style={{ scale, '--glow': glow } as unknown as React.CSSProperties}
      data-active={active ? 'true' : 'false'}
      onClick={onActivate}
      aria-label={label}
      data-testid={id}
    >
      {children}
    </motion.button>
  );
}
