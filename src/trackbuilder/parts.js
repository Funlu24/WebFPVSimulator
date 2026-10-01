/*
 * parts.js: the 5 inch canvas's pieces that are made of pieces.
 *
 * A wall, a hurdle, an up gate, a loop round a post, and flags that come and go
 * on a gate. None is an element. Each is a way of writing ordinary elements,
 * so the document holds only what it always could (gates in a group, a barrier
 * with flags, a dive gate with a tilt, waypoints) and every reader of it, the
 * game, the board, the lap GIF and the card, needs to learn nothing. See
 * TRACK-BUILDER-5IN-PLAN.md, section 4.2.
 *
 * Pure, like the builder's other data modules: no DOM, no Three.js. Every
 * function takes the document, changes it, and says what it made, so the app
 * can run one inside a single undo step and the self test can run all of them
 * in Node.
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

import {
  ELEMENTS, KIND, FLAG_SIDES, FRAME_TUBE_OD, GATE_FLAG_H, GATE_PRESETS, applyGatePreset, defaultDims, isPlain,
  trackClassOf, wallPitchFor,
} from './elements.js';
import {
  apertureCenter, aperturesOf, createElement, elementById, elementNormal, kindOf, newGroupId, setSideBuilt,
} from './model.js';
import { addToSequence } from './sequence.js';
import { applyAutoFaces, defaultYawFor, lastAnchorOf } from './faces.js';
import { apertureFrame, wrapAngle } from './geometry.js';

/* ------------------------------------------------------------------ */
/* Flags, as one choice                                                */
/* ------------------------------------------------------------------ */

/*
 * A gate and a flagged gate are two types, a double stack and a flagged double
 * likewise, so "flags: none, left, right, both, top" is a change of type where
 * it must be and a change of side where it need not be. Everything else about
 * the piece, its place, its heading, its size, its group and its flying order,
 * stays, because the type is the only thing that differs.
 */
const FLAGGED_TWIN = { gate: 'flaggedGate', doubleStack: 'flaggedDoubleStack' };
const PLAIN_TWIN = { flaggedGate: 'gate', flaggedDoubleStack: 'doubleStack' };

export const FLAG_CHOICES = ['none', ...FLAG_SIDES];

/* Whether a piece can carry flags at all, and so whether the chips are offered. A tower, a dive
 * gate and a ladder have no flagged twin; a barrier may carry them as a hurdle does. */
export function canFlag(el) {
  if (!el) {
    return false;
  }
  return Boolean(FLAGGED_TWIN[el.type] || PLAIN_TWIN[el.type] || ELEMENTS[el.type]?.flagsOptional);
}

/* Which of the choices the piece has now. */
export function flagsOf(el) {
  if (!canFlag(el)) {
    return 'none';
  }
  if (PLAIN_TWIN[el.type] || ELEMENTS[el.type]?.flagSide) {
    return FLAG_SIDES.includes(el.flagSide) ? el.flagSide : (ELEMENTS[el.type].flagSide ?? 'left');
  }
  if (FLAGGED_TWIN[el.type]) {
    return 'none';
  }
  return FLAG_SIDES.includes(el.flagSide) ? el.flagSide : 'none';
}

/*
 * Put the flags on a piece as chosen. Returns true when the document changed. 'none' on a flagged
 * piece makes it the plain type; a side on a plain gate makes it the flagged type; a side on a
 * flagged piece moves the pennant. A hurdle (a barrier) gains or loses `flagSide` and the mast
 * height beside it, both written only while it has flags.
 */
