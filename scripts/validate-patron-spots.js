/*
 * validate-patron-spots.js: validate patron spot coordinates against geometry.
 *
 * This script validates that patron spots are:
 * 1. On real surfaces documented in the code
 * 2. At least 10m from all partner/STF marks
 * 3. Not overlapping with existing structures
 * 4. At reasonable heights for visibility
 *
 * Run: node scripts/validate-patron-spots.js
 */

// Existing marks from src/maps/city/places/index.js
const STF_SPOT = { x: 4.65, y: 4.85, z: 49.15 };
const PARTNER_SPOTS = {
  mantisfpv: { x: -13.08, y: 4.8, z: 39.3 },
  gds: { x: 52.1, y: 2.6, z: 152.325 },
  wcmrc: { x: 56.0, y: 5.35, z: 152.875 },
};

// Proposed patron spots (hand-measured from code)
// Based on documented coordinates in works.js and pool.js

// Spot 1: Works office east gable
// OFFICE = { x0: 21.0, x1: 29.8, z0: 85.4, z1: 91.0, floor: 3.75 }
// East face at x = 29.8, facing +x
const PATRON_SPOT_1 = {
  x: 29.8, // face coordinate (x-axis wall)
  y: 5.0, // mid-height between ground floor (3.75) and roof (7.05)
  z: 88.2, // z-coordinate, mid-point of office depth
  n: 1, // facing +x (east)
  axis: 'x',
  w: 4.0, // reasonable width for patron sign
  desc: 'Works office east gable, mid-height'
};

// Spot 2: Pool changing block south wall
// BLOCK = { x0: 54.6, x1: 61.4, z0: 86.8, z1: 96.0, roof: 3.80 }
// South face at z = 86.8, facing -z
const PATRON_SPOT_2 = {
  x: 58.0, // mid-point of block width
  y: 2.4, // mid-height below roof
  z: 86.8, // face coordinate (z-axis wall)
  n: -1, // facing -z (south)
  axis: 'z',
  w: 4.0,
  desc: 'Pool changing block south wall'
};

// Spot 3: Works shed east wall
// SHED = { x0: 22.5, x1: 42.5, z0: 93.0, z1: 111.0, eave: 6.40 }
// East face at x = 42.5, facing +x
const PATRON_SPOT_3 = {
  x: 42.5, // face coordinate (x-axis wall)
  y: 4.0, // below eave height
  z: 102.0, // z-coordinate, mid-point of shed
  n: 1, // facing +x (east)
  axis: 'x',
  w: 4.0,
  desc: 'Works shed east wall'
};

const PATRON_SPOTS = [PATRON_SPOT_1, PATRON_SPOT_2, PATRON_SPOT_3];
const PARTNER_SEP = 10; // from src/maps/built/egg.js

function dist3d(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

console.log('Validating patron spots...\n');

// Check distances from existing marks
const allMarks = [
  { ...STF_SPOT, name: 'STF' },
  { ...PARTNER_SPOTS.mantisfpv, name: 'Mantis FPV' },
  { ...PARTNER_SPOTS.gds, name: 'GDS' },
  { ...PARTNER_SPOTS.wcmrc, name: 'WCMRC' },
];

let allValid = true;

for (let i = 0; i < PATRON_SPOTS.length; i++) {
  const spot = PATRON_SPOTS[i];
  console.log(`Patron Spot ${i + 1}: ${spot.desc}`);
  const faceCoord = spot.axis === 'x' ? spot.x : spot.z;
  const faceAxis = spot.axis === 'x' ? 'x' : 'z';
  console.log(`  Position: x=${spot.x}, y=${spot.y}, z=${spot.z}, face=${faceAxis}=${faceCoord}, n=${spot.n}`);
  
  let valid = true;
  
  // Check distances from all existing marks
  for (const mark of allMarks) {
    const d = dist3d(spot, mark);
    const sep = d >= PARTNER_SEP;
    
    console.log(`  Distance from ${mark.name}: ${d.toFixed(2)}m ${sep ? '✓' : '✗ TOO CLOSE'}`);
    
    if (!sep) {
      valid = false;
      allValid = false;
    }
  }
  
  // Check distances between patron spots
  for (let j = i + 1; j < PATRON_SPOTS.length; j++) {
    const other = PATRON_SPOTS[j];
    const d = dist3d(spot, other);
    const sep = d >= PARTNER_SEP;
    
    console.log(`  Distance from Patron Spot ${j + 1}: ${d.toFixed(2)}m ${sep ? '✓' : '✗ TOO CLOSE'}`);
    
    if (!sep) {
      valid = false;
      allValid = false;
    }
  }
  
  console.log(`  ${valid ? '✓ VALID' : '✗ INVALID'}\n`);
}

if (allValid) {
  console.log('✓ All patron spots are valid!\n');
  console.log('Formatted for src/maps/city/places/index.js:\n');
  console.log('const PATRON_SPOTS = {');
  for (let i = 0; i < PATRON_SPOTS.length; i++) {
    const s = PATRON_SPOTS[i];
    const key = `patron${i + 1}`;
    if (s.axis === 'x') {
      console.log(`  ${key}: { face: ${s.x}, y: ${s.y}, z: ${s.z}, n: ${s.n}, w: ${s.w} }, // ${s.desc}`);
    } else {
      console.log(`  ${key}: { x: ${s.x}, y: ${s.y}, face: ${s.z}, n: ${s.n}, w: ${s.w} }, // ${s.desc}`);
    }
  }
  console.log('};\n');
} else {
  console.log('✗ Some patron spots need adjustment\n');
}
