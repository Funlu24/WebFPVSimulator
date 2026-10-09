/*
 * motor-kv-check.js: the Motor power knob does what its name says, asked of
 * the compiled module in Node.
 *
 * WHY THIS SITS BESIDE THE PLANT GOLDEN. The golden pins what the plant does
 * to the last bit, which is exactly right for "did anything move" and says
 * nothing about whether what it does is RIGHT: a golden written from a wrong
 * model passes forever. This asks the questions a pilot would ask of the
 * scale itself, and a hash cannot.
 *
 *   surface      the export exists and starts at 1.0; the slider's nine stops
 *                are taken exactly as the shell computes them; anything
 *                outside 0.8 to 1.2, and anything that is not a number, is
 *                refused and leaves the value it held; reset and init do not
 *                touch it, because it is a mode.
 *   identity     a flight with the export never called, one with it called
 *                with 1.0, and one that went to 1.2 and came back, are the
 *                same flight to the last bit of the state at every step. The
 *                plant golden says the same of its 23 older scenarios; this
 *                says it of the setter's own history.
 *   direction    across 0.8 to 1.2 on the five inch at the weight the shell
 *                flies it: hover sits lower on the stick as the scale rises
 *                and by about 1 / scale (hover duty goes as 1 / kV, because
 *                the rotor needs the same speed and torque on a back EMF
 *                constant 1 / scale as large); full throttle turns the rotor
 *                faster; the pack carries more current at full throttle; a
 *                punch from a hover climbs harder.
 *   time const   the motor's own time constant, J R / ke^2, is unchanged,
 *                because R and ke^2 move together. Check 8's procedure at
 *                each scale reads the 63 percent rise within a few
 *                milliseconds of stock's.
 *   spring       the keyboard's throttle springs back to the number
 *                configs/rates.js calls hover (hoverStickPercent). At the
 *                stops that number is a measured table and between them an
 *                interpolation in 1 / kV, so this flies the quad at the
 *                number the shell would use, at every step of the slider and
 *                at a few weights, packs and caps, and asks that it holds
 *                altitude. A spring to the wrong number is a quad that falls
 *                out of the sky whenever a key comes up (bug-3a7be142).
 *
 * THE BANDS were chosen from the first measurement, with room, and are the
 * physics' claims rather than a record of what it did: the hover law is held
 * to two percent (it measured under half of one), the full speed ratios to a
 * window around the 1.10 and 0.85 it measured (never past the scale itself,
 * because the prop takes some of it back, and the pack sags further the
 * harder the motors pull), the rise time to three milliseconds either way of
 * the 26 it measured. Argue for a change in PROGRESS.md, never edit one to
 * get past a failure.
 *
 * Usage: node scripts/motor-kv-check.js
 * The exit code is the number of claims that failed.
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { airframeById } from '../configs/airframes.js';
import { hoverStickPercent } from '../configs/rates.js';
import {
  MOTOR_KV_MAX, MOTOR_KV_MIN, MOTOR_KV_STEP, kvScaleFor,
} from '../src/share/tune.js';
import { gravityScaleFor } from '../src/ui/ui.js';
import {
  SIM_ERR_BAD_ARG, SIM_OK, loadSim,
} from '../tests/lib/simmod.js';
import { must, runScript, ST } from '../tests/lib/replay.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const GRAVITY = airframeById('5inch').gravityBase;

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}
function section(title) {
  console.log(`\n${title}`);
}

/* A fresh module on the five inch at the shell's weight, the scale set BEFORE
 * init as the shell does it (it is a mode, so the order only matters if it
 * does not survive init, which the surface section asserts it does). */
async function fresh(scale = null, { gravity = GRAVITY, cell = 4.2, lines = '' } = {}) {
  const sim = await loadSim(wasm);
  if (typeof sim.e.sim_set_motor_kv !== 'function') {
    throw new Error('this dist/sim.wasm has no sim_set_motor_kv');
  }
  must(sim.e.sim_set_gravity(gravity), 'sim_set_gravity');
  if (scale !== null) {
    must(sim.e.sim_set_motor_kv(scale), 'sim_set_motor_kv');
  }
  must(sim.init(config + lines), 'sim_init');
  must(sim.reset(), 'sim_reset');
  must(sim.setCellVoltage(cell), 'sim_set_cell_voltage');
  return sim;
}

