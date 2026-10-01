/*
 * scale.js: the numbers that change with the size of the room.
 *
 * The room's gestures were written for a whoop hall, where a gate is 0.71 m
 * across and a magnet that reaches three inches is the width of a hand. They
 * are the same gestures on a five inch field, where a gate is 1.5 m across, a
 * wall of five of them is nine metres long and a track is forty metres wide.
 * What differs is a length, and the lengths are here, in one place, so the
 * gesture code asks "how far does a magnet reach" and never "which class is
 * this". The whoop's values are the ones it has always had, so asking this
 * module for a whoop canvas is not a change to the whoop.
 *
 * Units are metres, and so is every reading on a five inch canvas: the plan is
 * dimensioned in them and so is the rule box of the track this was built for.
 * A whoop canvas keeps inches, with the millimetres beside them, because its
 * rules are written in inches (racegow.js).
 *
 * Pure, like the builder's other data modules: no DOM, no Three.js.
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

import { trackClassOf } from './elements.js';
import { inches } from './racegow.js';

const IN = 0.0254;

/* The whoop hall, as it has always been. */
const WHOOP = {
  metric: false,
  /* How near, on the floor, a piece has to be to a legal spot for a magnet to take it. */
  magnet: 3 * IN,
  /* How near the ruler has to be to the middle of a piece to take the middle. */
  rulerReach: 6 * IN,
  /* A step of the arrow keys with Shift. */
  nudgeBig: 6 * IN,
  /* The ring at a selected gate's foot: how far outside the opening, how wide the line is, how wide the band
   * that is hit, and the knob that is pulled. */
  ring: { pad: 0.32, line: 0.012, grab: 0.07, knob: 0.05 },
  /* How near the camera may come, and the margins round the track Fit frames. */
  nearest: 0.6,
  frame: { margin: 0.45, least: 1.6 },
  /* How much fatter than the pipe the stand-in a gate is picked by is, in metres across: 26.7 mm of PVC
   * becomes about 8 cm to hit. */
  pickPipe: 0.055,
  /* The height a measure between two gates is drawn at. */
  measureH: 0.3556,
  /* The camera a room opens at, three quarters from the front left. */
  angle: { theta: (3 * Math.PI) / 4, phi: 0.85 },
};

/* The five inch field. */
const FIELD = {
  metric: true,
  magnet: 0.35,
  rulerReach: 0.6,
  nudgeBig: 0.25,
  ring: { pad: 0.55, line: 0.035, grab: 0.2, knob: 0.13 },
  nearest: 2,
  frame: { margin: 4, least: 16 },
  /* A 33 mm tube seen from the distance that shows a whole track is no pixels at all. */
  pickPipe: 0.16,
  measureH: 1.2,
  /* From the south, a little to the west and steeper, so a plan's north is the far side of the room and a track
   * fills more of the picture than it does from the angle a hall is looked at from. */
  angle: { theta: Math.PI / 2 + 0.4, phi: 1.0 },
};

/* The numbers for the class of a document. */
export function scaleOf(doc) {
  return trackClassOf(doc) === 'micro' ? WHOOP : FIELD;
}

/* A length as this canvas says it: metres, to the centimetre, on a field; inches
 * and millimetres in a hall. */
export function say(doc, metres) {
  if (!scaleOf(doc).metric) {
    return inches(metres);
  }
  const m = Math.abs(metres);
  const shown = m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2);
  /* Only after a decimal point: "100" has no point, and its zeros are the number. */
  return `${shown.includes('.') ? shown.replace(/\.?0+$/, '') : shown} m`;
}
