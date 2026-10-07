/*
 * herocraft.js: the 5 inch airframe, for the settings studio and the world.
 *
 * Same published dimensions and motor order as the plant: RR FR RL FL, front
 * at -z, 220 mm diagonal, 5 inch discs. src/render/craft.js is the session
 * wrapper that names it, scales it into the world, and keeps the body box
 * and prop discs as direct children so check 15 can still measure it.
 * Settings passes `lite` so the overlay skips outline hulls and shadow
 * casters; the world craft stays full, including on the title flythrough.
 *
 * WHAT IT IS A MODEL OF. A built freestyle five inch, the way one looks on a
 * bench: a carbon bottom plate with four separate arms bolted to it, a top
 * plate on four anodised standoffs, a 30.5 mm ESC and flight controller
 * stacked on grommets between them, a micro camera pivoting in printed TPU
 * cheeks at the nose, 2306 motors with their windings showing through the
 * bell, triblade props with real twist, a pack strapped under the frame on
 * a grip pad, the XT60 lead and its capacitor out of the back, and the
 * video antenna in a printed mount at the rear. It used to be a box sketch
 * of that: box plates, box arms, a box pack, a faceted pink dome where the
 * camera cage goes and four ghostly coins for props.
 *
 * HOW IT STAYS CHEAP. Every part that does not move is merged, by FINISH
 * rather than by colour: one mesh for everything matte (carbon, the pack,
 * the boards, the wires), one for the machined metal, one for the printed
 * TPU, one for vinyl, each wearing its colours as vertex colours over a
 * white cel material. A part costs triangles, not a draw call, so the
 * screws and the zip ties are close to free. The moving parts are the four
 * rotors and the camera, which the shell turns, and the parts the shell
 * animates on their own: the lamps and the discs. See the counts in
 * PROGRESS.md for before and after.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial } from './celmat.js';
import { CRAFT_ARM, CRAFT_PROP_R } from '../game/collide.js';
import { WORLD_SCALE } from './frame.js';
import { CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP } from './lens.js';

const MOTOR_ARM = CRAFT_ARM / Math.SQRT2;

/*
 * THE HEIGHTS, bottom to top, in the craft frame (y up, metres from the CG).
 *
 * Two of them are not free. The strap under the pack is the lowest thing the
 * model draws and it sits at exactly 30.0 mm under the CG, because
 * scripts/craft-check.js pins the gap between the drawn underside and the
 * plant's contact hull at the 15 mm it measured before this model existed:
 * draw it lower and the parked quad sinks into the grass, draw it higher
 * and that check fails, both correctly. And nothing but the antenna may
 * stand higher than the 39.6 mm the old canopy reached, which the same
 * script holds against the collider's 38 mm roof. The rotor plane came down
 * to where a real 2306 on a 5.5 mm arm puts it, so the tallest drawn part is
 * now the prop nut, a few millimetres under that line.
 */
const STRAP_FLOOR = -0.0300;
const PACK_Y0 = -0.0288;
const PACK_Y1 = -0.0060;
const PLATE_Y0 = -0.0045;
const PLATE_Y1 = -0.0020;
const ARM_Y1 = 0.0035;
const TOP_Y0 = 0.0215;
const TOP_Y1 = 0.0240;
const BASE_Y1 = 0.0060;
const BELL_Y0 = 0.0080;
const RING_Y0 = 0.0192;
const BELL_Y1 = 0.0218;
const CAP_Y1 = 0.0230;
const ROTOR_Y = 0.0266;
/* The stack's centre, a little behind the CG, where the old boards were. */
const STACK_Z = 0.004;
/* Where along its diagonal an arm starts, and how wide it is there, at the
 * neck behind the motor, and around the motor. */
const ARM_ROOT = 0.0262;
const ARM_W_ROOT = 0.0105;
const ARM_W_NECK = 0.0078;
const ARM_PAD_R = 0.0142;

/*
 * THE PALETTE. Same one the page and the board paint in CSS: forest carbon,
 * cream vinyl, sakura chrome, mint for a live lamp. Named here once, as
 * colours, because most of the model wears them as vertex colours over a
 * shared finish rather than as a material each.
 *
 * Sakura is the chrome: the camera cage and the antenna mount (printed
 * TPU), the standoffs and the top of every motor bell (anodised), the
 * grommets, and the front props, so the airframe still reads as the
 * wordmark and a pilot can still tell its nose from its tail at fifty
 * metres. It used to be one faceted dome over the camera, which read as a
 * pink blob from every angle and is not a part a five inch carries.
 */
const C = {
  carbon: 0x1c241e,
  carbonEdge: 0x2a342c,
  carbonDeep: 0x121810,
  livery: 0xe8dcc0,
  sakura: 0xe8a8b8,
  sakuraDeep: 0xc47888,
  mint: 0x7dffb4,
  bell: 0xd8d0c4,
  steel: 0xbcb4a2,
  darkSteel: 0x3a423c,
  motorBase: 0x262e28,
  pcb: 0x2a4a38,
  pcbDeep: 0x223e2e,
  chip: 0x141a16,
  pack: 0x161c18,
  grip: 0x0c100e,
  strap: 0x2c3830,
  wire: 0x161c18,
  wireRed: 0xc0483c,
  xt60: 0xe8c04a,
  capacitor: 0x1e2c2a,
  camBody: 0x141c16,
  camRing: 0x3a4440,
  bezel: 0xb8b09e,
  propFront: 0xe890a8,
  propFrontTip: 0xf8d8e0,
  propRear: 0x4a554c,
  propRearTip: 0xb4beb0,
  copper: 0xb4703c,
  ink: 0x0c120e,
  inkWarm: 0x1a1214,
};

function bake(geo, x, y, z, rx, ry, rz) {
  const g = geo.clone();
  if (rx) {
    g.rotateX(rx);
  }
  if (ry) {
    g.rotateY(ry);
  }
  if (rz) {
    g.rotateZ(rz);
  }
  g.translate(x, y, z);
  return g;
}

/*
 * One colour on every vertex of a part, and the part made mergeable with
 * every other: no index, no uv, no groups. mergeGeometries refuses to mix
 * indexed and unindexed geometry, and an ExtrudeGeometry is unindexed while
 * a box or a cylinder is not, so they all go unindexed here. Colour goes
 * through THREE.Color so it is converted to the working space exactly as a
 * material's `color` is, which is what keeps a vertex coloured part the
 * same colour the old one material per part model painted it.
 */
const tint = new THREE.Color();
function paint(geo, hex, flat = false) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.clearGroups();
  if (flat) {
    /* Unindexed, every face owns its vertices, so this gives each face its
     * own normal: a knurled ring or a hex nut that shades as facets. */
    g.computeVertexNormals();
  }
  tint.setHex(hex);
  const n = g.getAttribute('position').count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    rgb[i * 3] = tint.r;
    rgb[i * 3 + 1] = tint.g;
    rgb[i * 3 + 2] = tint.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return g;
}

