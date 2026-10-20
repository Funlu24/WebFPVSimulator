import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { PAL } from './palette.js';

/* ------------------------------------------------------------------ *
 * The 3D-to-2D pipeline.
 *
 *   scene  ->  rtScene (colour + depth texture)
 *          ->  ink pass      : screen-space line work from the depth buffer
 *          ->  grade pass    : restrained colour grade + linear->sRGB
 *          ->  fxaa pass     : clean up the line work, straight to screen
 *
 * Lines come from a *second difference* of linearised depth.  A first
 * difference would smear ink across the road wherever the surface is
 * grazing the camera; the second difference is flat across any planar
 * surface no matter how oblique, so it only fires on real silhouettes and
 * real creases.  Positive curvature (the near side of a silhouette, a
 * convex ridge) inks strongly; negative curvature (inside corners) inks
 * faintly, which mimics the lighter contact lines an animator draws.
 * ------------------------------------------------------------------ */

const INK_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.25 },
    uFar: { value: 600 },
    uInk: { value: new THREE.Color(PAL.ink) },
    uThickness: { value: 1.35 },
    uSens: { value: 0.0042 },
    uConcave: { value: 0.026 },
    uConcaveAmount: { value: 0.42 },
    uFadeStart: { value: 40.0 },
    uFadeEnd: { value: 98.0 },
    uStrength: { value: 0.52 },
    uSkyDepth: { value: 420.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4( position.xy, 0.0, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uNear, uFar;
    uniform vec3 uInk;
    uniform float uThickness, uSens, uConcave, uConcaveAmount;
    uniform float uFadeStart, uFadeEnd, uStrength, uSkyDepth;
    varying vec2 vUv;

    float linearDepth( vec2 uv ) {
      float d = texture2D( tDepth, uv ).x;
      return -perspectiveDepthToViewZ( d, uNear, uFar );
    }

    void main() {
      vec3 col = texture2D( tDiffuse, vUv ).rgb;

      vec2 t = uTexel * uThickness;
      float dc = linearDepth( vUv );

      if ( dc > uSkyDepth ) {
        // pure sky: nothing to ink
        gl_FragColor = vec4( col, 1.0 );
        return;
      }

      float dl = linearDepth( vUv - vec2( t.x, 0.0 ) );
      float dr = linearDepth( vUv + vec2( t.x, 0.0 ) );
      float du = linearDepth( vUv + vec2( 0.0, t.y ) );
      float dd = linearDepth( vUv - vec2( 0.0, t.y ) );

      // second difference of linear depth, normalised by distance
      float sx = ( dl + dr - 2.0 * dc ) / dc;
      float sy = ( du + dd - 2.0 * dc ) / dc;

      float convex  = max( 0.0,  sx ) + max( 0.0,  sy );
      float concave = max( 0.0, -sx ) + max( 0.0, -sy );

      float edge = smoothstep( uSens * 0.32, uSens, convex );
      edge = max( edge, smoothstep( uConcave, uConcave * 3.4, concave ) * uConcaveAmount );

      // let the background dissolve into the haze instead of getting busy
      edge *= 1.0 - smoothstep( uFadeStart, uFadeEnd, dc );
      edge *= uStrength;

      // ink keeps a whisper of the underlying hue so it never looks pasted on
      vec3 line = mix( uInk, col * 0.42, 0.22 );
      gl_FragColor = vec4( mix( col, line, clamp( edge, 0.0, 1.0 ) ), 1.0 );
    }
  `,
};

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uAoTexel: { value: new THREE.Vector2(1, 1) },
    uBloomTexel: { value: new THREE.Vector2(1, 1) },
    uBloomStrength: { value: 0 },
    uNear: { value: 0.25 },
    uFar: { value: 600 },
    uAoStrength: { value: 0 },
    uShadowTint: { value: new THREE.Color(0xbfc2c5) },
    uLightTint: { value: new THREE.Color(0xfffaf4) },
    uSaturation: { value: 0.99 },
    uLift: { value: 0.006 },
    uVignette: { value: 0.03 },
    uWarmth: { value: 0.008 },
  },
  vertexShader: INK_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tDepth;
    uniform vec3 uShadowTint, uLightTint;
    uniform float uSaturation, uLift, uVignette, uWarmth;
    uniform vec2 uAoTexel, uBloomTexel;
    uniform float uNear, uFar, uAoStrength, uBloomStrength;
    varying vec2 vUv;

    float linearDepth(vec2 uv) {
      float d = texture2D(tDepth, clamp(uv, vec2(0.001), vec2(0.999))).x;
      return (uNear * uFar) / max(uFar - d * (uFar - uNear), 0.0001);
    }

    vec3 linearToSRGB( vec3 c ) {
      return mix( c * 12.92, 1.055 * pow( max( c, vec3( 0.0031308 ) ), vec3( 1.0 / 2.4 ) ) - 0.055,
                  step( 0.0031308, c ) );
    }

    vec3 bloomSource(vec2 uv) {
      vec3 s = texture2D(tDiffuse, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
      float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
      return s * smoothstep(0.72, 1.05, l);
    }

    void main() {
      vec3 c = texture2D( tDiffuse, vUv ).rgb;
      if (uAoStrength > 0.0 && texture2D(tDepth, vUv).x < 0.9999) {
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
      /* A restrained, high-only highlight halo. Four diagonal taps keep it
       * inside this existing grade pass, so city and airbase gain glow
       * without another full-resolution target or render pass. */
      if (uBloomStrength > 0.0) {
        vec2 b = uBloomTexel * 6.0;
        vec3 glow = bloomSource(vUv + vec2( b.x,  b.y))
                  + bloomSource(vUv + vec2(-b.x,  b.y))
                  + bloomSource(vUv + vec2( b.x, -b.y))
                  + bloomSource(vUv + vec2(-b.x, -b.y));
        c += glow * (uBloomStrength * 0.25);
      }
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );

      // split-tone: cool violet in the darks, warm paper white in the lights
      float k = smoothstep( 0.02, 0.55, l );
      c *= mix( uShadowTint, uLightTint, k );

      // gentle overall warmth, like late afternoon light through blossom
      c += vec3( uWarmth, uWarmth * 0.45, 0.0 ) * l * 0.35;

      // keep shadows readable -- never crushed to black
      c = c + uLift * ( 1.0 - k );

      c = mix( vec3( l ), c, uSaturation );

      float r = length( vUv - 0.5 ) * 1.42;
      c *= 1.0 - uVignette * pow( clamp( r, 0.0, 1.0 ), 2.6 );

      gl_FragColor = vec4( linearToSRGB( max( c, vec3( 0.0 ) ) ), 1.0 );
    }
  `,
};

const FXAA_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2() },
  },
  vertexShader: INK_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;

    float luma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }

    void main() {
      vec3 cM = texture2D( tDiffuse, vUv ).rgb;
      vec3 cNW = texture2D( tDiffuse, vUv + vec2( -uTexel.x, -uTexel.y ) ).rgb;
      vec3 cNE = texture2D( tDiffuse, vUv + vec2(  uTexel.x, -uTexel.y ) ).rgb;
      vec3 cSW = texture2D( tDiffuse, vUv + vec2( -uTexel.x,  uTexel.y ) ).rgb;
      vec3 cSE = texture2D( tDiffuse, vUv + vec2(  uTexel.x,  uTexel.y ) ).rgb;

      float lM = luma( cM ), lNW = luma( cNW ), lNE = luma( cNE ),
            lSW = luma( cSW ), lSE = luma( cSE );
      float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) );
      float lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );

      vec2 dir = vec2(
        -( ( lNW + lNE ) - ( lSW + lSE ) ),
         ( ( lNW + lSW ) - ( lNE + lSE ) )
      );
      float reduce = max( ( lNW + lNE + lSW + lSE ) * 0.25 * 0.18, 1.0 / 128.0 );
      float rcp = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + reduce );
      dir = clamp( dir * rcp, vec2( -8.0 ), vec2( 8.0 ) ) * uTexel;

      vec3 rgbA = 0.5 * (
        texture2D( tDiffuse, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb +
        texture2D( tDiffuse, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture2D( tDiffuse, vUv - dir * 0.5 ).rgb +
        texture2D( tDiffuse, vUv + dir * 0.5 ).rgb );

      float lB = luma( rgbB );
      gl_FragColor = vec4( ( lB < lMin || lB > lMax ) ? rgbA : rgbB, 1.0 );
    }
  `,
};

function makeQuad(def) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(def.uniforms),
    vertexShader: def.vertexShader,
    fragmentShader: def.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  return { quad: new FullScreenQuad(mat), mat };
}

export class Pipeline {
  constructor(renderer, scene, camera, { pixelBudget = 4.6e6, bloomStrength = 0 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.pixelBudget = pixelBudget;
    this.size = new THREE.Vector2(1, 1);

    const opts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.NoColorSpace,
    };
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, opts);
    this.rtScene.depthTexture = new THREE.DepthTexture(2, 2);
    this.rtScene.depthTexture.format = THREE.DepthFormat;
    this.rtScene.depthTexture.type = THREE.UnsignedIntType;
    this.rtScene.depthTexture.minFilter = THREE.NearestFilter;
    this.rtScene.depthTexture.magFilter = THREE.NearestFilter;

    this.rtA = new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(2, 2, {
      ...opts, type: THREE.UnsignedByteType, depthBuffer: false,
    });

    const ink = makeQuad(INK_SHADER);
    const grade = makeQuad(GRADE_SHADER);
    grade.mat.uniforms.uBloomStrength.value = bloomStrength;
    const fxaa = makeQuad(FXAA_SHADER);
    this.ink = ink;
    this.grade = grade;
    this.fxaa = fxaa;

    ink.mat.uniforms.tDepth.value = this.rtScene.depthTexture;
    grade.mat.uniforms.tDepth.value = this.rtScene.depthTexture;
    this.enabled = { ink: true, grade: true, fxaa: true };
  }

  /** Resolution scale: supersample a little on low-DPI screens for clean ink. */
  setSize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    let scale = this.forceScale || (dpr < 1.5 ? 1.5 : Math.min(dpr, 2));
    if (w * h * scale * scale > this.pixelBudget) {
      scale = Math.max(1, Math.sqrt(this.pixelBudget / (w * h)));
    }
    this.scale = scale;
    const rw = Math.max(2, Math.floor(w * scale));
    const rh = Math.max(2, Math.floor(h * scale));
    this.size.set(rw, rh);

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, true);

    this.rtScene.setSize(rw, rh);
    this.rtA.setSize(rw, rh);
    this.rtB.setSize(rw, rh);

    const texel = new THREE.Vector2(1 / rw, 1 / rh);
    this.grade.mat.uniforms.uAoTexel.value.copy(texel);
    this.grade.mat.uniforms.uBloomTexel.value.copy(texel);
    this.grade.mat.uniforms.uNear.value = this.camera.near;
    this.grade.mat.uniforms.uFar.value = this.camera.far;
    this.ink.mat.uniforms.uTexel.value.copy(texel);
    this.fxaa.mat.uniforms.uTexel.value.copy(texel);
    this.ink.mat.uniforms.uNear.value = this.camera.near;
    this.ink.mat.uniforms.uFar.value = this.camera.far;
    // scale ink weight with resolution so lines stay ~2 device px
    this.ink.mat.uniforms.uThickness.value = 1.05 + 0.55 * scale;
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(this.scene, this.camera);

    let src = this.rtScene.texture;

    if (this.enabled.ink) {
      this.ink.mat.uniforms.tDiffuse.value = src;
      r.setRenderTarget(this.rtA);
      this.ink.quad.render(r);
      src = this.rtA.texture;
    }

    const last = this.enabled.fxaa ? this.rtB : null;
    this.grade.mat.uniforms.tDiffuse.value = src;
    r.setRenderTarget(last);
    this.grade.quad.render(r);

    if (this.enabled.fxaa) {
      this.fxaa.mat.uniforms.tDiffuse.value = this.rtB.texture;
      r.setRenderTarget(null);
      this.fxaa.quad.render(r);
    }
    r.setRenderTarget(null);
  }

  dispose() {
    [this.rtScene, this.rtA, this.rtB].forEach((rt) => rt.dispose());
    [this.ink, this.grade, this.fxaa].forEach((p) => {
      p.quad.dispose();
      p.mat.dispose();
    });
  }
}
