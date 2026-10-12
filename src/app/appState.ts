/**
 * The single application state machine.
 *
 * Phase 3 drove the product with a dozen independent booleans, which meant a
 * gesture could act on a screen the user could not see (an invisible dock could
 * arm Clear, a pinch inside a panel could draw behind it). Phase 4 replaces that
 * with one `context` — the screen that currently owns gesture input — plus the
 * sub-state of that context, and derives everything else: which region scope is
 * live, whether the pen may touch the canvas, which chrome is visible.
 *
 * Pure on purpose: the routing rules are asserted in `scripts/selfcheck.ts`
 * without a DOM, so a new screen cannot quietly re-open a drawing path.
 */

export type Context = 'launch' | 'hub' | 'tutorial' | 'studio' | 'playlab' | 'help' | 'gallery' | 'settings';

/**
 * The welcome sequence, in the order a person experiences it. Every transition is
 * one-way and consumes the input that triggered it, so a double click cannot start
 * a second explosion or a second navigation.
 *
 *   FLOATING    drifting field, the entry is live
 *   GATHERING   points fly into the word
 *   HELLO       the word is readable and holds for a beat
 *   DISPERSING  the word bursts and the next screen rises behind it
 *   HOME_READY  the welcome layer is done and no longer takes input
 */
export type LaunchStage = 'floating' | 'gathering' | 'hello' | 'dispersing' | 'home-ready';
/** Stages where the welcome layer must swallow every pointer and gesture. */
export const WELCOME_TRANSITIONAL: ReadonlySet<LaunchStage> = new Set<LaunchStage>(['gathering', 'hello', 'dispersing']);
export const isWelcomeBusy = (stage: LaunchStage): boolean => WELCOME_TRANSITIONAL.has(stage);
/** The only legal next stage for each stage; `home-ready` is terminal. */
const LAUNCH_NEXT: Record<LaunchStage, LaunchStage | null> = {
  floating: 'gathering',
  gathering: 'hello',
  hello: 'dispersing',
  dispersing: 'home-ready',
  'home-ready': null,
};
/** Step the welcome machine, refusing anything but the one legal forward move. */
export function advanceLaunchStage(stage: LaunchStage, to: LaunchStage): LaunchStage {
  return LAUNCH_NEXT[stage] === to ? to : stage;
}
/** True when a click on the entry should be consumed by the welcome layer. */
export const welcomeAcceptsEntry = (stage: LaunchStage): boolean => stage === 'floating' || stage === 'hello';
export type Popover = 'none' | 'color' | 'material' | 'size' | 'brush' | 'more';
export type AppState = {
  context: Context;
  /** Where an overlay closes back to. Always a primary context. */
  returnTo: Extract<Context, 'studio' | 'tutorial' | 'playlab'>;
  launchStage: LaunchStage;
  /** Index into the tutorial step list; `TUTORIAL_STEPS.length` means finished. */
  tutorialStep: number;
  dockOpen: boolean;
  popover: Popover;
  confirmClear: boolean;
  inspect: boolean;
  eraseMode: boolean;
  helpSection: number;
  /** Gesture Practice tab inside the guide. */
  practiceGesture: string | null;
  galleryFocus: number;
};

export type AppAction =
  | { type: 'begin' }
  | { type: 'enter-creation' }
  | { type: 'go-hub' }
  | { type: 'launch-stage'; stage: LaunchStage }
  | { type: 'enter-tutorial'; step?: number }
  | { type: 'tutorial-step'; step: number }
  | { type: 'tutorial-finished' }
  | { type: 'go-studio' }
  | { type: 'go-playlab' }
  | { type: 'go-launch' }
  | { type: 'open-context'; context: 'help' | 'gallery' | 'settings' }
  | { type: 'close-overlay' }
  | { type: 'dock'; open: boolean }
  | { type: 'popover'; popover: Popover }
  | { type: 'clear-confirm'; open: boolean }
  | { type: 'inspect'; on: boolean }
  | { type: 'erase'; on: boolean }
  | { type: 'help-section'; index: number }
  | { type: 'practice'; gesture: string | null }
  | { type: 'gallery-focus'; index: number };

/**
 * Only the tutorial's drawing lessons let ink reach the canvas, which is what
 * makes the coach safe to run on top of the real scene. The lesson list itself
 * lives in `../tutorial/steps`.
 */
export const TUTORIAL_STEP_COUNT = 11;
export const TUTORIAL_DRAWING_STEPS: ReadonlySet<number> = new Set([3, 4]);

