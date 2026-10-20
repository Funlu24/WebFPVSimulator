/*
 * celmat.js: the cel shading model.
 *
 * The thing that separates a good cel shaded world from a flat one is not
 * the banding, it is that light and shadow are different HUES, not the
 * same hue at two brightnesses. Sunlit surfaces go warm, shadowed surfaces
 * go toward the blue of the sky bouncing into them. Breath of the Wild
 * leans on this constantly and it is why its shadows read as air rather
 * than as dirt.
 *
 * That is done here with a coloured gradient ramp. Three.js samples
 * MeshToonMaterial's gradientMap by N dot L and multiplies the result into
 * the base colour, so an RGB ramp that runs cool to warm gives the split
 * for free while keeping Three's own shadow, fog and light machinery.
 *
 * On top, onBeforeCompile injects two things Three's toon material does
 * not have: a fresnel rim light tinted toward the sky, which separates
 * silhouettes from the background at distance, and a specular band for a
 * hard painted highlight on the craft.
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

/* Grafik ayarlarından Toon / Gerçekçi geçişi yapabilmek için dışarı açtık */
export let REALISTIC = true;
export function setRealisticStyle(enabled) {
  REALISTIC = enabled;
}

/*
 * Three.js samples the toon gradient map as
 *   return vec3( texture2D( gradientMap, coord ).r );
 * that is, it takes the red channel and splats it to grey. The whole
 * point of the ramp below is that shadow and light are different HUES,
 * and that is thrown away before it reaches a single pixel: every
 * shadowed surface comes out as a grey copy of the lit one, which is
 * exactly what a flat, cheap looking stylised render is.
 *
 * Patch the chunk once, at import, so the ramp is sampled in colour. This
 * keeps all of Three's shadow, fog and light plumbing intact. The guard
 * matters: a Three version bump that rewords this line would otherwise
 * silently drop the renderer back to greyscale with nothing to show for
 * it, and that is a bug nobody would find by looking at the code.
 */
{
  const before = THREE.ShaderChunk.gradientmap_pars_fragment;
  const after = before.replace(
    'vec3( texture2D( gradientMap, coord ).r )',
    'texture2D( gradientMap, coord ).rgb',
  );
  if (after === before) {
    throw new Error(
      'celmat: could not patch gradientmap_pars_fragment for RGB toon ramps. ' +
        'Three.js changed the chunk; the cel shading would silently render grey.',
    );
  }
  THREE.ShaderChunk.gradientmap_pars_fragment = after;
}

/*
 * Four band ramp, cool shadow to warm light. The steps are deliberately
 * uneven: a wide lit band, a narrow terminator, then two shadow bands, so
 * most of a curved surface reads as one flat shape with a crisp edge,
 * which is what makes it look drawn rather than shaded.
 */
