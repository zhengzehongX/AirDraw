/**
 * PlayLab core checks (run with: npm run verify:playlab).
 * Pure logic, no DOM: the palm-swipe state machine, gesture arbitration and the
 * hand-frame measurements every toy reads. The swipe cases are the important
 * ones — each one is a way a real hand could otherwise turn a page by accident.
 */
import { PALM_SWIPE } from '../src/config';
import { PalmSwipeDetector, type SwipeDirection } from '../src/utils/gesture/PalmSwipeDetector';
import { arbitration } from '../src/interaction/GestureArbitration';
import { HandMotion, opennessOf, palmCentreOf, palmOrientation, wristRollOf, type HandFrame } from '../src/hands/handFrame';
import { QualityManager, QUALITY_PROFILES } from '../src/playlab/quality';
import type { Point } from '../src/types/drawing';
import { mkdirSync, writeFileSync } from 'node:fs';

const results: { name: string; pass: boolean; detail?: string }[] = [];
const check = (name: string, pass: boolean, detail?: string) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
};

const frame = (x: number, y: number, over: Partial<HandFrame> = {}): HandFrame => ({
  role: 'primary', handedness: 'Right', confidence: 0.99,
  landmarks: [], worldLandmarks: null,
  palmCenter: { x, y, z: 0 }, palmNormal: { x: 0, y: 0, z: 1 }, facing: 1, palmWidth: 0.12,
  palmVelocity: { x: 0, y: 0, z: 0 }, palmAcceleration: { x: 0, y: 0, z: 0 },
  openness: 1, grabStrength: 0, wristRotation: 0,
  pinchState: 'OPEN', pinchPoint: { x, y, z: 0 }, pinchStrength: 0,
  isStable: true, visibleForMs: 1200, ...over,
});

/** Drives the detector at the detection rate; returns every committed direction. */
function drive(steps: { at: number; frame: HandFrame | null }[], enabled = true): SwipeDirection[] {
  const detector = new PalmSwipeDetector();
  const commits: SwipeDirection[] = [];
  for (const step of steps) {
    const commit = detector.update(step.frame, step.at, enabled);
    if (commit) commits.push(commit);
  }
  return commits;
}

const at = (from: number, to: number, make: (t: number) => HandFrame | null) => {
  const steps: { at: number; frame: HandFrame | null }[] = [];
  for (let t = from; t <= to; t += 33) steps.push({ at: t, frame: make(t) });
  return steps;
};

/** A natural swipe: hold open, then cross 25 % of the frame in ~330 ms. */
const swipeSteps = (from: number, to: number, ms = 330, hold = 200, y = 0.5, extra: Partial<HandFrame> = {}) =>
  at(0, hold, () => frame(from, y, extra)).concat(
    at(hold, hold + ms, (t) => frame(from + (to - from) * ((t - hold) / ms), y, extra)),
  );

const required = Math.min(PALM_SWIPE.distancePalms * 0.12, PALM_SWIPE.distanceFrame);
check('swipe fixture actually crosses the threshold', Math.abs(0.32) > required, `travel 0.32 vs required ${required.toFixed(3)}`);

check('a left swipe commits once', JSON.stringify(drive(swipeSteps(0.62, 0.3))) === '["left"]');
check('a right swipe commits once', JSON.stringify(drive(swipeSteps(0.3, 0.62))) === '["right"]');
check('progress reaches the commit edge', (() => {
  const detector = new PalmSwipeDetector();
  let peak = 0;
  for (const step of swipeSteps(0.62, 0.3)) { detector.update(step.frame, step.at, true); peak = Math.max(peak, Math.abs(detector.snapshot.progress)); }
  return peak > 0.85;
})());
check('progress stays inside −1..1', (() => {
  const detector = new PalmSwipeDetector();
  for (const step of swipeSteps(0.9, 0.05)) { detector.update(step.frame, step.at, true); const p = detector.snapshot.progress; if (p < -1 || p > 1) return false; }
  return true;
})());
check('idle progress is zero', new PalmSwipeDetector().snapshot.progress === 0);

