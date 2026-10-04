/*
 * letters.js: the capital letters as pipe, and the holes in them that a pilot flies through.
 *
 * WHY. The WA State Champs have a W on the course, built of pipe, and the gate is the gap between its
 * two Vs. That is a gate of a kind this builder had no word for: its hole is a triangle standing on the
 * ground, its frame is four strokes and not four sides, and nothing about it is a rectangle. A letter is
 * the general case of that, so every capital from A to Z is here, each one a run of straight tubes (the
 * way a person builds a letter out of PVC, with a chamfer where a curve would be) and one to three holes
 * that score.
 *
 * WHAT A LETTER IS MADE OF. Strokes and holes, in a design grid ten units tall.
 *
 *   stroke   a run of points joined end to end: each pair is one tube, each point a joint. The point is
 *            the tube's centre line, so every length here is axis to axis.
 *   hole     a polygon, counter clockwise, whose corners are on the strokes' centre lines, with the edges
 *            that are NOT pipe listed in `free`: the ground, or the open side of a C, which is closed
 *            across by nothing at all. The hole the pilot sees is that polygon pushed in by a pipe's
 *            radius from every edge that is pipe (insetPolygon), so the shape that scores is the shape
 *            that is drawn and the shape that is solid, which is what src/props/aperture.js says of every
 *            other opening.
 *   names    what each hole is called, in the same order, for the strip and the card.
 *   at       a point in the hole where the racing line goes through it. Left out, it is the hole's
 *            centre of area, which for a triangle is a third of the way up, where it is widest. A hole
 *            that is not convex says it, because the centre of area of an M's is in the pipe.
 *   primary  the hole a new pass goes through, and the one that SIZES the letter: see layoutLetter.
 *
 * THE WHOLE LETTER FOLLOWS ITS PRIMARY HOLE. The document has always described an opening by clearW and
 * clearH, and every reader of one (the envelope, the rules, the cards, the board's plan) reads those two
 * numbers and nothing else. A letter keeps them: they are the size of its primary hole, measured axis to
 * axis, and the rest of the letter is drawn round it in the proportions of the design grid. A W set to
 * 2.45 m by 3.15 m is a W 4.9 m wide and 3.5 m tall, which is what a W is. Each axis scales on its own,
 * so a letter can be made narrower or taller than the type draws it.
 *
 * THE FRAME. x is across the letter and is the pilot's RIGHT as they fly along the piece's normal, the way
 * they approach it when its entry is +1, so a letter reads the right way round from the side it is flown in
 * from. y is up from the ground. The origin is the middle of the primary hole's width, on the ground, which
 * is where the piece stands: its `position` is the foot of that line. Every other hole may stand to one side
 * of it (an N's two triangles do), so a hole has its own x as well as its own height.
 *
 * STANDING ON THE GROUND. A point at design height zero is a foot: it is lifted by one tube radius, so the
 * tube rests on the ground and is not half buried in it.
 *
 * PURE. No DOM, no Three.js, and nothing is a sine or a cosine: only arithmetic and square roots, which
 * are correctly rounded everywhere, so a letter's capsules are the same bits in every engine, as the
 * simulator's determinism asks of anything that reaches the world.
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
  insetPolygon, insidePolygon, mirrorPolygon, polygonArea, polygonBounds,
} from './aperture.js';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/* The letter a piece is when its letter is missing or is not one of these. */
export const LETTER_DEFAULT = 'A';

/*
 * How many metres one unit of the design grid is, which makes a capital ten units tall 3.5 m. That is
 * the height a letter is built at until its author says otherwise: a W 3.5 m tall is 4.9 m across and
 * its gate is 2.45 m wide on the ground and 3.15 m to the point, a little larger than the 1.52 m square a
 * standard gate is, which is what a gate in a letter has to be to be as easy to fly.
 */
export const GRID = 0.35;

/* The most holes any letter has. */
export const OPENINGS_MAX = 3;

const pts = (s) => s.trim().split(/\s+/).map((p) => p.split(',').map(Number));

/*
 * THE TWENTY SIX.
 *
 * Each is drawn on a grid ten units tall with its left edge at zero. Where a letter has a bar across
 * it, the bar's ends are on the strokes they join. Where it has a curve, it has a chamfer of two units.
 * The holes are listed in the order a person would count them from the ground up, and where two are at
 * one height, from left to right as the letter is read; the order is made sure of below, so a fault in
 * this list is caught, not trusted.
 */
