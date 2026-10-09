/*
 * comicsky.js: the comic layer's sky (graphics passes 18 and 20).
 *
 * Two things every map's sky shares. The streak cloud: high cirrus painted
 * across the upper sky, on the race field's dome since pass 18 and on the
 * town's and the yard's since pass 20. And the freestyle maps' cumulus,
 * built as painted volumes in place of the vendored sky's flat cards
 * (pass 20). Nothing under src/maps/city/vendored changes: both are put
 * on the sky buildSky made, after it made it.
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
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { latticeMap, latticeNoiseGlsl } from './lattice.js';

/*
 * HIGH STREAK CLOUD, painted across the upper sky (graphics pass 18).
 *
 * Above the cumulus, between the zenith and the tree line, the field's sky
 * was one smooth gradient, the largest unpainted area in a racing frame:
 * half the screen whenever the nose is up. A painted sky is never empty
 * there. These are cirrus streaks, drawn as a flat layer seen in
 * perspective, so they run toward the vanishing point the way real high
 * cloud does, in short broken wisps with a crisp painted edge rather than
 * a soft fog, pale, warmer on the sun's side.
 *
 * Every term is a direction, so the layer is fixed to the world and turns
 * with the view and nothing else: no time, no rng, no position, so it can
 * neither crawl nor differ between two loads. The wisp edge is widened by
 * its own screen derivative, which is what keeps the streaks low in the sky
 * from stepping where the layer is foreshortened. The layer fades out well
 * above the horizon, where it would be too fine to draw anyway, and thins
 * again overhead, where the nearest part of it would draw its wisps
 * largest, so the zenith keeps its deepest blue. No sine anywhere, for the
 * same reason comic.js gives: the noise lands on the same pixel on every
 * GPU.
 *
 * The two tints and the strength are arguments (pass 20), so the town and
 * each of the yard's times can paint it in their own colours; the field
 * passes the numbers it always had. Off on Low, where no dome has it: the
 * field's compiles it in only on Medium and High (COMIC_CIRRUS in
 * src/render/scene.js), and comicSky below adds it only there.
 *
 * Its noise is the comic hash's lattice (src/render/lattice.js; skyHash
 * was the same hash), four corners a fetch, where it was four hashes a call
 * and four calls a pixel of sky until the low end pass after the sweep, and
 * every streak is where it was. A dome that includes this gives it the
 * lattice as uSkyNoise (cirrusUniforms).
 */
export const CIRRUS_GLSL = /* glsl */ `
  ${latticeNoiseGlsl('skyNoise', 'uSkyNoise')}
  vec3 celSkyCirrus(vec3 col, vec3 vd, vec3 sunDir, vec3 cool, vec3 warm, float strength) {
    /* The layer's plane, softened at the horizon so it never runs off to
     * infinity, and turned to the wind. No early out below the horizon:
     * fwidth is undefined after a branch that differs between neighbouring
     * pixels, and the mask already takes it to nothing there. */
    vec2 p = vd.xz / (max(vd.y, 0.0) + 0.18);
    p = mat2(0.83, -0.56, 0.56, 0.83) * p;
    /* Long along the wind and narrow across it, the wisps bent by a coarser
     * noise so no two run parallel, and patchy, so the sky is not covered. */
    vec2 st = p * vec2(2.2, 9.0);
    float n = skyNoise(st + vec2(skyNoise(p * 2.6) * 2.4, 0.0)) * 0.65
            + skyNoise(st * 2.3 + 11.0) * 0.35;
    float cover = smoothstep(0.55, 0.78, skyNoise(p * 0.8 + 5.0));
    float e = max(fwidth(n), 0.04);
    float wisp = smoothstep(0.62 - e, 0.62 + e, n) * cover;
    float mask = smoothstep(0.08, 0.30, vd.y) * (1.0 - smoothstep(0.75, 0.97, vd.y));
    vec3 tint = mix(cool, warm, pow(max(dot(vd, normalize(sunDir)), 0.0), 4.0));
    return mix(col, tint, wisp * mask * strength);
  }
`;

/* What a dome that includes CIRRUS_GLSL adds to its uniforms. */
export function cirrusUniforms() {
  return { uSkyNoise: { value: latticeMap() } };
}

/* How strongly a dome paints it, unless a look says otherwise, and how
 * much cooler than the look's cloud it is away from the sun. */
export const STREAK = 0.3;
const STREAK_COOL = new THREE.Color(0.93, 0.95, 1.0);

/*
 * The streak cloud on a buildSky dome, the town's or the yard's.
 *
 * Put in when the program is compiled, on the dome's own material, before
 * the line that writes the colour, so it follows the dome through the
 * yard's paintSky, which swaps the vendored shader for its own and has the
 * program built again. The direction is the view's: the vendored shader
 * keeps the world position, from which the eye is taken away, and the
 * yard's keeps the direction from the dome's centre, which is the eye. A
 * dome whose shader has no such line is left as it was.
 */
