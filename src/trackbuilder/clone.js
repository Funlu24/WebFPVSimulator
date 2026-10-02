/*
 * clone.js: Duplicate, on a freestyle map. Pure: no DOM, no Three.js, so
 * src/trackbuilder/selftest.js runs all of it in Node.
 *
 * WHY THIS IS NOT copyElements. A reporter on 1 October 2026 asked the map
 * builder for "a clone function to duplicate objects" (bug-e605ff6a). The
 * builder had one, Control D and a Copy button, and neither reached a map:
 * both were written for the room a track is built in, and a map keeps the
 * plan and the orbiting preview it has, so `buildsIn3D` is false for it and
 * the key was "left to the browser", which bookmarks the page. A copy of a
 * track is also a copy in the FLYING ORDER, and a map has none, so
 * copyElements in ./snap.js was not a thing that could simply be switched on:
 * it would have put a copied gate into a sequence a map never has.
 *
 * WHERE A COPY GOES. Beside what it copies, clear of it, measured by the
 * ground each piece really covers (planShapeOf, the polygon the plan draws and
 * picks by). The track's rule reaches as far as a piece's `width`, `depth` or
 * opening, which is nothing at all for a crane, whose size is a jib: a crane
 * copied by that rule would have landed on itself. Several pieces move as one,
 * to the east of all of them past a gap, so the copies keep the layout they
 * were selected in. East is tried first, then west, north and south, and the
 * first side the whole copy fits on the plot on is the one used; a plot with
 * no room on any side gets the east, where it can be dragged to a place.
 *
 * WHAT IS LEFT OUT. The start pads, because a map has exactly one set. A
 * vehicle is not copied beside itself but ONTO ITS ROAD, a car's length and a
 * gap further along, because where a car is comes from its road and its
 * offset (schema.md) and a plan position would be a number nothing reads.
 * A car copied WITH its road rides the road's copy instead, at its own
 * offset, so a road and its traffic copy as one.
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

import { KIND } from './elements.js';
import {
  deepClone, elementById, kindOf, newElementId, newGroupId,
} from './model.js';
import { planShapeOf } from './view2d.js';
import { vehiclePlace } from './roadtool.js';

/* Metres between a copy and what it copies. The track's own gap. */
export const CLONE_GAP = 1.5;

/* Metres between a car's bumper and the bumper of the copy of it. */
export const CLONE_CAR_GAP = 3;

const round6 = (v) => Math.round(v * 1e6) / 1e6;

/* The plan rectangle that holds the ground every one of `els` covers. */
function reachOf(doc, els) {
  let box = null;
  for (const el of els) {
    for (const p of planShapeOf(el, doc)) {
      box = box
        ? {
          minX: Math.min(box.minX, p.x), maxX: Math.max(box.maxX, p.x),
          minY: Math.min(box.minY, p.y), maxY: Math.max(box.maxY, p.y),
        }
        : { minX: p.x, maxX: p.x, minY: p.y, maxY: p.y };
    }
  }
  return box;
}

/*
 * How far a copy of `els` moves: { x, y }, in metres on the plan. `box` is
 * what reachOf measured. The sides, in order: east, west, north, south. A
 * side is taken when the moved rectangle lies inside the plot, and the east
 * is the answer when none does.
 */
