/*
 * glyphs.js: a picture of a figure, computed from the figure.
 *
 * The card that offers a manoeuvre shows what it does, and what it does is its curve (manoeuvres.js), so the
 * picture is that curve drawn small: the same points and the same tangents, joined the way the line joins
 * them, seen from above for a flat turn, from the side for a loop and from a slant for a climbing turn or a
 * corkscrew. Nothing is drawn by hand, so a change to a figure changes its picture, and the picture of
 * "Turn left 180" and of "Turn right 180" are mirror images because the curves are.
 *
 * Pure, so it runs in Node and the self test can hold it to its box: the path is drawn in a 72 by 52 box and
 * never leaves it.
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

import { curveOf, specOf } from './manoeuvres.js';

export const GLYPH_W = 72;
export const GLYPH_H = 52;
const PAD = 7;

/*
 * How each figure is seen: 'plan' from above, 'side' from the side, 'coil' from a slant with its sideways and vertical
 * reach drawn larger than it is, because a roll twenty metres long and a metre wide is a wave and not a corkscrew
 * unless it is. A climbing or descending turn is a plan, a turn, with a small arrow that says up or down.
 */
function viewOf(spec) {
  if (spec.id === 'straight') {
    return spec.bias === 'up' || spec.bias === 'down' ? 'side' : 'plan';
  }
  if (['turn', 'climb', 'descend', 'slalom', 'fig8'].includes(spec.id)) {
    return 'plan';
  }
  return spec.id === 'corkscrew' ? 'coil' : 'side';
}

/* The small arrow a picture carries when height is the point of the figure. */
function badgeOf(spec) {
  if (spec.id === 'climb') {
    return 'up';
  }
  if (spec.id === 'descend') {
    return 'down';
  }
  return null;
}

/* A curve point as it is seen: x along the way it goes, y up the picture, in metres. */
function project(view, p) {
  if (view === 'plan') {
    return { x: p.u, y: p.v };
  }
  if (view === 'side') {
    return { x: p.u, y: p.w };
  }
  return { x: p.u, y: 3.5 * (p.w + 0.7 * p.v) };
}

/* The tangent as it is seen, for the Hermite that joins the points. */
function projectTangent(view, p) {
  return project(view, { u: p.tu, v: p.tv, w: p.tw });
}

/* The Hermite between two seen points, sampled, in the same way path.js joins knots: a tangent a tenth longer than the chord. */
function hermite(a, b, steps) {
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const norm = (t) => {
    const m = Math.hypot(t.x, t.y) || 1;
    return { x: (t.x / m) * chord * 1.1, y: (t.y / m) * chord * 1.1 };
  };
  const m0 = norm(a.t);
  const m1 = norm(b.t);
  const out = [];
  for (let k = 1; k <= steps; k += 1) {
    const t = k / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    out.push({
      x: h00 * a.x + h10 * m0.x + h01 * b.x + h11 * m1.x,
      y: h00 * a.y + h10 * m0.y + h01 * b.y + h11 * m1.y,
    });
  }
  return out;
}

/*
 * THE PICTURE OF A FIGURE: { d, start, end, angle, view } with `d` an SVG path in the 72 by 52 box, `start` where
 * the line comes in, `end` where it goes out and `angle` the way it goes out, in screen radians, for an arrowhead.
 * The line is drawn from a short run in before the figure so that it is seen coming in.
 */
export function figureGlyph(raw, cls = 'full') {
  const spec = specOf(raw);
  const curve = curveOf(spec, cls);
  const view = viewOf(spec);
  const lead = { u: -1.5, v: 0, w: 0, tu: 1, tv: 0, tw: 0 };
  const origin = { u: 0, v: 0, w: 0, tu: 1, tv: 0, tw: 0 };
  const chain = [lead, origin, ...curve.points];
  const seen = chain.map((p) => ({ ...project(view, p), t: projectTangent(view, p) }));
  const pts = [seen[0]];
  for (let i = 1; i < seen.length; i += 1) {
    pts.push(...hermite(seen[i - 1], seen[i], 8));
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const k = Math.min((GLYPH_W - 2 * PAD) / Math.max(1e-6, maxX - minX), (GLYPH_H - 2 * PAD) / Math.max(1e-6, maxY - minY));
  /* Centred in the box, so a figure that is long and low and one that is tall and narrow both sit in it. */
  const offX = (GLYPH_W - (maxX - minX) * k) / 2;
  const offY = (GLYPH_H - (maxY - minY) * k) / 2;
  const at = (p) => ({
    x: Math.round((offX + (p.x - minX) * k) * 100) / 100,
    y: Math.round((GLYPH_H - offY - (p.y - minY) * k) * 100) / 100,
  });
  const drawn = pts.map(at);
  const d = drawn.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const piece = at(seen[1]);
  const end = drawn[drawn.length - 1];
  const before = drawn[Math.max(0, drawn.length - 4)];
  return {
    d,
    view,
    badge: badgeOf(spec),
    start: drawn[0],
    piece,
    end,
    angle: Math.atan2(end.y - before.y, end.x - before.x),
  };
}