export function setFlags(doc, id, choice) {
  const el = elementById(doc, id);
  if (!el || !canFlag(el) || !FLAG_CHOICES.includes(choice)) {
    return false;
  }
  if (ELEMENTS[el.type].flagsOptional) {
    if (choice === 'none') {
      if (el.flagSide === undefined) {
        return false;
      }
      delete el.flagSide;
      delete el.dims.flagH;
      return true;
    }
    if (el.flagSide === choice) {
      return false;
    }
    el.flagSide = choice;
    if (!(el.dims.flagH > 0)) {
      el.dims.flagH = HURDLE.flagH;
    }
    return true;
  }
  if (choice === 'none') {
    const plain = PLAIN_TWIN[el.type];
    if (!plain) {
      return false;
    }
    el.type = plain;
    delete el.flagSide;
    delete el.dims.flagH;
    return true;
  }
  const flagged = FLAGGED_TWIN[el.type] ?? (PLAIN_TWIN[el.type] ? el.type : null);
  if (!flagged) {
    return false;
  }
  if (el.type === flagged && el.flagSide === choice) {
    return false;
  }
  el.type = flagged;
  el.flagSide = choice;
  if (!(el.dims.flagH > 0)) {
    el.dims.flagH = GATE_FLAG_H;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* The wall                                                            */
/* ------------------------------------------------------------------ */

/* Two to six bays, three when it is only clicked. */
export const WALL_MIN = 2;
export const WALL_MAX = 6;
export const WALL_DEFAULT = 3;

const unit = (v) => {
  const d = Math.hypot(v.x, v.y);
  return d > 1e-9 ? { x: v.x / d, y: v.y / d } : { x: 1, y: 0 };
};

/*
 * WHAT A DRAG ALONG THE GROUND IS AS A WALL: from where it started to where it
 * ended, the bays standing end to end in between, each facing across the wall.
 * Returns { count, dir, pitch, yaw, items: [{ x, y, yaw }] }, the first bay
 * beside where the drag began. Pure, so the ghost that follows the drag and
 * the gates that are placed are one answer.
 *
 * THE COUNT is the drag's length over the pitch, two at the least and six at the
 * most, and three for a click, which is the wall a person means by clicking, laid
 * east and west across the spot. A dragged wall starts AT the first point and runs
 * towards the second, so a wall is dragged from its first post to its last, which
 * is how a plan dimensions it.
 *
 * THE DIRECTION is the drag's, put on the nearest fifteen degrees, so a wall is
 * square to the compass when the drag is nearly so.
 *
 * THE PITCH is the world's (wallPitchFor): the uprights meet where the game builds
 * them, and the builder shows document sizes, so in the builder the bays show a
 * small gap the world does not have.
 *
 * WHICH WAY THEY FACE. Across the wall there are two ways, and the one that
 * points the way the course is heading, from the last place it has been to the
 * middle of the wall, is taken. With nothing before it, north or east.
 */
export function wallPlan(doc, a, b, opts = {}) {
  const dims = opts.dims ?? defaultDims('gate', trackClassOf(doc));
  const pitch = opts.pitch ?? wallPitchFor(dims, trackClassOf(doc));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  let dir = { x: 1, y: 0 };
  if (len > 1e-6) {
    const step = opts.square ? Math.PI / 2 : Math.PI / 12;
    const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
    dir = opts.free ? unit({ x: dx, y: dy }) : { x: Math.cos(snapped), y: Math.sin(snapped) };
  }
  const click = len < pitch * 0.5;
  const count = click
    ? WALL_DEFAULT
    : Math.max(WALL_MIN, Math.min(WALL_MAX, Math.round(len / pitch)));
  /* A click is the middle of the wall; a drag is where it begins. */
  const start = click
    ? { x: a.x - dir.x * pitch * count * 0.5, y: a.y - dir.y * pitch * count * 0.5 }
    : { x: a.x, y: a.y };
  const centre = {
    x: start.x + dir.x * pitch * count * 0.5,
    y: start.y + dir.y * pitch * count * 0.5,
  };
  const n1 = { x: -dir.y, y: dir.x };
  const n2 = { x: dir.y, y: -dir.x };
  let across = n1.x + n1.y > 0 ? n1 : n2;
  const last = lastAnchorOf(doc);
  if (last) {
    const h = { x: centre.x - last.pos.x, y: centre.y - last.pos.y };
    const d1 = n1.x * h.x + n1.y * h.y;
    const d2 = n2.x * h.x + n2.y * h.y;
    if (Math.abs(d1 - d2) > 1e-9) {
      across = d1 > d2 ? n1 : n2;
    } else {
      /* The wall is straight on from the last place the course was, so the line to it says nothing about which way
       * to go through it. The way the course LEFT that place does: it went round, and comes at the wall from the side
       * it left towards, so the first bay is flown the other way. */
      const out = exitOf(doc, last);
      const side = out ? out.x * n1.x + out.y * n1.y : 0;
      if (Math.abs(side) > 0.2) {
        across = side > 0 ? n2 : n1;
      }
    }
  }
  const yaw = wrapAngle(Math.atan2(across.y, across.x));
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({
      x: start.x + dir.x * pitch * (i + 0.5),
      y: start.y + dir.y * pitch * (i + 0.5),
      yaw,
    });
  }
  return {
    count, dir, pitch, yaw, items,
  };
}

/* The way the course leaves an anchor on the ground, as a unit vector, or null when it leaves it no way in particular
 * (a marker, a waypoint, the start pads): a gate leaves the way it is flown. */
function exitOf(doc, anchor) {
  const seq = anchor && anchor.seq;
  const el = seq ? elementById(doc, seq.elementId) : null;
  if (!el || kindOf(el) !== KIND.APERTURE || !seq.entry) {
    return null;
  }
  const n = elementNormal(el);
  const d = unit({ x: n.x * seq.entry, y: n.y * seq.entry });
  return Math.hypot(n.x, n.y) > 1e-6 ? d : null;
}

/* The width axis of a gate, the way apertureFrame says it: the way its uprights are apart. */
function widthOf(el) {
  const f = apertureFrame(el.yaw, 0);
  return { x: f.widthAxis.x, y: f.widthAxis.y };
}

/*
 * LAY THE WALL: ordinary gates in one group, in the plain dress, the upright each
 * shares with the bay before it left out, each joined to the flying order in bay
 * order, so a wall is dragged in the order it is flown. Returns the new ids in
 * that order.
 *
 * opts: dims (the gate size), flags ('none', 'first', 'last' or 'both': which end
 * bays carry a pennant, in drag order, on their outer side), weave (true: the
 * passes alternate, a slalom through the bays; false: every pass the same way),
 * join (false: put nothing in the flying order).
 *
 * THE PASSES ARE SET, not left to be worked out. The chord between two bays is
 * square to both, which is the one case the face rule cannot read a direction
 * from, and a wall flown through is the case it is built for. They are marked as
 * set by hand, so moving a bay later does not turn it round.
 */
export function placeWall(doc, a, b, opts = {}) {
  const cls = trackClassOf(doc);
  const dims = { ...(opts.dims ?? defaultDims('gate', cls)) };
  const plan = wallPlan(doc, a, b, { ...opts, dims });
  const group = newGroupId(doc);
  const flags = opts.flags ?? 'none';
  const ids = [];
  plan.items.forEach((it, i) => {
    const el = createElement(doc, 'gate', { x: it.x, y: it.y, z: 0 }, it.yaw);
    Object.assign(el.dims, dims);
    el.dims.levels = 1;
    el.yawOverridden = true;
    el.style = 'plain';
    el.group = group;
    el.name = `Bay ${i + 1}`;
    doc.elements.push(el);
    ids.push(el.id);
  });
  ids.forEach((id, i) => {
    const el = elementById(doc, id);
    const w = widthOf(el);
    /* The upright facing the bay before it is the one before it already has. */
    if (i > 0) {
      setSideBuilt(doc, id, w.x * -plan.dir.x + w.y * -plan.dir.y > 0 ? 'right' : 'left', false);
    }
    /* A pennant on an end bay stands on its outer upright. Outer is away from the rest of the wall:
     * back along the drag for the first bay, on along it for the last. */
    const end = (i === 0 && (flags === 'first' || flags === 'both'))
      ? -1
      : ((i === ids.length - 1 && (flags === 'last' || flags === 'both')) ? 1 : 0);
    if (end !== 0) {
      const side = w.x * plan.dir.x * end + w.y * plan.dir.y * end > 0 ? 'right' : 'left';
      setFlags(doc, id, side);
    }
  });
  if (opts.join !== false) {
    ids.forEach((id, i) => {
      const seq = addToSequence(doc, id, 0);
      if (seq) {
        seq.entry = opts.weave === false || i % 2 === 0 ? 1 : -1;
        seq.overridden = true;
      }
    });
    applyAutoFaces(doc);
  }
  return ids;
}

/* The bays of the wall a gate stands in, in the order along it, or just the gate when it is on its own. */
export function wallBays(doc, id) {
  const el = elementById(doc, id);
  if (!el) {
    return [];
  }
  const bays = el.group ? doc.elements.filter((e) => e.group === el.group && kindOf(e) === KIND.APERTURE) : [el];
  if (bays.length < 2) {
    return bays;
  }
  const w = widthOf(bays[0]);
  return [...bays].sort((p, q) => (p.position.x * w.x + p.position.y * w.y) - (q.position.x * w.x + q.position.y * w.y));
}

/*
 * WHAT A GATE IS A BAY OF. A wall is gates in one group in the plain dress, laid
 * by placeWall, so a group of two or more is one: { ids, dir } with the bays in the
 * order they were dragged out (which is the order of the document, and the order
 * they were first flown in), and `dir` the unit step from one to the next. Null for
 * a gate that is on its own, for anything that is not a gate, and for a group that
 * is not a row of plain bays (a cube is a group too, and is not a wall).
 */
export function wallOf(doc, id) {
  const el = elementById(doc, id);
  if (!el || !el.group) {
    return null;
  }
  const bays = doc.elements.filter((e) => e.group === el.group);
  if (bays.length < 2 || !bays.every((b) => kindOf(b) === KIND.APERTURE && isPlain(b))) {
    return null;
  }
  const dir = unit({
    x: bays[bays.length - 1].position.x - bays[0].position.x,
    y: bays[bays.length - 1].position.y - bays[0].position.y,
  });
  return { ids: bays.map((b) => b.id), dir };
}

/* The side an end bay's outer upright is on, as the bay's own left or right: away from the rest of the wall. */
function outerSide(doc, wall, end) {
  const el = elementById(doc, wall.ids[end === 'first' ? 0 : wall.ids.length - 1]);
  const w = widthOf(el);
  const out = end === 'first' ? -1 : 1;
  return w.x * wall.dir.x * out + w.y * wall.dir.y * out > 0 ? 'right' : 'left';
}

/* Which ends of a wall carry a pennant on their outer upright: 'none', 'first', 'last' or 'both', the first being the
 * bay it was dragged from. */
export function wallFlagsOf(doc, id) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return 'none';
  }
  const has = (end) => {
    const el = elementById(doc, wall.ids[end === 'first' ? 0 : wall.ids.length - 1]);
    return canFlag(el) && flagsOf(el) === outerSide(doc, wall, end) && el.type !== 'gate';
  };
  const a = has('first');
  const b = has('last');
  return a && b ? 'both' : (a ? 'first' : (b ? 'last' : 'none'));
}