// Thirty waves must produce thirty turns — and never two turns for one wave.
// 1.4 s apart is what "thirty deliberate swipes" looks like from a real hand:
// the cooldown plus the re-arm hold is ~0.8 s, and the travel itself ~0.35 s.
{
  const detector = new PalmSwipeDetector();
  let commits = 0;
  let t = 0;
  for (let i = 0; i < 30; i += 1) {
    const from = i % 2 ? 0.3 : 0.62;
    const to = i % 2 ? 0.62 : 0.3;
    for (let ms = 0; ms <= 1400; ms += 33) {
      const hold = ms <= 200;
      const f = hold ? frame(from, 0.5) : frame(from + (to - from) * Math.min(1, (ms - 200) / 330), 0.5);
      if (detector.update(f, t + ms, true)) commits += 1;
    }
    t += 1400;
  }
  check('30 waves switch exactly 30 pages', commits === 30, `commits=${commits}`);
}

// The ways it must not fire.
check('slow drift never commits', drive(at(0, 1400, (t) => frame(0.62 - 0.32 * (t / 1400), 0.5))).length === 0);
check('a short shuffle does not commit', drive(swipeSteps(0.5, 0.42)).length === 0);
check('a mostly-vertical move does not commit', drive(at(0, 600, (t) => frame(0.62, 0.5 - 0.4 * (t / 600)))).length === 0);
check('waving back and forth does not commit', (() => {
  // Each leg is deliberately shorter than the commit distance: what must reject
  // this is the reversal rule, not a threshold the wave happens to miss.
  const legs = [0.62, 0.49, 0.62, 0.49, 0.62];
  const steps: { at: number; frame: HandFrame | null }[] = at(0, 200, () => frame(0.62, 0.5));
  legs.slice(1).forEach((to, i) => {
    const from = legs[i];
    steps.push(...at(200 + i * 200, 400 + i * 200, (t) => frame(from + (to - from) * ((t - (200 + i * 200)) / 200), 0.5)));
  });
  return drive(steps).length === 0;
})());
check('a pinch mid-reach cancels the swipe', (() => {
  const detector = new PalmSwipeDetector();
  let committed: SwipeDirection | null = null;
  for (const step of swipeSteps(0.62, 0.3, 330, 200, 0.5, {})) {
    const midway = step.at > 320;
    committed = detector.update(midway ? { ...step.frame!, pinchState: 'HOLD' } : step.frame, step.at, true) ?? committed;
  }
  return committed === null;
})());
check('losing the hand mid-swipe cancels it', (() => {
  const detector = new PalmSwipeDetector();
  let committed: SwipeDirection | null = null;
  for (const step of swipeSteps(0.62, 0.3)) {
    const f = step.at > 300 ? null : step.frame;
    committed = detector.update(f, step.at, true) ?? committed;
  }
  return committed === null;
})());
check('an unstable hand cannot swipe', drive(swipeSteps(0.62, 0.3, 330, 200, 0.5, { isStable: false })).length === 0);
check('a closed hand cannot swipe', drive(swipeSteps(0.62, 0.3, 330, 200, 0.5, { openness: 0.1 })).length === 0);
check('an edge-on hand cannot swipe', drive(swipeSteps(0.62, 0.3, 330, 200, 0.5, { facing: 0.2 })).length === 0);
check('a locked context cannot swipe', drive(swipeSteps(0.62, 0.3), false).length === 0);
check('suppression blocks the swipe', (() => {
  const detector = new PalmSwipeDetector();
  detector.suppressed = true;
  return drive0(detector) === 0;
})());
function drive0(detector: PalmSwipeDetector): number {
  let commits = 0;
  for (const step of swipeSteps(0.62, 0.3)) if (detector.update(step.frame, step.at, true)) commits += 1;
  return commits;
}
check('one wave cannot chain into a second page', (() => {
  const detector = new PalmSwipeDetector();
  let commits = 0;
  // Keep travelling the same way through the cooldown window.
  for (let t = 0; t <= 1400; t += 33) {
    const x = t <= 200 ? 0.62 : Math.max(0.05, 0.62 - 0.32 * ((t - 200) / 330));
    if (detector.update(frame(x, 0.5), t, true)) commits += 1;
  }
  return commits === 1;
})());
check('a second wave after the cooldown does commit', (() => {
  const detector = new PalmSwipeDetector();
  let commits = 0;
  for (const wave of [0, 1400]) {
    for (let t = 0; t <= 700; t += 33) {
      const x = t <= 200 ? 0.62 : 0.62 - 0.32 * Math.min(1, (t - 200) / 330);
      if (detector.update(frame(x, 0.5), wave + t, true)) commits += 1;
    }
  }
  return commits === 2;
})());
check('swipe distance is scale invariant', (() => {
  const near = drive(swipeSteps(0.62, 0.3, 330, 200, 0.5, { palmWidth: 0.18 }));
  const far = drive(swipeSteps(0.62, 0.3, 330, 200, 0.5, { palmWidth: 0.07 }));
  return near.length === 1 && far.length === 1;
})());