const DOME_ANCHOR = '        gl_FragColor = vec4( col, 1.0 );';
function domeStreaks(dome) {
  const m = dome && dome.material;
  if (!m || !m.isShaderMaterial || !m.uniforms) {
    return null;
  }
  const u = {
    uStreak: { value: 0 },
    uStreakSun: { value: new THREE.Vector3(0, 1, 0) },
    uStreakCool: { value: new THREE.Color() },
    uStreakWarm: { value: new THREE.Color() },
  };
  Object.assign(m.uniforms, u, cirrusUniforms());
  /* fwidth on WebGL 1, as the field's dome. */
  m.extensions.derivatives = true;
  m.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes(DOME_ANCHOR)) {
      return;
    }
    const dir = shader.fragmentShader.includes('varying vec3 vDir;')
      ? 'normalize( vDir )'
      : 'normalize( vWorld - cameraPosition )';
    shader.fragmentShader = `${CIRRUS_GLSL}
      uniform float uStreak;
      uniform vec3 uStreakSun, uStreakCool, uStreakWarm;
${shader.fragmentShader.replace(DOME_ANCHOR, `        if ( uStreak > 0.0 ) {
          col = celSkyCirrus( col, ${dir}, uStreakSun, uStreakCool, uStreakWarm, uStreak );
        }
${DOME_ANCHOR}`)}`;
  };
  m.needsUpdate = true;
  return u;
}

/*
 * THE FREESTYLE MAPS' CUMULUS (graphics pass 20).
 *
 * The town and the yard hang the vendored sky's clouds round the eye: 22
 * flat cards, each a pale lit plane over a paler shade plane, one texture
 * of seven ellipses for all of them, 62 percent opaque. In a frame they
 * were washes with no form in them, the same silhouette came round as the
 * view turned, and a flat card only looks flat at the middle of the
 * screen: at an FPV camera's width every card toward an edge stretched
 * into a long wedge. A first try that only painted the cards (an atlas of
 * four inked cumulus shapes) made the wedges plainer, because a line round
 * a stretched card shows the stretch.
 *
 * So each card is replaced by a heap of the race field's kind (pass 14 in
 * src/render/scene.js): a spread of flattened base puffs, two tiers heaped
 * on them toward the middle, all cut flat at one base, painted in three
 * bands keyed to an axis leaning from straight up toward the sun (a lit
 * crown, a pale body, a cool belly) with an ink rim where each puff turns
 * away. It stands where the card stood, about as wide as the card's
 * painted cloud, its base on the card's painted base, and its height in
 * proportion to the card's, so the sky keeps its layout and its long low
 * clouds. Its shape comes from a stream seeded by the card's index, never
 * from the world's rng, and every puff is a sphere, so it is solid from
 * any side.
 *
 * On every preset: one merged mesh and one draw call where there were up
 * to 44 blended, textured quads, with no texture and no blending, for
 * about 32 thousand small triangles and a megabyte of buffers, built in
 * 25 ms or so. It writes no depth and draws right after the dome, as the
 * cards did, so the clouds stay a backdrop that the whole town stands in
 * front of. That takes the place of depth inside the heaps too: the eye is
 * always at the centre of the ring (the group trails the camera), so the
 * distance from the eye to every puff is fixed, and the puffs are merged
 * farthest first, which is the painter's order from every direction the
 * pilot can look. GLSL that WebGL 1 compiles as it is.
 *
 * The cards stay in the scene, hidden, so the yard's paintSky still finds
 * the materials it has always set, and their texture is never uploaded.
 */

/*
 * The field's three bands and its rim (scene.js), with the colours as
 * uniforms so a time of day can set them, and no rim on a face that looks
 * straight down. These are seen from a few degrees under their base, where
 * the field's are seen from tens: edge on, the cut base was all rim, and
 * the normals blending from it into each puff's side scattered broken
 * strokes of ink across the belly.
 */
