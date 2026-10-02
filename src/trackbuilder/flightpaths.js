/*
 * flightpaths.js: laying the figures of manoeuvres.js into a track.
 *
 * A manoeuvre is a shape of the line between two pieces, and the line is derived, so a figure is written as what the
 * line already understands: ordinary waypoints in the flying order, each pointing the way the line goes through it
 * (a heading and a pitch), named in the owner's words ("Turn left 180", "Reverse Split-S"). Nothing is added to
 * the document that it did not have, so the board keeps them, the game draws the line they make, and a track that
 * came back from the board still says what each figure is, because the names came with it.
 *
 * A figure lives in a SLOT, the stretch of the flying order between two passes. Every pass has the slot after it
 * ("then") and the slot before it ("into"), and the slot after one pass is the slot before the next, so one run of
 * waypoints is a pass's "then" and the next pass's "into". A figure round a flag is the exception: it stands on both
 * sides of the flag's own pass, the arc coming into it and the arc going out, so it is read from both slots at once.
 *
 * Applying a figure takes away what was in the slot, lays the new one, and is one undo step in the app. Anything
 * a figure needs beyond waypoints is a pass: the same piece flown again when the figure comes back to it (an orbit
 * and back through, a power loop gate, a turnaround), which its name says ("Turn left 360, back through") so that
 * taking the figure away takes that pass with it.
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

import { KIND, trackClassOf } from './elements.js';
import {
  apertureCenter, createElement, elementById, entryAnchor, kindOf,
} from './model.js';
import { addToSequence, pinFacesAt } from './sequence.js';
import { applyAutoFaces, lastAnchorOf } from './faces.js';
import { wrapAngle } from './geometry.js';
import { buildPath, knotForSeq } from './path.js';
import {
  baseFor, curveOf, figureName, parseFigureName, placeCurve, specOf,
} from './manoeuvres.js';
import { flagsAsFlown, legOf } from './parts.js';
import { placeRun, runHeading, runSpecOf } from './runs.js';

const RAD = Math.PI / 180;
const mm = (v) => Math.round(v * 1000) / 1000;

/* ------------------------------------------------------------------ */
/* Finding a figure                                                    */
/* ------------------------------------------------------------------ */

/* The spec a sequence entry's waypoint says it is, or null when it is not a figure's waypoint. */
function specOfEntry(doc, seq) {
  const el = seq ? elementById(doc, seq.elementId) : null;
  return el && el.type === 'waypoint' ? parseFigureName(el.name) : null;
}

/* The figure waypoints in a row straight after (or before) the entry at index `i`. */
function runAfter(doc, i) {
  const out = [];
  for (let k = i + 1; k < doc.sequence.length && specOfEntry(doc, doc.sequence[k]); k += 1) {
    out.push(doc.sequence[k]);
  }
  return out;
}

function runBefore(doc, i) {
  const out = [];
  for (let k = i - 1; k >= 0 && specOfEntry(doc, doc.sequence[k]); k -= 1) {
    out.unshift(doc.sequence[k]);
  }
  return out;
}

function indexOfSeq(doc, seqId) {
  return doc.sequence.findIndex((s) => s.id === seqId);
}

/* Entries out of the flying order, and the waypoints they made out of the document when nothing else flies them. */
function dropEntries(doc, entries) {
  for (const q of entries) {
    const i = doc.sequence.indexOf(q);
    if (i >= 0) {
      doc.sequence.splice(i, 1);
    }
    if (!doc.sequence.some((s) => s.elementId === q.elementId)) {
      const k = doc.elements.findIndex((e) => e.id === q.elementId);
      if (k >= 0) {
        doc.elements.splice(k, 1);
      }
    }
  }
}

/*
 * WHAT IS IN THE SLOT AFTER A PASS: { spec, run, extra } or null. `run` are the waypoints, `extra` the second
 * pass of the same piece when the figure's name says it comes back through.
 */
export function thenOf(doc, seqId) {
  const at = indexOfSeq(doc, seqId);
  if (at < 0) {
    return null;
  }
  const run = ownRun(doc, runAfter(doc, at), seqId);
  if (!run.length) {
    return null;
  }
  const spec = specOfEntry(doc, run[0]);
  let extra = null;
  if (spec.again) {
    const next = doc.sequence[at + 1 + run.length];
    if (next && next.elementId === doc.sequence[at].elementId) {
      extra = next;
    }
  }
  return { spec, run, extra };
}

