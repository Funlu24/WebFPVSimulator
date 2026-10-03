#!/usr/bin/env node
/*
 * capture-patron-shots.js: Capture screenshots showing patron marks in 3D view.
 *
 * Temporarily injects test patrons into the roster, flies maps, and captures
 * screenshots with patron signs visible.
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROSTER_PATH = path.join(__dirname, '../src/partners/roster.js');
const OUT_DIR = '/opt/cursor/artifacts';

// Test patrons to inject
const TEST_PATRONS = `
export const PATRON_MAP_BRANDS = Object.freeze([
  {
    slug: 'test-text-only',
    name: 'Text Only Patron',
    short: 'TEXT',
    mark: { field: '#3a4a5c' },
  },
  {
    slug: 'test-with-logo',
    name: 'Logo Patron',
    short: 'LOGO',
    mark: { field: '#5c3a4a' },
    logo: { colour: 'gds/colour.png', mono: 'gds/mono.png' },
  },
]);
`.trim();

function injectTestPatrons() {
  const original = fs.readFileSync(ROSTER_PATH, 'utf8');
  const modified = original.replace(
    /export const PATRON_MAP_BRANDS = Object\.freeze\(\[\]\);/,
    TEST_PATRONS
  );
  fs.writeFileSync(ROSTER_PATH, modified, 'utf8');
  return original;
}

function restoreRoster(original) {
  fs.writeFileSync(ROSTER_PATH, original, 'utf8');
}

function captureShots() {
  const steps = [
    // Load the starter map
    'wait:1000',
    'until:window.game && window.game.ready',
    'tap:Enter',
    'wait:500',
    'until:window.game.state === "seat"',
    
    // Switch to Tracks menu
    'tap:Escape',
    'wait:500',
    'tap:Tab',
    'wait:200',
    
    // Load starter built map
    'tap:ArrowDown',
    'wait:200',
    'tap:Enter',
    'wait:1000',
    'until:window.game.state === "seat"',
    
    // Capture starter map with view showing patron signs
    'eval:window.__screenshot_starter = { marks: window.game.view ? window.game.view.marks.filter(m => m.slug.startsWith("test-")) : [] }',
    'shot:patron-starter-3d',
    
    // Return to menu for user-built map
    'tap:Escape',
    'wait:500',
    
    // Load a user-built map (create simple one with script)
    'eval:window.game.loadUserMap({ id: "test-busy", elements: [{ kind: "building", x: 0, z: 20, w: 10, h: 5, d: 10 }, { kind: "building", x: 15, z: 20, w: 8, h: 4, d: 8 }, { kind: "building", x: -15, z: 25, w: 12, h: 6, d: 12 }] })',
    'wait:1000',
    'until:window.game.state === "seat"',
    
    // Capture user map
    'eval:window.__screenshot_user = { marks: window.game.view ? window.game.view.marks.filter(m => m.slug.startsWith("test-")) : [] }',
    'shot:patron-user-3d',
  ];
  
  const cmd = `node scripts/shots.js --out=${OUT_DIR} --w=1920 --h=1080 ${steps.join(' ')}`;
  console.log('Running:', cmd);
  execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

// Main
try {
  console.log('Injecting test patrons...');
  const originalRoster = injectTestPatrons();
  
  try {
    console.log('Capturing screenshots...');
    captureShots();
  } finally {
    console.log('Restoring roster...');
    restoreRoster(originalRoster);
  }
  
  console.log('Done. Screenshots saved to', OUT_DIR);
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