/* A rounded rectangle, as a path, for plates, the pack and the cutouts. */
function roundRect(path, x0, y0, x1, y1, r) {
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r);
  path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
  return path;
}

/* A slot with round ends, as a hole. */
function slotPath(cx, y0, y1, w) {
  const p = new THREE.Path();
  const r = w / 2;
  p.moveTo(cx - r, y0 + r);
  p.lineTo(cx - r, y1 - r);
  p.absarc(cx, y1 - r, r, Math.PI, 0, true);
  p.lineTo(cx + r, y0 + r);
  p.absarc(cx, y0 + r, r, 0, Math.PI, true);
  return p;
}

/*
 * A flat part cut from sheet, lying in the craft's plan view, y0 to y1 thick.
 *
 * The shape is drawn in plan with its y axis pointing FORWARD, which is -z
 * in the craft frame, so a shape's numbers read as "how far forward". The
 * bevel is inset (bevelOffset is minus its size) so the footprint is the
 * outline exactly and the chamfer comes out of the part rather than being
 * added round it: a chamfered plate is the same size as a square edged one.
 * The chamfer is the point. It is what catches the cel spec band and the
 * rim light on a carbon edge, which is most of what makes a dark plate
 * read as machined rather than as a slab.
 */
function slab(shape, y0, y1, bev, curveSegments, bevelSegments = 1) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.00001, y1 - y0 - 2 * bev),
    bevelEnabled: bev > 0,
    bevelThickness: bev,
    bevelSize: bev,
    bevelOffset: -bev,
    bevelSegments,
    curveSegments,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0 + bev, 0);
  return geo;
}

/*
 * THE INK SHELL, an inverted hull that is the same thickness everywhere.
 *
 * celmat.js's outlineHull scales a copy of the mesh about the mesh's own
 * origin, which is exactly right for a part built round its own centre and
 * wrong for a merged one: a merged frame's origin is the CG, so a 1.07 hull
 * puts 7 mm of ink beyond the end of an arm and almost none down its sides.
 * That is the reason the old model kept every arm and every bell a mesh of
 * its own, and paid a draw call and a hull for each.
 *
 * This pushes each vertex out along the MITRE of the faces that meet at it
 * instead, so every face of every merged part moves out by `width`, and a
 * box corner stays a corner rather than going round. Vertices are welded by
 * position to find their faces, because an unindexed geometry has a copy of
 * a corner for each face that shares it, and offsetting the copies along
 * their own face normals would open the shell at every edge.
 *
 * The shell keeps the part's own face normals. post.js's ink prepass draws
 * every mesh with one override material, hulls included, so the shell is
 * what the edge pass sees: with the part's normals it finds the same creases
 * the part has, and a smoothed shell would erase them. It is marked with
 * hullColor exactly as outlineHull marks its own, so scripts/craft-check.js
 * leaves it out of the measured machine for the same reason: it is paint.
 */
function inkShell(mesh, width, color, fog) {
  const src = mesh.geometry;
  const pos = src.getAttribute('position');
  const n = pos.count;
  const keyOf = (i) => `${Math.round(pos.getX(i) * 2e5)},${Math.round(pos.getY(i) * 2e5)},${Math.round(pos.getZ(i) * 2e5)}`;
  const keys = new Array(n);
  const faces = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i += 1) {
    keys[i] = keyOf(i);
  }
  for (let t = 0; t + 2 < n; t += 3) {
    a.fromBufferAttribute(pos, t);
    b.fromBufferAttribute(pos, t + 1).sub(a);
    c.fromBufferAttribute(pos, t + 2).sub(a);
    b.cross(c);
    const len = b.length();
    if (len < 1e-12) {
      continue;
    }
    b.multiplyScalar(1 / len);
    for (let k = 0; k < 3; k += 1) {
      const key = keys[t + k];
      let list = faces.get(key);
      if (!list) {
        list = [];
        faces.set(key, list);
      }
      if (!list.some((f) => f.dot(b) > 0.996)) {
        list.push(b.clone());
      }
    }
  }
  const push = new Map();
  for (const [key, list] of faces) {
    const m = new THREE.Vector3();
    for (const f of list) {
      m.add(f);
    }
    if (m.lengthSq() < 1e-10) {
      m.copy(list[0]);
    }
    m.normalize();
    let least = 1;
    for (const f of list) {
      least = Math.min(least, m.dot(f));
    }
    /* Clamped, so a needle sharp vertex gets a spike three widths long and
     * not one a metre long. */
    push.set(key, m.multiplyScalar(width / Math.max(least, 0.34)));
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const p = push.get(keys[i]);
    out[i * 3] = pos.getX(i) + (p ? p.x : 0);
    out[i * 3 + 1] = pos.getY(i) + (p ? p.y : 0);
    out[i * 3 + 2] = pos.getZ(i) + (p ? p.z : 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.setAttribute('normal', src.getAttribute('normal').clone());
  const hull = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog }),
  );
  hull.material.userData.hullColor = color;
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
  return mesh;
}

/*
 * A five inch triblade, lofted rather than extruded.
 *
 * The old blade was a flat outline extruded 1.7 mm and laid in the disc
 * plane, which is a propeller with no pitch: a fan cut from card. A real
 * 5 inch has about 4.3 inches of geometric pitch, so its blade is steep at
 * the root and nearly flat at the tip, and that twist is the thing the eye
 * reads as "propeller". So each blade is a run of airfoil sections out
 * along the span, each one turned to the angle a 4.3 inch helix has at its
 * radius (capped near the hub, where the true angle passes 60 degrees and
 * the hub hides it anyway), with a flat bottomed section that is thickest a
 * third of the way back, a mid chord that sweeps back toward the tip, and a
 * rounded tip.
 *
 * THE TWIST HAS A HAND. A prop that spins counter clockwise seen from above
 * leads with the edge on its +x side at the blade that points to +z, and a
 * blade lifts when the edge it leads with is the higher one, so the two
 * hands are mirror images. `dir` is the rotor's PROP_SPIN, the same number
 * the shell spins the rotor by, so a rotor can never be drawn with the
 * pitch of the other hand.
 *
 * Station rows: radius, chord, sweep of the mid chord toward the trailing
 * edge, thickness. All metres. The tip band starts at 0.0555, which is where
 * the colour changes: the last tenth of a blade is the part that draws the
 * ring a spinning prop leaves, so it is painted lighter, the way a lot of
 * real props are.
 */
