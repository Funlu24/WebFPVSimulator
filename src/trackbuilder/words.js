/*
 * words.js: what the builder calls things, canvas by canvas.
 *
 * WHY ONE FILE. The builder has three canvases, a five inch track, a whoop
 * track and a freestyle map, and the same sentence has to come out right on
 * each: "click the field" is a room's floor and a map's plot, a sponsor's
 * logo is painted on grass on a field and on a floor in a room, and the way
 * back to the simulator names the aircraft and the world the canvas is for.
 * Those words drifted while each was written where it was first needed: the
 * inspector said Field on every canvas, the Sponsor logos dialog said grass on
 * a map's concrete, and Back to the simulator named nothing and landed on the
 * gate (MENUS-PLAN.md 1.24, 1.25 and 4.1). Here each is said once.
 *
 * PURE: no DOM, no storage, nothing of the simulator's. The self test reads
 * it in Node, and app.js and ui.js say what it says.
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

import { docModeOf, trackClassOf } from './elements.js';

/*
 * THE THREE CANVASES, in the order the switch shows them.
 *
 *   label   the switch's word for it, which is the simulator gate's own word
 *           for the same choice, so a pilot who pressed Five inch racing on
 *           the gate knows the button on sight.
 *   makes   what the button's title says it makes.
 *   kind    what a row in Load says the document is.
 *   noun    track or map, in a sentence.
 *   area    the inspector's heading for the ground everything stands on, and
 *   place   the word for it in "click the ...".
 *   ground  what a painted logo lies on. A map's depends on its scene: see
 *           wordsFor.
 *   craft   the simulator's id for the aircraft that flies it, and
 *   flies   that aircraft in a sentence.
 *   map     the simulator's world that flies what is on this canvas.
 */
export const CANVAS_WORDS = {
  full: {
    label: 'Five inch',
    makes: 'A five inch race track: MultiGP gates on a sixty metre field',
    kind: 'Five inch track',
    noun: 'track',
    area: 'Field',
    place: 'field',
    ground: 'grass',
    craft: '5inch',
    flies: 'the five inch',
    map: 'custom',
  },
  micro: {
    label: 'Whoop',
    makes: 'A whoop track: RaceGOW gates in a ten by twelve metre hall',
    kind: 'Whoop track',
    noun: 'track',
    area: 'Room',
    place: 'floor',
    ground: 'floor',
    craft: 'whoop65',
    flies: 'the whoop',
    map: 'custom',
  },
  freestyle: {
    label: 'Freestyle',
    makes: 'A freestyle map: buildings, cranes, a skate set and named gaps on a 160 metre plot, flown on the five inch',
    kind: 'Map',
    noun: 'map',
    area: 'Plot',
    place: 'plot',
    ground: 'ground',
    craft: '5inch',
    flies: 'the five inch',
    map: 'built',
  },
};

export const CANVAS_ORDER = ['full', 'micro', 'freestyle'];

/* Which canvas a document is on: a map, else its track class. */
export function canvasOf(doc) {
  if (docModeOf(doc) === 'freestyle') {
    return 'freestyle';
  }
  return trackClassOf(doc) === 'micro' ? 'micro' : 'full';
}

/*
 * The words for a document's canvas. A map's ground is the scene's: a lawn
 * is grass and the other three (concrete, tarmac and dirt) are the ground,
 * because "paint it on the grass" on a car park is a sentence that makes an
 * author look for grass that is not there.
 */
export function wordsFor(doc) {
  const canvas = canvasOf(doc);
  const words = CANVAS_WORDS[canvas];
  if (canvas === 'freestyle' && doc && doc.scene && doc.scene.ground === 'grass') {
    return { ...words, ground: 'grass' };
  }
  return words;
}

/*
 * THE WAY TO THE SIMULATOR, for a document: the world that flies it and the
 * aircraft its canvas is for, so the simulator's gate is answered and it opens
 * on its title with this canvas's work seated (linkedMode and linkedCraft in
 * src/ui/ui.js read exactly these two). `fly` adds fly=1, which takes the
 * title's Fly press too; Back to the simulator leaves it off, because going
 * back is not asking to be put in the air. One address for both buttons, so
 * the two cannot disagree about which aircraft a canvas is for.
 */
export function simulatorLink(doc, { fly = false } = {}) {
  const w = wordsFor(doc);
  return `../../index.html?map=${w.map}&craft=${w.craft}${fly ? '&fly=1' : ''}`;
}

/*
 * WHETHER A NAME IS STILL THE ONE A NEW DOCUMENT IS GIVEN. Publish asks for a
 * real one first (MENUS-PLAN.md 4.3): the board's lists are read by name, and
 * a row of "Untitled track" says nothing about any of them. Case, spacing and
 * an empty name all count as not named.
 */
const PLACEHOLDER = /^untitled (track|map)$/;

export function isPlaceholderName(name) {
  const plain = String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return plain === '' || PLACEHOLDER.test(plain);
}

/*
 * WHEN SOMETHING CHANGED, the way a person says it: "just now", "5 minutes
 * ago", "yesterday", "2 days ago". Load showed a raw ISO stamp, which is a
 * time in a time zone nobody lives in, written for a machine. The exact date
 * goes in the row's title (exactDate), for whoever needs it.
 *
 * English on purpose, like every other word on the page: a row that said
 * "hace 2 dias" under an English heading would be the odd one out.
 */
const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function changedAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    return '';
  }
  const seconds = Math.round((now - t) / 1000);
  if (seconds < 45) {
    return 'just now';
  }
  for (const [unit, size] of UNITS) {
    const n = Math.floor(seconds / size);
    if (n >= 1) {
      if (unit === 'day' && n === 1) {
        return 'yesterday';
      }
      return n === 1 ? `a${unit === 'hour' ? 'n' : ''} ${unit} ago` : `${n} ${unit}s ago`;
    }
  }
  return 'a minute ago';
}

/* The same moment in full, for a title: "1 October 2026, 07:15". */
export function exactDate(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    return '';
  }
  try {
    return new Date(t).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  } catch (e) {
    return new Date(t).toISOString();
  }
}

/*
 * AN ERROR'S OWN WORDS, AS A SENTENCE IN A LINE OF OURS, or nothing. A
 * browser's words for a request that never arrived ("Failed to fetch", "Load
 * failed", "NetworkError when attempting to fetch resource.") say nothing the
 * line round them does not, and with no full stop of their own they ran on
 * into the next sentence: "Failed to fetch Your own tracks are in Load".
 */
export function errorSentence(e) {
  const text = String((e && e.message) || e || '').trim();
  if (!text || /^(failed to fetch|load failed|networkerror\b|typeerror: failed to fetch)/i.test(text)) {
    return '';
  }
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/*
 * WHICH SAVED DOCUMENTS A CANVAS'S LOAD LISTS. listTracks in ./storage.js
 * already keeps maps and tracks apart; this keeps the five inch's and the
 * whoop's apart too, because a whoop track opened from the five inch canvas
 * moves the author to the whoop canvas and seats the whoop under them, which
 * is a canvas switch nobody asked for (MENUS-PLAN.md 1.21). The shipped rows
 * are already the canvas's own. `others` is how many of the pilot's own
 * documents are on the other race canvas, so Load can say where they went.
 */
export function rowsForCanvas(list, canvas) {
  const rows = [];
  let others = 0;
  for (const t of list || []) {
    if (canvas === 'freestyle' || t.preset || (t.trackClass === 'micro' ? 'micro' : 'full') === canvas) {
      rows.push(t);
    } else {
      others += 1;
    }
  }
  return { rows, others };
}