/* What is in the slot before a pass. */
export function intoOf(doc, seqId) {
  const at = indexOfSeq(doc, seqId);
  if (at < 0) {
    return null;
  }
  const run = ownRun(doc, runBefore(doc, at), seqId);
  return run.length ? { spec: specOfEntry(doc, run[0]), run } : null;
}

/*
 * WHAT OF A RUN IS THIS PASS'S. The run of waypoints between two passes is the slot after the first and the slot
 * before the second, and a flag's turn round it stands in the slot on either side, so the run beside a flag can have
 * the flag's arcs in it. A gate or another flag next to it does not read those as its own figure: a gate before a flag
 * with a turn round it has no "then", however the turn begins.
 */
function ownRun(doc, run, seqId) {
  const taken = aroundMembers(doc);
  return run.filter((q) => !taken.has(q.id) || taken.get(q.id) === seqId);
}

/* Every waypoint that is part of a turn round a flag, mapped to the flag's pass it belongs to. */
function aroundMembers(doc) {
  const out = new Map();
  for (const q of doc.sequence) {
    const found = aroundOf(doc, q.id);
    if (found) {
      for (const m of [...found.before, ...found.after]) {
        out.set(m.id, q.id);
      }
    }
  }
  return out;
}

/* How many waypoints a turn of `deg` degrees round a flag lays on each side of the pass: one for every forty five. */
function arcCount(spec) {
  return Math.max(1, Math.ceil((spec.deg ?? 180) / 2 / 45 - 1e-9));
}

/*
 * A FIGURE ROUND A FLAG: waypoints on both sides of the flag's pass, the arc coming in and the arc going out, of one
 * name. { spec, before, after } or null. A flag with a figure on only one side has a "then" or an "into", not this.
 */
export function aroundOf(doc, seqId) {
  const at = indexOfSeq(doc, seqId);
  if (at < 0) {
    return null;
  }
  /* A figure on both sides of a gate is two slots that happen to match, a hop into it and a hop out of it, and it is
   * read as that. Only a flag, a cone or a pole has the one figure round it. */
  const piece = elementById(doc, doc.sequence[at].elementId);
  if (!piece || piece.type === 'waypoint' || kindOf(piece) !== KIND.MARKER) {
    return null;
  }
  const before = runBefore(doc, at);
  const after = runAfter(doc, at);
  if (!before.length || !after.length) {
    return null;
  }
  /* The points nearest the pass say what the figure is, and it takes as many on each side as a turn that size lays: the
   * run beside a flag can go on past them, into the next flag's arcs, which are that flag's own. */
  const a = specOfEntry(doc, before[before.length - 1]);
  const b = specOfEntry(doc, after[0]);
  if (!a || !b || figureName(a) !== figureName(b)) {
    return null;
  }
  const n = arcCount(a);
  if (before.length < n || after.length < n) {
    return null;
  }
  return { spec: a, before: before.slice(before.length - n), after: after.slice(0, n) };
}

/*
 * WHICH FIGURE A WAYPOINT BELONGS TO, so that selecting one of its points can take the whole figure out: { slot, ownerId }
 * where `slot` is 'around', 'then' or 'into' and `ownerId` is the pass the figure is about, or null when the
 * waypoint is not a figure's.
 */
export function figureHolding(doc, seqId) {
  const at = indexOfSeq(doc, seqId);
  if (at < 0 || !specOfEntry(doc, doc.sequence[at])) {
    return null;
  }
  const before = runBefore(doc, at + 1);
  const start = at - (before.length - 1);
  const end = start + before.length - 1 + runAfter(doc, at).length;
  const entry = doc.sequence[at];
  const prev = doc.sequence[start - 1];
  const next = doc.sequence[end + 1];
  const isStation = (q) => q && elementById(doc, q.elementId)?.type !== 'waypoint';
  const round = aroundMembers(doc).get(entry.id);
  if (round) {
    return { slot: 'around', ownerId: round };
  }
  if (isStation(prev)) {
    const found = thenOf(doc, prev.id);
    if (found && found.run.includes(entry)) {
      return { slot: 'then', ownerId: prev.id };
    }
  }
  if (isStation(next)) {
    const found = intoOf(doc, next.id);
    if (found && found.run.includes(entry)) {
      return { slot: 'into', ownerId: next.id };
    }
  }
  return null;
}

