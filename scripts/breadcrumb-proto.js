/*
 * breadcrumb-proto.js: PROTOTYPE, an investigation and not a feature. Takes
 * the racing line the builder already derives for a RaceGOW room, puts a
 * speed on it from a point mass limit, and flies the result through the real
 * plant in Node to see whether the plant can follow it and whether the race
 * credits the lap.
 *
 * WHAT IT TESTS. Whether a line plus a speed profile is flyable at a stated
 * cornering load, with Betaflight's own rate curve and PID loop and the
 * plant in the loop (scripts/lib/flightrig.js). It answers "can the aircraft
 * follow this", which is the question a breadcrumb trail has to be able to
 * answer before it is shown to a beginner. It does not choose a better line:
 * the geometry is the builder's Hermite, through every opening centre.
 *
 * WHAT IT IS NOT. Empty sky: no frames, poles or floor bars in the plant's
 * world, so a collision is not measured. A tracker, not a human: a human
 * follows a trail with a reaction lag this does not have. Reads the plant,
 * changes nothing in it.
 *
 *   node scripts/breadcrumb-proto.js [track name fragment] [lateral g ...]
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { presetsForClass } from '../src/trackbuilder/presets.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { Race } from '../src/game/race.js';
import { makeRig, V, linePath } from './lib/flightrig.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmBytes = readFileSync(join(root, 'dist', 'sim.wasm'));
const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');

const G = 9.81;
const DS = 0.05;
/* The tracker's hover throttle for this tune at 4.0 V a cell, found by
 * holding a point and bisecting on steady state height (0.26 sat 0.10 m low,
 * 0.30 sat 0.11 m high). The rig's default, 0.345, was fitted for another
 * tune and sat 0.33 m high at a hover. */
const HOVER = 0.28;

/* The line, resampled at a fixed arc step and lightly smoothed, so the
 * curvature is a property of the shape and not of where the Hermite's
 * samples happened to fall. Closed: the last point is the first. */
function resample(line) {
  const pts = [];
  let carry = 0;
  pts.push({ ...line[0] });
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    let at = DS - carry;
    while (at <= seg) {
      const u = at / seg;
      pts.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });
      at += DS;
    }
    carry = seg - (at - DS);
  }
  /* Smooth on a ring: a moving average over 9 samples (0.45 m). */
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    let x = 0; let y = 0; let z = 0;
    for (let k = -4; k <= 4; k += 1) {
      const p = pts[(i + k + n) % n];
      x += p.x; y += p.y; z += p.z;
    }
    out.push({ x: x / 9, y: y / 9, z: z / 9 });
  }
  return out;
}

function geometry(pts) {
  const n = pts.length;
  const T = []; const K = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const l = Math.hypot(d.x, d.y, d.z) || 1;
    T.push({ x: d.x / l, y: d.y / l, z: d.z / l });
  }
  for (let i = 0; i < n; i += 1) {
    const a = T[(i - 1 + n) % n];
    const b = T[(i + 1) % n];
    K.push({ x: (b.x - a.x) / (2 * DS), y: (b.y - a.y) / (2 * DS), z: (b.z - a.z) / (2 * DS) });
  }
  return { T, K };
}

/* Point mass speed profile under a thrust vector limit A (m/s^2, gravity
 * included): |v^2 kappa + a_t T + g up| <= A, plus a speed cap. Forward and
 * backward passes so the longitudinal limit is honoured both ways. */
function profile(pts, T, K, A, vCap) {
  const n = pts.length;
  const up = { x: 0, y: G, z: 0 };
  const wAt = (i, v) => ({
    x: v * v * K[i].x + up.x, y: v * v * K[i].y + up.y, z: v * v * K[i].z + up.z,
  });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  /* Lateral ceiling on each sample, by bisection on v. */
  const v = new Array(n).fill(vCap);
  for (let i = 0; i < n; i += 1) {
    let lo = 0; let hi = vCap;
    for (let it = 0; it < 40; it += 1) {
      const mid = (lo + hi) / 2;
      const w = wAt(i, mid);
      const wt = dot(w, T[i]);
      const d = wt * wt - dot(w, w) + A * A;
      if (d >= 0) { lo = mid; } else { hi = mid; }
    }
    v[i] = lo;
  }
  const atLimit = (i, vv, sign) => {
    const w = wAt(i, vv);
    const wt = dot(w, T[i]);
    const d = Math.max(0, wt * wt - dot(w, w) + A * A);
    return sign > 0 ? -wt + Math.sqrt(d) : wt + Math.sqrt(d);
  };
  for (let pass = 0; pass < 2; pass += 1) {
    for (let k = 1; k <= 2 * n; k += 1) {
      const i = k % n; const p = (k - 1) % n;
      const a = Math.max(0, atLimit(p, v[p], 1));
      v[i] = Math.min(v[i], Math.sqrt(v[p] * v[p] + 2 * a * DS));
    }
    for (let k = 2 * n; k >= 1; k -= 1) {
      const i = (k - 1) % n; const nx = k % n;
      const a = Math.max(0, atLimit(nx, v[nx], -1));
      v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * a * DS));
    }
  }
  return v;
}