/* Put the pennants on a wall's ends as chosen. Returns true when the document changed. */
export function setWallFlags(doc, id, which) {
  const wall = wallOf(doc, id);
  if (!wall || !['none', 'first', 'last', 'both'].includes(which)) {
    return false;
  }
  let changed = false;
  for (const end of ['first', 'last']) {
    const bay = elementById(doc, wall.ids[end === 'first' ? 0 : wall.ids.length - 1]);
    const wanted = which === 'both' || which === end;
    changed = setFlags(doc, bay.id, wanted ? outerSide(doc, wall, end) : 'none') || changed;
  }
  return changed;
}

/*
 * THE SIZE OF A WALL'S BAYS, as a gate preset (Standard, Wide, Championship, Trainer): every bay takes the
 * preset's opening, and the bays are laid again at the new pitch from where the first bay's outer upright
 * stood, so the wall grows or shrinks along itself and its first post does not move. Returns true when it
 * changed. A preset this canvas does not offer is refused.
 */
export function setWallSize(doc, id, presetId) {
  const wall = wallOf(doc, id);
  const preset = GATE_PRESETS.find((p) => p.id === presetId && p.id !== 'whoop');
  if (!wall || !preset) {
    return false;
  }
  const bays = wall.ids.map((bay) => elementById(doc, bay));
  const before = wallPitchFor(bays[0].dims, trackClassOf(doc));
  const next = { ...bays[0].dims };
  applyGatePreset(next, preset);
  if (Math.abs(next.clearW - bays[0].dims.clearW) < 1e-9 && Math.abs(next.clearH - bays[0].dims.clearH) < 1e-9) {
    return false;
  }
  const pitch = wallPitchFor(next, trackClassOf(doc));
  const start = {
    x: bays[0].position.x - wall.dir.x * before * 0.5,
    y: bays[0].position.y - wall.dir.y * before * 0.5,
  };
  bays.forEach((bay, i) => {
    Object.assign(bay.dims, { clearW: next.clearW, clearH: next.clearH, levelPitch: next.levelPitch });
    bay.position.x = Math.round((start.x + wall.dir.x * pitch * (i + 0.5)) * 1e6) / 1e6;
    bay.position.y = Math.round((start.y + wall.dir.y * pitch * (i + 0.5)) * 1e6) / 1e6;
  });
  applyAutoFaces(doc);
  return true;
}