/* Take the figure after a pass out, and its second pass with it. Returns whether there was one. */
export function clearThen(doc, seqId) {
  /* A flag's figure is one figure on both sides of it: clearing one side takes the whole of it, or half of it would
   * stay and read as a figure of the other slot. */
  if (aroundOf(doc, seqId)) {
    return clearAround(doc, seqId);
  }
  const found = thenOf(doc, seqId);
  if (!found) {
    return false;
  }
  dropEntries(doc, [...found.run, ...(found.extra ? [found.extra] : [])]);
  applyAutoFaces(doc);
  return true;
}

export function clearInto(doc, seqId) {
  if (aroundOf(doc, seqId)) {
    return clearAround(doc, seqId);
  }
  const found = intoOf(doc, seqId);
  if (!found) {
    return false;
  }
  dropEntries(doc, found.run);
  applyAutoFaces(doc);
  return true;
}

export function clearAround(doc, seqId) {
  const found = aroundOf(doc, seqId);
  if (!found) {
    return false;
  }
  dropEntries(doc, [...found.before, ...found.after]);
  applyAutoFaces(doc);
  return true;
}

/* ------------------------------------------------------------------ */
/* Laying one                                                          */
/* ------------------------------------------------------------------ */

/* Where a pass is and which way the line goes through it: from the knot the line makes there. */
function poseOf(doc, seq) {
  const path = buildPath(doc);
  const knot = knotForSeq(path, seq.id);
  if (!knot) {
    return null;
  }
  const t = knot.tangent;
  const flat = Math.hypot(t.x, t.y);
  const el = elementById(doc, seq.elementId);
  return {
    x: knot.pos.x,
    y: knot.pos.y,
    z: knot.pos.z,
    yaw: flat > 1e-6 ? Math.atan2(t.y, t.x) : (el?.yaw ?? 0),
    knot,
  };
}

/* A waypoint of a figure, in the flying order at `index`: pointing as the line goes, named by the figure. */
function laidWaypoint(doc, p, spec, index) {
  /* The heading is rounded to what a saved track keeps and then wrapped, so a half turn's heading, which is pi, is
   * written as the value a load gives it back: 3.142 is past pi and reads back as -3.141, and a track that is not
   * the same after a round trip says so. */
  const wp = createElement(doc, 'waypoint', { x: mm(p.x), y: mm(p.y), z: mm(p.z) }, wrapAngle(mm(p.yaw)));
  /* Clamped to a quarter turn, and then rounded to what a saved track keeps: rounded first, a pitch of exactly a quarter turn is
   * written as 1.571, which is past it, and a load clamps it back and the track is no longer the bytes it was. */
  wp.pitch = Math.round(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p.pitch)) * 1e6) / 1e6;
  wp.yawOverridden = true;
  wp.name = figureName(spec);
  doc.elements.push(wp);
  addToSequence(doc, wp.id, 0, index);
  return wp;
}

/*
 * THE FIGURE AFTER A PASS. The slot after the pass is cleared and the figure laid from where the line leaves the
 * piece, heading the way it goes. With `again` in the spec the figure comes back to the piece, so its last point,
 * if it is where the pass is, is dropped (the pass is that point) and the piece is flown a second time, the same
 * way or reversed. Returns { waypoints, extra, spec } or null when the pass cannot have one (it is a waypoint, or
 * is not there).
 */