/* ---- surface ---- */
section('surface: the setter, its band and what it survives');
{
  const sim = await loadSim(wasm);
  check('the export is there and the module starts at 1.0',
    typeof sim.e.sim_set_motor_kv === 'function' && typeof sim.e.sim_motor_kv === 'function'
    && sim.e.sim_motor_kv() === 1);

  const stops = [];
  for (let p = MOTOR_KV_MIN; p <= MOTOR_KV_MAX; p += MOTOR_KV_STEP) {
    const want = kvScaleFor(p);
    const rc = sim.e.sim_set_motor_kv(want);
    stops.push([p, rc, sim.e.sim_motor_kv() === want]);
  }
  check(`the slider's nine stops, ${MOTOR_KV_MIN} to ${MOTOR_KV_MAX}, are taken exactly as the shell computes them`,
    stops.length === 9 && stops.every(([, rc, same]) => rc === SIM_OK && same),
    stops.map(([p, rc]) => `${p}:${rc}`).join(' '));

  must(sim.e.sim_set_motor_kv(1.1), 'sim_set_motor_kv');
  const outside = [0.79, 1.21, 0.7999999999999999, 1.2000000000000002, 0, -1, 5, NaN, Infinity, -Infinity];
  const refused = outside.map((v) => [v, sim.e.sim_set_motor_kv(v), sim.e.sim_motor_kv()]);
  check('and everything outside 0.8 to 1.2, or not a number, is refused as a bad argument and leaves 1.1 where it was',
    refused.every(([, rc, held]) => rc === SIM_ERR_BAD_ARG && held === 1.1),
    refused.filter(([, rc, held]) => rc !== SIM_ERR_BAD_ARG || held !== 1.1).map(([v, rc, held]) => `${v}:${rc}/${held}`).join(' '));

  must(sim.init(config), 'sim_init');
  must(sim.reset(), 'sim_reset');
  check('it is a mode: sim_init and sim_reset leave it at 1.1', sim.e.sim_motor_kv() === 1.1);
  must(sim.e.sim_set_airframe(1), 'sim_set_airframe');
  must(sim.e.sim_set_airframe(0), 'sim_set_airframe');
  check('and so does swapping the airframe and back', sim.e.sim_motor_kv() === 1.1);
}

/* ---- identity ---- */
section('identity: the setter leaves no trace at 1.0');
{
  /* A stick stream that climbs, rolls, punches and chops, so the electrical
   * model is worked from idle to full duty and back. Segments, not a keyframe
   * curve: nothing on this side is transcendental. */
  const SCRIPT = [
    { durMs: 400, throttle: 0.5 },
    { durMs: 800, throttle: 0.38, pitch: 0.3 },
    { durMs: 500, throttle: 0.3, roll: 1 },
    { durMs: 500, throttle: 0.42 },
    { durMs: 600, throttle: 1 },
    { durMs: 700, throttle: 0 },
    { durMs: 1000, throttle: 0.45, roll: 0.5, pitch: 0.4, yaw: 0.2 },
    { durMs: 1500, throttle: 0.35 },
  ];
  async function trace(prepare) {
    const sim = await loadSim(wasm);
    must(sim.e.sim_set_gravity(GRAVITY), 'sim_set_gravity');
    prepare(sim);
    must(sim.init(config), 'sim_init');
    must(sim.reset(), 'sim_reset');
    must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
    const h = createHash('sha256');
    let steps = 0;
    runScript(sim, SCRIPT, () => {
      const { code, bytes } = sim.readStateBytes();
      must(code, 'sim_state');
      h.update(bytes);
      steps += 1;
    });
    return { hash: h.digest('hex'), steps };
  }
  const never = await trace(() => {});
  const one = await trace((sim) => must(sim.e.sim_set_motor_kv(1.0), 'sim_set_motor_kv'));
  const back = await trace((sim) => {
    must(sim.e.sim_set_motor_kv(1.2), 'sim_set_motor_kv');
    must(sim.e.sim_set_motor_kv(1.0), 'sim_set_motor_kv');
  });
  const moved = await trace((sim) => must(sim.e.sim_set_motor_kv(1.05), 'sim_set_motor_kv'));
  check(`a ${never.steps} step flight with the export never called, called with 1.0, and sent to 1.2 and back are bit identical`,
    never.hash === one.hash && never.hash === back.hash, `${never.hash.slice(0, 12)} ${one.hash.slice(0, 12)} ${back.hash.slice(0, 12)}`);
  check('and 1.05 is a different flight, so the comparison can see a difference at all',
    moved.hash !== never.hash, moved.hash.slice(0, 12));
}

