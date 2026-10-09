/*
 * clump.js: a canopy blob drawn as a clump of lumps (graphics passes 23
 * and 24).
 *
 * One shape for two maps. A built map's kit draws its cherries and street
 * trees with it on Medium and High (src/props/kit.js, leaf), and the town
 * draws its cherries and groves near the eye with it on the same presets
 * (src/maps/city/index.js, roundCanopiesNear). It lives here rather than in
 * either because the kit's module pulls in the whole prop catalogue, which
 * the town has no use for.
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

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * CLUMPS (graphics pass 23). A smooth blob on a twig is a balloon, and a
 * yard cherry of twenty of them was a bunch of balloons on sticks. A
 * painter draws a canopy as clumps, with a scalloped outline. So on Medium
 * and High (the quality table's leafClumps) each blob is a sphere broken
 * into lumps, as the race field's trees were the same day (lumpCanopy in
 * src/render/scene.js): one lump over each vertex of an icosahedron,
 * nudged off it, a quarter of them left out and the rest each with its own
 * height and width under a round cap profile, so they meet in valleys and
 * leave a hollow here and there. Eight such shapes, and every blob's own
 * spin and squash on top, so no two read alike. Low keeps the round blob.
 *
 * THE SOLID STAYS INSIDE. A built map's blob has a solid of 0.78 of its
 * smaller radius (treeLayout in src/props/street.js), which in this shape's
 * own frame is inside an ellipsoid 0.78 up and 0.78 * CLUMP_SQUASH across,
 * for any blob no rounder than CLUMP_SQUASH. The valleys lie on a floor
 * outside that, the shape is then measured, and if any face came nearer
 * than 1.03 of that ellipsoid the whole shape would be scaled out until
 * none did. So the solid is inside what is drawn, and only the tops of the
 * lumps, like the round blob's vertices before them, are drawn and not
 * solid: they reach 1.01 to 1.06 of the blob's radius (CLUMP_TOP, and a
 * little more on the shapes the check scaled out) where the round blob
 * reached 0.92. Measured in pass 24, a clump's mean silhouette is 6
 * percent wider than the round blob's (as the radius of a circle of the
 * same area, averaged over 300 directions and the eight shapes, 0.941
 * against 0.887), so a yard tree drawn with clumps is a little fuller than
 * it was, where pass 23 said it was about as full. The town's solids are
 * another shape, a box round each blob
 * (collideLeaves in the vendored trees.js), and pass 24 says what that
 * means there.
 *
 * The normals are half the sphere's and half the lumps'. The field's take
 * a quarter from their lumps, because a 42 vertex blob shaded with its own
 * normals breaks into a toon band per facet; these have 92 vertices, and
 * half lets each lump catch the light without the blob reading as a rock.
 *
 * 180 faces where the round blob has 80, on 92 shared vertices where it
 * has 240 unshared ones. Position and normal only, no uv. No trigonometry:
 * the lumps are dot products with fixed directions, so the shape is the
 * same bits in every engine, and it draws nothing from the world's rng.
 *
 * Made once a shape for the whole session and never changed after. The
 * kit's coded copies share its buffers and bake them into a map's own
 * meshes, and the town draws scaled copies of its own (nearClump in
 * src/maps/city/index.js), made with each town and freed with it.
 */
const PHI = (1 + Math.sqrt(5)) / 2;
const LUMP_AT = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
];
export const CLUMP_SHAPES = 8;
/* The lumps' valleys lie on this ellipsoid and their tops reach CLUMP_TOP. */
const CLUMP_FLOOR_XZ = 0.74;
const CLUMP_FLOOR_Y = 0.82;
export const CLUMP_TOP = 1.04;
/* The roundest blob a clump is proved for, as ry over r. Every tree in
 * street.js is 0.92 or flatter; anything rounder is drawn round. */
export const CLUMP_SQUASH = 0.92;
const CLUMP = [];

function unitOf(x, y, z) {
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
}

