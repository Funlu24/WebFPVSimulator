/*
 * comic.js: the comic book layer, hatching and paint grit on every toon
 * surface in every map.
 *
 * The owner's ask of 2026-10-07: move the whole game toward Borderlands.
 * What makes that look is not the outline alone. It is that shadow is
 * DRAWN: a shaded face carries pen strokes, a deep shadow carries two
 * crossing sets of them, and a lit face carries the faint mottle of a
 * painted texture rather than a flat fill. This file adds both to the
 * lighting of MeshToonMaterial itself, so the race field (celmat.js), the
 * town and a built map (the vendored toon.js) all get the same hand with
 * one edit and no new pass and no new target. Its one texture, the
 * ground's detail map, came with pass 12 and is generated in code.
 *
 * WHY THE PROTOTYPE AND NOT EACH CALL SITE. The field builds its toon
 * materials through celMaterial and the freestyle maps through the
 * vendored cel(), and both install their own onBeforeCompile on every
 * material. The vendored file stays byte identical (CLAUDE.md, and the
 * PATCH-*.diff files beside it), so it cannot be edited to call this. So
 * MeshToonMaterial's prototype gets an accessor for onBeforeCompile: an
 * assignment stores the caller's hook, a read returns a hook that runs the
 * caller's and then adds the comic chunk. Every toon material in the game
 * therefore gets the chunk whoever built it, and every caller's own hook
 * still runs first and unchanged.
 *
 * THE PROGRAM CACHE KEY is wrapped the same way, and that is not optional.
 * three's default key is onBeforeCompile.toString(), and every read of the
 * accessor returns the same wrapper, so without this two materials whose
 * own hooks differ would hand each other a linked program: the bug
 * celmat.js's long comment on customProgramCacheKey describes. The wrapped
 * key is the caller's own key, or the caller's hook's source where it set
 * no key, with a constant suffix. The chunk itself never varies, every
 * knob is a uniform, so one suffix is the whole truth about it.
 *
 * SHARED UNIFORMS. Each material's hook assigns the same uniform OBJECTS
 * from COMIC below, so one write here reaches every compiled toon program
 * at once, and the preset's level (setComicQuality) takes effect on the
 * next frame without a recompile.
 *
 * THE STROKES are world space, so they stay on the surface as the camera
 * moves rather than swimming across it, and they are kept a constant width
 * and spacing ON SCREEN: the stroke coordinate's screen derivative picks an
 * octave, two octaves are blended, and the width is measured in pixels. A
 * stroke a metre from the lens and one eighty metres away are the same pen.
 * Which way they run comes from the dominant axis of the world normal, the
 * cheap half of triplanar mapping, which is what a comic artist does too:
 * walls get one direction, floors another.
 *
 * WHERE IS SHADOW. The toon lighting has already worked out what the sun
 * gave this fragment (directDiffuse, after the ramp and the shadow map).
 * Divided by what the sun WOULD give this colour square on and unshadowed
 * (the first directional light's colour through the same Lambert term),
 * that is the ramp's own band times the shadow map: about one lit, about a
 * third on the dark side of either map's ramp, zero in a cast shadow,
 * whatever the map's sun strength or sky. The first version used the sun's
 * share of sun plus sky instead, and the field's strong sun put its dark
 * side at 0.79 of that, so the field's trees never got a stroke. That
 * fraction is the tone, and the strokes are its ink.
 *
 * Render only. Nothing here reads or writes the physics state. The one
 * texture (the ground's detail map, pass 12, further down) is generated
 * here from a fixed seed and sampled by scene materials, never by a full
 * screen pass, so the budget's P4 cannot move.
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
 * The knobs, as shared uniform objects. hatch and grit are 0 to 1 and are
 * what a preset sets; the rest are the look.
 *
 * litLo and litHi bracket the sun's share of the light over which strokes
 * come in: above litHi a face is lit and clean, below litLo it is in full
 * shadow and carries both sets.
 */
export const COMIC = {
  hatch: { value: 1 },
  grit: { value: 1 },
  brush: { value: 1 },
  ink: { value: new THREE.Color(0x0b0c12) },
  litLo: { value: 0.40 },
  litHi: { value: 0.62 },
  /* How far a stroke darkens what is under it, and its width in pixels. */
  depth: { value: 0.78 },
  width: { value: 1.9 },
  /* Spacing between strokes on screen, in pixels. */
  period: { value: 11.0 },
  /* Where the strokes thin out with distance, in metres. */
  fadeNear: { value: 70 },
  fadeFar: { value: 160 },
  /* The ground's detail map (pass 12): 0 until a preset that keeps it has
   * built the texture, so a page that never sets a preset samples nothing. */
  detail: { value: 0 },
  detailMap: { value: null },
  /* 1 where a map's ground cannot be marked material by material, and its
   * up facing surfaces are told apart by colour instead. See GROUND. */
  groundAuto: { value: 0 },
};

/*
 * GROUND. The detail map and the field's patches go on ground, and what is
 * ground is said, not guessed: a material is ground when its
 * userData.comicGround is true. Read at every draw, so a mark set after the
 * first frame still counts, and a clone made by Material.copy carries it.
 *
 * Guessed from colour, which is what pass 12 did, green paint was turf: the
 * yard's green containers had a lawn on their roofs. Marked, a green roof is
 * a roof. Inside a marked material colour still decides between the two
 * kinds of ground, because the field's terrain is one material painted grass
 * and rock by its vertices.
 *
 * The town cannot be marked this way. Its bake folds colour into vertices
 * and merges every material that differs only in colour into one, so its
 * roads, its walls and its cars come out of the bake as the same material,
 * and keeping ground apart would split those merges into more draw calls,
 * which is the thing the town is shortest of. The town says so with
 * setComicQuality(q, { groundAuto: true }), and there every surface that
 * faces up is ground and colour decides which kind, as in pass 12.
 */