/* ---- direction ---- */
section(`direction: the five inch at gravity ${GRAVITY}, 80 to 120 percent`);
const SCALES = [0.8, 0.9, 1.0, 1.1, 1.2];
const read = {};
{
  /* The throttle that holds altitude, by bisection on the climb over a second
   * after 2.5 s of settling: the same procedure as scripts/flightcheck.js. */
  async function hoverThrottle(scale) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 16; i += 1) {
      const mid = (lo + hi) / 2;
      const sim = await fresh(scale);
      runScript(sim, [{ durMs: 2500, throttle: mid }], null);
      const a = sim.readState().state[ST.PZ];
      runScript(sim, [{ durMs: 1000, throttle: mid }], null, 2500);
      if (sim.readState().state[ST.PZ] - a > 0) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return (lo + hi) / 2;
  }

  /* Full duty on all four motors on the bench for three seconds: the rotor
   * speed it settles at and what the pack is carrying. */
  async function bench(scale) {
    const sim = await fresh(scale);
    must(sim.motorOverride(-1, 1.0), 'sim_motor_override');
    runScript(sim, [{ durMs: 3000, throttle: 0 }], null);
    const st = sim.readState().state;
    return {
      rpm: (st[ST.RPM0] + st[ST.RPM1] + st[ST.RPM2] + st[ST.RPM3]) / 4,
      amps: st[ST.AMPS],
      volts: st[ST.VBAT],
    };
  }

  /* From a hover, full throttle for a second: the altitude it gains. */
  async function punch(scale, hover) {
    const sim = await fresh(scale);
    runScript(sim, [{ durMs: 900, throttle: Math.min(1, hover + 0.3) }, { durMs: 5100, throttle: hover }], null);
    const z0 = sim.readState().state[ST.PZ];
    let vmax = 0;
    runScript(sim, [{ durMs: 1000, throttle: 1 }], (t, st) => {
      vmax = Math.max(vmax, st[ST.VZ]);
    }, 6000);
    return { gain: sim.readState().state[ST.PZ] - z0, vmax };
  }

  for (const scale of SCALES) {
    const hover = await hoverThrottle(scale);
    read[scale] = { hover, ...(await bench(scale)), ...(await punch(scale, hover)) };
  }
  const line = (key, digits) => SCALES.map((s) => `${s}: ${read[s][key].toFixed(digits)}`).join('  ');
  console.log(`    hover throttle   ${line('hover', 3)}`);
  console.log(`    full speed rpm   ${line('rpm', 0)}`);
  console.log(`    full load amps   ${line('amps', 0)}`);
  console.log(`    pack volts       ${line('volts', 1)}`);
  console.log(`    punch climb m    ${line('gain', 1)}`);

  const rising = (key) => SCALES.every((s, i) => i === 0 || read[s][key] > read[SCALES[i - 1]][key]);
  const falling = (key) => SCALES.every((s, i) => i === 0 || read[s][key] < read[SCALES[i - 1]][key]);
  check('hover sits lower on the stick at every step up in the scale', falling('hover'));
  const law = SCALES.map((s) => Math.abs(read[s].hover * s - read[1].hover) / read[1].hover);
  check('and by about 1 / scale: hover times scale is within two percent of stock at every stop',
    law.every((d) => d <= 0.02), law.map((d) => `${(d * 100).toFixed(2)}%`).join(' '));
  check('full throttle turns the rotor faster at every step up', rising('rpm'));
  const ratioHi = read[1.2].rpm / read[1].rpm;
  const ratioLo = read[0.8].rpm / read[1].rpm;
  check('by less than the scale itself, because the prop takes some back: 1.05 to 1.20 at 1.2, 0.80 to 0.92 at 0.8',
    ratioHi >= 1.05 && ratioHi <= 1.2 && ratioLo >= 0.8 && ratioLo <= 0.92, `${ratioHi.toFixed(3)} ${ratioLo.toFixed(3)}`);
  check('the pack carries more current at full throttle at every step up, and sags further', rising('amps') && falling('volts'));
  check('and a punch from a hover gains more height at every step up', rising('gain'));
}

