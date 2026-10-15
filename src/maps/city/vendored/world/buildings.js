import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { meterBox } from '../core/textures.js';
import { box, cyl, bake, trs, rngKit } from '../core/util.js';
import { hullOutline } from '../core/outline.js';

/* ------------------------------------------------------------------ *
 * Low-rise Japanese houses.
 *
 * One generator, driven by a seed, producing modular but never identical
 * volumes: gable / hip / flat roofs, two wall tones, balconies, sliding
 * windows, downpipes, meters, aerials, garden walls.  Static parts get
 * merged per material so a whole street costs about six draw calls a
 * house.
 * ------------------------------------------------------------------ */

/* Appended, never reordered: every `wall:` and `roof:` in the world is an index
 * into these two arrays, so inserting a tone would repaint half the district. */
const WALLS = [
  PAL.wallWhite, PAL.wallCream, PAL.wallBlue, PAL.wallBeige, PAL.wallGray, PAL.wallPink,
  PAL.wallTea, PAL.wallSage,
];
const ROOFS = [PAL.roofSlate, PAL.roofBlue, PAL.roofBrown, PAL.roofTeal];

const M = {};
let ANATOLIAN_MATSETS;
let ANATOLIAN_HOUSE_MODEL = null;
let ANATOLIAN_HOUSE_BOUNDS = null;

/* The imported low-poly cottage is configured before the city is assembled,
 * then cloned by makeAnatolianHouse. Clearing the prototype after assembly
 * keeps later maps and rebuilds on their own house generators. */
export function setAnatolianHouseModel(model = null) {
  ANATOLIAN_HOUSE_MODEL = null;
  ANATOLIAN_HOUSE_BOUNDS = null;
  if (!model) return;

  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return;
  ANATOLIAN_HOUSE_MODEL = model;
  ANATOLIAN_HOUSE_BOUNDS = bounds;
}

function mats() {
  if (M.roofs) return M;
  M.walls = WALLS.map((c) => cel({ color: c, bands: 3, tint: 0x6f6790, roughness: 0.9 }));
  M.roofs = ROOFS.map((c) => cel({ color: c, bands: 3, tint: 0x514b70, roughness: 0.76 }));
  M.trim = cel({ color: PAL.trim, bands: 3, tint: 0x5c5680, roughness: 0.68 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090, roughness: 0.38, metalness: 0.42 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680, roughness: 0.48, metalness: 0.34 });
  M.glass = cel({ color: PAL.glassDark, roughness: 0.22, metalness: 0.12 });
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790, roughness: 0.94 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288, roughness: 0.9 });
  M.door = cel({ color: 0x8a6f5c, bands: 3, tint: 0x5c5680, roughness: 0.62 });
  return M;
}

/**
 * Build one house.
 *
 * @param o.x,o.z      footprint centre
 * @param o.y          ground height
 * @param o.w,o.d      width (X) and depth (Z)
 * @param o.face       which way the frontage looks: 'x-', 'x+', 'z-', 'z+'
 * @param o.floors     1 or 2
 * @param o.seed       determinism
 */
