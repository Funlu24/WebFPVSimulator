/*
 * longflight-check.js: a session past twenty minutes in the air keeps flying.
 *
 * WHY THIS EXISTS. On 2026-10-05 three tickets in ten minutes, bug-03ae2f2a,
 * bug-551a5c32 and bug-7f783182, carried one fault: "ReferenceError: settings
 * is not defined" in frameBody. The support prompts added that morning count
 * a session's time in the air, and past twenty minutes the frame read a bare
 * `settings`, which is not a name in the shell. So every frame in the air
 * after twenty minutes of a session threw, the shell stopped and said press
 * R, and R put the craft back in the air and into the same line. No check
 * flew long enough to reach it: every flight here is seconds long.
 *
 * So this sets the session clock half a second short of the line
 * (window.__sessionFlight), flies across it, and asks:
 *
 *   - no frame faulted (window.__frameFault);
 *   - the shell kept drawing frames past the line, because a frame that
 *     throws never reaches the count at the end of frameBody;
 *   - the clock crossed the line, so the frames did run the code;
 *   - and the prompt's trigger fired, once.
 *
 * Not deterministic to the bit, because the sticks are written on the frame
 * clock of a headless browser, so every assertion is an inequality.
 *
 * Usage: node scripts/longflight-check.js. Exit code is the number of failures.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* How far short of the line the clock is set, and how long to fly after. */
const SHORT_MS = 500;
const FLY_S = 2.5;

/* In the page: take off, set the clock short of the line, fly across it.
 * The frames are counted from the first one that sees the clock past the
 * line, because the frames before it were never in question. */
const FLY = `
  let atLine = null;
  const air = (s, line) => new Promise((done) => {
    const t0 = performance.now();
    function f() {
      const t = (performance.now() - t0) / 1000;
      window.__stick(0, 0, 0, t < 0.8 ? 0.65 : 0.5);
      if (line != null && atLine == null && window.__sessionFlight().ms >= line) {
        atLine = window.__boot().frames;
      }
      if (t < s && !window.__frameFault) {
        requestAnimationFrame(f);
      } else {
        done();
      }
    }
    requestAnimationFrame(f);
  });
  window.__stick(0, 0, 0, 0);
  await new Promise((r) => setTimeout(r, 1000));
  await air(1.5, null);
  const up = window.__ground();
  const clock = window.__sessionFlight();
  window.__sessionFlight(clock.thresholdMs - ${SHORT_MS});
  await air(${FLY_S}, clock.thresholdMs);
  const after = window.__boot().frames;
  const end = window.__sessionFlight();
  window.__stick(0, 0, 0, 0);
  const fault = window.__frameFault || null;
  return {
    airborne: !up.landed, above: up.above, thresholdMs: clock.thresholdMs,
    framesPast: atLine == null ? 0 : after - atLine, clockMs: end.ms, shown: end.shown,
    fault: fault ? fault.message : null, stack: fault ? fault.stack.split('\\n').slice(0, 3).join(' | ') : '',
  };`;

async function main() {
  let fails = 0;
  const check = (ok, what, got) => {
    fails += ok ? 0 : 1;
    console.log(`     ${ok ? 'pass' : 'FAIL'}  ${what}${got ? `: ${got}` : ''}`);
  };
  const page = await openPage({ root: ROOT, width: 400, height: 260, url: '/index.html' });
  const { cdp, sessionId } = page;
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
      await sleep(500);
    }
    await ev(`const ui = window.__ui; ui.settings.map = 'field'; ui.settings.airframe = '5inch';
      ui.settings.graphics = 'low'; ui.onAction('fly', ui.settings); return 1;`);
    let ready = false;
    for (let i = 0; i < 260 && !ready; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null');
      ready = Boolean(m && m.ready);
      if (!ready) {
        await sleep(500);
      }
    }
    if (!ready) {
      throw new Error('the field never became ready');
    }
    await sleep(2000);
    if (!(await ev('return typeof window.__sessionFlight === "function"'))) {
      throw new Error('the shell has no window.__sessionFlight, so the clock cannot be set');
    }
    const r = await ev(FLY);
    const min = (r.thresholdMs / 60000).toFixed(0);
    console.log(`  five inch on the field, clock set ${SHORT_MS} ms short of ${min} minutes, then ${FLY_S} s in the air`);
    check(r.airborne, 'the craft was in the air when the clock was set', `${r.above.toFixed(2)} m up`);
    check(r.fault === null, 'no frame faulted', r.fault ? `${r.fault} (${r.stack})` : '');
    check(r.framesPast > 30, 'the shell kept drawing frames past the line', `${r.framesPast} frames`);
    check(r.clockMs >= r.thresholdMs, `the session clock crossed ${min} minutes`, `${(r.clockMs / 1000).toFixed(1)} s`);
    check(r.shown === true, 'the time prompt\'s trigger fired', String(r.shown));
  } catch (e) {
    fails += 1;
    console.log(`  FAIL  the run did not complete: ${e.message}`);
  } finally {
    await page.close?.();
  }
  console.log(`\nlongflight-check: ${fails === 0 ? 'all pass' : `${fails} failed`}`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