/* Which preset a wall's bays are, or '' when they are a size of their own. */
export function wallSizeOf(doc, id) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return '';
  }
  const d = elementById(doc, wall.ids[0]).dims;
  const hit = GATE_PRESETS.find((p) => p.id !== 'whoop' && Math.abs(p.clearW - d.clearW) < 1e-6);
  return hit ? hit.id : '';
}

/* The passes of a wall's bays, in the order they are flown. */
function wallPasses(doc, wall) {
  const own = new Set(wall.ids);
  return doc.sequence.filter((q) => own.has(q.elementId));
}

/* Whether a wall is flown as a slalom: the passes alternate, every bay the other way to the one before. */
export function wallIsWoven(doc, id) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return false;
  }
  const flown = wallPasses(doc, wall);
  return flown.length > 1 && flown.every((q, i) => i === 0 || q.entry !== flown[i - 1].entry);
}

/* A wall flown as a slalom or straight through, the first bay flown the way it was. Returns true when it changed. */
export function setWallWeave(doc, id, woven) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return false;
  }
  const flown = wallPasses(doc, wall);
  if (!flown.length) {
    return false;
  }
  const first = flown[0].entry === -1 ? -1 : 1;
  let changed = false;
  flown.forEach((q, i) => {
    const wanted = woven && i % 2 === 1 ? -first : first;
    if (q.entry !== wanted || !q.overridden) {
      q.entry = wanted;
      q.overridden = true;
      changed = true;
    }
  });
  if (changed) {
    applyAutoFaces(doc);
  }
  return changed;
}

