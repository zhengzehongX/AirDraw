import {motionTokens} from '../design/motion';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { CLEAR_HOLD_MS } from '../config';
import { useInteractive } from '../interaction/useInteractive';
import { t, useText } from '../i18n';
import type { TextKey } from '../i18n/zh';
import type { Artwork } from '../storage/artworks';
import styles from './GalleryScreen.module.css';

const SCOPE = 'gallery';
const PAGE_TRIGGER_PX = 70;

export type GalleryScreenProps = {
  items: Artwork[];
  /** Index of the focused card; may exceed the list when there is nothing to focus. */
  focus: number;
  /** Id whose delete confirmation is open. */
  pendingDelete: string | null;
  reduced: boolean;
  /** Backdrop the next PNG export is photographed against. */
  backdrop: 'none' | 'day' | 'night';
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArmDelete: (id: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onExportPng: (id: string) => void;
  onExportJson: (id: string) => void;
  onBackdrop: (backdrop: 'none' | 'day' | 'night') => void;
  onImport: (file: File) => void;
  onFocusIndex: (index: number) => void;
  onClose: () => void;
};

const BACKDROPS: { id: 'none' | 'day' | 'night'; labelKey: TextKey }[] = [
  { id: 'none', labelKey: 'common.transparent' },
  { id: 'day', labelKey: 'common.themeDay' },
  { id: 'night', labelKey: 'common.themeNight' },
];

/**
 * The artwork library, worked entirely by POINT + PINCH.
 *
 * A card is two layers: the region sits on the box motion scales for hover, the
 * painted surface scales for focus inside it, because an inline motion transform
 * and a CSS transform on one node would leave only one of them standing.
 * And 删除 never deletes — it arms a flyout whose confirm is a held ring, like the
 * dock's Clear, with every other gallery target gone deaf so the ring can never
 * be pressed *through* the button that opened it.
 */
export function GalleryScreen(props: GalleryScreenProps): React.JSX.Element {
  const {
    items,
    focus,
    pendingDelete,
    reduced,
    backdrop,
    onOpen,
    onDuplicate,
    onArmDelete,
    onConfirmDelete,
    onCancelDelete,
    onExportPng,
    onExportJson,
    onBackdrop,
    onImport,
    onFocusIndex,
    onClose,
  } = props;
  const text = useText();
  const lastIndex = Math.max(0, items.length - 1);
  const travel = useRef(0);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const { ref: sheetRef } = useInteractive({
    id: 'gallery-sheet',
    scope: SCOPE,
    magnet: 0,
    dragThreshold: 4,
    onDrag: (_point, delta) => {
      travel.current += delta.y;
      if (Math.abs(travel.current) < PAGE_TRIGGER_PX) return;
      const next = focus + (travel.current < 0 ? 1 : -1);
      travel.current = 0;
      if (next < 0 || next > lastIndex) return;
      onFocusIndex(next);
    },
  });

  return (
    <div className={`${styles.stage} ad-scrim`} data-testid="gallery">
      <div className={styles.inner}>
        <motion.section
          ref={sheetRef as React.RefObject<HTMLElement>}
          className={`${styles.sheet} ad-glass`}
          initial={{ opacity: 0, y: reduced ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced?{duration:0}:motionTokens.panel}
        >
          <header className={styles.head}>
            <h2 className="ad-title">{text('common.gallery')}</h2>
            <div className={styles.headActions}>
              <input
                ref={fileInput}
                className={styles.file}
                type="file"
                accept="application/json,.json"
                data-testid="gallery-import-file"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onImport(file);
                  event.currentTarget.value = '';
                }}
              />
              <GalleryButton
                id="gallery-import"
                label={text('gallery.importAria')}
                className={styles.headButton}
                onActivate={() => fileInput.current?.click()}
              >
                {text('gallery.import')}
              </GalleryButton>
              <GalleryButton id="gallery-close" label={text('common.close')} className={styles.close} onActivate={onClose}>
                <svg className="ad-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </GalleryButton>
            </div>
          </header>

          <div className={styles.body}>
            {items.length === 0 ? (
              <div className={styles.empty} data-testid="gallery-empty">
                <p className={styles.emptyTitle}>{text('gallery.emptyTitle')}</p>
                <p className="ad-body">{text('gallery.emptyBody')}</p>
              </div>
            ) : (
              <div className={styles.grid} data-testid="gallery-grid">
                {items.map((item, index) => (
                  <Card
                    key={item.id}
                    item={item}
                    index={index}
                    focused={index === focus}
                    armed={pendingDelete === item.id}
                    locked={pendingDelete !== null}
                    reduced={reduced}
                    onOpen={onOpen}
                    onDuplicate={onDuplicate}
                    onArmDelete={onArmDelete}
                    onCancelDelete={onCancelDelete}
                    onConfirmDelete={onConfirmDelete}
                    onExportPng={onExportPng}
                    onExportJson={onExportJson}
                    onFocusIndex={onFocusIndex}
                  />
                ))}
              </div>
            )}
          </div>

          <footer className={styles.foot}>
            <span className={styles.count}>{text('gallery.count', { count: items.length })}</span>
            <div className={styles.chips} role="group" aria-label={text('gallery.backdropAria')} data-testid="png-backdrop">
              {BACKDROPS.map((option) => (
                <BackdropChip
                  key={option.id}
                  id={option.id}
                  label={text(option.labelKey)}
                  active={backdrop === option.id}
                  onPick={() => onBackdrop(option.id)}
                />
              ))}
            </div>
            <span className={styles.hint}>{text('gallery.dragHint')}</span>
          </footer>
        </motion.section>
      </div>
    </div>
  );
}

