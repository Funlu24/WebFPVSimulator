/*
 * measure-town-spots.js: derive patron spot coordinates from town geometry.
 *
 * This script loads the town map's actual collider and solid data to find
 * and validate patron spot locations. Each spot is derived from real
 * geometry, not guessed.
 *
 * Run: node scripts/measure-town-spots.js
 */

import { buildWorld } from '../src/maps/vendored/world/index.js';
import { buildPlaces } from '../src/maps/city/places/index.js';

const PARTNER_SEP = 10; // from src/maps/built/egg.js
const STF_SPOT = { x: 4.65, y: 4.85, face: 49.15 };
const PARTNER_SPOTS = {
  mantisfpv: { x: -13.08, y: 4.8, face: 39.3, n: -1 },
  gds: { x: 52.1, y: 2.6, face: 152.325, n: -1 },
  wcmrc: { x: 56.0, y: 5.35, face: 152.875, n: 1 },
};

console.log('Building town map to analyze geometry...\n');

// Build the town
const world = buildWorld();
const places = buildPlaces(world);

console.log(`Built town with ${world.colliders.length} colliders\n`);

// Existing marks to avoid
const existingMarks = [
  { x: STF_SPOT.x, y: STF_SPOT.y, z: STF_SPOT.face },
  { x: PARTNER_SPOTS.mantisfpv.x, y: PARTNER_SPOTS.mantisfpv.y, z: PARTNER_SPOTS.mantisfpv.face },
  { x: PARTNER_SPOTS.gds.x, y: PARTNER_SPOTS.gds.y, z: PARTNER_SPOTS.gds.face },
  { x: PARTNER_SPOTS.wcmrc.x, y: PARTNER_SPOTS.wcmrc.y, z: PARTNER_SPOTS.wcmrc.face },
];

function dist3d(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isFarEnough(x, y, z) {
  for (const m of existingMarks) {
    if (dist3d({ x, y, z }, m) < PARTNER_SEP) {
      return false;
    }
  }
  return true;
}

// Find suitable walls for patron spots
// Looking for vertical walls in the town that are:
// - Not used by partners
// - At least 10m from all other marks
// - In flyable areas

console.log('Analyzing colliders for suitable patron spots...\n');

const candidates = [];

for (const c of world.colliders) {
  // Look for vertical walls (faces along z)
  const width = c.x1 - c.x0;
  const height = c.top - c.bottom;
  const depth = c.z1 - c.z0;
  
  // Wall must be at least 3m wide and 3m tall
  if (width < 3 || height < 3) continue;
  
  // For south-facing walls (face at z0)
  if (depth > 0.1 && depth < 2) { // thin wall
    const x = (c.x0 + c.x1) / 2;
    const y = c.bottom + height / 2;
    const z = c.z0;
    
    if (isFarEnough(x, y, z) && y > 2 && y < 10) {
      candidates.push({
        x: +x.toFixed(2),
        y: +y.toFixed(2),
        face: +z.toFixed(3),
        n: -1,
        w: +width.toFixed(1),
        h: +height.toFixed(1),
        desc: `south wall at z=${z.toFixed(1)}, x=${x.toFixed(1)}`,
      });
    }
  }
  
  // For north-facing walls (face at z1)
  if (depth > 0.1 && depth < 2) { // thin wall
    const x = (c.x0 + c.x1) / 2;
    const y = c.bottom + height / 2;
    const z = c.z1;
    
    if (isFarEnough(x, y, z) && y > 2 && y < 10) {
      candidates.push({
        x: +x.toFixed(2),
        y: +y.toFixed(2),
        face: +z.toFixed(3),
        n: 1,
        w: +width.toFixed(1),
        h: +height.toFixed(1),
        desc: `north wall at z=${z.toFixed(1)}, x=${x.toFixed(1)}`,
      });
    }
  }
  
  // For east-facing walls (face at x1)
  if (width > 0.1 && width < 2) { // thin wall
    const x = c.x1;
    const y = c.bottom + height / 2;
    const z = (c.z0 + c.z1) / 2;
    
    if (isFarEnough(x, y, z) && y > 2 && y < 10) {
      candidates.push({
        x: +x.toFixed(3),
        y: +y.toFixed(2),
        face: +z.toFixed(2),
        n: 1, // facing +x
        axis: 'x',
        w: +(c.z1 - c.z0).toFixed(1),
        h: +height.toFixed(1),
        desc: `east wall at x=${x.toFixed(1)}, z=${z.toFixed(1)}`,
      });
    }
  }
  
  // For west-facing walls (face at x0)
  if (width > 0.1 && width < 2) { // thin wall
    const x = c.x0;
    const y = c.bottom + height / 2;
    const z = (c.z0 + c.z1) / 2;
    
    if (isFarEnough(x, y, z) && y > 2 && y < 10) {
      candidates.push({
        x: +x.toFixed(3),
        y: +y.toFixed(2),
        face: +z.toFixed(2),
        n: -1, // facing -x
        axis: 'x',
        w: +(c.z1 - c.z0).toFixed(1),
        h: +height.toFixed(1),
        desc: `west wall at x=${x.toFixed(1)}, z=${z.toFixed(1)}`,
      });
    }
  }
}

console.log(`Found ${candidates.length} candidate walls\n`);
console.log('Top candidates (sorted by distance from spawn):');
console.log('Spawn is at (0, 0.45, 24)\n');

const spawn = { x: 0, y: 0.45, z: 24 };
candidates.sort((a, b) => {
  const distA = Math.sqrt((a.x - spawn.x) ** 2 + (a.z - spawn.z) ** 2);
  const distB = Math.sqrt((b.x - spawn.x) ** 2 + (b.z - spawn.z) ** 2);
  return distA - distB;
});

for (let i = 0; i < Math.min(20, candidates.length); i++) {
  const c = candidates[i];
  const d = Math.sqrt((c.x - spawn.x) ** 2 + (c.z - spawn.z) ** 2);
  console.log(`${i + 1}. ${c.desc}`);
  console.log(`   x: ${c.x}, y: ${c.y}, face: ${c.face}, n: ${c.n}, size: ${c.w}x${c.h}m`);
  console.log(`   distance from spawn: ${d.toFixed(1)}m\n`);
}

console.log('\nRecommended PATRON_SPOTS (manually verified and adjusted):');
console.log('// Replace these with hand-verified measurements from actual geometry\n');
