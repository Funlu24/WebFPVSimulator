/*
 * solids.js: an asset's parts, placed in the world, as the solids the
 * physics will hold. Pure arithmetic, no Three.js, no JS trigonometry.
 *
 * The world is src/game/collide.js's Colliders, in Three.js world metres
 * with y up, which src/game/plantworld.js then hands to the physics module
 * through the one conversion in src/render/frame.js. So this file speaks
 * Three.js's axes, and so does every layout in src/props.
 *
 * TURNING A PART.
 *
 *   capsule   both ends turned about +y by the heading, with the sine and
 *             cosine of ./trig.js, which are the same bits in every engine
 *   box       only ever turned by a quarter turn, which is exact: the
 *             extents swap and no sine is taken. An asset that has boxes
 *             is 'quarter' in ./types.js and its heading is snapped before
 *             it gets here. A box met under any other heading is a layout
 *             bug; it is placed as the box that holds the turned one, which
 *             is the conservative answer, and counted so a check can fail.
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

import { sincos, quarterTurns, quarterSinCos, quarterYaw } from './trig.js';

/*
 * The heading an element is actually placed at: its own for an asset that
 * turns freely, the nearest quarter turn for one that has boxes. The mesh
 * and the solids both read this, so a building the document says is at 40
 * degrees is drawn and solid at 0, never drawn at 40 and solid at 0.
 */
export function placedYaw(turns, yaw) {
  if (turns === 'quarter') {
    return quarterYaw(quarterTurns(yaw));
  }
  return Number.isFinite(yaw) ? yaw : 0;
}

/*
 * STANDING AN ASSET ON END. A map builder asked on 1 October 2026 for "the
 * possibility to rotate objects vertically, let's say to place container
 * vertically" (bug-e605ff6a), and the world holds only axis aligned boxes and
 * capsules. A box turned a quarter about a HORIZONTAL axis is still an axis
 * aligned box, with two of its extents swapped, so a container on its end is
 * four boxes, the same four, and no part of the physics has to learn
 * anything. (Turned about the vertical it was already so: that is placedYaw.)
 *
 * The turn is about the asset's own right axis (parts.js's +z), x toward y,
 * so a positive quarter raises the end the asset faces. Three things have to
 * come with it or the asset is somewhere nobody put it:
 *
 *   it is set back on its base      its lowest point is on y = 0, because
 *                                   the element's Base is where it stands,
 *                                   and a container turned about its middle
 *                                   is half under the ground
 *   it is centred along x           the origin is the middle of the
 *                                   footprint (schema.md), and a footprint
 *                                   that was twelve metres along the heading
 *                                   is two and a half now, standing on one
 *                                   side of the origin
 *   z is untouched                  a quarter about z does not move it, and
 *                                   an asset that is deliberately off centre
 *                                   across (the scaffold) stays so
 *
 * ONE MEASURE, TWO READERS. tiltMeasure is what the solids use (tiltParts,
 * which moves the parts) and what the drawing uses (the kit applies the same
 * turn and the same two offsets as a matrix, so everything an asset's draw()
 * paints on top of its parts turns with them), so the mesh and the solids
 * cannot disagree about where a stood container is. Swaps, negations, sums
 * and halves of the layout's own numbers: exact, and the same bits in every
 * engine.
 */
function quarterXY(q, x, y, out) {
  /* + 0 turns a negated zero into a zero: nothing downstream has to tell
   * them apart, and a trace compared bit for bit is not made to. */
  if (q > 0) {
    out[0] = -y + 0;
    out[1] = x;
  } else {
    out[0] = y;
    out[1] = -x + 0;
  }
}

/*
 * What standing `parts` on end by `q` quarters (1 or -1) costs: { q, dx, dy },
 * the offsets that centre the new footprint along x and put its lowest point
 * on the base. Only what is drawn or solid counts; a capsule counts to its
 * radius all round. No parts, or q of 0, is no turn and no offset.
 */