function makeOriginalHouse(o) {
  const m = mats();
  const rng = rngKit(o.seed ?? 7);
  const g = new THREE.Group();
  const w = o.w ?? 6.2;
  const d = o.d ?? 7.0;
  const floors = o.floors ?? 2;
  const fh = 2.72;
  const H = fh * floors;
  const wallMat = m.walls[o.wall ?? rng.int(0, WALLS.length - 1)];
  const roofMat = m.roofs[o.roof ?? rng.int(0, ROOFS.length - 1)];
  const roofKind = o.roofKind ?? rng.pick(['gable', 'hip', 'gable', 'flat', 'hip']);

  // frontage direction as a unit vector in XZ
  const dirs = { 'x-': [-1, 0], 'x+': [1, 0], 'z-': [0, -1], 'z+': [0, 1] };
  const [fx, fz] = dirs[o.face ?? 'x-'];
  const frontIsX = fx !== 0;
  const frontHalf = frontIsX ? w / 2 : d / 2;
  const sideHalf = frontIsX ? d / 2 : w / 2;

  const parts = { wall: [], roof: [], trim: [], metal: [], metalDark: [], glass: [], concrete: [], door: [] };
  const push = (k, geo, mx) => parts[k].push({ geometry: geo, matrix: mx });

  /* -------------------------------- volume -------------------------------- */
  push('wall', new THREE.BoxGeometry(w, H, d), trs(0, H / 2, 0));
  // ground sill
  push('concrete', new THREE.BoxGeometry(w + 0.14, 0.42, d + 0.14), trs(0, 0.21, 0));
  if (floors === 2) {
    push('trim', new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08), trs(0, fh, 0));
  }

  /* --------------------------------- roof --------------------------------- */
  const eave = 0.42;
  const rw = w + eave * 2;
  const rd = d + eave * 2;
  /* Peak above the wall plate. The house collider used to stop at H, so a
   * gable or hip was a picture you flew through. userData.top is what
   * plotCollide and the street loop read. */
  let roofRise = 0.45;
  if (roofKind === 'gable') {
    const rh = 1.15 + rng.range(0, 0.5);
    roofRise = rh + 0.22;
    // two slabs meeting at a ridge, which runs along the longer axis
    const alongZ = d >= w;
    const span = alongZ ? rw : rd;   // across the slope
    const len = alongZ ? rd : rw;    // along the ridge
    const slope = Math.atan2(rh, span / 2);
    const slabLen = Math.hypot(span / 2, rh) + 0.08;
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(alongZ ? slabLen : len, 0.14, alongZ ? len : slabLen);
      const mx = alongZ
        ? trs(s * (span / 4), H + rh / 2, 0, 0, 0, -s * slope)
        : trs(0, H + rh / 2, s * (span / 4), s * slope, 0, 0);
      push('roof', geo, mx);
    }
    // triangular gable ends, closing the roof volume
    const tri = new THREE.Shape();
    tri.moveTo(-span / 2 + eave, 0);
    tri.lineTo(span / 2 - eave, 0);
    tri.lineTo(0, rh * (1 - (eave * 2) / span));
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.16, bevelEnabled: false });
    triGeo.translate(0, 0, -0.08);
    for (const s of [-1, 1]) {
      const mx = alongZ
        ? trs(0, H, s * (len / 2 - eave - 0.02))
        : trs(s * (len / 2 - eave - 0.02), H, 0, 0, Math.PI / 2, 0);
      push('wall', triGeo, mx);
    }
    push('roof', new THREE.BoxGeometry(alongZ ? 0.22 : len, 0.17, alongZ ? len : 0.22), trs(0, H + rh + 0.04, 0));
    triGeo.dispose();
  } else if (roofKind === 'hip') {
    const rh = 1.05 + rng.range(0, 0.4);
    roofRise = rh + 0.22;
    // a four-sided cone rotated 45 degrees is an axis-aligned unit pyramid
    const pyr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    pyr.rotateY(Math.PI / 4);
    push('roof', pyr, trs(0, H + rh / 2 + 0.06, 0, 0, 0, 0, rw, rh, rd));
    push('roof', new THREE.BoxGeometry(rw, 0.16, rd), trs(0, H + 0.06, 0));
    pyr.dispose();
  } else if (roofKind === 'shed') {
    /* 片流れ -- one slab falling the whole way across.
     *
     * The tilt has to be *derived*, not guessed: a box along X rotated by +t
     * about Z sends its +x end up, and a box along Z rotated by +t about X sends
     * its +z end *down*.  Those two signs are opposite, which is exactly the
     * mistake that made the overbridge stair's soffit climb away from its own
     * treads.  So the sign is written once here and reused for both axes.
     *
     * `shedDir` picks which side is high; the gable ends close the wedge. */
    const rh = 0.9 + rng.range(0, 0.5);
    roofRise = rh + 0.22;
    const alongZ = d >= w;
    const span = alongZ ? rw : rd;      // across the slope
    const len = alongZ ? rd : rw;       // along the ridge
    const dir = o.shedDir ?? 1;
    const slope = Math.atan2(rh, span);
    const slabLen = Math.hypot(span, rh) + 0.06;
    push('roof',
      alongZ ? new THREE.BoxGeometry(slabLen, 0.15, len) : new THREE.BoxGeometry(len, 0.15, slabLen),
      alongZ
        ? trs(0, H + rh / 2 + 0.07, 0, 0, 0, dir * slope)
        : trs(0, H + rh / 2 + 0.07, 0, -dir * slope, 0, 0));
    // the wedge-shaped ends, so the roof is a volume rather than a plate
    const tri = new THREE.Shape();
    tri.moveTo(-span / 2 + eave, 0);
    tri.lineTo(span / 2 - eave, 0);
    tri.lineTo(dir * (span / 2 - eave), rh * (1 - (eave * 2) / span));
    tri.closePath();
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.16, bevelEnabled: false });
    triGeo.translate(0, 0, -0.08);
    for (const s of [-1, 1]) {
      push('wall', triGeo,
        alongZ
          ? trs(0, H, s * (len / 2 - eave - 0.02))
          : trs(s * (len / 2 - eave - 0.02), H, 0, 0, Math.PI / 2, 0));
    }
    triGeo.dispose();
    // the high edge gets a capping, the low edge a gutter
    push('trim', alongZ ? new THREE.BoxGeometry(0.2, 0.2, len) : new THREE.BoxGeometry(len, 0.2, 0.2),
      alongZ ? trs(dir * span / 2, H + rh + 0.1, 0) : trs(0, H + rh + 0.1, -dir * span / 2));
    push('metal',
      alongZ ? new THREE.BoxGeometry(0.14, 0.12, len) : new THREE.BoxGeometry(len, 0.12, 0.14),
      alongZ ? trs(-dir * (span / 2 + 0.04), H + 0.06, 0) : trs(0, H + 0.06, dir * (span / 2 + 0.04)));
  } else {
    push('roof', new THREE.BoxGeometry(w + 0.24, 0.18, d + 0.24), trs(0, H + 0.09, 0));
    // parapet
    for (const s of [-1, 1]) {
      push('roof', new THREE.BoxGeometry(w + 0.24, 0.34, 0.14), trs(0, H + 0.28, s * (d / 2 + 0.05)));
      push('roof', new THREE.BoxGeometry(0.14, 0.34, d + 0.24), trs(s * (w / 2 + 0.05), H + 0.28, 0));
    }
  }

  /* ------------------------------ front windows ------------------------------ */
  const winW = 1.5;
  const cols = Math.max(1, Math.floor((frontHalf * 2 - 1.0) / 2.1));
  function placeFront(u, y, ww, wh, kind = 'window') {
    const px = frontIsX ? fx * (frontHalf + 0.02) : u;
    const pz = frontIsX ? u : fz * (frontHalf + 0.02);
    const ry = frontIsX ? Math.PI / 2 : 0;
    const dx = frontIsX ? 0.14 : ww;
    const dz = frontIsX ? ww : 0.14;
    if (kind === 'window') {
      push('trim', new THREE.BoxGeometry(dx, wh + 0.14, dz + (frontIsX ? 0.14 : 0)), trs(px - fx * 0.02, y, pz - fz * 0.02));
      const gx = frontIsX ? 0.06 : ww - 0.12;
      const gz = frontIsX ? ww - 0.12 : 0.06;
      push('glass', new THREE.BoxGeometry(gx, wh, gz), trs(px + fx * 0.05, y, pz + fz * 0.05));
      push('metal', new THREE.BoxGeometry(frontIsX ? 0.07 : 0.06, wh, frontIsX ? 0.06 : 0.07),
        trs(px + fx * 0.07, y, pz + fz * 0.07));
      push('trim', new THREE.BoxGeometry(frontIsX ? 0.2 : ww + 0.2, 0.08, frontIsX ? ww + 0.2 : 0.2),
        trs(px + fx * 0.03, y - wh / 2 - 0.09, pz + fz * 0.03));
      return { px, pz, ry };
    }
    push('door', new THREE.BoxGeometry(dx, wh, dz), trs(px + fx * 0.02, y, pz + fz * 0.02));
    push('trim', new THREE.BoxGeometry(frontIsX ? 0.16 : ww + 0.18, wh + 0.16, frontIsX ? ww + 0.18 : 0.16),
      trs(px - fx * 0.03, y, pz - fz * 0.03));
    return { px, pz, ry };
  }

  const spread = (i, n) => -frontHalf + (frontHalf * 2 * (i + 1)) / (n + 1);
  const doorIdx = rng.int(0, cols - 1);
  let doorU = 0;
  for (let i = 0; i < cols; i++) {
    const u = spread(i, cols);
    if (i === doorIdx) {
      doorU = u;
      placeFront(u, 1.05, 1.05, 2.05, 'door');
    } else {
      placeFront(u, 1.42, winW, 1.25);
      /* 雨戸の戸袋 -- the shutter case over a ground-floor window.
       * A blank box would do nothing; what makes it read is the *step* between
       * the case and the reveal below it, so it is deliberately deeper than the
       * window frame it sits on. */
      if (o.shutters) {
        const px = frontIsX ? fx * (frontHalf + 0.14) : u;
        const pz = frontIsX ? u : fz * (frontHalf + 0.14);
        push('metal', new THREE.BoxGeometry(frontIsX ? 0.2 : winW + 0.24, 0.24, frontIsX ? winW + 0.24 : 0.2),
          trs(px, 2.22, pz));
        push('metalDark', new THREE.BoxGeometry(frontIsX ? 0.22 : winW + 0.3, 0.05, frontIsX ? winW + 0.3 : 0.22),
          trs(px, 2.36, pz));
      }
    }
  }

  /* ------------------------------- 玄関 canopy ------------------------------- *
   * A small hood over the front door on two brackets, and the step under it.
   * This is the single cheapest thing that turns a modular volume into a house
   * somebody comes home to: the door stops being a painted rectangle and becomes
   * a place with a shadow over it. */
  if (o.porch) {
    const out = 0.85;
    const px = frontIsX ? fx * (frontHalf + out / 2) : doorU;
    const pz = frontIsX ? doorU : fz * (frontHalf + out / 2);
    push('trim', new THREE.BoxGeometry(frontIsX ? out : 1.9, 0.1, frontIsX ? 1.9 : out), trs(px, 2.36, pz));
    push('metal', new THREE.BoxGeometry(frontIsX ? out + 0.08 : 2.0, 0.06, frontIsX ? 2.0 : out + 0.08),
      trs(px, 2.29, pz));
    for (const s of [-1, 1]) {
      const bx = frontIsX ? fx * (frontHalf + 0.2) : doorU + s * 0.82;
      const bz = frontIsX ? doorU + s * 0.82 : fz * (frontHalf + 0.2);
      push('metal', new THREE.BoxGeometry(frontIsX ? 0.42 : 0.05, 0.05, frontIsX ? 0.05 : 0.42),
        trs(bx, 2.18, bz));
      push('metal', new THREE.BoxGeometry(0.05, 0.34, 0.05), trs(bx, 2.06, bz));
    }
    // the step: two treads out of the sill, which is 0.42 m up
    for (let i = 0; i < 2; i++) {
      const t = 0.42 - i * 0.21;
      const sw = 1.5 - i * 0.14;
      const sd = 0.34;
      const sx2 = frontIsX ? fx * (frontHalf + sd * (i + 0.5)) : doorU;
      const sz2 = frontIsX ? doorU : fz * (frontHalf + sd * (i + 0.5));
      push('concrete', new THREE.BoxGeometry(frontIsX ? sd + 0.04 : sw, t, frontIsX ? sw : sd + 0.04),
        trs(sx2, t / 2, sz2));
    }
  }
  if (floors === 2) {
    for (let i = 0; i < cols; i++) {
      placeFront(spread(i, cols), fh + 1.5, winW, 1.3);
    }
    /* -------------------------------- balcony -------------------------------- */
    if (rng.chance(0.7)) {
      const bu = spread(rng.int(0, cols - 1), cols);
      const bw = Math.min(2.6, frontHalf * 1.4);
      const px = frontIsX ? fx * (frontHalf + 0.45) : bu;
      const pz = frontIsX ? bu : fz * (frontHalf + 0.45);
      push('concrete', new THREE.BoxGeometry(frontIsX ? 0.9 : bw, 0.1, frontIsX ? bw : 0.9),
        trs(px, fh + 0.42, pz));
      push('metal', new THREE.BoxGeometry(frontIsX ? 0.08 : bw, 0.07, frontIsX ? bw : 0.08),
        trs(px + fx * 0.42, fh + 1.42, pz + fz * 0.42));
      push('metalDark', new THREE.BoxGeometry(frontIsX ? 0.06 : bw, 0.95, frontIsX ? bw : 0.06),
        trs(px + fx * 0.42, fh + 0.95, pz + fz * 0.42));
      const n = Math.round(bw / 0.26);
      for (let i = 0; i < n; i++) {
        const t = -bw / 2 + (bw / (n - 1)) * i;
        push('metal', new THREE.BoxGeometry(0.04, 0.95, 0.04),
          trs(px + fx * 0.42 + (frontIsX ? 0 : t), fh + 0.95, pz + fz * 0.42 + (frontIsX ? t : 0)));
      }
      // laundry pole
      push('metal', new THREE.BoxGeometry(frontIsX ? 0.05 : bw * 0.8, 0.05, frontIsX ? bw * 0.8 : 0.05),
        trs(px + fx * 0.2, fh + 1.75, pz + fz * 0.2));
      if (rng.chance(0.75)) {
        const towelMat = cel({ color: rng.pick([PAL.wallBlue, PAL.blossom, PAL.wallWhite, PAL.yellow]),
          bands: 2, side: THREE.DoubleSide, tint: 0x6f6790 });
        const t = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.62), towelMat);
        t.position.set(px + fx * 0.2 + (frontIsX ? 0 : rng.range(-0.4, 0.4)), fh + 1.44,
          pz + fz * 0.2 + (frontIsX ? rng.range(-0.4, 0.4) : 0));
        t.rotation.y = frontIsX ? Math.PI / 2 : 0;
        t.castShadow = true;
        g.add(t);
      }
    }
  }

  /* --------------------------- services and details --------------------------- */
  // downpipe on a front corner
  {
    const s = rng.sign();
    const px = frontIsX ? fx * (frontHalf + 0.07) : s * (sideHalf - 0.15);
    const pz = frontIsX ? s * (sideHalf - 0.15) : fz * (frontHalf + 0.07);
    push('metal', new THREE.CylinderGeometry(0.055, 0.055, H, 6), trs(px, H / 2, pz));
    push('metal', new THREE.BoxGeometry(frontIsX ? 0.12 : w * 0.9, 0.1, frontIsX ? d * 0.9 : 0.12),
      trs(frontIsX ? px : 0, H + 0.02, frontIsX ? 0 : pz));
  }
  // air-conditioning box
  {
    const s = rng.sign();
    const px = frontIsX ? fx * (frontHalf + 0.4) : s * (sideHalf * 0.5);
    const pz = frontIsX ? s * (sideHalf * 0.5) : fz * (frontHalf + 0.4);
    push('trim', new THREE.BoxGeometry(frontIsX ? 0.7 : 0.86, 0.6, frontIsX ? 0.86 : 0.7),
      trs(px, floors === 2 ? fh + 0.4 : 1.9, pz));
  }
  // electricity meter
  {
    const u = spread(0, cols) + 0.9;
    const px = frontIsX ? fx * (frontHalf + 0.06) : u;
    const pz = frontIsX ? u : fz * (frontHalf + 0.06);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(frontIsX ? 0.12 : 0.34, 0.46, frontIsX ? 0.34 : 0.12),
      flat({ color: 0xffffff, map: meterBox(), cache: false }));
    plate.position.set(px, 1.9, pz);
    g.add(plate);
  }
  // rooftop aerial
  if (rng.chance(0.55)) {
    const ax = rng.range(-w * 0.25, w * 0.25);
    const az = rng.range(-d * 0.25, d * 0.25);
    const top = H + (roofKind === 'flat' ? 0.3 : 1.4);
    push('metalDark', new THREE.CylinderGeometry(0.03, 0.03, 2.1, 5), trs(ax, top + 1.05, az));
    for (let i = 0; i < 5; i++) {
      push('metalDark', new THREE.BoxGeometry(0.02, 0.02, 0.62 - i * 0.06),
        trs(ax, top + 1.2 + i * 0.17, az));
    }
  }

  /* ---------------------------- merge and finish ---------------------------- */
  const matFor = {
    wall: wallMat, roof: roofMat, trim: m.trim, metal: m.metal,
    metalDark: m.metalDark, glass: m.glass, concrete: m.concrete, door: m.door,
  };
  for (const key of Object.keys(parts)) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(bake(parts[key]), matFor[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (key === 'wall' || key === 'roof') hullOutline(mesh, { thickness: 0.0032 });
    g.add(mesh);
  }

  g.position.set(o.x, o.y ?? 0, o.z);
  g.userData.footprint = { w, d, H };
  g.userData.top = H + roofRise;
  return g;
}