const DESIGN = {
  A: {
    strokes: ['0,0 5,10 10,0', '1.75,3.5 8.25,3.5'],
    names: ['under the bar', 'counter'],
    holes: [
      { pts: '0,0 10,0 8.25,3.5 1.75,3.5', free: [0], at: [5, 1.75] },
      { pts: '1.75,3.5 8.25,3.5 5,10', primary: true },
    ],
  },
  B: {
    strokes: ['0,0 0,10', '0,10 5,10 7,8 7,7 5,5 0,5', '0,5 5,5 7,3 7,2 5,0 0,0'],
    names: ['lower bowl', 'upper bowl'],
    holes: [
      { pts: '0,0 5,0 7,2 7,3 5,5 0,5', primary: true },
      { pts: '0,5 5,5 7,7 7,8 5,10 0,10' },
    ],
  },
  C: {
    strokes: ['8,8 6,10 2,10 0,8 0,2 2,0 6,0 8,2'],
    names: ['inside'],
    holes: [
      { pts: '2,0 6,0 8,2 8,8 6,10 2,10 0,8 0,2', free: [2], primary: true },
    ],
  },
  D: {
    strokes: ['0,0 0,10', '0,10 6,10 8,8 8,2 6,0 0,0'],
    names: ['bowl'],
    holes: [
      { pts: '0,0 6,0 8,2 8,8 6,10 0,10', primary: true },
    ],
  },
  E: {
    strokes: ['0,0 0,10', '0,10 7,10', '0,5 6,5', '0,0 7,0'],
    names: ['lower gap', 'upper gap'],
    holes: [
      { pts: '0,0 6,0 6,5 0,5', free: [1], primary: true },
      { pts: '0,5 6,5 6,10 0,10', free: [1] },
    ],
  },
  F: {
    strokes: ['0,0 0,10', '0,10 7,10', '0,5 6,5'],
    names: ['under the middle bar', 'upper gap'],
    holes: [
      { pts: '0,0 6,0 6,5 0,5', free: [0, 1] },
      { pts: '0,5 6,5 6,10 0,10', free: [1], primary: true },
    ],
  },
  G: {
    strokes: ['8,8 6,10 2,10 0,8 0,2 2,0 6,0 8,2 8,5 4,5'],
    names: ['below the bar', 'above the bar'],
    holes: [
      { pts: '0,2 2,0 6,0 8,2 8,5 4,5 0,5', free: [5], primary: true },
      { pts: '0,5 4,5 8,5 8,8 6,10 2,10 0,8', free: [0, 2] },
    ],
  },
  H: {
    strokes: ['0,0 0,10', '7,0 7,10', '0,5 7,5'],
    names: ['under the bar', 'over the bar'],
    holes: [
      { pts: '0,0 7,0 7,5 0,5', free: [0], primary: true },
      { pts: '0,5 7,5 7,10 0,10', free: [2] },
    ],
  },
  I: {
    strokes: ['0,10 9,10', '0,0 9,0', '4.5,0 4.5,10'],
    names: ['left side', 'right side'],
    holes: [
      { pts: '0,0 4.5,0 4.5,10 0,10', free: [3], primary: true },
      { pts: '4.5,0 9,0 9,10 4.5,10', free: [1] },
    ],
  },
  J: {
    strokes: ['2,10 8,10', '6,10 6,2 4,0 2,0 0,2 0,5'],
    names: ['hook'],
    holes: [
      { pts: '0,2 2,0 4,0 6,2 6,5 0,5', free: [4], primary: true },
    ],
  },
  K: {
    strokes: ['0,0 0,10', '8,10 0,4', '2,5.5 8,0'],
    names: ['under the arm', 'above the arm'],
    holes: [
      { pts: '0,0 8,0 2,5.5 0,4', free: [0], primary: true, at: [2.5, 2.5] },
      { pts: '0,4 8,10 0,10', free: [1], at: [2, 8] },
    ],
  },
  L: {
    strokes: ['0,10 0,0 7,0'],
    names: ['corner'],
    holes: [
      { pts: '0,0 7,0 7,6 0,6', free: [1, 2], primary: true },
    ],
  },
  M: {
    strokes: ['0,0 0,10 5.5,4 11,10 11,0'],
    names: ['under the V', 'in the V'],
    holes: [
      { pts: '0,0 11,0 11,10 5.5,4 0,10', free: [0], primary: true, at: [5.5, 2] },
      { pts: '0,10 5.5,4 11,10', free: [2], at: [5.5, 7.5] },
    ],
  },
  N: {
    strokes: ['0,0 0,10 8,0 8,10'],
    names: ['lower left', 'upper right'],
    holes: [
      { pts: '0,0 8,0 0,10', free: [0], primary: true, at: [2.6, 2.6] },
      { pts: '8,0 8,10 0,10', free: [1], at: [5.4, 7.4] },
    ],
  },
  O: {
    strokes: ['2,0 6,0 8,2 8,8 6,10 2,10 0,8 0,2 2,0'],
    names: ['inside'],
    holes: [
      { pts: '2,0 6,0 8,2 8,8 6,10 2,10 0,8 0,2', primary: true },
    ],
  },
  P: {
    strokes: ['0,0 0,10', '0,10 6,10 8,8 8,6.5 6,4.5 0,4.5'],
    names: ['bowl'],
    holes: [
      { pts: '0,4.5 6,4.5 8,6.5 8,8 6,10 0,10', primary: true },
    ],
  },
  Q: {
    strokes: ['2,0 6,0 8,2 8,8 6,10 2,10 0,8 0,2 2,0', '7,1 9.5,0'],
    names: ['inside'],
    holes: [
      { pts: '2,0 6,0 8,2 8,8 6,10 2,10 0,8 0,2', primary: true },
    ],
  },
  R: {
    strokes: ['0,0 0,10', '0,10 6,10 8,8 8,6.5 6,4.5 0,4.5', '4,4.5 8,0'],
    names: ['under the bowl', 'bowl'],
    holes: [
      { pts: '0,0 8,0 4,4.5 0,4.5', free: [0], at: [2.2, 2.2] },
      { pts: '0,4.5 6,4.5 8,6.5 8,8 6,10 0,10', primary: true },
    ],
  },
  S: {
    strokes: ['8,8 6,10 2,10 0,8 0,7 2,5 6,5 8,3 8,2 6,0 2,0 0,2'],
    names: ['lower curve', 'upper curve'],
    holes: [
      { pts: '0,2 2,0 6,0 8,2 8,3 6,5 2,5', free: [6], primary: true },
      { pts: '2,5 6,5 8,8 6,10 2,10 0,8 0,7', free: [1] },
    ],
  },
  T: {
    strokes: ['0,10 9,10', '4.5,0 4.5,10'],
    names: ['left of the stem', 'right of the stem'],
    holes: [
      { pts: '0,0 4.5,0 4.5,10 0,10', free: [0, 3], primary: true },
      { pts: '4.5,0 9,0 9,10 4.5,10', free: [0, 1] },
    ],
  },
  U: {
    strokes: ['0,10 0,2 2,0 6,0 8,2 8,10'],
    names: ['inside'],
    holes: [
      { pts: '0,2 2,0 6,0 8,2 8,10 0,10', free: [4], primary: true },
    ],
  },
  V: {
    strokes: ['0,10 5,0 10,10'],
    names: ['inside'],
    holes: [
      { pts: '5,0 10,10 0,10', free: [1], primary: true, at: [5, 7] },
    ],
  },
  /*
   * THE OWNER'S LETTER. Two Vs side by side, sharing the stroke between them, and the gate is the gap
   * between the Vs: the triangle under the middle point, standing on the ground, the whole 2.45 m of its
   * base. The point is a little under the tops (nine units to the tops' ten), and the two notches the Vs
   * make on the outside are not holes: there is nothing to fly through at the top of a V.
   */
  W: {
    strokes: ['0,10 3.5,0 7,9 10.5,0 14,10'],
    names: ['between the Vs'],
    holes: [
      { pts: '3.5,0 10.5,0 7,9', free: [0], primary: true },
    ],
  },
  X: {
    strokes: ['0,10 9,0', '0,0 9,10'],
    names: ['under the cross', 'over the cross'],
    holes: [
      { pts: '0,0 9,0 4.5,5', free: [0], primary: true },
      { pts: '4.5,5 9,10 0,10', free: [1] },
    ],
  },
  Y: {
    strokes: ['0,10 4.5,5 9,10', '4.5,5 4.5,0'],
    names: ['lower left', 'lower right', 'in the Y'],
    holes: [
      { pts: '0,0 4.5,0 4.5,5 0,10', free: [0, 3], at: [1.8, 3.6] },
      { pts: '4.5,0 9,0 9,10 4.5,5', free: [0, 1], at: [7.2, 3.6] },
      { pts: '4.5,5 9,10 0,10', free: [1], primary: true, at: [4.5, 8] },
    ],
  },
  Z: {
    strokes: ['0,10 8,10 0,0 8,0'],
    names: ['lower right', 'upper left'],
    holes: [
      { pts: '0,0 8,0 8,10', free: [1], primary: true, at: [5.4, 2.6] },
      { pts: '0,0 8,10 0,10', free: [2], at: [2.6, 7.4] },
    ],
  },
};