export function markGround(root) {
  root.traverse((o) => {
    if (!o.isMesh) {
      return;
    }
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (m) {
        m.userData.comicGround = true;
      }
    }
  });
}

/* Per preset. Low is the integrated laptop and the phone that has already
 * given up shadows and ink for fill rate; it keeps none of this, and the
 * guard in the shader is a uniform branch, so a zero skips the arithmetic
 * without a second program. */
const LEVELS = {
  low: { hatch: 0, grit: 0, brush: 0, detail: 0 },
  /* Medium is the integrated laptop: strokes and grit, not the brush
   * marks, which are the most arithmetic for the least picture. It keeps
   * the ground's detail map: two fetches of a small cached texture is
   * cheap, and it is what tells a pilot how fast the ground is going by. */
  medium: { hatch: 1, grit: 1, brush: 0, detail: 1 },
  high: { hatch: 1, grit: 1, brush: 1, detail: 1 },
};

export function setComicQuality(q, { groundAuto = false } = {}) {
  const id = q && q.id ? q.id : 'high';
  /* Every map sets this when it builds, so leaving the town clears it. */
  COMIC.groundAuto.value = groundAuto ? 1 : 0;
  const lv = LEVELS[id] || LEVELS.high;
  COMIC.hatch.value = lv.hatch;
  COMIC.grit.value = lv.grit;
  COMIC.brush.value = lv.brush;
  /* Built on the first preset that keeps it and never on Low, which
   * neither allocates nor uploads it. */
  if (lv.detail > 0 && !COMIC.detailMap.value) {
    COMIC.detailMap.value = buildDetailMap();
  }
  COMIC.detail.value = COMIC.detailMap.value ? lv.detail : 0;
  aoOn = id === 'high';
}

/*
 * THE GROUND'S DETAIL MAP (pass 12).
 *
 * Seen from a quad a metre or two up, the ground is most of the frame, and
 * a flat fill there is the plainest thing on screen: it is also what tells
 * a pilot how fast the world is going by. The grit and the patches above
 * vary it over metres; what was missing is the texture of the stuff itself,
 * a turf's blades and a road's stones, at centimetres.
 *
 * Three tries at painting grass in the shader alone failed (pass 9, in
 * PROGRESS.md), all for the same reason: a pattern finer than a pixel has
 * to be faded by hand where the ground is foreshortened, which is
 * everywhere a pilot looks, and the fade ate it. A texture with mipmaps and
 * anisotropic filtering does that fade properly, so this is one: 512 square,
 * generated here at the first preset that wants it, from a fixed seed of
 * its own (never the world's rng, which plants the colliders), with no
 * trigonometry so every engine paints the same pixels. Each channel is
 * settled to a mean of exactly one half, so the coarsest mip is neutral and
 * the far field keeps the colour it had.
 *
 *   r  turf: short tapered strokes in every direction, light and dark,
 *      over a soft clumping. Painted blades, not photographed ones.
 *   g  aggregate: small light and dark stones in a mottle, for asphalt,
 *      concrete, dirt and sand.
 *   b  the turf strokes' hue, warm (dry) or cool (lush), so a lawn up close
 *      is several greens, which is how a painter does one.
 *   a  leaf clumps (pass 13): overlapping discs, each lighter at its top and
 *      inked along its lower edge, each laid over the ones before it, which
 *      is the scalloped canopy a comic draws for a tree. Up is +v, so a
 *      clump hangs the right way up on a canopy's side.
 */
const DETAIL_N = 512;