export function applyThen(doc, seqId, raw) {
  const first = doc.sequence.find((s) => s.id === seqId);
  const el = first ? elementById(doc, first.elementId) : null;
  if (!first || !el || el.type === 'waypoint' || ![KIND.APERTURE, KIND.MARKER].includes(kindOf(el))) {
    return null;
  }
  clearThen(doc, seqId);
  let at = indexOfSeq(doc, seqId);
  pinFacesAt(doc, [at]);
  at = indexOfSeq(doc, seqId);
  const seq = doc.sequence[at];
  const spec = specOf(raw);
  if (spec.again && kindOf(el) !== KIND.APERTURE) {
    delete spec.again;
  }
  const pose = poseOf(doc, seq);
  if (!pose) {
    return null;
  }
  let pts = placeCurve(curveOf(spec, trackClassOf(doc)), pose, 'start');
  if (spec.again && pts.length) {
    const last = pts[pts.length - 1];
    if (Math.hypot(last.x - pose.x, last.y - pose.y, last.z - pose.z) < 0.25) {
      pts = pts.slice(0, -1);
    }
  }
  const waypoints = pts.map((p, k) => laidWaypoint(doc, p, spec, at + 1 + k).id);
  let extra = null;
  if (spec.again) {
    extra = addToSequence(doc, seq.elementId, seq.apertureIndex ?? 0, at + 1 + waypoints.length);
    if (extra) {
      extra.entry = spec.again === 'back through reversed' ? -(seq.entry === -1 ? -1 : 1) : (seq.entry === -1 ? -1 : 1);
      extra.overridden = true;
    }
  }
  applyAutoFaces(doc);
  return { waypoints, extra, spec };
}

/*
 * THE FIGURE INTO A PASS. The slot before the pass is cleared and the figure laid so that it ends `gap` metres short
 * of the piece, level with the way the line goes through it: a straight run in, which is the lead the figure
 * starts with, as it is out of one. A gap of nothing ends it at the piece itself, so the last point, which is where
 * the pass is, is dropped: a circle that goes through the middle of the opening.
 */
export function applyInto(doc, seqId, raw, { gap = null } = {}) {
  const first = doc.sequence.find((s) => s.id === seqId);
  const el = first ? elementById(doc, first.elementId) : null;
  if (!first || !el || el.type === 'waypoint' || ![KIND.APERTURE, KIND.MARKER].includes(kindOf(el))) {
    return null;
  }
  clearInto(doc, seqId);
  let at = indexOfSeq(doc, seqId);
  pinFacesAt(doc, [at]);
  at = indexOfSeq(doc, seqId);
  const seq = doc.sequence[at];
  const spec = specOf(raw);
  delete spec.again;
  const pose = poseOf(doc, seq);
  if (!pose) {
    return null;
  }
  const cls = trackClassOf(doc);
  const short = gap ?? baseFor(cls).lead;
  const end = {
    x: pose.x - Math.cos(pose.yaw) * short,
    y: pose.y - Math.sin(pose.yaw) * short,
    z: pose.z,
    yaw: pose.yaw,
  };
  let pts = placeCurve(curveOf(spec, cls), end, 'end');
  if (short === 0 && pts.length) {
    pts = pts.slice(0, -1);
  }
  const waypoints = pts.map((p, k) => laidWaypoint(doc, p, spec, at + k).id);
  applyAutoFaces(doc);
  return { waypoints, spec };
}

/* ------------------------------------------------------------------ */
/* Round a flagged leg                                                 */
/* ------------------------------------------------------------------ */

/* The vertical a hairpin round a leg climbs or drops, a half turn's worth: a spiral that is not a ramp. */
function legRise(cls, deg) {
  return 0.6 * baseFor(cls).radius * (deg / 180);
}

/*
 * THE FLIGHT PATHS ROUND A FLAGGED LEG, after the pass. The line goes through the gate and turns round the leg that
 * carries the flag, on the circle that goes through the middle of the opening and is centred on the pennant, so it
 * comes round the outside of the flag and never over it:
 *
 *   hairpin       a flat 180 round the leg
 *   spiralUp      the same, climbing
 *   spiralDown    the same, losing height
 *   orbit         a full circle round the leg and back through the gate the way it went in
 *   figure8       through, round one leg, back through, round the other, back through (a flag on each)
 *
 * `side` is as flown, left or right, and has to carry a flag (legOf says). Returns what applyThen returns, or null.
 */