/* Fly a wall the other way: every pass through its bays turned round. */
export function reverseWall(doc, id) {
  const wall = wallOf(doc, id);
  if (!wall) {
    return false;
  }
  const flown = wallPasses(doc, wall);
  for (const q of flown) {
    q.entry = q.entry === -1 ? 1 : -1;
    q.overridden = true;
  }
  if (flown.length) {
    applyAutoFaces(doc);
  }
  return flown.length > 0;
}

/* ------------------------------------------------------------------ */
/* The hurdle                                                          */
/* ------------------------------------------------------------------ */

/*
 * A board at least a metre high, four metres from flag to flag, flown over. The
 * numbers are the plan's rules box: "The hurdle is to be a minimum of 1m high. The
 * gap between the two flags of the hurdle is to be 4m." The board is a barrier
 * with flags, thin so a quad that clips it is not stopped by half a metre of
 * nothing in front of it, and the line passes a metre over its top.
 */
export const HURDLE = {
  width: 4, depth: 0.1, height: 1, flagH: 2,
};
export const HURDLE_LINE_OVER = 1;

/* The way a hurdle is turned at a spot: the board runs across the course, a quarter turn from the way it goes,
 * on the nearest fifteen degrees. */
function hurdleYaw(doc, at, square = false) {
  const last = lastAnchorOf(doc);
  const course = last
    ? Math.atan2(at.y - last.pos.y, at.x - last.pos.x)
    : 0;
  const step = square ? Math.PI / 2 : Math.PI / 12;
  return wrapAngle(Math.round((course + Math.PI / 2) / step) * step);
}

/*
 * PUT A HURDLE DOWN: the board, turned square to the line the course is on, with a
 * flag at each end, and a waypoint over the middle of it in the flying order, which
 * is what makes the lap go over the hurdle and not through it. A hurdle is not a
 * gate and nothing scores on it, so the waypoint is a point the line is held to and
 * not a station. Returns { id, waypointId }, the waypoint's null when it was not
 * joined to the order (opts.join false).
 */
export function placeHurdle(doc, at, opts = {}) {
  const yaw = hurdleYaw(doc, at, opts.square);
  const el = createElement(doc, 'barrier', { x: at.x, y: at.y, z: 0 }, yaw);
  Object.assign(el.dims, { width: HURDLE.width, depth: HURDLE.depth, height: HURDLE.height });
  el.flagSide = opts.flags ?? 'both';
  el.dims.flagH = HURDLE.flagH;
  el.yawOverridden = true;
  el.name = 'Hurdle';
  doc.elements.push(el);
  let waypointId = null;
  if (opts.join !== false) {
    const wp = createElement(doc, 'waypoint', { x: at.x, y: at.y, z: HURDLE.height + HURDLE_LINE_OVER }, 0);
    wp.name = 'Over the hurdle';
    doc.elements.push(wp);
    addToSequence(doc, wp.id, 0);
    waypointId = wp.id;
    applyAutoFaces(doc);
  }
  return { id: el.id, waypointId };
}

