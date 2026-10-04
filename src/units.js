/*
 * units.js: the foot, the inch, the one piece of pipe a gate is made of, and how
 * much bigger than published the field builds one.
 *
 * Four numbers with no imports. It exists because the game and the track
 * builder both need them and NEITHER may import the other: trackdoc.js
 * states that dependency as one way, the builder writes documents and the
 * game reads them, and a builder that imported src/game would close that
 * loop. So the constants were simply typed out twice, identically, in
 * src/game/track.js and src/trackbuilder/elements.js, which is fine right up
 * until somebody sources a real figure for the tube and changes one of them.
 * A leaf module both sides can import is the only way to have one number.
 *
 * The same reasoning gave src/maps/build-cost.js its own file.
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

/* 1 international foot is 0.3048 m exactly, so every metre figure derived
 * from these is computed rather than rounded. */
export const FT = 0.3048;
export const IN = FT / 12;

/*
 * Frame tube outside diameter.
 *
 * Not published on the MultiGP obstacles page. Their gates are built from
 * schedule 40 PVC, and 1 inch nominal schedule 40 PVC has an outside
 * diameter of 1.315 in, which is the figure used here. It is an ASSUMPTION,
 * not a citation. It changes how a gate looks and changes nothing about the
 * opening, which is the dimension that matters.
 */
export const FRAME_TUBE_OD = 1.315 * IN;

/*
 * The pipe a LETTER is made of: 2 inch nominal schedule 40 PVC, outside diameter 2.375 in (60.3 mm).
 *
 * A gate's 1 inch pipe is a thin line on a four metre letter: drawn at that size a W is four hairlines
 * and reads as a drawing of one, and a real letter that tall built of 1 inch pipe would not stand up. 2 inch
 * is what a person would build one of, and what a pilot can see from across the field. Like the gate's, it is an
 * ASSUMPTION and not a citation: nothing publishes a letter, and the figure only sets how thick the pipe is
 * drawn and how far each hole is held in from it. It changes no opening's size, because a letter's opening is
 * measured axis to axis.
 */
export const LETTER_TUBE_OD = 2.375 * IN;

/*
 * How much larger than published every obstacle is BUILT on the sixty metre
 * field, as a pure number. The argument for it, and what it does not touch, is
 * written once, in src/game/track.js, where the number was born; it lives here
 * because the builder needs it too and may not import the game. A row of gates
 * that share an upright has to be laid at this times one opening plus one tube
 * if the uprights are to meet where the world builds them (positions are never
 * scaled, sizes always are), and the builder knows that only if it can read the
 * number. src/game/track.js re-exports it, so every reader it ever had still
 * finds it there.
 */
export const GATE_SCALE = 1.15;