const BLADE_ROWS = [
  [0.0050, 0.0074, 0.0000, 0.0016],
  [0.0100, 0.0112, 0.0002, 0.0016],
  [0.0170, 0.0134, 0.0006, 0.0015],
  [0.0250, 0.0136, 0.0011, 0.0013],
  [0.0330, 0.0128, 0.0016, 0.0012],
  [0.0410, 0.0116, 0.0021, 0.0011],
  [0.0480, 0.0102, 0.0026, 0.0010],
  [0.0540, 0.0088, 0.0030, 0.0009],
  [0.0560, 0.0083, 0.0031, 0.0009],
  [0.0595, 0.0066, 0.0033, 0.0008],
  [0.0614, 0.0046, 0.0034, 0.0007],
  [0.0625, 0.0020, 0.0034, 0.0006],
];
const BLADE_ROWS_LITE = [0, 2, 4, 6, 8, 10, 11].map((i) => BLADE_ROWS[i]);
const BLADE_TIP_START = 0.0555;
/* 4.3 inches of geometric pitch, and the steepest the root is drawn. */
const BLADE_PITCH = 0.109;
const BLADE_PITCH_CAP = 0.60;

function bladeGeometry(rows, dir, bodyHex, tipHex, lite) {
  /* Chord stations, leading edge (0) to trailing edge (1), and the section's
   * top and bottom at each, as a fraction of the thickness. */
  const us = lite ? [0, 0.35, 1] : [0, 0.15, 0.4, 0.72, 1];
  const top = lite ? [0, 1.0, 0] : [0, 0.80, 1.0, 0.62, 0];
  const bot = lite ? [0, -0.25, 0] : [0, -0.22, -0.20, -0.10, 0];
  const ringLen = us.length * 2 - 2;
  const positions = [];
  const colours = [];
  const body = new THREE.Color(bodyHex);
  const tip = new THREE.Color(tipHex);
  for (const [s, chord, sweep, thick] of rows) {
    const phi = Math.min(BLADE_PITCH_CAP, Math.atan2(BLADE_PITCH, 2 * Math.PI * s));
    const cs = Math.cos(phi);
    const sn = Math.sin(phi);
    const ring = [];
    /* Round the section: leading edge, along the top to the trailing edge,
     * and back along the bottom. */
    for (let k = 0; k < us.length; k += 1) {
      ring.push([us[k], top[k]]);
    }
    for (let k = us.length - 2; k > 0; k -= 1) {
      ring.push([us[k], bot[k]]);
    }
    const col = s >= BLADE_TIP_START ? tip : body;
    for (const [u, h] of ring) {
      const p = chord * (0.5 - u) - sweep;
      const y = h * thick;
      const xr = p * cs - y * sn;
      const yr = p * sn + y * cs;
      positions.push(dir * xr, yr, s);
      colours.push(col.r, col.g, col.b);
    }
  }
  const index = [];
  const flip = dir < 0;
  const tri = (i, j, k) => {
    if (flip) {
      index.push(i, k, j);
    } else {
      index.push(i, j, k);
    }
  };
  for (let r = 0; r + 1 < rows.length; r += 1) {
    for (let k = 0; k < ringLen; k += 1) {
      const a0 = r * ringLen + k;
      const b0 = r * ringLen + ((k + 1) % ringLen);
      const a1 = a0 + ringLen;
      const b1 = b0 + ringLen;
      tri(a0, b0, b1);
      tri(a0, b1, a1);
    }
  }
  /* Close the tip with a fan from the last section's middle. The root is
   * left open: it is inside the hub. */
  const last = (rows.length - 1) * ringLen;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < ringLen; k += 1) {
    cx += positions[(last + k) * 3];
    cy += positions[(last + k) * 3 + 1];
  }
  const centre = positions.length / 3;
  positions.push(cx / ringLen, cy / ringLen, rows[rows.length - 1][0] + 0.0004);
  colours.push(tip.r, tip.g, tip.b);
  for (let k = 0; k < ringLen; k += 1) {
    tri(centre, last + k, last + ((k + 1) % ringLen));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const out = geo.toNonIndexed();
  geo.dispose();
  return out;
}

/*
 * One rotor: three blades, the hub they are moulded into, and the prop nut.
 * All of it spins together, so it is one mesh, one draw, per rotor.
 */
function rotorGeometry(dir, front, lite) {
  const bodyHex = front ? C.propFront : C.propRear;
  const tipHex = front ? C.propFrontTip : C.propRearTip;
  const seg = lite ? 8 : 14;
  const parts = [];
  const blade = bladeGeometry(lite ? BLADE_ROWS_LITE : BLADE_ROWS, dir, bodyHex, tipHex, lite);
  for (let b = 0; b < 3; b += 1) {
    parts.push(bake(blade, 0, 0, 0, 0, (b * Math.PI * 2) / 3, 0));
  }
  blade.dispose();
  /* The hub, bottom to top, so LatheGeometry faces outward. */
  const hub = new THREE.LatheGeometry([
    new THREE.Vector2(0.0001, -0.0035),
    new THREE.Vector2(0.0060, -0.0035),
    new THREE.Vector2(0.0066, -0.0027),
    new THREE.Vector2(0.0064, 0.0027),
    new THREE.Vector2(0.0050, 0.0035),
    new THREE.Vector2(0.0001, 0.0035),
  ], seg);
  parts.push(paint(hub, bodyHex));
  /* The M5 lock nut: a hex, faceted, with its nylon dome. */
  parts.push(paint(bake(new THREE.CylinderGeometry(0.0040, 0.0040, 0.0034, 6), 0, 0.0052, 0), C.steel, true));
  parts.push(paint(bake(new THREE.CylinderGeometry(0.0024, 0.0033, 0.0013, lite ? 6 : 10), 0, 0.00755, 0), C.bell));
  const geo = mergeGeometries(parts, false);
  for (const p of parts) {
    p.dispose();
  }
  if (!geo) {
    throw new Error('herocraft: rotor merge failed');
  }
  return geo;
}

/*
 * The arm, in its own frame: across is x, up is y, and it runs out along -z
 * from ARM_ROOT to the motor at CRAFT_ARM, a 5.5 mm carbon blade that
 * narrows to a neck and ends in a round pad the motor bolts to. The chamfer
 * on its top edges is what makes it read as cut carbon from the chase
 * camera.
 */
function armShape() {
  const s = new THREE.Shape();
  const a = CRAFT_ARM;
  const neck = a - Math.sqrt(ARM_PAD_R * ARM_PAD_R - ARM_W_NECK * ARM_W_NECK);
  const t1 = Math.atan2(neck - a, -ARM_W_NECK);
  const t2 = Math.atan2(neck - a, ARM_W_NECK);
  s.moveTo(-ARM_W_ROOT, ARM_ROOT);
  s.lineTo(-ARM_W_NECK, neck);
  s.absarc(0, a, ARM_PAD_R, t1, t2, true);
  s.lineTo(ARM_W_ROOT, ARM_ROOT);
  s.lineTo(-ARM_W_ROOT, ARM_ROOT);
  return s;
}

/* Half the arm's width at a distance u along it, for the zip ties. */
function armHalfWidth(u) {
  const neck = CRAFT_ARM - Math.sqrt(ARM_PAD_R * ARM_PAD_R - ARM_W_NECK * ARM_W_NECK);
  const k = Math.min(1, Math.max(0, (u - ARM_ROOT) / (neck - ARM_ROOT)));
  return ARM_W_ROOT + (ARM_W_NECK - ARM_W_ROOT) * k;
}

