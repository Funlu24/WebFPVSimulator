/*
 * runs.js: a run of gates laid along a shape, in one press.
 *
 * A track is mostly the same few sections over and over: a straight, a long sweeper, a hairpin, a
 * chicane, a run of esses, a step sequence that climbs, a flag slalom, a Dutch 8. Each is pieces, evenly set
 * along a line, every gate facing the way the line goes through it, and laying one by hand is a dozen clicks and
 * a dozen turns of a heading. This writes them, in the flying order, in one undo step; after that they are
 * ordinary pieces, to be moved, turned and resized like any other, and nothing in the document says they were
 * laid as a section.
 *
 * THE SHAPE IS LOCAL, as manoeuvres.js's curves are: it starts at the origin heading along +u, with
 * v to the left and w up, and is placed in the world by where it begins and which way the course
 * is going there. A left shape is anticlockwise seen from above and a right one is its mirror.
 *
 * GAPS. How far apart the gates are is the section's own choice and not a free number: short, normal
 * or long, which is a factor on what the class of track calls a gap (a field's is ten metres, a
 * whoop's a metre and a half). A hairpin has no gap, its gates are spread round the half circle, so
 * spacing sets how wide it is.
 *
 * Pure, like the builder's other data modules: the geometry takes no document, and the laying takes
 * one and changes it.
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

import { defaultDims, trackClassOf } from './elements.js';
import { createElement } from './model.js';
import { addToSequence } from './sequence.js';
import { applyAutoFaces, defaultYawFor } from './faces.js';
import { wrapAngle } from './geometry.js';
import { baseFor } from './manoeuvres.js';

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

/*
 * The sections. `count` is how many gates it can have and `more` what it has by default; `hand` says the shape turns
 * and so can be left or right, `rise` that it climbs or drops as it goes.
 */
export const RUN_SHAPES = [
  {
    id: 'straight', label: 'Straight', hand: false, rise: false, count: [2, 8], more: 3,
    hint: 'Gates in a line, evenly set, all facing along it.',
  },
  {
    id: 'sweeper', label: 'Sweeper', hand: true, rise: false, count: [2, 8], more: 4,
    hint: 'A long, wide bend: the gates are set round an arc a pilot carries speed through.',
  },
  {
    id: 'hairpin', label: 'Hairpin', hand: true, rise: false, count: [2, 6], more: 3,
    hint: 'A turn back on itself: the gates are spread round a half circle, the last facing the way the first came from. Two gates is a hairpin pair.',
  },
  {
    id: 'chicane', label: 'Chicane', hand: true, rise: false, count: [3, 8], more: 4,
    hint: 'A quick swing out one way and back the other, and on along the line: the gates step off it and return.',
  },
  {
    id: 'esses', label: 'Esses', hand: true, rise: false, count: [5, 10], more: 7,
    hint: 'A run of bends, left then right then left again: two chicanes end to end.',
  },
  {
    id: 'step', label: 'Step sequence', hand: false, rise: true, count: [2, 8], more: 4,
    hint: 'Gates in a line, each a step higher than the one before, or lower: a staircase to climb or to drop down.',
  },
  {
    id: 'flagSlalom', label: 'Flag slalom', piece: 'flag', hand: true, rise: false, count: [3, 8], more: 4,
    hint: 'Flags in a line with the lap passing them on alternate sides, the first on the side you pick. A flag is flown round and never over.',
  },
  {
    id: 'dutch8', label: 'Dutch 8', piece: 'flag', hand: true, rise: false, count: [2, 2], more: 2,
    hint: 'Two flags side by side across the line, and a figure 8 round them: an orbit of the first, across, and an orbit of the other the opposite way.',
  },
];

export function runShapeById(id) {
  return RUN_SHAPES.find((s) => s.id === id) ?? null;
}

export const RUN_SPACINGS = [
  { id: 'short', label: 'Short', factor: 0.6 },
  { id: 'normal', label: 'Normal', factor: 1 },
  { id: 'long', label: 'Long', factor: 1.5 },
];

/*
 * THE NUMBERS A RUN IS LAID WITH, per class of track, in metres. `gap` is the distance between gates in a line, `sweep`
 * and `hairpin` are radii as multiples of the figures' turn radius (manoeuvres.js), `rise` is how far a step goes up
 * and `swing` how far a chicane steps off the line, as a fraction of the gap.
 */