/* How far a point is from a segment, to the nearest point of it. */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/*
 * WHETHER A HOLE PUSHED IN BY ITS PIPE IS STILL A HOLE. Pushing the sides of a polygon in past its middle turns it inside
 * out, and a polygon with an even number of sides turned inside out has the same sign of area it had, so the area says
 * nothing: an O made too small for its pipe came out as a smaller octagon the wrong way up, and scored. What does say it
 * is where the corners are: a hole that is still a hole has every corner at least the push from every side that was
 * pushed, and one turned inside out has corners beyond the opposite sides. `push` is the distance each edge was moved.
 */
function heldOff(poly, nominal, push) {
  const n = nominal.length;
  const edge = (i) => [nominal[i], nominal[(i + 1) % n]];
  for (const p of poly) {
    /* A corner on a side that was not pushed is where the pipe stops and the open side or the ground begins: the step
     * the push leaves there ends at the tube's own axis, which is no nearer the pipe than a hole may be. */
    if (push.some((d, j) => d === 0 && segmentDistance(p, ...edge(j)) < 1e-9)) {
      continue;
    }
    for (let i = 0; i < n; i += 1) {
      if (push[i] > 0 && segmentDistance(p, ...edge(i)) < push[i] - 1e-9) {
        return false;
      }
    }
  }
  return true;
}

