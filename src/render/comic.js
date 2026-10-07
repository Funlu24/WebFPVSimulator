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
 * one edit and no new pass, no new target and no new texture.
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
 * Render only. Nothing here reads or writes the physics state, and no
 * shader here samples a texture, so the budget's P4 cannot move.
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
};

/* Per preset. Low is the integrated laptop and the phone that has already
 * given up shadows and ink for fill rate; it keeps none of this, and the
 * guard in the shader is a uniform branch, so a zero skips the arithmetic
 * without a second program. */
const LEVELS = {
  low: { hatch: 0, grit: 0 },
  medium: { hatch: 1, grit: 1 },
  high: { hatch: 1, grit: 1 },
};

export function setComicQuality(q) {
  const id = q && q.id ? q.id : 'high';
  const lv = LEVELS[id] || LEVELS.high;
  COMIC.hatch.value = lv.hatch;
  COMIC.grit.value = lv.grit;
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
uniform vec3 uComicInk;
uniform float uComicLitLo;
uniform float uComicLitHi;
uniform float uComicDepth;
uniform float uComicWidth;
uniform float uComicPeriod;
uniform float uComicFadeNear;
uniform float uComicFadeFar;

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
  float seg = comicNoise( vec2( floor( x ) * 7.13, y * 0.42 ) );
  return cov * smoothstep( 0.30, 0.40, seg );
}

/*
 * One set of strokes, held at uComicPeriod pixels apart at any range. x0 is
 * the stroke coordinate at one stroke per metre; the octave that puts the
 * spacing nearest the period is drawn, blended into the next one up as the
 * range grows, so strokes neither pop nor crowd. The pen's weight wanders
 * with a world noise, which is the difference between a pen and a ruler.
 */
float comicSet( float x0, float y0, float fw0, float wobble, float weight ) {
  float lod = clamp( log2( uComicPeriod * fw0 ), -3.0, 10.0 );
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

  if ( uComicGrit > 0.0 ) {
    /* Paint grit: two octaves of mottle in the base colour, the hand
     * painted texture under a comic world's ink. Faded where its own
     * octave is finer than a couple of pixels, so it never shimmers. */
    vec2 gq = q * 1.9;
    float gfw = length( fwidth( gq ) );
    float g = comicNoise( gq ) * 0.55 + comicNoise( q * 0.37 + 17.0 ) * 0.45;
    float gAmt = ( 1.0 - smoothstep( 0.35, 0.9, gfw ) ) * 0.16 + 0.05;
    col *= 1.0 + ( g - 0.5 ) * gAmt * uComicGrit;
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
      float h1 = comicSet( xa, xb, fwa, wob, wt ) * smoothstep( 0.0, 0.35, shade );
      /* The crossing set only in deep shadow: a cast shadow, not the dark
       * side of the ramp, or every shaded face reads as a net. */
      float h2 = comicSet( xb, xa, fwb, -wob, wt ) * ( 1.0 - smoothstep( 0.12, 0.24, lit ) );
      float cov = max( h1, h2 ) * fade * uComicHatch;
      col = mix( col, col * 0.18 + uComicInk * 0.5, cov * uComicDepth );
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

function inject(shader) {
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
  shader.uniforms.uComicInk = COMIC.ink;
  shader.uniforms.uComicLitLo = COMIC.litLo;
  shader.uniforms.uComicLitHi = COMIC.litHi;
  shader.uniforms.uComicDepth = COMIC.depth;
  shader.uniforms.uComicWidth = COMIC.width;
  shader.uniforms.uComicPeriod = COMIC.period;
  shader.uniforms.uComicFadeNear = COMIC.fadeNear;
  shader.uniforms.uComicFadeFar = COMIC.fadeFar;
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
        inject(shader);
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
  const ink = pipeline.ink && pipeline.ink.mat && pipeline.ink.mat.uniforms;
  if (ink) {
    if (ink.uInk) {
      ink.uInk.value.setHex(INK_COLOR);
    }
    /* A little more sensitive, so more of the kit's creases are drawn. */
    if (ink.uSens) {
      ink.uSens.value *= 0.82;
    }
    if (ink.uConcaveAmount) {
      ink.uConcaveAmount.value = Math.min(1, ink.uConcaveAmount.value * 1.5);
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