/*
 * FLY OVER A HURDLE: a waypoint a metre above the middle of its board, added to the end of the flying
 * order, which is what makes a lap go over a hurdle that was put down without one (or that was put down
 * and then had its waypoint taken out of the order). Returns { id, waypointId }, or null when the piece
 * is not a barrier. A hurdle that is already flown over at its middle is flown over again, as a gate
 * flown twice is.
 */
export function flyOver(doc, id) {
  const el = elementById(doc, id);
  if (!el || el.type !== 'barrier') {
    return null;
  }
  const top = (el.dims.height ?? HURDLE.height) + HURDLE_LINE_OVER;
  const wp = createElement(doc, 'waypoint', { x: el.position.x, y: el.position.y, z: top }, 0);
  wp.name = 'Over the hurdle';
  doc.elements.push(wp);
  addToSequence(doc, wp.id, 0);
  applyAutoFaces(doc);
  return { id: el.id, waypointId: wp.id };
}

/* ------------------------------------------------------------------ */
/* The up gate                                                         */
/* ------------------------------------------------------------------ */

/*
 * Leaning 45 degrees, its lower edge at least 1.5 m up, flown up through: "The 'up-gate' is
 * to have an angle no greater than 45 degrees. The lower edge of the 'up-gate' is to be a
 * minimum of 1.5m high." It is a dive gate with those two numbers, so everything that reads a
 * dive gate reads this. `sillH` is the bottom of the opening before the lean, and the lean
 * lifts the lower edge no lower than that, so a sill of 1.5 m keeps the edge past the rule.
 */
export const UP_GATE = { pitch: Math.PI / 4, sillH: 1.5 };

/*
 * PUT AN UP GATE DOWN, in the flying order, flown UP: its pass is set so the quad climbs through
 * it, because the face rule reads a tilted gate from the drop to the next knot and an up gate
 * that is followed by a loop over the top and a descent would be turned into a dive gate. The
 * heading is the course's. Returns the element.
 */
export function placeUpGate(doc, at, opts = {}) {
  const el = createElement(doc, 'diveGate', { x: at.x, y: at.y, z: 0 }, 0);
  el.pitch = UP_GATE.pitch;
  el.dims.sillH = UP_GATE.sillH;
  if (opts.square) {
    /* Square to the field, and kept so: the face rule would turn it along the line again at the next edit. */
    el.yaw = Math.round(wrapAngle(Math.round(defaultYawFor(doc, at) / (Math.PI / 2)) * (Math.PI / 2)) * 1e6) / 1e6;
    el.yawOverridden = true;
  }
  doc.elements.push(el);
  const seq = addToSequence(doc, el.id, 0);
  if (seq) {
    seq.entry = 1;
    seq.overridden = true;
  }
  applyAutoFaces(doc);
  return el;
}

/* ------------------------------------------------------------------ */
/* The loop                                                            */
/* ------------------------------------------------------------------ */

/*
 * A LOOP ROUND A POST, after a pass through a gate: out of the gate, round the upright on the
 * chosen side, and back to where it left, which is the gate's middle, so that the next pass
 * through the same gate is a pass and not a hook. Written as three ordinary waypoints in the
 * flying order, a quarter turn apart on a circle that passes through the middle of the gate, and
 * then, unless asked not to, the second pass through the same opening. Waypoints are what the
 * board, the game and the line already know, they can be dragged to reshape the loop, and Undo
 * takes the loop away as one step.
 *
 * `side` is as flown: 'right' is a right turn, clockwise seen from above, round the right hand
 * upright; 'left' is the mirror. The circle's radius is the upright's distance from the opening's
 * middle, which is the document's, so in the world, where the gate is built larger, the line
 * passes a little more clear of the post than the circle says.
 *
 * Returns { waypoints: [ids], pass: the entry of the second pass or null }, or null when the pass
 * is not an aperture or is not there.
 */