export const RUN_BASE = {
  full: { gap: 10, rise: 0.75, flag: 1.5 },
  micro: { gap: 1.5, rise: 0.2, flag: 0.36 },
};
/* How far apart a Dutch 8's flags are, in flag clearances: two to a diameter of the orbit and a little over. */
export const DUTCH_APART = 2.4;
export const SWEEP_RADII = 6;
export const HAIRPIN_RADII = 2.2;
/* How far a chicane and a set of esses step off the line, as a fraction of the gap. Esses cross the line three times as fast,
 * so their steps are smaller, or the gate in the middle of them would face nearly across the course. */
export const SWING = { chicane: 0.45, esses: 0.35 };

export function runBaseFor(cls) {
  return cls === 'micro' ? RUN_BASE.micro : RUN_BASE.full;
}

/* What a shape is made of: gates unless it says otherwise. */
export function runPieceOf(shape) {
  return runShapeById(shape)?.piece ?? 'gate';
}

/* A spec is what a run is, whole: { shape, hand, count, spacing, rise }. Anything missing or not one is the default. */
export function runSpecOf(raw = {}) {
  const def = runShapeById(raw.shape) ?? RUN_SHAPES[0];
  const [lo, hi] = def.count;
  const asked = Math.round(Number(raw.count));
  return {
    shape: def.id,
    hand: raw.hand === 'right' ? 'right' : 'left',
    count: Number.isFinite(asked) && asked >= lo && asked <= hi ? asked : def.more,
    spacing: RUN_SPACINGS.some((s) => s.id === raw.spacing) ? raw.spacing : 'normal',
    rise: raw.rise === 'down' ? 'down' : 'up',
  };
}

/* ------------------------------------------------------------------ */
/* The geometry                                                        */
/* ------------------------------------------------------------------ */

/* A swing that starts and ends on the line with no slope: a sine of `periods` periods under a half sine. */
function swingAt(periods, t) {
  return Math.sin(2 * Math.PI * periods * t) * Math.sin(Math.PI * t);
}

function swingSlope(periods, t) {
  const w = 2 * Math.PI * periods;
  return w * Math.cos(w * t) * Math.sin(Math.PI * t) + Math.PI * Math.sin(w * t) * Math.cos(Math.PI * t);
}

/* How far out the swing goes at its widest, so the swing can be asked for in metres. */
function swingPeak(periods) {
  let best = 0;
  for (let i = 0; i <= 400; i += 1) {
    best = Math.max(best, Math.abs(swingAt(periods, i / 400)));
  }
  return best;
}

/*
 * THE GATES OF A RUN, in the order they are flown, each { u, v, w, yaw } in the run's own frame, the first at the origin.
 * `yaw` is how far the gate is turned from the heading the run began on, which is the way the line goes through it.
 */
export function runPoints(raw, cls = 'full') {
  const spec = runSpecOf(raw);
  const base = runBaseFor(cls);
  const factor = RUN_SPACINGS.find((s) => s.id === spec.spacing).factor;
  const h = spec.hand === 'right' ? -1 : 1;
  const n = spec.count;
  const radius = baseFor(cls).radius;
  const gap = base.gap * factor;
  const out = [];
  switch (spec.shape) {
    case 'sweeper': {
      const r = SWEEP_RADII * radius;
      for (let k = 0; k < n; k += 1) {
        const a = (k * gap) / r;
        out.push({ u: r * Math.sin(a), v: h * r * (1 - Math.cos(a)), w: 0, yaw: h * a });
      }
      break;
    }
    case 'hairpin': {
      const r = HAIRPIN_RADII * radius * factor;
      for (let k = 0; k < n; k += 1) {
        const a = (Math.PI * k) / (n - 1);
        out.push({ u: r * Math.sin(a), v: h * r * (1 - Math.cos(a)), w: 0, yaw: h * a });
      }
      break;
    }
    case 'chicane':
    case 'esses': {
      /* One swing out and back, or two for esses, laid as a sine that eases in and out of the line, so the first gate
       * and the last face along the course and the line they are joined to is straight into the one and out of the other. */
      const periods = spec.shape === 'esses' ? 2 : 1;
      const swing = SWING[spec.shape] * gap;
      const peak = swingPeak(periods);
      const length = (n - 1) * gap;
      for (let k = 0; k < n; k += 1) {
        const t = k / (n - 1);
        out.push({
          u: k * gap,
          v: h * (swing / peak) * swingAt(periods, t),
          w: 0,
          yaw: h * Math.atan(((swing / peak) * swingSlope(periods, t)) / length),
        });
      }
      break;
    }
    case 'step': {
      const s = spec.rise === 'down' ? -1 : 1;
      for (let k = 0; k < n; k += 1) {
        out.push({ u: k * gap, v: 0, w: s * k * base.rise, yaw: 0 });
      }
      break;
    }
    case 'flagSlalom': {
      /* The flags stand on the line and the lap weaves: left of the first (or right), then the other side of the next. */
      for (let k = 0; k < n; k += 1) {
        out.push({ u: k * gap, v: 0, w: 0, yaw: 0, side: (k % 2 === 0) === (h > 0) ? 'left' : 'right' });
      }
      break;
    }
    case 'dutch8': {
      /* Two flags across the line, far enough apart that an orbit of each is a turn a flag's clearance wide and the two
       * orbits meet between them; the first is on the side of the hand, with the lead before them to come in on. */
      const apart = DUTCH_APART * runBaseFor(cls).flag;
      const lead = Math.max(gap * 0.6, apart);
      /* Each is passed on the outside of its own orbit: on the right of a flag that is gone round to the left. */
      out.push({ u: lead, v: (h * apart) / 2, w: 0, yaw: 0, side: h > 0 ? 'right' : 'left' });
      out.push({ u: lead, v: (-h * apart) / 2, w: 0, yaw: 0, side: h > 0 ? 'left' : 'right' });
      break;
    }
    default: {
      for (let k = 0; k < n; k += 1) {
        out.push({ u: k * gap, v: 0, w: 0, yaw: 0 });
      }
    }
  }
  return out;
}