/* The clump numbered `shape`, 0 to CLUMP_SHAPES - 1, at a blob radius of 1. */
export function clumpBlob(shape) {
  let g = CLUMP[shape];
  if (g) {
    return g;
  }
  let seed = (0x3c6ef372 + Math.imul(shape + 1, 0x9e3779b9)) >>> 0;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /* Each lump: its direction, its height (none for a quarter of them),
   * and the cosine of its angular radius, 42 to 55 degrees, so neighbours
   * (63 degrees apart) overlap. */
  const lumps = LUMP_AT.map(([x, y, z]) => {
    const d = unitOf(x, y, z);
    return {
      d: unitOf(d[0] + (rnd() - 0.5) * 0.36, d[1] + (rnd() - 0.5) * 0.36, d[2] + (rnd() - 0.5) * 0.36),
      h: rnd() < 0.25 ? 0 : 0.75 + 0.25 * rnd(),
      c0: 0.574 + 0.17 * rnd(),
    };
  });
  const sphere = new THREE.IcosahedronGeometry(1, 2);
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  g = mergeVertices(sphere);
  sphere.dispose();
  const p = g.attributes.position;
  const unit = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 1) {
    const d = unitOf(p.getX(i), p.getY(i), p.getZ(i));
    let n = 0;
    for (const L of lumps) {
      const c = d[0] * L.d[0] + d[1] * L.d[1] + d[2] * L.d[2];
      if (c > L.c0) {
        /* (1 - c) / (1 - c0) is the square of the angle over the
         * radius, near enough, so this is a round cap. */
        n = Math.max(n, L.h * Math.sqrt(1 - (1 - c) / (1 - L.c0)));
      }
    }
    const floor = 1 / Math.sqrt((d[0] * d[0] + d[2] * d[2]) / (CLUMP_FLOOR_XZ * CLUMP_FLOOR_XZ)
      + (d[1] * d[1]) / (CLUMP_FLOOR_Y * CLUMP_FLOOR_Y));
    const rho = floor + (CLUMP_TOP - floor) * n;
    unit[i * 3] = d[0];
    unit[i * 3 + 1] = d[1];
    unit[i * 3 + 2] = d[2];
    p.setXYZ(i, d[0] * rho, d[1] * rho, d[2] * rho);
  }
  /*
   * The solid, in this shape's own frame: 0.78 of the smaller radius is
   * 0.78 up the y axis and at most 0.78 * CLUMP_SQUASH across it. Stretched
   * so that ellipsoid is the unit ball, no face may come nearer the centre
   * than 1.03, and if one does the shape is scaled out until none does.
   * The nearest point of each face, not of its plane: a face down the steep
   * side of a lump has a plane that passes close to the centre, and the
   * plane is the test that scaled every shape out by a quarter.
   */
  const k = new THREE.Vector3(1 / (0.78 * CLUMP_SQUASH), 1 / 0.78, 1 / (0.78 * CLUMP_SQUASH));
  const idx = g.index;
  const tri = new THREE.Triangle();
  const o = new THREE.Vector3();
  const at = new THREE.Vector3();
  let near = Infinity;
  for (let f = 0; f < idx.count; f += 3) {
    tri.a.fromBufferAttribute(p, idx.getX(f)).multiply(k);
    tri.b.fromBufferAttribute(p, idx.getX(f + 1)).multiply(k);
    tri.c.fromBufferAttribute(p, idx.getX(f + 2)).multiply(k);
    near = Math.min(near, tri.closestPointToPoint(o, at).length());
  }
  if (near < 1.03) {
    g.scale(1.03 / near, 1.03 / near, 1.03 / near);
  }
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  for (let i = 0; i < nr.count; i += 1) {
    const v = unitOf(
      nr.getX(i) * 0.5 + unit[i * 3] * 0.5,
      nr.getY(i) * 0.5 + unit[i * 3 + 1] * 0.5,
      nr.getZ(i) * 0.5 + unit[i * 3 + 2] * 0.5,
    );
    nr.setXYZ(i, v[0], v[1], v[2]);
  }
  CLUMP[shape] = g;
  return g;
}