/* A compact Anatolian timber-frame house for the town centre: pale lime
 * plaster between dark exposed beams, a projecting cumba, stone ground floor
 * and a red tiled hipped roof.  The parts are merged by material just like
 * makeHouse, so these landmarks do not add a draw call for every beam. */
export function makeAnatolianHouse(o = {}) {
  const plotW = o.w ?? 7;
  const plotD = o.d ?? 7;
  const frontIsX = o.face === 'x+' || o.face === 'x-';
  const w = frontIsX ? plotD : plotW;
  const d = frontIsX ? plotW : plotD;

  if (ANATOLIAN_HOUSE_MODEL && ANATOLIAN_HOUSE_BOUNDS) {
    const modelSize = ANATOLIAN_HOUSE_BOUNDS.getSize(new THREE.Vector3());
    const scale = Math.min(w / modelSize.x, d / modelSize.z);
    const g = ANATOLIAN_HOUSE_MODEL.clone(true);
    g.name = 'anatolianHouseImported';
    g.scale.setScalar(scale);
    const rotations = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 };
    g.rotation.y = rotations[o.face ?? 'x-'];
    g.position.set(
      o.x ?? 0,
      (o.y ?? 0) - ANATOLIAN_HOUSE_BOUNDS.min.y * scale,
      o.z ?? 0,
    );
    g.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    const H = modelSize.y * scale;
    const doorAt = o.doorAt ?? -0.16 * w;
    g.userData.footprint = { w: plotW, d: plotD, H };
    g.userData.width = w;
    g.userData.doorAt = doorAt;
    g.userData.doors = [doorAt];
    g.userData.eave = 0.35 * scale;
    g.userData.top = H;
    return g;
  }

  const g = new THREE.Group();
  g.name = 'anatolianHouse';
  const floors = Math.max(1, Math.min(3, Math.round(o.floors ?? 2)));
  const firstH = 2.65;
  const upperH = 2.55;
  const upperY = 0.44 + firstH;
  const upperLevels = floors - 1;
  const H = upperY + upperLevels * upperH;
  const eave = 0.55;
  const roofRise = o.garageBay ? 0.55 : 1.0;
  const front = d / 2;
  const bayW = Math.min(2.8, w * 0.46);
  const bayD = 0.68;
  const units = Math.max(1, Math.round(o.units ?? 1));
  const garage = o.garageBay === true;
  const garageSide = (o.doorSide ?? -1) < 0 ? -1 : 1;
  const entryW = Math.min(1.85, w * 0.42);
  const garageW = w - entryW;
  const garageDepth = Math.min(d - 1.6, 4.6);
  const garageX = -garageSide * (w / 2 - garageW / 2);
  const entryX = garageSide * (w / 2 - entryW / 2);
  ANATOLIAN_MATSETS ??= [
    [0xf2e5ca, 0x704a36, 0x9b4938],
    [0xe8dcc5, 0x5f4232, 0x874737],
    [0xf5e9d1, 0x654c3c, 0xa4523c],
    [0xe4d4ba, 0x493b31, 0x774333],
  ].map(([wall, wood, roof]) => ({
    darkWood: cel({ color: 0x493329, bands: 3, tint: 0x3b304b, roughness: 0.88 }),
    timber: cel({ color: wood, bands: 3, tint: 0x49364a, roughness: 0.85 }),
    plaster: cel({ color: wall, bands: 3, tint: 0x756881, roughness: 0.94 }),
    stone: cel({ color: 0x9a8876, bands: 3, tint: 0x62596c, roughness: 0.96 }),
    tile: cel({ color: roof, bands: 3, tint: 0x5b4050, roughness: 0.88 }),
    glass: cel({ color: 0x758da0, bands: 3, tint: 0x4f536c, roughness: 0.38 }),
  }));
  const variant = Math.abs(Math.round(o.seed ?? 0)) % ANATOLIAN_MATSETS.length;
  const materials = ANATOLIAN_MATSETS[variant];
  const { darkWood, timber } = materials;
  const parts = { stone: [], plaster: [], timber: [], darkWood: [], tile: [], glass: [] };
  const push = (key, geo, matrix) => parts[key].push({ geometry: geo, matrix });
  const beam = (x, y, z, bw, bh, bd, key = 'timber') =>
    push(key, new THREE.BoxGeometry(bw, bh, bd), trs(x, y, z));
  const wallW = floors === 1 ? w : w + 0.34;
  const wallD = floors === 1 ? d : d + 0.2;

  push('stone', new THREE.BoxGeometry(w + 0.2, 0.46, d + 0.2), trs(0, 0.23, 0));
  if (garage) {
    // Keep the street-facing bay open, with its stone side jambs, timber head
    // and a shadowed back wall so the characteristic opening reads at a glance.
    push('plaster', new THREE.BoxGeometry(entryW, firstH, d), trs(entryX, 0.46 + firstH / 2, 0));
    push('plaster', new THREE.BoxGeometry(garageW, firstH, d - garageDepth),
      trs(garageX, 0.46 + firstH / 2, -garageDepth / 2));
    beam(garageX - garageW / 2 + 0.09, firstH / 2 + 0.46, front + 0.04, 0.18, firstH, 0.18, 'darkWood');
    beam(garageX + garageW / 2 - 0.09, firstH / 2 + 0.46, front + 0.04, 0.18, firstH, 0.18, 'darkWood');
    beam(garageX, 2.48, front + 0.04, garageW, 0.32, 0.2, 'darkWood');
    push('darkWood', new THREE.BoxGeometry(garageW - 0.35, 1.9, 0.08),
      trs(garageX, 1.4, front - garageDepth + 0.08));
  } else {
    push('plaster', new THREE.BoxGeometry(w, firstH, d), trs(0, 0.46 + firstH / 2, 0));
  }
  beam(0, 0.51, front + 0.035, w + 0.04, 0.12, 0.11, 'darkWood');
  // Two shaded lower windows and a deep timber entrance.
  const lowerWindow = (x, width = 1.18) => {
    const glassW = Math.max(0.46, width - 0.24);
    beam(x, 1.62, front + 0.045, width, 1.22, 0.14, 'darkWood');
    push('glass', new THREE.BoxGeometry(glassW, 0.98, 0.05), trs(x, 1.62, front + 0.13));
    beam(x, 1.62, front + 0.18, 0.07, 1.02, 0.04, 'timber');
    beam(x, 1.62, front + 0.18, glassW, 0.07, 0.04, 'timber');
    beam(x, 1.08, front + 0.13, width + 0.16, 0.12, 0.36, 'darkWood');
  };
  const doorXs = garage
    ? [entryX]
    : units > 1
    ? Array.from({ length: units }, (_, i) => -w / 2 + (w * (i + 0.5)) / units)
    : [0];
  if (garage) {
    beam(entryX, 2.35, front + 0.09, 0.68, 0.28, 0.14, 'darkWood');
    push('glass', new THREE.BoxGeometry(0.48, 0.16, 0.04), trs(entryX, 2.35, front + 0.18));
  } else if (units === 1) {
    lowerWindow(-w * 0.29);
    lowerWindow(w * 0.29);
  } else {
    for (const doorX of doorXs) lowerWindow(doorX - w / units * 0.32, Math.min(0.9, w / units * 0.34));
  }
  for (const doorX of doorXs) {
    const doorW = garage ? Math.min(0.86, entryW * 0.54) : Math.min(0.91, w / units * 0.38);
    beam(doorX, 1.48, front + 0.08, doorW + 0.24, 2.02, 0.2, 'darkWood');
    beam(doorX, 1.47, front + 0.19, doorW, 1.78, 0.05, 'timber');
    for (const y of [0.72, 0.96, 1.2, 1.44, 1.68, 1.92, 2.16]) {
      beam(doorX, y, front + 0.23, doorW - 0.05, 0.035, 0.035, 'darkWood');
    }
  }
  beam(0, upperY, 0, w + 0.42, 0.16, d + 0.32, 'darkWood');

  if (floors > 1) {
    push('plaster', new THREE.BoxGeometry(wallW, H - upperY, wallD),
      trs(0, upperY + (H - upperY) / 2, 0.12));
    // The upper floor projects over the street as a traditional cumba.
    push('plaster', new THREE.BoxGeometry(bayW, (H - upperY) * 0.88, bayD),
      trs(0, upperY + (H - upperY) * 0.52, front + bayD / 2 - 0.04));
    for (const x of [-w / 2 + 0.12, 0, w / 2 - 0.12]) {
      beam(x, upperY + (H - upperY) / 2, front + 0.25, 0.16, H - upperY + 0.08, 0.17, 'darkWood');
    }
    for (let level = 0; level <= upperLevels; level++) {
      const y = upperY + level * upperH + 0.12;
      beam(0, y, front + 0.25, w + 0.18, 0.16, 0.18, 'darkWood');
    }
    // Exposed infill framing on the front and both visible flanks.
    for (const x of [-w * 0.34, -w * 0.17, w * 0.17, w * 0.34]) {
      beam(x, upperY + (H - upperY) / 2, front + 0.245, 0.09, H - upperY - 0.18, 0.12);
    }
    for (const z of [-d * 0.28, 0, d * 0.28]) {
      beam(w / 2 + 0.13, upperY + (H - upperY) / 2, z, 0.12, H - upperY - 0.18, 0.09);
    }
    const upperWindow = (x, y, z = front + 0.38, width = 0.86) => {
      beam(x, y, z, width + 0.18, 1.08, 0.15, 'darkWood');
      push('glass', new THREE.BoxGeometry(width, 0.9, 0.05), trs(x, y, z + 0.09));
      beam(x, y, z + 0.14, 0.055, 0.94, 0.035);
      beam(x, y, z + 0.14, width, 0.055, 0.035);
    };
    for (let level = 0; level < upperLevels; level++) {
      const wy = upperY + level * upperH + 1.42;
      if (units > 1) {
        for (const x of doorXs) upperWindow(x, wy, front + 0.38, Math.min(0.78, w / units * 0.34));
      } else {
        upperWindow(-w * 0.32, wy);
        upperWindow(w * 0.32, wy);
      }
      upperWindow(0, wy, front + bayD + 0.08, bayW * 0.72);
    }
    // Bay window sill and its two carved-looking timber brackets.
    beam(0, upperY + 0.55, front + bayD / 2, bayW + 0.22, 0.16, bayD + 0.2, 'darkWood');
    for (const x of [-bayW * 0.38, bayW * 0.38]) {
      const bracket = new THREE.BoxGeometry(0.14, 0.54, 0.56);
      push('timber', bracket, trs(x, upperY + 0.28, front + 0.28, -0.45));
    }
    // Deep eaves and a four-sided tiled roof.
    push('tile', new THREE.BoxGeometry(w + eave * 2, 0.16, d + eave * 2), trs(0, H + 0.11, 0));
    const hip = new THREE.ConeGeometry(Math.SQRT1_2, roofRise, 4, 1);
    hip.rotateY(Math.PI / 4);
    push('tile', hip, trs(0, H + roofRise / 2 + 0.05, 0, 0, 0, 0, w + eave * 2, roofRise, d + eave * 2));
    hip.dispose();
    beam(0, H + 0.15, front + eave * 0.68, w + eave, 0.15, 0.16, 'darkWood');
  } else {
    push('tile', new THREE.BoxGeometry(w + eave * 2, 0.16, d + eave * 2), trs(0, H + 0.09, 0));
    const hip = new THREE.ConeGeometry(Math.SQRT1_2, 0.82, 4, 1);
    hip.rotateY(Math.PI / 4);
    push('tile', hip, trs(0, H + 0.46, 0, 0, 0, 0, w + eave * 2, 0.82, d + eave * 2));
    hip.dispose();
  }

  for (const [key, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(bake(list), materials[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    if (key !== 'glass') hullOutline(mesh, { thickness: 0.0032 });
    g.add(mesh);
  }
  const rotations = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 };
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = rotations[o.face ?? 'x-'];
  g.userData.footprint = { w: plotW, d: plotD, H };
  g.userData.width = w;
  g.userData.doorAt = doorXs[0];
  g.userData.doors = doorXs;
  g.userData.eave = eave;
  if (garage) g.userData.bay = { x: garageX, w: garageW, d: garageDepth };
  g.userData.top = H + (floors > 1 ? roofRise + 0.3 : 0.82);
  return g;
}

/* Every detached home in the city now uses the same Turkish vernacular
 * construction; districts still control their own footprint, height and face. */
export function makeHouse(o = {}) {
  return makeAnatolianHouse(o);
}

/* ------------------------------------------------------------------ *
 * Garden boundaries.
 *
 * Three types, and having three is the point: a run of identical fences is
 * the fastest way to make a street of individually varied houses read as one
 * estate built in a single go.  All three take the same arguments and report
 * their overall height on `userData.top`, so the caller can size a collider
 * without knowing which one it asked for.
 *
 *   makeWall         concrete plinth + welded mesh panel -- the default
 *   makeTimberFence  板塀, slats on posts over a low plinth
 *   makeBlockFence   ブロック塀 topped with a course of 透かしブロック
 * ------------------------------------------------------------------ */

/** Low garden wall with an optional metal fence on top. */
export function makeWall(o) {
  const m = mats();
  const g = new THREE.Group();
  const len = o.len;
  const h = o.h ?? 0.55;
  const vertical = o.axis === 'z';
  const body = box(vertical ? 0.2 : len, h, vertical ? len : 0.2, m.concreteMid, 0, h / 2, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  g.add(box(vertical ? 0.28 : len + 0.06, 0.08, vertical ? len + 0.06 : 0.28, m.concrete, 0, h + 0.04, 0));
  if (o.fence) {
    const fh = o.fenceH ?? 0.85;
    const parts = [];
    const n = Math.floor(len / 0.9);
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (len / n) * i;
      parts.push({
        geometry: new THREE.BoxGeometry(0.06, fh, 0.06),
        matrix: trs(vertical ? 0 : t, h + fh / 2, vertical ? t : 0),
      });
    }
    for (const y of [h + 0.12, h + fh - 0.06]) {
      parts.push({
        geometry: new THREE.BoxGeometry(vertical ? 0.05 : len, 0.05, vertical ? len : 0.05),
        matrix: trs(0, y, 0),
      });
    }
    const nb = Math.floor(len / 0.22);
    for (let i = 0; i <= nb; i++) {
      const t = -len / 2 + (len / nb) * i;
      parts.push({
        geometry: new THREE.BoxGeometry(0.03, fh - 0.2, 0.03),
        matrix: trs(vertical ? 0 : t, h + fh / 2, vertical ? t : 0),
      });
    }
    const fence = new THREE.Mesh(bake(parts), m.metal);
    fence.castShadow = true;
    g.add(fence);
  }
  g.position.set(o.x, o.y ?? 0, o.z);
  g.userData.top = h + (o.fence ? (o.fenceH ?? 0.85) : 0);
  return g;
}

/**
 * 板塀 -- a timber slat fence on a low concrete plinth.
 *
 * The slats are laid with a gap, which is what stops a boarded fence reading
 * as a solid wall: you get a run of vertical lines and a hint of the garden
 * through them.  Two baked meshes, so a seven-metre run is two draw calls.
 */
export function makeTimberFence(o) {
  const m = mats();
  const g = new THREE.Group();
  const len = o.len;
  const h = o.h ?? 0.4;                       // plinth
  /* 0.95 keeps the whole thing at about 1.5 m, which is what the mesh fence it
   * replaces stood at.  Taller is authentic and walls the street off: boarding
   * is opaque where welded mesh is not, so it cannot also be higher. */
  const fh = o.fenceH ?? 0.95;
  const vertical = o.axis === 'z';
  const along = (t) => (vertical ? [0, t] : [t, 0]);
  const across = (v) => (vertical ? [v, 0] : [0, v]);

  const plinth = box(vertical ? 0.22 : len, h, vertical ? len : 0.22, m.concreteMid, 0, h / 2, 0);
  plinth.castShadow = plinth.receiveShadow = true;
  g.add(plinth);

  const frame = [];
  const slats = [];
  // posts, at the ends and about every 1.8 m
  const np = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i <= np; i++) {
    const [px, pz] = along(-len / 2 + (len / np) * i);
    frame.push({
      geometry: new THREE.BoxGeometry(vertical ? 0.14 : 0.13, fh + 0.14, vertical ? 0.13 : 0.14),
      matrix: trs(px, h + (fh + 0.14) / 2, pz),
    });
  }
  // two rails behind the boarding, and the cap that finishes the top
  for (const v of [h + fh * 0.22, h + fh * 0.8]) {
    const [ax, az] = across(0.055);
    frame.push({
      geometry: new THREE.BoxGeometry(vertical ? 0.05 : len, 0.07, vertical ? len : 0.05),
      matrix: trs(ax, v, az),
    });
  }
  frame.push({
    geometry: new THREE.BoxGeometry(vertical ? 0.26 : len + 0.1, 0.07, vertical ? len + 0.1 : 0.26),
    matrix: trs(0, h + fh + 0.12, 0),
  });
  /* Slat pitch is derived, not fixed: a whole number of slats over the run
   * keeps both ends flush against the corner posts. */
  const ns = Math.max(4, Math.round(len / 0.17));
  const pitch = len / ns;
  for (let i = 0; i < ns; i++) {
    const [sx, sz] = along(-len / 2 + pitch * (i + 0.5));
    slats.push({
      geometry: new THREE.BoxGeometry(vertical ? 0.05 : pitch * 0.72, fh, vertical ? pitch * 0.72 : 0.05),
      matrix: trs(sx, h + fh / 2, sz),
    });
  }
  const fm = new THREE.Mesh(bake(frame), m.door);
  const sm = new THREE.Mesh(bake(slats), cel({ color: 0xb09a76, bands: 3, tint: 0x6f6790 }));
  fm.castShadow = sm.castShadow = true;
  fm.receiveShadow = sm.receiveShadow = true;
  g.add(fm, sm);
  g.position.set(o.x, o.y ?? 0, o.z);
  g.userData.top = h + fh + 0.16;
  return g;
}

