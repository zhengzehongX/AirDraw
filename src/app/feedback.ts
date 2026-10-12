/**
 * The one place any action can say something to the user.
 *
 * A single notice, replaced rather than stacked, with the timer owned here so a
 * component cannot leak a `setTimeout` that clears someone else's message.
 */

export type FeedbackTone = 'neutral' | 'success' | 'warn' | 'danger';

export type FeedbackNotice = {
  id: number;
  text: string;
  tone: FeedbackTone;
  /** Shown for this long, then faded by the owner component. */
  expiresAt: number;
};

const listeners = new Set<(notice: FeedbackNotice | null) => void>();
let current: FeedbackNotice | null = null;
let timer = 0;
let nextId = 1;

export function notify(
  text: string,
  options: { tone?: FeedbackTone; ms?: number } = {},
): void {
  const { tone = 'neutral', ms = 1500 } = options;
  clearNotice();
  current = { id: nextId++, text, tone, expiresAt: performance.now() + ms };
  timer = window.setTimeout(() => {
    current = null;
    emit();
  }, ms);
  emit();
}

export function clearNotice(): void {
  if (timer) window.clearTimeout(timer);
  timer = 0;
  if (current !== null) {
    current = null;
    emit();
  }
}

export function subscribeNotice(listener: (notice: FeedbackNotice | null) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener(current);
}
