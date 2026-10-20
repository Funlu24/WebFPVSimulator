/*
 * post.js: the post processing chain.
 *
 * Three passes at full resolution, and they are three rather than four
 * because P3 allows four and the frame has to keep one in hand:
 *
 * 1. A geometry prepass into one RGBA8 target, then an edge pass over it.
 *    The prepass packs the view space normal into rg and a linear view
 *    depth into ba, so the edge pass reads normal and depth in the same
 *    fetch. Inverted hull outlines only give you a silhouette around an
 *    object; an edge pass over depth and normals also finds the creases
 *    inside it and the line where an object meets the ground, which is
 *    what reads as ink.
 *
 *    The same five geometry fetches also drive the antialiasing. There is
 *    no separate resolve: the composer target carries no multisampling,
 *    because 4x multisampling an RGBA16F target at 1080p costs 116 MB and
 *    the whole render target budget is 120 MB. The edge pass already knows
 *    where every silhouette in the frame is and which way it runs, so it
 *    resolves them with two colour taps along the depth gradient. The ink
 *    threshold is deliberately high, so it has its own much lower coverage
 *    threshold: a silhouette too subtle to ink still gets resolved.
 *
 * 2. Bloom, kept deliberately tight and low. This is here only to make the
 *    gate rings and the sun glow, which pulls the eye to the next gate.
 *
 * 3. A grade, which is also the output pass: mild FPV barrel distortion, a
 *    highlight shoulder, restrained colour adjustment, a vignette, and the
 *    sRGB transfer. It does
 *    the transfer itself rather than handing the frame to an OutputPass,
 *    because that was a fourth full resolution pass and a fourteenth
 *    texture tap to apply one curve.
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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/*
 * Depth is packed into two 8 bit channels rather than kept in a depth
 * texture, which is what takes the edge pass from eleven texture fetches
 * per pixel to six. The pair carries 16 bits over the whole 0.2 m to
 * 2600 m range, so a depth code is 4 cm everywhere. A 24 bit perspective
 * depth buffer has far more precision than that near the camera and far
 * less than that past a few hundred metres, which is exactly the wrong way
 * round for finding a mountain silhouette against another mountain.
 */
const PACK_GLSL = /* glsl */ `
  vec2 packDepth16(float v) {
    vec2 r = vec2(v, fract(v * 255.0));
    r.x -= r.y / 255.0;
    return r;
  }
  float unpackDepth16(vec2 p) {
    return p.x + p.y * (1.0 / 255.0);
  }
`;