/**
 * ブロック塀 with a top course of 透かしブロック.
 *
 * The pierced course is the whole reason to build this rather than reuse
 * `makeWall`: a plain block wall at this height is a grey band and nothing
 * else, and a row of square voids along the top gives it a rhythm and lets
 * the garden behind show through.  Each void is a four-sided frame, all of
 * them baked into one mesh.
 */
export function makeBlockFence(o) {
  const m = mats();
  const g = new THREE.Group();
  g.name = 'openFrame';
  const len = o.len;
  const h = o.h ?? 0.72;                      // solid coursing
  const bh = o.blockH ?? 0.4;                 // the pierced course on top
  const vertical = o.axis === 'z';
  const along = (t) => (vertical ? [0, t] : [t, 0]);
  const TH = 0.19;                            // wall thickness

  const body = box(vertical ? TH : len, h, vertical ? len : TH, m.concreteMid, 0, h / 2, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  /* The block joints, as shallow recessed lines.  Two courses of 190 mm plus
   * the vertical perpends at 390 mm, which is what the real thing measures. */
  const joints = [];
  const grout = cel({ color: 0xa9a3b2, bands: 3, tint: 0x625b7d });
  for (let v = 0.19; v < h - 0.02; v += 0.19) {
    joints.push({
      geometry: new THREE.BoxGeometry(vertical ? TH + 0.02 : len, 0.025, vertical ? len : TH + 0.02),
      matrix: trs(0, v, 0),
    });
  }
  const nj = Math.max(1, Math.round(len / 0.39));
  for (let i = 1; i < nj; i++) {
    const [jx, jz] = along(-len / 2 + (len / nj) * i);
    joints.push({
      geometry: new THREE.BoxGeometry(vertical ? TH + 0.02 : 0.025, h, vertical ? 0.025 : TH + 0.02),
      matrix: trs(jx, h / 2, jz),
    });
  }
  g.add(new THREE.Mesh(bake(joints), grout));

  // the pierced course: a square void inside each block
  const frames = [];
  const nb = Math.max(2, Math.round(len / 0.39));
  const bw = len / nb;
  const rim = Math.min(0.085, bw * 0.2);
  for (let i = 0; i < nb; i++) {
    const c = -len / 2 + bw * (i + 0.5);
    // top and bottom of the frame
    for (const s of [-1, 1]) {
      const [fx, fz] = along(c);
      frames.push({
        geometry: new THREE.BoxGeometry(vertical ? TH : bw, rim, vertical ? bw : TH),
        matrix: trs(fx, h + bh / 2 + s * (bh - rim) / 2, fz),
      });
    }
    // and the two jambs
    for (const s of [-1, 1]) {
      const [fx, fz] = along(c + s * (bw - rim) / 2);
      frames.push({
        geometry: new THREE.BoxGeometry(vertical ? TH : rim, bh - rim * 2, vertical ? rim : TH),
        matrix: trs(fx, h + bh / 2, fz),
      });
    }
  }
  const bm = new THREE.Mesh(bake(frames), m.concrete);
  bm.castShadow = bm.receiveShadow = true;
  g.add(bm);

  /* The coping overhangs by 40 mm and does not cast: at this cascade size a
   * thin overhang's own shadow lands as a row of sawtooth triangles along the
   * wall face rather than as a line.  Same reason `wallRun` does it. */
  const cap = box(vertical ? TH + 0.08 : len + 0.06, 0.08, vertical ? len + 0.06 : TH + 0.08,
    m.concrete, 0, h + bh + 0.04, 0);
  cap.receiveShadow = true;
  g.add(cap);

  g.position.set(o.x, o.y ?? 0, o.z);
  g.userData.top = h + bh + 0.08;
  return g;
}
