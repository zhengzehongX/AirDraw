/**
 * Shared synthetic-hand driver.
 *
 * Installs `window.__gesture` inside the page: it pushes 21-point hand poses aimed at
 * real UI rects, so a test can operate AirDraw exactly the way a person does.
 * Exported as a closure-free function so both the suite and one-off probes can
 * hand it to `page.evaluate`.
 */

/**
 * A real user's front door, shared by every suite: welcome → hub → the function they
 * chose. The welcome runs on its own timers, so this waits for the screens that
 * actually appear instead of holding a wall clock, and it works for both a first run
 * (which lands in the tutorial) and a trained user (who lands in the canvas).
 */
export async function enterApp(page, { target = 'SPATIAL_DRAW', timeout = 25000 } = {}) {
  await page.locator('[data-testid="launch-begin"]').click();
  await page.waitForFunction(() => !!document.querySelector('[data-testid="feature-hub"]'), null, { timeout });
  await page.locator(`[data-testid="hub-${target}"]`).click();
  await page.waitForFunction(
    () => {
      const state = window.__airdrawApp?.();
      return !!state && (state.context === 'studio' || state.context === 'tutorial' || state.context === 'playlab');
    },
    null,
    { timeout },
  );
}
export function installGestureDriver() {
  window.__airdrawTestDrive = true;
  const eng = window.__airdraw;
  const mgr = () => window.__airdrawInteraction;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const mkHand = (nx, ny, mode) => {
    // Realistic open-hand geometry in normalized video space (palm ≈ 100 px).
    const L = [];
    for (let i = 0; i < 21; i += 1) L.push({ x: nx, y: ny, z: 0 });
    L[0] = { x: nx + 0.02, y: ny + 0.36, z: 0 };
    L[5] = { x: nx - 0.08, y: ny + 0.13, z: 0 };
    L[6] = { x: nx - 0.1, y: ny + 0.02, z: 0 };
    L[7] = { x: nx - 0.11, y: ny - 0.06, z: 0 };
    L[8] = { x: nx - 0.12, y: ny - 0.15, z: 0 };
    L[9] = { x: nx - 0.02, y: ny + 0.12, z: 0 };
    L[13] = { x: nx + 0.06, y: ny + 0.14, z: 0 };
    L[17] = { x: nx + 0.13, y: ny + 0.2, z: 0 };
    L[2] = { x: nx - 0.13, y: ny + 0.26, z: 0 };
    L[3] = { x: nx - 0.2, y: ny + 0.12, z: 0 };
    L[4] = { x: nx - 0.26, y: ny - 0.02, z: 0 };
    const curl = (mcp, pip, dip, tip) => {
      L[pip] = { x: L[mcp].x, y: L[mcp].y + 0.1, z: 0 };
      L[dip] = { x: L[mcp].x + 0.02, y: L[mcp].y + 0.12, z: 0 };
      L[tip] = { x: L[mcp].x + 0.04, y: L[mcp].y + 0.04, z: 0 };
    };
    if (mode === 'near') {
      // Measured against the shipped default profile: an offset of .044 normalises
      // to d3 ≈ 0.20, which *is* a real pinch now, so "almost touching" has to sit
      // further out: .16 projects well beyond the adaptive entry gate.
      L[4]={x:L[8].x+.16,y:L[8].y,z:0};
    } else if (mode === 'pinch') {
      L[4] = { x: L[8].x + 0.025, y: L[8].y + 0.02, z: 0 };
      L[3] = { x: nx - 0.18, y: ny - 0.08, z: 0 };
    } else if (mode === 'open') {
      L[10] = { x: nx - 0.02, y: ny - 0.02, z: 0 };
      L[11] = { x: nx - 0.02, y: ny - 0.1, z: 0 };
      L[12] = { x: nx - 0.02, y: ny - 0.19, z: 0 };
      L[14] = { x: nx + 0.06, y: ny + 0.02, z: 0 };
      L[15] = { x: nx + 0.07, y: ny - 0.06, z: 0 };
      L[16] = { x: nx + 0.07, y: ny - 0.15, z: 0 };
      L[18] = { x: nx + 0.14, y: ny + 0.08, z: 0 };
      L[19] = { x: nx + 0.15, y: ny + 0.01, z: 0 };
      L[20] = { x: nx + 0.16, y: ny - 0.06, z: 0 };
    } else if (mode === 'point') {
      curl(9, 10, 11, 12);
      curl(13, 14, 15, 16);
      curl(17, 18, 19, 20);
    } else if (mode === 'fist') {
      curl(5, 6, 7, 8);
      curl(9, 10, 11, 12);
      curl(13, 14, 15, 16);
      curl(17, 18, 19, 20);
      // Thumb rests ON TOP of the folded fingers, clear of the curled index tip
      // (otherwise the ratio sits inside the hysteresis band and never releases).
      // Thumb rests on top of the folded fingers, well clear of the curled
      // index tip (ratio ≈ 0.97 > release threshold).
      L[3] = { x: nx - 0.02, y: ny + 0.33, z: 0 };
      L[4] = { x: nx + 0.05, y: ny + 0.35, z: 0 };
    } else if (mode === 'victory') {
      curl(13, 14, 15, 16);
      curl(17, 18, 19, 20);
      L[10] = { x: nx - 0.02, y: ny - 0.02, z: 0 };
      L[11] = { x: nx - 0.02, y: ny - 0.1, z: 0 };
      L[12] = { x: nx - 0.02, y: ny - 0.19, z: 0 };
    }
    return {
      landmarks: L,
      worldLandmarks: L.map((p) => ({ x: (p.x - nx) * 0.09, y: (p.y - ny) * 0.09, z: 0 })),
      handedness: 'Right',
      score: 0.99,
    };
  };

  const push = (u, v, mode, twoHands = false) => {
    // Aim the *index tip* (offset -0.12,-0.15 in the pose) at plane (u, v).
    const nx = 1 - u + 0.12;
    const ny = v + 0.15;
    const hands = [mkHand(nx, ny, mode)];
    if (twoHands) {
      const second = mkHand(1 - 0.85 + 0.12, 0.3 + 0.15, 'open');
      second.handedness = 'Left';
      second.score = 0.9;
      hands.push(second);
    }
    eng.handleResult({
      hands,
      timestamp: performance.now(),
      inferenceMs: 0.4,
      videoWidth: 1280,
      videoHeight: 720,
      source: 'synthetic',
    });
  };

  const centerOf = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const planeFromScreen = (sx, sy) => {
    const p00 = eng.toScreenPoint({ x: 0, y: 0, z: 0 });
    const p10 = eng.toScreenPoint({ x: 1, y: 0, z: 0 });
    const p01 = eng.toScreenPoint({ x: 0, y: 1, z: 0 });
    return { u: (sx - p00.x) / (p10.x - p00.x), v: (sy - p00.y) / (p01.y - p00.y) };
  };
  const idOf = (selector) => (selector.match(/"([^"]+)"/) || [])[1] || selector;

  window.__gesture = {
    push,
    makeHand:mkHand,
    async settle(u, v, mode = 'point', timeoutMs = 2500) {
      const t0 = performance.now();
      for (;;) {
        push(u, v, mode);
        await sleep(33);
        const p = eng.cursorPlanePoint();
        if (p && Math.hypot(p.x - u, p.y - v) < 0.012) return true;
        if (performance.now() - t0 > timeoutMs) return false;
      }
    },
    async awaitHover(id, u, v, timeoutMs = 2500) {
      const t0 = performance.now();
      for (;;) {
        push(u, v, 'point');
        await sleep(33);
        if (mgr().snapshot.hoverId === id) return true;
        if (performance.now() - t0 > timeoutMs) return false;
      }
    },
    /** converge → dwell → pinch until pressed → hold → release */
    async click(selector, opts = {}) {
      const c = centerOf(selector);
      if (!c) return 'no-element';
      const { u, v } = planeFromScreen(c.x, c.y);
      const mode = opts.mode ?? 'point';
      const id = idOf(selector);
      const before = mgr().activationCount;
      let pressed = false;
      // Under software WebGL the page can starve the driver's own timer for longer than the
      // engine's staleness guard, which drops the hand mid-click — and a dropped hand cancels the
      // press. Success is therefore the activation, not the press; a person just pinches again.
      // The count is what matters, because tapping the same control twice leaves its id behind.
      const activated = () => mgr().activationCount > before;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        // 350 ms after an activation the manager deliberately ignores a new press —
        // that debounce is the product protecting a person from a double-tap, so the
        // harness must wait it out instead of racing it and reporting 'no-activate'.
        for (let i = 0; i < 24 && (mgr().snapshot.state === 'cooling' || mgr().snapshot.pressId); i += 1) {
          push(u, v, mode);
          await sleep(33);
        }
        await this.settle(u, v, mode);
        await this.awaitHover(id, u, v);
        for (let i = 0; i < 5; i += 1) {
          push(u, v, mode, opts.twoHands);
          await sleep(33);
        }
        pressed = false;
        for (let i = 0; i < 16; i += 1) {
          push(u, v, 'pinch', opts.twoHands);
          await sleep(33);
          if (mgr().snapshot.pressId) { pressed = true; break; }
        }
        for (let i = 0; i < 4; i += 1) {
          push(u, v, 'pinch', opts.twoHands);
          await sleep(33);
        }
        for (let i = 0; i < 10; i += 1) {
          push(u, v, mode, opts.twoHands);
          await sleep(33);
        }
        if (activated()) break;
      }
      return activated() ? 'ok' : pressed ? 'no-activate' : 'no-press';
    },
    async holdPinch(selector, ms) {
      const c = centerOf(selector);
      if (!c) return 'no-element';
      const { u, v } = planeFromScreen(c.x, c.y);
      await this.settle(u, v, 'point');
      await this.awaitHover(idOf(selector), u, v);
      let pressed = false;
      for (let i = 0; i < 24; i += 1) {
        push(u, v, 'pinch');
        await sleep(33);
        if (mgr().snapshot.pressId === idOf(selector)) { pressed = true; break; }
      }
      if (!pressed) return 'no-press:' + idOf(selector);
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        push(u, v, 'pinch');
        await sleep(33);
        // A completed hold-to-confirm unmounts its target; keeping the pinch
        // going after that would press whatever lies behind it.
        if (mgr().snapshot.pressId !== idOf(selector)) break;
      }
      for (let i = 0; i < 10; i += 1) {
        push(u, v, 'point');
        await sleep(33);
      }
      return 'ok';
    },
    async gesturePose(mode, ms, twoHands = false) {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        push(0.5, 0.5, mode, twoHands);
        await sleep(33);
      }
    },
    /**
     * Hold a pose until the engine actually confirms the gesture, then keep it a
     * little longer. Gesture confirmation is counted in *frames*, so at 2–5 fps a
     * fixed wall-clock hold can end before the 3-frame confirm lands.
     */
    async poseUntil(mode, expect, holdMs = 400, twoHands = false, maxMs = 8000) {
      const t0 = performance.now();
      while (performance.now() - t0 < maxMs) {
        push(0.5, 0.5, mode, twoHands);
        await sleep(33);
        if (eng.debugInternals.gesture === expect) {
          const settled = performance.now();
          while (performance.now() - settled < holdMs) {
            push(0.5, 0.5, mode, twoHands);
            await sleep(33);
          }
          return 'confirmed';
        }
      }
      return `timeout(${eng.debugInternals.gesture})`;
    },
    async drawSweep(ms, twoHands = false) {
      const t0 = performance.now();
      let i = 0;
      while (performance.now() - t0 < ms) {
        i += 1;
        const u = 0.3 + 0.4 * ((i % 60) / 60);
        const v = 0.45 + 0.12 * Math.sin(i / 5);
        push(u, v, 'pinch', twoHands);
        await sleep(33);
      }
    },
    async release() {
      for (let i = 0; i < 12; i += 1) {
        push(0.5, 0.5, 'point');
        await sleep(33);
      }
    },
    async empty(ms) {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        eng.handleResult({
          hands: [],
          timestamp: performance.now(),
          inferenceMs: 0,
          videoWidth: 1280,
          videoHeight: 720,
          source: 'synthetic',
        });
        await sleep(33);
      }
    },
    async sweepWithPinch(firstSel, lastSel) {
      const a = centerOf(firstSel);
      const b = centerOf(lastSel);
      if (!a || !b) return 'no-element';
      const pa = planeFromScreen(a.x, a.y);
      const pb = planeFromScreen(b.x, b.y);
      await this.settle(pa.u, pa.v, 'point');
      for (let i = 0; i <= 12; i += 1) {
        push(pa.u + (pb.u - pa.u) * (i / 12), pa.v + (pb.v - pa.v) * (i / 12), 'pinch');
        await sleep(28);
      }
      for (let i = 0; i < 8; i += 1) {
        push(pb.u, pb.v, 'point');
        await sleep(33);
      }
      return 'ok';
    },
    async sweepCursor() {
      const pa = planeFromScreen(innerWidth * 0.34, innerHeight * 0.5);
      const pb = planeFromScreen(innerWidth * 0.66, innerHeight * 0.5);
      await this.settle(pa.u, pa.v, 'point');
      for (let i = 0; i <= 14; i += 1) {
        push(pa.u + (pb.u - pa.u) * (i / 14), pa.v + (pb.v - pa.v) * (i / 14), 'point');
        await sleep(30);
      }
      return 'ok';
    },
    async dragTo(selector, fraction) {
      const el = document.querySelector(selector);
      if (!el) return 'no-element';
      const rect = el.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      const from = planeFromScreen(rect.left + rect.width * 0.15, y);
      const to = planeFromScreen(rect.left + rect.width * fraction, y);
      await this.settle(from.u, from.v, 'point');
      for (let i = 0; i < 20; i += 1) {
        push(from.u, from.v, 'point');
        await sleep(33);
        if (mgr().snapshot.hoverId) break;
      }
      // Grab before moving: a pinch that lands during the region's cooldown drags nothing,
      // and the caller would only retry blindly.
      for (let i = 0; i < 12; i += 1) {
        push(from.u, from.v, 'pinch');
        await sleep(33);
        if (mgr().snapshot.pressId) break;
      }
      await sleep(140);
      for (let i = 1; i <= 10; i += 1) {
        push(from.u + (to.u - from.u) * (i / 10), from.v + (to.v - from.v) * (i / 10), 'pinch');
        await sleep(40);
      }
      for (let i = 0; i < 6; i += 1) {
        push(to.u, to.v, 'point');
        await sleep(33);
      }
      return 'ok';
    },
    /** Pinch-drag vertically inside a surface: how sheets are scrolled by hand. */
    async dragVertical(selector, dyPx, grabInsetPx = 0) {
      const el = document.querySelector(selector);
      if (!el) return 'no-element';
      const rect = el.getBoundingClientRect();
      const x = grabInsetPx ? rect.left + grabInsetPx : rect.left + rect.width / 2;
      const from = planeFromScreen(x, rect.top + rect.height * 0.68);
      const to = planeFromScreen(x, rect.top + rect.height * 0.68 + dyPx);
      await this.settle(from.u, from.v, 'point');
      for (let i = 0; i < 20; i += 1) {
        push(from.u, from.v, 'point');
        await sleep(33);
        if (mgr().snapshot.hoverId) break;
      }
      // Grab before moving: a pinch that lands during the region's cooldown drags nothing,
      // and the caller would only retry blindly.
      for (let i = 0; i < 12; i += 1) {
        push(from.u, from.v, 'pinch');
        await sleep(33);
        if (mgr().snapshot.pressId) break;
      }
      await sleep(140);
      const steps = 16;
      for (let i = 1; i <= steps; i += 1) {
        push(from.u + (to.u - from.u) * (i / steps), from.v + (to.v - from.v) * (i / steps), 'pinch');
        await sleep(33);
      }
      for (let i = 0; i < 6; i += 1) {
        push(to.u, to.v, 'point');
        await sleep(33);
      }
      return 'ok';
    },
    stageOf() {
      return Number(document.querySelector('[data-testid="tutorial-coach"]')?.getAttribute('data-step') ?? -1);
    },
    async orbitDrag() {
      for (let i = 0; i < 6; i += 1) {
        push(0.5, 0.5, 'point');
        await sleep(33);
      }
      for (let i = 0; i < 24; i += 1) {
        push(0.5 - i * 0.008, 0.5, 'pinch');
        await sleep(30);
      }
      for (let i = 0; i < 8; i += 1) {
        push(0.31, 0.5, 'point');
        await sleep(33);
      }
    },
  };
}