export function cloneOffsetFor(doc, els) {
  const box = reachOf(doc, els);
  if (!box) {
    return { x: CLONE_GAP, y: 0 };
  }
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const sides = [
    { x: w + CLONE_GAP, y: 0 },
    { x: -(w + CLONE_GAP), y: 0 },
    { x: 0, y: h + CLONE_GAP },
    { x: 0, y: -(h + CLONE_GAP) },
  ];
  const W = doc.field.width;
  const D = doc.field.depth;
  /* A piece may already stand a little over the plot's edge: a roof's aerial
   * or a sign reaches 0.4 m past a building set close to it, and a plan that
   * said the copy had to be wholly inside would turn every side down for a
   * piece that is itself not. A copy is held to what the original is, no
   * further out on any side. */
  const overW = Math.max(0, -box.minX);
  const overE = Math.max(0, box.maxX - W);
  const overS = Math.max(0, -box.minY);
  const overN = Math.max(0, box.maxY - D);
  /* A micrometre of slack: `D + (maxY - D)` is not always `maxY`, and a
   * piece standing exactly as far out as it did must not be turned down by
   * the last bit of a double. */
  const eps = 1e-6;
  for (const s of sides) {
    if (box.minX + s.x >= -overW - eps && box.maxX + s.x <= W + overE + eps
      && box.minY + s.y >= -overS - eps && box.maxY + s.y <= D + overN + eps) {
      return s;
    }
  }
  return sides[0];
}

/*
 * COPY `ids`, in place, and return what was made: { made, left }. `made` is
 * the new ids, in the order the originals stand in the document; `left` is
 * the ids that were asked for and not copied, the start pads.
 *
 * The document is changed, so it must be one the caller owns: the builder's
 * edit() hands this a copy it can throw away, as it does every edit.
 */
export function cloneElements(doc, ids) {
  const wanted = new Set(ids);
  const sources = doc.elements.filter((el) => wanted.has(el.id));
  const left = sources.filter((el) => kindOf(el) === KIND.START).map((el) => el.id);
  const pieces = sources.filter((el) => ![KIND.START, KIND.VEHICLE].includes(kindOf(el)));
  const made = [];
  /* Measured BEFORE the first copy goes in, so the copies do not move the
   * answer. */
  const shift = pieces.length ? cloneOffsetFor(doc, pieces) : null;
  /* A copy of a group is a group of its own, or moving either would move
   * both. The name is taken as soon as the copy is in the document, so the
   * next group of a copy of several gets another. */
  const groups = new Map();
  /* Each road copied, its copy's id by the original's, for the cars below. */
  const roads = new Map();
  const cars = [];
  for (const src of sources) {
    if (left.includes(src.id)) {
      continue;
    }
    const copy = deepClone(src);
    copy.id = newElementId(doc);
    if (kindOf(src) === KIND.VEHICLE) {
      cars.push([src, copy]);
    } else {
      copy.position.x = round6(src.position.x + shift.x);
      copy.position.y = round6(src.position.y + shift.y);
    }
    if (kindOf(src) === KIND.ROAD) {
      roads.set(src.id, copy.id);
    }
    /* A named gap's name is what it scores as, and a copy of it is the same
     * window somewhere else. Everything else is told apart by its type. */
    copy.name = kindOf(src) === KIND.ZONE ? src.name : '';
    if (src.group) {
      if (!groups.has(src.group)) {
        groups.set(src.group, newGroupId(doc));
      }
      copy.group = groups.get(src.group);
    }
    doc.elements.push(copy);
    made.push(copy.id);
  }
  /*
   * THE CARS, once every road copied with them is in, because a car names
   * its road by id and may stand before it in the document. A car whose road
   * was copied with it rides the road's copy at its own offset (deepClone
   * kept it), so a road and its traffic copy as one and the road they were
   * copied from keeps the cars it had. Any other car goes further along its
   * own road, and one with no road is parked in a row, its copy taking the
   * next place in it.
   */
  for (const [src, copy] of cars) {
    if (roads.has(src.road)) {
      copy.road = roads.get(src.road);
    } else {
      const car = vehiclePlace(doc, src);
      copy.dims.offset = round6((Number(src.dims.offset) || 0) + car.length + CLONE_CAR_GAP);
    }
  }
  return { made, left };
}

/* Whether anything in `ids` can be copied, for a button that would do
 * nothing: the start pads are the only thing that cannot. */
export function anyCloneable(doc, ids) {
  return ids.some((id) => {
    const el = elementById(doc, id);
    return el && kindOf(el) !== KIND.START;
  });
}