/* The centre of area of a polygon: for a convex hole, always inside it. */
function centroidOf(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const w = x0 * y1 - x1 * y0;
    a += w;
    cx += (x0 + x1) * w;
    cy += (y0 + y1) * w;
  }
  return a === 0 ? [poly[0][0], poly[0][1]] : [cx / (3 * a), cy / (3 * a)];
}

/*
 * The design, read once into numbers, with the holes put in order and the primary found. A letter's
 * `openings` are what the rest of the build calls them: the pass of a flying order names one by its
 * place in this list.
 */
const GLYPHS = {};
for (const letter of LETTERS) {
  const raw = DESIGN[letter];
  const strokes = raw.strokes.map(pts);
  const holes = raw.holes.map((h, i) => {
    const poly = pts(h.pts);
    const free = new Set(h.free ?? []);
    return {
      name: raw.names[i],
      poly,
      /* The push each edge gets: a pipe's radius, or nothing. 1 and 0 here, the radius there. */
      pipe: poly.map((_, k) => (free.has(k) ? 0 : 1)),
      at: h.at ?? centroidOf(poly),
      primary: h.primary === true,
      authored: i,
    };
  });
  holes.sort((a, b) => (a.at[1] - b.at[1]) || (a.at[0] - b.at[0]));
  const primary = Math.max(0, holes.findIndex((h) => h.primary));
  const all = strokes.flat();
  GLYPHS[letter] = Object.freeze({
    letter,
    strokes,
    holes,
    primary,
    /* The design's own extent, from the strokes' centre lines. */
    width: Math.max(...all.map((p) => p[0])) - Math.min(...all.map((p) => p[0])),
    left: Math.min(...all.map((p) => p[0])),
    height: Math.max(...all.map((p) => p[1])),
  });
}

/* Whether a word is one of the twenty six. */
export function isLetter(word) {
  return typeof word === 'string' && Object.prototype.hasOwnProperty.call(GLYPHS, word);
}

/* A letter, as it is written in a document: the first character, in capitals, or the default one. */
export function letterOf(word) {
  const first = typeof word === 'string' ? word.trim().charAt(0).toUpperCase() : '';
  return isLetter(first) ? first : LETTER_DEFAULT;
}

/* The design of a letter, which is read only. Null for anything that is not one. */
export function glyphOf(letter) {
  return isLetter(letter) ? GLYPHS[letter] : null;
}

