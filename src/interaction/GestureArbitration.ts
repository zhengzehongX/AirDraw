/**
 * One owner per instant.
 *
 * PlayLab puts several continuous interactions next to each other: the pen, a
 * model grab, a two-hand stretch, a toy's local gesture, a page swipe and a UI
 * hover. Each of them is reasonable alone and ruinous together — the classic
 * failure is a page turning while the user is mid-stroke, or a swipe firing
 * because the hand happened to travel sideways on its way to a button.
 *
 * So instead of every surface asking "am I allowed?" with its own local rule,
 * they declare what they are doing and ask one place. Priority is fixed:
 *
 *   safety (hand lost) > established grab / draw > pinch confirm >
 *   two-hand continuous > toy-local > palm swipe > point hover
 *
 * Higher priority never *interrupts* a lower one mid-flight; it only blocks it
 * from starting, which is what keeps a committed action from being yanked away.
 */
export type InteractionOwner =
  | 'safety'
  | 'grab'
  | 'draw'
  | 'pinch'
  | 'bimanual'
  | 'toy'
  | 'swipe'
  | 'hover';

const RANK: Record<InteractionOwner, number> = {
  safety: 0,
  grab: 1,
  draw: 1,
  pinch: 2,
  bimanual: 3,
  toy: 4,
  swipe: 5,
  hover: 6,
};

export type ArbitrationSnapshot = {
  active: InteractionOwner[];
  /** Lowest rank currently held; `null` when nothing owns input. */
  holder: InteractionOwner | null;
};

class GestureArbitration {
  private owners = new Map<InteractionOwner, number>();
  private listeners = new Set<() => void>();

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  get snapshot(): ArbitrationSnapshot {
    const active = [...this.owners.keys()];
    if (!active.length) return { active, holder: null };
    return { active, holder: active.reduce((best, owner) => (RANK[owner] < RANK[best] ? owner : best)) };
  }

  get active(): InteractionOwner[] {
    return [...this.owners.keys()];
  }

  /** Declare that an interaction is happening. Idempotent; records when it began. */
  begin(owner: InteractionOwner, at = performance.now()): void {
    if (this.owners.has(owner)) return;
    this.owners.set(owner, at);
    this.listeners.forEach((cb) => cb());
  }

  end(owner: InteractionOwner): void {
    if (!this.owners.delete(owner)) return;
    this.listeners.forEach((cb) => cb());
  }

  /** Who is in the way, if anyone. Equal rank counts as in the way: first come, first served. */
  blockedBy(candidate: InteractionOwner): InteractionOwner | null {
    const rank = RANK[candidate];
    let worst: InteractionOwner | null = null;
    for (const owner of this.owners.keys()) {
      if (owner === candidate) continue;
      if (RANK[owner] > rank) continue;
      if (!worst || RANK[owner] < RANK[worst] || (RANK[owner] === RANK[worst] && this.owners.get(owner)! < this.owners.get(worst)!)) worst = owner;
    }
    return worst;
  }

  mayStart(candidate: InteractionOwner): boolean {
    return this.blockedBy(candidate) === null;
  }

  /** Convenience for the page-turn question every hub asks. */
  get swipeAllowed(): boolean {
    return this.mayStart('swipe');
  }

  /** A hand leaving the frame outranks everything and clears the rest. */
  holdForSafety(): void {
    this.owners.clear();
    this.begin('safety');
  }

  clear(): void {
    if (!this.owners.size) return;
    this.owners.clear();
    this.listeners.forEach((cb) => cb());
  }
}

export const arbitration = new GestureArbitration();