function celRamp() {
  const stops = [
    [0.30, 0.38, 0.62], /* deep shadow, sky blue bounce */
    [0.42, 0.51, 0.72], /* shadow */
    [0.94, 0.80, 0.62], /* terminator, warm sliver where light wraps */
    [1.00, 0.97, 0.88], /* sunlit */
  ];
  const width = 64;
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i += 1) {
    const t = i / (width - 1);
    /* Hard steps with a one texel soft edge so it does not alias. */
    let band = 0;
    if (t > 0.36) band = 1;
    if (t > 0.46) band = 2;
    if (t > 0.53) band = 3;
    const c = stops[band];
    data[i * 4 + 0] = Math.round(c[0] * 255);
    data[i * 4 + 1] = Math.round(c[1] * 255);
    data[i * 4 + 2] = Math.round(c[2] * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

let RAMP = null;
export function celRampTexture() {
  if (!RAMP) {
    RAMP = celRamp();
  }
  return RAMP;
}

const RIM_CHUNK = /* glsl */ `
  vec3 celN = normalize(vNormal);
  vec3 celV = normalize(vViewPosition);
  float celRim = 1.0 - max(dot(celN, celV), 0.0);
  celRim = smoothstep(uRimStart, 1.0, celRim);
  /*
   * Falloff, not a step. This used to be step(0.5, celRim), on the theory
   * that a quantised rim matches the quantised diffuse ramp. It does not:
   * the diffuse ramp is quantised across a whole surface, where the bands
   * read as light. A quantised rim is only ever a few pixels wide, so it
   * lands as a flat slab of constant colour hugging the silhouette, with
   * the ink outline on one side and the surface on the other. Measured on
   * a canopy edge that was a five pixel plateau at 0.296 between
   * neighbours at 0.139 and 0.121. Cubing the smoothstep keeps the rim
   * tight against the edge while giving it a gradient, so it reads as
   * light wrapping round the form.
   */
  celRim = celRim * celRim * celRim;
  /*
   * Couple the rim to the surface under it. A fixed pale colour added at
   * a fixed strength is the same absolute lift on a near black craft body
   * as on a white gate panel, which makes the rim the brightest thing in
   * frame on every dark asset. Scaling by the surface's own luminance
   * keeps the rim subordinate to what it is rimming.
   */
  float celRimLum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float celRimFit = mix(0.30, 1.0, clamp(celRimLum * 1.7, 0.0, 1.0));
  gl_FragColor.rgb += uRimColor * (celRim * uRimStrength * celRimFit);

  float celSpec = max(dot(reflect(-celV, celN), normalize(uSpecDir)), 0.0);
  celSpec = step(0.985 - uSpecWidth, celSpec);
  gl_FragColor.rgb += uSpecColor * celSpec * uSpecStrength;
`;

/*
 * Cloud shadows. Slow, soft shapes crawling across the landscape are the
 * single strongest signal that a stylised world is alive rather than a
 * diorama: they break up large flat areas, they give the terrain a sense
 * of scale, and they make the light feel like it comes from a sky rather
 * than from a lamp. Sampled from procedural noise at world position, so
 * there is no texture to load and it costs a handful of instructions.
 */
export const CLOUD_SHADOW_GLSL = /* glsl */ `
  float celHash(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }
  float celNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(celHash(i), celHash(i + vec2(1.0, 0.0)), f.x),
                mix(celHash(i + vec2(0.0, 1.0)), celHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float celCloudShadow(vec2 world, float t) {
    vec2 p = world * 0.0032 + vec2(t * 0.010, t * 0.006);
    float n = celNoise(p) * 0.6 + celNoise(p * 2.3) * 0.3 + celNoise(p * 4.7) * 0.1;
    // wide soft edge: hard edged cloud shadows read as texture, not shadow
    return smoothstep(0.46, 0.66, n);
  }
`;

let cloudShadowsOn = 1;

export function setCelCloudShadows(on) {
  cloudShadowsOn = on === false ? 0 : 1;
}

const registered = new Map();

export function updateCelTime(t) {
  for (const u of registered.values()) {
    u.value = t;
  }
}

export function celTimeCount() {
  return registered.size;
}

export const CLOTH_CHUNK = /* glsl */ `
  {
    vec3 clothWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    float clothPh = uCelTime * 2.9 + clothWorld.x * 0.55 + clothWorld.z * 0.41;
    /* Squared, so the seam is still and the free edge carries the travel. */
    float clothAmt = aCloth.x * aCloth.x;
    float clothFlap =
      sin(clothPh + aCloth.y * 3.4) * 0.62 +
      sin(clothPh * 1.73 + aCloth.x * 5.1) * 0.38;
    transformed += normalize(normal) * (clothFlap * clothAmt * uCloth);
    /* A little lift on the free edge as it snaps, so the cloth reads as
     * light fabric rather than as a swinging plank. */
    transformed.y += clothFlap * clothAmt * uCloth * 0.22;
  }
`;

export const FLAG_SAIL_CLOTH = 0.085;

export function celMaterial(opts = {}) {
  if (opts.map && !opts.key) {
    throw new Error('celmat: a material with a map needs an explicit key');
  }

  let mat;
  // Grafik ayarına göre Gerçekçi veya Cel Shader materyal seçimi
  if (REALISTIC) {
    mat = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.map ?? null,
      roughness: 0.85, // Gerçekçi mat yüzeyler için varsayılan pürüzlülük
      metalness: 0.1,
      alphaTest: opts.alphaTest ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      fog: opts.fog ?? true,
    });
  } else {
    mat = new THREE.MeshToonMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.map ?? null,
      alphaTest: opts.alphaTest ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      fog: opts.fog ?? true,
    });
  }

  const rimColor = new THREE.Color(opts.rimColor ?? 0x9ec8ff);
  const specColor = new THREE.Color(opts.specColor ?? 0xffffff);
  const cloud = (opts.cloudShadow ?? 0) * cloudShadowsOn;
  const cloth = opts.cloth ?? 0;

  const clothDecl = cloth > 0 ? 'attribute vec2 aCloth;' : '';
  const clothBody = cloth > 0 ? CLOTH_CHUNK : '';

  // onBeforeCompile Her iki mod için de çalışmalı (Bulutlar ve Kumaşlar kopmasın diye)
  mat.onBeforeCompile = (shader) => {
    // Ortak Uniformlar (Bulut ve Kumaş)
    shader.uniforms.uCloth = { value: cloth };
    shader.uniforms.uCloudShadow = { value: cloud };
    shader.uniforms.uCelTime = { value: 0 };
    shader.uniforms.uCloudTint = { value: new THREE.Color(0x8397be) };

    // Sadece Toon Modda Geçerli Olanlar (Rim ve Specular)
    if (!REALISTIC) {
      shader.uniforms.uRimColor = { value: rimColor };
      shader.uniforms.uRimStrength = { value: opts.rim ?? 0.32 };
      shader.uniforms.uRimStart = { value: opts.rimStart ?? 0.55 };
      shader.uniforms.uSpecColor = { value: specColor };
      shader.uniforms.uSpecStrength = { value: opts.spec ?? 0.0 };
      shader.uniforms.uSpecWidth = { value: opts.specWidth ?? 0.01 };
      shader.uniforms.uSpecDir = { value: new THREE.Vector3(0.45, 0.8, 0.4) };
    }

    if (!registered.has(mat)) {
      mat.addEventListener('dispose', () => {
        registered.delete(mat);
      });
    }
    registered.set(mat, shader.uniforms.uCelTime);

    // Kumaş dalgalanması (Vertex Shader) her iki moda da enjekte edilir
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vCelWorld;
         uniform float uCelTime;
         uniform float uCloth;
         ${clothDecl}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         ${clothBody}
         vCelWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    // Fragment Shader: Uniform Tanımlamaları
    let uniformsFragment = `
         varying vec3 vCelWorld;
         uniform float uCloudShadow;
         uniform float uCelTime;
         uniform vec3 uCloudTint;
         ${CLOUD_SHADOW_GLSL}
    `;

    if (!REALISTIC) {
      uniformsFragment += `
         uniform vec3 uRimColor;
         uniform float uRimStrength;
         uniform float uRimStart;
         uniform vec3 uSpecColor;
         uniform float uSpecStrength;
         uniform float uSpecWidth;
         uniform vec3 uSpecDir;
      `;
    }

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       ${uniformsFragment}`
    );

    // Fragment Shader: Renk İşlemleri
    let finalColorFragment = `
         if (uCloudShadow > 0.0) {
           float cs = celCloudShadow(vCelWorld.xz, uCelTime) * uCloudShadow;
           gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * uCloudTint * 1.35, cs);
         }
    `;

    // Rim ve Specular SADECE Toon Moddaysa enjekte edilir
    if (!REALISTIC) {
      finalColorFragment = RIM_CHUNK + finalColorFragment;
    }

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       ${finalColorFragment}`
    );
  };

  // Cache anahtarına materyal modunu da ekledik
  mat.customProgramCacheKey = () => `cel${clothDecl}${clothBody}${REALISTIC ? 'pbr' : 'toon'}`;
  mat.userData.cel = true;
  mat.userData.celKey = opts.key ?? JSON.stringify(opts);
  return mat;
}

/*
 * Inverted hull outline iptal edildi! (1. Maddenin tam kapanması)
 */
export function outlineHull(mesh, thickness = 1.05, color = 0x141a24) {
  return mesh; // Stilize görünümdeki ekstra kalın çizgileri kapattık!

  /* ESKİ KODLAR:
  const hull = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true }),
  );
  hull.material.userData.hullColor = color;
  hull.scale.multiplyScalar(thickness);
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.userData.isOutline = true;
  mesh.add(hull);
  return mesh;
  */
}