export function tiltMeasure(parts, q) {
  if (!q) {
    return { q: 0, dx: 0, dy: 0 };
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  const t = [0, 0];
  const eat = (x, y, pad) => {
    quarterXY(q, x, y, t);
    x0 = Math.min(x0, t[0] - pad);
    x1 = Math.max(x1, t[0] + pad);
    y0 = Math.min(y0, t[1] - pad);
  };
  for (const p of parts) {
    if (!p.solid && !p.draw) {
      continue;
    }
    if (p.t === 'box') {
      eat(p.lo[0], p.lo[1], 0);
      eat(p.hi[0], p.lo[1], 0);
      eat(p.lo[0], p.hi[1], 0);
      eat(p.hi[0], p.hi[1], 0);
    } else {
      eat(p.a[0], p.a[1], p.r);
      eat(p.b[0], p.b[1], p.r);
    }
  }
  if (!Number.isFinite(x0)) {
    return { q, dx: 0, dy: 0 };
  }
  return { q, dx: -(x0 + x1) / 2 + 0, dy: -y0 + 0 };
}

/*
 * `parts` stood on end by `q` quarters, as a new list: the same parts, in
 * the same order, with the same everything but where they are. Boxes come out
 * as axis aligned boxes (the swap and the signs are exact), and capsules keep
 * their radius. A part's SIZE may differ from the layout's in its last place,
 * because the offsets are added; what stays exactly as it was is how parts
 * lie to one another, since two that shared a plane are the same double and
 * get the same offset. q of 0 is the list itself.
 */
export function tiltParts(parts, q) {
  if (!q) {
    return parts;
  }
  const m = tiltMeasure(parts, q);
  const out = [];
  const t = [0, 0];
  for (const p of parts) {
    if (p.t === 'box') {
      let xa = Infinity;
      let xb = -Infinity;
      let ya = Infinity;
      let yb = -Infinity;
      for (const x of [p.lo[0], p.hi[0]]) {
        for (const y of [p.lo[1], p.hi[1]]) {
          quarterXY(q, x, y, t);
          xa = Math.min(xa, t[0]);
          xb = Math.max(xb, t[0]);
          ya = Math.min(ya, t[1]);
          yb = Math.max(yb, t[1]);
        }
      }
      out.push({ ...p, lo: [xa + m.dx, ya + m.dy, p.lo[2]], hi: [xb + m.dx, yb + m.dy, p.hi[2]] });
    } else {
      quarterXY(q, p.a[0], p.a[1], t);
      const a = [t[0] + m.dx, t[1] + m.dy, p.a[2]];
      quarterXY(q, p.b[0], p.b[1], t);
      const b = [t[0] + m.dx, t[1] + m.dy, p.b[2]];
      out.push({ ...p, a, b });
    }
  }
  return out;
}

const SC = { s: 0, c: 1 };

/*
 * Place `parts` at world (x, y, z) with heading `yaw`, for an asset that
 * `turns` as it says. Appends to `out` and returns it. Each solid is
 *
 *   { kind, name, box: [x0, y0, z0, x1, y1, z1] }
 *   { kind, name, cap: [ax, ay, az, bx, by, bz, r] }
 *
 * `stats.inflated` counts boxes met under a heading that is not a quarter
 * turn.
 */
export function placeSolids(parts, x, y, z, yaw, turns, out = [], stats = null) {
  let s;
  let c;
  let exact;
  if (turns === 'quarter') {
    quarterSinCos(quarterTurns(yaw), SC);
    exact = true;
  } else {
    sincos(Number.isFinite(yaw) ? yaw : 0, SC);
    /* A heading that happens to be a quarter turn is exact either way, but
     * only if the sine came out exact, which for 1.570796 it does not. */
    exact = SC.s === 0 || SC.c === 0;
  }
  s = SC.s;
  c = SC.c;
  for (const p of parts) {
    if (!p.solid) {
      continue;
    }
    if (p.t === 'cap') {
      out.push({
        kind: p.kind,
        name: p.name,
        cap: [
          x + p.a[0] * c + p.a[2] * s, y + p.a[1], z - p.a[0] * s + p.a[2] * c,
          x + p.b[0] * c + p.b[2] * s, y + p.b[1], z - p.b[0] * s + p.b[2] * c,
          p.r,
        ],
      });
      continue;
    }
    if (!exact && stats) {
      stats.inflated = (stats.inflated || 0) + 1;
    }
    /* The four plan corners of the box, turned, and the box that holds
     * them. Under a quarter turn that is the turned box exactly. */
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const lx of [p.lo[0], p.hi[0]]) {
      for (const lz of [p.lo[2], p.hi[2]]) {
        const wx = x + lx * c + lz * s;
        const wz = z - lx * s + lz * c;
        if (wx < x0) x0 = wx;
        if (wx > x1) x1 = wx;
        if (wz < z0) z0 = wz;
        if (wz > z1) z1 = wz;
      }
    }
    out.push({ kind: p.kind, name: p.name, box: [x0, y + p.lo[1], z0, x1, y + p.hi[1], z1] });
  }
  return out;
}

/* Put solids into a src/game/collide.js Colliders. Returns how many. */
export function addSolids(colliders, solids) {
  for (const o of solids) {
    if (o.box) {
      const b = o.box;
      colliders.addBox(o.kind, b[0], b[1], b[2], b[3], b[4], b[5]);
    } else {
      const a = o.cap;
      colliders.add(o.kind, a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
    }
  }
  return solids.length;
}