export function initialState(overrides: Partial<AppState> = {}): AppState {
  return {
    context: 'launch',
    returnTo: 'studio',
    launchStage: 'floating',
    tutorialStep: 0,
    dockOpen: false,
    popover: 'none',
    confirmClear: false,
    inspect: false,
    eraseMode: false,
    helpSection: 0,
    practiceGesture: null,
    galleryFocus: 0,
    ...overrides,
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'begin':
      // The welcome ends at the hub, which needs no camera and no microphone. A
      // burst that is already in flight keeps playing over the hub it reveals.
      return {
        ...state,
        context: 'hub',
        launchStage: state.launchStage === 'dispersing' ? 'dispersing' : 'home-ready',
        dockOpen: false,
        popover: 'none',
      };

    case 'enter-creation':
      // Only now is a device needed: first run learns the gestures, a trained user
      // goes straight to the canvas.
      return { ...state, context: state.tutorialStep >= TUTORIAL_STEP_COUNT ? 'studio' : 'tutorial' };

    case 'go-hub':
      return { ...state, context: 'hub', dockOpen: false, popover: 'none', confirmClear: false };

    case 'launch-stage':
      // One-way and guarded: a stray or repeated input can only ever move the
      // welcome sequence forward by exactly one step.
      return { ...state, launchStage: advanceLaunchStage(state.launchStage, action.stage) };

    case 'enter-tutorial':
      return { ...state, context: 'tutorial', tutorialStep: action.step ?? 0, dockOpen: false, popover: 'none' };

    case 'tutorial-step':
      return { ...state, tutorialStep: Math.max(0, action.step) };

    case 'tutorial-finished':
      return {
        ...state,
        tutorialStep: TUTORIAL_STEP_COUNT,
        context: 'studio',
        dockOpen: false,
        popover: 'none',
      };

    case 'go-studio':
      return { ...state, context: 'studio', dockOpen: false, popover: 'none' };

    case 'go-playlab':
      // Retired legacy action cannot enter an unmounted input context.
      return state;

    case 'go-launch':
      return { ...state, context: 'launch', launchStage: 'floating', dockOpen: false, popover: 'none' };

    case 'open-context':
      if (state.context === action.context) return state;
      return {
        ...state,
        context: action.context,
        returnTo: isOverlay(state.context) ? state.returnTo : (state.context as AppState['returnTo']),
        dockOpen: false,
        popover: 'none',
        confirmClear: false,
        practiceGesture: null,
      };

    case 'close-overlay':
      return isOverlay(state.context)
        ? { ...state, context: state.returnTo, practiceGesture: null }
        : state;

    case 'dock':
      // The dock belongs to the canvas and to the lessons that use it, and to
      // nothing else: a Help page cannot summon controls behind itself.
      if (!state.dockOpen && action.open && state.context !== 'studio' && state.context !== 'tutorial')
        return state;
      return {
        ...state,
        dockOpen: action.open,
        popover: action.open ? state.popover : 'none',
        confirmClear: action.open ? state.confirmClear : false,
      };

    case 'popover':
      return { ...state, popover: action.popover, confirmClear: false };

    case 'clear-confirm':
      return { ...state, confirmClear: action.open, popover: action.open ? 'none' : state.popover };

    case 'inspect':
      return { ...state, inspect: action.on, dockOpen: action.on ? false : state.dockOpen };

    case 'erase':
      return { ...state, eraseMode: action.on };

    case 'help-section':
      return { ...state, helpSection: Math.max(0, action.index), practiceGesture: null };

    case 'practice':
      return { ...state, practiceGesture: action.gesture };

    case 'gallery-focus':
      return { ...state, galleryFocus: Math.max(0, action.index) };

    default:
      return state;
  }
}

const OVERLAYS: ReadonlySet<Context> = new Set<Context>(['help', 'gallery', 'settings']);
export const isOverlay = (context: Context): boolean => OVERLAYS.has(context);

/** Which gesture regions may receive input right now. */
export function activeScope(state: AppState): Context {
  return state.context;
}

/**
 * The pen may only touch the canvas from the studio (or the two drawing
 * tutorial steps), and never while an overlay or the clear confirmation owns
 * gesture input. An open dock does *not* block the pen: hovering an actual dock
 * target already suppresses drawing, which is the finer-grained rule.
 */
export function canDraw(state: AppState): boolean {
  if (state.confirmClear) return false;
  if (isOverlay(state.context)) return false;
  if (state.context === 'tutorial') return TUTORIAL_DRAWING_STEPS.has(state.tutorialStep);
  if (state.context !== 'studio') return false;
  return !state.inspect;
}

/** Global chrome (status, theme, camera dot) hides for the launch and permission screens. */
export function showsChrome(state: AppState): boolean {
  return state.context !== 'launch';
}

/** The 3D scene is only ever mounted where ink can exist or be seen. */
export function showsScene(state: AppState): boolean {
  return state.context === 'studio' || state.context === 'tutorial' || state.context === 'gallery';
}

/**
 * The particle field belongs to the welcome, not to a screen: it keeps bursting
 * over the hub until the sequence is finished, so the hand-off never cuts.
 */
export const showsWelcomeField = (state: AppState): boolean =>
  state.context === 'launch' || (state.context === 'hub' && state.launchStage !== 'home-ready');