/* What a hole is called, for the strip and the card: "between the Vs", "counter", "upper bowl". */
export function openingName(letter, index) {
  const glyph = glyphOf(letter) ?? GLYPHS[LETTER_DEFAULT];
  return glyph.holes[Math.max(0, Math.min(glyph.holes.length - 1, Math.round(index ?? 0)))].name;
}

/* How many holes a letter has. */
export function openingCount(letter) {
  return (glyphOf(letter) ?? GLYPHS[LETTER_DEFAULT]).holes.length;
}

/* Which hole a new pass goes through, and the one the letter's size is the size of. */
export function primaryOpening(letter) {
  return (glyphOf(letter) ?? GLYPHS[LETTER_DEFAULT]).primary;
}

/* The box a hole's centre line polygon lies in, in design units. */
function designBox(glyph, k) {
  return polygonBounds(glyph.holes[k].poly);
}

/*
 * THE SIZE A LETTER STARTS AT: the primary hole at GRID metres to the unit, as { clearW, clearH }. The
 * document stores these two and the rest of the letter follows.
 */
export function letterDefaults(letter) {
  const glyph = glyphOf(letter) ?? GLYPHS[LETTER_DEFAULT];
  const box = designBox(glyph, glyph.primary);
  return { clearW: (box.x1 - box.x0) * GRID, clearH: (box.y1 - box.y0) * GRID };
}

/*
 * THE WHOLE LETTER'S SIZE, from the size of its primary hole: how wide and how tall it stands, with its
 * pipe, for a pipe of outside diameter `tube`. The inspector shows these and sets them, because the
 * author is thinking of a letter and not of a hole; `dimsForLetterSize` is the way back.
 */
export function letterSizeOf(letter, clearW, clearH, tube = 0) {
  const glyph = glyphOf(letter) ?? GLYPHS[LETTER_DEFAULT];
  const box = designBox(glyph, glyph.primary);
  const sx = clearW / (box.x1 - box.x0);
  const sy = clearH / (box.y1 - box.y0);
  return { width: glyph.width * sx + tube, height: glyph.height * sy + tube * 0.5 };
}

export function dimsForLetterSize(letter, width, height, tube = 0) {
  const glyph = glyphOf(letter) ?? GLYPHS[LETTER_DEFAULT];
  const box = designBox(glyph, glyph.primary);
  const sx = Math.max(0, width - tube) / glyph.width;
  const sy = Math.max(0, height - tube * 0.5) / glyph.height;
  return { clearW: (box.x1 - box.x0) * sx, clearH: (box.y1 - box.y0) * sy };
}

/*
 * THE LETTER, LAID OUT: where every tube, joint and hole is, for a primary hole `clearW` by `clearH` and a
 * pipe `tubeR` in radius, in the letter's own frame (see above). Everything a reader needs and nothing
 * that knows about a renderer, so the game builds its mesh and its colliders from it, the builder draws
 * it, and a flight check flies against it, from the same numbers.
 *
 *   tubes     [[ [x, y], [x, y] ]]  every straight length of pipe, axis to axis
 *   joints    [[x, y]]              where two lengths meet, or one ends
 *   openings  the holes, in order from the ground up, each
 *               index, poly     the hole as the pilot sees it: its edge on the pipe's inner surface
 *               nominal         the same hole axis to axis, before the push
 *               cx, cy          where the racing line goes through it
 *               clearW, clearH  its design box at this scale, which the primary's is the document's own
 *               sillH           the lowest point of it
 *               ok              false when the push left it with no area: the hole is too small for the pipe
 *   primary   which of them sizes the letter
 *   width, height, left, right, top   the extent of the pipe, the outside of the tubes
 *
 * `mirror` turns the whole letter about its vertical axis, which is how the builder (whose x runs the
 * other way from a pilot's right) and a station flown against the piece's normal read it.
 */