function buildDetailMap() {
  const N = DETAIL_N;
  let seed = 0x2f6b9d13;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const turf = new Float32Array(N * N).fill(0.5);
  const stone = new Float32Array(N * N).fill(0.5);
  const hue = new Float32Array(N * N).fill(0.5);

  /* Value noise on a lattice that wraps, so the tile repeats seamlessly. */
  const mottle = (buf, cells, amp) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i += 1) {
      g[i] = rnd() - 0.5;
    }
    for (let y = 0; y < N; y += 1) {
      const fy = (y / N) * cells;
      const iy = Math.floor(fy);
      let ty = fy - iy;
      ty = ty * ty * (3 - 2 * ty);
      const y0 = iy % cells;
      const y1 = (iy + 1) % cells;
      for (let x = 0; x < N; x += 1) {
        const fx = (x / N) * cells;
        const ix = Math.floor(fx);
        let tx = fx - ix;
        tx = tx * tx * (3 - 2 * tx);
        const x0 = ix % cells;
        const x1 = (ix + 1) % cells;
        const a = g[y0 * cells + x0] + (g[y0 * cells + x1] - g[y0 * cells + x0]) * tx;
        const b = g[y1 * cells + x0] + (g[y1 * cells + x1] - g[y1 * cells + x0]) * tx;
        buf[y * N + x] += (a + (b - a) * ty) * amp;
      }
    }
  };

  /* One tapered stroke from its centre along a unit direction, wrapped at
   * the tile's edges; `tint` writes the same coverage into the hue. */
  const stroke = (buf, cx, cy, ux, uy, len, hw, val, alpha, tint) => {
    const ax = cx - ux * len * 0.5;
    const ay = cy - uy * len * 0.5;
    const r = Math.ceil(len * 0.5 + hw + 1);
    const bx = Math.floor(cx);
    const by = Math.floor(cy);
    for (let oy = -r; oy <= r; oy += 1) {
      for (let ox = -r; ox <= r; ox += 1) {
        const px = bx + ox + 0.5;
        const py = by + oy + 0.5;
        let t = ((px - ax) * ux + (py - ay) * uy) / len;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const qx = ax + ux * len * t - px;
        const qy = ay + uy * len * t - py;
        const d = Math.sqrt(qx * qx + qy * qy);
        const taper = 1 - (2 * t - 1) * (2 * t - 1);
        const w = hw * (0.3 + 0.7 * taper);
        const cov = Math.min(1, Math.max(0, w + 0.5 - d)) * alpha;
        if (cov <= 0) {
          continue;
        }
        const k = (((by + oy) % N + N) % N) * N + (((bx + ox) % N + N) % N);
        buf[k] += (val - buf[k]) * cov;
        if (tint !== null) {
          hue[k] += (tint - hue[k]) * cov;
        }
      }
    }
  };

  /* A unit direction without trigonometry: a point in the unit disc,
   * rejected until it is not near the centre, then normalised. */
  const dir = () => {
    for (;;) {
      const x = rnd() * 2 - 1;
      const y = rnd() * 2 - 1;
      const m = x * x + y * y;
      if (m > 0.04 && m <= 1) {
        const s = 1 / Math.sqrt(m);
        return [x * s, y * s];
      }
    }
  };

  /* Dense and layered, three tones laid over each other until no flat
   * ground shows between them: sparse strokes on a flat grey read as hay
   * or pine needles, not as a lawn. */
  mottle(turf, 8, 0.10);
  mottle(turf, 32, 0.08);
  for (let i = 0; i < 26000; i += 1) {
    const [ux, uy] = dir();
    const tone = rnd();
    const val = tone < 0.35 ? 0.24 + rnd() * 0.16 : (tone < 0.7 ? 0.55 + rnd() * 0.15 : 0.75 + rnd() * 0.13);
    const tint = tone < 0.35 ? rnd() * 0.45 : 0.4 + rnd() * 0.6;
    stroke(turf, rnd() * N, rnd() * N, ux, uy, 4 + rnd() * 6, 0.5 + rnd() * 0.5, val, 0.75, tint);
  }

  mottle(stone, 16, 0.12);
  mottle(stone, 64, 0.06);
  for (let i = 0; i < 26000; i += 1) {
    const [ux, uy] = dir();
    const light = rnd() < 0.4;
    const val = light ? 0.66 + rnd() * 0.2 : 0.14 + rnd() * 0.2;
    /* A stone is a stroke as long as it is wide. */
    const r = 0.5 + rnd() * 1.2;
    stroke(stone, rnd() * N, rnd() * N, ux, uy, r * (1 + rnd()), r, val, 0.8, null);
  }

  /* Clumps of two sizes, big ones first so the small ones sit on them:
   * a canopy reads as masses with smaller masses on their edges. Each
   * clump's rim is lobed by value noise read round it (a 32 square
   * lattice, wrapping), so it is a bunch of leaves and not a coin. */
  const leaf = new Float32Array(N * N).fill(0.5);
  const LOBE = 32;
  const lobes = new Float32Array(LOBE * LOBE);
  for (let i = 0; i < lobes.length; i += 1) {
    lobes[i] = rnd();
  }
  const lobe = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let tx = x - ix;
    let ty = y - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const at = (a, b) => lobes[(((b % LOBE) + LOBE) % LOBE) * LOBE + (((a % LOBE) + LOBE) % LOBE)];
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
    return a + (b - a) * ty;
  };
  for (let i = 0; i < 900; i += 1) {
    const cx = rnd() * N;
    const cy = rnd() * N;
    const R = i < 300 ? 22 + rnd() * 14 : 11 + rnd() * 10;
    const base = 0.44 + rnd() * 0.14;
    /* Not every clump is inked, and not with the same pen: a line round
     * every one reads as fish scales. */
    const pen = rnd() < 0.62 ? 1.5 + rnd() * 1.3 : 0;
    const ink = 0.7 + rnd() * 0.3;
    const lx = rnd() * LOBE;
    const ly = rnd() * LOBE;
    const reach = Math.ceil(R * 1.2 + 1);
    const bx = Math.floor(cx);
    const by = Math.floor(cy);
    for (let oy = -reach; oy <= reach; oy += 1) {
      for (let ox = -reach; ox <= reach; ox += 1) {
        const dx = bx + ox + 0.5 - cx;
        const dy = by + oy + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        /* The rim's radius in this pixel's direction: the noise is read at
         * the unit direction scaled up, so a round trip crosses a few
         * lattice cells and the rim has four to six lobes. */
        const inv = d > 1e-6 ? 1 / d : 0;
        const Rl = R * (0.84 + 0.3 * lobe(lx + dx * inv * 2.6, ly + dy * inv * 2.6));
        const cov = Math.min(1, Math.max(0, Rl + 0.5 - d));
        if (cov <= 0) {
          continue;
        }
        /* -1 at the clump's foot, 1 at its crown. */
        const up = dy / R;
        let v = base + up * 0.19;
        /* The pen along the foot: the lower half of the rim, heaviest
         * straight underneath and lifting off towards the sides. */
        if (pen > 0) {
          const edge = Math.min(1, Math.max(0, (d - (Rl - pen)) / 1.2));
          const foot = Math.min(1, Math.max(0, (0.1 - up) / 0.5));
          v += (0.06 - v) * edge * foot * ink;
        }
        const k = (((by + oy) % N + N) % N) * N + (((bx + ox) % N + N) % N);
        leaf[k] += (v - leaf[k]) * cov;
      }
    }
  }

  /* Settle each channel to a mean of one half at a set spread, so the
   * coarsest mip is neutral whatever the strokes added up to. */
  const settle = (buf, spread) => {
    let m = 0;
    for (let i = 0; i < buf.length; i += 1) {
      m += buf[i];
    }
    m /= buf.length;
    let v = 0;
    for (let i = 0; i < buf.length; i += 1) {
      v += (buf[i] - m) * (buf[i] - m);
    }
    const k = v > 0 ? spread / Math.sqrt(v / buf.length) : 0;
    for (let i = 0; i < buf.length; i += 1) {
      buf[i] = 0.5 + (buf[i] - m) * k;
    }
  };
  settle(turf, 0.15);
  settle(stone, 0.13);
  settle(hue, 0.16);
  settle(leaf, 0.17);

  const data = new Uint8Array(N * N * 4);
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < N * N; i += 1) {
    data[i * 4] = byte(turf[i]);
    data[i * 4 + 1] = byte(stone[i]);
    data[i * 4 + 2] = byte(hue[i]);
    data[i * 4 + 3] = byte(leaf[i]);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  /* Clamped to what the GPU offers. Anisotropy is what keeps the strokes
   * sharp along a road seen at a grazing angle instead of a blur. */
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* The heavier pen for the ink passes, as a factor on each pipeline's own
 * line width. 1 is the line before this file. */
export const INK_WEIGHT = 1.55;
/* The ink itself: near black with a breath of blue, so it reads as ink on
 * paper rather than as a hole in the frame. */
export const INK_COLOR = 0x0d0f16;

const MARK = '/* COMIC_V1 */';
const KEY = '|comic1';

const VERT_HEAD = /* glsl */ `
varying vec3 vComicWorld;
`;

const VERT_BODY = /* glsl */ `
  {
    vec4 comicW = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      comicW = batchingMatrix * comicW;
    #endif
    #ifdef USE_INSTANCING
      comicW = instanceMatrix * comicW;
    #endif
    vComicWorld = ( modelMatrix * comicW ).xyz;
  }
`;

const FRAG_HEAD = /* glsl */ `
${MARK}
varying vec3 vComicWorld;
uniform float uComicHatch;
uniform float uComicGrit;
uniform float uComicBrush;
uniform vec3 uComicInk;
uniform float uComicLitLo;
uniform float uComicLitHi;
uniform float uComicDepth;
uniform float uComicWidth;
uniform float uComicPeriod;
uniform float uComicFadeNear;
uniform float uComicFadeFar;
uniform float uComicDetail;
uniform sampler2D uComicDetailMap;
uniform float uComicGround;
uniform float uComicGroundAuto;
uniform float uComicFoliage;

/* No sine in either: a sine's precision is the driver's, and a stroke
 * should land in the same place on every GPU. */
float comicHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float comicNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( comicHash( i ), comicHash( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( comicHash( i + vec2( 0.0, 1.0 ) ), comicHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}

/* Coverage of one set of parallel strokes at one octave: x is the stroke
 * coordinate (one stroke per unit), fw its screen derivative, w the pen in
 * pixels. */
float comicLine( float x, float y, float fw, float w ) {
  float px = abs( fract( x ) - 0.5 ) / fw;
  float cov = 1.0 - smoothstep( w * 0.5 - 0.5, w * 0.5 + 0.5, px );
  /* Broken into dashes along the stroke, each stroke its own: a pen lifts,
   * a ruler does not, and unbroken lines read as a printed mesh. */
  float sx = floor( x );
  float sy = floor( y * 0.42 + comicHash( vec2( sx, 3.7 ) ) );
  return cov * step( 0.3, comicHash( vec2( sx, sy ) ) );
}

/*
 * One set of strokes, held at uComicPeriod pixels apart at any range. x0 is
 * the stroke coordinate at one stroke per metre; the octave that puts the
 * spacing nearest the period is drawn, blended into the next one up as the
 * range grows, so strokes neither pop nor crowd. The pen's weight wanders
 * with a world noise, which is the difference between a pen and a ruler.
 */
float comicSet( float x0, float y0, float fw0, float wobble, float weight, float period ) {
  float lod = clamp( log2( period * fw0 ), -3.0, 10.0 );
  float lf = floor( lod );
  float t = lod - lf;
  float sA = exp2( -lf );
  float a = comicLine( ( x0 + wobble ) * sA, y0 * sA, fw0 * sA, uComicWidth * weight );
  float b = comicLine( ( x0 + wobble ) * sA * 0.5, y0 * sA * 0.5, fw0 * sA * 0.5, uComicWidth * weight );
  return mix( a, b, t );
}

vec3 comicShade( vec3 col, vec3 direct, vec3 sunFull, vec3 nView, vec3 viewPos ) {
  vec3 p = vComicWorld;
  vec3 wn = abs( inverseTransformDirection( nView, viewMatrix ) );
  /* The plane the strokes are drawn in: the one the surface faces most. */
  vec2 q = wn.y > max( wn.x, wn.z ) ? p.xz : ( wn.x > wn.z ? p.zy : p.xy );
  float dist = length( viewPos );
  float fade = 1.0 - smoothstep( uComicFadeNear, uComicFadeFar, dist );
  /*
   * How square on the surface is to the eye. Strokes laid in the world on
   * a wall or a road seen nearly edge on are foreshortened into lines
   * running to the vanishing point, packed tight, and the crossing set
   * then reads as a net stretched over the street (pass 11, the town's
   * alleys). An artist does not hatch a plane seen edge on, so the
   * strokes thin out below about twenty degrees of facing.
   */
  float facing = abs( dot( normalize( nView ), normalize( viewPos ) ) );
  float square = smoothstep( 0.12, 0.38, facing );
  /* Ground, marked or, in the town, everything (GROUND, above). */
  float ground = max( uComicGround, uComicGroundAuto );

  if ( uComicGrit > 0.0 ) {
    /* Paint grit: two octaves of mottle in the base colour, the hand
     * painted texture under a comic world's ink. Faded where its own
     * octave is finer than a couple of pixels, so it never shimmers. */
    vec2 gq = q * 1.9;
    float gfw = length( fwidth( gq ) );
    float g = comicNoise( gq ) * 0.55 + comicNoise( q * 0.37 + 17.0 ) * 0.45;
    float gAmt = ( 1.0 - smoothstep( 0.35, 0.9, gfw ) ) * 0.16 + 0.05;
    col *= 1.0 + ( g - 0.5 ) * gAmt * uComicGrit;
    /*
     * Landscape scale patches on green ground that faces up: a field is
     * never one green. Dry, worn and clover patches tens of metres
     * across, the variation a painted backdrop has and a flat fill does
     * not. Two octaves at 14 m and 4 m, on the up facing plane only.
     *
     * Faded out by 160 m. Past that the patches shrink to a few pixels,
     * and air takes the contrast out of distant ground anyway (pass 10).
     */
    if ( ground > 0.0 && wn.y > max( wn.x, wn.z ) ) {
      float m = comicNoise( p.xz * 0.07 + 41.0 ) * 0.6 + comicNoise( p.xz * 0.23 + 7.0 ) * 0.4;
      m = smoothstep( 0.22, 0.78, m );
      float near = 1.0 - smoothstep( 50.0, 160.0, dist );
      /* On green ground only, and in hue more than in value: dry, yellowed
       * turf against lush. Dark patches read as cloud shadow on a field
       * that has real ones, and on pale concrete, dirt or sand any patch
       * read as camouflage (pass 10), so those keep the grit alone. */
      float green = smoothstep( 0.01, 0.06, col.g - max( col.r, col.b ) );
      vec3 tint = mix( vec3( 0.9, 0.99, 0.96 ), vec3( 1.08, 1.04, 0.8 ), m );
      col *= mix( vec3( 1.0 ), tint, uComicGrit * near * green );
    }
  }

  /*
   * The ground's detail map (pass 12, buildDetailMap): turf on green ground,
   * stones on the rest of the ground that faces up. Two fetches at scales
   * that do not divide each other (a 2.7 m tile and a 7.9 m one turned 37
   * degrees), so neither tile's repeat lines up into a grid seen from
   * height. Fetched whatever the surface faces, inside this branch only,
   * which is uniform: a fetch with implicit derivatives in a branch that
   * neighbouring pixels did not take is undefined, and walls are cheap to
   * sample and multiply by zero. What is not ground skips both fetches.
   */
  if ( uComicDetail * ground > 0.0 ) {
    vec2 du = p.xz * 0.37;
    vec2 dv = vec2( p.x * 0.799 - p.z * 0.602, p.x * 0.602 + p.z * 0.799 ) * 0.127 + vec2( 0.31, 0.77 );
    vec4 d1 = texture2D( uComicDetailMap, du );
    vec4 d2 = texture2D( uComicDetailMap, dv );
    float up = smoothstep( 0.05, 0.25, wn.y - max( wn.x, wn.z ) );
    float turf = smoothstep( 0.01, 0.06, col.g - max( col.r, col.b ) );
    float blades = ( d1.r - 0.5 ) * 0.75 + ( d2.r - 0.5 ) * 0.55;
    float stones = ( d1.g - 0.5 ) * 0.7 + ( d2.g - 0.5 ) * 0.4;
    float warm = ( d1.b - 0.5 ) * 1.2 + ( d2.b - 0.5 ) * 0.8;
    vec3 grass = ( 1.0 + blades ) * ( vec3( 1.0 ) + vec3( 0.07, 0.03, -0.12 ) * warm );
    vec3 detail = mix( vec3( 1.0 + stones * 0.65 ), grass, turf );
    col *= mix( vec3( 1.0 ), detail, up * uComicDetail );
  }

  /*
   * FOLIAGE (pass 13): the detail map's leaf clumps on a material marked
   * userData.comicFoliage: the race field's canopies (scene.js), the
   * town's (city/index.js, markCanopies) and the props kit's (kit.js). A
   * canopy is a round mass, so the clumps are fetched in all three world
   * planes and blended by how much the surface faces each (triplanar), an
   * 11 m tile, which puts clumps half a metre to a metre and a half across
   * and four to eight of them across a tree. Each clump's crown is lighter
   * and its inked foot darker, a painted canopy's light and shade. What is
   * not foliage skips the three fetches; past a few tens of metres the
   * mipmaps settle the tile to its neutral mean, so the tree line far off
   * keeps the colour it had.
   */
  if ( uComicDetail * uComicFoliage > 0.0 ) {
    vec3 fq = p * 0.09;
    vec3 tw = wn * wn;
    tw *= tw;
    tw /= tw.x + tw.y + tw.z;
    float lx = texture2D( uComicDetailMap, fq.zy ).a;
    float lz = texture2D( uComicDetailMap, fq.xy + vec2( 0.43, 0.17 ) ).a;
    float ly = texture2D( uComicDetailMap, fq.xz + vec2( 0.71, 0.59 ) ).a;
    float clump = lx * tw.x + lz * tw.z + ly * tw.y - 0.5;
    /* Half as strong in the shade, where the hatching is the texture. */
    float fl = dot( direct, vec3( 0.2126, 0.7152, 0.0722 ) );
    float fs = dot( sunFull, vec3( 0.2126, 0.7152, 0.0722 ) );
    float flit = fs > 1e-5 ? fl / fs : 1.0;
    clump *= mix( 0.5, 1.0, smoothstep( uComicLitLo, uComicLitHi, flit ) );
    /* On green leaves the crown goes warm and the foot cool. On blossom,
     * which is pale and pink, that turned the feet lavender and the canopy
     * read as marble, so anything not green takes the value alone. */
    float leafy = smoothstep( 0.01, 0.06, col.g - max( col.r, col.b ) );
    col *= vec3( 1.0 ) + clump * mix( vec3( 0.75 ), vec3( 1.3, 1.05, 0.7 ), leafy );
  }

  if ( uComicHatch > 0.0 ) {
    /* The screen derivatives first, in uniform control flow: a derivative
     * taken inside a branch that neighbouring pixels did not take is
     * undefined in GLSL, and the branch below is per pixel. */
    float xa = ( q.x + q.y ) * 4.2;
    float xb = ( q.x - q.y ) * 4.2;
    float fwa = max( fwidth( xa ), 1e-6 );
    float fwb = max( fwidth( xb ), 1e-6 );
    float dl = dot( direct, vec3( 0.2126, 0.7152, 0.0722 ) );
    float sl = dot( sunFull, vec3( 0.2126, 0.7152, 0.0722 ) );
    float lit = sl > 1e-5 ? dl / sl : 1.0;
    float shade = 1.0 - smoothstep( uComicLitLo, uComicLitHi, lit );
    if ( shade > 0.0 && fade > 0.0 ) {
      float wob = ( comicNoise( q * 0.9 ) - 0.5 ) * 0.7;
      float wt = mix( 0.7, 1.35, comicNoise( q * 2.3 + 5.0 ) );
      /* First set at 45 degrees, from the first hint of shade. */
      float h1 = comicSet( xa, xb, fwa, wob, wt, uComicPeriod ) * smoothstep( 0.0, 0.35, shade );
      /* The crossing set only in deep shadow: a cast shadow, not the dark
       * side of the ramp, or every shaded face reads as a net. */
      float h2 = comicSet( xb, xa, fwb, -wob, wt, uComicPeriod ) * ( 1.0 - smoothstep( 0.12, 0.24, lit ) );
      float cov = max( h1, h2 ) * fade * square * uComicHatch;
      col = mix( col, col * 0.18 + uComicInk * 0.5, cov * uComicDepth );
    }
    /*
     * Brush marks on the lit side too, sparse and faint, running across the
     * hatching: a painted surface shows the brush everywhere, and a lit
     * face that is one flat fill is the plastic look this replaces. Twice
     * the hatching's spacing, a tenth of its weight. High only.
     *
     * Not on what faces up. Ground seen at a flier's grazing angle draws
     * parallel world strokes as lines running to the vanishing point, and
     * a field of them read as a ruled floor or a ploughed one, not as
     * paint (pass 9). The ground keeps its hatching in shadow and its
     * grit and patches in the light.
     */
    float wall = 1.0 - step( max( wn.x, wn.z ), wn.y );
    if ( uComicBrush > 0.0 && fade * wall > 0.0 ) {
      float bm = comicSet( xb * 0.83 + 3.1, xa * 0.61, fwb * 0.83, 0.0, 1.1, uComicPeriod * 2.2 );
      col *= 1.0 - bm * 0.11 * fade * square * uComicBrush * ( 1.0 - shade );
    }
  }
  return col;
}
`;

const FRAG_BODY = /* glsl */ `
	#if NUM_DIR_LIGHTS > 0
		outgoingLight = comicShade( outgoingLight, reflectedLight.directDiffuse,
			directionalLights[ 0 ].color * BRDF_Lambert( diffuseColor.rgb ), normal, vViewPosition );
	#else
		outgoingLight = comicShade( outgoingLight, vec3( 1.0 ), vec3( 1.0 ), normal, vViewPosition );
	#endif
`;

function inject(shader, material) {
  if (shader.fragmentShader.includes(MARK)) {
    return;
  }
  const vs = shader.vertexShader;
  const fs = shader.fragmentShader;
  if (!vs.includes('#include <project_vertex>') || !vs.includes('#include <common>')
      || !fs.includes('#include <opaque_fragment>') || !fs.includes('#include <common>')
      || !fs.includes('vec3 outgoingLight')) {
    /* Not the toon shader this was written against. Draw it as it was. */
    return;
  }
  shader.uniforms.uComicHatch = COMIC.hatch;
  shader.uniforms.uComicGrit = COMIC.grit;
  shader.uniforms.uComicBrush = COMIC.brush;
  shader.uniforms.uComicInk = COMIC.ink;
  shader.uniforms.uComicLitLo = COMIC.litLo;
  shader.uniforms.uComicLitHi = COMIC.litHi;
  shader.uniforms.uComicDepth = COMIC.depth;
  shader.uniforms.uComicWidth = COMIC.width;
  shader.uniforms.uComicPeriod = COMIC.period;
  shader.uniforms.uComicFadeNear = COMIC.fadeNear;
  shader.uniforms.uComicFadeFar = COMIC.fadeFar;
  shader.uniforms.uComicDetail = COMIC.detail;
  shader.uniforms.uComicDetailMap = COMIC.detailMap;
  /* The material's own, and the only one here that is not shared: three
   * keeps a material's uniforms per material while the program is shared,
   * so every material reads its own mark through one program. */
  shader.uniforms.uComicGround = {
    get value() {
      return material.userData.comicGround ? 1 : 0;
    },
  };
  shader.uniforms.uComicGroundAuto = COMIC.groundAuto;
  shader.uniforms.uComicFoliage = {
    get value() {
      return material.userData.comicFoliage ? 1 : 0;
    },
  };
  shader.vertexShader = vs
    .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
  shader.fragmentShader = fs
    .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
    .replace('#include <opaque_fragment>', `${FRAG_BODY}\n\t#include <opaque_fragment>`);
}

/*
 * Install the accessors, once. Guarded on a symbol so a second import of
 * this module (a share page, the gallery) cannot wrap the wrapper.
 */
const INSTALLED = Symbol.for('webfpv.comic.installed');
const P = THREE.MeshToonMaterial.prototype;
if (!P[INSTALLED]) {
  P[INSTALLED] = true;
  Object.defineProperty(P, 'onBeforeCompile', {
    configurable: true,
    get() {
      /* The caller's hook as it is at the moment of the read, so code that
       * reads this to wrap it and assigns the wrapper back ends up calling
       * the old hook once, not this wrapper in a loop. */
      const user = this._comicUserHook || null;
      const self = this;
      const hook = function comicHook(shader, renderer) {
        if (user) {
          user.call(self, shader, renderer);
        }
        inject(shader, self);
      };
      hook.comicUser = user;
      return hook;
    },
    /* The town's bake and the kit copy one material's hook onto a clone
     * (bake.js, kit.js: Material.copy does not carry it). What they read is
     * this wrapper, so the setter unwraps it and the clone holds the same
     * caller's hook the original does, not a wrapper round a wrapper. */
    set(fn) {
      if (typeof fn === 'function' && 'comicUser' in fn) {
        this._comicUserHook = fn.comicUser;
      } else {
        this._comicUserHook = typeof fn === 'function' ? fn : null;
      }
    },
  });
  Object.defineProperty(P, 'customProgramCacheKey', {
    configurable: true,
    get() {
      const self = this;
      const key = function comicKey() {
        let k = '';
        if (self._comicUserKey) {
          k = String(self._comicUserKey.call(self));
        } else if (self._comicUserHook) {
          k = self._comicUserHook.toString();
        }
        return k + KEY;
      };
      key.comicUserKey = this._comicUserKey || null;
      return key;
    },
    /* Unwrapped for the same reason as the hook: a key copied from another
     * material is that material's own key, so the two still share one
     * program, as they did before this file. */
    set(fn) {
      if (typeof fn === 'function' && 'comicUserKey' in fn) {
        this._comicUserKey = fn.comicUserKey;
      } else {
        this._comicUserKey = typeof fn === 'function' ? fn : null;
      }
    },
  });
}

/*
 * The freestyle maps' vendored pipeline: the heavier, darker pen and a
 * harder grade, on the pipeline's own copies of its materials, the way
 * manga.js edits them. Nothing under vendored/ changes. The pipelines'
 * setSize multiplies its own line width by pipeline.inkWeight.
 */
export function comicPipeline(pipeline) {
  pipeline.inkWeight = INK_WEIGHT;
  pipeline.comicAo = comicAoOn() && addPipelineAo(pipeline);
  const ink = pipeline.ink && pipeline.ink.mat && pipeline.ink.mat.uniforms;
  if (ink) {
    if (ink.uInk) {
      ink.uInk.value.setHex(INK_COLOR);
    }
    /*
     * The crease thresholds scale with the pen. The ink pass reads a crease
     * as the second difference of depth across the pen's reach, which grows
     * in proportion to the reach, so a pen 1.55 times wider found every
     * crease 1.55 times stronger, and pass 1 then lowered the threshold
     * too: the town's twenty sided blossom blobs came out as wireframe
     * gems, every facet edge inked. Multiplying the reach back into the
     * thresholds keeps the kit's creases where main has them and makes only
     * the lines heavier; the last tenth is a slightly keener pen.
     */
    if (ink.uSens) {
      ink.uSens.value *= INK_WEIGHT * 0.9;
    }
    if (ink.uConcave) {
      ink.uConcave.value *= INK_WEIGHT * 0.9;
    }
    if (ink.uConcaveAmount) {
      ink.uConcaveAmount.value = Math.min(1, ink.uConcaveAmount.value * 1.3);
    }
  }
  const g = pipeline.grade && pipeline.grade.mat && pipeline.grade.mat.uniforms;
  if (g) {
    /* More colour and deeper darks: the pastel town moves toward the
     * saturated, high contrast palette the ask names, keeping its hues. */
    if (g.uSaturation) {
      g.uSaturation.value = 1.26;
    }
    if (g.uLift) {
      g.uLift.value = 0.014;
    }
  }
}

/*
 * AMBIENT OCCLUSION, folded into each pipeline's ink pass on High only.
 *
 * What the ink and hatching cannot give the world is weight: a container
 * sits ON the concrete, a gate leg stands IN the grass, an underpass is
 * dark because the sky cannot see into it. That is occlusion, and it is the
 * single largest difference between a stylised world that reads as a
 * diorama and one that reads as finished.
 *
 * No new pass and no new target: the ink pass already holds the frame's
 * depth (the field's packed prepass, the town's depth texture), so eight
 * more fetches of it in a disc about the pixel give a hemisphere estimate.
 * The disc's radius is a fixed distance in the world, so a contact shadow
 * is the same size on a near box and a far one, clamped in pixels so a
 * distant pixel never scatters fetches across the frame. The disc is
 * turned per pixel by interleaved gradient noise, which trades banding for
 * a fine dither the ink pass's own antialiasing and the town's fxaa soften.
 *
 * Eight fetches is the whole cost, at full resolution, on High only. Low
 * and Medium compile without COMIC_AO and pay nothing, not even the branch.
 *
 * The including shader defines COMIC_AO_DEPTH(uv) as the linear view depth
 * in metres at uv, and provides the uniforms below.
 */
/* Unrolled, so the budget's tap counter (src/render/budget.js) counts the
 * eight fetches rather than flagging a loop it cannot see into. */
const AO_TAPS = Array.from({ length: 8 }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / 8).toFixed(6);
  const a = (i * 2.3999632).toFixed(6);
  return `    {
      float a = ang + ${a};
      vec2 suv = clamp( uv + vec2( cos( a ), sin( a ) ) * ( ${r} * px ) / uAoRes, vec2( 0.0 ), vec2( 1.0 ) );
      vec3 v = comicAoPos( suv, COMIC_AO_DEPTH( suv ) ) - P;
      float len = length( v ) + 1e-4;
      occ += max( 0.0, ( dot( N, v ) - COMIC_AO_QUANT ) / len - 0.12 ) * ( 1.0 - smoothstep( uAoRadius * 0.6, uAoRadius * 1.6, len ) );
    }`;
}).join('\n');