export function addLoop(doc, seqId, side, opts = {}) {
  const at = doc.sequence.findIndex((s) => s.id === seqId);
  const seq = doc.sequence[at];
  const el = seq ? elementById(doc, seq.elementId) : null;
  if (!seq || !el || kindOf(el) !== KIND.APERTURE || (side !== 'right' && side !== 'left')) {
    return null;
  }
  const index = seq.apertureIndex ?? 0;
  const ap = aperturesOf(el)[Math.min(index, aperturesOf(el).length - 1)];
  const centre = apertureCenter(el, index);
  const f = apertureFrame(el.yaw, el.pitch);
  const sign = seq.entry === -1 ? -1 : 1;
  /* The way the quad is going through it, on the ground: the right of that is the right as flown. */
  const travel = unit({ x: f.normal.x * sign, y: f.normal.y * sign });
  const right = { x: travel.y, y: -travel.x };
  const turn = side === 'right' ? -1 : 1;
  const r = (ap.clearW + FRAME_TUBE_OD) / 2;
  const post = {
    x: centre.x + right.x * r * (side === 'right' ? 1 : -1),
    y: centre.y + right.y * r * (side === 'right' ? 1 : -1),
  };
  const start = Math.atan2(centre.y - post.y, centre.x - post.x);
  const ids = [];
  for (let k = 1; k <= 3; k += 1) {
    const angle = start + turn * k * (Math.PI / 2);
    const wp = createElement(doc, 'waypoint', {
      x: post.x + Math.cos(angle) * r,
      y: post.y + Math.sin(angle) * r,
      z: centre.z,
    }, 0);
    wp.name = side === 'right' ? 'Loop right' : 'Loop left';
    doc.elements.push(wp);
    addToSequence(doc, wp.id, 0, at + k);
    ids.push(wp.id);
  }
  let pass = null;
  if (opts.again !== false) {
    pass = addToSequence(doc, el.id, index, at + 4);
    if (pass) {
      /* Through it the way it was flown the first time. */
      pass.entry = seq.entry;
      pass.overridden = true;
    }
  }
  applyAutoFaces(doc);
  return { waypoints: ids, pass };
}

/* ------------------------------------------------------------------ */
/* What a tool would put down                                          */
/* ------------------------------------------------------------------ */

/*
 * THE GHOST OF A PIECE MADE OF PIECES: the elements the tool would write if it were
 * pressed now, as the room draws a ghost, each { type, position, yaw, props }, where
 * `props` are the fields the placed element carries beyond what its type gives it.
 * A wall's `a` and `b` are its two ends as for wallPlan; the others stand at `a`.
 * Pure, and built from the same functions the pieces are placed with, so what is
 * shown is what is laid.
 */
export function partGhosts(doc, type, a, b = a, opts = {}) {
  const cls = trackClassOf(doc);
  if (type === 'wall') {
    const dims = { ...(opts.dims ?? defaultDims('gate', cls)), levels: 1 };
    const plan = wallPlan(doc, a, b, { ...opts, dims });
    return {
      plan,
      items: plan.items.map((it, i) => {
        const wide = Math.hypot(plan.dir.x, plan.dir.y) > 0 ? plan.dir : { x: 1, y: 0 };
        /* The upright a bay shares with the one before it is built once, so the ghost leaves it out too. */
        const f = apertureFrame(it.yaw, 0);
        const toward = f.widthAxis.x * -wide.x + f.widthAxis.y * -wide.y > 0 ? 'right' : 'left';
        return {
          type: 'gate',
          position: { x: it.x, y: it.y, z: 0 },
          yaw: it.yaw,
          props: { dims, pitch: 0, style: 'plain', unbuiltSides: i > 0 ? [toward] : [] },
        };
      }),
    };
  }
  if (type === 'hurdle') {
    return {
      plan: null,
      items: [{
        type: 'barrier',
        position: { x: a.x, y: a.y, z: 0 },
        yaw: hurdleYaw(doc, a, opts.square),
        props: {
          dims: { ...defaultDims('barrier', cls), width: HURDLE.width, depth: HURDLE.depth, height: HURDLE.height, flagH: HURDLE.flagH },
          flagSide: 'both',
        },
      }],
    };
  }
  if (type === 'upGate') {
    return {
      plan: null,
      items: [{
        type: 'diveGate',
        position: { x: a.x, y: a.y, z: 0 },
        yaw: opts.square ? wrapAngle(Math.round(defaultYawFor(doc, a) / (Math.PI / 2)) * (Math.PI / 2)) : defaultYawFor(doc, a),
        props: { dims: { ...defaultDims('diveGate', cls), sillH: UP_GATE.sillH }, pitch: UP_GATE.pitch },
      }],
    };
  }
  return { plan: null, items: [] };
}
