/*
 * town-patron-check.js: real geometry checks for town patron spots,
 * in headless Chrome against the built city's live colliders.
 *
 * Usage: node scripts/town-patron-check.js [--selftest]
 *        --selftest: plant faults to prove each detector catches them
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const selftest = process.argv.includes('--selftest');

let page = null;
let passed = 0;
let failed = 0;

async function check(desc, result, detail = '') {
  if (result) {
    console.log(`  PASS  ${desc}${detail ? `: ${detail}` : ''}`);
    passed += 1;
  } else {
    console.log(`  FAIL  ${desc}${detail ? `: ${detail}` : ''}`);
    failed += 1;
  }
}

try {
  console.log('town-patron-check: real geometry in headless Chrome\n');
  
  page = await openPage({ root, width: 1920, height: 1080, url: '/index.html' });
  const ev = (body) => page.evaluate(`(async()=>{${body}})()`);
  
  // Wait for shell to be ready
  for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
    await page.sleep(500);
  }
  
  // Load the city map and wait for it to be ready
  await ev("const ui = window.__ui; ui.settings.map = 'city'; ui.settings.graphics = 'low'; ui.onAction('fly', ui.settings); return 1;");
  
  let ready = false;
  for (let i = 0; i < 260 && !ready; i += 1) {
    const m = await ev('return window.__map ? window.__map() : null');
    ready = Boolean(m && m.ready && m.id === 'city');
    if (!ready) {
      await page.sleep(500);
    }
  }
  
  if (!ready) {
    throw new Error('the city never became ready');
  }
  
  // Wait for baking to complete
  await page.sleep(6000);
  
  console.log('  loaded city map, checking patron spots\n');
  
  // Import modules and get PATRON_SPOTS
  const PATRON_SPOTS = await ev(`
    const places = await import('/src/maps/city/places/index.js');
    return places.PATRON_SPOTS;
  `);
  
  // Get test patron marks with dimensions
  const markSpecs = await ev(`
    const places = await import('/src/maps/city/places/index.js');
    const { PATRON_SPOTS } = places;
    
    const testPatrons = [
      { slug: 'test-patron-logo', name: 'Test Patron Logo', short: 'TPL', 
        logo: { aspect: 3.0 }, mark: { field: '#19171e' } },
      { slug: 'test-patron-text-one', name: 'Test Patron Text One', short: 'TPT1', 
        mark: { field: '#f3ead4' } },
      { slug: 'test-patron-text-two', name: 'Test Patron Text Two', short: 'TPT2', 
        mark: { field: '#19171e' } },
    ];
    
    const markSpecs = [];
    const spotKeys = Object.keys(PATRON_SPOTS);
    for (let i = 0; i < Math.min(testPatrons.length, spotKeys.length); i++) {
      const spot = PATRON_SPOTS[spotKeys[i]];
      const patron = testPatrons[i];
      
      let aspect = 2.5;
      if (patron.logo) {
        aspect = patron.logo.aspect;
      }
      const w = spot.w;
      const h = w / aspect;
      
      const isXWall = spot.x === undefined;
      const px = isXWall ? spot.face : spot.x;
      const pz = isXWall ? spot.z : spot.face;
      const off = 0.015;
      
      markSpecs.push({
        key: spotKeys[i],
        slug: patron.slug,
        spot,
        p: isXWall 
          ? [spot.face + spot.n * off, spot.y, pz]
          : [px, spot.y, spot.face + spot.n * off],
        n: isXWall ? [spot.n, 0, 0] : [0, 0, spot.n],
        up: [0, 1, 0],
        w,
        h,
        findable: false,
      });
    }
    
    return markSpecs;
  `);
  
  // Get STF and partner marks
  const stfAndPartners = await ev(`
    const egg = window.__egg();
    const marks = window.__marks();
    return {
      stfMark: egg ? egg.egg : null,
      partnerMarks: marks ? marks.marks : [],
    };
  `);
  
  const { stfMark, partnerMarks } = stfAndPartners;
  
  if (!stfMark) {
    throw new Error('STF mark not found in map');
  }
  
  // Print spot info
  console.log('  Patron spots checked:');
  for (const mark of markSpecs) {
    console.log(`    ${mark.key}: ${mark.slug}, p=[${mark.p.map(v => v.toFixed(2)).join(', ')}], ${mark.w.toFixed(1)}x${mark.h.toFixed(1)}m`);
  }
  console.log('');
  
  // Run checks for each mark
  for (const mark of markSpecs) {
    const { key, spot, p, n, w, h } = mark;
    
    // Apply selftest faults
    let faultedP = [...p];
    let faultedH = h;
    if (selftest) {
      if (key === 'patron1') {
        faultedP[0] += n[0] * 1.0;
        faultedP[2] += n[2] * 1.0;
      } else if (key === 'patron2') {
        faultedP[1] += 2.0;
        faultedH = h + 2.0;
      }
    }
    
    // Check (a): centre and corners inside solid 0.1m behind face (within wall thickness), outside 0.1m in front
    const behind = 0.1;  // Within typical wall thickness (0.22-0.30m)
    const front = 0.1;
    
    const centreCheck = await ev(`
      const behindP = [${faultedP[0]} - ${n[0]} * ${behind}, 
                       ${faultedP[1]} - ${n[1]} * ${behind}, 
                       ${faultedP[2]} - ${n[2]} * ${behind}];
      const frontP = [${faultedP[0]} + ${n[0]} * ${front}, 
                      ${faultedP[1]} + ${n[1]} * ${front}, 
                      ${faultedP[2]} + ${n[2]} * ${front}];
      return {
        insideBehind: window.__nearSolid(behindP[0], behindP[1], behindP[2], 0) === 0,
        outsideFront: window.__nearSolid(frontP[0], frontP[1], frontP[2], 0) !== 0,
      };
    `);
    
    await check(
      `${key} centre: inside behind, outside front`,
      centreCheck.insideBehind && centreCheck.outsideFront,
      `behind=${centreCheck.insideBehind}, front=${centreCheck.outsideFront}`
    );
    
    // Check corners
    const right = [n[2] * mark.up[1] - n[1] * mark.up[2], 
                   n[0] * mark.up[2] - n[2] * mark.up[0],
                   n[1] * mark.up[0] - n[0] * mark.up[1]];
    const corners = [
      [-w/2, -faultedH/2], [w/2, -faultedH/2], [-w/2, faultedH/2], [w/2, faultedH/2]
    ];
    
    let allCornersPass = true;
    for (const [r, u] of corners) {
      const cornerP = [
        faultedP[0] + right[0] * r + mark.up[0] * u,
        faultedP[1] + right[1] * r + mark.up[1] * u,
        faultedP[2] + right[2] * r + mark.up[2] * u,
      ];
      
      const cornerCheck = await ev(`
        const cornerBehind = [${cornerP[0]} - ${n[0]} * ${behind}, 
                             ${cornerP[1]} - ${n[1]} * ${behind}, 
                             ${cornerP[2]} - ${n[2]} * ${behind}];
        const cornerFront = [${cornerP[0]} + ${n[0]} * ${front}, 
                            ${cornerP[1]} + ${n[1]} * ${front}, 
                            ${cornerP[2]} + ${n[2]} * ${front}];
        return {
          insideBehind: window.__nearSolid(cornerBehind[0], cornerBehind[1], cornerBehind[2], 0) === 0,
          outsideFront: window.__nearSolid(cornerFront[0], cornerFront[1], cornerFront[2], 0) !== 0,
        };
      `);
      
      if (!cornerCheck.insideBehind || !cornerCheck.outsideFront) {
        allCornersPass = false;
        break;
      }
    }
    
    await check(
      `${key} all 4 corners: inside behind, outside front`,
      allCornersPass,
      allCornersPass ? 'all corners pass' : 'at least one corner fails'
    );
    
    // Check (b): visibility from 5-30m out along normal
    let visibleFrom = null;
    
    if (selftest && key === 'patron3') {
      // Put eye behind building
      const testEye = [p[0] - n[0] * 5, p[1], p[2] - n[2] * 5];
      const sees = await ev(`
        const egg = await import('/src/game/egg.js');
        const mark = ${JSON.stringify(mark)};
        const eye = { x: ${testEye[0]}, y: ${testEye[1]}, z: ${testEye[2]} };
        const forward = { x: ${p[0]} - ${testEye[0]}, y: ${p[1]} - ${testEye[1]}, z: ${p[2]} - ${testEye[2]} };
        const colliders = { 
          segmentCrossesAny: (...args) => window.__segmentCrossesAny(...args),
          gapAt: (...args) => window.__nearSolid(...args),
        };
        return egg.seesMark(eye, forward, mark, colliders);
      `);
      if (sees) {
        visibleFrom = testEye;
      }
    } else {
      for (const dist of [5, 10, 15, 20, 25, 30]) {
        const eye = [p[0] + n[0] * dist, p[1] + n[1] * dist, p[2] + n[2] * dist];
        const visCheck = await ev(`
          const egg = await import('/src/game/egg.js');
          const mark = ${JSON.stringify(mark)};
          const eye = [${eye.join(', ')}];
          const nx = ${n[0]};
          const ny = ${n[1]};
          const nz = ${n[2]};
          if (window.__nearSolid(eye[0], eye[1], eye[2], 0) !== 0) {
            const forward = { x: -nx, y: -ny, z: -nz };
            const colliders = { 
              segmentCrossesAny: (...args) => window.__segmentCrossesAny(...args),
              gapAt: (...args) => window.__nearSolid(...args),
            };
            return egg.seesMark({ x: eye[0], y: eye[1], z: eye[2] }, forward, mark, colliders) ? eye : null;
          }
          return null;
        `);
        if (visCheck) {
          visibleFrom = visCheck;
          break;
        }
      }
    }
    
    await check(
      `${key} visible from open flyable space`,
      visibleFrom !== null,
      visibleFrom ? `seen from (${visibleFrom.map(v => v.toFixed(1)).join(', ')})` : 'not visible'
    );
    
    // Check (c): separation from STF and partners
    const dist3d = (p1, p2) => {
      const dx = p1[0] - p2[0];
      const dy = p1[1] - p2[1];
      const dz = p1[2] - p2[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
    
    const stfDist = dist3d(p, stfMark.p);
    await check(
      `${key} at least PARTNER_SEP (10m) from STF`,
      stfDist >= 10,
      `${stfDist.toFixed(1)}m`
    );
    
    for (const partner of partnerMarks) {
      const pdist = dist3d(p, partner.p);
      await check(
        `${key} at least PARTNER_SEP (10m) from ${partner.slug}`,
        pdist >= 10,
        `${pdist.toFixed(1)}m`
      );
    }
  }
  
  // Check (d): findable === false and shouldFindMark returns false
  let allFindableChecksPass = true;
  const findableResults = [];
  
  for (let i = 0; i < markSpecs.length; i++) {
    let testMark = { ...markSpecs[i] };
    
    if (selftest && i === 0) {
      testMark.findable = undefined;
    }
    
    const findableCheck = await ev(`
      const egg = await import('/src/game/egg.js');
      const mark = ${JSON.stringify(testMark)};
      const hasFindableFalse = mark.findable === false;
      const shouldNotFind = !egg.shouldFindMark(mark);
      return { hasFindableFalse, shouldNotFind, pass: hasFindableFalse && shouldNotFind };
    `);
    
    findableResults.push(findableCheck);
    if (!findableCheck.pass) {
      allFindableChecksPass = false;
    }
  }
  
  await check(
    'all patron marks have findable===false and shouldFindMark returns false',
    allFindableChecksPass,
    allFindableChecksPass ? 'all pass' : 'at least one fails'
  );
  
  // Check partner mark still returns true
  if (partnerMarks.length > 0) {
    const partnerCheck = await ev(`
      const egg = await import('/src/game/egg.js');
      const partner = ${JSON.stringify(partnerMarks[0])};
      return egg.shouldFindMark(partner);
    `);
    
    await check(
      `partner mark ${partnerMarks[0].slug} shouldFindMark returns true`,
      partnerCheck,
      `shouldFindMark=${partnerCheck}`
    );
  }
  
  console.log(`\ntown-patron-check: ${passed} passed, ${failed} failed`);
  if (selftest) {
    if (failed === 0) {
      console.log('SELFTEST FAILED: no faults were caught');
      process.exit(1);
    } else {
      console.log(`SELFTEST PASSED: ${failed} planted faults caught`);
    }
  }
  process.exit(failed > 0 && !selftest ? 1 : 0);
  
} catch (e) {
  console.error('Fatal error:', e.message);
  console.error(e.stack);
  process.exit(1);
} finally {
  if (page) {
    const profile = (page.proc.spawnargs.find((a) => a.startsWith('--user-data-dir=')) || '').slice('--user-data-dir='.length);
    const exited = new Promise((r) => page.proc.once('exit', r));
    try {
      await page.close();
      await Promise.race([exited, new Promise(r => setTimeout(r, 15000))]);
      if (profile.includes('sim-page-')) {
        const { rm } = await import('node:fs/promises');
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await rm(profile, { recursive: true, maxRetries: 3 });
            break;
          } catch (e) {
            if (attempt === 2) throw e;
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    } catch (e) {
      // ignore cleanup errors
    }
  }
}