export const AO_GLSL = /* glsl */ `
  /*
   * How far a depth read can be off, in metres, as a height above the
   * surface a tap may stand and still count as the surface itself. The
   * field's prepass packs depth into 16 bits over its whole range, a code
   * every 4 cm (post.js), and a quad on the start pads looking down at
   * turf a metre away reads that staircase as occlusion: bands across the
   * lawn along every depth code (pass 12). The including shader defines it
   * from its own packing; the town's depth texture is fine enough for 0.
   */
  #ifndef COMIC_AO_QUANT
  #define COMIC_AO_QUANT 0.0
  #endif
  uniform vec2 uAoTanHalf;
  uniform vec2 uAoRes;
  uniform float uAoRadius;
  uniform float uAoStrength;
  uniform float uAoFar;

  vec3 comicAoPos( vec2 uv, float d ) {
    return vec3( ( uv * 2.0 - 1.0 ) * uAoTanHalf * d, -d );
  }

  /* 1 is open, 0 is fully occluded. N is the view space normal, facing the
   * camera. */
  float comicAo( vec2 uv, vec3 P, vec3 N ) {
    float d = -P.z;
    if ( d > uAoFar ) {
      return 1.0;
    }
    float px = uAoRadius / ( d * uAoTanHalf.y ) * 0.5 * uAoRes.y;
    px = clamp( px, 3.0, 48.0 );
    float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    float ang = ign * 6.2831853;
    float occ = 0.0;
${AO_TAPS}
    occ /= 8.0;
    float fade = 1.0 - smoothstep( uAoFar * 0.6, uAoFar, d );
    return 1.0 - clamp( occ * uAoStrength * 1.6, 0.0, 0.85 ) * fade;
  }
`;