/* A time parametrised path the rig's tracker can fly: p, v, a. */
function timedPath(pts, T, K, v, laps) {
  const n = pts.length;
  const t = [0];
  for (let i = 1; i <= n; i += 1) {
    const vm = (v[i - 1] + v[i % n]) / 2;
    t.push(t[i - 1] + DS / Math.max(vm, 0.5));
  }
  const lapT = t[n];
  const fn = (time) => {
    const tt = Math.min(time, lapT * laps);
    const tl = tt % lapT;
    let lo = 0; let hi = n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (t[m] <= tl) { lo = m; } else { hi = m; }
    }
    const u = (tl - t[lo]) / (t[lo + 1] - t[lo] || 1);
    const i = lo; const j = (lo + 1) % n;
    const lerp = (a, b) => a + (b - a) * u;
    const sp = lerp(v[i], v[j]);
    const Ti = T[i];
    const dvds = (v[j] - v[i]) / DS;
    const at = sp * dvds;
    return {
      p: V(lerp(pts[i].x, pts[j].x), lerp(pts[i].y, pts[j].y), lerp(pts[i].z, pts[j].z)),
      v: V(Ti.x * sp, Ti.y * sp, Ti.z * sp),
      a: V(
        sp * sp * lerp(K[i].x, K[j].x) + Ti.x * at,
        sp * sp * lerp(K[i].y, K[j].y) + Ti.y * at,
        sp * sp * lerp(K[i].z, K[j].z) + Ti.z * at,
      ),
      done: time >= lapT * laps,
    };
  };
  fn.total = lapT * laps;
  fn.lapT = lapT;
  return fn;
}

function gatesOf(course) {
  return course.stations.map((st, i) => ({
    flyOrder: st.flyOrder ?? i,
    position: { x: st.x, y: st.baseY ?? 0, z: st.z },
    heading: st.yaw,
    pitch: st.pitch ?? 0,
    entry: st.entry ?? 1,
    apertures: [{
      shape: 'square', index: 0, sillH: 0, centreY: st.centreY, clearW: st.clearW, clearH: st.clearH,
    }],
    kindName: st.type,
    elementId: st.elementId,
    apertureIndex: 0,
    virtual: Boolean(st.virtual),
  }));
}

/* How tight the builder's line is, by three point radius over a 0.15 m
 * stride. Printed once per track, because it decides whether the line is a
 * thing anyone could fly or a thing that passes through the openings. */
function lineQuality(line) {
  const n = line.length;
  let len = 0;
  for (let i = 1; i < n; i += 1) {
    len += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y, line[i].z - line[i - 1].z);
  }
  const stride = Math.max(1, Math.round(0.15 / (len / n)));
  const radii = [];
  for (let i = stride; i < n - stride; i += 1) {
    const a = line[i - stride]; const b = line[i]; const d = line[i + stride];
    const ab = [b.x - a.x, b.y - a.y, b.z - a.z];
    const bd = [d.x - b.x, d.y - b.y, d.z - b.z];
    const cr = [
      ab[1] * bd[2] - ab[2] * bd[1], ab[2] * bd[0] - ab[0] * bd[2], ab[0] * bd[1] - ab[1] * bd[0],
    ];
    const area = Math.hypot(...cr) / 2;
    const prod = Math.hypot(...ab) * Math.hypot(...bd)
      * Math.hypot(d.x - a.x, d.y - a.y, d.z - a.z);
    radii.push(area > 1e-9 ? prod / (4 * area) : 1e9);
  }
  const share = (r) => Math.round((radii.filter((x) => x < r).length / radii.length) * 100);
  return {
    len, min: Math.min(...radii), u1: share(1), u3: share(3),
  };
}

