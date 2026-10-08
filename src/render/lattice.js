/*
 * lattice.js: the noise lattices the cel and comic shaders read (the low
 * end pass after the sweep that followed graphics pass 25, 2026-10-08).
 *
 * Three shaders draw value noise: the comic layer's mottle, patches, stains
 * and pen wobble (src/render/comic.js), the sky's streak cloud
 * (src/render/comicsky.js) and the field's cloud shadows
 * (src/render/celmat.js). Each computed its noise from a hash, four of them
 * a call and about eighty operations, up to six calls a pixel in the comic
 * layer and three in the cloud shadow, on most of the frame: pure fill, the
 * thing an integrated GPU is shortest of, which is why Low has no cloud
 * shadow (celmat.js, after bug-435f6aaa). Here the noise's grid is a
 * texture, and a call is one fetch. It lives in a file of its own because
 * the cel materials are main's and the comic layer is laid over them, so
 * neither should have to import the other for it.
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

/*
 * THE NOISE LATTICES. Value noise is a random value at each whole number of
 * a grid, blended across each cell with a smoothstep. The grid here is 256
 * square, and each texel holds its own value and the three after it (r at
 * x, y; g at x + 1, y; b at x, y + 1; a at x + 1, y + 1, wrapping), so one
 * nearest fetch brings a cell's four corners and the shader blends them
 * itself, at full precision and with the smoothstep it always used. A
 * filtered fetch would have blended them in the sampler, whose weights are
 * eight bits on most GPUs, and a stain's crisp edge would have stepped up
 * close.
 *
 * Two lattices, each holding a hash the shaders used before: `comic`, the
 * comic layer's (comicHash in comic.js; the sky's skyHash was the same
 * function), and `cel`, the field's cloud shadow's (celHash, which was in
 * celmat.js). Each is worked here in single precision as a GPU works it,
 * at every cell from -128 to 127 on each axis, the cell at -1 stored at 255
 * because the shader takes the cell number mod 256. So within 127 cells of
 * the origin the noise is what the hash drew, to the byte: checked against
 * both hashes run on a GPU (SwiftShader), all 65,536 cells the same, where
 * the same hashes worked in double precision differed at more than half of
 * them. Every streak in the sky and every cloud's shadow is where it was,
 * and so is the ground's noise near a map's origin: within 55 m of it for
 * the finest octave, the pen's weight, 67 m for the grit's and the cracks'
 * wander, and further for the coarser ones. Further out the grid repeats
 * every 256 cells, 111 m for the finest octave and 135 m for the grit, so a
 * pixel there draws the same kind of mottle from another cell: a different
 * draw of the same noise, which only a picture taken before and after the
 * change can tell from the old one.
 *
 * One lattice would not have done for both. The cloud shadow's coarsest
 * octave is 312 m a cell, so a few of its cells cover the field and its
 * cover is those few values: read from the comic hash's lattice it covered
 * 61 percent of 1.2 km square around the origin over its first ten
 * minutes, against 32 from its own, and the field would have been in shadow
 * twice as often.
 *
 * Math.fround and Math.floor are exact in every engine, so every engine
 * builds the same bytes, and nothing here touches the world's rng. Each is
 * built once, by the first material that wants it, so a preset that draws
 * none of the three never builds either.
 */
export const LATTICE_N = 256;

/* The two hashes, step by step in single precision. */
const f = Math.fround;
const fract = (a) => f(a - Math.floor(a));
const HASHES = {
  /* p3 = fract( p.xyx * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 );
   * return fract( ( p3.x + p3.y ) * p3.z ); */
  comic: (px, py) => {
    const c = f(0.1031);
    const k = f(33.33);
    let x = fract(f(px * c));
    let y = fract(f(py * c));
    let z = x;
    const d = f(f(f(x * f(y + k)) + f(y * f(z + k))) + f(z * f(x + k)));
    x = f(x + d);
    y = f(y + d);
    z = f(z + d);
    return fract(f(f(x + y) * z));
  },
  /* p = fract( p * vec2( 233.34, 851.73 ) ); p += dot( p, p + 23.45 );
   * return fract( p.x * p.y ); */
  cel: (px, py) => {
    const k = f(23.45);
    let x = fract(f(px * f(233.34)));
    let y = fract(f(py * f(851.73)));
    const d = f(f(x * f(x + k)) + f(y * f(y + k)));
    x = f(x + d);
    y = f(y + d);
    return fract(f(x * y));
  },
};
const maps = {};

export function latticeMap(kind = 'comic') {
  if (maps[kind]) {
    return maps[kind];
  }
  const hash = HASHES[kind];
  const N = LATTICE_N;
  const half = N / 2;
  const v = new Uint8Array(N * N);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      v[y * N + x] = Math.round(hash(x < half ? x : x - N, y < half ? y : y - N) * 255);
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y += 1) {
    const y1 = (y + 1) % N;
    for (let x = 0; x < N; x += 1) {
      const x1 = (x + 1) % N;
      const k = (y * N + x) * 4;
      data[k] = v[y * N + x];
      data[k + 1] = v[y * N + x1];
      data[k + 2] = v[y1 * N + x];
      data[k + 3] = v[y1 * N + x1];
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  maps[kind] = tex;
  return tex;
}

/*
 * The noise as GLSL, for a shader that draws on WebGL 1 as well as 2 (the
 * sky domes and the cel materials): declares `sampler` and a function
 * `name(p)` that reads whichever lattice is bound to it. It reads with
 * texture2D, where comic.js, which is WebGL 2 alone, uses texelFetch. The
 * lattice has one level and nearest filtering, so where the fetch lands
 * does not depend on the derivatives it takes.
 */
export function latticeNoiseGlsl(name, sampler) {
  const n = LATTICE_N.toFixed(1);
  return /* glsl */ `
  uniform sampler2D ${sampler};
  float ${name}(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec4 c = texture2D(${sampler}, (mod(i, ${n}) + 0.5) / ${n});
    return mix(mix(c.x, c.y, f.x), mix(c.z, c.w, f.x), f.y);
  }
`;
}