/* A point in an arm's frame, into the craft's: across, up, and out along
 * the arm, turned by the arm's yaw. */
function armPoint(psi, across, y, u) {
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  return new THREE.Vector3(across * c - u * s, y, -across * s - u * c);
}

/*
 * Props-in as seen from above: RR and FL clockwise, FR and RL counter
 * clockwise. Right-hand rotation about +Y is counter clockwise, so clockwise
 * is a negative spin.
 */
export const PROP_SPIN = [-1, 1, 1, -1];

export function buildHeroCraft(opts = {}) {
  const fog = opts.fog !== false;
  /*
   * Lite is the Settings overlay and the ghost: same silhouette, fewer
   * rings, no ink shells, no shadow casters, and none of the parts too small
   * to see in a 400 pixel preview or through a translucent ghost (the
   * screws, the wiring, the chips on the boards). The world craft stays
   * full. Settings already pays for a second WebGL context; that context has
   * to stay cheap.
   */
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const detail = !lite;
  const seg = lite ? 10 : 18;
  const curve = lite ? 3 : 6;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  /* A finish: a white cel material that takes its colour from the vertices
   * of whatever is merged into it. vertexColors is set after construction
   * because celMaterial's options do not carry it; it is a standard material
   * flag, so three folds it into the program key without help. */
  const finish = (o) => {
    const m = cel({ color: 0xffffff, ...o });
    m.vertexColors = true;
    return m;
  };
  const group = new THREE.Group();
  group.name = opts.name ?? 'hero-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const ink = (mesh, width, color = C.ink) => (inkOn ? inkShell(mesh, width, color, fog) : mesh);

  /*
   * Four finishes for everything that does not move, and what each is for.
   * body: matte, carbon and everything that is not metal, TPU or vinyl.
   * metal: machined and plated, the bells, the standoffs and the hardware.
   * tpu: printed sakura TPU and the rubber grommets, a satin sheen.
   * vinyl: the cream decals, the pack's label and the zip ties.
   */
  const bodyMat = finish({ rim: 0.28, spec: 0.20, specWidth: 0.012 });
  const metalMat = finish({ rim: 0.32, spec: 0.72, specWidth: 0.022, specColor: 0xf3ead4 });
  const tpuMat = finish({ rim: 0.40, spec: 0.34, specWidth: 0.016 });
  const vinylMat = finish({ rim: 0.26, spec: 0.28 });
  const propMat = finish({ rim: 0.34, spec: 0.30, specWidth: 0.014 });
  const camMat = finish({ rim: 0.26, spec: 0.35 });
  /* The windings. Returned as `stator`: craftpose.js warms its emissive
   * with throttle in the studio, so it is the copper that glows. */
  const stator = cel({ color: C.copper, rim: 0.24, spec: 0.40, specWidth: 0.016 });
  const lens = cel({
    color: 0x101610,
    rim: 0.40,
    spec: 0.95,
    specWidth: 0.03,
    specColor: 0xf3ead4,
    side: THREE.DoubleSide,
  });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const antennaTip = cel({ color: C.mint, rim: 0.20, spec: 0.4 });

  const parts = { body: [], metal: [], tpu: [], vinyl: [] };
  const add = (finishName, geo, hex, flat) => {
    parts[finishName].push(paint(geo, hex, flat));
  };

  const a = MOTOR_ARM;
  const motors = [
    [a, a],
    [a, -a],
    [-a, a],
    [-a, -a],
  ];

  /*
   * Check 15 reads a direct child BoxGeometry whose depth is the body
   * length. The visible plates are merged BufferGeometry, so this box is
   * the published airframe, hidden, and the only thing that measurement
   * is allowed to see.
   */
  if (opts.measure) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.088, 0.034, 0.155),
      bodyMat,
    );
    box.visible = false;
    box.castShadow = false;
    group.add(box);
  }

  /*
   * THE FRAME. A bottom plate that runs forward under the camera, four
   * arms on it, the top plate on four standoffs. Plate numbers are a
   * typical 5 inch freestyle frame's: a 2.5 mm bottom and top, 5.5 mm arms,
   * a 32 mm wide body and a 35 mm wide top.
   */
  {
    const bottom = roundRect(new THREE.Shape(), -0.0170, -0.056, 0.0170, 0.094, 0.006);
    add('body', slab(bottom, PLATE_Y0, PLATE_Y1, 0.0005, curve), C.carbon);

    const arm = slab(armShape(), PLATE_Y1, ARM_Y1, lite ? 0.0005 : 0.0007, curve + 2);
    for (const [mx, mz] of motors) {
      const psi = Math.atan2(-mx, -mz);
      add('body', bake(arm, 0, 0, 0, 0, psi, 0), C.carbon);
    }
    arm.dispose();

    /* The top plate, with the window the flight controller shows through
     * and two lightening slots, which is what stops it reading as a lid. */
    const top = roundRect(new THREE.Shape(), -0.0175, -0.056, 0.0175, 0.066, 0.006);
    top.holes.push(roundRect(new THREE.Path(), -0.0085, -0.014, 0.0085, 0.012, 0.003));
    top.holes.push(slotPath(-0.0105, 0.024, 0.046, 0.0034));
    top.holes.push(slotPath(0.0105, 0.024, 0.046, 0.0034));
    add('body', slab(top, TOP_Y0, TOP_Y1, 0.0006, curve), C.carbon);

    /* Anodised standoffs, hex, and the button heads on the top plate. */
    const post = new THREE.CylinderGeometry(0.0025, 0.0025, TOP_Y0 - PLATE_Y1, 6);
    const head = new THREE.CylinderGeometry(0.0029, 0.0030, 0.0012, lite ? 8 : 12);
    for (const sz of [-0.059, 0.049]) {
      for (const sx of [-0.013, 0.013]) {
        add('metal', bake(post, sx, (PLATE_Y1 + TOP_Y0) / 2, sz), C.sakura, true);
        add('metal', bake(head, sx, TOP_Y1 + 0.0006, sz), C.steel);
      }
    }
    post.dispose();
    head.dispose();

    /* Cream vinyl: a chevron on the nose of the top plate, which is the
     * cheapest way there is to tell a chase camera which end is the front,
     * and a stripe down the back. */
    const chev = new THREE.Shape();
    chev.moveTo(-0.0090, 0.0500);
    chev.lineTo(0, 0.0580);
    chev.lineTo(0.0090, 0.0500);
    chev.lineTo(0.0090, 0.0465);
    chev.lineTo(0, 0.0545);
    chev.lineTo(-0.0090, 0.0465);
    chev.closePath();
    add('vinyl', slab(chev, TOP_Y1 - 0.0001, TOP_Y1 + 0.0003, 0, 1), C.livery);
    const stripe = roundRect(new THREE.Shape(), -0.0025, -0.040, 0.0025, -0.020, 0.0008);
    add('vinyl', slab(stripe, TOP_Y1 - 0.0001, TOP_Y1 + 0.0003, 0, 2), C.livery);
  }

  /*
   * THE MOTORS. 2306s: a dark base on the arm pad, the copper windings
   * showing in the gap under the bell and through the cooling holes in its
   * top, a silver bell with a sakura anodised top band. Static, all four
   * merged: the bell of a real motor spins, but a round bell spinning looks
   * like a round bell standing still, and the four of them as one mesh is
   * three draw calls cheaper than four that turn.
   */
  const windingGeo = (() => {
    if (lite) {
      const g = new THREE.CylinderGeometry(0.0118, 0.0118, BELL_Y1 - BASE_Y1, 10);
      g.translate(0, (BELL_Y1 - BASE_Y1) / 2, 0);
      return g;
    }
    /* Twelve teeth, each a wound pole, which is what a stator looks like
     * through the holes. */
    const s = new THREE.Shape();
    const teeth = 12;
    for (let k = 0; k < teeth * 2; k += 1) {
      const ang = (k / (teeth * 2)) * Math.PI * 2;
      const r = k % 2 === 0 ? 0.0120 : 0.0098;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (k === 0) {
        s.moveTo(x, y);
      } else {
        s.lineTo(x, y);
      }
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: BELL_Y1 - BASE_Y1, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  const windings = [];
  {
    const base = new THREE.CylinderGeometry(0.0134, 0.0138, BASE_Y1 - ARM_Y1, seg);
    /* Bottom to top, so the lathe faces outward: the skin, then the band. */
    const skin = new THREE.LatheGeometry([
      new THREE.Vector2(0.0128, BELL_Y0),
      new THREE.Vector2(0.0138, BELL_Y0),
      new THREE.Vector2(0.0140, BELL_Y0 + 0.0010),
      new THREE.Vector2(0.0140, RING_Y0),
    ], seg);
    const band = new THREE.LatheGeometry([
      new THREE.Vector2(0.0140, RING_Y0),
      new THREE.Vector2(0.0140, BELL_Y1 - 0.0009),
      new THREE.Vector2(0.0134, BELL_Y1),
      new THREE.Vector2(0.0128, BELL_Y1),
    ], seg);
    /* The bell's top, with five round cooling holes. */
    const capShape = new THREE.Shape();
    capShape.absarc(0, 0, 0.0129, 0, Math.PI * 2, false);
    for (let k = 0; k < 5; k += 1) {
      const ang = (k / 5) * Math.PI * 2 + 0.3;
      const hole = new THREE.Path();
      hole.absarc(Math.cos(ang) * 0.0094, Math.sin(ang) * 0.0094, 0.0024, 0, Math.PI * 2, true);
      capShape.holes.push(hole);
    }
    const cap = slab(capShape, BELL_Y1 - 0.0005, CAP_Y1, 0.0003, lite ? 4 : 6);
    /* The four motor screws under the pad, the 16 mm pattern, for the
     * shots from below. */
    const screw = new THREE.CylinderGeometry(0.0027, 0.0027, 0.0014, 6);
    for (const [mx, mz] of motors) {
      add('body', bake(base, mx, (ARM_Y1 + BASE_Y1) / 2, mz), C.motorBase);
      add('metal', bake(skin, mx, 0, mz), C.bell);
      add('metal', bake(band, mx, 0, mz), C.sakura);
      add('metal', bake(cap, mx, 0, mz), C.sakura);
      windings.push(bake(windingGeo, mx, BASE_Y1, mz));
      if (detail) {
        for (let k = 0; k < 4; k += 1) {
          const ang = Math.PI / 4 + (k * Math.PI) / 2;
          add('metal', bake(screw, mx + Math.cos(ang) * 0.0113, PLATE_Y1 - 0.0007, mz + Math.sin(ang) * 0.0113), C.darkSteel, true);
        }
      }
    }
    base.dispose();
    skin.dispose();
    band.dispose();
    cap.dispose();
    screw.dispose();
    windingGeo.dispose();
  }
  {
    for (const g of windings) {
      g.deleteAttribute('uv');
      g.clearGroups();
    }
    const geo = mergeGeometries(windings.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    const mesh = new THREE.Mesh(geo, stator);
    group.add(mesh);
  }

  /*
   * THE WIRING AND THE LAMPS ON EACH ARM. Three motor leads run down the
   * arm to the ESC's corner pad, held by two cream zip ties, and a lamp
   * sits on the arm's rear edge. The lamp is a mesh of its own because the
   * studio drives each one's colour from its motor's speed; the dark
   * housing under it is merged with the frame.
   */
  const ledMeshes = [];
  for (let m = 0; m < 4; m += 1) {
    const [mx, mz] = motors[m];
    const psi = Math.atan2(-mx, -mz);
    const side = mx > 0 ? 1 : -1;
    if (detail) {
      for (let w = -1; w <= 1; w += 1) {
        const off = w * 0.0017;
        const curvePts = [
          armPoint(psi, off, ARM_Y1 + 0.0008, 0.0960),
          armPoint(psi, off, ARM_Y1 + 0.0008, 0.0700),
          armPoint(psi, off, ARM_Y1 + 0.0009, 0.0440),
          armPoint(psi, off * 0.8, ARM_Y1 + 0.0030, 0.0330),
          new THREE.Vector3(
            Math.sign(mx) * 0.0150 + off * 0.5,
            0.0090,
            STACK_Z + Math.sign(mz) * 0.0150 - off * 0.5,
          ),
        ];
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts), 7, 0.0008, 5, false);
        add('body', tube, C.wire);
      }
      for (const u of [0.0590, 0.0840]) {
        const hw = armHalfWidth(u) + 0.0003;
        const tie = new THREE.Shape();
        roundRect(tie, -hw - 0.0006, PLATE_Y1 - 0.0006, hw + 0.0006, ARM_Y1 + 0.0022, 0.0006);
        tie.holes.push(roundRect(new THREE.Path(), -hw, PLATE_Y1, hw, ARM_Y1 + 0.0016, 0.0003));
        const g = new THREE.ExtrudeGeometry(tie, { depth: 0.0024, bevelEnabled: false, curveSegments: 1 });
        g.translate(0, 0, -u - 0.0012);
        g.rotateY(psi);
        add('vinyl', g, C.livery);
        const lock = new THREE.BoxGeometry(0.0020, 0.0032, 0.0036);
        const at = armPoint(psi, side * (hw + 0.0014), (PLATE_Y1 + ARM_Y1) / 2, u);
        add('vinyl', bake(lock, at.x, at.y, at.z, 0, psi, 0), C.livery);
        lock.dispose();
      }
    }
    const housing = armPoint(psi, side * 0.0048, ARM_Y1 + 0.0005, 0.0710);
    add('body', bake(new THREE.BoxGeometry(0.0042, 0.0010, 0.0106), housing.x, housing.y, housing.z, 0, psi, 0), C.carbonDeep);
    const ledMat = new THREE.MeshBasicMaterial({
      color: mz < 0 ? C.sakura : C.mint,
      fog,
    });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.0030, 0.0012, 0.0094), ledMat);
    const at = armPoint(psi, side * 0.0048, ARM_Y1 + 0.0016, 0.0710);
    led.position.copy(at);
    led.rotation.y = psi;
    ledMeshes.push({ led, ledMat });
  }

  /*
   * THE STACK, seen from the side between the plates: the ESC on its
   * grommets, the flight controller above it, the MOSFETs, the MCU and the
   * USB port, and the four stack screws. The MCU and the two status lamps
   * are what shows through the top plate's window.
   */
  {
    const board = new THREE.BoxGeometry(0.0360, 0.0016, 0.0360);
    add('body', bake(board, 0, 0.0078, STACK_Z), C.pcb);
    add('body', bake(board, 0, 0.0148, STACK_Z), C.pcbDeep);
    board.dispose();
    const grommet = new THREE.CylinderGeometry(0.0026, 0.0026, 0.0054, lite ? 6 : 10);
    const lower = new THREE.CylinderGeometry(0.0024, 0.0026, 0.0090, lite ? 6 : 10);
    const nut = new THREE.CylinderGeometry(0.0028, 0.0028, 0.0018, 6);
    for (const sx of [-0.01525, 0.01525]) {
      for (const sz of [-0.01525, 0.01525]) {
        add('tpu', bake(grommet, sx, 0.0113, STACK_Z + sz), C.sakuraDeep);
        add('tpu', bake(lower, sx, 0.0025, STACK_Z + sz), C.sakuraDeep);
        if (detail) {
          add('vinyl', bake(nut, sx, 0.0165, STACK_Z + sz), C.livery, true);
        }
      }
    }
    grommet.dispose();
    lower.dispose();
    nut.dispose();
    if (detail) {
      const fet = new THREE.BoxGeometry(0.0050, 0.0011, 0.0040);
      for (const sx of [-0.0118, 0.0118]) {
        for (const sz of [-0.0100, -0.0040, 0.0040, 0.0100]) {
          add('body', bake(fet, sx, 0.0091, STACK_Z + sz), C.chip);
        }
      }
      fet.dispose();
      const pad = new THREE.BoxGeometry(0.0050, 0.0005, 0.0050);
      for (const sx of [-0.0150, 0.0150]) {
        for (const sz of [-0.0150, 0.0150]) {
          add('metal', bake(pad, sx, 0.0088, STACK_Z + sz), C.steel);
        }
      }
      pad.dispose();
      add('body', bake(new THREE.BoxGeometry(0.0072, 0.0012, 0.0072), 0, 0.0162, STACK_Z - 0.002), C.chip);
      add('body', bake(new THREE.BoxGeometry(0.0030, 0.0010, 0.0030), 0.0048, 0.0161, STACK_Z + 0.006), C.chip);
      add('body', bake(new THREE.BoxGeometry(0.0016, 0.0008, 0.0012), -0.0052, 0.0160, STACK_Z + 0.0075), C.mint);
      add('body', bake(new THREE.BoxGeometry(0.0016, 0.0008, 0.0012), -0.0030, 0.0160, STACK_Z + 0.0075), C.sakura);
      add('metal', bake(new THREE.BoxGeometry(0.0070, 0.0030, 0.0090), -0.0160, 0.0171, STACK_Z - 0.004), C.steel);
    }
  }

  /*
   * OUT OF THE BACK: the XT60 pigtail from the ESC's battery pads, red and
   * black, down behind the frame to the plug; the big low ESR capacitor on
   * the same pads, lying back between the rear arms; and the XT60 itself,
   * mated, behind the pack.
   */
  {
    for (const [dx, hex] of [[-0.0040, C.wireRed], [-0.0076, C.wire]]) {
      const lead = new THREE.CatmullRomCurve3([
        new THREE.Vector3(dx, 0.0080, 0.0200),
        new THREE.Vector3(dx, 0.0050, 0.0400),
        new THREE.Vector3(dx, 0.0015, 0.0600),
        new THREE.Vector3(dx, -0.0050, 0.0790),
        new THREE.Vector3(dx, -0.0130, 0.0800),
        new THREE.Vector3(dx, -0.0140, 0.0760),
      ]);
      add('body', new THREE.TubeGeometry(lead, lite ? 8 : 14, 0.0016, lite ? 5 : 7, false), hex);
    }
    const plug = roundRect(new THREE.Shape(), -0.0140, -0.0760, 0.0020, -0.0500, 0.0014);
    add('body', slab(plug, -0.0180, -0.0100, 0.0008, 2), C.xt60);
    const capBody = new THREE.CylinderGeometry(0.0050, 0.0050, 0.0190, lite ? 8 : 14);
    add('body', bake(capBody, 0.0052, 0.0032, 0.0510, Math.PI / 2, 0, 0), C.capacitor);
    capBody.dispose();
    add('metal', bake(new THREE.CylinderGeometry(0.0046, 0.0046, 0.0008, lite ? 8 : 14), 0.0052, 0.0032, 0.0608, Math.PI / 2, 0, 0), C.steel);
    if (detail) {
      add('vinyl', bake(new THREE.CylinderGeometry(0.00515, 0.00515, 0.0040, 14, 1, true), 0.0052, 0.0032, 0.0470, Math.PI / 2, 0, 0), C.livery);
    }
  }

  /*
   * THE PACK, under the frame where the old model hung it, on a rubber grip
   * pad, with its label on the sides (across the back it was a cream slab
   * as wide as the aircraft and read as a part), and a strap round it with
   * a buckle. The strap's underside is the lowest point of the model and is
   * STRAP_FLOOR exactly: see the heights above.
   */
  {
    const packShape = roundRect(new THREE.Shape(), -0.0175, -0.048, 0.0175, 0.026, 0.004);
    add('body', slab(packShape, PACK_Y0, PACK_Y1, 0.0028, curve, lite ? 1 : 2), C.pack);
    const gripShape = roundRect(new THREE.Shape(), -0.0165, -0.045, 0.0165, 0.023, 0.003);
    add('body', slab(gripShape, PACK_Y1, PLATE_Y0, 0.0003, curve), C.grip);
    for (const sx of [-1, 1]) {
      const label = new THREE.BoxGeometry(0.0004, 0.0140, 0.0240);
      add('vinyl', bake(label, sx * 0.01765, -0.0175, -0.0100), C.livery);
      label.dispose();
      const line = new THREE.BoxGeometry(0.0004, 0.0016, 0.0240);
      add('vinyl', bake(line, sx * 0.01780, -0.0175, -0.0100), C.sakura);
      line.dispose();
    }
    /*
     * The strap, as a U round the pack's section, extruded along the pack.
     * Drawn outer edge first, round the bottom, then back along the inner
     * edge, which follows the pack's own rounded corner.
     */
    const t = 0.0012;
    const xi = 0.0175;
    const xo = xi + t;
    const yb = PACK_Y0;
    const ri = 0.0028;
    const ro = ri + t;
    const yTop = PLATE_Y0;
    const u = new THREE.Shape();
    u.moveTo(-xo, yTop);
    u.lineTo(-xo, yb + ri);
    u.absarc(-xi + ri, yb + ri, ro, Math.PI, Math.PI * 1.5, false);
    u.lineTo(xi - ri, yb - t);
    u.absarc(xi - ri, yb + ri, ro, Math.PI * 1.5, Math.PI * 2, false);
    u.lineTo(xo, yTop);
    u.lineTo(xi, yTop);
    u.lineTo(xi, yb + ri);
    u.absarc(xi - ri, yb + ri, ri, 0, -Math.PI / 2, true);
    u.lineTo(-xi + ri, yb);
    u.absarc(-xi + ri, yb + ri, ri, -Math.PI / 2, -Math.PI, true);
    u.lineTo(-xi, yTop);
    u.closePath();
    const strapGeo = new THREE.ExtrudeGeometry(u, { depth: 0.0180, bevelEnabled: false, curveSegments: lite ? 2 : 4 });
    strapGeo.translate(0, 0, 0.0060);
    add('body', strapGeo, C.strap);
    if (yb - t !== STRAP_FLOOR && Math.abs(yb - t - STRAP_FLOOR) > 1e-9) {
      throw new Error('herocraft: the strap is not the floor the plant parks on');
    }
    /* The buckle on the right side, and the strap's tail through it. */
    const buckle = roundRect(new THREE.Shape(), -0.0110, -0.0240, 0.0110, -0.0110, 0.0015);
    buckle.holes.push(roundRect(new THREE.Path(), -0.0080, -0.0205, 0.0080, -0.0180, 0.0008));
    const bg = new THREE.ExtrudeGeometry(buckle, { depth: 0.0011, bevelEnabled: false, curveSegments: 2 });
    bg.rotateY(Math.PI / 2);
    bg.translate(xo, 0, 0.0150);
    add('metal', bg, C.steel);
    if (detail) {
      add('body', bake(new THREE.BoxGeometry(0.0010, 0.0090, 0.0170), xo + 0.0015, -0.0140, 0.0150), C.strap);
      /* The balance lead's plug, tucked on the back of the pack. */
      add('vinyl', bake(new THREE.BoxGeometry(0.0110, 0.0045, 0.0050), 0.0080, -0.0120, 0.0505), C.livery);
    }
  }

  /*
   * THE CAMERA CAGE, printed TPU, sakura: two cheeks the camera pivots
   * between, a chin bar under the lens and a bridge over the front of the
   * top plate. It is the nose of the aircraft from every angle a pilot sees
   * it from, which is the job the dome used to do, done by the part a real
   * five inch puts there.
   */
  {
    const cheek = new THREE.Shape();
    cheek.moveTo(0.0640, PLATE_Y1);
    cheek.lineTo(0.0905, PLATE_Y1);
    cheek.quadraticCurveTo(0.0950, PLATE_Y1, 0.0950, PLATE_Y1 + 0.0045);
    cheek.lineTo(0.0950, 0.0130);
    cheek.quadraticCurveTo(0.0950, 0.0285, 0.0820, 0.0290);
    cheek.lineTo(0.0680, 0.0290);
    cheek.quadraticCurveTo(0.0640, 0.0290, 0.0640, 0.0250);
    cheek.closePath();
    const cg = new THREE.ExtrudeGeometry(cheek, {
      depth: 0.0012,
      bevelEnabled: true,
      bevelThickness: 0.0005,
      bevelSize: 0.0005,
      bevelOffset: -0.0005,
      bevelSegments: 1,
      curveSegments: curve,
    });
    /* Shape x is "how far forward", so turned a quarter about y the shape's
     * x lands on -z and the extrusion on +x. */
    cg.rotateY(Math.PI / 2);
    for (const sx of [-1, 1]) {
      add('tpu', bake(cg, sx > 0 ? 0.0105 : -0.0117, 0, 0), C.sakura);
      /* The pivot screw, where the camera turns. */
      const screw = new THREE.CylinderGeometry(0.0021, 0.0021, 0.0010, lite ? 6 : 10);
      add('metal', bake(screw, sx * 0.0127, CAMERA_MOUNT_UP, -CAMERA_MOUNT_FORWARD, 0, 0, Math.PI / 2), C.steel);
      screw.dispose();
    }
    cg.dispose();
    const chin = roundRect(new THREE.Shape(), -0.0127, 0.0900, 0.0127, 0.0950, 0.0015);
    add('tpu', slab(chin, PLATE_Y1, 0.0042, 0.0006, curve), C.sakura);
    const bridge = roundRect(new THREE.Shape(), -0.0127, 0.0640, 0.0127, 0.0700, 0.0018);
    add('tpu', slab(bridge, TOP_Y1, 0.0290, 0.0007, curve), C.sakura);
  }

  /*
   * THE ANTENNA MOUNT, printed TPU on the back of the top plate, with the
   * boss the mast is clamped in. The mast leans back the way a pilot sets
   * one, clear of the props' wash.
   */
  const mastDir = new THREE.Vector3(-0.14, 1, 0.40).normalize();
  const mastFoot = new THREE.Vector3(0, 0.0300, 0.0490);
  {
    const block = roundRect(new THREE.Shape(), -0.0060, -0.0560, 0.0060, -0.0420, 0.0020);
    add('tpu', slab(block, TOP_Y1, 0.0290, 0.0008, curve), C.sakura);
    const boss = new THREE.CylinderGeometry(0.0030, 0.0035, 0.0070, lite ? 8 : 12);
    boss.translate(0, 0.0035, 0);
    boss.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), mastDir));
    boss.translate(mastFoot.x, mastFoot.y - 0.0035, mastFoot.z);
    add('tpu', boss, C.sakura);
  }

  /*
   * Merge each finish into one mesh. Ink shells go on the four that carry
   * the silhouette; the vinyl lies flat on other parts and does not need
   * its own line.
   */
  const merged = (name, mat, castShadow) => {
    const geo = mergeGeometries(parts[name], false);
    for (const p of parts[name]) {
      p.dispose();
    }
    if (!geo) {
      throw new Error(`herocraft: ${name} merge failed`);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = castShadow && shade;
    group.add(mesh);
    return mesh;
  };
  ink(merged('body', bodyMat, true), 0.0008);
  ink(merged('metal', metalMat, true), 0.0006);
  ink(merged('tpu', tpuMat, true), 0.0007, C.inkWarm);
  merged('vinyl', vinylMat, false);

  /*
   * THE CAMERA, on the mount the shell tilts by the pilot's camera angle.
   * A 19 mm micro: the body, the barrel and its knurled focus ring, the
   * front bezel, and the glass a quarter of a millimetre short of where
   * lens.js says it is (CAMERA_LENS_FORWARD), so the picture and the model
   * agree about where the pilot is looking from.
   */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, CAMERA_MOUNT_UP, -CAMERA_MOUNT_FORWARD);
  group.add(cameraMount);
  {
    const cam = [];
    const bodyShape = roundRect(new THREE.Shape(), -0.0095, -0.0080, 0.0095, 0.0080, 0.0022);
    cam.push(paint(slab(bodyShape, -0.0095, 0.0095, 0.0012, curve), C.camBody));
    const barrel = new THREE.CylinderGeometry(0.0068, 0.0072, 0.0145, seg);
    cam.push(paint(bake(barrel, 0, 0, -0.01525, Math.PI / 2, 0, 0), C.camBody));
    barrel.dispose();
    const knurl = new THREE.CylinderGeometry(0.0077, 0.0077, 0.0032, lite ? 10 : 16);
    cam.push(paint(bake(knurl, 0, 0, -0.0150, Math.PI / 2, 0, 0), C.camRing, true));
    knurl.dispose();
    const bezel = new THREE.TorusGeometry(0.0062, 0.0011, lite ? 5 : 7, seg);
    cam.push(paint(bake(bezel, 0, 0, -0.0228), C.bezel));
    bezel.dispose();
    const geo = mergeGeometries(cam, false);
    for (const p of cam) {
      p.dispose();
    }
    const housing = new THREE.Mesh(geo, camMat);
    housing.castShadow = shade;
    ink(housing, 0.0005);
    cameraMount.add(housing);
    /* The glass: a shallow dome whose crown is the lens point. */
    const dome = new THREE.SphereGeometry(0.0090, seg, lite ? 3 : 4, 0, Math.PI * 2, 0, 0.70);
    dome.rotateX(-Math.PI / 2);
    dome.translate(0, 0, -0.0242 + 0.0090);
    const glass = new THREE.Mesh(dome, lens);
    cameraMount.add(glass);
  }

  /* NAMED, both of them, because they are wire and not aircraft: the mast
   * is the tallest thing on the model and no contact hull covers it, nor
   * should one. See the same name in src/render/whoopcraft.js and the
   * measurement in scripts/craft-check.js. The receiver's two antenna
   * tubes are wire too, so they ride in the mast's mesh and its name. */
  {
    const up = new THREE.Vector3(0, 1, 0);
    const mastLen = 0.0360;
    const wire = [];
    const mastGeo = new THREE.CylinderGeometry(0.0015, 0.0016, mastLen, lite ? 6 : 8);
    mastGeo.translate(0, mastLen / 2, 0);
    mastGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, mastDir));
    mastGeo.translate(mastFoot.x, mastFoot.y, mastFoot.z);
    wire.push(mastGeo);
    for (const sx of [-1, 1]) {
      const d = new THREE.Vector3(sx * 0.62, 0.38, 0.69).normalize();
      const tube = new THREE.CylinderGeometry(0.0010, 0.0010, 0.0300, lite ? 5 : 6);
      tube.translate(0, 0.0150, 0);
      tube.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d));
      tube.translate(sx * 0.0040, 0.0170, 0.0520);
      wire.push(tube);
    }
    for (const g of wire) {
      g.deleteAttribute('uv');
    }
    const mast = new THREE.Mesh(mergeGeometries(wire, false), antenna);
    for (const g of wire) {
      g.dispose();
    }
    mast.name = 'antenna';
    group.add(mast);
    /* The cap: a stubby circular polarised antenna's housing, mint. */
    const capGeo = new THREE.CylinderGeometry(0.0032, 0.0028, 0.0072, lite ? 8 : 12);
    const top = new THREE.SphereGeometry(0.0032, lite ? 8 : 12, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    top.translate(0, 0.0036, 0);
    capGeo.deleteAttribute('uv');
    top.deleteAttribute('uv');
    const capMerged = mergeGeometries([capGeo.toNonIndexed(), top.toNonIndexed()], false);
    capGeo.dispose();
    top.dispose();
    capMerged.translate(0, 0.0036, 0);
    capMerged.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, mastDir));
    const capAt = mastFoot.clone().addScaledVector(mastDir, mastLen - 0.0010);
    capMerged.translate(capAt.x, capAt.y, capAt.z);
    const tip = new THREE.Mesh(capMerged, antennaTip);
    tip.name = 'antenna';
    group.add(tip);
  }

  /*
   * THE ROTORS AND THE DISCS. Each rotor is one mesh, its own hand of
   * twist, spun by the shell about its own y; the hub sits on the bell's
   * cap and the blades at ROTOR_Y.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  for (let m = 0; m < 4; m += 1) {
    const [mx, mz] = motors[m];
    const front = mz < 0;
    const rotor = new THREE.Group();
    rotor.position.set(mx, ROTOR_Y, mz);
    group.add(rotor);
    const prop = new THREE.Mesh(rotorGeometry(PROP_SPIN[m], front, lite), propMat);
    prop.castShadow = shade;
    rotor.add(prop);
    blades.push(rotor);

    /*
     * The blur disc, a direct child of the craft group, not of the motor.
     * Check 15 walks g.children for CylinderGeometry with radius >= 0.05,
     * and a nested disc is invisible to that walk.
     *
     * Clear at the hub and densest at the rim, from an alpha ramp in its
     * vertex colours, because that is what a spinning prop leaves: the root
     * of a blade sweeps a small circle slowly, the tip a big one fast, and
     * it is the tip band that draws the ring. A flat 0.12 over the whole
     * disc was a tinted coin, which is what made the old props ghostly. The
     * ramp multiplies whatever opacity the caller sets, so the studio's
     * throttle linked opacity and the ghost's own material still work.
     */
    const discGeo = new THREE.CylinderGeometry(CRAFT_PROP_R, CRAFT_PROP_R, 0.0012, lite ? 12 : 24);
    {
      const p = discGeo.getAttribute('position');
      const rgba = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i += 1) {
        const r = Math.hypot(p.getX(i), p.getZ(i)) / CRAFT_PROP_R;
        rgba[i * 4] = 1;
        rgba[i * 4 + 1] = 1;
        rgba[i * 4 + 2] = 1;
        rgba[i * 4 + 3] = r > 0.5 ? 1 : 0;
      }
      discGeo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    }
    const disc = new THREE.Mesh(
      discGeo,
      new THREE.MeshBasicMaterial({
        color: front ? 0xe8a8b8 : 0x5a6558,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        vertexColors: true,
        fog,
      }),
    );
    disc.position.set(mx, ROTOR_Y, mz);
    disc.renderOrder = 1;
    group.add(disc);
    discs.push(disc);

    const { led, ledMat } = ledMeshes[m];
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front, base: front ? 0xe8a8b8 : 0x7dffb4 });
  }

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: PROP_SPIN,
  };
}