async function run(doc, lateralG, vCap) {
  const course = courseFromDocument(doc);
  const pts = resample(course.line);
  const { T, K } = geometry(pts);
  const A = G * Math.sqrt(1 + lateralG * lateralG);
  const v = profile(pts, T, K, A, vCap);
  const LAPS = 4;
  const path = timedPath(pts, T, K, v, LAPS);
  const vmax = Math.max(...v);
  const vmean = pts.length * DS / path.lapT;

  const yaw0 = Math.atan2(-T[0].x, -T[0].z);
  const rig = await makeRig({
    wasmBytes, diffText, colliders: null, field: null,
    spawn: V(pts[0].x, 0, pts[0].z), spawnYaw: yaw0, groundY: 0, cell: 4.0,
  });
  /* Climb to the first point and arrive at the line's speed there, so the
   * timed lap starts on the line and not from the floor. */
  const start = V(pts[0].x, pts[0].y, pts[0].z);
  rig.fly(linePath(rig.craft().p, V(start.x, start.y, start.z), 2.5), { hover: HOVER });
  const head = (t, c) => {
    const d = path(t);
    return Math.atan2(d.v.x, d.v.z);
  };
  const lead = rig.simMs();
  const race = new Race(gatesOf(course), course.trackClass);
  race.setRecordKey('breadcrumb.proto');
  race.reset();
  let prev = null;
  /* The first lap is the run in: the craft starts from rest on a path that
   * starts at speed, so its error is the catch-up and not the line. Laps two
   * to four are what is reported. */
  let worst = 0;
  let sumE = 0;
  let count = 0;
  const lapMs = path.lapT * 1000;
  const res = rig.fly(path, {
    heading: head,
    hover: HOVER,
    kp: Number(process.env.BC_KP ?? 14),
    kd: Number(process.env.BC_KD ?? 7.5),
    ka: Number(process.env.BC_KA ?? 20),
    watch: (c, i) => {
      const d = path(i / 1000);
      const e = Math.hypot(d.p.x - c.p.x, d.p.y - c.p.y, d.p.z - c.p.z);
      if (process.env.BC_TRACE && i % 500 === 0) {
        console.log(i, 'want', d.p.x.toFixed(2), d.p.y.toFixed(2), d.p.z.toFixed(2), 'v', Math.hypot(d.v.x, d.v.y, d.v.z).toFixed(1), 'got', c.p.x.toFixed(2), c.p.y.toFixed(2), c.p.z.toFixed(2), 'e', e.toFixed(2));
      }
      if (i >= lapMs) {
        if (e > worst) { worst = e; }
        sumE += e; count += 1;
      }
      const cur = { x: c.p.x, y: c.p.y, z: c.p.z };
      if (prev) { race.update(prev, cur, rig.simMs() - lead, rig.simMs() - lead, true); }
      prev = cur;
    },
  });
  return {
    lateralG, vCap, lenM: pts.length * DS, vmax, vmean, lapS: path.lapT,
    worst, meanErr: sumE / count, laps: race.lap, gates: course.stations.length,
  };
}

const want = (process.argv[2] ?? 'Track 1').toLowerCase();
const gs = process.argv.slice(3).map(Number).filter((x) => x > 0);
const cases = gs.length ? gs : [1, 2, 3, 4, 6];
const doc = presetsForClass('micro').find((d) => d.name.toLowerCase().includes(want));
if (!doc) {
  console.error(`no micro preset matches "${want}"`);
  process.exit(1);
}
console.log(`${doc.name}: point mass line, then flown through the plant (4 laps, error read on laps 2 to 4, empty sky)`);
const q = lineQuality(courseFromDocument(doc).line);
console.log(`the builder's line: ${q.len.toFixed(0)} m, tightest radius ${q.min.toFixed(2)} m,`
  + ` ${q.u1} percent of it tighter than 1 m and ${q.u3} percent tighter than 3 m`
  + ' (the aircraft is 0.35 m across)');
console.log('lat g | v mean | v max | lap s | worst err m | mean err m | laps scored');
for (const g of cases) {
  // eslint-disable-next-line no-await-in-loop
  const r = await run(doc, g, 40);
  console.log(
    `${String(g).padStart(5)} | ${r.vmean.toFixed(1).padStart(6)} | ${r.vmax.toFixed(1).padStart(5)}`
    + ` | ${r.lapS.toFixed(1).padStart(5)} | ${r.worst.toFixed(2).padStart(11)} | ${r.meanErr.toFixed(2).padStart(10)}`
    + ` | ${r.laps}/${4}`,
  );
}