export function applyLeg(doc, seqId, side, kind) {
  const leg = legOf(doc, seqId, side);
  if (!leg) {
    return null;
  }
  const cls = trackClassOf(doc);
  const round = { hand: side, radius: leg.radius, lead: 0 };
  if (kind === 'hairpin') {
    return applyThen(doc, seqId, { ...round, id: 'turn', deg: 180 });
  }
  if (kind === 'spiralUp') {
    return applyThen(doc, seqId, {
      ...round, id: 'climb', deg: 180, rise: legRise(cls, 180),
    });
  }
  if (kind === 'spiralDown') {
    return applyThen(doc, seqId, {
      ...round, id: 'descend', deg: 180, rise: legRise(cls, 180),
    });
  }
  if (kind === 'orbit') {
    return applyThen(doc, seqId, {
      ...round, id: 'turn', deg: 360, again: 'back through',
    });
  }
  if (kind === 'figure8') {
    const other = side === 'left' ? 'right' : 'left';
    const flags = flagsAsFlown(doc, seqId);
    if (!flags[other]) {
      return null;
    }
    const a = applyThen(doc, seqId, {
      ...round, id: 'turn', deg: 360, again: 'back through',
    });
    if (!a || !a.extra) {
      return null;
    }
    const back = legOf(doc, a.extra.id, other);
    if (!back) {
      return a;
    }
    const b = applyThen(doc, a.extra.id, {
      hand: other, radius: back.radius, lead: 0, id: 'turn', deg: 360, again: 'back through',
    });
    return { waypoints: [...a.waypoints, ...(b ? b.waypoints : [])], extra: b ? b.extra : a.extra, spec: a.spec };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* A turnaround, a power loop gate                                     */
/* ------------------------------------------------------------------ */

/*
 * A TURNAROUND: through the gate, a figure, and back through the same gate reversed. `kind` 'flat' is a hairpin
 * (`hand` the way it turns), 'over' is a reverse split-S over the top and a drop back down to the gate. The figure's
 * lead is long enough that the line has room to line up again for the pass back, which is how a quad that has made
 * a turn a radius wide gets back through the same opening.
 */
export function applyTurnaround(doc, seqId, kind, hand = 'left') {
  const radius = baseFor(trackClassOf(doc)).radius;
  if (kind === 'over') {
    return applyThen(doc, seqId, {
      id: 'revSplitS', lead: radius * 3, again: 'back through reversed',
    });
  }
  return applyThen(doc, seqId, {
    id: 'turn', hand, deg: 180, lead: radius * 3, again: 'back through reversed',
  });
}

/* A POWER LOOP GATE: through, a loop that starts at the gate and comes round to it, and through again the same way. */
export function applyPowerLoopGate(doc, seqId) {
  return applyThen(doc, seqId, { id: 'loop', lead: 0, again: 'back through' });
}

/* ------------------------------------------------------------------ */
/* Round a flag                                                        */
/* ------------------------------------------------------------------ */

/*
 * A FIGURE ROUND A FLAG: a turn of 90, 180 or 360 degrees round the pole at the clearance the pass has, flat, climbing
 * or descending, symmetrical about the knot the flag's own pass makes. The arc coming in is laid before the pass and
 * the arc going out after it, so the pass itself, the square that scores, is the middle of the turn. A climbing turn
 * rises after the flag and a descending one has come down by it, so the line is always at the height of the flag's
 * window as it passes.
 *
 * `raw` is { id: 'turn' | 'climb' | 'descend', hand, deg }; the hand is the way the pilot turns. Returns
 * { before, after, spec } or null (not a marker with a pole, or no pass knot).
 */
export function applyAround(doc, seqId, raw) {
  const first = doc.sequence.find((s) => s.id === seqId);
  const el = first ? elementById(doc, first.elementId) : null;
  if (!first || !el || el.type === 'waypoint' || kindOf(el) !== KIND.MARKER) {
    return null;
  }
  const spec = specOf({ ...raw, id: ['turn', 'climb', 'descend'].includes(raw.id) ? raw.id : 'turn' });
  /* Whatever was on either side of the flag goes, a turn round it or a figure on one side only, so the arcs are
   * the whole of what is there. */
  clearThen(doc, seqId);
  clearInto(doc, seqId);
  let at = indexOfSeq(doc, seqId);
  pinFacesAt(doc, [at]);
  at = indexOfSeq(doc, seqId);
  const seq = doc.sequence[at];
  const pose = poseOf(doc, seq);
  const pole = pose && pose.knot.markerPos;
  if (!pole) {
    return null;
  }
  const r = Math.hypot(pose.x - pole.x, pose.y - pole.y);
  if (r < 0.05) {
    return null;
  }
  const s = spec.hand === 'right' ? -1 : 1;
  const half = spec.deg / 2;
  const cls = trackClassOf(doc);
  const rise = spec.id === 'turn' ? 0 : legRise(cls, spec.deg) * (spec.id === 'descend' ? -1 : 1);
  /*
   * WHERE THE ARC STARTS: where the line from the piece before meets the circle on a tangent, so the line goes
   * into the turn without a second turn, and the arc is laid on from there. The knot the flag's pass makes is the
   * middle of the arc, and the flag is turned to put it there (its yaw is the way off the pole its pass is), so
   * that the pass is where the figure says and not where the automatic rule would have it. Close to the flag, with
   * nowhere to come from, it is laid symmetrical about the knot the pass already had.
   */
  let a0 = Math.atan2(pose.y - pole.y, pose.x - pole.x);
  const n0 = doc.sequence.length;
  const previous = n0 > 1 ? entryAnchor(doc, doc.sequence[(at - 1 + n0) % n0]) : null;
  if (previous) {
    const d = Math.hypot(previous.x - pole.x, previous.y - pole.y);
    if (d > r * 1.05) {
      const toward = Math.atan2(previous.y - pole.y, previous.x - pole.x);
      const spread = Math.acos(r / d);
      for (const th of [toward + spread, toward - spread]) {
        const v = { x: -Math.sin(th) * s, y: Math.cos(th) * s };
        const tx = pole.x + Math.cos(th) * r - previous.x;
        const ty = pole.y + Math.sin(th) * r - previous.y;
        if (tx * v.x + ty * v.y > 0) {
          a0 = th + s * half * RAD;
          break;
        }
      }
    }
  }
  /* The pass is set to the outside of the turn, which is on the right of the line round a flag on its left, and the
   * flag is left to the line to point: the knot then stands where the figure's own waypoints put it, from the
   * direction of the line through it, and cannot be turned the wrong way by a flag that was turned by hand. */
  seq.passSide = s === 1 ? 'right' : 'left';
  seq.overridden = true;
  el.yawOverridden = false;
  const per = Math.max(1, Math.ceil(half / 45 - 1e-9));
  const phis = [];
  for (let k = per; k >= 1; k -= 1) {
    phis.push(-(half * k) / per);
  }
  const mid = phis.length;
  for (let k = 1; k <= per; k += 1) {
    phis.push((half * k) / per);
  }
  const slope = rise / (r * (spec.deg * RAD));
  const point = (phi) => {
    const a = a0 + s * phi * RAD;
    const dz = spec.id === 'climb' ? rise * Math.max(0, phi) / half : (spec.id === 'descend' ? -rise * Math.max(0, -phi) / half : 0);
    const dir = a + s * Math.PI / 2;
    return {
      x: pole.x + Math.cos(a) * r,
      y: pole.y + Math.sin(a) * r,
      z: pose.z + dz,
      yaw: dir,
      pitch: Math.atan(slope * (spec.id === 'turn' ? 0 : 1)),
    };
  };
  const before = phis.slice(0, mid).map((phi, k) => laidWaypoint(doc, point(phi), spec, at + k).id);
  const after = phis.slice(mid).map((phi, k) => laidWaypoint(doc, point(phi), spec, at + before.length + 1 + k).id);
  applyAutoFaces(doc);
  return { before, after, spec };
}

/* The hand a turn round a flag goes by default: the way the line is already going past the flag. */
export function defaultAroundHand(doc, seqId) {
  const seq = doc.sequence.find((q) => q.id === seqId);
  const path = buildPath(doc);
  const knot = seq ? knotForSeq(path, seq.id) : null;
  if (!knot || !knot.markerPos) {
    return 'left';
  }
  const radial = { x: knot.pos.x - knot.markerPos.x, y: knot.pos.y - knot.markerPos.y };
  const t = knot.tangent;
  /* Anticlockwise round the pole moves a point on its radius a quarter turn on: that way is left. */
  return radial.x * t.y - radial.y * t.x >= 0 ? 'left' : 'right';
}

/* ------------------------------------------------------------------ */
/* A section                                                           */
/* ------------------------------------------------------------------ */

/*
 * LAY A SECTION (runs.js), and for a Dutch 8 the figure round its two flags: a full orbit of the first the way the section's
 * hand says and a full orbit of the second the other way, each a turn round a flag (applyAround) so the line goes round and
 * across and never over. Every other section is just the pieces. Returns the pieces made, in the order they are flown.
 */
export function placeSection(doc, at, raw, opts = {}) {
  const made = placeRun(doc, at, raw, opts);
  const spec = runSpecOf(raw);
  if (spec.shape === 'dutch8' && made.length === 2) {
    const [a, b] = made.map((el) => doc.sequence.find((q) => q.elementId === el.id));
    const second = spec.hand === 'right' ? 'left' : 'right';
    applyAround(doc, a.id, { id: 'turn', hand: spec.hand, deg: 360 });
    applyAround(doc, b.id, { id: 'turn', hand: second, deg: 360 });
  }
  return made;
}

/* ------------------------------------------------------------------ */
/* A launch gate                                                       */
/* ------------------------------------------------------------------ */

/*
 * A LAUNCH GATE: the horizontal gate a dive gate is, flown UP, from below. MultiGP's course book has it forcing a pilot to "punch
 * the throttle and launch upwards", and a pilot punches out of level flight, so the gate comes with the line that gets
 * there: a pull up from level to vertical on the way in and a push over from vertical to level on the way out, each a
 * quarter of a circle, as two waypoints, plain ones with their own names that can be dragged or taken out like any other.
 * Without them the line through a vertical pass is a long swing that goes under the ground before it climbs.
 *
 * The gate is the dive gate's own numbers, 15 ft up and 7 by 6 ft, turned along the course so its long side is across the
 * way the line comes. Returns the gate.
 */
export function placeLaunchGate(doc, at, opts = {}) {
  const cls = trackClassOf(doc);
  const last = lastAnchorOf(doc);
  const heading = runHeading(doc, at, opts.square);
  const gate = createElement(doc, 'diveGate', { x: at.x, y: at.y, z: 0 }, heading);
  gate.yawOverridden = true;
  doc.elements.push(gate);
  const seq = addToSequence(doc, gate.id, 0);
  if (seq) {
    seq.entry = 1;
    seq.overridden = true;
  }
  const centre = apertureCenter(gate, 0).z;
  const from = last ? last.pos.z : 0;
  const r = Math.max(0.2, Math.min(baseFor(cls).radius * 0.8, (centre - from) / 3));
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const at3 = (u, z, pitch, name, index) => {
    const wp = createElement(doc, 'waypoint', { x: mm(at.x + c * u), y: mm(at.y + s * u), z: mm(z) }, wrapAngle(mm(heading)));
    wp.pitch = mm(pitch);
    wp.yawOverridden = true;
    wp.name = name;
    doc.elements.push(wp);
    addToSequence(doc, wp.id, 0, index);
  };
  const q = doc.sequence.findIndex((x) => x.elementId === gate.id);
  const root2 = Math.SQRT1_2;
  /* In: level at the bottom of the quarter, where a run in from the piece before ends, then 45 degrees up half way round it,
   * and vertical under the gate. The point at the bottom is what keeps the line level until it is time to climb: a line
   * that is to be vertical a few metres on, from a gate thirty away, sags below the ground on the way. */
  at3(-r, from, 0, 'Pull up', q);
  at3(-r * (1 - root2), from + r * (1 - root2), Math.PI / 4, 'Pull up', q + 1);
  at3(0, from + r, Math.PI / 2 - 1e-3, 'Pull up', q + 2);
  /* Out: vertical above the gate, 45 degrees over, and level at the top of the quarter. */
  const top = centre + gate.dims.clearH / 2 + 0.6;
  const base = doc.sequence.findIndex((x) => x.elementId === gate.id) + 1;
  at3(r * (1 - root2), top + r * root2, Math.PI / 4, 'Push over', base);
  at3(r, top + r, 0, 'Push over', base + 1);
  applyAutoFaces(doc);
  return gate;
}
