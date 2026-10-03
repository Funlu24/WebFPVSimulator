/*
 * patrons.js: which of the patrons a map shows.
 *
 * The patrons are the supporters' tier of the roster (PATRON_MAP_BRANDS in
 * ./roster.js), painted into a freestyle map the way a partner is and never
 * found: no stamp, no achievement, no found panel. A map shows at most
 * PATRON_MAX_PER_MAP of them, and this is the rule for which.
 *
 * WHY IT IS ITS OWN FILE. The built maps need it and so does the town, and
 * neither may import the other: scripts/memory-check.js fails a world that
 * drags another's modules onto the wire when it is chosen. The rule began in
 * src/maps/built/egg.js, and the town reached for it there, which put a built
 * map module on the wire every time the town was chosen. Here it is under
 * neither map. It is also nothing to do with where a sign goes: that is
 * choosePatronSpots in src/maps/built/egg.js for a built map and PATRON_SPOTS
 * in src/maps/city/places/index.js for the town.
 *
 * Pure: no imports, no Three.js, no DOM, no clock and no random stream, so the
 * same map shows the same patrons on every load, in every engine.
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

/* The most a map shows. */
export const PATRON_MAX_PER_MAP = 3;

/* Seeded random pick: mulberry32, the same PRNG the sign weathering uses. */
function seededPick(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Hash a string to a 32-bit seed, the same hash seedOf uses for the
 * weathering. */
function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

/*
 * Choose up to PATRON_MAX_PER_MAP patrons from a list. With that many or
 * fewer, every patron appears on every map. With more, a seeded pick chooses
 * PATRON_MAX_PER_MAP, seeded from the map's key, so the same map always shows
 * the same ones and different maps show different ones. Returns the chosen
 * patrons in the roster's own order.
 */
export function choosePatrons(patrons, mapKey) {
  if (!patrons || patrons.length === 0) {
    return [];
  }
  if (patrons.length <= PATRON_MAX_PER_MAP) {
    return patrons;
  }
  const rng = seededPick(hashString(mapKey));
  const indices = Array.from({ length: patrons.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = indices[i];
    indices[i] = indices[j];
    indices[j] = t;
  }
  return indices.slice(0, PATRON_MAX_PER_MAP)
    .sort((a, b) => a - b)
    .map((i) => patrons[i]);
}