/* The colour occlusion darkens toward: a cool, deep violet rather than
 * black, so occluded corners stay in the same warm light, cool shadow
 * logic as the ramps. */
export const AO_TINT_GLSL = 'vec3( 0.32, 0.30, 0.46 )';

export function aoUniforms() {
  return {
    uAoTanHalf: { value: new THREE.Vector2(1, 1) },
    uAoRes: { value: new THREE.Vector2(1, 1) },
    uAoRadius: { value: 1.2 },
    uAoStrength: { value: 2.6 },
    uAoFar: { value: 90 },
  };
}

/* Called per frame by each pipeline: the camera's frustum, which a
 * pilot's FOV setting or a resize can change at any moment. */
export function updateAoCamera(u, camera, w, h) {
  const t = Math.tan((camera.fov * Math.PI) / 360);
  u.uAoTanHalf.value.set(t * camera.aspect, t);
  u.uAoRes.value.set(w, h);
}

/* Whether the preset in force wants the occlusion. Read at pipeline build;
 * a preset change rebuilds the world, and so the pipeline. */
let aoOn = true;
export function comicAoOn() {
  return aoOn;
}

/* The vendored ink pass's lines the occlusion is inserted at, exactly as
 * src/maps/city/vendored/core/post.js has them. If an update changes
 * either, nothing is inserted and the pipeline draws as before. */