/* ---- time constant ---- */
section('time constant: check 8, at each scale');
{
  const th = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8')).checks['motor-step-response'];
  const rises = [];
  for (const scale of SCALES) {
    const sim = await fresh(scale);
    must(sim.motorOverride(-1, 0), 'sim_motor_override');
    const tPre = runScript(sim, [{ durMs: Math.round(th.pre_hold_s.value * 1000), throttle: 0 }], null);
    must(sim.motorOverride(0, 1), 'sim_motor_override');
    const rpm = [];
    runScript(sim, [{ durMs: Math.round(th.settle_s.value * 1000), throttle: 0 }], (t, st) => {
      rpm.push(st[ST.RPM0]);
    }, tPre);
    const target = th.target_fraction.value * rpm[rpm.length - 1];
    rises.push([scale, rpm.findIndex((r) => r >= target) + 1]);
  }
  console.log(`    63 percent rise  ${rises.map(([s, ms]) => `${s}: ${ms} ms`).join('  ')}`);
  const stock = rises.find(([s]) => s === 1)[1];
  check('the rise time is within three milliseconds of stock at every stop, so the motor is as quick as it was',
    rises.every(([, ms]) => ms > 0 && Math.abs(ms - stock) <= 3), `stock ${stock} ms`);
}

/* ---- spring ---- */
section('spring: the number the keyboard springs to holds altitude');
{
  /*
   * Flown the way scripts/flightcheck.js finds hover: from a rest at the
   * number, 2.5 s to spool up and settle, then the metres gained over the next
   * second. A half point of stick is about 0.45 m/s on this plant, so the
   * bound of 0.4 m over the second is about four tenths of a point, which is
   * the standard the weight columns were held to (configs/rates.js).
   *
   * The caps are the lines the menu writes, and the weights go through the
   * shell's own gravityScaleFor, so the module is asked what the shell asks.
   */
  const CASES = [
    { cap: 100, weight: 100, cell: 4.2 },
    { cap: 65, weight: 100, cell: 4.2 },
    { cap: 100, weight: 140, cell: 3.8 },
    { cap: 80, weight: 60, cell: 3.5 },
  ];
  const STEPS = [80, 85, 90, 95, 100, 105, 110, 115, 120];
  const rows = [];
  let flown = 0;
  let worst = 0;
  const off = [];
  for (const c of CASES) {
    const lines = `\nrateprofile 0\nset throttle_limit_type = ${c.cap < 100 ? 'SCALE' : 'OFF'}\nset throttle_limit_percent = ${c.cap}\n`;
    const drift = [];
    for (const pct of STEPS) {
      const stick = hoverStickPercent(c.cap, '5inch', c.weight, c.cell, pct) / 100;
      if (stick >= 0.995) {
        drift.push('n/a');
        continue;
      }
      const sim = await fresh(pct === 100 ? null : kvScaleFor(pct), {
        gravity: gravityScaleFor(c.weight, '5inch'), cell: c.cell, lines,
      });
      runScript(sim, [{ durMs: 2500, throttle: stick }], null);
      const z0 = sim.readState().state[ST.PZ];
      runScript(sim, [{ durMs: 1000, throttle: stick }], null, 2500);
      const d = sim.readState().state[ST.PZ] - z0;
      flown += 1;
      worst = Math.max(worst, Math.abs(d));
      if (Math.abs(d) > 0.4) {
        off.push(`cap ${c.cap} weight ${c.weight} ${c.cell} V at ${pct}: ${d.toFixed(2)} m`);
      }
      drift.push(d.toFixed(2));
    }
    rows.push(`    cap ${String(c.cap).padStart(3)} weight ${String(c.weight).padStart(3)} ${c.cell} V   ${drift.join(' ')}`);
  }
  console.log(`    metres gained in the second after settling, at Motor power ${STEPS.join(' ')}`);
  for (const r of rows) {
    console.log(r);
  }
  check(`the spring number holds altitude to 0.4 m a second at all ${flown} settings flown (worst ${worst.toFixed(2)} m)`,
    off.length === 0, off.join('; '));
}

console.log(`\nmotor-kv-check: ${failures === 0 ? 'all passed' : `${failures} FAILED`}`);
process.exit(failures);