export function layoutLetter(letter, clearW, clearH, tubeR, opts = {}) {
  const glyph = glyphOf(letter) ?? GLYPHS[LETTER_DEFAULT];
  const box = designBox(glyph, glyph.primary);
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const sx = bw > 0 && clearW > 0 ? clearW / bw : 0;
  const sy = bh > 0 && clearH > 0 ? clearH / bh : 0;
  const ox = (box.x0 + box.x1) / 2;
  /* A foot is lifted by a radius: the tube rests on the ground. The ground itself is y = 0. */
  const at = ([x, y]) => [(x - ox) * sx, y === 0 ? tubeR : y * sy];
  const flip = opts.mirror === true;
  const turnPoint = (p) => (flip ? [-p[0], p[1]] : p);

  const tubes = [];
  const joints = [];
  const seen = new Set();
  const joint = (p) => {
    const key = `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
    if (!seen.has(key)) {
      seen.add(key);
      joints.push(p);
    }
  };
  for (const stroke of glyph.strokes) {
    for (let i = 0; i < stroke.length; i += 1) {
      const p = turnPoint(at(stroke[i]));
      joint(p);
      if (i > 0) {
        const q = turnPoint(at(stroke[i - 1]));
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) {
          tubes.push([q, p]);
        }
      }
    }
  }

  const openings = glyph.holes.map((hole, index) => {
    const nominal = hole.poly.map(at);
    const push = hole.pipe.map((isPipe) => (isPipe ? tubeR : 0));
    const poly = insetPolygon(nominal, push);
    const dbox = polygonBounds(hole.poly);
    const anchor = at(hole.at);
    const out = {
      index,
      nominal: flip ? mirrorPolygon(nominal) : nominal,
      poly: flip ? mirrorPolygon(poly) : poly,
      cx: flip ? -anchor[0] : anchor[0],
      cy: anchor[1],
      clearW: (dbox.x1 - dbox.x0) * sx,
      clearH: (dbox.y1 - dbox.y0) * sy,
      ok: poly.length >= 3 && polygonArea(poly) > 1e-9 && heldOff(poly, nominal, push),
    };
    out.sillH = out.ok ? polygonBounds(out.poly).y0 : 0;
    return out;
  });

  const ends = [...tubes.flat(), ...joints];
  const xs = ends.map((p) => p[0]);
  const ys = ends.map((p) => p[1]);
  const left = xs.length ? Math.min(...xs) - tubeR : 0;
  const right = xs.length ? Math.max(...xs) + tubeR : 0;
  const top = ys.length ? Math.max(...ys) + tubeR : 0;
  return {
    letter: glyph.letter,
    tubeR,
    tubes,
    joints,
    openings,
    primary: glyph.primary,
    left,
    right,
    width: right - left,
    height: top,
    top,
  };
}

/*
 * WHICH HOLE A POINT IS NEAREST, for a click on a letter in the room or the plan: the hole it is inside
 * if it is inside one, else the one whose racing line point is nearest. (x, y) are in the letter's frame.
 */
export function nearestOpening(layout, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (const o of layout.openings) {
    if (o.ok && insidePolygon(o.poly, x, y)) {
      return o.index;
    }
    const d = Math.hypot(o.cx - x, o.cy - y);
    if (d < bestD) {
      bestD = d;
      best = o.index;
    }
  }
  return best;
}

/*
 * THE HOLE AS A STATION SCORES IT. The pass test (src/game/race.js) works in a frame whose origin is the
 * opening's own racing line point and whose x is across the opening, so the polygon comes out relative to
 * (cx, cy), and it is turned about the vertical axis when the pass is the other way to the one the
 * frame it came from is built for. The caller says which: layoutLetter's mirror option picks the frame a
 * layout is in, and a station flown the other way round than that frame's is turned.
 */
export function stationOpening(opening, mirror = false) {
  const flat = opening.poly.map(([x, y]) => [x - opening.cx, y - opening.cy]);
  return mirror ? mirrorPolygon(flat) : flat;
}

/*
 * THE WIDEST CIRCLE THAT FITS IN A POLYGON, as its diameter: how much room a gap really gives a quad, which a
 * bounding box does not say (a W's triangle is 2.45 m across its foot and a circle in it is 1.6 m). Found on a
 * grid, which is as exact as a flight needs: a quad is 0.35 m. Zero for a polygon with no corners.
 */
export function widestCircle(poly, steps = 40) {
  if (!poly || poly.length < 3) {
    return 0;
  }
  const near = segmentDistance;
  const b = polygonBounds(poly);
  const edges = poly.map((a, j) => [a, poly[(j + 1) % poly.length]]);
  let best = 0;
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const x = b.x0 + ((b.x1 - b.x0) * i) / steps;
      const y = b.y0 + ((b.y1 - b.y0) * j) / steps;
      if (insidePolygon(poly, x, y)) {
        best = Math.max(best, Math.min(...edges.map(([p, q]) => near([x, y], p, q))));
      }
    }
  }
  return best * 2;
}

/*
 * THE NARROWEST GAP A LETTER IS BUILT WITH BEFORE THE BUILDER SAYS SO, as the diameter of the widest circle in it.
 * The smallest gap any letter has at its default size is an A's, under the bar, at 1.16 m; a standard gate is 1.52 m.
 * Under this a gap is a good deal narrower than a gate, which is allowed and is said.
 */
export const GAP_ADVISORY = 0.9;

/*
 * A CHECK OF THE DESIGN, for the self test and for anybody changing a letter: the faults it finds, in
 * words, and none when the letter is sound. It is the reason the table above is not just trusted.
 *
 *   every hole is counter clockwise and has an edge list that fits it
 *   every pipe edge of a hole lies along a stroke, and no free edge does
 *   no stroke passes through the inside of a hole
 *   the holes are in order, and the primary is one of them
 *   at the default size, each hole survives the push, holds its racing line point and is wide enough to fly
 */
export function checkLetter(letter, tubeR = 0.03016, minRadius = 0.4) {
  const faults = [];
  const glyph = glyphOf(letter);
  if (!glyph) {
    return [`${letter} is not a letter`];
  }
  const near = segmentDistance;
  const onStroke = (p) => glyph.strokes.some((s) => s.some((q, i) => i > 0 && near(p, s[i - 1], q) < 1e-6));
  if (!glyph.strokes.length || glyph.strokes.some((s) => s.length < 2)) {
    faults.push('has a stroke with fewer than two points');
  }
  if (glyph.holes.length < 1 || glyph.holes.length > OPENINGS_MAX) {
    faults.push(`has ${glyph.holes.length} holes`);
  }
  glyph.holes.forEach((hole, k) => {
    const name = `hole ${k}`;
    if (polygonArea(hole.poly) <= 0) {
      faults.push(`${name} is not counter clockwise`);
      return;
    }
    hole.poly.forEach((a, i) => {
      const b = hole.poly[(i + 1) % hole.poly.length];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const along = onStroke(mid) && onStroke(a) && onStroke(b);
      if (hole.pipe[i] && !along) {
        faults.push(`${name} edge ${i} is called pipe and no stroke runs along it`);
      }
      if (!hole.pipe[i] && onStroke(mid) && onStroke(a) && onStroke(b)) {
        faults.push(`${name} edge ${i} is called free and a stroke runs along it`);
      }
    });
    for (const s of glyph.strokes) {
      for (let i = 1; i < s.length; i += 1) {
        for (const t of [0.15, 0.35, 0.5, 0.65, 0.85]) {
          const p = [s[i - 1][0] + (s[i][0] - s[i - 1][0]) * t, s[i - 1][1] + (s[i][1] - s[i - 1][1]) * t];
          const edge = hole.poly.some((a, j) => near(p, a, hole.poly[(j + 1) % hole.poly.length]) < 1e-6);
          if (!edge && insidePolygon(hole.poly, p[0], p[1])) {
            faults.push(`a stroke runs through ${name}`);
            return;
          }
        }
      }
    }
  });
  for (let k = 1; k < glyph.holes.length; k += 1) {
    const a = glyph.holes[k - 1].at;
    const b = glyph.holes[k].at;
    if (b[1] < a[1] - 1e-9 || (Math.abs(b[1] - a[1]) <= 1e-9 && b[0] < a[0])) {
      faults.push('the holes are not in order from the ground up');
    }
  }
  const d = letterDefaults(letter);
  const laid = layoutLetter(letter, d.clearW, d.clearH, tubeR);
  laid.openings.forEach((o, k) => {
    if (!o.ok) {
      faults.push(`hole ${k} has no area once the pipe is pushed out of it`);
      return;
    }
    if (!insidePolygon(o.poly, o.cx, o.cy)) {
      faults.push(`hole ${k}'s racing line point is not in it`);
    }
    for (const p of o.poly) {
      if (!insidePolygon(o.nominal, p[0], p[1]) && !o.nominal.some((n) => Math.hypot(n[0] - p[0], n[1] - p[1]) < 1e-9)) {
        faults.push(`hole ${k} grew when the pipe was pushed out of it`);
        break;
      }
    }
    const across = widestCircle(o.poly);
    if (across < minRadius * 2) {
      faults.push(`hole ${k} is too small to fly: the widest circle in it is ${across.toFixed(2)} m across`);
    }
  });
  return faults;
}