const VERTEX = /* glsl */ `
  varying vec3 vN;
  varying vec3 vNView;
  varying vec3 vView;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vNView = normalMatrix * normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vNView;
  varying vec3 vView;
  uniform vec3 uSun;
  uniform vec3 uCrown;
  uniform vec3 uBody;
  uniform vec3 uBelly;
  uniform vec3 uInk;
  void main() {
    vec3 n = normalize(vN);
    float k = dot(n, normalize(vec3(0.0, 1.0, 0.0) + uSun * 0.9));
    vec3 col = mix(uBelly, uBody, smoothstep(-0.38, -0.32, k));
    col = mix(col, uCrown, smoothstep(0.20, 0.26, k));
    /* No ink rim: it clashed with the polygon world (bug-09e28ecf). */
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* The same generator as the field's heap, on a stream of its own. */
function stream(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/*
 * One heap in its own frame, in the field's units: x along the ring, y up,
 * z toward the eye. The field's numbers, drawn from one stream, but with
 * more puffs in every tier and narrower ones at the base: these hang four
 * times nearer than the field's, where one broad base puff fills a heap's
 * underside and reads as a loaf. Puffs as [x, y, z, r, sy], cut at BASE.
 */
const BASE = -7;
function heap(rnd) {
  const puffs = [];
  const add = (r, x, y, z, sy) => {
    puffs.push([x, y, z, r, sy]);
    return { x, z, r, top: y + r * sy };
  };
  const base = [];
  const n = 6 + Math.floor(rnd() * 4);
  for (let p = 0; p < n; p += 1) {
    const r = 14 + rnd() * 18;
    base.push(add(r, (rnd() - 0.5) * 70, (rnd() - 0.5) * 12, (rnd() - 0.5) * 40, 0.52));
  }
  const tier = (under, count, lo, span, sy) => {
    const made = [];
    for (let c = 0; c < count; c += 1) {
      const t = under[Math.floor(rnd() * under.length)];
      const r = t.r * (lo + rnd() * span);
      made.push(add(r,
        t.x * 0.6 + (rnd() - 0.5) * t.r * 0.6,
        t.top - r * sy * 0.15,
        t.z * 0.6 + (rnd() - 0.5) * t.r * 0.4, sy));
    }
    return made;
  };
  const mid = tier(base, 3 + Math.floor(rnd() * 3), 0.6, 0.2, 0.8);
  tier(mid, 2 + Math.floor(rnd() * 2), 0.55, 0.2, 0.9);
  return puffs;
}

/*
 * Unit spheres to make puffs from, indexed, at three levels of detail. A
 * heap here can fill a fifth of the frame, where the field's 80 face
 * sphere showed its facets along every outline, so each puff takes the
 * least detail that keeps its outline within about a pixel of the round
 * one across a 1920 wide frame: 80 faces up to a radius of 0.025 radians,
 * 320 up to 0.1, 1280 past that.
 */
const SPHERES = [];
function sphere(angle) {
  const detail = angle < 0.025 ? 1 : angle < 0.1 ? 2 : 3;
  if (!SPHERES[detail]) {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    geo.deleteAttribute('uv');
    SPHERES[detail] = mergeVertices(geo);
    geo.dispose();
  }
  return SPHERES[detail];
}

/*
 * A puff: its sphere, squashed, moved into the heap and cut flat at the
 * base, the cut face turned straight down so it takes the belly band; then
 * into the sky by `m`. The eye never leaves the middle of the ring, so the
 * faces turned away from it are never drawn, from any heading, and they
 * are left out of the index: half the triangles, for nothing on screen.
 */
function puffGeometry([x, y, z, r, sy], m, angle) {
  const geo = sphere(angle).clone();
  geo.scale(r, r * sy, r);
  geo.translate(x, y, z);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  for (let k = 0; k < pos.count; k += 1) {
    if (pos.getY(k) < BASE) {
      pos.setY(k, BASE);
      nrm.setXYZ(k, 0, -1, 0);
    }
  }
  geo.applyMatrix4(m);
  /* A face is kept when its normal, the cross of two edges, points back
   * at the eye: against the sum of its corners, three times its middle. */
  const index = geo.index.array;
  const p = pos.array;
  const kept = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3;
    const b = index[t + 1] * 3;
    const c = index[t + 2] * 3;
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    const facing = (uy * vz - uz * vy) * (p[a] + p[b] + p[c])
      + (uz * vx - ux * vz) * (p[a + 1] + p[b + 1] + p[c + 1])
      + (ux * vy - uy * vx) * (p[a + 2] + p[b + 2] + p[c + 2]);
    if (facing < 0) {
      kept.push(index[t], index[t + 1], index[t + 2]);
    }
  }
  geo.setIndex(kept);
  return geo;
}

/*
 * The card's painted cloud, as shares of the card: cloudTex's seven
 * ellipses span 76 percent of its width, and run from its flat trim, 28
 * percent of the height under the middle, to 36 percent over it. A heap
 * is as wide as that and, so it stands up as a heap rather than lying as
 * a streak, 1.15 of the card's height tall, about twice the painted
 * cloud's: the field's own proportions.
 */
const WIDTH = 0.76;
const HEIGHT = 1.15;
const FOOT = 0.28;

/* The cards' heaps as one mesh, or null if there were no cards. */
function cumulus(group) {
  const parts = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const cards = [];
  group.children.forEach((card, i) => {
    const front = card.children[1];
    const size = front && front.geometry && front.geometry.parameters;
    if (card.children.length !== 2 || !size || !size.width) {
      return;
    }
    const w = size.width;
    const h = size.height;
    const puffs = heap(stream(0x51c7e + i * 7919));
    let left = Infinity;
    let right = -Infinity;
    let top = BASE;
    for (const [x, y, , r, sy] of puffs) {
      left = Math.min(left, x - r);
      right = Math.max(right, x + r);
      top = Math.max(top, y + r * sy);
    }
    const s = (w * WIDTH) / (right - left);
    const sy = (h * HEIGHT) / ((top - BASE) * s);
    /* Turned to face the eye, upright rather than tipped toward it as the
     * card was, centred where the card's cloud was and standing on its
     * trim. */
    q.setFromAxisAngle(up, Math.atan2(-card.position.x, -card.position.z));
    at.set(-(left + right) / 2 * s, -BASE * s * sy - FOOT * h, 0)
      .applyQuaternion(q)
      .add(card.position);
    m.compose(at, q, new THREE.Vector3(s, s * sy, s));
    for (const p of puffs) {
      centre.set(p[0], p[1], p[2]).applyMatrix4(m);
      const d = centre.length();
      parts.push({ geo: puffGeometry(p, m, (p[3] * s) / d), d });
    }
    cards.push(card);
  });
  if (!parts.length) {
    return null;
  }
  parts.sort((a, b) => b.d - a.d);
  const geo = mergeGeometries(parts.map((p) => p.geo));
  if (geo) {
    /* Normals taken again from the merged heap's faces (the Gem look). The
     * puffs are indexed (mergeVertices, in sphere above), so this averages
     * the faces round each vertex: a heap stays round, not faceted, and the
     * cut base's straight down normals are averaged with the sides'. That is
     * what the pictures the look was picked from showed. Faceted would need
     * the heap unindexed first, about three times the vertices it draws. */
    geo.computeVertexNormals();
  }
  for (const p of parts) {
    p.geo.dispose();
  }
  if (!geo) {
    return null;
  }
  const mat = new THREE.ShaderMaterial({
    fog: false,
    depthWrite: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uCrown: { value: new THREE.Color() },
      uBody: { value: new THREE.Color() },
      uBelly: { value: new THREE.Color() },
      uInk: { value: new THREE.Color() },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'comicCumulus';
  mesh.renderOrder = -9;
  mesh.frustumCulled = false;
  group.add(mesh);
  for (const card of cards) {
    card.visible = false;
  }
  return mat.uniforms;
}

/*
 * The comic layer on a buildSky sky: the cumulus always, the streak cloud
 * where `streaks` (Medium and High). `look` is the map's: `cloud`, `shade`
 * and `ink` as hex, `sun` the offset the sun stands at, and `streak` how
 * strongly the streak cloud is painted, STREAK if it does not say. The
 * painter is left on the clouds' group for the yard's paintSky, which
 * hands it each time's look.
 */
export function comicSky(sky, look, { streaks = true } = {}) {
  if (!sky || !sky.clouds) {
    return;
  }
  const heaps = cumulus(sky.clouds);
  const high = streaks ? domeStreaks(sky.dome) : null;
  const cool = new THREE.Color(0.9, 0.9, 0.97);
  const ink = new THREE.Color();
  /*
   * The cumulus's bands from the map's two cloud colours: the crown its
   * cloud, a touch under it so a white keeps its hue; the belly its shade
   * taken a small cool step deeper; the body under a third of the way from
   * the crown to the belly. A pastel town's clouds are white things with a
   * shaded side and not grey ones, and from under them the belly and the
   * body are most of what a pilot sees: with the field's deeper belly the
   * town's heaps read as mauve, darker than the cards and no lighter than
   * the sky behind them. The rim is the belly most of the way to the map's
   * ink: a line seen through a few hundred metres of air, not one drawn on
   * the glass. The streaks take the cloud's own colour on the sun's side
   * and a cooler one away from it, as the field's do.
   */
  const paint = ({ cloud, shade, ink: inkHex, sun, streak = STREAK }) => {
    if (heaps) {
      heaps.uCrown.value.set(cloud).multiplyScalar(0.97);
      heaps.uBelly.value.set(shade).multiply(cool);
      heaps.uBody.value.copy(heaps.uCrown.value).lerp(heaps.uBelly.value, 0.3);
      heaps.uInk.value.copy(heaps.uBelly.value).lerp(ink.set(inkHex), 0.6);
      heaps.uSun.value.set(sun[0], sun[1], sun[2]).normalize();
    }
    if (high) {
      high.uStreak.value = streak;
      high.uStreakWarm.value.set(cloud);
      high.uStreakCool.value.set(cloud).multiply(STREAK_COOL);
      high.uStreakSun.value.set(sun[0], sun[1], sun[2]).normalize();
    }
  };
  paint(look);
  sky.clouds.userData.comicPaint = paint;
}