const INK_MAIN_AT = `    void main() {
      vec3 col = texture2D( tDiffuse, vUv ).rgb;`;
const INK_LINE_AT = '      vec3 line = mix( uInk, col * 0.42, 0.22 );';

function addPipelineAo(pipeline) {
  const mat = pipeline.ink && pipeline.ink.mat;
  if (!mat) {
    return false;
  }
  const fs = mat.fragmentShader;
  if (!fs.includes(INK_MAIN_AT) || !fs.includes(INK_LINE_AT)) {
    return false;
  }
  mat.fragmentShader = fs
    .replace(INK_MAIN_AT, `    #define COMIC_AO_DEPTH(uv) linearDepth(uv)
${AO_GLSL}
${INK_MAIN_AT}`)
    .replace(INK_LINE_AT, `      /* The comic layer's occlusion: src/render/comic.js. No normal
       * buffer here, so the depth's own derivative. */
      {
        vec3 aoP = comicAoPos( vUv, dc );
        vec3 aoN = normalize( cross( dFdx( aoP ), dFdy( aoP ) ) );
        aoN *= sign( dot( aoN, -aoP ) + 1e-6 );
        col *= mix( ${AO_TINT_GLSL}, vec3( 1.0 ), comicAo( vUv, aoP, aoN ) );
      }
${INK_LINE_AT}`);
  Object.assign(mat.uniforms, aoUniforms());
  mat.needsUpdate = true;
  /* The frustum, per frame, before the pipeline's own render. */
  const render = pipeline.render;
  pipeline.render = function comicRender(...args) {
    updateAoCamera(mat.uniforms, this.camera, this.size.x, this.size.y);
    return render.apply(this, args);
  };
  return true;
}