type CardProps = {
  item: Artwork;
  index: number;
  focused: boolean;
  armed: boolean;
  locked: boolean;
  reduced: boolean;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onExportPng: (id: string) => void;
  onExportJson: (id: string) => void;
  onFocusIndex: (index: number) => void;
};

function Card({
  item,
  index,
  focused,
  armed,
  locked,
  reduced,
  onOpen,
  onDuplicate,
  onArmDelete,
  onCancelDelete,
  onConfirmDelete,
  onExportPng,
  onExportJson,
  onFocusIndex,
}: CardProps) {
  const text = useText();
  const { ref, scale, glow } = useInteractive({
    id: `gallery-card-${item.id}`,
    scope: SCOPE,
    magnet: 8,
    onActivate: () => onFocusIndex(index),
    isDisabled: () => locked,
  });

  useEffect(() => {
    // Focus is only useful if the card it lands on is on screen.
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [focused, reduced]);

  return (
    <motion.div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={styles.card}
      style={{ scale, '--glow': glow } as unknown as React.CSSProperties}
      data-focused={focused ? 'true' : 'false'}
      onClick={() => onFocusIndex(index)}
      data-testid={`gallery-card-${item.id}`}
    >
      <div className={`${styles.surface} ad-card`}>
        <div className={styles.media}>
          {item.thumbnail ? (
            <img className={styles.thumb} src={item.thumbnail} alt="" draggable={false} />
          ) : (
            <div className={styles.placeholder}>
              <span className={styles.placeholderCount}>{item.strokeCount}</span>
              <span className={styles.placeholderLabel}>{text('gallery.strokeUnit')}</span>
            </div>
          )}
        </div>
        <h3 className={styles.title}>{item.title}</h3>
        <p className={`${styles.meta} ad-caption`}>
          {relativeTime(item.updatedAt)} · {text('gallery.strokes', { count: item.strokeCount })}
        </p>
        <div className={styles.actions}>
          <GalleryButton
            id={`gallery-open-${item.id}`}
            label={text('gallery.openAria', { name: item.title })}
            className={styles.primary}
            disabled={locked}
            onActivate={() => onOpen(item.id)}
          >
            {text('common.open')}
          </GalleryButton>
          <GalleryButton
            id={`gallery-copy-${item.id}`}
            label={text('gallery.copyAria', { name: item.title })}
            disabled={locked}
            onActivate={() => onDuplicate(item.id)}
          >
            {text('common.copy')}
          </GalleryButton>
          <GalleryButton
            id={`gallery-png-${item.id}`}
            label={text('gallery.pngAria', { name: item.title })}
            disabled={locked}
            onActivate={() => onExportPng(item.id)}
          >
            {text('gallery.exportPng')}
          </GalleryButton>
          <GalleryButton
            id={`gallery-json-${item.id}`}
            label={text('gallery.jsonAria', { name: item.title })}
            disabled={locked}
            onActivate={() => onExportJson(item.id)}
          >
            {text('gallery.exportJson')}
          </GalleryButton>
          <GalleryButton
            id={`gallery-delete-${item.id}`}
            label={text('gallery.deleteAria', { name: item.title })}
            className={styles.danger}
            disabled={locked}
            onActivate={() => onArmDelete(item.id)}
          >
            {text('common.delete')}
          </GalleryButton>
        </div>
      </div>

      <AnimatePresence>
        {armed && (
          <motion.div
            className={`${styles.confirm} ad-glass`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced?{duration:0}:motionTokens.panel}
            data-testid="gallery-confirm"
          >
            <p className={styles.confirmTitle}>{text('gallery.deleteConfirm', { name: item.title })}</p>
            <DeleteHold onCancel={onCancelDelete} onConfirm={onConfirmDelete} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** The destructive step: nothing leaves the library until the ring is filled. */
function DeleteHold({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const text = useText();
  const mouseHold=useRef(0);
  // The ring's progress is written straight to the node: a React state update per
  // detection frame would re-render the whole gallery while the user is holding.
  const ring = useRef<HTMLSpanElement | null>(null);
  const setProgress = (progress: number) => {
    ring.current?.style.setProperty('--p', progress.toFixed(3));
  };

  const hold = useInteractive({
    id: 'gallery-confirm-hold',
    scope: SCOPE,
    magnet: 12,
    holdMs: CLEAR_HOLD_MS,
    onHoldProgress: setProgress,
    onHoldComplete: () => {
      setProgress(0);
      onConfirm();
    },
  });
  const cancel = useInteractive({ id: 'gallery-confirm-cancel', scope: SCOPE, magnet: 12, onActivate: onCancel });

  return (
    <div className={styles.confirmActions}>
      <motion.button
        ref={cancel.ref as React.RefObject<HTMLButtonElement>}
        type="button"
        className={`${styles.confirmCancel} ad-press`}
        style={{ scale: cancel.scale }}
        onClick={onCancel}
        data-testid="gallery-confirm-cancel"
      >
        {text('common.cancel')}
      </motion.button>
      <motion.button
        ref={hold.ref as React.RefObject<HTMLButtonElement>}
        type="button"
        className={`${styles.confirmHold} ad-press`}
        style={{ scale: hold.scale }}
        onPointerDown={() => {mouseHold.current=window.setTimeout(onConfirm,CLEAR_HOLD_MS);}}
        onPointerUp={() => window.clearTimeout(mouseHold.current)}
        onPointerLeave={() => window.clearTimeout(mouseHold.current)}
        onPointerCancel={() => window.clearTimeout(mouseHold.current)}
        data-testid="gallery-confirm-hold"
      >
        <span className={styles.confirmRing} ref={ring} aria-hidden="true" />
        {text('gallery.holdToDelete')}
      </motion.button>
    </div>
  );
}

/** The backdrop a PNG is photographed against is a visible choice, not a hidden default. */
function BackdropChip({
  id,
  label,
  active,
  onPick,
}: {
  id: 'none' | 'day' | 'night';
  label: string;
  active: boolean;
  onPick: () => void;
}) {
  const { ref, scale, glow } = useInteractive({
    id: `gallery-backdrop-${id}`,
    scope: SCOPE,
    magnet: 6,
    onActivate: onPick,
  });
  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.chip} ad-press`}
      style={{ scale, '--glow': glow } as unknown as React.CSSProperties}
      onClick={onPick}
      data-active={active ? 'true' : 'false'}
      data-testid={`gallery-backdrop-${id}`}
      aria-pressed={active}
    >
      {label}
    </motion.button>
  );
}

/** A text or glyph target that behaves exactly like every other spatial control. */
function GalleryButton({
  id,
  label,
  className,
  disabled,
  onActivate,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  disabled?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  const { ref, scale, glow } = useInteractive({
    id,
    scope: SCOPE,
    magnet: 10,
    onActivate,
    isDisabled: () => disabled === true,
  });
  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.button} ad-press ${className ?? ''}`}
      style={{ scale, '--glow': glow } as unknown as React.CSSProperties}
      data-disabled={disabled ? 'true' : 'false'}
      onClick={onActivate}
      aria-label={label}
      data-testid={id}
    >
      {children}
    </motion.button>
  );
}

/** `t()` reads the live locale per call, so this stays correct either way. */
export function relativeTime(at: number, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - at);
  const minute = 60_000;
  if (elapsed < minute) return t('gallery.justNow');
  if (elapsed < 60 * minute) return t('gallery.minutesAgo', { count: Math.floor(elapsed / minute) });
  if (elapsed < 24 * 60 * minute) return t('gallery.hoursAgo', { count: Math.floor(elapsed / (60 * minute)) });
  return t('gallery.daysAgo', { count: Math.floor(elapsed / (24 * 60 * minute)) });
}