const GEO_VERT = /* glsl */ `
  varying vec3 vNormalView;
  varying float vViewDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalMatrix * normal;
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

function geoFragment(sentinel) {
  return /* glsl */ `
    uniform float uNear;
    uniform float uFar;
    varying vec3 vNormalView;
    varying float vViewDepth;
    ${PACK_GLSL}
    void main() {
      float d = clamp((vViewDepth - uNear) / (uFar - uNear), 0.0, 1.0);
      ${sentinel
        ? 'gl_FragColor = vec4(0.0, 0.0, packDepth16(d));'
        : `vec3 n = normalize(vNormalView);
      gl_FragColor = vec4(n.xy * 0.5 + 0.5, packDepth16(d));`}
    }
  `;
}

const OutlineShader = {
  uniforms: {
    tDiffuse: { value: null },
    tGeo: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uLineColor: { value: new THREE.Color(0x1a2230) },
    uDepthBias: { value: 0.0016 },
    /* High enough that the roughly 42 degree facet dihedral of the low
     * poly canopies and rocks stays clean (normal delta about 0.7 per
     * sample pair) while true corners near 90 degrees (delta 1.4) still
     * ink. Facet creases were turning every near tree into a wire mesh. */
    uNormalBias: { value: 1.05 },
    uStrength: { value: 0.0 },
    /* A twentieth of the ink threshold. Coverage is wanted on every
     * silhouette in the frame; ink is wanted only on the ones that read as
     * drawn. */
    uAaBias: { value: 0.00008 },
    uAaAmount: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tGeo;
    uniform vec2 uResolution;
    uniform vec3 uLineColor;
    uniform float uDepthBias;
    uniform float uNormalBias;
    uniform float uStrength;
    uniform float uAaBias;
    uniform float uAaAmount;
    ${PACK_GLSL}

    /* Only xy is stored. z is reconstructed positive, which is what a
     * front facing surface has in view space anyway, and the two places it
     * is read (the crease term and the grazing angle term) both want a
     * magnitude rather than a sign. */
    vec3 decodeNormal(vec2 e) {
      vec2 n = e * 2.0 - 1.0;
      return vec3(n, sqrt(max(0.0, 1.0 - dot(n, n))));
    }

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec4 base = texture2D(tDiffuse, vUv);

      /* Five fetches, normal and depth in each. Clamped: sampling one
       * texel outside the frame wraps and pulls in the opposite edge,
       * which paints a false band along the border. */
      vec4 g0 = texture2D(tGeo, vUv);
      vec4 g1 = texture2D(tGeo, clamp(vUv + vec2( texel.x,  texel.y), vec2(0.0), vec2(1.0)));
      vec4 g2 = texture2D(tGeo, clamp(vUv + vec2(-texel.x, -texel.y), vec2(0.0), vec2(1.0)));
      vec4 g3 = texture2D(tGeo, clamp(vUv + vec2( texel.x, -texel.y), vec2(0.0), vec2(1.0)));
      vec4 g4 = texture2D(tGeo, clamp(vUv + vec2(-texel.x,  texel.y), vec2(0.0), vec2(1.0)));

      float d0 = unpackDepth16(g0.zw);
      float d1 = unpackDepth16(g1.zw);
      float d2 = unpackDepth16(g2.zw);
      float d3 = unpackDepth16(g3.zw);
      float d4 = unpackDepth16(g4.zw);
      // Roberts cross over depth, and a normal difference for creases the
      // depth pass cannot see (a fold where both faces are equidistant).
      float depthEdge = length(vec2(d1 - d2, d3 - d4));

      vec3 n0 = decodeNormal(g0.xy);
      float normalEdge =
        length(decodeNormal(g1.xy) - decodeNormal(g2.xy)) +
        length(decodeNormal(g3.xy) - decodeNormal(g4.xy));

      /* Grass and sky pixels: rg stamped to zero, a value no encoded
       * normal can take, because rg is n.xy * 0.5 + 0.5 and reaching zero
       * in both would need an xy of length 1.41. Ink is suppressed on them
       * and within one texel of them, so blades are not outlined and
       * nothing is outlined through them. Their depth is still written and
       * still read, which is what stops the ink pass drawing the
       * silhouettes of gate legs behind the grass as empty rectangles
       * floating in the meadow. */
      float grass = step(length(g0.xy), 0.02);
      float grassNear = max(
        max(step(length(g1.xy), 0.02), step(length(g2.xy), 0.02)),
        max(step(length(g3.xy), 0.02), step(length(g4.xy), 0.02))
      );

      /* A surface seen edge on has a huge depth gradient of its own, and a
       * flat threshold inks it: the meadow carried a three pixel ink line
       * across the full width of the frame, with the same colour on both
       * sides of it. Divide the threshold by how square on the surface is,
       * using the view space normal the prepass already wrote. */
      float facing = max(abs(n0.z), 0.12);
      float distScale = (1.0 + d0 * 260.0) / facing;

      /*
       * Antialiasing, paid for entirely by fetches the ink already made.
       * This is the frame's only antialiasing: the composer target carries
       * no multisampling, because 4x on RGBA16F at 1080p is 116 MB against
       * a 120 MB budget for every render target in the renderer.
       *
       * The two taps go ALONG the silhouette, not across it. The first
       * version of this shader sampled across, on the reasoning that
       * mixing the two sides of an edge softens the step, and a reviewer
       * measured what that actually does: the sub pixel crossing of a near
       * vertical edge held still for three rows and then jumped a pixel
       * and a half, a period four staircase that 4x multisampling did not
       * have, while the frame got softer everywhere. Second difference RMS
       * of the crossing was 0.452 against multisampling's 0.304.
       *
       * A staircase is a discontinuity ALONG the edge, so that is where it
       * has to be filtered. grad is the depth gradient, which points
       * across; its perpendicular runs along. A one sample depth buffer
       * carries no sub pixel coverage to recover, so this cannot equal
       * multisampling, but filtering along the edge attacks the staircase
       * itself rather than its contrast.
       */
      vec2 grad = vec2((d1 + d3) - (d2 + d4), (d1 + d4) - (d2 + d3));
      float glen = length(grad);
      vec2 dir = glen > 1e-8 ? grad / glen : vec2(0.0, 0.0);
      vec2 along = vec2(-dir.y, dir.x);
      /* Grass writes a sentinel normal, so its reconstructed z is 0 and
       * facing clamps to its 0.12 floor, which inflated the coverage
       * threshold about eightfold on exactly the 184000 sub pixel blades
       * that need resolving most. The ink term still wants the grazing
       * angle division; the coverage term does not. */
      float aaScale = mix(distScale, 1.0 + d0 * 260.0, grass);
      float aaT = uAaBias * aaScale;
      float aa = smoothstep(aaT, aaT * 5.0, depthEdge) * uAaAmount;
      vec3 c1 = texture2D(tDiffuse, clamp(vUv + along * texel, vec2(0.0), vec2(1.0))).rgb;
      vec3 c2 = texture2D(tDiffuse, clamp(vUv - along * texel, vec2(0.0), vec2(1.0))).rgb;
      vec3 resolved = mix(base.rgb, (base.rgb * 2.0 + c1 + c2) * 0.25, aa);

      /* Ink. smoothstep rather than step on both terms: a binary edge test
       * draws a binary line, and an aliased ink line on an antialiased
       * silhouette is worse than no antialiasing at all. */
      float dt = uDepthBias * distScale;
      float de = smoothstep(dt, dt * 1.7, depthEdge);
      // Crease lines are a near field effect. Past a short distance they
      // turn low poly scenery into a wire mesh, so fade them out early
      // and leave silhouettes to the depth term alone.
      float nearness = 1.0 - smoothstep(0.010, 0.055, d0);
      float ne = smoothstep(uNormalBias, uNormalBias * 1.35, normalEdge) * nearness;
      float edge = clamp(max(de, ne), 0.0, 1.0) * uStrength * (1.0 - max(grass, grassNear));
      // never draw on the sky, and let very distant geometry go clean
      edge *= step(d0, 0.999) * (1.0 - smoothstep(0.16, 0.42, d0));

      // Konturlari (murekkebi) tamamen kapatip antialiasing sonucunu koruyoruz:
      edge = 0.0;

      gl_FragColor = vec4(mix(resolved, uLineColor, edge), base.a);
    }
  `,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uDistort: { value: 0.04 },
    uVignette: { value: 0.09 },
    uVibrance: { value: 0.07 },
    uAoTexel: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.2 },
    uFar: { value: 2600 },
    uAoStrength: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uDistort;
    uniform float uVignette;
    uniform float uVibrance;
    uniform sampler2D tDepth;
    uniform vec2 uAoTexel;
    uniform float uNear;
    uniform float uFar;
    uniform float uAoStrength;

    float linearDepth(vec2 uv) {
      float d = texture2D(tDepth, clamp(uv, vec2(0.001), vec2(0.999))).x;
      return (uNear * uFar) / max(uFar - d * (uFar - uNear), 0.0001);
    }

    void main() {
      // FPV lens: mild barrel distortion, zoom compensated so the
      // corners never sample outside the frame.
      vec2 uv = vUv - 0.5;
      float r2 = dot(uv, uv);
      vec2 duv = 0.5 + uv * (1.0 + uDistort * r2) / (1.0 + uDistort * 0.5);
      vec3 c = texture2D(tDiffuse, duv).rgb;

      if (uAoStrength > 0.0) {
        float rawDepth = texture2D(tDepth, vUv).x;
        if (rawDepth < 0.9999) {
          float centre = linearDepth(vUv);
          float radius = max(0.18, centre * 0.012);
          float bias = max(0.025, centre * 0.0015);
          vec2 step1 = uAoTexel * 2.0;
          vec2 step2 = uAoTexel * 4.0;
          float occlusion = 0.0;
          occlusion += smoothstep(bias, bias + radius, centre - linearDepth(vUv + vec2(step1.x, 0.0)));
          occlusion += smoothstep(bias, bias + radius, centre - linearDepth(vUv - vec2(step1.x, 0.0)));
          occlusion += smoothstep(bias, bias + radius, centre - linearDepth(vUv + vec2(0.0, step1.y)));
          occlusion += smoothstep(bias, bias + radius, centre - linearDepth(vUv - vec2(0.0, step1.y)));
          occlusion += smoothstep(bias, bias + radius, centre - linearDepth(vUv + vec2(step2.x, 0.0)));
          occlusion += smoothstep(bias, bias + radius, centre - linearDepth(vUv - vec2(step2.x, 0.0)));
          occlusion += smoothstep(bias, bias + radius, centre - linearDepth(vUv + vec2(0.0, step2.y)));
          occlusion += smoothstep(bias, bias + radius, centre - linearDepth(vUv - vec2(0.0, step2.y)));
          c *= 1.0 - min(0.16, occlusion * 0.02) * uAoStrength;
        }
      }

      // Highlight shoulder: everything above the knee rolls off smoothly
      // instead of clipping, so the sky and bloom keep their hue.
      vec3 h = max(c - 0.8, vec3(0.0));
      c = min(c, vec3(0.8)) + h / (1.0 + h);

      // Keep the grade close to neutral so material and time-of-day colours
      // survive the post pass instead of inheriting a pronounced blue lift.
      vec3 lift = vec3(0.002, 0.002, 0.003);
      c = c * (1.0 - lift) + lift;
      c *= vec3(1.015, 1.005, 0.99);

      // Vibrance: push saturation hardest where there is least of it, so
      // flat mid tones enrich without neon-ing what is already saturated.
      float mx = max(c.r, max(c.g, c.b));
      float mn = min(c.r, min(c.g, c.b));
      float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, 1.0 + uVibrance * (1.0 - sat));

      // Vignette, wide and shallow: frames the view without reading as a
      // dirty lens.
      c *= 1.0 - uVignette * smoothstep(0.18, 0.52, r2);

      /* The scene draw already applies the renderer's tone mapping. This
       * final curve handles sRGB after the grade without an extra full-size
       * OutputPass. */
      c = clamp(c, vec3(0.0), vec3(1.0));
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(c, vec3(0.41666667)) - 0.055;
      gl_FragColor = vec4(mix(lo, hi, step(vec3(0.0031308), c)), 1.0);
    }
  `,
};

export function buildComposer(renderer, scene, camera, quality) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const dpr = renderer.getPixelRatio();
  const w = Math.max(1, Math.floor(size.x * dpr));
  const h = Math.max(1, Math.floor(size.y * dpr));
  /* High (or an omitted quality) keeps both. Low drops the outline prepass
   * and bloom; Medium drops bloom and keeps the ink, which is also the
   * field's antialiasing. See src/render/quality.js. */
  const fieldQ = quality && quality.field ? quality.field : null;
  const wantOutline = !fieldQ || fieldQ.outline !== false;
  const wantBloom = !fieldQ || fieldQ.bloom !== false;

  let normalTarget = null;
  let geoUniforms = null;
  let normalMaterial = null;
  let grassMaskMaterial = null;
  const GEO_CLEAR = new THREE.Color(0, 0, 1);
  if (wantOutline) {
    normalTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    geoUniforms = {
      uNear: { value: camera.near },
      uFar: { value: camera.far },
    };
    normalMaterial = new THREE.ShaderMaterial({
      uniforms: geoUniforms,
      vertexShader: GEO_VERT,
      fragmentShader: geoFragment(false),
    });
    grassMaskMaterial = new THREE.ShaderMaterial({
      uniforms: geoUniforms,
      vertexShader: GEO_VERT,
      fragmentShader: geoFragment(true),
    });
  }

  const composerTarget = new THREE.WebGLRenderTarget(w, h, wantOutline || wantBloom ? {
    type: THREE.HalfFloatType,
  } : {
    colorSpace: THREE.SRGBColorSpace,
  });
  const wantAo = Boolean(quality && quality.id === 'high');
  if (wantAo) {
    /* The colour pass already writes scene depth. A depth texture exposes it
     * to the existing grade pass, so High gets contact shading without a
     * second scene render or another full-resolution colour target. */
    composerTarget.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    composerTarget.depthTexture.format = THREE.DepthFormat;
  }
  const composer = new EffectComposer(renderer, composerTarget);
  composer.addPass(new RenderPass(scene, camera));

  let outline = null;
  if (wantOutline) {
    outline = new ShaderPass(OutlineShader);
    outline.uniforms.tGeo.value = normalTarget.texture;
    outline.uniforms.uResolution.value.set(w, h);
    composer.addPass(outline);
  }

  let bloom = null;
  if (wantBloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.55, 0.78);
    for (const rt of bloomTargets(bloom)) {
      rt.depthBuffer = false;
    }
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  if (wantAo) {
    grade.uniforms.tDepth.value = composer.renderTarget1.depthTexture;
    grade.uniforms.uAoStrength.value = 1;
    grade.uniforms.uAoTexel.value.set(1 / w, 1 / h);
    grade.uniforms.uNear.value = camera.near;
    grade.uniforms.uFar.value = camera.far;
  }
  composer.addPass(grade);

  const swaps = composer.passes.filter((p) => p.needsSwap).length;
  if (swaps % 2 === 0) {
    composer.writeBuffer.depthBuffer = false;
  }

  const PREPASS_DEPTH_LAYER = 3;
  if (wantOutline) {
    promoteToPrepass(scene, PREPASS_DEPTH_LAYER);
  }
  const prevClear = new THREE.Color();

  function renderNormals() {
    if (!wantOutline) {
      return;
    }
    const prevBg = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevFog = scene.fog;
    const prevAutoClear = renderer.autoClear;
    renderer.getClearColor(prevClear);
    const prevClearAlpha = renderer.getClearAlpha();
    scene.background = null;
    scene.fog = null;

    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(normalTarget);
    renderer.setClearColor(GEO_CLEAR, 0);

    const prevMask = camera.layers.mask;
    geoUniforms.uNear.value = camera.near;
    geoUniforms.uFar.value = camera.far;

    scene.overrideMaterial = normalMaterial;
    camera.layers.mask = 1 << 0;
    renderer.clear();
    renderer.render(scene, camera);

    scene.overrideMaterial = grassMaskMaterial;
    camera.layers.mask = (1 << 2) | (1 << PREPASS_DEPTH_LAYER);
    renderer.autoClear = false;
    renderer.render(scene, camera);

    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevClear, prevClearAlpha);
    camera.layers.mask = prevMask;
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    scene.fog = prevFog;
  }

  function setSize(width, height) {
    const p = renderer.getPixelRatio();
    const bw = Math.max(1, Math.floor(width * p));
    const bh = Math.max(1, Math.floor(height * p));

    composer.setPixelRatio(p);
    composer.setSize(width, height);
    if (normalTarget) {
      normalTarget.setSize(bw, bh);
    }
    if (outline) {
      outline.uniforms.uResolution.value.set(bw, bh);
    }
    if (wantAo) {
      grade.uniforms.uAoTexel.value.set(1 / bw, 1 / bh);
      grade.uniforms.uNear.value = camera.near;
      grade.uniforms.uFar.value = camera.far;
    }
    if (bloom) {
      for (const rt of bloomTargets(bloom)) {
        rt.depthBuffer = false;
      }
    }
  }

  return {
    scene,
    render() {
      renderNormals();
      composer.render();
    },
    setSize,
    dispose() {
      const rts = [composer.renderTarget1, composer.renderTarget2];
      if (normalTarget) {
        rts.push(normalTarget);
      }
      for (const rt of rts) {
        rt.dispose();
      }
      if (bloom) {
        bloom.dispose();
      }
      if (outline) {
        outline.material.dispose();
      }
      grade.material.dispose();
      composer.copyPass.material.dispose();
      if (normalMaterial) {
        normalMaterial.dispose();
      }
      if (grassMaskMaterial) {
        grassMaskMaterial.dispose();
      }
    },
    outline,
    inkStrength: outline ? outline.uniforms.uStrength.value : undefined,
    bloom,
    grade,
    composer,
    normalTarget,
  };
}

function promoteToPrepass(scene, layer) {
  const ONLY_LAYER_1 = 1 << 1;
  scene.traverse((obj) => {
    if (!obj.isMesh || (obj.layers.mask & ONLY_LAYER_1) === 0) {
      return;
    }
    if ((obj.layers.mask & 1) !== 0) {
      return;
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const occludes = mats.every((m) => m
      && m.depthWrite !== false
      && (m.blending === undefined || m.blending === THREE.NormalBlending));
    if (occludes) {
      obj.layers.enable(layer);
    }
  });
}

function bloomTargets(bloom) {
  const out = [];
  if (bloom.renderTargetBright) {
    out.push(bloom.renderTargetBright);
  }
  for (const list of [bloom.renderTargetsHorizontal, bloom.renderTargetsVertical]) {
    for (const rt of list || []) {
      out.push(rt);
    }
  }
  return out;
}