/* The gates in the world, as { x, y, z, yaw }, for a run that begins at `pose` = { x, y, z, yaw }. */
export function placeRunPoints(points, pose) {
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  return points.map((p) => ({
    x: pose.x + c * p.u - s * p.v,
    y: pose.y + s * p.u + c * p.v,
    z: (pose.z ?? 0) + p.w,
    yaw: wrapAngle(pose.yaw + p.yaw),
    ...(p.side ? { side: p.side } : {}),
  }));
}

/* ------------------------------------------------------------------ */
/* Laying one                                                          */
/* ------------------------------------------------------------------ */

/* The way the course is going at a spot, which a run begins on: along the line from the piece before, or square to the field. */
export function runHeading(doc, at, square = false) {
  const yaw = defaultYawFor(doc, at);
  return square ? wrapAngle(Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2)) : yaw;
}

/* What a click would put down, for the room's ghost: { type, position, yaw, props } for every gate. */
export function runGhosts(doc, at, raw, opts = {}) {
  const cls = trackClassOf(doc);
  const type = runPieceOf(runSpecOf(raw).shape);
  const dims = defaultDims(type, cls);
  const heading = runHeading(doc, at, opts.square);
  return placeRunPoints(runPoints(raw, cls), { x: at.x, y: at.y, z: 0, yaw: heading }).map((g) => ({
    type,
    position: { x: g.x, y: g.y, z: g.z },
    yaw: g.yaw,
    props: type === 'gate' ? { dims: { ...dims }, pitch: 0 } : { dims: { ...dims } },
  }));
}

/*
 * LAY A RUN: ordinary gates, one for each point, in the flying order, each turned the way the line goes through it and
 * kept so, because the face rule would turn a gate along the line from the one before and a bend is the one place that
 * is not the way the gate should face. Returns the elements made, in the order they are flown.
 */
export function placeRun(doc, at, raw, opts = {}) {
  const cls = trackClassOf(doc);
  const type = runPieceOf(runSpecOf(raw).shape);
  const heading = runHeading(doc, at, opts.square);
  const spots = placeRunPoints(runPoints(raw, cls), { x: at.x, y: at.y, z: 0, yaw: heading });
  const out = [];
  for (const g of spots) {
    const round = (v) => Math.round(v * 1000) / 1000;
    /* The heading is rounded to what a saved track keeps and then wrapped, so a gate that faces back is written as the
     * value a load gives it back (see laidWaypoint in flightpaths.js). */
    const el = createElement(doc, type, { x: round(g.x), y: round(g.y), z: round(g.z) }, wrapAngle(round(g.yaw)));
    /* Kept as laid before the order is made, or the face rule turns it along the line as it joins. */
    el.yawOverridden = type === 'gate';
    doc.elements.push(el);
    const seq = addToSequence(doc, el.id, 0);
    if (type === 'gate') {
      if (seq) {
        seq.entry = 1;
        seq.overridden = true;
      }
    } else if (seq && g.side) {
      /* A flag is passed on the side the section says, which is what makes a slalom weave, and kept so. */
      seq.passSide = g.side;
      seq.overridden = true;
    }
    out.push(el);
  }
  applyAutoFaces(doc);
  return out;
}