// ── arbitration ─────────────────────────────────────────────────────────────
arbitration.clear();
check('an open lab accepts a swipe', arbitration.swipeAllowed);
arbitration.begin('draw');
check('drawing locks the page', !arbitration.swipeAllowed);
check('an established pen keeps its hand (equal rank is first come, first served)', !arbitration.mayStart('grab'));
arbitration.end('draw');
arbitration.begin('swipe');
arbitration.begin('grab');
check('the holder is the highest priority action', arbitration.snapshot.holder === 'grab');
check('a page turn is locked while a grab runs', !arbitration.swipeAllowed);
arbitration.end('grab');
arbitration.end('swipe');
check('releasing everything unlocks the page', arbitration.swipeAllowed && arbitration.active.length === 0);
arbitration.begin('swipe');
check('a running swipe is not stolen by a hover', !arbitration.mayStart('hover'));
check('a grab may still begin over a swipe', arbitration.mayStart('grab'));
arbitration.holdForSafety();
check('hand loss clears the floor and blocks play', arbitration.snapshot.holder === 'safety' && !arbitration.mayStart('toy'));
arbitration.clear();
check('safety releases when the hand returns', arbitration.mayStart('swipe'));

// ── hand frame maths ─────────────────────────────────────────────────────────
const handPoints = (spread: number): Point[] => {
  const L: Point[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  L[0] = { x: 0.5, y: 0.85, z: 0 };
  [5, 9, 13, 17].forEach((m, i) => {
    L[m] = { x: 0.42 + i * 0.05, y: 0.65, z: 0 };
    L[m + 1] = { x: L[m].x, y: 0.62, z: 0 };
    L[m + 2] = { x: L[m].x, y: 0.6, z: 0 };
    L[m + 3] = { x: L[m].x, y: 0.65 - spread * 0.12, z: 0 };
  });
  L[1] = { x: 0.45, y: 0.78, z: 0 };
  L[2] = { x: 0.47, y: 0.74, z: 0 };
  L[3] = { x: 0.49, y: 0.72, z: 0 };
  L[4] = { x: 0.51, y: 0.7, z: 0 };
  return L;
};
const fist = opennessOf(handPoints(0.02));
const spread = opennessOf(handPoints(1));
check('a fist reads as closed', fist < 0.25, `openness=${fist.toFixed(2)}`);
check('an open hand reads as open', spread > PALM_SWIPE.minOpenness, `openness=${spread.toFixed(2)}`);
check('openness stays inside 0..1', spread <= 1 && fist >= 0);
const centre = palmCentreOf(handPoints(1));
check('palm centre sits between wrist and knuckles', centre.y > 0.65 && centre.y < 0.85 && centre.x > 0.4 && centre.x < 0.52, JSON.stringify(centre));
check('palm centre ignores a missing hand', palmCentreOf([]).x === 0);

const flat = Array.from({ length: 21 }, (_, i) => (i === 0 ? { x: 0, y: 0, z: 0 } : i === 5 ? { x: 0.04, y: 0.03, z: 0 } : i === 9 ? { x: 0, y: 0.04, z: -0.01 } : i === 17 ? { x: -0.04, y: 0.03, z: 0 } : { x: 0, y: 0.05, z: 0 }));
const edgeOn = flat.map((p) => ({ x: p.x, y: 0, z: p.y === 0 ? 0 : p.y * 0.8 }));
check('a flat palm faces the camera', palmOrientation(flat).facing > 0.6, `facing=${palmOrientation(flat).facing.toFixed(2)}`);
check('an edge-on palm is rejected', palmOrientation(edgeOn).facing < 0.3, `facing=${palmOrientation(edgeOn).facing.toFixed(2)}`);
check('no metric landmarks is not a crash', palmOrientation(null).facing === 0);
check('roll reads the wrist→knuckle angle', Math.abs(wristRollOf(handPoints(1))) > 1.2 && Math.abs(wristRollOf(handPoints(1))) < 1.9);

const motion = new HandMotion();
let last = { velocity: { x: 0, y: 0, z: 0 }, acceleration: { x: 0, y: 0, z: 0 } };
for (let t = 0; t <= 330; t += 33) last = motion.track({ x: t * 0.001, y: 0.5, z: 0 }, t);
check('velocity tracks a constant drag', Math.abs(last.velocity.x - 0.001 * 1000) < 0.35, `vx=${last.velocity.x.toFixed(2)}/s`);
motion.track({ x: 5, y: 5, z: 0 }, 363);
check('one outlier frame cannot exceed the physical speed cap', Math.hypot(motion.current.velocity.x, motion.current.velocity.y) <= PALM_SWIPE.maxSpeed * 1.05, JSON.stringify(motion.current.velocity));
motion.reset();
check('reset clears the motion history', motion.speed === 0);

// ---- the quality ladder: a budget that only ever touches the picture --------
{
  const q = new QualityManager();
  q.fromTier('high');
  check('tier high maps to the high profile', q.current === 'high' && q.profile.particles === QUALITY_PROFILES.high.particles);
  q.fromTier('low');
  check('a weak detection tier lowers the picture', q.current === 'performance');
  // Three low samples step down; one does not, and never recognition.
  q.fromTier('high');
  q.sample(30); q.sample(30); q.sample(30);
  check('three slow frames lower the level', q.current === 'balanced', q.current);
  const beforeUpgrade = q.current;
  for (let i = 0; i < 11; i += 1) q.sample(60);
  check('eleven fast frames are not enough to climb back', q.current === beforeUpgrade, `${q.current} after 11`);
  q.sample(60);
  check('twelve good frames climb one level', q.current === 'high', q.current);
  q.locked = 'ultra';
  const lockedLevel = q.current;
  q.fromTier('low');
  for (let i = 0; i < 6; i += 1) q.sample(10);
  check('a manual budget is not overridden by the governor', q.current === lockedLevel && lockedLevel === 'ultra');
  q.locked = null;
  check('releasing the budget hands control back', q.current !== 'ultra');
  const intensity = new PalmSwipeDetector();
  intensity.setIntensity(0.5);
  check('the shipped intensity leaves swipe gates untouched', intensity.intensity === 1);
}

// ---- who may start: the reason PlayLab needs a screen owner -----------------
{
  arbitration.clear();
  arbitration.begin('pinch');
  check('a UI press blocks a toy from starting', arbitration.mayStart('toy') === false);
  arbitration.end('pinch');
  arbitration.begin('toy');
  // Documented, not a bug to fix here: the toy's rank is below a press, so the toy
  // cannot keep a menu from taking the same contact. That is why the interaction
  // manager gates by screen owner instead of relying on these ranks.
  check('a toy alone cannot block a UI press', arbitration.mayStart('pinch') === true);
  arbitration.begin('safety');
  check('a lost hand outranks everything already held', arbitration.snapshot.holder === 'safety');
  arbitration.clear();
  check('clearing leaves no owner', arbitration.snapshot.holder === null && arbitration.swipeAllowed);
}

mkdirSync('docs/verification', { recursive: true });writeFileSync('docs/verification/playlab-core.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const passed = results.filter((r) => r.pass).length;
console.log(`${passed}/${results.length}`);
if (passed !== results.length) process.exitCode = 1;
