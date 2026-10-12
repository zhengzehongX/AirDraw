import { HAND_SWITCH_FRAMES, HAND_SWITCH_MARGIN } from '../config';
import type { Handedness, TrackedHand } from '../types/hand';

export type DominantHandMode = 'auto' | 'Left' | 'Right';

export type PrimaryHandSelection = {
  primary: TrackedHand | null;
  secondary: TrackedHand | null;
  /** True on the tick the primary identity changed (filters must reset). */
  switched: boolean;
};

/**
 * With two hands in frame, the drawing hand must not flicker between them or
 * every stroke would jump mid-line. In `auto` the current primary is kept
 * unless an alternative is clearly better (score margin) for several
 * consecutive ticks; a fixed dominant hand always wins when present.
 */
export class PrimaryHandSelector {
  private handedness: Handedness | null = null;
  private switchFrames = 0;
  private mode: DominantHandMode = 'auto';

  setMode(mode: DominantHandMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.handedness = mode === 'auto' ? this.handedness : mode;
    this.switchFrames = 0;
  }

  get primaryHandedness(): Handedness | null {
    return this.handedness;
  }

  reset(): void {
    this.handedness = null;
    this.switchFrames = 0;
  }

  update(hands: readonly TrackedHand[]): PrimaryHandSelection {
    if (hands.length === 0) {
      this.handedness = null;
      this.switchFrames = 0;
      return { primary: null, secondary: null, switched: false };
    }

    if (this.mode !== 'auto') {
      const preferred = hands.find((hand) => hand.handedness === this.mode);
      const switched = (preferred?.handedness ?? null) !== this.handedness;
      this.handedness = preferred?.handedness ?? null;
      return {
        primary: preferred ?? null,
        secondary: hands.find((hand) => hand !== preferred) ?? null,
        switched,
      };
    }

    if (hands.length === 1) {
      const switched = this.handedness !== null && this.handedness !== hands[0].handedness;
      this.handedness = hands[0].handedness;
      this.switchFrames = 0;
      return { primary: hands[0], secondary: null, switched };
    }

    const current = hands.find((hand) => hand.handedness === this.handedness);
    const other = hands.find((hand) => hand.handedness !== this.handedness);

    if (current && other && current.score > 0.4) {
      if (other.score > current.score + HAND_SWITCH_MARGIN) {
        this.switchFrames += 1;
        if (this.switchFrames >= HAND_SWITCH_FRAMES) {
          this.handedness = other.handedness;
          this.switchFrames = 0;
          return { primary: other, secondary: current, switched: true };
        }
      } else {
        this.switchFrames = 0;
      }
      return { primary: current, secondary: other, switched: false };
    }

    const best = hands.reduce((a, b) => (a.score >= b.score ? a : b));
    const switched = best.handedness !== this.handedness;
    this.handedness = best.handedness;
    this.switchFrames = 0;
    return {
      primary: best,
      secondary: hands.find((hand) => hand !== best) ?? null,
      switched,
    };
  }
}
