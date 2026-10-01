/*
 * app.js: the track builder itself. State, keyboard, top bar, and the wiring
 * between the two views and the panels.
 *
 * This module is the ONLY thing in the track builder that holds mutable
 * state, and everything that changes the document goes through edit(), which
 * takes the undo snapshot, runs the mutation, re-derives the faces, clamps
 * the sequence, rebuilds the line if one is showing, refreshes the panels and
 * schedules an autosave. One door in, so no edit can arrive without an undo
 * step or leave a stale racing line behind it.
 *
 * ISOLATION. Nothing here imports from the simulator: not the physics, not
 * the flight controller, not the renderer, not the input path, not the game
 * state. The only thing this tool shares with the game is the track document
 * described in schema.md, and the game does not read it yet.
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

import { ELEMENTS, KIND, elementByKey, labelOf, toolByKey, trackClassOf, docModeOf } from './elements.js';
import {
  createTrack, createElement, deepClone, deserialize, duplicateTrack,
  elementById, kindOf, normalize, startPadsOf, touch,
  aperturesOf, toPlain, logosOf, brandingBytes, newLogoId, dressOrder, setSideBuilt,
  LOGO_SLOTS, BRANDING_MAX_CHARS, expandGroups,
} from './model.js';
import { applyAutoFaces, clearOverride, flipFace, setYaw } from './faces.js';
import {
  addToSequence, addNextLevel, bendLineAt, clampSequenceToApertures, moveInSequence,
  neighboursOf, pinFacesAt, removeElement, removeFromSequence, setApertureIndex,
} from './sequence.js';
import { applyFigure, upgradeStackedFigures } from './figures.js';
import { apertureAt, flyAgain, focusFor, removeLastPass, MAX_PASSES } from './passes.js';
import {
  QUARTER, copyElements, magnetFor, moveToPlace, nearestQuarter, placeCube, placementFor, placeOnTrack, placeRow as layRow,
  replaceWith, rowPlan, turnGroups, turnStepFor,
} from './snap.js';
import { buildPath, passYawOf } from './path.js';
import { collectWarnings, freestyleReport, labeller, sortWarnings } from './warnings.js';
/* Nothing built stands in the air: see seat.js. A map is seated with what is
 * under it, which needs the map placed, so that half is place.js's. */
import { hasRaised, seatFloating, seatedNote, standsOnGround } from './seat.js';
import { seatDocument } from '../maps/built/place.js';
import { History } from './history.js';
import { docFromQuery, trackLink } from './sharelink.js';
import { buildSheet, sheetHtml, CORNERS } from './buildsheet.js';
import { importFpvEvents, looksLikeFpvEvents, reportLines } from './importfpv.js';
/* The road tool: every rule about nodes and where a car goes is in here,
 * pure, and this file only applies them as edits. */
import {
  addDraftNode, closesDraft, deleteNode, endsDraft, insertNode, moveNode, roadFromDraft, snapToRoad,
  vehiclePlace, absNodes, OPEN_MIN, LOOP_MIN,
} from './roadtool.js';
import {
  animationFilename, deleteTrack, downloadBlob, downloadTrack, keepDisplaced, listTracks, pictureFilename,
  loadTrack, makeAutosaver, readAutosave, readFileText, saveTrack, shipMaps, trackExists, writeAutosave,
  savedTrack, restoreTrack, librarySize,
} from './storage.js';
/* What each canvas calls things, and the address back to the simulator. */
import {
  CANVAS_WORDS, CANVAS_ORDER, canvasOf, wordsFor, simulatorLink, isPlaceholderName, changedAgo, exactDate,
  rowsForCanvas,
} from './words.js';
/* The yard Your map flies while the map seat is empty, and the showpiece
 * built on it, the yard with a drift course and a tandem, listed in Load
 * as the maps' shipped rows. Plain documents with no imports but each
 * other, so the builder takes nothing of the simulator's world with it.
 * Handed to storage.js from here, because storage.js is on the
 * simulator's boot graph and these are not (see shipMaps). */
import { starterMap, STARTER_ID } from '../maps/built/starter.js';
import { showpieceMap } from '../maps/built/showpiece.js';
import { normaliseLogo, drawBannerPreview, drawGroundPreview } from './logo.js';
import {
  View2D, boardPlanOf, snapYaw, turnsOf, offCompass, QUARTER_TURN,
} from './view2d.js';
import { View3D } from './view3d.js';
import { Panels } from './ui.js';
import { RAD, wrapAngle } from './geometry.js';
import { isRoomType } from '../props/room.js';
import {
  boardOrigin, boardPageUrl, fetchMapDocument, publishMap, publishTrack,
  partsTheBoardDoesNotKnow, unknownPartsSentence,
  adoptShareFromLocation, TRACK_TAGS, TRACK_TAGS_MAX, tagLabel, usableTags, tagsForClass,
  fetchTrackList, fetchTrackDocument,
} from '../share/board.js';
import { sendCardAnimation } from '../share/cardgif.js';
import { sendShareCard } from '../share/card.js';
import { BOARD_WINDOW, SIM_WINDOW, claimWindowName } from '../share/windows.js';
import { patreonAnchor } from '../share/patreon.js';
import { nameRules, readPilotName, writePilotName } from '../share/pilot.js';
import {
  clearShareImport, readBuilderIntent, readEditKey, readMapListing, readShareImport,
  setActiveTrackClass, takeBuilderIntent, writeMapListing,
} from '../share/session.js';
import {
  bindOwnedCanvas,
  courseChip,
  flyCanvasWithoutListing,
  forkDocument,
  inspectCourse,
  isEmptyCanvas,
  layoutFingerprint,
  publishedTags,
  rememberPublish,
  suggestRemixName,
  syncOwnedName,
  syncOwnedIdentity,
  pushOwnedListing,
  tagsToSend,
} from '../share/listing.js';

shipMaps([starterMap(), showpieceMap()]);

/*
 * WHICH KIND OF TRACK A NEW ONE IS.
 *
 * A track class is a property of the track, so it has to be decided when a
 * NEW one is made, and the honest source for that decision is which aircraft
 * the pilot has seated: a 65 mm whoop flies a RaceGOW room and a 5 inch
 * flies a sixty metre field.
 *
 * Three sources, in order:
 *
 *   ?class=micro   an explicit answer in the URL. None of the simulator's
 *                  own links carry one; this is for a hand typed address.
 *   the settings   the shell's own blob, read as a STRING KEY rather than by
 *                  importing anything from it. The builder does not import a
 *                  line of the simulator (see schema.md) and this keeps that
 *                  true: the coupling is one localStorage key and one field
 *                  name, both named here, and a change to either shows up as
 *                  the builder defaulting to a field, which is the safe way
 *                  round.
 *   'full'         nobody said, so it is the track this tool has always made.
 *
 * Note what is NOT here: an existing document's own class always wins, and
 * this function is never consulted for one. Opening a RaceGOW track on a 5
 * inch shows you a RaceGOW track.
 */
const SHELL_SETTINGS_KEY = 'webfpv.settings.v3';
const WHOOP_AIRFRAME_ID = 'whoop65';

export function newTrackClass() {
  try {
    const wanted = new URLSearchParams(window.location.search).get('class');
    if (wanted === 'micro' || wanted === 'full') {
      return wanted;
    }
  } catch (e) {
    /* No URL to read. Fall through. */
  }
  try {
    const raw = localStorage.getItem(SHELL_SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.airframe === WHOOP_AIRFRAME_ID) {
        return 'micro';
      }
    }
  } catch (e) {
    /* Private mode, or a blob that is not JSON. Fall through. */
  }
  return 'full';
}

/*
 * THREE CANVASES: a five inch track, a whoop room, and a freestyle map.
 *
 * Each is its own autosave seat (see autosaveKey in storage.js), so moving
 * between them never destroys work. The two race canvases follow the seated
 * aircraft, as they always have. A map is flown on the five inch only, and
 * which canvas the author was last on is remembered here, in the builder's
 * own key, so reopening the builder brings the map back rather than
 * dropping the author on a race field they had left.
 */
export const CANVAS_KEY = 'webfpv.trackbuilder.canvas.v1';

/* Which canvas a document is on. It lives in ./words.js beside what each
 * canvas is called; exported from here as well, where it always was. */
export { canvasOf };

function readCanvas() {
  try {
    const v = localStorage.getItem(CANVAS_KEY);
    return v === 'freestyle' || v === 'micro' || v === 'full' ? v : null;
  } catch (e) {
    return null;
  }
}

function rememberCanvas(canvas) {
  try {
    localStorage.setItem(CANVAS_KEY, canvas);
  } catch (e) {
    /* Private mode. The builder opens on the seated aircraft's canvas. */
  }
}

/*
 * A PHONE, for the builder: under 500 px in either direction, where the
 * palette and the side column are drawers (MENUS-PLAN.md 4.4). The same query
 * as the stylesheet's phone block, so the two cannot disagree.
 */
export const PHONE_QUERY = '(max-width: 499.98px), (max-height: 499.98px)';

function isPhone() {
  try {
    return window.matchMedia(PHONE_QUERY).matches;
  } catch (e) {
    return false;
  }
}

/* What each canvas is called where the builder names one to the author in
 * the middle of a sentence. */
const CANVAS_NAMES = { full: 'five inch', micro: 'whoop', freestyle: 'freestyle' };

/*
 * THE STORAGE NOTICE IS READ ONCE. A first visit gets the full sentence as a
 * strip under the bar, because where the work lives is the one thing a new
 * author has to know before they build anything; after the first Save it is a
 * short line beside Save with the sentence in its title, because a sentence on
 * the screen for every session after the first is chrome, not information
 * (MENUS-PLAN.md 1.25). A browser that already has a saved document has read
 * it, whoever saved it.
 */
const SAVED_ONCE_KEY = 'webfpv.trackbuilder.savedonce.v1';

function savedOnce() {
  try {
    if (localStorage.getItem(SAVED_ONCE_KEY) === '1') {
      return true;
    }
  } catch (e) {
    /* Private mode: the library below answers instead. */
  }
  return librarySize() > 0;
}

function markSavedOnce() {
  try {
    localStorage.setItem(SAVED_ONCE_KEY, '1');
  } catch (e) {
    /* Private mode. The notice stays a strip, which is the safe way round. */
  }
}

/* The notice's sentence, after its "This browser only.", in the canvas's own
 * noun: a map is not a track, and the strip said tracks on all three. */
function keepSentence(noun) {
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}s you build stay here. Clearing the browser, or opening another device, starts you from nothing. Publish a ${noun} to put it on the board.`;
}

/*
 * THE CHOOSER'S THREE CARDS, which are the simulator's gate cards with the
 * builder's words on them.
 *
 * The owner asked on 2026-09-25 for the switch between five inch, whoop and
 * freestyle to be "way more prominent", as an overlay showing the gate's
 * three boxes with their pictures, a click on one doing what the switch
 * does, and the switch in the bar kept so an author can change back. So
 * these carry the gate's own names and its own pictures, the files
 * scripts/gatecards.js writes for the title, and a pilot who pressed Five
 * inch racing on the gate knows this card on sight. The sentences are about
 * building rather than flying, because this is the page where the question
 * is what to make.
 *
 * The pictures are the only thing taken from the simulator's side, and they
 * are files, not modules: the builder still imports none of the shell.
 */
const CHOICES = [
  {
    canvas: 'full',
    label: 'Five inch racing',
    art: '../../assets/gate/race.jpg',
    blurb: 'A race track on a sixty metre field. MultiGP gates, flags and dive gates on a grid in metres, flown on the five inch and published to the board.',
    facts: ['5 ft gates', '60 m field', 'The board'],
  },
  {
    canvas: 'micro',
    label: 'Whoop racing',
    art: '../../assets/gate/whoop.jpg',
    blurb: 'A room for the 65 mm whoop. RaceGOW’s 28 inch gates in a ten by twelve metre hall, a grid in inches, and RaceGOW’s own rules checking the layout.',
    facts: ['28 in gates', 'Indoors', 'RaceGOW'],
  },
  {
    canvas: 'freestyle',
    label: 'Freestyle',
    art: '../../assets/gate/freestyle.jpg',
    blurb: 'A map of your own on a 160 metre plot. Buildings, cranes, a skate set and named gaps wherever you put them, flown on the five inch with no gates and no clock.',
    facts: ['No gates', '160 m plot', 'Five inch'],
  },
];

/*
 * WHETHER THIS VISIT IS ASKED WHICH CANVAS, which is the same rule the
 * simulator's gate keeps: ask on arrival, unless the way in already said.
 *
 * Every link the simulator has into the builder says: ?mode= from the Track
 * room and the Freestyle room, an intent from Edit a copy and Edit this
 * track, ?share= from the board, ?track= from a pasted link. Those are not
 * asked, because a chooser in front of a decision made on the page before
 * is a keypress somebody has to spend for nothing. ?class= is a hand typed
 * answer and counts as one.
 *
 * What is left is a visit that names nothing: the gate's Map builder card,
 * a bookmark, the canonical address. Those are asked.
 *
 * And only a fresh visit. A reload is the same visit again, usually in the
 * middle of the work, and the address has already lost its ?mode by then
 * (see dropUrlMode), so without this every reload would ask what the author
 * is building while they are building it. Back and forward are the same.
 */
function asksCanvas(intent) {
  if (urlMode() || isRaceVisit(intent)) {
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('track') || params.has('class')) {
      return false;
    }
  } catch (e) {
    return false;
  }
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    return !nav || nav.type === 'navigate';
  } catch (e) {
    /* No navigation timing. Ask: a question too many is recoverable with
     * one press and a question too few is the thing being fixed. */
    return true;
  }
}

/*
 * WHETHER THIS VISIT OPENS THE MAP. Three answers, in order:
 *
 *   ?mode=         the address says outright. The simulator's own links
 *                  carry ?mode=freestyle from the map side and ?mode=race
 *                  from the race side, because the remembered canvas is
 *                  where the author last was, not what the link they
 *                  pressed was about: Open in the track builder on a race
 *                  track has to show that track, not yesterday's map.
 *   a race visit   Edit a copy or Edit this track from the simulator, or a
 *                  board link. Each brings a race track that is compared
 *                  with, and lands in, the race seat, so opening the map
 *                  first had adoptIncomingShare testing the map for
 *                  emptiness and then writing the race seat without asking.
 *   the remembered canvas, unless the pilot has since seated the whoop: a
 *                  map is not flown on a whoop, and reopening the map would
 *                  reseat the five inch behind their back.
 *
 * Not a race visit: the share seat on its own, which holds the last board
 * track flown for nearly every returning pilot and is adopted only with an
 * intent, and ?track=, which can carry a map and is loaded after this by
 * loadDocument, which follows the document's own canvas.
 */
function urlMode() {
  try {
    const v = new URLSearchParams(window.location.search).get('mode');
    return v === 'freestyle' || v === 'race' ? v : null;
  } catch (e) {
    return null;
  }
}

function isRaceVisit(intent) {
  if (intent && (intent.kind === 'remix' || intent.kind === 'edit')) {
    return true;
  }
  try {
    return Boolean(new URLSearchParams(window.location.search).get('share'));
  } catch (e) {
    return false;
  }
}

function opensMap(intent) {
  const asked = urlMode();
  if (asked) {
    return asked === 'freestyle';
  }
  if (isRaceVisit(intent)) {
    return false;
  }
  return readCanvas() === 'freestyle' && newTrackClass() !== 'micro';
}

/*
 * ?mode= comes out of the address once it has been read. It says which
 * canvas to open on arrival and nothing after that: left in the bar, a
 * reload after moving to the whoop went back to the map and reseated the
 * five inch over the whoop. Every other parameter stays, the way
 * src/share/stats.js takes out only the utm_ ones.
 */
function dropUrlMode() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('mode')) {
      return;
    }
    url.searchParams.delete('mode');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (e) {
    /* A sandboxed frame. The parameter stays in the bar, and a reload opens
     * the canvas it names. */
  }
}

/*
 * ?track= AND ?share= COME OUT OF THE ADDRESS ONCE READ, as ?mode= and
 * ?mapshare= already did (MENUS-PLAN.md 4.5). Left in, a reload was the link
 * opening again over whatever had been done since: measured in headless
 * Chromium on 831b724, a ?track= link edited and reloaded came back as the
 * link's version with the edits moved into Load under the same name, and a
 * ?share= copy edited and reloaded asked "Open a copy of ...?" all over again.
 * Every other parameter stays, ?board= and ?class= included.
 */
export function dropUrlParams(...names) {
  try {
    const url = new URL(window.location.href);
    const had = names.filter((n) => url.searchParams.has(n));
    if (!had.length) {
      return;
    }
    for (const n of had) {
      url.searchParams.delete(n);
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (e) {
    /* A sandboxed frame. The parameter stays, and a reload reads it again. */
  }
}

function newMap() {
  return createTrack(undefined, 'full', 'freestyle');
}

/*
 * Whether a local version of a board track holds work the board's does
 * not: the flying layout the Publish button compares (layoutFingerprint),
 * the name, or the logos, which the fingerprint leaves out. Not the whole
 * document: the board's copy has been through the board's own handling
 * (credit, field defaults), so an unedited seat would not compare equal
 * to it and every open of your own board link would ask.
 */
function localDrift(seated, incoming) {
  const logos = (d) => {
    const p = toPlain(d);
    return JSON.stringify([p.branding, p.elements.filter((e) => e.type === 'groundLogo')]);
  };
  return layoutFingerprint(seated) !== layoutFingerprint(incoming) || seated.name !== incoming.name
    || logos(seated) !== logos(incoming);
}

/*
 * A MAP GOES ON THE BOARD NOW. Publish did nothing on a map while the
 * board knew only race tracks (FREESTYLE-MAPS-PLAN.md, section 13, which
 * left it out of that plan). The owner asked for published maps on the
 * board on 2026-09-25, so a map is published by openPublishMap below, to
 * the board's own /api/maps, with the drawing its card is made from.
 */
const PUBLISH_MAP_TITLE = 'Put this map on the public board, sponsor prints and all';

/* What a picked side is called in a toast. Left and right are left out on
 * purpose: which is which depends on where the author is standing, and the
 * pipe they just clicked is lit, so "that upright" is the clearer name. */
const SIDE_WORDS = {
  top: 'The top bar',
  bottom: 'The bottom bar',
  left: 'That upright',
  right: 'That upright',
};

export class App {
  constructor(nodes) {
    /* The builder is the simulator's tab, not a tab of its own: the shell
     * navigates here in place and Back to the simulator navigates back.
     * Claiming the same name keeps the board's Fly this track landing on
     * this tab rather than opening a second simulator beside it. */
    claimWindowName(SIM_WINDOW);
    this.nodes = nodes;
    this.doc = createTrack(undefined, newTrackClass());
    this.selection = new Set();
    /* WHOOP CANVAS ONLY. The pass in focus is one pass of the lap, not a piece:
     * the one a pilot pinned (a chip on the strip, a number on a tag, a chip on
     * the card) and the one under the pointer for the moment. Views of the
     * builder, never stored, and cleared when a track opens. See passes.js. */
    this.passPinned = null;
    this.passHover = null;
    /* One side of the selected gate, picked in the 3D view to be taken away
     * with Delete: { id, side } or null. See FRAME_SIDES in elements.js. */
    this.pickedSide = null;
    /* Whether the author has been told once what bending the line does to
     * the gates either side of it. */
    this.bendSaid = false;
    this.armed = null;
    /* Which of the course's logos an armed ground decal will wear. Set only
     * by armGroundLogo, cleared by everything else that touches `armed`. */
    this.armedLogoId = '';
    this.mode = '2d';
    this.pathVisible = false;
    /* WHOOP CANVAS ONLY. Whether a drag that starts on the racing line bends
     * it into a waypoint. Off by default: the line runs through the middle of
     * every gate, so with it able to take a press, a click in a gate's opening
     * was a click on the line. A view choice, like the line, and not stored. */
    this.bendLine = false;
    /* Which view the author asked for, so the room's opening by itself on a
     * whoop canvas never overrules them: see syncViewToCanvas. */
    this.viewChosen = false;
    this.autoRoom = false;
    /* The side column, which a whoop canvas keeps in a drawer. */
    this.drawerOpen = false;
    /* What the magnets found at the last snap, for the views to draw. */
    this.guides = [];
    /* Flying-order numbers, on by default. A view choice, like the line:
     * it is not stored in the track, and turning it off does not change
     * what gets flown or published. */
    this.labelsVisible = true;
    this.path = null;
    this.warnings = [];
    this.history = new History();
    this.autosaver = makeAutosaver();
    this.drawQueued = false;
    /* A map's report: its solid count and its warnings, from the same
     * placement the simulator makes. Null on a race track. */
    this.report = null;
    /* The heading each asset type was last turned to on a map, so a row of
     * containers placed after turning the first one all come out turned. */
    this.lastYaw = new Map();
    /* The compass toast is said once a session: a tool that repeats itself
     * every drag is a tool people stop reading. */
    this.compassSaid = false;
    /* THE ROAD TOOL'S STATE. The road being laid, as plan points, which is
     * not in the document until it is finished, so the whole road lands as
     * one undo step and Escape leaves nothing behind; and the node of the
     * selected road the author last took hold of, which Delete removes. The
     * road tool's hints are said once each a session, as the compass's is. */
    this.roadDraft = null;
    this.activeNode = null;
    this.roadSaid = new Set();

    this.view2d = new View2D(nodes.canvas2d, this);
    this.view3d = new View3D(nodes.canvas3d, this);
    this.panels = new Panels(this, nodes);

    /* Read before restore(), which takes ?mode out of the address. */
    const asking = asksCanvas(readBuilderIntent());
    /* Run once when the open dialog closes, however it closes. The chooser
     * uses it to point at the switch in the bar. See closeModal. */
    this.afterModal = null;
    this.restore();
    this.pathVisible = this.isWhoopRace();
    /* The palette is the RESTORED document's class, not the default. Panels
     * builds one in its constructor because it must have something before a
     * document exists, and restore() runs after that, so a reopened RaceGOW
     * session was coming back with a field's tools over a room. */
    this.panels.buildPalette(trackClassOf(this.doc), docModeOf(this.doc));
    rememberCanvas(canvasOf(this.doc));
    this.buildTopBar();
    this.bindKeys();
    this.bindResize();
    this.bindModalBackdrop();
    /* The side drawer's own close button: see toggleDrawer. */
    document.getElementById('tb-side-x')?.addEventListener('click', () => this.toggleDrawer(false));
    /* On a phone an open drawer lays a scrim over the drawing (the stage's
     * ::after in the stylesheet), and a tap on it puts the drawers away rather
     * than placing or selecting through it. */
    nodes.canvas3d.parentElement?.addEventListener('pointerdown', (e) => {
      if (e.target === e.currentTarget && isPhone() && (this.drawerOpen || document.body.classList.contains('tb-tools'))) {
        e.preventDefault();
        this.closeTools();
        this.toggleDrawer(false);
      }
    });

    this.view2d.resize();
    this.view2d.frameTrack();
    this.view3d.frameTrack();
    this.refresh();
    this.syncViewToCanvas();
    if (asking) {
      this.openChooser();
    }
  }

  /* ---------------- lifecycle ---------------- */

  restore() {
    const map = opensMap(readBuilderIntent());
    dropUrlMode();
    if (map) {
      /* The map's own seat, and the five inch in the chair, because that is
       * what flies it. A first visit starts a blank map. */
      setActiveTrackClass('full');
      const held = readAutosave('full', 'freestyle');
      this.doc = (held && held.doc) || newMap();
      /* What floated when it was saved is on the ground or a roof when it
       * comes back, and the toast says so beside the repairs it already
       * counts, because a second toast would replace the first. */
      const said = this.seat();
      const fixed = held && held.repairs.length
        ? `Recovered the working map. ${held.repairs.length} thing${held.repairs.length === 1 ? '' : 's'} needed repairing.`
        : '';
      if (fixed || said) {
        this.toast([fixed, said].filter(Boolean).join(' '));
      }
      return;
    }
    const saved = readAutosave();
    if (saved && saved.doc) {
      this.doc = saved.doc;
      /* Same upgrade every other entry point runs. An autosave written
       * before stacked figures existed came back without one, so a reopened
       * session flew a stack differently from the file it was saved to. */
      upgradeStackedFigures(this.doc);
      const said = this.seat();
      applyAutoFaces(this.doc);
      const fixed = saved.repairs.length
        ? `Recovered the working track. ${saved.repairs.length} thing${saved.repairs.length === 1 ? '' : 's'} needed repairing.`
        : '';
      if (fixed || said) {
        this.toast([fixed, said].filter(Boolean).join(' '));
      }
      return;
    }
    this.doc = createTrack(undefined, newTrackClass());
  }

  async adoptIncomingShare() {
    try {
      const intent = takeBuilderIntent();
      let share = readShareImport();
      const params = new URLSearchParams(window.location.search);
      /* The simulator's Build a track: a blank canvas, unless a board link
       * came with it, which names a track and wins. See startBlank. */
      if (intent && intent.kind === 'new' && !params.get('share')) {
        this.startBlank();
        return;
      }
      if (params.get('share')) {
        try {
          share = await adoptShareFromLocation();
        } catch (e) {
          /* Left in the address, so a reload asks the board again: a board
           * that was asleep is the usual reason, and it wakes. */
          this.toast(`Could not open that published track. ${e.message || e} Reload to try again.`);
          return;
        }
        /* Read: a reload from here on is the author reloading their copy. */
        dropUrlParams('share');
      }
      if (!share || !share.document) {
        share = readShareImport() || share;
      }
      if (!share || !share.document) {
        return;
      }
      const owned = Boolean(readEditKey(share.id));
      const fromBoard = Boolean(params.get('share'));
      const wantRemix = (intent && intent.kind === 'remix') || (!owned && fromBoard);
      const wantEdit = owned && (fromBoard || (intent && intent.kind === 'edit'));
      if (!wantRemix && !wantEdit) {
        return;
      }
      const incoming = normalize(share.document).doc;
      /* What the incoming track replaces is whatever its OWN seat holds,
       * which is the canvas on screen only when the two are the same kind:
       * a room from a board link opened on a five inch lands in the whoop
       * seat, and asking about the five inch track on screen asked about
       * the one thing that was not going to change. */
      const seated = this.seatedFor(incoming);
      if (wantEdit) {
        const load = () => {
          /* The seat may hold this same track with edits the board has not
           * had: the Publish button calls that drift and offers to send it.
           * Opening the board's version must not drop them, so they are
           * kept in Load as a copy under a new id (never under the board's
           * id, which would be two documents behind one edit key). */
          let local = '';
          if (!isEmptyCanvas(seated) && seated.id === incoming.id && localDrift(seated, incoming)) {
            const copy = duplicateTrack(seated, `${seated.name} (local changes)`);
            if (!saveTrack(copy)) {
              this.toast(`Nothing was opened: "${seated.name}" has changes the board does not, and they could not be kept because local storage is unavailable or full. Export it first.`);
              return;
            }
            local = `Your local changes are in Load as "${copy.name}".`;
          }
          this.loadDocument(incoming, [`Editing "${incoming.name}" on the board.`, local].filter(Boolean).join(' '));
        };
        if (!isEmptyCanvas(seated) && seated.id !== incoming.id) {
          this.confirm(
            ...this.replaceWords(seated, incoming, 'This published track', [
              'Replace the track on the canvas?',
              'Your current canvas will be replaced with this published track. Save it first if you still need it.',
            ]),
            load,
          );
        } else {
          load();
        }
        return;
      }
      const { copy, commit } = forkDocument(incoming, {
        sourceId: share.id,
        sourceName: share.name || incoming.name,
        sourceAuthor: share.author || '',
        board: share.board || boardOrigin(),
      });
      const load = () => {
        /* The other canvas's document is kept FIRST, because it can fail
         * (storage full), and then nothing may happen: loadDocument would
         * refuse, but only after the bind below was committed. The keep
         * is handed to loadDocument rather than asked for twice. */
        const keep = canvasOf(copy) !== canvasOf(this.doc) ? this.keepSeat(copy) : null;
        if (keep && !keep.ok) {
          this.toast(keep.said);
          return;
        }
        /* Committed HERE, not in forkDocument: the confirm below can be
         * declined, and a bind for a copy the author never opened is a
         * course this browser claims to own and has never seen. */
        commit();
        clearShareImport();
        this.loadDocument(copy, `This is your copy of "${share.name || incoming.name}". Publish it under a new name to put it on the board.`, keep);
      };
      if (!isEmptyCanvas(seated) && seated.id !== share.id) {
        this.confirm(
          ...this.replaceWords(seated, incoming, `A copy of "${share.name || incoming.name}"`, [
            `Open a copy of "${share.name || incoming.name}"?`,
            'The track on your canvas will be replaced. Save it first if you still need it.',
          ]),
          load,
        );
      } else {
        load();
      }
    } finally {
      this.syncBoardIdentity();
    }
  }

  /*
   * A PUBLISHED MAP FROM THE BOARD, as ?mapshare=id: its Remix in the
   * builder, which also carries ?mode=freestyle so restore() has already
   * opened the map canvas.
   *
   * A map this browser published opens as itself, so Publish updates it. Any
   * other opens as a copy under a new id and a remix's name, so Publish puts
   * up a new map and the original stays its builder's. Nothing is written to
   * the track seats or binds: a map's only record is its own key, and a copy
   * has none until it is published.
   *
   * The parameter comes out of the address once read, as ?mode= does, so a
   * reload is the author reloading their copy rather than asking the board
   * for another one.
   */
  async adoptIncomingMap() {
    let id = '';
    try {
      const url = new URL(window.location.href);
      id = url.searchParams.get('mapshare') || '';
      if (id) {
        url.searchParams.delete('mapshare');
        history.replaceState(history.state, '', url);
      }
    } catch (e) {
      return;
    }
    if (!id) {
      return;
    }
    let payload;
    try {
      payload = await fetchMapDocument(id, boardOrigin());
    } catch (e) {
      this.toast(`Could not open that published map. ${e.message || e}`);
      return;
    }
    const incoming = normalize(payload.document || payload).doc;
    if (docModeOf(incoming) !== 'freestyle') {
      this.toast('That link names a race track, not a map.');
      return;
    }
    const name = payload.name || incoming.name;
    const owned = Boolean(readMapListing(incoming.id));
    const seated = this.seatedFor(incoming);
    if (owned && seated && seated.id === incoming.id) {
      /* Already on the canvas, perhaps with edits the board has not had.
       * Replacing it with the board's copy would throw those away. */
      this.toast(`"${seated.name}" is already on your canvas.`);
      return;
    }
    const doc = owned ? incoming : duplicateTrack(incoming, suggestRemixName(name));
    const by = payload.author ? ` by ${payload.author}` : '';
    const load = () => this.loadDocument(doc, owned
      ? `Editing "${name}" on the board. Publish updates it.`
      : `This is your copy of "${name}"${by}. Publish it to put it on the board under your name. The original stays.`);
    if (!isEmptyCanvas(seated) && seated.id !== doc.id) {
      this.confirm(
        ...this.replaceWords(seated, doc, owned ? `"${name}"` : `A copy of "${name}"`, [
          owned ? `Open "${name}"?` : `Open a copy of "${name}"?`,
          'The map on your canvas will be replaced. Save it first if you still need it.',
        ]),
        load,
      );
    } else {
      load();
    }
  }

  syncBoardIdentity() {
    syncOwnedIdentity().catch(() => {
      /* The board can stay a step behind until they save the name again. */
    });
  }

  bindResize() {
    const onResize = () => {
      this.view2d.resize();
      this.view3d.resize();
      this.requestDraw();
      this.panels.renderResults();
      /* A phone turned round can cross the phone line: the notice and the
       * Patreon link follow it (placeKeep), and so do the lines that say
       * where the tools are. The palette is a drawer only on a phone. */
      this.placeKeep();
      const phone = isPhone();
      if (phone !== this.wasPhone) {
        this.wasPhone = phone;
        if (!phone) {
          /* Off a phone the palette is a column again, and only the whoop's
           * side column is a drawer: one left open on a field would be
           * invisible and still take Escape's first press. */
          this.closeTools();
          if (!this.isWhoopRace()) {
            this.toggleDrawer(false);
          }
        }
        this.panels.renderEmpty();
        this.panels.renderCoach();
      }
      this.fitTopBar();
    };
    window.addEventListener('resize', onResize);
    /* The stage's width changes without the window's: a whoop canvas takes the
     * side column's room, and hands it back on another canvas. */
    if (typeof ResizeObserver === 'function' && this.nodes.canvas3d.parentElement) {
      new ResizeObserver(() => onResize()).observe(this.nodes.canvas3d.parentElement);
    }
    window.addEventListener('beforeunload', () => this.autosaver.flush());
  }

  /* ---------------- the one door ---------------- */

  /*
   * Run a mutation as one undoable step. `mutate` gets the live document and
   * changes it in place.
   */
  edit(label, mutate) {
    const before = deepClone(this.doc);
    mutate(this.doc);
    this.settle();
    this.stampIfChanged(this.history.record(before, this.doc, label));
    this.refresh();
  }

  /* Gesture form of the same thing, for drags: begin, many mutations, end. */
  beginEdit(label) {
    this.history.begin(this.doc, label);
  }

  endEdit() {
    this.settle();
    this.stampIfChanged(this.history.commit(this.doc));
    this.refresh();
  }

  /*
   * THE STAMP SAYS WHEN THE TRACK LAST CHANGED, so it moves only when the
   * history found a change. It used to move inside settle() on every edit,
   * which made a click that merely selected an element look like an edit to
   * everything that compares documents: the undo history recorded a step
   * called "move" for it, and the autosave and the Load list were told the
   * track had changed when it had not.
   */
  stampIfChanged(changed) {
    if (changed) {
      touch(this.doc);
    }
  }

  cancelEdit() {
    this.history.cancel();
    this.refresh();
  }

  /* Everything that has to be true after any change, in the order it has to
   * be true in: what floats is set down first, because a base moves the line
   * and every face derived from it; then apertures, because a face cannot be
   * derived for a level that no longer exists. */
  settle() {
    const said = this.seat();
    clampSequenceToApertures(this.doc);
    applyAutoFaces(this.doc);
    if (said) {
      this.toast(said);
    }
  }

  /*
   * NOTHING BUILT STANDS IN THE AIR (./seat.js). Set down whatever floats in
   * the live document, and return the sentence that says so, or the empty
   * string when nothing moved. On a track that is only ever the ground; on a
   * map it is the roof, the deck or the container under the element's middle,
   * which needs the map placed, so a map is placed for this only when
   * something in it is raised. This is the one door every edit and every
   * document that arrives goes through: settle(), restore() and
   * loadDocument() all come here, so a drag, a typed Base, a deleted roof, an
   * import and a board link cannot leave one hanging.
   */
  seat() {
    if (!hasRaised(this.doc)) {
      return '';
    }
    const moved = docModeOf(this.doc) === 'freestyle'
      ? seatDocument(this.doc).moved
      : seatFloating(this.doc);
    return seatedNote(moved, labeller(this.doc), (id) => elementById(this.doc, id));
  }

  /* Whether this element's base is the ground and nothing else in this
   * document, so it has no height to edit: the 3D view asks, and the
   * inspector asks seat.js the same question directly. */
  isGrounded(element) {
    return standsOnGround(this.doc, element);
  }

  refresh() {
    /*
     * DERIVE ALWAYS, DRAW ON REQUEST. The line used to be built only while
     * it was being drawn, so the length, the tightest radius, the elevation
     * profile and every warning sat behind a button: an author had to press
     * Create Path to find out whether the course they had just built was
     * valid, and nothing told them there was anything to find out. Deriving
     * is what tells them, so it happens on every edit. pathVisible now means
     * only what it says, whether the line is painted on the canvas.
     */
    this.rebuildPath();
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
    this.autosaver.schedule(this.doc);
  }

  rebuildPath() {
    /* A map has no flying order, so no line to derive. What it has instead
     * is the world it builds, and the report checks that. */
    if (docModeOf(this.doc) === 'freestyle') {
      this.path = null;
      this.report = freestyleReport(this.doc);
      this.warnings = sortWarnings(this.report.warnings);
      return;
    }
    this.report = null;
    this.path = buildPath(this.doc);
    this.warnings = sortWarnings(collectWarnings(this.doc, this.path));
  }

  requestDraw() {
    if (this.drawQueued) {
      return;
    }
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      if (this.mode === '2d') {
        this.view2d.draw();
      } else {
        this.view3d.draw();
      }
    });
  }

  /* ---------------- selection ---------------- */

  setSelection(ids, additive = false) {
    /* A piece of a group is the whole group: a face of a cube is not something to move on its own. */
    const wanted = expandGroups(this.doc, ids);
    if (!additive) {
      this.selection = wanted;
    } else {
      for (const id of wanted) {
        this.selection.add(id);
      }
    }
    this.pruneActiveNode();
    this.keepPickedSide();
    this.keepPassPin();
    this.panels.renderAll();
    /* What is selected is drawn differently in the room (its colour, its ring),
     * so a selection is a reason to redraw the scene, not only the frame. */
    this.view3d.markDirty();
    this.requestDraw();
  }

  toggleSelection(id) {
    const members = expandGroups(this.doc, [id]);
    if (this.selection.has(id)) {
      for (const m of members) {
        this.selection.delete(m);
      }
    } else {
      for (const m of members) {
        this.selection.add(m);
      }
    }
    this.pruneActiveNode();
    this.keepPickedSide();
    this.keepPassPin();
    this.panels.renderAll();
    this.view3d.markDirty();
    this.requestDraw();
  }

  /* The picked node belongs to the one road selected, or to nothing. */
  pruneActiveNode() {
    const a = this.activeNode;
    if (!a) {
      return;
    }
    const road = elementById(this.doc, a.id);
    if (this.selection.size !== 1 || !this.selection.has(a.id) || !road || !(a.index < (road.nodes?.length ?? 0))) {
      this.activeNode = null;
    }
  }

  /* ---------------- the pass in focus ---------------- */

  /*
   * The one pass of the lap that is in focus, or null: the pass under the
   * pointer, else the pinned one while it belongs to what is selected, else
   * the first pass of the piece that is selected. Everything about a pass that
   * is not in focus is drawn quiet (3.8 of WHOOP-BUILDER-PLAN.md).
   *
   * `withHover` false leaves the pointer out: the card is about the pass that was
   * chosen, and a pass only looked at in passing must not swap what its fields say.
   */
  focusedPass(withHover = true) {
    if (!this.isWhoopRace()) {
      return null;
    }
    return focusFor(this.doc, {
      selection: this.selection, pinned: this.passPinned, hover: withHover ? this.passHover : null,
    });
  }

  /* The pin belongs to the piece it is a pass of: a selection that is not that
   * piece lets it go, so it does not come back the next time the piece is picked. */
  keepPassPin() {
    if (this.passPinned == null) {
      return;
    }
    const q = this.doc.sequence.find((s) => s.id === this.passPinned);
    if (!q || this.selection.size !== 1 || !this.selection.has(q.elementId)) {
      this.passPinned = null;
    }
  }

  /* What the pointer is over: a chip on the strip, a number on a tag. Nothing
   * is selected and nothing is rebuilt but the picture. */
  setPassHover(seqId) {
    const id = seqId ?? null;
    if (id === this.passHover) {
      return;
    }
    this.passHover = id;
    this.passFocusChanged();
  }

  /* Pin a pass: select its piece and hold the focus on that pass. */
  setPassPinned(seqId) {
    const q = this.doc.sequence.find((s) => s.id === seqId);
    if (!q) {
      return;
    }
    this.passPinned = seqId;
    /* keepPassPin lets the pin go for a selection that is not its piece, and
     * this one is. */
    this.setSelection([q.elementId]);
  }

  /*
   * FLY IT AGAIN: another pass through a piece, at the end of the lap, and the
   * new pass is the one in focus, so the room and the strip show what was done.
   * The direction is worked out from the line like every other pass's. Returns the
   * pass, or null with a sentence when the piece cannot be flown or the lap is as
   * long as one goes.
   */
  flyPieceAgain(elementId, apertureIndex = 0) {
    if (!this.isWhoopRace()) {
      return null;
    }
    const el = elementById(this.doc, elementId);
    if (!el) {
      return null;
    }
    if (this.doc.sequence.length >= MAX_PASSES) {
      this.toast(`A lap of ${MAX_PASSES} passes is as long as this builder will make one.`);
      return null;
    }
    let made = null;
    this.edit('fly it again', (d) => { made = flyAgain(d, elementId, apertureIndex); });
    if (!made) {
      this.toast(`${el.name || labelOf(el.type, 'micro')} is not something the lap flies through or round.`);
      return null;
    }
    this.passPinned = made.id;
    /* keepPassPin lets the pin go for a selection that is not its piece, and this is. */
    this.setSelection([elementId]);
    return made;
  }

  /* The Fly order tool's click: a pass through the piece that was clicked, through
   * the opening under the pointer when it is a stack. */
  routeTo(elementId, point) {
    const el = elementById(this.doc, elementId);
    if (!el) {
      return null;
    }
    const opening = kindOf(el) === KIND.APERTURE ? apertureAt(this.doc, elementId, point ? point.z : 0) : 0;
    return this.flyPieceAgain(elementId, opening);
  }

  /* Backspace in the Fly order tool: the last pass comes off the lap. */
  removeLastPassOfLap() {
    if (!this.doc.sequence.length) {
      return;
    }
    this.edit('take the last pass off', (d) => { removeLastPass(d); });
  }

  /* Start over: the whole flying order goes, and the waypoints with it, which are
   * only bends of the line and have nothing to stand for without it. Pieces stay.
   * One undo step brings it back. */
  startOrderOver() {
    if (!this.doc.sequence.length && !this.doc.elements.some((e) => e.type === 'waypoint')) {
      return;
    }
    this.edit('start the order again', (d) => {
      for (const e of d.elements.filter((x) => x.type === 'waypoint')) {
        removeElement(d, e.id);
      }
      d.sequence.length = 0;
    });
    this.passPinned = null;
    this.setSelection([]);
  }

  /* The focus moved: the room is drawn again, and the strip and the card catch
   * up without being rebuilt, because a pointer that is over one of their
   * buttons must not have it taken away from under it. */
  passFocusChanged() {
    this.panels.renderPassFocus?.();
    this.view3d.markDirty();
    this.requestDraw();
  }

  /* ---------------- one side of a gate ---------------- */

  /* A picked side belongs to the one selected gate, and to a side that is
   * still there to take away. Anything else lets it go. */
  keepPickedSide() {
    const p = this.pickedSide;
    if (!p) {
      return;
    }
    const el = elementById(this.doc, p.id);
    if (this.selection.size !== 1 || !this.selection.has(p.id) || !el
      || (el.unbuiltSides ?? []).includes(p.side) || el.unbuilt === true) {
      this.pickedSide = null;
      this.view3d.markDirty();
    }
  }

  /*
   * WHERE AN ELEMENT IS on the plan, for centring the views on it: its
   * position, except a vehicle's, which is where it is drawn (its position
   * is written 0 and never read), and a road's, which is the middle of its
   * nodes rather than its first one.
   */
  placeOf(el) {
    const kind = kindOf(el);
    if (kind === KIND.VEHICLE) {
      const at = vehiclePlace(this.doc, el);
      return { x: at.x, y: at.y, z: 0 };
    }
    if (kind === KIND.ROAD) {
      const nodes = absNodes(el);
      if (nodes.length) {
        const xs = nodes.map((p) => p.x);
        const ys = nodes.map((p) => p.y);
        return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, z: 0 };
      }
    }
    return el.position;
  }

  /*
   * The 3D view's click on a pipe of the gate that is already selected: that
   * pipe is picked, drawn hot, and Delete takes just it away. The first
   * click on a gate selects the gate, as it always has, so Delete after one
   * click still removes the gate.
   */
  pickSide(id, side) {
    this.pickedSide = side ? { id, side } : null;
    this.view3d.markDirty();
    this.requestDraw();
    if (side) {
      this.toast(`${SIDE_WORDS[side]} picked. Delete takes away just that pipe: the opening still scores and still lights. Esc lets go of it.`);
    }
  }

  clearPickedSide() {
    if (!this.pickedSide) {
      return false;
    }
    this.pickedSide = null;
    this.view3d.markDirty();
    this.requestDraw();
    return true;
  }

  /* The inspector's Frame toggles and the Delete key both come here. */
  setFrameSide(id, side, built) {
    this.edit(built ? 'put a side back' : 'take a side away', (d) => {
      setSideBuilt(d, id, side, built);
    });
    this.keepPickedSide();
  }

  removePickedSide() {
    const p = this.pickedSide;
    this.pickedSide = null;
    if (!p || !elementById(this.doc, p.id)) {
      return;
    }
    this.setFrameSide(p.id, p.side, false);
    this.toast(`${SIDE_WORDS[p.side]} taken away. The opening still scores. Put it back under Frame in the inspector, or undo.`);
  }

  /* ---------------- bending the line, in 3D ---------------- */

  /*
   * A drag that starts on the racing line drops a waypoint where the line
   * was grabbed and moves it: see bendLineAt in sequence.js. Called on the
   * drag's first move, not on the press, so a click on the line that goes
   * nowhere leaves nothing behind. Returns the new waypoint's id.
   */
  beginBend(hit) {
    if (docModeOf(this.doc) === 'freestyle' || !this.path) {
      return null;
    }
    this.history.begin(this.doc, 'bend the line');
    const yaw = Math.atan2(hit.tangent.y, hit.tangent.x);
    const el = bendLineAt(this.doc, this.path, hit.segment, hit.pos, yaw);
    if (!el) {
      this.history.cancel();
      return null;
    }
    this.selection = new Set([el.id]);
    this.pickedSide = null;
    this.afterBendMove();
    this.panels.renderAll();
    if (!this.bendSaid) {
      this.bendSaid = true;
      this.toast(`That dropped a waypoint on the line, which bends it and scores nothing. The gates either side keep facing the way they face; ${this.panels.say('Re-derive')} in the inspector hands one back to the automatic rule.`);
    }
    return el.id;
  }

  /* A drag on a waypoint that is already there: the same gesture. The
   * neighbours are pinned on the first move, not here, so a click that does
   * not move leaves no undo step. */
  beginWaypointDrag() {
    this.history.begin(this.doc, 'bend the line');
  }

  moveWaypoint(id, pos, first = false) {
    const el = elementById(this.doc, id);
    if (!el) {
      return;
    }
    if (first) {
      pinFacesAt(this.doc, neighboursOf(this.doc, id));
    }
    el.position.x = pos.x;
    el.position.y = pos.y;
    el.position.z = Math.max(0, pos.z);
    this.afterBendMove();
  }

  afterBendMove() {
    applyAutoFaces(this.doc);
    this.rebuildPath();
    this.view3d.markDirty();
    this.requestDraw();
    this.panels.renderInspector();
  }

  /* A gesture the browser took away: put the document back as it was when
   * the gesture began. cancelEdit keeps what the drag did, which suits a
   * height drag; a bend has added an element, and a cancelled bend that
   * left one behind would be a waypoint nobody asked for with no undo step
   * to take it away again. */
  revertEdit() {
    const before = this.history.pending?.doc;
    this.history.cancel();
    if (before) {
      this.doc = deepClone(before);
      this.pruneSelection();
    }
    this.refresh();
  }

  selectionCentroid() {
    const ids = [...this.selection];
    if (!ids.length) {
      return null;
    }
    let x = 0;
    let y = 0;
    let z = 0;
    let n = 0;
    for (const id of ids) {
      const e = elementById(this.doc, id);
      if (e) {
        const at = this.placeOf(e);
        x += at.x;
        y += at.y;
        z += at.z;
        n += 1;
      }
    }
    return n ? { x: x / n, y: y / n, z: z / n } : null;
  }

  /* Both views centre on the same thing, which is what makes the 2D and 3D
   * toggle feel like one tool rather than two. */
  focusSelection() {
    const c = this.selectionCentroid();
    if (!c) {
      return;
    }
    this.view2d.centerOn(c);
    /* Twelve metres is close on a sixty metre field and the whole of a whoop
     * hall, so a whoop canvas is let in as near as a gate needs. */
    this.view3d.focusDoc(c, Math.max(this.isWhoopRace() ? 1.4 : 12, this.view3d.orbit.radius * 0.6));
    this.requestDraw();
  }

  focusWarning(w) {
    if (w.elementId) {
      this.setSelection([w.elementId]);
      /* A road's warning about one of its nodes picks that node too, so
       * Delete, or a drag, is the next thing to do. */
      const el = elementById(this.doc, w.elementId);
      if (el && kindOf(el) === KIND.ROAD && Number.isInteger(w.node) && w.node < el.nodes.length) {
        this.setActiveNode(el.id, w.node);
      }
      this.focusSelection();
      return;
    }
    if (w.seqId) {
      const seq = this.doc.sequence.find((s) => s.id === w.seqId);
      if (seq) {
        this.setSelection([seq.elementId]);
        this.focusSelection();
      }
    }
  }

  /* ---------------- placement ---------------- */

  /*
   * A TOOL PICKED, by its button on the palette or by its key.
   *
   * On the five inch and map canvases the 3D view is a preview, and a tool
   * armed there placed nothing however often the field was clicked
   * (MENUS-PLAN.md 4.2). The palette says "Build in 2D" while the preview is
   * up, and picking a tool there takes the author to 2D with the tool in hand,
   * because the tool is what they asked for and 2D is where it works. On the
   * whoop canvas the room is where things are built, and a tool is armed as
   * it always was.
   */
  pickTool(typeId) {
    /* A phone's palette is a drawer over the drawing, and the next thing to do
     * with a tool is tap the drawing, so picking one puts the drawer away. */
    const phone = isPhone();
    if (phone) {
      this.closeTools();
    }
    if (this.previewing()) {
      this.viewChosen = true;
      this.setMode('2d');
      if (this.armed !== typeId) {
        this.arm(typeId);
      }
    } else {
      this.arm(typeId);
    }
    /* And says, once, what a tap does now and how the tool goes back, since
     * the palette that would show it lit has just closed. The room's coach
     * line says it on a whoop canvas, and the road and the car say their own. */
    if (phone && this.armed === typeId && !this.isWhoopRace() && typeId !== 'road' && typeId !== 'vehicle') {
      this.sayOnce('phone tool', `Tap the ${wordsFor(this.doc).place} to place it. It stays in hand for the next one, and Tools on the bar puts it away.`);
    }
  }

  /* Whether this is a phone, where the palette is behind Tools: the panels
   * say so in their words. */
  onPhone() {
    return isPhone();
  }

  /* Whether the view up is the 3D preview, where nothing is placed. */
  previewing() {
    return this.mode === '3d' && !this.isWhoopRace();
  }

  arm(typeId) {
    this.armed = this.armed === typeId ? null : typeId;
    /* A road half laid is put away with the tool that was laying it. */
    if (this.armed !== 'road') {
      this.roadDraft = null;
    }
    /* A tool armed from the palette carries no logo with it. The decal it
     * places falls back to the course's first logo, which is what
     * createElement has always done. */
    this.armedLogoId = '';
    this.panels.renderPalette();
    this.clearGhost();
    this.requestDraw();
    if (this.armed === 'ruler' && this.mode === '2d') {
      this.sayOnce('ruler in 2d', 'The ruler measures in 3D, at an angle or from the top. Press V, or 3D on the bar.');
    }
    if (this.armed === 'road') {
      this.sayOnce('arm road', 'Click to lay the road’s nodes: it bends through them the way a car can drive. Click the first node to close a loop, press Enter or double click to finish it open, Escape to stop.');
    } else if (this.armed === 'vehicle') {
      const roads = this.doc.elements.some((e) => kindOf(e) === KIND.ROAD);
      this.sayOnce(roads ? 'arm vehicle' : 'arm vehicle, no road', roads
        ? 'Click on a road to put a car there. On a two lane loop the side you click is the lane it drives.'
        : 'A vehicle drives a road, and this map has none yet. Lay one with the Road tool first.');
    }
  }

  /* A road tool hint, said the first time it applies and not again this
   * session. */
  sayOnce(key, message) {
    if (this.roadSaid.has(key)) {
      return;
    }
    this.roadSaid.add(key);
    this.toast(message);
  }

  /*
   * Arm the ground decal with a logo already chosen, which is what the
   * Sponsor logos dialog's Paint on the grass button does.
   *
   * A separate entry point rather than an argument to arm(), because arm()
   * TOGGLES: pressing Paint on the grass on two logos in a row would have
   * disarmed the tool on the second press, and the author plainly wants to
   * paint the second one.
   */
  armGroundLogo(logoId) {
    this.armed = 'groundLogo';
    this.armedLogoId = typeof logoId === 'string' ? logoId : '';
    /* Painted in 2D on a field or a plot, where a click places: the 3D view
     * there is a preview. */
    if (this.mode === '3d' && !this.isWhoopRace()) {
      this.viewChosen = true;
      this.setMode('2d');
    }
    this.panels.renderPalette();
    this.requestDraw();
    this.toast(`Click the ${wordsFor(this.doc).place} where the paint goes. Its size is in the inspector.`);
  }

  disarm() {
    this.armed = null;
    this.armedLogoId = '';
    this.roadDraft = null;
    this.panels.renderPalette();
    this.clearGhost();
    this.requestDraw();
  }

  /* The ghost of a piece not yet placed, and the distances beside it, belong to
   * the tool that is armed: they go when it is put away or changed. */
  clearGhost() {
    this.view3d.clearGhost();
    this.view3d.clearMeasures();
    this.view3d.setGuides([]);
    this.view3d.editor.clearRuler();
  }

  /* ---------------- the road tool ---------------- */

  /*
   * A click with the road tool. On the draft's first node (three down) it
   * closes the road into a loop; on its last it finishes it open, which is
   * where the second click of a double click lands; anywhere else it lays a
   * node at the snapped point. `raw` is the pointer, so a node can be hit
   * whatever the grid; `reach` is how close counts, in metres.
   */
  draftClick(raw, snapped, reach) {
    const nodes = this.roadDraft ?? [];
    if (closesDraft(nodes, raw.x, raw.y, reach)) {
      this.finishDraft(true);
      return;
    }
    if (endsDraft(nodes, raw.x, raw.y, reach)) {
      this.finishDraft(false);
      return;
    }
    this.roadDraft = addDraftNode(nodes, snapped);
    this.requestDraw();
  }

  /* The draft laid as a road, in one edit, and selected. The tool stays
   * armed, so the next click starts the next road. */
  finishDraft(closed) {
    const nodes = this.roadDraft ?? [];
    const road = roadFromDraft(nodes, closed);
    if (!road) {
      this.toast(closed
        ? `A loop needs ${LOOP_MIN} nodes.`
        : `A road needs ${OPEN_MIN} nodes: click where it goes next.`);
      return;
    }
    let newId = null;
    this.edit(closed ? 'lay loop' : 'lay road', (d) => {
      const el = createElement(d, 'road', road.position);
      el.nodes = road.nodes;
      el.closed = road.closed;
      d.elements.push(el);
      newId = el.id;
    });
    this.roadDraft = null;
    if (newId) {
      this.setSelection([newId]);
    }
    this.sayOnce('laid', 'Road laid. Drag a node to reshape it, drag the + between two nodes to add one, click a node and press Delete to take it out. Pick Vehicle and click on it to put a car on it.');
  }

  cancelDraft() {
    this.roadDraft = null;
    this.requestDraw();
  }

  /* Backspace while laying: the last node back. */
  undoDraftNode() {
    if (!this.roadDraft) {
      return;
    }
    this.roadDraft = this.roadDraft.length > 1 ? this.roadDraft.slice(0, -1) : null;
    this.requestDraw();
  }

  setActiveNode(id, index) {
    this.activeNode = { id, index };
    this.panels.renderInspector();
    this.requestDraw();
  }

  /* Where every vehicle on a road is drawn now, by id: taken before an edit
   * that moves the road's line, so reseatVehicles can put each back. */
  vehicleStarts(roadId) {
    const starts = new Map();
    for (const el of this.doc.elements) {
      if (kindOf(el) === KIND.VEHICLE && el.road === roadId) {
        const at = vehiclePlace(this.doc, el);
        if (at.onRoad) {
          starts.set(el.id, { x: at.x, y: at.y });
        }
      }
    }
    return starts;
  }

  /*
   * KEEP THE CARS WHERE THEY WERE. A car's place is how far along its road's
   * centre line it starts, so reshaping the road (a node moved, added or
   * taken out, a loop opened, a new radius) would slide every car on it to
   * wherever that distance now falls. Instead each goes to the point of the
   * new line nearest where it was drawn, which is where the author left it.
   * Moving the whole road changes no distance, and every car goes with it.
   */
  reseatVehicles(doc, roadId, starts) {
    for (const [id, p] of starts) {
      const el = elementById(doc, id);
      const snap = snapToRoad(doc, p.x, p.y, Infinity, roadId);
      if (el && snap) {
        el.dims.offset = snap.offset;
      }
    }
  }

  /* An edit to one road that may move its line, with its cars kept. */
  editRoad(label, id, mutate) {
    const starts = this.vehicleStarts(id);
    this.edit(label, (d) => {
      const el = elementById(d, id);
      if (el) {
        mutate(el);
        this.reseatVehicles(d, id, starts);
      }
    });
  }

  setRoadClosed(id, closed) {
    const el = elementById(this.doc, id);
    if (!el || (closed && el.nodes.length < LOOP_MIN)) {
      return;
    }
    this.editRoad(closed ? 'close loop' : 'open loop', id, (e2) => { e2.closed = closed; });
  }

  /* A node dragged: many of these between beginEdit and endEdit, one undo
   * step. */
  moveRoadNode(id, index, p, starts) {
    const el = elementById(this.doc, id);
    const moved = el ? moveNode(el, index, p) : null;
    if (!moved) {
      return;
    }
    el.position = moved.position;
    el.nodes = moved.nodes;
    this.reseatVehicles(this.doc, id, starts);
    this.requestDraw();
    this.panels.renderInspector();
  }

  /* A node put in on a leg, inside a gesture the caller began. Returns the
   * new node's index, or -1. */
  insertRoadNode(id, leg, p, starts) {
    const el = elementById(this.doc, id);
    const out = el ? insertNode(el, leg, p) : null;
    if (!out) {
      return -1;
    }
    el.position = out.position;
    el.nodes = out.nodes;
    this.reseatVehicles(this.doc, id, starts);
    this.activeNode = { id, index: out.index };
    this.requestDraw();
    this.panels.renderInspector();
    return out.index;
  }

  deleteRoadNode(id, index) {
    const el = elementById(this.doc, id);
    const out = el ? deleteNode(el, index) : null;
    if (!out) {
      this.toast('A road needs two nodes. Delete the road itself instead: click away from its nodes and press Delete.');
      return;
    }
    const wasLoop = el.closed === true;
    this.activeNode = null;
    this.editRoad('delete node', id, (e2) => {
      e2.position = out.position;
      e2.nodes = out.nodes;
      e2.closed = out.closed;
    });
    if (wasLoop && !out.closed) {
      this.toast('Two nodes cannot close a loop, so the road is open now.');
    }
  }

  /*
   * A click with the vehicle armed: a car on the nearest road within reach,
   * at the nearest point of its centre line, facing the way the side of a
   * two lane loop that was clicked drives. `slack` is metres past the
   * road's own edge.
   */
  dropVehicle(world, slack) {
    const snap = snapToRoad(this.doc, world.x, world.y, slack);
    if (!snap) {
      const roads = this.doc.elements.some((e) => kindOf(e) === KIND.ROAD);
      this.toast(roads
        ? 'A vehicle goes on a road: click on one, or close beside it.'
        : 'A vehicle drives a road, and this map has none yet. Lay one with the Road tool first.');
      return;
    }
    let newId = null;
    this.edit('place Vehicle', (d) => {
      const el = createElement(d, 'vehicle', { x: 0, y: 0 });
      el.road = snap.road;
      el.dims.offset = snap.offset;
      el.reverse = snap.twoLaneLoop && snap.right;
      d.elements.push(el);
      newId = el.id;
    });
    if (newId) {
      this.setSelection([newId]);
    }
  }

  /*
   * A vehicle dragged: slid along its own road, to the point of it nearest
   * the pointer. A vehicle with no road is put on the nearest one within
   * reach, which is how one left behind by a deleted road is put back.
   */
  slideVehicle(id, world, slack) {
    const el = elementById(this.doc, id);
    if (!el) {
      return;
    }
    const road = elementById(this.doc, el.road);
    const own = road && kindOf(road) === KIND.ROAD;
    const snap = own
      ? snapToRoad(this.doc, world.x, world.y, Infinity, road.id)
      : snapToRoad(this.doc, world.x, world.y, slack);
    if (!snap) {
      return;
    }
    if (!own) {
      el.road = snap.road;
      el.reverse = snap.twoLaneLoop && snap.right;
    }
    el.dims.offset = snap.offset;
    this.requestDraw();
    this.panels.renderInspector();
  }

  /*
   * WHERE A POINT LANDS: on the grid, and on a whoop canvas near what the rules
   * say a piece should be beside, which `ctx` says what is being put down or
   * pulled ({ type, ignore }): see magnetFor in snap.js. Alt (`offGrid`) is off
   * grid and off magnets. What the magnets found, to be drawn as guides, is
   * `this.guides`, and it is what the last call with a `ctx` found.
   */
  snap(world, offGrid, ctx = null) {
    this.guides = [];
    let base;
    if (offGrid) {
      base = { x: world.x, y: world.y, z: 0 };
    } else {
      const g = this.doc.field.gridSize;
      base = { x: Math.round(world.x / g) * g, y: Math.round(world.y / g) * g, z: 0 };
    }
    if (!ctx || !this.isWhoopRace()) {
      return base;
    }
    const m = magnetFor(this.doc, base, { type: ctx.type, ignore: ctx.ignore, off: offGrid });
    this.guides = m.guides;
    return { x: m.x, y: m.y, z: 0 };
  }

  placeAt(world) {
    const type = this.armed;
    if (!type) {
      return;
    }
    /* The whoop canvas's two tools that are not pieces. A click with the row
     * tool lays a pair; the ruler places nothing. */
    if (type === 'row') {
      this.placeRow(world, world);
      return;
    }
    if (type === 'ruler') {
      return;
    }
    if (type === 'cube') {
      this.placeCubeAt(world);
      return;
    }
    const def = ELEMENTS[type];
    const freestyle = docModeOf(this.doc) === 'freestyle';

    /* Exactly one set of start pads per track. A second press moves the
     * existing set rather than refusing, because refusing would look like a
     * broken hotkey. */
    if (def.kind === KIND.START) {
      const existing = startPadsOf(this.doc);
      if (existing) {
        this.edit('move start pads', (d) => {
          const e = elementById(d, existing.id);
          e.position.x = world.x;
          e.position.y = world.y;
        });
        this.setSelection([existing.id]);
        this.toast(freestyle
          ? 'A map has one set of start pads, where the pilot starts, so this moved the ones you had.'
          : 'A track has one set of start pads, so this moved the ones you had.');
        return;
      }
    }

    /*
     * ON A MAP, NOTHING JOINS A FLYING ORDER, because there is none: a gate
     * on a map is furniture. And there is no course for a new element to
     * face along, so it faces the way the author last turned one of its
     * kind, or east.
     */
    if (freestyle) {
      let newId = null;
      this.edit(`place ${def.label}`, (d) => {
        const yaw = def.kind === KIND.ANNOTATION ? 0 : this.newYawFor(type);
        const element = createElement(d, type, world, yaw);
        if (def.kind === KIND.DECAL && this.armedLogoId
          && logosOf(d).some((l) => l.id === this.armedLogoId)) {
          element.logoId = this.armedLogoId;
        }
        d.elements.push(element);
        newId = element.id;
      });
      if (newId) {
        this.setSelection([newId]);
      }
      return;
    }

    let newId = null;
    this.edit(`place ${def.label}`, (d) => {
      /* The rule for where it faces, the flying order it joins and the figure
       * a stack is flown in are one function in snap.js, so the self test
       * runs the same code this does. */
      const element = placeOnTrack(d, type, world);
      /* The logo the Sponsor logos dialog armed this with, if it armed it.
       * createElement has already put the course's first logo on a decal, so
       * this only overrides, and only for a logo that is still on the
       * course: removing one between arming and clicking is a real order of
       * events and it must not write a dangling id. */
      if (def.kind === KIND.DECAL && this.armedLogoId
        && logosOf(d).some((l) => l.id === this.armedLogoId)) {
        element.logoId = this.armedLogoId;
      }
      newId = element.id;
    });
    if (newId) {
      this.setSelection([newId]);
      const placed = elementById(this.doc, newId);
      if (placed && aperturesOf(placed).length > 1) {
        if (!this.pathVisible) {
          this.togglePath();
        }
        this.toast(`Each hole is its own gate. This stack is a spiral up: bottom, wrap around, then the top. Change it under ${this.panels.say('How it is flown')}.`);
      }
    }
  }

  /*
   * A CUBE, from the tool: five gates in one group, laid where the faces of a cube are and flown straight
   * through, in at the back and out at the front, one undo step, and what is selected after (all of it, as a
   * group is). The heading is the one a gate would be given here, so the cube faces along the line as a gate
   * does. The rule is placeCube in snap.js.
   */
  placeCubeAt(world) {
    if (!this.isWhoopRace()) {
      return;
    }
    const yaw = placementFor(this.doc, world, 'gate').yaw;
    let made = null;
    this.edit('place a cube', (d) => { made = placeCube(d, world, { yaw }); });
    if (made) {
      this.setSelection(made.ids);
    }
  }

  /*
   * A ROW OF GATES, from where a drag began to where it ended: two or three
   * ordinary gates 30 in apart, one undo step, and what is selected after. The
   * rule is layRow in snap.js.
   */
  /* Replace with: what is selected becomes another piece of its own kind, in place,
   * as one undo step (snap.js replaceWith says what stays and what does not). */
  replaceSelection(type) {
    if (!this.isWhoopRace() || !this.selection.size) {
      return;
    }
    const ids = [...this.selection];
    this.edit(`replace with ${labelOf(type, 'micro').toLowerCase()}`, (d) => { replaceWith(d, ids, type); });
  }

  placeRow(a, b) {
    if (!this.isWhoopRace()) {
      return;
    }
    let ids = [];
    this.edit(`place a row of ${rowPlan(this.doc, a, b).count} gates`, (d) => { ids = layRow(d, a, b); });
    if (ids.length) {
      this.setSelection(ids);
    }
  }

  moveSelected(origin, delta) {
    for (const [id, from] of origin) {
      const element = elementById(this.doc, id);
      /* A vehicle is wherever its road puts it: it goes with its road, or
       * slides along it, and has no position of its own to move. */
      if (element && kindOf(element) !== KIND.VEHICLE) {
        element.position.x = from.x + delta.x;
        element.position.y = from.y + delta.y;
      }
    }
    applyAutoFaces(this.doc);
    this.rebuildPathForDrag();
    this.requestDraw();
    this.panels.renderInspector();
  }

  /*
   * ON EVERY STEP OF A DRAG ON A TRACK, not only while the line is shown: a
   * marker's square is drawn off the line's own knot (markerSquare in
   * path.js), so a stale line is a square left behind by the drag. Measured
   * on the heaviest shipped track, the line and its warnings are 7 ms; a
   * room is under 2. A map has no line, and its report is a placement of
   * every solid, so a map keeps the rule it had.
   */
  rebuildPathForDrag() {
    if (this.pathVisible || docModeOf(this.doc) !== 'freestyle') {
      this.rebuildPath();
    }
  }

  rotateSelected(yaw, leadId = null) {
    /* A group turns as one piece, about its own middle: by as much as the piece under the ring has been turned
     * to, so every face goes round with it. */
    const lead = leadId ? elementById(this.doc, leadId) : null;
    const grouped = [...this.selection].filter((id) => elementById(this.doc, id)?.group);
    if (grouped.length && lead && lead.group) {
      turnGroups(this.doc, grouped, wrapAngle(yaw - lead.yaw));
    }
    for (const id of this.selection) {
      if (elementById(this.doc, id)?.group) {
        continue;
      }
      /* setYaw, not the two fields by hand: turning a gate has to pin which
       * way its passes are flown as well as which way it points, or the
       * auto rule takes the direction back the moment the drag ends. */
      setYaw(this.doc, id, yaw);
      this.rememberYaw(elementById(this.doc, id));
    }
    /* A turned marker's square swings with the line's knot, so the knot has
     * to move with the handle: see rebuildPathForDrag. */
    this.rebuildPathForDrag();
    this.requestDraw();
    this.panels.renderInspector();
  }

  /* The one edit the 3D view is allowed to make. A built thing on a track
   * stands on the ground and has no height to change (seat.js), so a
   * selection that holds one leaves it where it is and moves the rest. What
   * is let go over nothing on a map is set down by settle() on release. */
  raiseSelected(origin, dz, fine) {
    for (const [id, fromZ] of origin) {
      const element = elementById(this.doc, id);
      if (!element || this.isGrounded(element)) {
        continue;
      }
      const wanted = Math.max(0, fromZ + dz);
      element.position.z = fine ? wanted : Math.round(wanted * 4) / 4;
    }
    applyAutoFaces(this.doc);
    this.rebuildPathForDrag();
    this.view3d.markDirty();
    this.requestDraw();
    this.panels.renderInspector();
  }

  deleteSelection() {
    if (!this.selection.size) {
      return;
    }
    const ids = [...this.selection];
    /* A road's cars are not deleted with it: they keep the road they named
     * and stay parked until they are put on another, as normalize keeps
     * them, and the warnings say so. Said here too, once, as it happens. */
    const gone = new Set(ids);
    const stranded = this.doc.elements.filter((e) => kindOf(e) === KIND.VEHICLE && !gone.has(e.id)
      && gone.has(e.road) && kindOf(elementById(this.doc, e.road)) === KIND.ROAD);
    this.edit(`delete ${ids.length}`, (d) => {
      for (const id of ids) {
        removeElement(d, id);
      }
    });
    this.selection.clear();
    this.activeNode = null;
    this.panels.renderAll();
    if (stranded.length) {
      this.toast(`${stranded.length === 1 ? 'A vehicle was' : `${stranded.length} vehicles were`} on that road, and ${stranded.length === 1 ? 'it is' : 'they are'} parked now with no road, in the row along the south edge of the plot. Drag ${stranded.length === 1 ? 'it' : 'each'} onto a road, or delete ${stranded.length === 1 ? 'it' : 'them'}.`);
    }
  }

  /* ---------------- the whoop canvas, in the room ---------------- */

  /* A RaceGOW track, as opposed to a five inch one or a map. What the room
   * builds with, and what the numbers, the ring and the quarter turns are for. */
  isWhoopRace(doc = this.doc) {
    return trackClassOf(doc) === 'micro' && docModeOf(doc) !== 'freestyle';
  }

  /*
   * COPY WHAT IS SELECTED, beside it (Control D). One undo step, and the
   * copies are what is selected afterwards, so a second press copies the copy
   * one gate further on.
   */
  copySelection() {
    if (!this.selection.size || !this.isWhoopRace()) {
      return;
    }
    let made = [];
    this.edit('copy', (d) => { made = copyElements(d, [...this.selection]); });
    if (made.length) {
      this.setSelection(made);
    }
  }

  /*
   * THE DIRECTION AN ARROW KEY MOVES, on the floor. In the plan the arrows are
   * the compass. In the room they are the camera's: up is away from it, to the
   * nearest of the four axes, because an arrow that moves a gate to the left
   * of a screen it is looking at the other way round from is a wrong key.
   */
  arrowAxis(name) {
    const north = { x: 0, y: 1 };
    const east = { x: 1, y: 0 };
    let fwd = north;
    if (this.mode === '3d' && this.view3d.camera) {
      const f = this.view3d.floorForward();
      fwd = Math.abs(f.x) >= Math.abs(f.y) ? { x: Math.sign(f.x) || 1, y: 0 } : { x: 0, y: Math.sign(f.y) || 1 };
    }
    const right = { x: fwd.y, y: -fwd.x };
    if (name === 'up') {
      return fwd;
    }
    if (name === 'down') {
      return { x: -fwd.x, y: -fwd.y };
    }
    return name === 'right' ? right : { x: -right.x, y: -right.y };
  }

  /* A step of an arrow key: one grid square, or six inches with Shift. One
   * undo step for each press, which is how many presses it was. */
  nudgeSelection(name, big = false) {
    const ids = [...this.selection].filter((id) => {
      const e = elementById(this.doc, id);
      return e && ![KIND.VEHICLE, KIND.ROAD].includes(kindOf(e));
    });
    if (!ids.length) {
      return;
    }
    const dir = this.arrowAxis(name);
    const step = big ? 6 * 0.0254 : this.doc.field.gridSize;
    const round6 = (v) => Math.round(v * 1e6) / 1e6;
    this.edit('nudge', (d) => {
      for (const id of ids) {
        const e = elementById(d, id);
        e.position.x = round6(e.position.x + dir.x * step);
        e.position.y = round6(e.position.y + dir.y * step);
      }
    });
  }

  /* The number on a gate, typed in: move that pass to that place. */
  renumber(seqId, place) {
    this.edit('renumber', (d) => { moveToPlace(d, seqId, place); });
  }

  /*
   * THE DRAWER: the inspector, the flying order and the results, which a whoop
   * canvas, and every canvas on a phone, keeps out of the drawing's way and
   * opens when asked (the lap bar's Flying order, the card's More, the bar's
   * Details on a phone). CSS does the sliding; this is the state.
   *
   * IT CLOSES THE WAYS EVERYTHING ELSE DOES (MENUS-PLAN.md 1.18). It could not
   * be closed once open: it covered its own only toggle, it had no close
   * button, and Escape went past it to the selection. Now it has its own close
   * button, Escape closes it before anything else that is not a dialog, the
   * room's overlays move out of its way while it is open so the toggle is
   * never under it, and it sits under the dialogs rather than over them.
   *
   * `from` is the control that opened it, which gets the keyboard back when it
   * closes; a keyboard that opened it is put on its close button.
   */
  toggleDrawer(open = null, { from = null, keys = false } = {}) {
    const next = open == null ? !this.drawerOpen : open;
    if (next === this.drawerOpen) {
      return;
    }
    this.drawerOpen = next;
    document.body.classList.toggle('tb-drawer', this.drawerOpen);
    this.detailsBtn?.setAttribute('aria-expanded', next ? 'true' : 'false');
    this.detailsBtn?.classList.toggle('on', next);
    const opener = from || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    /* The lap bar first, because its toggle is made again with the drawer's
     * state on it: the keyboard has to go to the new one, not to the one this
     * render is about to take out of the page. */
    this.panels.renderLapBar();
    if (next) {
      this.closeTools();
      this.drawerFrom = opener;
      if (keys) {
        document.getElementById('tb-side-x')?.focus({ preventScroll: true });
      }
    } else {
      const back = this.drawerFrom;
      this.drawerFrom = null;
      const side = document.getElementById('tb-side');
      if (side && side.contains(document.activeElement)) {
        /* The control that opened it, or the lap bar's toggle, which the
         * render above made again. */
        const toggle = back && back.isConnected ? back : document.querySelector('#tb-lapbar [data-drawer]');
        (toggle || document.body).focus?.({ preventScroll: true });
      }
    }
    /* The card keeps out from under it: see placeCard. */
    this.view3d.markDirty();
    this.requestDraw();
  }

  /* How many pixels of the stage the open drawer covers on its right, or 0:
   * what the card measures its room against. */
  drawerCover() {
    /* A phone's drawer is over the room, which it dims, and nothing makes
     * room for it. */
    if (!this.drawerOpen || !document.body.classList.contains('tb-whoop') || isPhone()) {
      return 0;
    }
    const side = document.getElementById('tb-side');
    const stage = this.nodes.canvas3d.parentElement;
    if (!side || !stage) {
      return 0;
    }
    /* Where the drawer comes to rest, not where its slide has got to. The
     * offsets are the layout's, which a transform does not move, so the card
     * of a gate already selected when the drawer opens (the card's own More)
     * moves clear of it on the first frame. Measured on screen, mid slide, it
     * was placed for a drawer still off the edge and stayed under it. */
    if (side.offsetParent && side.offsetParent === stage.offsetParent) {
      return Math.max(0, stage.offsetLeft + stage.offsetWidth - side.offsetLeft);
    }
    const s = side.getBoundingClientRect();
    const r = stage.getBoundingClientRect();
    return Math.max(0, r.right - s.left);
  }

  /* The palette drawer of a phone, and its button on the bar. `keys` is a
   * drawer opened from the keyboard, which takes the keyboard to its close
   * button; closed with the keyboard inside, the keyboard goes back to Tools. */
  toggleTools(open = null, { keys = false } = {}) {
    const was = document.body.classList.contains('tb-tools');
    const next = open == null ? !was : open;
    if (next === was) {
      return;
    }
    if (next) {
      this.toggleDrawer(false);
      this.closeMore();
    }
    document.body.classList.toggle('tb-tools', next);
    this.toolsBtn?.setAttribute('aria-expanded', next ? 'true' : 'false');
    this.toolsBtn?.classList.toggle('on', next);
    const palette = document.getElementById('tb-palette');
    if (next && keys) {
      palette?.querySelector('.tb-tools-x')?.focus();
    } else if (!next && palette && palette.contains(document.activeElement)) {
      this.toolsBtn?.focus();
    }
  }

  /*
   * A PHONE'S TOOLS BUTTON SAYS WHAT IS IN HAND. On a bigger screen the armed
   * tool is lit on the palette beside the drawing. On a phone the palette is a
   * drawer that closes the moment a tool is picked, and each tap on the
   * drawing then places another with nothing on the screen to say why, so the
   * button the palette opens from carries the tool's name, lit, until the
   * tool is put away there. renderPalette calls this; on a bigger screen the
   * button is not shown.
   */
  syncToolsBtn() {
    const b = this.toolsBtn;
    if (!b) {
      return;
    }
    const lit = this.armed ? document.querySelector('#tb-palette .tb-tool[aria-pressed="true"] .tb-tool-label') : null;
    const name = lit ? lit.textContent.trim() : '';
    if (b.textContent !== (name || 'Tools')) {
      b.textContent = name || 'Tools';
    }
    b.classList.toggle('tb-in-hand', Boolean(name));
    b.title = name
      ? `${name} is in hand: tap where it goes. Open the palette here and tap ${name} again to put it away`
      : 'The palette: pick a piece, then tap where it goes';
  }

  closeTools() {
    if (document.body.classList.contains('tb-tools')) {
      this.toggleTools(false);
      return true;
    }
    return false;
  }

  /* Whether the racing line can be grabbed and bent in the room. See bendLine. */
  toggleBendLine() {
    this.bendLine = !this.bendLine;
    if (this.bendLine && !this.pathVisible) {
      this.createPath();
    }
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
    if (this.bendLine) {
      this.toast('Drag the racing line to bend it: that drops a waypoint on it. Press Bend line again and a click on a gate is a click on the gate.');
    }
  }

  /* F: frame what is selected, close enough to work on. */
  frameSelection() {
    const c = this.selectionCentroid();
    if (!c) {
      return;
    }
    let reach = 0;
    for (const id of this.selection) {
      const e = elementById(this.doc, id);
      if (e) {
        reach = Math.max(reach, Math.hypot(e.position.x - c.x, e.position.y - c.y));
      }
    }
    this.view2d.centerOn(c);
    this.view3d.focusDoc(c, Math.max(1.4, reach * 3 + 1.2));
    this.requestDraw();
  }

  /* view3d.placeOverlay: float the card by what is selected. */
  placeCard(project, rect) {
    this.panels.placeCard(project, rect);
  }

  /*
   * THE CURSOR READOUT, in the canvas's one unit from the canvas's one origin
   * (MENUS-PLAN.md 4.2a): metres from the corner on a field or a plot, as the
   * rulers are, and on the whoop canvas inches from the middle of the room,
   * the card's way, with the millimetres in small print after them.
   */
  onHoverWorld(world) {
    const out = this.nodes.readout;
    if (!out || !world) {
      return;
    }
    if (!this.isWhoopRace()) {
      out.textContent = `${world.x.toFixed(2)}, ${world.y.toFixed(2)} m`;
      return;
    }
    const f = this.doc.field;
    const dx = world.x - f.width / 2;
    const dy = world.y - f.depth / 2;
    const inch = (m) => (m / 0.0254).toFixed(1);
    const small = document.createElement('small');
    small.textContent = `${Math.round(dx * 1000)}, ${Math.round(dy * 1000)} mm`;
    out.replaceChildren(`${inch(dx)}, ${inch(dy)} in `, small);
    out.title = 'From the middle of the room';
  }

  /*
   * THE HEADING A MARKER IS TURNED FROM.
   *
   * A flag, cone or pole nobody has turned sits its square on the outside of
   * the turn, and its own stored yaw is whatever it was placed with, which is
   * not where the square is. Turning it by hand makes the yaw the pass
   * direction (markerPassDir in faces.js), so a turn that started from the
   * stored yaw threw the square round the pole to wherever that yaw happened
   * to point: the first press of Q, or the first pull on the handle, and the
   * square jumped a quarter of the way round before it began to follow. So
   * until it is turned, a marker reports the way its square actually sits,
   * read off the racing line's knot, and the handle, Q and E and the
   * inspector all start from there.
   */
  shownYaw(el) {
    return passYawOf(this.doc, this.path, el);
  }

  /* ---------------- headings on a map ---------------- */

  /* The heading a new element of `type` is placed at on a map. */
  newYawFor(type) {
    return snapYaw(type, this.lastYaw.get(type) ?? 0, true);
  }

  rememberYaw(el) {
    if (el && docModeOf(this.doc) === 'freestyle') {
      this.lastYaw.set(el.type, el.yaw);
    }
  }

  /*
   * THE FIRST TIME AN AUTHOR TRIES TO TURN A BUILDING OFF THE COMPASS, say
   * why it will not go. Snapping silently looks like a broken handle, and a
   * refusal with no reason is the thing a tool should never do.
   */
  noteOffCompass(el) {
    if (this.compassSaid) {
      return;
    }
    this.compassSaid = true;
    /* A room's furniture is not a building: it is on the whoop canvas, and the
     * words about buildings and cranes are about a map. */
    if (el && isRoomType(el.type)) {
      this.toast('A table, a chair or a banner turns in quarter turns: it is made of boxes, and they stand square to the room.');
      return;
    }
    this.toast('Buildings, containers, bridges and the skate set keep to the compass for now: they turn in quarter turns until the physics learns turned boxes. Cranes, trees, masts and gates turn freely.');
  }

  /* The inspector's yaw field. A quarter asset snaps, and says so the first
   * time; everything else takes exactly what was typed, as it always has. */
  setElementYaw(id, yaw) {
    const el = elementById(this.doc, id);
    if (!el || !Number.isFinite(yaw)) {
      return;
    }
    let want = yaw;
    if (turnsOf(el.type) === 'quarter') {
      if (offCompass(wrapAngle(yaw)) > 1e-3) {
        this.noteOffCompass(el);
      }
      want = snapYaw(el.type, yaw);
    }
    this.edit('rotate', (d) => {
      setYaw(d, id, want);
    });
    this.rememberYaw(elementById(this.doc, id));
  }

  /* ---------------- faces and sequence ---------------- */

  flipFace(seqId) {
    this.edit('flip face', (d) => { flipFace(d, seqId); });
  }

  /* The keyboard shortcut works on whatever the selection's first sequence
   * entry is, which is what a user means by "flip that gate". */
  flipSelectedFace() {
    for (const id of this.selection) {
      const seq = this.doc.sequence.find((s) => s.elementId === id);
      if (seq) {
        this.flipFace(seq.id);
        return;
      }
    }
  }

  clearOverride(seqId) {
    this.edit('re-derive face', (d) => { clearOverride(d, seqId); });
  }

  addToSequence(elementId) {
    this.edit('add to the track', (d) => { addToSequence(d, elementId, 0); });
  }

  addLevel(elementId) {
    this.edit('fly another level', (d) => { addNextLevel(d, elementId); });
  }

  applyFigure(elementId, figureId) {
    this.edit(`fly ${figureId}`, (d) => { applyFigure(d, elementId, figureId); });
    if (figureId !== 'single' && !this.pathVisible) {
      this.togglePath();
    }
  }

  removeSequenceEntry(seqId) {
    this.edit('remove from the track', (d) => { removeFromSequence(d, seqId); });
  }

  setSequenceAperture(seqId, index) {
    this.edit('change level', (d) => { setApertureIndex(d, seqId, index); });
  }

  reorder(from, to) {
    this.edit('reorder', (d) => { moveInSequence(d, from, to); });
  }

  /* ---------------- path ---------------- */

  createPath() {
    /* A map has no racing line to paint. */
    if (docModeOf(this.doc) === 'freestyle') {
      return;
    }
    this.pathVisible = true;
    this.rebuildPath();
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
  }

  togglePath() {
    if (docModeOf(this.doc) === 'freestyle') {
      return;
    }
    if (!this.pathVisible) {
      this.createPath();
      return;
    }
    /* renderAll and updateTopBar, the same pair createPath calls. Only the
     * palette was refreshed, so the top bar's button stayed lit while the
     * line was gone. */
    /* The path stays derived. Only the paint goes away, so the Results
     * panel keeps reporting on the course either way. */
    this.pathVisible = false;
    this.panels.renderAll();
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
  }

  /*
   * The flying-order numbers on the gates. They sit on the opening, which
   * is where the racing line passes, so a dense room is a field of chips
   * with the line hiding behind them. Off, the numbers go and the line,
   * the gates and the sequence list stay. The list is where the order is
   * read while the canvas is clear.
   */
  toggleLabels() {
    this.labelsVisible = !this.labelsVisible;
    this.updateTopBar();
    this.view3d.markDirty();
    this.requestDraw();
  }

  /* ---------------- views ---------------- */

  setMode(mode) {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    /* Roads are laid on the plan. */
    this.roadDraft = null;
    /* A tool cannot place in the five inch or map preview, so it is put away
     * on the way in rather than left lit over a view where it does nothing
     * (pickTool). */
    if (this.previewing() && this.armed) {
      this.disarm();
    }
    this.nodes.canvas2d.hidden = mode !== '2d';
    this.nodes.canvas3d.hidden = mode !== '3d';
    /* Three.js arrives on the first press of the 3D button, so this settles
     * later and can fail. The 2D view carries on either way; see the header
     * of view3d.js for why the preview is not allowed to be load bearing. */
    this.view3d.setEnabled(mode === '3d').then((ok) => {
      if (!ok) {
        this.toast(`The 3D view could not load Three.js: ${this.view3d.loadError}. The 2D view is unaffected.`);
        this.setMode('2d');
      }
    });
    if (mode === '2d') {
      this.view2d.resize();
    }
    /* Selection survives the switch, and so does what the camera is looking
     * at. */
    const c = this.selectionCentroid();
    if (c) {
      this.focusSelection();
    }
    /* The five inch's empty state is for the plan, where a gate can be put. */
    this.panels.renderEmpty();
    this.updateTopBar();
    this.requestDraw();
  }

  /*
   * THE VIEWS. 2D and 3D on every canvas; on the whoop canvas 3D is where the
   * track is built and 2D is the canvas this tool has always had, one press
   * away, and the fall back when Three.js does not arrive. Top is a camera of
   * the 3D view: the same room from straight above, for measuring, and not a
   * second editor. showRoom and showPlan are 3D at the angle and from the top.
   */
  showRoom() {
    this.show3d();
    this.view3d.setPlanCamera(false);
    this.updateTopBar();
    this.requestDraw();
  }

  showPlan() {
    this.show3d();
    this.view3d.setPlanCamera(true);
    this.updateTopBar();
    this.requestDraw();
  }

  show3d() {
    this.viewChosen = true;
    this.autoRoom = false;
    this.setMode('3d');
  }

  show2d() {
    this.viewChosen = true;
    this.autoRoom = false;
    this.setMode('2d');
  }

  /* Top, beside Fit: straight down, and back to the angle there was. */
  toggleTop() {
    if (this.mode === '3d' && this.view3d.isPlan()) {
      this.showRoom();
    } else {
      this.showPlan();
    }
  }

  /* V: 2D and 3D, on every canvas. It went between the room and its plan
   * camera on the whoop canvas and between 2D and 3D on the others, so one key
   * meant two things a canvas apart. */
  toggleView() {
    if (this.mode === '2d') {
      this.show3d();
    } else {
      this.show2d();
    }
  }

  /*
   * A WHOOP CANVAS OPENS IN THE ROOM, once the room is ready. Three.js is
   * fetched the moment the canvas opens and the plan is what shows until it
   * arrives, so a slow or blocked CDN leaves the tool on the plan it always
   * had (view3d.js says why the preview must never be load bearing). The
   * author's own choice of view is never overruled, and leaving for another
   * canvas puts back what that canvas has always opened on.
   */
  syncViewToCanvas() {
    if (this.isWhoopRace()) {
      if (this.mode === '2d' && !this.viewChosen && !this.roomPending) {
        this.roomPending = true;
        this.view3d.preload().then((ok) => {
          this.roomPending = false;
          if (ok && this.isWhoopRace() && this.mode === '2d' && !this.viewChosen) {
            this.autoRoom = true;
            this.setMode('3d');
          }
        });
      }
    } else if (this.autoRoom) {
      this.autoRoom = false;
      this.setMode('2d');
    }
  }

  frameAll() {
    if (this.mode === '2d') {
      this.view2d.frameTrack();
    } else {
      this.view3d.frameTrack();
    }
    this.requestDraw();
  }

  /* ---------------- documents ---------------- */

  /* The document `doc` would replace: the one on screen when the two are
   * the same kind of canvas, otherwise what that canvas's seat holds, or
   * null when it holds nothing. */
  seatedFor(doc) {
    if (canvasOf(doc) === canvasOf(this.doc)) {
      return this.doc;
    }
    const held = readAutosave(trackClassOf(doc), docModeOf(doc));
    return held && held.doc ? held.doc : null;
  }

  /*
   * A confirm's title and body for replacing `seated`. On screen, the words
   * the caller always had. Off screen, the seat is named, because the
   * author cannot see it, and what keepSeat will do with it is said.
   */
  replaceWords(seated, incoming, what, onScreen) {
    if (seated === this.doc) {
      return onScreen;
    }
    const where = CANVAS_NAMES[canvasOf(incoming)];
    return [
      `Replace "${seated.name}" on the ${where} canvas?`,
      `${what} opens on the ${where} canvas in its place. ${trackExists(seated.id)
        ? 'The copy saved in Load stays, and any changes made since it was saved go into Load beside it.'
        : `"${seated.name}" goes into Load first, so it is not lost.`}`,
    ];
  }

  /*
   * A DOCUMENT OF ANOTHER CANVAS REPLACES WHAT THAT CANVAS HELD, out of
   * sight. Importing a map on a race track, a ?track= link to one, a room
   * imported on the five inch, or a copy of a board track opened while the
   * map was up, each wrote over a seat the author could not see. What was
   * there goes into the library first, by keepDisplaced in ./storage.js,
   * the rule seatLocal in src/ui/ui.js applies when the simulator seats a
   * track: as itself when Load does not have it, as a copy beside the
   * saved one when it was edited after its last Save, and not at all when
   * Load has it as it is. The toast says where it went. The toggle hands
   * over the seat's own document, the same id, so it never saves anything
   * here. Returns { ok, said }: ok is false when the seat needed keeping
   * and could not be kept, and then nothing may replace it.
   */
  keepSeat(doc) {
    const seated = this.seatedFor(doc);
    if (isEmptyCanvas(seated) || seated.id === doc.id) {
      return { ok: true, said: '' };
    }
    const where = CANVAS_NAMES[canvasOf(doc)];
    const kept = keepDisplaced(seated);
    if (!kept.ok) {
      return {
        ok: false,
        said: `Nothing was opened: "${seated.name}" is on the ${where} canvas and could not be kept, because local storage is unavailable or full. Export it first.`,
      };
    }
    if (!kept.saved) {
      return { ok: true, said: '' };
    }
    return {
      ok: true,
      said: kept.saved === seated
        ? `"${seated.name}" was on the ${where} canvas, so it is in Load now.`
        : `"${seated.name}" on the ${where} canvas had changes made after it was saved, so they are in Load as "${kept.saved.name}".`,
    };
  }

  /*
   * A DOCUMENT THAT ARRIVES FROM OUTSIDE, a file that was imported or a
   * ?track= link, TAKES THE CANVAS, AND WHAT IT TAKES IT FROM IS KEPT.
   *
   * Both used to replace whatever was on the canvas with nothing said, and
   * neither can be undone, because a new document starts its own history. The
   * documented rule for a link is that it opens that track, so asking first
   * would contradict it; keeping what it displaces honours it and loses
   * nothing. What was on the canvas goes into Load by the rule the other
   * canvases already use (keepSeat), the toast says where it went, and when
   * the same track comes back with less than the canvas holds, the canvas's
   * version is kept beside it as a copy. Nothing is kept for an empty canvas.
   * Returns whether the document opened; when what it would replace could not
   * be kept, nothing is replaced.
   */
  openIncoming(doc, message) {
    const seated = this.seatedFor(doc);
    let keep = this.keepSeat(doc);
    if (keep.ok && !keep.said && !isEmptyCanvas(seated) && seated.id === doc.id && localDrift(seated, doc)) {
      /* The same track with changes the incoming one does not have: keepSeat
       * leaves a document of the same id alone, and here that would lose them. */
      const kept = keepDisplaced(seated);
      keep = kept.ok
        ? { ok: true, said: kept.saved ? `"${seated.name}" had changes made after it was saved, so they are in Load as "${kept.saved.name}".` : '' }
        : { ok: false, said: `Nothing was opened: "${seated.name}" has changes the incoming track does not, and they could not be kept, because local storage is unavailable or full. Export it first.` };
    }
    if (!keep.ok) {
      this.toast(keep.said);
      return false;
    }
    /* Another canvas's keep is said by loadDocument, which is handed it; on
     * the same canvas loadDocument does not look, so it is said here. */
    const sameCanvas = canvasOf(doc) === canvasOf(this.doc);
    return this.loadDocument(doc, sameCanvas ? [message, keep.said].filter(Boolean).join(' ') : message, keep);
  }

  loadDocument(doc, message, keep = null) {
    /* A document of another canvas moves the author to that canvas, so the
     * one being left is written to its own seat first, the same as the
     * toggle does: importing a race track onto a map must not drop the
     * map's last few seconds of edits. Then whatever the other canvas held
     * is kept, see keepSeat, or was already by a caller that had to know
     * first and hands the answer in as `keep`. If it could not be kept,
     * nothing changes: the screen, both seats and the canvas stay as they
     * were, and the author is told. Returns whether the document opened. */
    let kept = '';
    if (canvasOf(doc) !== canvasOf(this.doc)) {
      this.autosaver.flush();
      const k = keep ?? this.keepSeat(doc);
      if (!k.ok) {
        this.toast(k.said);
        return false;
      }
      kept = k.said;
    }
    this.doc = doc;
    /* An open drawer was about the document that just left, and the readout
     * was in its canvas's unit. */
    this.toggleDrawer(false);
    if (this.nodes.readout) {
      this.nodes.readout.textContent = '';
    }
    /* The palette is the track class's, so it is rebuilt whenever a document
     * arrives rather than once at boot. A RaceGOW room and a sixty metre
     * field are not made of the same parts, and a map is made of neither. */
    this.panels.buildPalette(trackClassOf(this.doc), docModeOf(this.doc));
    /* Loading a document is choosing its canvas, so the builder reopens on
     * it next time. */
    rememberCanvas(canvasOf(this.doc));
    /*
     * THE DOCUMENT GOVERNS THE CLASS, not only the toggle. A room opened from
     * the library, from a board link or as a remix on a five inch builder
     * drew the whoop palette and filed its autosave in the whoop seat, but
     * left the shell seated on the five inch, so Fly this track opened a
     * simulator reading the five inch's seat and the room was not in it.
     * Loading a document of the other class IS choosing that class.
     */
    setActiveTrackClass(trackClassOf(this.doc));
    upgradeStackedFigures(this.doc);
    /* A course that arrives with something hanging in the air (a Velocidrone
     * rooftop the field has not got, a map made before this rule) is put
     * right here and told so, before faces are derived off its heights. */
    const seated = this.seat();
    applyAutoFaces(this.doc);
    this.selection.clear();
    this.passPinned = null;
    this.passHover = null;
    this.activeNode = null;
    this.roadDraft = null;
    this.pickedSide = null;
    this.history.reset();
    this.path = null;
    this.warnings = [];
    this.pathVisible = this.isWhoopRace();
    this.bendLine = false;
    writeAutosave(this.doc);
    this.view2d.frameTrack();
    this.view3d.frameTrack();
    this.view3d.markDirty();
    this.refresh();
    this.syncViewToCanvas();
    const said = [message, kept, seated].filter(Boolean).join(' ');
    if (said) {
      this.toast(said);
    }
    return true;
  }

  /*
   * A BLANK CANVAS, ASKED FOR BY THE SIMULATOR. Its Tracks room has a Build a
   * track card (MENUS-PLAN.md 2.4), which writes a 'new' intent and opens this
   * page on ?mode=race, and a press on it landed on whatever track was last on
   * the canvas, which is not what the card says. So it starts a blank one of
   * the address's canvas, as New does.
   *
   * New asks first, because it is pressed here, over the work. This was asked
   * for on the page before, so it does not ask again: what was on the canvas
   * goes into Load first, by the rule every other replacement here keeps
   * (keepDisplaced in ./storage.js), and the toast says where. When it could
   * not be kept nothing changes, and the toast says that instead. Returns
   * whether the blank canvas opened.
   */
  startBlank() {
    const map = docModeOf(this.doc) === 'freestyle';
    const fresh = map ? newMap() : createTrack(undefined, newTrackClass());
    const seated = this.seatedFor(fresh);
    let said = '';
    if (!isEmptyCanvas(seated)) {
      const kept = keepDisplaced(seated);
      if (!kept.ok) {
        this.toast(`"${seated.name}" is still on the canvas: it could not be kept in Load, because local storage is unavailable or full, so nothing new was started. Export it from More first, then press New.`);
        return false;
      }
      said = kept.saved && kept.saved !== seated
        ? `"${seated.name}" had changes made after it was saved, so they are in Load as "${kept.saved.name}".`
        : `"${seated.name}" is in Load.`;
    }
    /* Kept already, so loadDocument is told so rather than keeping it twice. */
    return this.loadDocument(fresh, [map ? 'New map, on a 160 metre plot.' : 'New track.', said].filter(Boolean).join(' '), { ok: true, said: '' });
  }

  newTrack() {
    if (docModeOf(this.doc) === 'freestyle') {
      this.confirm('Start a new map?', 'Anything unsaved in the current one is gone.', () => {
        this.loadDocument(newMap(), 'New map, on a 160 metre plot.');
      });
      return;
    }
    this.confirm('Start a new track?', 'Anything unsaved in the current one is gone.', () => {
      this.loadDocument(createTrack(undefined, newTrackClass()), 'New track.');
    });
  }

  save() {
    /* Asked before the save, which is what makes the library non-empty. */
    const first = !savedOnce();
    const ok = saveTrack(this.doc);
    /* The first save in this browser folds the storage notice away: the toast
     * says where the work went, once, and the line beside Save says it after. */
    if (ok) {
      markSavedOnce();
    }
    this.toast(ok
      ? `Saved "${this.doc.name}"${first ? ' in this browser. It is in Load from now on' : ''}.`
      : `Could not save. Local storage is unavailable, so use Export in More instead.`);
    this.updateTopBar();
  }

  duplicate() {
    const copy = duplicateTrack(this.doc);
    saveTrack(copy);
    this.loadDocument(copy, `Duplicated as "${copy.name}".`);
  }

  /* The bar's Delete. Named apart from removeCurrent so the confirm cannot
   * be skipped by a caller reaching for the shorter name. */
  confirmRemove() {
    this.removeCurrent();
  }

  /*
   * THE MORE MENU, as a menu: More says whether it is open, the arrows walk
   * its items, and Escape closes it and gives the keyboard back to More
   * (MENUS-PLAN.md 1.19). It closed on a mousedown elsewhere or on its own
   * items and on nothing a keyboard could press. `keys` is a menu opened by
   * the keyboard, which puts the keyboard on its first item.
   */
  toggleMore(keys = false) {
    if (!this.moreMenu) {
      return;
    }
    if (!this.moreMenu.hidden) {
      this.closeMore(keys);
      return;
    }
    this.moreMenu.hidden = false;
    this.moreBtn.classList.add('on');
    this.moreBtn.setAttribute('aria-expanded', 'true');
    if (keys) {
      this.moreItemsShown()[0]?.focus();
    }
  }

  /* `refocus` puts the keyboard back on More, which is where Escape and a
   * keyboard's second press of More leave it. */
  closeMore(refocus = false) {
    if (!this.moreMenu || this.moreMenu.hidden) {
      return false;
    }
    this.moreMenu.hidden = true;
    this.moreBtn.classList.remove('on');
    this.moreBtn.setAttribute('aria-expanded', 'false');
    if (refocus) {
      this.moreBtn.focus();
    }
    return true;
  }

  /* The items a pointer or a keyboard can reach in More right now. */
  moreItemsShown() {
    return [...this.moreMenu.querySelectorAll('.tb-more-item, a.patreon')]
      .filter((n) => n.getClientRects().length > 0 && !n.disabled);
  }

  removeCurrent() {
    this.confirm(`Delete "${this.doc.name}"?`, 'It is removed from the saved list. This cannot be undone.', () => {
      deleteTrack(this.doc.id);
      this.loadDocument(docModeOf(this.doc) === 'freestyle' ? newMap() : createTrack(undefined, newTrackClass()), 'Deleted.');
    });
  }

  /*
   * LOAD: this canvas's saved documents, then the ones shipped for it.
   *
   * What each row says, and what changed (MENUS-PLAN.md 1.21). A row says what
   * kind of document it is, and when it last changed the way a person says it
   * ("2 days ago", the exact date in its title) rather than as a raw ISO
   * stamp. The five inch canvas lists five inch tracks and the whoop canvas
   * whoop tracks, as maps were already apart: opening the other kind moved the
   * author to the other canvas and seated the other aircraft, which is a switch
   * nobody asked Load for. The list says how many of the other kind there are
   * and where they are. And Delete takes a row out at once and leaves an Undo
   * in its place, where it removed a document on one click with nothing to say
   * it had.
   */
  openLoad() {
    const map = docModeOf(this.doc) === 'freestyle';
    const canvas = canvasOf(this.doc);
    const w = wordsFor(this.doc);
    const { rows: tracks, others } = rowsForCanvas(listTracks(trackClassOf(this.doc), docModeOf(this.doc)), canvas);
    const body = document.createElement('div');
    const now = Date.now();
    if (!tracks.some((t) => !t.preset)) {
      const p = document.createElement('p');
      p.className = 'tb-help';
      p.textContent = `No ${w.kind.toLowerCase()}s saved in this browser yet. Save the one on the canvas, or import a .json file from More.${tracks.length ? ' The ones below ship with the Builder: open one to start from it.' : ''}`;
      body.append(p);
    }
    for (const t of tracks) {
      const row = document.createElement('div');
      row.className = 'tb-load-row';
      const name = document.createElement('div');
      name.className = 'tb-load-name';
      const title = document.createElement('div');
      title.className = 'tb-load-title';
      title.textContent = t.name;
      title.title = t.name;
      name.append(title);
      const meta = document.createElement('div');
      meta.className = 'tb-load-meta';
      const kind = document.createElement('span');
      kind.className = 'tb-load-kind';
      kind.textContent = w.kind;
      const bits = [t.mix];
      if (!map) {
        bits.push(`${t.sequence} in the order`);
      }
      if (t.preset) {
        /* The shipped yard is what Your map flies before a pilot has built
         * one; every other shipped row simply came with the Builder. */
        bits.push(t.id === STARTER_ID ? 'the yard Your map flies until you build one' : 'ships with the Builder');
      } else {
        const ago = changedAgo(t.modifiedUtc, now);
        if (ago) {
          const when = document.createElement('span');
          when.textContent = `changed ${ago}`;
          when.title = exactDate(t.modifiedUtc);
          meta.append(kind, document.createTextNode(` · ${bits.join(', ')} · `), when);
        }
      }
      if (!meta.childNodes.length) {
        meta.append(kind, document.createTextNode(` · ${bits.join(', ')}`));
      }
      name.append(meta);
      /*
       * WHOSE TRACK THIS IS, on the row.
       *
       * A pilot's own tracks carry no credit and get no byline. A track
       * that came from somewhere else does, and keeps it when the pilot
       * saves their own copy, because saving a layout does not make it
       * yours: the DESIGNER is named rather than the series or whoever
       * imported it, because those are three different people and only one
       * of them drew it. textContent, never innerHTML: a credit is data and
       * one day it may not be ours.
       */
      if (t.credit) {
        const by = document.createElement('div');
        by.className = 'tb-load-meta';
        const bits = [];
        if (t.credit.designer) bits.push(`by ${t.credit.designer}`);
        if (t.credit.series) bits.push(t.credit.series);
        if (t.credit.sponsor) bits.push(`sponsored by ${t.credit.sponsor}`);
        by.textContent = bits.join(', ');
        name.append(by);
      }
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'tb-btn';
      open.textContent = 'Open';
      open.addEventListener('click', () => {
        const found = loadTrack(t.id);
        this.closeModal();
        /* Through openIncoming, which keeps what the canvas held in Load
         * first: Open went straight to loadDocument, and on the same canvas
         * that wrote over work nobody had saved with nothing kept or said. */
        if (found) {
          this.openIncoming(found.doc, `Opened "${found.doc.name}".`);
        }
      });
      /* No Delete on a shipped track. There is nothing to delete: it is
       * not in the library until the pilot saves their own copy, and a
       * button that does nothing is worse than no button. */
      if (t.preset) {
        row.append(name, open);
      } else {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tb-btn tb-danger';
        del.textContent = 'Delete';
        del.title = `Delete "${t.name}" from this browser. Undo puts it back while this list is open.`;
        del.addEventListener('click', () => this.deleteFromLoad(t, row));
        row.append(name, open, del);
      }
      body.append(row);
    }
    /* Where the other race canvas's documents went, since this list no longer
     * shows them, and the one press that gets there. */
    if (others > 0 && !map) {
      const other = canvas === 'micro' ? 'full' : 'micro';
      const note = document.createElement('p');
      note.className = 'tb-help tb-load-others';
      note.append(`${others} ${CANVAS_WORDS[other].kind.toLowerCase()}${others === 1 ? '' : 's'} saved here ${others === 1 ? 'opens' : 'open'} on the ${CANVAS_WORDS[other].label} canvas. `);
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'tb-btn';
      go.textContent = `Show ${others === 1 ? 'it' : 'them'}`;
      go.addEventListener('click', () => {
        this.closeModal();
        this.setCanvas(other);
        this.openLoad();
      });
      note.append(go);
      body.append(note);
    }
    this.modal(map ? 'Saved maps' : `Saved ${w.kind.toLowerCase()}s`, body);
  }

  /*
   * START FROM A TRACK ON THE BOARD: the five inch canvas's way in from empty
   * (MENUS-PLAN.md 4.2b). The board's five inch tracks, most flown first, and
   * Open a copy on each, which opens it the way the board's Remix does: under
   * a new id and a remix's name, credited to where it came from, so Publish
   * puts up a new track and the original stays its builder's. Offline, or with
   * the board asleep, it says the board could not be reached and points at
   * Load, rather than showing an empty list that looks like a board with
   * nothing on it.
   */
  async openBoardStarters() {
    const body = document.createElement('div');
    const lede = document.createElement('p');
    lede.className = 'tb-help';
    lede.textContent = 'Five inch tracks other pilots have put on Tracks and times. Open one and it is your copy: change anything, and publish it under a name of your own. The original stays theirs.';
    const status = document.createElement('p');
    status.className = 'tb-help';
    status.setAttribute('role', 'status');
    status.textContent = 'Asking the board for its tracks.';
    const list = document.createElement('div');
    list.className = 'tb-load-list';
    body.append(lede, status, list);
    const shown = this.modal('Start from a track on the board', body);
    const origin = boardOrigin();
    /* Where the palette is: beside the drawing, or behind Tools on a phone. */
    const fromNothing = isPhone() ? 'Gate, in Tools, starts one from nothing.' : 'Gate on the left starts one from nothing.';
    let tracks = [];
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('This device is offline.');
      }
      tracks = (await fetchTrackList(origin)).filter((t) => t.trackClass === 'full');
    } catch (e) {
      if (!shown.box.isConnected) {
        return;
      }
      status.textContent = `The board could not be reached, so its tracks cannot be listed. ${e.message || ''} Your own tracks are in Load, and ${fromNothing}`.replace(/\s+/g, ' ');
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'tb-btn';
      again.textContent = 'Try again';
      again.addEventListener('click', () => this.openBoardStarters());
      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'tb-btn';
      load.textContent = 'Load';
      load.addEventListener('click', () => this.openLoad());
      const row = document.createElement('div');
      row.className = 'tb-row-btns';
      row.append(again, load);
      list.append(row);
      return;
    }
    /* The dialog may have been closed while the board answered. */
    if (!shown.box.isConnected) {
      return;
    }
    if (!tracks.length) {
      status.textContent = `The board has no five inch tracks yet. ${fromNothing}`;
      return;
    }
    status.textContent = `${tracks.length} five inch track${tracks.length === 1 ? '' : 's'}, most flown first.`;
    tracks.sort((a, b) => (b.times - a.times) || (b.gates - a.gates) || a.name.localeCompare(b.name));
    for (const t of tracks) {
      const row = document.createElement('div');
      row.className = 'tb-load-row';
      const name = document.createElement('div');
      name.className = 'tb-load-name';
      const title = document.createElement('div');
      title.className = 'tb-load-title';
      title.textContent = t.name;
      const meta = document.createElement('div');
      meta.className = 'tb-load-meta';
      const by = t.designer || t.author;
      meta.textContent = [by ? `by ${by}` : '', `${t.gates} gate${t.gates === 1 ? '' : 's'}`, t.times ? `${t.times} time${t.times === 1 ? '' : 's'} posted` : 'no times yet']
        .filter(Boolean).join(' · ');
      name.append(title, meta);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'tb-btn';
      open.textContent = 'Open a copy';
      open.title = `Your own copy of "${t.name}", to change and publish under your name`;
      open.addEventListener('click', async () => {
        open.disabled = true;
        open.textContent = 'Opening';
        try {
          const payload = await fetchTrackDocument(t.id, t.board || origin);
          this.closeModal();
          this.openBoardCopy({
            id: payload.id || t.id,
            name: payload.name || t.name,
            author: payload.author || t.author,
            board: t.board || origin,
            document: payload.document || payload,
          });
        } catch (e) {
          open.disabled = false;
          open.textContent = 'Open a copy';
          status.textContent = `"${t.name}" could not be fetched from the board. ${e.message || ''}`.trim();
        }
      });
      row.append(name, open);
      list.append(row);
    }
  }

  /* A board track opened as a copy: the remix half of adoptIncomingShare,
   * for a track picked here rather than handed over by a link. What it
   * replaces is kept in Load first (keepSeat), and the bind that credits the
   * original is written only once the copy has opened. */
  openBoardCopy(share) {
    const incoming = normalize(share.document).doc;
    const name = share.name || incoming.name;
    const { copy, commit } = forkDocument(incoming, {
      sourceId: share.id,
      sourceName: name,
      sourceAuthor: share.author || '',
      board: share.board || boardOrigin(),
    });
    const keep = this.keepSeat(copy);
    if (!keep.ok) {
      this.toast(keep.said);
      return false;
    }
    commit();
    const by = share.author ? ` by ${share.author}` : '';
    const said = `This is your copy of "${name}"${by}. Publish it under a new name to put it on the board.`;
    const same = canvasOf(copy) === canvasOf(this.doc);
    return this.loadDocument(copy, same ? [said, keep.said].filter(Boolean).join(' ') : said, keep);
  }

  /*
   * A ROW OF LOAD DELETED, with its Undo where it was. The document is out of
   * the library at once, and the row says so and offers it back, exactly as it
   * was saved, for as long as the list is open.
   */
  deleteFromLoad(t, row) {
    const raw = savedTrack(t.id);
    if (!raw || !deleteTrack(t.id)) {
      this.toast(`Could not delete "${t.name}": local storage is unavailable.`);
      return;
    }
    row.classList.add('tb-load-gone');
    const said = document.createElement('div');
    said.className = 'tb-load-name';
    said.textContent = `Deleted "${t.name}".`;
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'tb-btn';
    undo.textContent = 'Undo';
    undo.title = `Put "${t.name}" back in Load`;
    undo.addEventListener('click', () => {
      if (!restoreTrack(raw)) {
        this.toast(`Could not put "${t.name}" back: local storage is unavailable or full.`);
        return;
      }
      /* The list again, with the row back where it sorts. */
      this.openLoad();
    });
    row.replaceChildren(said, undo);
    undo.focus({ preventScroll: true });
  }

  exportFile() {
    downloadTrack(this.doc);
    this.toast('Exported.');
  }

  /*
   * A looping animation of one lap, as a file the pilot can post.
   *
   * The render is minutes of work on a slow machine and seconds on a fast
   * one, so it is behind its own button inside a modal rather than on the
   * menu item: pressing Export animation should open something that explains
   * what is about to happen, not lock the page up for a minute.
   *
   * Three.js and the exporter are imported here and not at the top of the
   * file, the same way view3d.js loads Three, so a pilot who never asks for
   * an animation never pays for the code or for the CDN being up.
   */
  async exportAnimation() {
    if (this.nameInput && this.nameInput.value) {
      this.doc.name = this.nameInput.value.trim() || 'Untitled track';
    }
    /* A map has no lap to animate. The menu does not offer this on a map;
     * this is for any other way in. */
    if (docModeOf(this.doc) === 'freestyle') {
      this.toast('An animation is one lap of a track, and a map has no lap.');
      return;
    }
    /* One element is not a lap, which is the same rule the racing line
     * itself applies, so the refusal says the same thing. */
    if (this.doc.sequence.length < 2) {
      this.toast('An animation needs at least two elements in the flying order.');
      return;
    }

    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    /* No duration named any more, because there is no one duration: the
     * quad flies a steady pace and a longer lap simply takes longer to go
     * round. See LAP_SPEED in stage.js. */
    help.textContent = 'One lap of the racing line, 512 by 512, looping, flown at the '
      + 'same pace whatever the track, so a longer lap is a longer clip. '
      + 'It comes out around 1 to 2 MB, which posts anywhere. Rendering takes a minute '
      + 'or so and this tab has to stay open while it does.';
    const status = document.createElement('p');
    status.className = 'tb-help';
    body.append(help, status);

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'tb-btn tb-primary';
    go.textContent = 'Render the animation';
    go.addEventListener('click', async () => {
      go.disabled = true;
      status.textContent = 'Loading the renderer.';
      try {
        const { exportTrackGif } = await import('./animate.js');
        const bytes = await exportTrackGif(this.doc, {
          onProgress: (done, total) => {
            status.textContent = `Frame ${done} of ${total}.`;
          },
        });
        downloadBlob(bytes, animationFilename(this.doc), 'image/gif');
        const mb = (bytes.length / 1e6).toFixed(2);
        status.textContent = `Done. ${mb} MB, saved as ${animationFilename(this.doc)}.`;
        go.textContent = 'Render it again';
        go.disabled = false;
      } catch (e) {
        status.textContent = e && e.message ? e.message : String(e);
        go.disabled = false;
      }
    });
    body.append(go);
    this.modal('Export animation', body);
  }

  /*
   * The card animation, rendered and sent after a room is published. The
   * rendering and the sending are in src/share/cardgif.js, because the
   * simulator's own Publish does the same thing and the two must not
   * differ. What is here is what to say while it happens.
   *
   * It is sixty frames rather than the export button's three hundred, so it
   * is three or four seconds on real hardware rather than a minute. The
   * author is looking at a dialog that has just said Published, so the wait
   * is paid for by a sentence rather than by a spinner.
   */
  async renderCardForBoard(origin, status) {
    const was = status.textContent;
    const done = await sendCardAnimation(this.doc, {
      origin,
      onProgress: (n, total) => {
        status.textContent = `${was} Drawing its card, frame ${n} of ${total}.`;
      },
    });
    if (done.skipped) {
      return;
    }
    /* Said plainly, and said as what it is: the track went up, the picture
     * did not. */
    status.textContent = done.error
      ? `${was} The track is up, but its card animation could not be sent: ${done.error}`
      : `${was} Its card on the board is a lap of it.`;
  }

  /*
   * THE SHARE CARD, drawn here for the reason the animation is. A link to
   * this track posted on Facebook, X or WhatsApp shows a picture, their
   * crawlers run no script to find one, and the board renders nothing, so
   * the picture has to exist before anybody posts the link and only a
   * browser can draw it. Every track and every map gets one, a field track
   * included. See src/share/card.js.
   *
   * After the animation rather than beside it: two worlds built at once is
   * two GPU contexts on a machine that may only have been happy with one.
   * `noun` is "track" or "map", for the sentence.
   */
  async renderShareCardForBoard({ kind, noun, origin, editKey, status }) {
    const was = status.textContent;
    status.textContent = `${was} Drawing the picture a link to it shows.`;
    const done = await sendShareCard({
      kind, id: this.doc.id, board: origin, editKey,
    });
    status.textContent = done.error
      ? `${was} The ${noun} is up, but its share picture could not be sent, so a link to it shows the WebFPV card for now: ${done.error}`
      : `${was} A link to it, posted anywhere, shows the ${noun}.`;
  }

  /*
   * Put this course on the public board. The document goes as it is, logo
   * included, so every gate and every flag on the board copy wears the
   * same print the author sees here.
   *
   * Three shapes of this dialog, because they are three different promises:
   * a first publish, an update of a listing this browser owns, and a copy
   * of someone else's course under a new name.
   */
  listingOfCanvas() {
    return inspectCourse({
      share: null,
      autosave: { doc: this.doc },
    });
  }

  openPublish() {
    if (docModeOf(this.doc) === 'freestyle') {
      this.openPublishMap();
      return;
    }
    if (this.nameInput && this.nameInput.value) {
      this.doc.name = this.nameInput.value.trim() || 'Untitled track';
    }
    if (!this.doc.sequence.length) {
      this.toast('A published track needs at least one gate in the flying order.');
      return;
    }
    /* A table, a chair or a banner is not something the board knows yet. Said here,
     * in a dialog that stays until it is read, because the sentence is longer than a
     * toast is up for, and before the author has typed a name for nothing. */
    const unknown = partsTheBoardDoesNotKnow(this.doc);
    if (unknown.length) {
      const say = document.createElement('p');
      say.className = 'tb-help';
      say.textContent = unknownPartsSentence(unknown);
      this.modal('Not on the board yet', say);
      return;
    }
    this.autosaver.flush();
    const listing = this.listingOfCanvas();
    const remix = listing.kind === 'remix';
    const owned = listing.kind === 'owned';
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    if (remix) {
      const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
      const by = listing.sourceAuthor ? ` by ${listing.sourceAuthor}` : '';
      help.textContent = `This is your copy${of}${by}. It goes on the board as a new track under the name below. The original stays.`;
    } else if (owned && listing.layoutDrift) {
      help.textContent = 'The layout changed. Updating the board will clear posted times. A rename alone would have kept them.';
    } else if (owned) {
      help.textContent = 'This track is already on the board. Updating it keeps the times if the flying layout has not changed.';
    } else {
      help.textContent = 'The public board keeps a copy of this track, including every sponsor logo on the gates, the flags and the grass. Times people post are stored there.';
    }
    body.append(help);

    const courseField = document.createElement('div');
    courseField.className = 'tb-field';
    const courseLabel = document.createElement('label');
    courseLabel.className = 'tb-field-label';
    courseLabel.textContent = 'Track name';
    const courseInput = document.createElement('input');
    courseInput.type = 'text';
    courseInput.maxLength = 80;
    courseInput.id = 'tb-publish-name';
    courseLabel.htmlFor = courseInput.id;
    courseInput.value = remix ? suggestRemixName(this.doc.name) : this.doc.name;
    courseField.append(courseLabel, courseInput);
    body.append(courseField);
    const nameAsk = this.nameAsk(courseInput, 'track');
    body.append(nameAsk.line);

    const nameField = document.createElement('div');
    nameField.className = 'tb-field';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'tb-field-label';
    nameLabel.textContent = 'Your name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.value = readPilotName() || '';
    nameField.append(nameLabel, nameInput);
    body.append(nameField);
    const nameHelp = document.createElement('p');
    nameHelp.className = 'tb-help';
    nameHelp.textContent = nameRules();
    body.append(nameHelp);

    /*
     * WHAT THE TRACK IS FOR, which is the one thing about a published track
     * that nothing else on the board can work out.
     *
     * A gate count says how big it is and a plan drawing says what shape it
     * is, and neither says whether it was built to be raced, to practise
     * one thing, or to find out whether an idea works. That is the question
     * a visitor scrolling a board is actually asking, and only the author
     * can answer it.
     *
     * A CLOSED LIST OF BUTTONS, not a text field. Free text would give the
     * board "race", "racing", "Race Track" and "racetrack" as four separate
     * tags and no filter at all. The vocabulary is mirrored from the board
     * in src/share/board.js, and the board refuses an id it does not know
     * rather than dropping it, so a stale builder is told rather than
     * quietly ignored.
     *
     * Seeded from the BIND rather than from the document, because tags are
     * not in the document: see rememberPublish in src/share/listing.js.
     *
     * `held` is null when this browser does not know which tags the board
     * shows on this track, which is every track published before binds
     * kept them. An empty row means something different then: not "none",
     * but "not seen", and tagsToSend in src/share/listing.js sends no list
     * for it, so the board keeps what it has.
     */
    const held = publishedTags(this.doc.id);
    const chosen = new Set(usableTags(held));
    /* This class's tags, and any other this track already wears, so a whoop
     * track that was given Small field can have it taken off. See
     * tagsForClass in src/share/board.js. */
    const offered = tagsForClass(trackClassOf(this.doc));
    const shownTags = TRACK_TAGS.filter((t) => offered.includes(t) || chosen.has(t.id));
    const tagField = document.createElement('div');
    tagField.className = 'tb-field';
    const tagLabelEl = document.createElement('label');
    tagLabelEl.className = 'tb-field-label';
    tagLabelEl.textContent = 'What it is for';
    const tagRow = document.createElement('div');
    tagRow.className = 'tb-tags';
    const tagHelp = document.createElement('p');
    tagHelp.className = 'tb-help';
    const sayTags = () => {
      if (chosen.size) {
        tagHelp.textContent = `${[...chosen].map(tagLabel).join(', ')}. People filter the board by these.`;
      } else if (owned && !Array.isArray(held)) {
        /* Said, because an empty row on a track that is already on the
         * board reads as "it has no tags", and here it only means this
         * browser never heard which it has. */
        tagHelp.textContent = 'This browser has no record of the tags this track wears on the board, so none are ticked. Leave them that way to keep whatever it wears, or tick some to replace them.';
      } else {
        tagHelp.textContent = `Optional, and up to ${TRACK_TAGS_MAX}. People filter the board by these, so a track with none is harder to find.`;
      }
    };
    for (const tag of shownTags) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-tag';
      btn.textContent = tag.label;
      btn.title = tag.note;
      btn.setAttribute('aria-pressed', chosen.has(tag.id) ? 'true' : 'false');
      btn.addEventListener('click', () => {
        if (chosen.has(tag.id)) {
          chosen.delete(tag.id);
        } else if (chosen.size >= TRACK_TAGS_MAX) {
          /* Refused rather than silently swapping one out, because a
           * control that quietly drops the thing you ticked first is worse
           * than one that says no. */
          tagHelp.textContent = `That is ${TRACK_TAGS_MAX} already. Untick one to add another.`;
          return;
        } else {
          chosen.add(tag.id);
        }
        btn.setAttribute('aria-pressed', chosen.has(tag.id) ? 'true' : 'false');
        sayTags();
      });
      tagRow.append(btn);
    }
    sayTags();
    tagField.append(tagLabelEl, tagRow);
    body.append(tagField, tagHelp);

    /*
     * NO BOARD ADDRESS. The dialog carried a URL field for the board's
     * address, which is a developer's override that ?board= in the address
     * already is, in front of every author who will never need it
     * (MENUS-PLAN.md 1.22). The board is boardOrigin()'s, and ?board= still
     * points this page at another one.
     */
    const status = document.createElement('p');
    status.className = 'tb-help';
    status.setAttribute('role', 'status');
    body.append(status);

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'tb-btn tb-primary';
    send.textContent = owned ? 'Update the board' : (remix ? 'Publish as yours' : 'Publish this track');
    send.addEventListener('click', async () => {
      /* A real name first: the board lists tracks by name (isPlaceholderName). */
      if (!nameAsk.ok()) {
        return;
      }
      const author = writePilotName(nameInput.value);
      if (!author) {
        status.textContent = nameRules();
        nameInput.focus();
        return;
      }
      const courseName = String(courseInput.value || '').trim();
      this.doc.name = courseName;
      if (this.nameInput) {
        this.nameInput.value = courseName;
      }
      const origin = boardOrigin();
      send.disabled = true;
      status.textContent = 'Sending the track, logos included.';
      /* A list, empty when the author unticked every tag they were shown,
       * or undefined to leave the board's alone. See tagsToSend. */
      const tags = tagsToSend(held, [...chosen]);
      const sendDoc = async (doc) => {
        const posted = await publishTrack({
          author,
          document: toPlain(doc),
          editKey: readEditKey(doc.id),
          origin,
          tags,
        });
        /* The bind is where the tags live on this side, and rememberPublish
         * keeps the board's own answer about them, so the next publish
         * pre-ticks what the board is showing rather than untagging the
         * track. See rememberPublish. */
        rememberPublish(toPlain(doc), posted, origin, author, { tags });
        writeAutosave(doc);
        return posted;
      };
      try {
        let posted;
        try {
          posted = await sendDoc(this.doc);
        } catch (e) {
          if (!e || !e.conflict) {
            throw e;
          }
          const { copy, commit } = forkDocument(this.doc, {
            name: courseName,
            board: origin,
            sourceId: this.doc.id,
            sourceName: this.doc.name,
            sourceAuthor: '',
          });
          commit();
          this.loadDocument(copy, '');
          posted = await sendDoc(this.doc);
          status.textContent = `This id was already on the board, so it went up as a new track, "${posted.name}".`;
        }
        const cleared = posted.timesCleared
          ? ' The flying layout changed, so the old times were cleared.'
          : '';
        if (!status.textContent.startsWith('This id')) {
          status.textContent = `Published as "${posted.name}".${cleared}`;
        }
        this.toast(`Published "${posted.name}" to the board.`);
        /*
         * A ROOM'S CARD ON THE BOARD IS ITS ANIMATION, SO IT IS RENDERED
         * HERE, NOW.
         *
         * The board renders nothing and never will, so if this browser does
         * not make the picture nothing does. The moment after a publish is
         * the only moment when the document, the edit key and a live WebGL
         * context are all in one place, which is why it is here and not
         * behind a button the author would have to know to press.
         *
         * Only a room. A field track's plan is drawn by the board from the
         * listing for nothing, and the board refuses an animation for one
         * anyway. See inspectGif in the board's src/validate.js.
         */
        await this.renderCardForBoard(origin, status);
        await this.renderShareCardForBoard({
          kind: 'track', noun: 'track', origin, editKey: readEditKey(this.doc.id), status,
        });
        this.updateTopBar();
        /*
         * THE TRACK'S OWN SHEET ON THE BOARD (MENUS-PLAN.md 5.2). The link
         * opened the board's front page, so an author who had just published
         * a track had to find it again in a list of forty. The board turns
         * ?track=id into its sheet; the builder's class goes with it, so an
         * author on the whoop canvas lands on the whoop side.
         */
        const open = document.createElement('a');
        open.className = 'tb-btn tb-primary';
        open.href = boardPageUrl(origin, wordsFor(this.doc).craft, { track: posted.id });
        /* The board's own tab, reused if it is already open. No rel here:
         * noopener would send this to a fresh tab every time. */
        open.target = BOARD_WINDOW;
        open.textContent = 'This track on Tracks and times';
        send.replaceWith(open);
        shown.close.textContent = 'Close';
        open.focus({ preventScroll: true });
      } catch (e) {
        send.disabled = false;
        status.textContent = e.message || 'The board could not take that track.';
        this.toast(`Could not publish: ${e.message || e}`);
      }
    });
    const shown = this.modal(owned ? 'Update this track' : (remix ? 'Publish as yours' : 'Publish this track'), body, [], { primary: send });
    nameAsk.start();
  }

  /*
   * A NAME FIRST (MENUS-PLAN.md 4.3). The board lists tracks and maps by name,
   * and its first impression was a row of "Untitled track", "Untitled map" and
   * worse. Publish keeps the dialog it is in and asks there: the name field has
   * the caret, and a line under it says why. `line` goes under the field;
   * `start()` is called once the dialog is up and puts the caret there when the
   * name is still the placeholder; `ok()` is asked by the send button, and asks
   * again rather than sending.
   */
  nameAsk(input, noun) {
    const line = document.createElement('p');
    line.className = 'tb-help tb-ask';
    line.id = `${input.id}-why`;
    line.hidden = true;
    input.setAttribute('aria-describedby', line.id);
    const ask = () => {
      line.hidden = false;
      line.textContent = `Give it a name first. Tracks and times lists every ${noun} by its name, and "Untitled ${noun}" does not say which one this is.`;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      input.select();
    };
    input.addEventListener('input', () => {
      if (!isPlaceholderName(input.value)) {
        line.hidden = true;
        input.removeAttribute('aria-invalid');
      }
    });
    return {
      line,
      start: () => {
        if (isPlaceholderName(input.value)) {
          ask();
        }
      },
      ok: () => {
        if (isPlaceholderName(input.value)) {
          ask();
          return false;
        }
        return true;
      },
    };
  }

  /*
   * PUT THIS MAP ON THE BOARD: the map's own Publish, beside the track's.
   *
   * Simpler than a track's, because less rides on it: no flying order to
   * require, no posted times a changed layout would clear, and no tags,
   * whose vocabulary is a race track's. Two shapes, a first publish and an
   * update of a map this browser put up, told apart by the map's own key
   * (readMapListing in src/share/session.js) and never by a track's.
   *
   * The document goes as it is, which is already a list of references with
   * their modifiers, sponsor prints included; the board keeps each print
   * once however many maps wear it. The drawing for its card goes beside
   * it, measured here by boardPlanOf, because the board does not know what
   * a piece looks like and is not meant to.
   */
  openPublishMap() {
    if (this.nameInput && this.nameInput.value) {
      this.doc.name = this.nameInput.value.trim() || 'Untitled map';
    }
    /* The board's own rule, asked here first so the author is told before
     * the request rather than by it: a label, the start and paint on the
     * ground are not pieces, and a map of nothing else is refused there.
     * See NOT_A_PIECE in the board's src/validate.js. */
    const standing = this.doc.elements.some((el) => {
      const kind = ELEMENTS[el.type] && ELEMENTS[el.type].kind;
      return kind && kind !== KIND.ANNOTATION && kind !== KIND.START && kind !== KIND.DECAL;
    });
    if (!standing) {
      this.toast('A published map needs at least one piece on it.');
      return;
    }
    this.autosaver.flush();
    const owned = Boolean(readMapListing(this.doc.id));
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    help.textContent = owned
      ? 'This map is already on the board. Updating it puts this version up in its place.'
      : 'The public board keeps a copy of this map, sponsor prints included, and draws its card from the pieces on it. Anybody can fly it from there.';
    body.append(help);

    const field = (label, input) => {
      const row = document.createElement('div');
      row.className = 'tb-field';
      const name = document.createElement('label');
      name.className = 'tb-field-label';
      name.textContent = label;
      row.append(name, input);
      body.append(row);
    };
    const mapInput = document.createElement('input');
    mapInput.type = 'text';
    mapInput.maxLength = 80;
    mapInput.id = 'tb-publish-name';
    mapInput.value = this.doc.name;
    field('Map name', mapInput);
    body.lastElementChild.querySelector('label').htmlFor = mapInput.id;
    const nameAsk = this.nameAsk(mapInput, 'map');
    body.append(nameAsk.line);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.value = readPilotName() || '';
    field('Your name', nameInput);
    const nameHelp = document.createElement('p');
    nameHelp.className = 'tb-help';
    nameHelp.textContent = nameRules();
    body.append(nameHelp);
    /* No board address: see openPublish. */

    const status = document.createElement('p');
    status.className = 'tb-help';
    status.setAttribute('role', 'status');
    body.append(status);

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'tb-btn tb-primary';
    send.textContent = owned ? 'Update the board' : 'Publish this map';
    send.addEventListener('click', async () => {
      if (!nameAsk.ok()) {
        return;
      }
      const author = writePilotName(nameInput.value);
      if (!author) {
        status.textContent = nameRules();
        nameInput.focus();
        return;
      }
      const mapName = String(mapInput.value || '').trim();
      this.doc.name = mapName;
      if (this.nameInput) {
        this.nameInput.value = mapName;
      }
      const origin = boardOrigin();
      send.disabled = true;
      status.textContent = 'Sending the map, sponsor prints included.';
      const sendDoc = async (doc) => {
        const held = readMapListing(doc.id);
        const posted = await publishMap({
          author,
          document: toPlain(doc),
          plan: boardPlanOf(doc),
          editKey: held ? held.editKey : '',
          origin,
        });
        /* The key comes back on the first publish only, so an update keeps
         * the one already held. */
        writeMapListing(doc.id, {
          editKey: posted.editKey || (held && held.editKey) || '',
          board: origin,
          author,
          nameOnBoard: posted.name || doc.name,
        });
        writeAutosave(doc);
        return posted;
      };
      try {
        let posted;
        let forked = false;
        try {
          posted = await sendDoc(this.doc);
        } catch (e) {
          if (!e || !e.conflict) {
            throw e;
          }
          /* The id is on the board under a key this browser does not hold:
           * a map imported from a file somebody had already published. It
           * goes up as a new map under a new id, which is what a track does
           * in the same case, and the original stays theirs. */
          const copy = duplicateTrack(this.doc, mapName);
          this.loadDocument(copy, '');
          posted = await sendDoc(this.doc);
          forked = true;
        }
        const verb = posted.updated ? 'Updated' : 'Published';
        status.textContent = forked
          ? `This id was already on the board, so it went up as a new map, "${posted.name}".`
          : `${verb} as "${posted.name}".`;
        this.toast(`${verb} "${posted.name}" on the board.`);
        /* The board drops a map's share card on every republish, because
         * this is the only thing that republishes one, and it draws the
         * new card here. See publishMapUnlocked in the board's store.js. */
        const held = readMapListing(this.doc.id);
        await this.renderShareCardForBoard({
          kind: 'map', noun: 'map', origin, editKey: held ? held.editKey : '', status,
        });
        this.updateTopBar();
        const open = document.createElement('a');
        open.className = 'tb-btn tb-primary';
        /* Straight to the map's own sheet on the board, which turns ?map=id
         * into it, the same way a track's link does. */
        open.href = boardPageUrl(origin, null, { map: posted.id });
        /* The board's own tab, reused if it is already open. No rel here:
         * noopener would send this to a fresh tab every time. */
        open.target = BOARD_WINDOW;
        open.textContent = 'This map on Tracks and times';
        send.replaceWith(open);
        shown.close.textContent = 'Close';
        open.focus({ preventScroll: true });
      } catch (e) {
        send.disabled = false;
        status.textContent = e.message || 'The board could not take that map.';
        this.toast(`Could not publish: ${e.message || e}`);
      }
    });
    const shown = this.modal(owned ? 'Update this map' : 'Publish this map', body, [], { primary: send });
    nameAsk.start();
  }

  /* ---------------- the sponsors' logos ---------------- */

  /*
   * The pictures this course is dressed in: up to five of them.
   *
   * A dialog rather than a field in the inspector, and the reason is what
   * they belong to: a logo is a property of the TRACK, not of any element on
   * it, so putting them beside a gate's dimensions would say the opposite.
   * The inspector's Field section is the other candidate and it is where a
   * field width lives, but that panel is only reachable with nothing
   * selected, which is not where somebody who has just placed ten gates is.
   *
   * FIVE SLOTS, NUMBERED, and the numbers are load bearing. Gate 1 wears
   * logo 1, gate 2 logo 2, round and round, so fifteen gates share five
   * sponsors three apiece; the inspector's picker for a painted footprint
   * counts in the same numbers; and the line under the list says what that
   * works out as for THIS course rather than leaving an author to divide.
   *
   * THE PREVIEWS ARE THE POINT OF THE DIALOG. Uploading an image and then
   * having to load a world to find out it came out square, or too small to
   * read, or half off the board, is the version of this feature nobody would
   * use twice. Each slot shows the gate header it lands on and the grass it
   * lands on, because those are two different shapes and a logo can suit one
   * and not the other.
   *
   * PAINT ON THE GRASS IS A BUTTON HERE, and it is here because it was
   * nowhere. Putting a logo on the turf meant knowing that the palette's
   * Ground logo was the thing that did it, which is a name you only
   * recognise once somebody has told you. The grass preview sitting in this
   * dialog beside every logo made that worse rather than better: it showed
   * an author what paint would look like and then left them no way to ask
   * for any. The button arms the same palette tool with this logo already
   * chosen, so the next click on the field is the decal.
   */
  openLogo() {
    /* Grass on a field, the floor in a room, the plot's ground on a map: the
     * dialog said grass on all three (MENUS-PLAN.md 4.1). A map has no flying
     * order to deal the logos round, so on a map they go where they are
     * painted, and the dialog says so. */
    const w = wordsFor(this.doc);
    const map = docModeOf(this.doc) === 'freestyle';
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    help.textContent = map
      ? `Up to five sponsors\u2019 logos, painted on the ${w.ground} wherever you put them: press Paint on the ${w.ground} under one, then click the ${w.place}. They travel inside the map file, so a map you send somebody arrives with its branding on.`
      : `Up to five sponsors\u2019 logos. They are dealt out round the gates in flying order, so each sponsor gets a share of the boards, the upright banners and the flags, spread down the lap rather than bunched at the start. Any of them can also be painted on the ${w.ground}: press Paint on the ${w.ground} under it, then click the ${w.place}. They travel inside the track file, so a track you send somebody arrives with its branding on.`;
    body.append(help);

    const list = document.createElement('div');
    body.append(list);

    const summary = document.createElement('p');
    summary.className = 'tb-help';
    body.append(summary);

    /* One image element per data URL, reused across redraws, so repainting
     * the list after a change does not start five fresh decodes. */
    const images = new Map();
    const imageFor = (url, onLoad) => {
      let img = images.get(url);
      if (!img) {
        img = new Image();
        images.set(url, img);
        img.addEventListener('load', onLoad);
        img.src = url;
        return img;
      }
      /* Already asked for, but not decoded yet, and this redraw's canvases
       * still need telling. Two slots holding the same file is the case: one
       * decode, two previews waiting on it. */
      if (!img.complete) {
        img.addEventListener('load', onLoad);
      }
      return img;
    };

    /* One file input, pointed at whichever slot asked for it. Five inputs
     * would be five change handlers disagreeing about which slot they are. */
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    file.style.display = 'none';
    let target = -1;
    body.append(file);

    const redraw = () => {
      list.textContent = '';
      const logos = logosOf(this.doc);
      const spent = brandingBytes(this.doc);
      for (let i = 0; i < LOGO_SLOTS; i += 1) {
        const mark = logos[i] ?? null;
        const row = document.createElement('div');
        row.className = mark ? 'tb-slot' : 'tb-slot empty';
        const num = document.createElement('span');
        num.className = 'tb-num';
        num.textContent = String(i + 1);
        const slot = document.createElement('div');
        slot.className = 'tb-slot-body';
        row.append(num, slot);
        /*
         * In the document BEFORE anything is painted into it. Both preview
         * painters size their bitmap from the canvas's clientWidth, and a
         * canvas that is not laid out yet reports zero: the previews came
         * out at the fallback width and were then stretched by the CSS,
         * which is a blurry picture of somebody's logo in the one dialog
         * whose whole job is showing it sharply.
         */
        list.append(row);

        if (!mark) {
          const note = document.createElement('p');
          note.className = 'tb-help';
          note.textContent = i === logos.length
            ? (map ? `Empty. Add a logo here, then paint it on the ${w.ground}.` : 'Empty. Add a logo here and the gates start sharing it.')
            : 'Empty.';
          slot.append(note);
          if (i === logos.length) {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'tb-btn';
            add.textContent = 'Add a logo';
            add.addEventListener('click', () => { target = i; file.click(); });
            const btns = document.createElement('div');
            btns.className = 'tb-row-btns';
            btns.append(add);
            slot.append(btns);
          }
          continue;
        }

        /* The two places a logo lands, side by side, because they are two
         * different shapes: a long strip on the gate's header board and a
         * rectangle on the grass. A logo can suit one and not the other. */
        const arts = document.createElement('div');
        arts.className = 'tb-slot-arts';
        const board = document.createElement('canvas');
        board.className = 'tb-logo-preview slot';
        const grass = document.createElement('canvas');
        grass.className = 'tb-ground-preview';
        arts.append(board, grass);
        slot.append(arts);
        /* The grass preview is drawn at the footprint a Ground logo is
         * PLACED with, from the element library, so what an author judges
         * here is the box they will actually get. */
        const foot = ELEMENTS.groundLogo.dims;
        const draw = () => {
          drawBannerPreview(board, mark.image, img);
          drawGroundPreview(grass, img, foot.width, foot.depth);
        };
        const img = imageFor(mark.image, draw);
        draw();

        const caption = document.createElement('p');
        caption.className = 'tb-help';
        caption.textContent = `${mark.name || `Logo ${i + 1}`}, ${Math.round(mark.image.length / 1024)} kB, stored in the track.`;
        slot.append(caption);

        const btns = document.createElement('div');
        btns.className = 'tb-row-btns';
        const swap = document.createElement('button');
        swap.type = 'button';
        swap.className = 'tb-btn';
        swap.textContent = 'Replace';
        swap.addEventListener('click', () => { target = i; file.click(); });
        /*
         * The one route from a logo to paint on the field. It arms the
         * palette's Ground logo with THIS slot's id and shuts the dialog,
         * because a modal over the canvas cannot be clicked through and the
         * next thing an author has to do is click the canvas.
         */
        const paint = document.createElement('button');
        paint.type = 'button';
        paint.className = 'tb-btn';
        paint.textContent = `Paint on the ${w.ground}`;
        paint.title = `Put this logo on the ${w.ground}: click the ${w.place} where you want it`;
        paint.addEventListener('click', () => {
          this.armGroundLogo(mark.id);
          this.closeModal();
        });
        const drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'tb-btn tb-danger';
        drop.textContent = 'Remove';
        drop.addEventListener('click', () => {
          this.edit('remove logo', (d) => {
            d.branding.logos.splice(i, 1);
          });
          redraw();
          this.toast(`Logo removed. Any ${w.ground} painted with it now shows nothing until you pick another.`);
        });
        btns.append(swap, paint, drop);
        slot.append(btns);
      }

      /*
       * What the list works out to on THIS course, which is the question an
       * author actually has: not "how many logos are there" but "how many
       * gates does each sponsor get".
       */
      const gates = dressOrder(this.doc).size;
      const n = logos.length;
      const left = Math.max(0, BRANDING_MAX_CHARS - spent);
      const budget = `${Math.round(spent / 1024)} kB of ${Math.round(BRANDING_MAX_CHARS / 1024)} kB used, ${Math.round(left / 1024)} kB left.`;
      if (map) {
        summary.textContent = n
          ? `${n} logo${n === 1 ? '' : 's'}, painted where you put them. ${budget}`
          : `No logos yet. ${budget}`;
      } else if (!n) {
        summary.textContent = `No logos yet. The gates carry a chequered flag device and their number. ${budget}`;
      } else if (!gates) {
        summary.textContent = `Nothing is in the flying order yet, so nothing is wearing them. ${budget}`;
      } else {
        const base = Math.floor(gates / n);
        const extra = gates % n;
        const share = extra === 0
          ? `${base} gate${base === 1 ? '' : 's'} each`
          : `${base + 1} gates for the first ${extra}, ${base} for the rest`;
        summary.textContent = `${gates} gate${gates === 1 ? '' : 's'} in the flying order, ${n} logo${n === 1 ? '' : 's'}: ${share}. ${budget}`;
      }
    };

    file.addEventListener('change', async () => {
      const chosen = file.files[0];
      const slot = target;
      file.value = '';
      target = -1;
      if (!chosen || slot < 0) {
        return;
      }
      const logos = logosOf(this.doc);
      /* Replacing a slot gets its own bytes back before it is asked to fit,
       * so swapping a 90 kB logo for another 90 kB logo is never refused for
       * a budget the logo it is replacing was spending. */
      const freed = logos[slot] ? logos[slot].image.length : 0;
      const budget = BRANDING_MAX_CHARS - brandingBytes(this.doc) + freed;
      try {
        const logo = await normaliseLogo(chosen, budget);
        this.edit(logos[slot] ? 'replace logo' : 'add logo', (d) => {
          const list2 = d.branding.logos;
          if (list2[slot]) {
            /* The id survives a replacement, so a footprint painted on the
             * grass keeps pointing at this slot rather than going blank
             * because the sponsor sent a new file. */
            list2[slot].image = logo.dataUrl;
            list2[slot].name = logo.name;
          } else {
            list2.push({ id: newLogoId(d), image: logo.dataUrl, name: logo.name });
          }
        });
        redraw();
        this.toast(`Logo ${slot + 1} set from ${logo.name}, ${logo.width} by ${logo.height}.`);
      } catch (e) {
        this.toast(`Could not use that image: ${e.message}`);
      }
    });

    this.modal('Sponsor logos', body);
    redraw();
  }

  async importFile(file) {
    if (!file) {
      return;
    }
    try {
      this.importText(await readFileText(file));
    } catch (e) {
      this.toast(`Could not read the file: ${e.message}`);
    }
  }

  /*
   * IMPORT, from a file or from text pasted in. A track from this builder is
   * read by the reader every file is; one saved by the FPV Events designer is
   * recognised by its shape (an arena and a list of gates) and mapped by
   * importfpv.js, and what came across, what was changed and what was left out is
   * said in a dialog after it opens, because a converted track that silently lost
   * a banner is worse than one that says so.
   */
  importText(text) {
    if (!text || !String(text).trim()) {
      this.toast('There is nothing there to import.');
      return;
    }
    if (looksLikeFpvEvents(text)) {
      const got = importFpvEvents(text);
      if (got.error) {
        this.toast(got.error);
        return;
      }
      if (this.openIncoming(got.doc, `Imported "${got.doc.name}".`)) {
        this.showImportReport(got.report);
      }
      return;
    }
    const { doc, repairs, error } = deserialize(text);
    if (error) {
      this.toast(`Could not import: ${error}`);
      return;
    }
    this.openIncoming(doc, repairs.length
      ? `Imported "${doc.name}" with ${repairs.length} repair${repairs.length === 1 ? '' : 's'}: ${repairs[0]}`
      : `Imported "${doc.name}".`);
  }

  /* The import dialog: choose a file, or paste the text of one. */
  openImport() {
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    help.textContent = 'A .json track from this builder, or one from the FPV Events designer. Choose a file, or paste the text of one below.';
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'tb-btn';
    choose.textContent = 'Choose a file';
    choose.addEventListener('click', () => {
      this.closeModal();
      this.fileInput.click();
    });
    const area = document.createElement('textarea');
    area.className = 'tb-paste';
    area.rows = 8;
    area.setAttribute('aria-label', 'A track, as text');
    area.placeholder = 'Paste a track here';
    body.append(help, choose, area);
    this.modal('Import a track', body, [{ label: 'Import pasted text', run: () => this.importText(area.value) }]);
  }

  /* What an import from another designer kept, changed and left out. */
  showImportReport(report) {
    const body = document.createElement('div');
    for (const [heading, list] of [['Kept', report.kept], ['Changed', report.approximated], ['Left out', report.dropped]]) {
      if (!list.length) {
        continue;
      }
      const h = document.createElement('h3');
      h.textContent = heading;
      const ul = document.createElement('ul');
      ul.className = 'tb-report';
      for (const line of list) {
        const li = document.createElement('li');
        li.textContent = line;
        ul.append(li);
      }
      body.append(h, ul);
    }
    this.modal('What came across', body);
  }

  /*
   * THE SHARE LINK: the whole track in the address, after the hash sign, where a
   * browser never sends it anywhere. Copied to the clipboard; where the browser
   * will not (a page not in focus, an address that is not secure) it is shown to
   * be copied by hand. See sharelink.js for what is in it and why reading one is
   * treated as hostile.
   */
  async copyShareLink() {
    /* A race track's, on the five inch canvas as on the whoop's: the same
     * fragment carries either document whole (the self test proves it). */
    if (docModeOf(this.doc) === 'freestyle') {
      return;
    }
    let link = '';
    try {
      link = await trackLink(this.doc, `${window.location.origin}${window.location.pathname}`);
    } catch (e) {
      this.toast('Could not make a link for this track.');
      return;
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch (e) {
      copied = false;
    }
    this.lastLink = link;
    /* A track with sponsor logos carries them, and a picture is long. */
    const long = link.length > 8000
      ? ' It is long because it carries the sponsor logos, and some chat apps cut a link that long: for those, Export the file from More.'
      : '';
    if (copied) {
      this.toast(`Link copied, ${link.length} characters. It carries the whole track and opens as a copy for whoever has it.${long}`);
      return;
    }
    const body = document.createElement('div');
    const help = document.createElement('p');
    help.className = 'tb-help';
    help.textContent = `Copy this link. It carries the whole track, so there is nothing to upload, and it opens as a copy for whoever has it.${long}`;
    const area = document.createElement('textarea');
    area.className = 'tb-paste';
    area.readOnly = true;
    area.rows = 6;
    area.value = link;
    body.append(help, area);
    this.modal('Share link', body);
    area.focus();
    area.select();
  }

  /* A picture of the room, as a PNG file. */
  async savePicture() {
    if (!this.isWhoopRace()) {
      return;
    }
    if (this.mode !== '3d') {
      this.toast('The picture is of the room in 3D. Press V, or 3D on the bar, first.');
      return;
    }
    const blob = await this.view3d.snapshot();
    if (!blob) {
      this.toast('The room is not showing yet, so there is nothing to take a picture of.');
      return;
    }
    downloadBlob(blob, pictureFilename(this.doc), 'image/png');
    this.toast(`Saved ${pictureFilename(this.doc)}.`);
  }

  /*
   * THE BUILD SHEET, over the whole page so the print dialog has one thing to
   * print: where every piece stands measured from a corner of the smallest
   * rectangle that holds the track, and what pipe and fittings to buy. The
   * corner is chosen on the sheet. Everything on it is text from the document
   * and passes through buildsheet.js's escaping, and the page's own styles hide
   * the rest of the builder when printing (index.html).
   */
  openSheet(corner = 'sw') {
    if (!this.isWhoopRace()) {
      return;
    }
    let layer = document.getElementById('tb-sheet');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'tb-sheet';
      layer.setAttribute('role', 'dialog');
      layer.setAttribute('aria-modal', 'true');
      layer.setAttribute('aria-label', 'Build sheet');
      document.body.append(layer);
      layer.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          layer.hidden = true;
        }
      });
    }
    layer.hidden = false;
    layer.textContent = '';
    const bar = document.createElement('div');
    bar.className = 'tb-sheet-bar';
    const label = document.createElement('label');
    label.textContent = 'Measure from the ';
    const pick = document.createElement('select');
    for (const [id, c] of Object.entries(CORNERS)) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = `${c.label} corner`;
      o.selected = id === corner;
      pick.append(o);
    }
    pick.addEventListener('change', () => this.openSheet(pick.value));
    label.append(pick);
    const print = document.createElement('button');
    print.type = 'button';
    print.className = 'tb-btn tb-primary';
    print.textContent = 'Print';
    print.addEventListener('click', () => window.print());
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tb-btn';
    close.textContent = 'Close';
    close.addEventListener('click', () => { layer.hidden = true; });
    bar.append(label, print, close);
    const page = document.createElement('div');
    page.className = 'tb-sheet-body';
    page.innerHTML = sheetHtml(buildSheet(this.doc, { corner }));
    layer.append(bar, page);
    pick.focus();
  }

  undo() {
    const doc = this.history.undo(this.doc);
    if (!doc) {
      this.toast('Nothing to undo.');
      return;
    }
    this.doc = doc;
    this.pruneSelection();
    this.refresh();
  }

  redo() {
    const doc = this.history.redo(this.doc);
    if (!doc) {
      this.toast('Nothing to redo.');
      return;
    }
    this.doc = doc;
    this.pruneSelection();
    this.refresh();
  }

  pruneSelection() {
    for (const id of [...this.selection]) {
      if (!elementById(this.doc, id)) {
        this.selection.delete(id);
      }
    }
    this.pruneActiveNode();
    this.keepPickedSide();
  }

  /* ---------------- chrome ---------------- */

  /*
   * MOVE THE WHOLE PRODUCT TO A CLASS.
   *
   * Nothing is converted and nothing is lost. Each class has its own canvas,
   * so this puts the current one away, seats the aircraft that flies the
   * other, and opens whatever was left there, or a blank track of that class
   * on a first visit.
   *
   * Converting was the alternative and it is worse in both directions: a 5 ft
   * gate scaled to 28 inches is not a RaceGOW gate, it is a MultiGP gate
   * somebody shrank, and a room's layout stretched onto sixty metres is a
   * track nobody designed. Two canvases is what an author actually has.
   */
  setTrackClass(cls) {
    this.setCanvas(cls === 'micro' ? 'micro' : 'full');
  }

  /*
   * The same move for any of the three canvases. A map seats the five inch,
   * exactly as the 5 inch button does, because that is what flies it.
   */
  setCanvas(canvas, { arriving = false } = {}) {
    const want = canvas === 'freestyle' || canvas === 'micro' ? canvas : 'full';
    if (canvasOf(this.doc) === want) {
      return;
    }
    const cls = want === 'micro' ? 'micro' : 'full';
    const mode = want === 'freestyle' ? 'freestyle' : 'race';
    /* The canvas being left is written NOW rather than on the debounce, so
     * the last few seconds of editing are still there on the way back. */
    this.autosaver.flush();
    setActiveTrackClass(cls);
    /* readAutosave hands back { doc, repairs }, not a document: every other
     * caller in this project reads `.doc` off it and the first version of
     * this one did not, which threw inside loadDocument on the first press
     * of the toggle. */
    const held = readAutosave(cls, mode);
    const doc = (held && held.doc) || (mode === 'freestyle' ? newMap() : createTrack(undefined, cls));
    const fresh = {
      full: 'A new five inch track, on a sixty metre field.',
      micro: 'A new whoop track, in a ten by twelve metre hall.',
      freestyle: 'A new freestyle map, on a 160 metre plot.',
    }[want];
    /*
     * WHAT THE SWITCH DID, said (MENUS-PLAN.md 4.2c). It has two effects an
     * author cannot see: the undo history is this canvas's from here on, and
     * the simulator's seated aircraft is the one this canvas is for. Both were
     * silent, so an Undo after a switch said there was nothing to undo, and the
     * next flight was on another aircraft.
     */
    const w = CANVAS_WORDS[want];
    const what = held && held.doc ? `${w.label}: "${doc.name}", as you left it.` : fresh;
    /* Picked on arrival, from the chooser, there is no undo history yet to
     * start again. */
    const undo = arriving ? '' : ' Undo starts again here, and';
    this.loadDocument(doc, `${what}${undo || ''}${undo ? ' the' : ' The'} simulator will fly ${w.flies}${want === 'freestyle' ? ' on this map' : ''}.`);
  }

  /*
   * THE CHOOSER: the three canvases as the gate's three picture cards, over
   * the whole page, on arrival. See asksCanvas for when, and CHOICES for why
   * these cards.
   *
   * A card does exactly what the switch in the bar does, through the same
   * setCanvas, so nothing is converted and nothing is lost: each canvas is
   * its own seat. The switch stays where it was, and when the chooser closes
   * the switch is pointed at, so the way back is seen once rather than
   * found later.
   *
   * The cursor is the keyboard focus, drawn as the gate draws its cursor: a
   * sakura ring and a sakura name. It opens on the canvas already behind
   * the chooser, which is the one the builder reopened on, the way the
   * gate's cursor opens on the seated aircraft's card. Enter keeps it, and
   * so do Escape, Close and a click outside: closing is an answer too, and
   * it is "the one behind".
   *
   * Real buttons, not the gate's role=button divs. The gate's Enter is its
   * own handler's; here Enter and Space are the browser's, and the page's
   * keys are held while the chooser is up (see bindKeys), so nothing behind
   * it arms a tool or flips the view.
   */
  openChooser() {
    const now = canvasOf(this.doc);
    const body = document.createElement('div');
    const lede = document.createElement('p');
    lede.className = 'tb-help tb-choose-lede';
    lede.textContent = `Each keeps its own work, so nothing is lost by picking. The ${CANVAS_ORDER.map((c) => CANVAS_WORDS[c].label).join(', ').replace(/, ([^,]*)$/, ' and $1')} switch at the top left moves between them any time.`;
    const grid = document.createElement('div');
    grid.className = 'tb-choose';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Which canvas');
    let current = null;
    for (const c of CHOICES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'tb-choose-card';
      card.dataset.canvas = c.canvas;
      const art = document.createElement('span');
      art.className = 'tb-choose-art';
      const img = document.createElement('img');
      img.className = 'tb-choose-shot';
      img.src = c.art;
      /* The name is right under it. */
      img.alt = '';
      img.decoding = 'async';
      art.append(img);
      const text = document.createElement('span');
      text.className = 'tb-choose-body';
      const name = document.createElement('span');
      name.className = 'tb-choose-name';
      name.textContent = c.label;
      const blurb = document.createElement('span');
      blurb.className = 'tb-choose-blurb';
      blurb.textContent = c.blurb;
      const facts = document.createElement('span');
      facts.className = 'tb-choose-facts';
      for (const f of c.facts) {
        const fact = document.createElement('span');
        fact.className = 'tb-choose-fact';
        fact.textContent = f;
        facts.append(fact);
      }
      text.append(name, blurb, facts);
      card.append(art, text);
      if (c.canvas === now) {
        card.setAttribute('aria-current', 'true');
        current = card;
      }
      card.addEventListener('click', () => this.chooseCanvas(c.canvas));
      /* The ring is the cursor, as on the gate, and the cursor follows the
       * pointer there, so it does here: the card under the pointer takes
       * the focus and the ring with it, and there is never one card ringed
       * while another is about to be picked. */
      card.addEventListener('pointerenter', () => card.focus({ preventScroll: true }));
      grid.append(card);
    }
    /* Arrows walk the cards, as they walk the gate's. */
    grid.addEventListener('keydown', (e) => {
      const cards = [...grid.querySelectorAll('.tb-choose-card')];
      const at = cards.indexOf(document.activeElement);
      if (at < 0) {
        return;
      }
      const to = {
        ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1,
        Home: 0, End: cards.length - 1,
      }[e.key];
      if (to === undefined) {
        return;
      }
      e.preventDefault();
      cards[Math.max(0, Math.min(cards.length - 1, to))].focus();
    });
    body.append(lede, grid);
    this.modal('What are you building?', body, [], { cls: 'tb-chooser' });
    this.afterModal = () => this.pointAtSwitch();
    (current || grid.querySelector('.tb-choose-card')).focus();
  }

  /* Whether the chooser is the dialog that is up. */
  choosing() {
    return !this.nodes.modal.hidden && Boolean(this.nodes.modal.querySelector('.tb-choose'));
  }

  chooseCanvas(canvas) {
    this.closeModal();
    this.setCanvas(canvas, { arriving: true });
  }

  /* Two sakura pulses round the switch in the bar, which is the way back to
   * the other canvases once the chooser has gone. Reduced motion flattens
   * them to nothing, like every other animation here. */
  pointAtSwitch() {
    const t = this.classToggle;
    if (!t) {
      return;
    }
    t.classList.remove('tb-class-hint');
    /* A read of the layout between the two, so a second chooser in one
     * session pulses again rather than finding the class already there. */
    void t.offsetWidth;
    t.classList.add('tb-class-hint');
    t.addEventListener('animationend', () => t.classList.remove('tb-class-hint'), { once: true });
  }

  buildTopBar() {
    const bar = this.nodes.topbar;
    bar.textContent = '';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'tb-name';
    name.value = this.doc.name;
    name.dataset.tbkey = 'track-name';
    name.addEventListener('change', () => {
      this.edit('rename track', (d) => { d.name = name.value || 'Untitled track'; });
      this.syncNameIfOwned();
    });
    this.nameInput = name;

    const group = (...kids) => {
      const g = document.createElement('div');
      g.className = 'tb-bargroup';
      g.append(...kids);
      return g;
    };
    const btn = (label, onClick, title, cls = 'tb-btn') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      if (title) {
        b.title = title;
      }
      b.addEventListener('click', onClick);
      return b;
    };

    this.undoBtn = btn('Undo', () => this.undo(), 'Control Z');
    this.redoBtn = btn('Redo', () => this.redo(), 'Control Shift Z');
    /*
     * ONE VIEW VOCABULARY (MENUS-PLAN.md 4.2): 2D and 3D on every canvas, and
     * V goes between them. On the five inch and map canvases 2D is where a
     * track is built and 3D previews it; on the whoop canvas 3D is where it is
     * built, so 3D comes first there. The whoop's view straight down was a
     * third view called Plan beside one called 2D, two plans; it is a camera
     * now, Top, beside Fit, because it is the same room seen from above.
     * Any press on a view button is the author's own choice, and the room
     * opening by itself on a whoop canvas never overrules it.
     */
    this.mode2d = btn('2D', () => this.show2d(), 'Top down authoring view');
    this.mode3d = btn('3D', () => this.show3d(), 'Preview');
    this.topBtn = btn('Top', () => this.toggleTop(), 'Look straight down on the room, north up, for measuring. Press again for the angle you had. Every gesture is the same.');
    /* Plain, not primary. There is one green button on this bar and it is
     * the one that leaves for the air; a second would make neither read as
     * the thing to press. Show line goes amber while a line is showing,
     * which is the state that matters. */
    /* The line is derived on every edit now, so this only paints it. */
    this.pathBtn = btn('Show line', () => this.togglePath(), 'Draw the racing line on the canvas');
    this.labelsBtn = btn('Labels', () => this.toggleLabels(), 'Flying-order numbers on the gates. Turn them off to see the racing line.');
    /* Whoop canvas only: with it off, a click in a gate is a click on the gate. */
    this.bendBtn = btn('Bend line', () => this.toggleBendLine(), 'Drag the racing line to bend it into a waypoint. Off, a click on a gate is a click on the gate.');

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.style.display = 'none';
    file.addEventListener('change', () => {
      this.importFile(file.files[0]);
      file.value = '';
    });
    this.fileInput = file;

    /*
     * The whole point of the tool, in one button. It flushes the autosave
     * first and then links to the game with the map named in the URL, so the
     * course on this canvas is the course in the air a moment later. The
     * autosave is what the game reads, not a saved track, because asking
     * somebody to remember to press Save before they fly is asking them to
     * fly the wrong track once.
     */
    this.flyBtn = btn('Fly this track', () => this.flyThisTrack(), 'Build the world around this track and fly it', 'tb-btn tb-primary');
    this.publishBtn = btn('Publish', () => this.openPublish(), 'Put this track on the public board, logos and all', 'tb-btn tb-publish');
    this.listingChip = document.createElement('span');
    this.listingChip.className = 'tb-listing';

    /* Back to the simulator names the world and the aircraft this canvas is
     * for, so the simulator opens on its title with this work seated rather
     * than asking what to fly all over again (MENUS-PLAN.md 1.24 and 5.2a).
     * The address follows the canvas: see updateTopBar. */
    const back = document.createElement('a');
    back.className = 'tb-btn tb-quiet tb-back';
    back.href = simulatorLink(this.doc);
    back.textContent = 'Back to the simulator';
    this.backLink = back;

    /*
     * THREE ZONES, NOT SEVENTEEN BUTTONS.
     *
     * This bar was one flat row of seventeen controls at a single weight,
     * which wrapped, so on any normal window Publish and Fly this track,
     * the two things this whole tool exists to reach, landed on a second
     * row while Duplicate sat on the first. The zones are what the buttons
     * already were: what the course IS (file), what you are doing to it
     * (canvas), and where it goes (publish and fly).
     *
     * The file zone's rarely used half sits behind More, so Import, Export,
     * Duplicate and Delete stop competing with Save. Delete asks first: it
     * used to sit inline beside Save and remove a course on one click.
     */
    this.moreWrap = document.createElement('div');
    this.moreWrap.className = 'tb-more';
    /* A click a keyboard made has no pointer position and a detail of 0. */
    this.moreBtn = btn('More', (e) => this.toggleMore(e.detail === 0), 'Import, export, duplicate, delete');
    this.moreMenu = document.createElement('div');
    this.moreMenu.className = 'tb-more-menu';
    this.moreMenu.id = 'tb-more-menu';
    this.moreMenu.hidden = true;
    this.moreMenu.setAttribute('role', 'menu');
    this.moreMenu.setAttribute('aria-label', 'More');
    this.moreBtn.setAttribute('aria-haspopup', 'menu');
    this.moreBtn.setAttribute('aria-expanded', 'false');
    this.moreBtn.setAttribute('aria-controls', 'tb-more-menu');
    /* The arrows, Home and End walk the items; Escape is the page's (bindKeys)
     * and closes it from anywhere; Tab out of it closes it. */
    this.moreMenu.addEventListener('keydown', (e) => {
      const items = this.moreItemsShown();
      const at = items.indexOf(document.activeElement);
      const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
      if (to !== undefined && items.length) {
        e.preventDefault();
        items[(to + items.length) % items.length].focus();
      }
    });
    this.moreWrap.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !this.moreWrap.contains(e.relatedTarget)) {
        this.closeMore();
      }
    });
    /* Kept by name, because a map words them differently and has no lap to
     * animate. */
    this.moreItems = new Map();
    for (const [id, label, fn, title, cls] of [
      ['duplicate', 'Duplicate', () => this.duplicate(), 'Copy this track under a new name', ''],
      ['import', 'Import', () => this.openImport(), 'Read a .json track file, or paste one', ''],
      ['export', 'Export', () => this.exportFile(), 'Write a .json track file', ''],
      /* The whoop room's three ways out: a link, a picture and a sheet to build from. */
      ['link', 'Copy share link', () => this.copyShareLink(), 'A link that carries the whole track, for a chat message. It opens as a copy.', ''],
      ['sheet', 'Build sheet', () => this.openSheet(), 'A page to print: where every piece stands, measured from a corner, and what pipe and fittings to buy', ''],
      ['picture', 'Picture', () => this.savePicture(), 'Save a picture of the room as it is on the screen, numbers and all', ''],
      ['animation', 'Export animation', () => this.exportAnimation(), 'Write a looping .gif of one lap', ''],
      ['delete', 'Delete', () => this.confirmRemove(), 'Remove this track from this browser', 'tb-danger'],
    ]) {
      const b = btn(label, () => { this.closeMore(); fn(); }, title, `tb-more-item ${cls}`.trim());
      b.setAttribute('role', 'menuitem');
      this.moreItems.set(id, b);
      this.moreMenu.append(b);
    }
    this.moreWrap.append(this.moreBtn, this.moreMenu);
    document.addEventListener('mousedown', (e) => {
      if (this.moreWrap && !this.moreWrap.contains(e.target)) {
        this.closeMore();
      }
    });

    /*
     * THE CLASS TOGGLE, AND IT IS THE FIRST THING ON THE BAR.
     *
     * These are two different tools. A five inch builder is 5 ft gates on a
     * sixty metre field with a grid in metres; a whoop builder is 28 inch
     * gates out of 26.7 mm PVC on a five by six metre floor with a grid in
     * inches, a different palette, different presets and RaceGOW's own rules
     * checking the layout. Everything on this page changes with it, so it
     * cannot be a line of read only text in a side panel where it was: an
     * author who opened the wrong one found out several gates in.
     *
     * It is also the SAME switch the simulator's aircraft choice is, and
     * pressing it here seats that aircraft. That is the whole point: one
     * answer governs the builder, the world behind the title, the track the
     * shell flies and the tracks the board offers.
     *
     * Each class keeps its own canvas, so this never destroys work: the
     * track you were building is still there when you come back. See
     * autosaveKey in storage.js.
     */
    this.classToggle = document.createElement('div');
    this.classToggle.className = 'tb-class';
    this.classToggle.setAttribute('role', 'group');
    this.classToggle.setAttribute('aria-label', 'Which canvas');
    this.classBtns = new Map();
    /*
     * THE THIRD CANVAS IS A MAP, not a third class. It is flown on the five
     * inch, so choosing it seats the five inch exactly as the first button
     * does; what it changes is what the document IS: a place made of
     * assets, with no flying order through it.
     *
     * THE GATE'S WORDS, Five inch, Whoop and Freestyle, each titled with
     * what it makes. It said "5 inch" here and "Five inch racing" on the
     * simulator's gate, two spellings of one choice (MENUS-PLAN.md 4.1).
     */
    for (const canvas of CANVAS_ORDER) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-class-btn';
      b.textContent = CANVAS_WORDS[canvas].label;
      b.title = CANVAS_WORDS[canvas].makes;
      b.addEventListener('click', () => this.setCanvas(canvas));
      this.classBtns.set(canvas, b);
      this.classToggle.append(b);
    }

    /* The storage notice once it has been read: a line beside Save, with the
     * sentence in its title, and a press says the sentence for a screen that
     * has no pointer to hover with. See SAVED_ONCE_KEY. */
    this.keptChip = btn('Saved in this browser', () => this.toast(this.keptChip.title), '', 'tb-kept');
    const zoneFile = document.createElement('div');
    zoneFile.className = 'tb-zone tb-zone-file';
    zoneFile.append(
      /* The page is the Builder, whichever canvas it is on: the glossary's
       * one name for it, where this bar, its tab and the simulator's gate had
       * three between them (MENUS-PLAN.md 4.1). */
      Object.assign(document.createElement('span'), { className: 'tb-title', textContent: 'Builder' }),
      this.classToggle,
      name,
      Object.assign(group(
        (this.newBtn = btn('New', () => this.newTrack(), 'Start a blank track', 'tb-btn tb-new')),
        (this.saveBtn = btn('Save', () => this.save(), 'Control S', 'tb-btn tb-save')),
        (this.loadBtn = btn('Load', () => this.openLoad(), 'Open a saved track')),
      ), { className: 'tb-bargroup tb-file-group' }),
      this.keptChip,
      this.moreWrap,
    );

    const zoneEdit = document.createElement('div');
    zoneEdit.className = 'tb-zone tb-zone-edit';
    this.viewGroup = Object.assign(group(this.mode2d, this.mode3d), { className: 'tb-bargroup tb-view-group' });
    this.logosBtn = btn('Sponsor logos', () => this.openLogo(), 'Up to five sponsors\u2019 logos, shared out over the gates, the flags and the grass');
    zoneEdit.append(
      Object.assign(group(this.undoBtn, this.redoBtn), { className: 'tb-bargroup tb-undo-group' }),
      this.viewGroup,
      Object.assign(group(
        (this.fitBtn = btn('Fit', () => this.frameAll(), 'Frame the whole field')),
        this.topBtn,
        this.pathBtn,
        this.bendBtn,
        this.labelsBtn,
        this.logosBtn,
      ), { className: 'tb-bargroup tb-show-group' }),
    );

    const zoneOut = document.createElement('div');
    zoneOut.className = 'tb-zone tb-zone-out';
    /* The listing chip moved here from beside the track name. It says
     * whether this track is on the board, which is the question the button
     * next to it answers, and the file zone needed the 130 px once the class
     * toggle joined it. */
    zoneOut.append(this.listingChip, this.publishBtn, this.flyBtn, back);

    /*
     * A PHONE'S TWO DRAWERS, opened from the bar (MENUS-PLAN.md 4.4). Under
     * 500 px either way the palette and the side column are drawers over the
     * drawing, which gets the screen, and these are their buttons; the bar's
     * second row folds into More (buildPhoneMenu). The stylesheet's phone block
     * shows them and lays the bar out; on a bigger screen they are not there.
     */
    this.toolsBtn = btn('Tools', (e) => this.toggleTools(null, { keys: e.detail === 0 }), 'The palette: pick a piece, then tap where it goes', 'tb-btn tb-phone-only tb-tools-btn');
    this.toolsBtn.setAttribute('aria-controls', 'tb-palette');
    this.toolsBtn.setAttribute('aria-expanded', 'false');
    this.detailsBtn = btn('Details', (e) => this.toggleDrawer(null, { from: e.currentTarget, keys: e.detail === 0 }),
      'What is selected, the flying order and the results', 'tb-btn tb-phone-only tb-details-btn');
    this.detailsBtn.setAttribute('aria-controls', 'tb-side');
    this.detailsBtn.setAttribute('aria-expanded', 'false');
    /* Where a portrait phone's bar turns to its second row. */
    const turn = Object.assign(document.createElement('span'), { className: 'tb-bar-turn' });
    this.buildPhoneMenu(btn);

    bar.append(this.toolsBtn, zoneFile, zoneEdit, zoneOut, this.detailsBtn, turn, file);
    /* On the keep strip, not in the toolbar. The toolbar is already the
     * width of its three zones, and a pill in it cuts the last edit button.
     * Once the strip has been read and is folded away it moves to the foot of
     * More, as Support on Patreon: see placeKeep. */
    this.keepNode = document.getElementById('tb-keep');
    this.keepText = document.getElementById('tb-keep-text');
    this.patreon = patreonAnchor();
    this.updateTopBar();
  }

  /*
   * MORE, ON A PHONE: the bar's second row and its quieter half, folded in
   * (MENUS-PLAN.md 4.4). A phone's bar holds the two drawers, the name, Undo,
   * Redo, Load, More and Fly, and everything else the bar carries on a bigger
   * screen is here, the same buttons doing the same things, in the order the
   * bar has them: the canvas, the file, the view, the logos, Publish, the rest
   * of More, and the way back. The stylesheet shows them only on a phone, and
   * updateTopBar keeps their state with the bar's (syncPhoneMenu).
   *
   * They go into the menu IN THAT ORDER, ahead of More's own items, rather than
   * being put there by the stylesheet: the arrow keys walk the menu in the
   * order of its nodes, and More opened from the keyboard puts the keyboard on
   * its first, so a menu drawn in one order and walked in another opened
   * scrolled to its middle, on Duplicate.
   */
  buildPhoneMenu(btn) {
    const menu = this.moreMenu;
    const head = menu.firstChild;
    const item = (id, label, fn, title, cls = '') => {
      const b = btn(label, () => { this.closeMore(); fn(); }, title, `tb-more-item tb-phone-only ${cls}`.trim());
      b.setAttribute('role', 'menuitem');
      b.dataset.phone = id;
      this.phoneItems.set(id, b);
      menu.insertBefore(b, head);
      return b;
    };
    /* A row of choices inside the menu: the canvas, and the view. */
    const seg = (id, label, choices) => {
      const row = document.createElement('div');
      row.className = 'tb-more-seg tb-phone-only';
      row.dataset.phone = id;
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', label);
      for (const [key, words, fn, title] of choices) {
        const b = btn(words, () => { this.closeMore(); fn(); }, title, 'tb-more-item tb-more-seg-btn');
        b.setAttribute('role', 'menuitemradio');
        b.dataset.choice = key;
        row.append(b);
      }
      this.phoneItems.set(id, row);
      menu.insertBefore(row, head);
    };
    this.phoneItems = new Map();
    seg('canvas', 'Which canvas', CANVAS_ORDER.map((c) => [c, CANVAS_WORDS[c].label, () => this.setCanvas(c), CANVAS_WORDS[c].makes]));
    item('new', 'New', () => this.newTrack(), 'Start a blank one');
    item('save', 'Save', () => this.save(), 'Keep it in Load, in this browser');
    seg('view', 'View', [
      ['2d', '2D', () => this.show2d(), 'The plan from above'],
      ['3d', '3D', () => this.show3d(), 'The track in 3D'],
    ]);
    item('fit', 'Fit', () => this.frameAll(), 'Frame the whole of it');
    item('top', 'Top', () => this.toggleTop(), 'Look straight down on the room');
    item('line', 'Show line', () => this.togglePath(), 'Draw the racing line');
    item('bend', 'Bend line', () => this.toggleBendLine(), 'Drag the racing line to bend it');
    item('labels', 'Labels', () => this.toggleLabels(), 'Numbers and names on the drawing');
    item('logos', 'Sponsor logos', () => this.openLogo(), 'Up to five sponsors’ logos');
    item('publish', 'Publish', () => this.openPublish(), 'Put it on the board');
    const back = document.createElement('a');
    back.className = 'tb-more-item tb-phone-only';
    back.setAttribute('role', 'menuitem');
    back.dataset.phone = 'back';
    back.textContent = 'Back to the simulator';
    this.phoneItems.set('back', back);
    menu.append(back);
  }

  /* The phone's More items say what the bar's buttons say: see buildPhoneMenu. */
  syncPhoneMenu() {
    const p = this.phoneItems;
    if (!p) {
      return;
    }
    const whoop = this.isWhoopRace();
    const map = docModeOf(this.doc) === 'freestyle';
    const check = (node, on) => {
      node.setAttribute('aria-checked', on ? 'true' : 'false');
      node.classList.toggle('on', on);
    };
    const canvas = canvasOf(this.doc);
    for (const b of p.get('canvas').children) {
      check(b, b.dataset.choice === canvas);
    }
    const view = p.get('view');
    for (const b of view.children) {
      check(b, b.dataset.choice === this.mode);
    }
    /* 3D first where it is the tool, as on the bar. */
    const lead = view.querySelector(`[data-choice="${whoop ? '3d' : '2d'}"]`);
    if (view.firstElementChild !== lead) {
      view.prepend(lead);
    }
    const plan = this.mode === '3d' && this.view3d.isPlan();
    p.get('top').hidden = !(whoop && this.mode === '3d');
    check(p.get('top'), whoop && plan);
    p.get('line').hidden = map;
    check(p.get('line'), this.pathVisible);
    p.get('bend').hidden = !whoop;
    check(p.get('bend'), this.bendLine);
    check(p.get('labels'), this.labelsVisible);
    p.get('new').textContent = map ? 'New map' : 'New track';
    p.get('publish').textContent = this.publishBtn.textContent;
    p.get('back').href = simulatorLink(this.doc);
  }

  /*
   * THE STORAGE NOTICE, in the canvas's noun, as a strip until this browser
   * has saved something and as the line beside Save after that. The Patreon
   * link goes where the notice is not: on the strip while it is up, and at the
   * foot of More once it is folded away.
   */
  placeKeep() {
    const noun = wordsFor(this.doc).noun;
    const sentence = keepSentence(noun);
    if (this.keepText) {
      this.keepText.textContent = sentence;
    }
    const folded = savedOnce();
    if (this.keepNode) {
      this.keepNode.hidden = folded;
    }
    this.keptChip.hidden = !folded;
    this.keptChip.title = `This browser only. ${sentence}`;
    if (!this.patreon) {
      return;
    }
    /* A phone has no strip at all (the stylesheet's phone block), so there it
     * is in More from the start. */
    const inMenu = folded || isPhone();
    const home = inMenu ? this.moreMenu : this.keepNode;
    if (home && this.patreon.parentElement !== home) {
      home.append(this.patreon);
    }
    this.patreon.classList.toggle('tb-more-item', inMenu);
    this.patreon.setAttribute('role', inMenu ? 'menuitem' : 'link');
    this.patreon.lastElementChild.textContent = inMenu ? 'Support on Patreon' : 'Patreon';
  }

  updateTopBar() {
    if (this.nameInput && document.activeElement !== this.nameInput) {
      this.nameInput.value = this.doc.name;
    }
    this.undoBtn.disabled = !this.history.canUndo();
    this.redoBtn.disabled = !this.history.canRedo();
    this.undoBtn.title = this.history.canUndo() ? `Undo ${this.history.undoLabel()}` : 'Nothing to undo';
    this.redoBtn.title = this.history.canRedo() ? `Redo ${this.history.redoLabel()}` : 'Nothing to redo';
    const whoop = this.isWhoopRace();
    const plan = this.mode === '3d' && this.view3d.isPlan();
    this.mode2d.classList.toggle('on', this.mode === '2d');
    this.mode3d.classList.toggle('on', this.mode === '3d');
    this.mode2d.setAttribute('aria-pressed', this.mode === '2d' ? 'true' : 'false');
    this.mode3d.setAttribute('aria-pressed', this.mode === '3d' ? 'true' : 'false');
    /* 3D first where it is the tool, 2D first where it is. */
    const lead = whoop ? this.mode3d : this.mode2d;
    if (this.viewGroup && this.viewGroup.firstElementChild !== lead) {
      this.viewGroup.prepend(lead);
    }
    this.mode2d.title = whoop
      ? 'The plan from above, the canvas this builder has always had. V for 3D'
      : 'Build here, on the plan from above. V for the 3D preview';
    this.mode3d.title = whoop
      ? 'Build here, in 3D: pick a gate on the left, click the floor, drag a gate to move it. V for 2D'
      : 'A 3D preview: building is in 2D. Drag a horizontal pole or a waypoint here to change its height; everything else stands on the ground, or on what is under it on a map. V for 2D';
    /* Top is a camera of the whoop's 3D, beside Fit, lit while it looks down. */
    this.topBtn.style.display = whoop && this.mode === '3d' ? '' : 'none';
    this.topBtn.classList.toggle('on', whoop && plan);
    this.topBtn.setAttribute('aria-pressed', whoop && plan ? 'true' : 'false');
    this.bendBtn.style.display = whoop ? '' : 'none';
    this.bendBtn.classList.toggle('on', this.bendLine);
    /* The whoop canvas's layout: the side column is a drawer and the room's own
     * chrome is shown. See the block in index.html. */
    document.body.classList.toggle('tb-whoop', whoop);
    this.fitBtn.title = whoop ? 'Frame the track' : `Frame the whole ${wordsFor(this.doc).place}`;
    const map = docModeOf(this.doc) === 'freestyle';
    if (this.classBtns) {
      const canvas = canvasOf(this.doc);
      for (const [id, b] of this.classBtns) {
        b.classList.toggle('on', id === canvas);
        b.setAttribute('aria-pressed', id === canvas ? 'true' : 'false');
      }
    }
    this.pathBtn.classList.toggle('on', this.pathVisible);
    this.labelsBtn.classList.toggle('on', this.labelsVisible);
    /*
     * A MAP'S BAR. No line to show, no lap to animate, and nothing the board
     * can take yet, so those go or say why; the words that said "track" say
     * "map". Everything else on the bar works on a map as it does on a
     * track. A map has no flying order and so no numbers, but it has names:
     * the named gaps' labels in both views and the names on the plan, and
     * Labels puts those away so the map can be seen. The selected element
     * keeps its name, and a car off its road keeps its warning.
     */
    this.pathBtn.style.display = map ? 'none' : '';
    this.labelsBtn.title = map
      ? 'The named gaps\u2019 labels and the names on the plan. Turn them off to see the map.'
      : 'Flying-order numbers on the gates. Turn them off to see the racing line.';
    document.body.classList.toggle('tb-map', map);
    /* The status bar's hints for the 3D view's own gestures. */
    document.body.classList.toggle('tb-in-3d', this.mode === '3d');
    /* "Fly", and the rest of the sentence in a span a portrait phone's bar
     * leaves out for room; the button's text is still the whole of it. */
    this.flyBtn.replaceChildren('Fly', Object.assign(document.createElement('span'), {
      className: 'tb-long', textContent: map ? ' this map' : ' this track',
    }));
    this.flyBtn.title = map
      ? 'Build this map in the town\u2019s style and fly it on the five inch'
      : 'Build the world around this track and fly it';
    this.newBtn.title = map ? 'Start a blank map' : 'Start a blank track';
    this.loadBtn.title = map ? 'Open a saved map' : 'Open a saved track';
    if (this.moreItems) {
      const noun = map ? 'map' : 'track';
      this.moreItems.get('duplicate').title = `Copy this ${noun} under a new name`;
      this.moreItems.get('import').title = `Read a .json ${noun} file`;
      this.moreItems.get('export').title = `Write a .json ${noun} file`;
      this.moreItems.get('delete').title = `Remove this ${noun} from this browser`;
      this.moreItems.get('animation').style.display = map ? 'none' : '';
      /* The share link is a race track's, on either canvas (MENUS-PLAN.md
       * 4.2b); the build sheet and the picture are the room's. */
      this.moreItems.get('link').style.display = map ? 'none' : '';
      for (const id of ['sheet', 'picture']) {
        this.moreItems.get(id).style.display = whoop ? '' : 'none';
      }
    }
    if (map && this.listingChip && this.publishBtn) {
      /* A map's listing is its own key, and there is no chip for it: the
       * button's word says whether this map is on the board. */
      const listed = Boolean(readMapListing(this.doc.id));
      this.listingChip.style.display = 'none';
      this.publishBtn.textContent = listed ? 'Update board' : 'Publish';
      this.publishBtn.title = listed
        ? 'This map is on the public board. Send this version up in its place.'
        : PUBLISH_MAP_TITLE;
      this.publishBtn.classList.remove('tb-off');
      this.publishBtn.removeAttribute('aria-disabled');
    } else if (this.listingChip && this.publishBtn) {
      this.listingChip.style.display = '';
      this.publishBtn.classList.remove('tb-off');
      this.publishBtn.removeAttribute('aria-disabled');
    }
    if (!map && this.listingChip && this.publishBtn) {
      const listing = this.listingOfCanvas();
      /* The words come from courseChip in src/share/listing.js, which is
       * also what the simulator's course cards read, so the same course
       * cannot be described one way here and another way there. */
      const chip = courseChip(listing);
      this.listingChip.className = 'tb-listing';
      this.listingChip.textContent = chip.label;
      this.listingChip.title = chip.note;
      if (chip.tone === 'live') {
        this.listingChip.classList.add('owned');
      } else if (chip.tone === 'warn') {
        this.listingChip.classList.add('remix');
      }
      if (listing.kind === 'owned') {
        this.publishBtn.textContent = listing.canUpdateListing ? 'Update board' : 'On the board';
        this.publishBtn.title = listing.layoutDrift
          ? 'The layout changed. Updating the board will clear posted times.'
          : 'This track is on the public board. A rename updates the listing.';
      } else if (listing.kind === 'remix') {
        this.publishBtn.textContent = 'Publish as yours';
        this.publishBtn.title = 'Put this copy on the board under a new name. The original stays.';
      } else {
        this.publishBtn.textContent = 'Publish';
        this.publishBtn.title = 'Put this track on the public board, logos and all';
      }
    }
    if (this.backLink) {
      this.backLink.href = simulatorLink(this.doc);
      this.backLink.title = `The simulator's title, with ${wordsFor(this.doc).flies} and this ${wordsFor(this.doc).noun} seated`;
    }
    const w = wordsFor(this.doc);
    this.logosBtn.title = map
      ? `Up to five sponsors’ logos, painted on the ${w.ground} where you put them`
      : `Up to five sponsors’ logos, shared out over the gates, the flags and the ${w.ground}`;
    this.pathBtn.title = 'Draw the racing line on the canvas. P';
    this.detailsBtn.setAttribute('aria-expanded', this.drawerOpen ? 'true' : 'false');
    this.detailsBtn.classList.toggle('on', this.drawerOpen);
    this.syncPhoneMenu();
    this.placeKeep();
    this.fitTopBar();
  }

  /*
   * THE BAR WRAPS WHEN ITS ZONES DO NOT FIT, MEASURED RATHER THAN GUESSED.
   *
   * The 1330 px media query gives the canvas zone its own row on a small
   * laptop. Above it the three zones shared one row whatever they held, and
   * on the race canvas they need about 1944 px: at 1440 and 1600 Undo, Redo,
   * 2D, Labels and Sponsor logos sat clipped under the file and outgoing
   * zones, and at 1920 Undo and Sponsor logos were still cut, because a
   * centred row that overflows spills off BOTH ends and a scroller cannot
   * reach the left one. A breakpoint cannot know the width: the bar's words
   * change with the canvas, the listing and the button labels. So this sums
   * what the zones hold and puts .tb-bar-wrap on the bar when the sum is
   * wider than the bar, which is the 1330 layout. Called when the bar's
   * words change and on resize; nothing per frame.
   */
  fitTopBar() {
    const bar = this.nodes.topbar;
    const zones = bar ? [...bar.children].filter((z) => z.classList.contains('tb-zone')) : [];
    if (zones.length !== 3) {
      return;
    }
    /* A phone's bar is laid out by the stylesheet's phone block, one row held
     * sideways and two upright, and the wide bar's wrap only spread its gaps.
     * What it measures is handed on: More hangs under it and is as tall as
     * the screen below it allows. */
    if (isPhone()) {
      bar.classList.remove('tb-bar-wrap');
      document.documentElement.style.setProperty('--tb-top-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
      return;
    }
    /* Measured on one row, as it would be drawn unwrapped: the wrapped bar
     * is tightened, and judging from that would flip it back and forth. */
    bar.classList.remove('tb-bar-wrap');
    const px = (v) => parseFloat(v) || 0;
    const content = (z) => {
      const kids = [...z.children].filter((k) => k.getBoundingClientRect().width > 0);
      const gap = px(getComputedStyle(z).columnGap);
      return kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0)
        + gap * Math.max(0, kids.length - 1);
    };
    const cs = getComputedStyle(bar);
    /* The one row's gap, not the wrapped bar's, and the edit zone's 12 px
     * fade at each end, which would otherwise dim a button that only just
     * fits. */
    const rowGap = px(cs.getPropertyValue('--s5'));
    const need = zones.reduce((sum, z) => sum + content(z), 0)
      + rowGap * (zones.length - 1)
      + px(cs.paddingLeft) + px(cs.paddingRight)
      + 24;
    bar.classList.toggle('tb-bar-wrap', need > bar.clientWidth);
  }

  async syncNameIfOwned() {
    this.autosaver.flush();
    if (!readEditKey(this.doc.id)) {
      this.updateTopBar();
      return;
    }
    try {
      const result = await syncOwnedName(toPlain(this.doc));
      if (result && result.ok) {
        this.toast(`Name updated on the board: "${this.doc.name}".`);
      } else if (result && result.skipped === 'layout-changed') {
        this.toast('The layout changed too. Update the board to send the new name.');
      }
    } catch (e) {
      this.toast(`Could not update the name on the board. ${e.message || e}`);
    }
    this.updateTopBar();
  }

  async flyThisTrack() {
    this.autosaver.flush();
    if (this.nameInput && this.nameInput.value && this.nameInput.value !== this.doc.name) {
      this.doc.name = this.nameInput.value;
    }
    /*
     * A MAP FLIES AS THE BUILT MAP, which the simulator reads from the map's
     * own autosave seat, so it is flushed again here, after the name is
     * taken from the field. There is no board listing to bind, because the
     * board does not take maps.
     */
    if (docModeOf(this.doc) === 'freestyle') {
      this.autosaver.flush();
      setActiveTrackClass('full');
      /* The map, the aircraft and fly=1: the simulator's gate opens every
       * visit unless the link names both what and which aircraft, and
       * fly=1 takes the title's Fly press too, so this press is the one
       * that puts the pilot in the air. See linkedFly in src/ui/ui.js. */
      window.location.href = '../../index.html?map=built&craft=5inch&fly=1';
      return;
    }
    if (readEditKey(this.doc.id)) {
      try {
        await pushOwnedListing(toPlain(this.doc));
      } catch (e) {
        /* Still fly. The board name can catch up. */
      }
      bindOwnedCanvas(this.doc);
    } else {
      flyCanvasWithoutListing();
    }
    /*
     * The same three answers as a map's link: the track, the aircraft its
     * class is built for, and fly=1. Without them the pilot landed on the
     * title and had to press Fly and then Go to reach the grid, for a
     * track they had just asked to fly. The owner's report on 2026-09-26:
     * Fly this track should go straight to the starting blocks.
     */
    const craft = trackClassOf(this.doc) === 'micro' ? 'whoop65' : '5inch';
    window.location.href = `../../index.html?map=custom&craft=${craft}&fly=1`;
  }

  toast(message) {
    const node = this.nodes.toast;
    node.textContent = message;
    node.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => node.classList.remove('on'), 4200);
  }

  /* `opts.cls` adds a class to the box, for a dialog that needs its own
   * width: the chooser is three picture cards across, not a column. */
  modal(title, body, actions = [], opts = {}) {
    const back = this.nodes.modal;
    /* The control that opened the first of a run of dialogs gets the keyboard
     * back when the last one closes (closeModal). */
    if (back.hidden) {
      const at = document.activeElement;
      this.modalFrom = at instanceof HTMLElement && at !== document.body ? at : null;
    }
    back.textContent = '';
    back.hidden = false;
    /* A new dialog replaces the old one's content without closing it, so
     * whatever the old one wanted run on close no longer applies. */
    this.afterModal = null;
    const box = document.createElement('div');
    box.className = opts.cls ? `tb-modal ${opts.cls}` : 'tb-modal';
    /* Said to a screen reader as what it is: a dialog, named by its title,
     * with the page behind it out of reach until it closes. */
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);
    const h = document.createElement('h2');
    h.textContent = title;
    box.append(h, body);
    const row = document.createElement('div');
    row.className = 'tb-row-btns';
    /* A dialog's own primary button (Publish) leads the row it closes from,
     * rather than standing on a line of its own above Close. */
    if (opts.primary) {
      row.append(opts.primary);
    }
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.danger ? 'tb-btn tb-danger' : 'tb-btn';
      b.textContent = a.label;
      b.addEventListener('click', () => {
        this.closeModal();
        a.run();
      });
      row.append(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tb-btn';
    close.textContent = actions.length || opts.primary ? 'Cancel' : 'Close';
    close.addEventListener('click', () => this.closeModal());
    row.append(close);
    box.append(row);
    back.append(box);
    /* The keyboard goes into the dialog, onto the box itself, so Tab reaches
     * its first control and Escape is the dialog's; a dialog with a field to
     * fill in, or a cursor of its own, moves it on from there. Not onto a
     * button: Enter on a confirm's Yes is not a thing to have happen by
     * accident. */
    box.tabIndex = -1;
    box.focus({ preventScroll: true });
    return { box, close };
    /* The backdrop click handler is bound ONCE, in the constructor. It used
     * to be registered per open with { once: true }, which only removes
     * itself when it fires: closing with a button left it attached, so a
     * session that opened five modals through their buttons carried five
     * handlers on a node that is reused. The e.target check already makes
     * it harmless while the modal is hidden. */
  }

  bindModalBackdrop() {
    const back = this.nodes.modal;
    back.addEventListener('click', (e) => {
      if (e.target === back && !back.hidden) {
        this.closeModal();
      }
    });
  }

  confirm(title, detail, run) {
    const body = document.createElement('p');
    body.className = 'tb-help';
    body.textContent = detail;
    this.modal(title, body, [{ label: 'Yes', run, danger: true }]);
  }

  closeModal() {
    const had = this.nodes.modal.contains(document.activeElement);
    this.nodes.modal.hidden = true;
    this.nodes.modal.textContent = '';
    const from = this.modalFrom;
    this.modalFrom = null;
    if (had && from && from.isConnected) {
      from.focus({ preventScroll: true });
    }
    const after = this.afterModal;
    this.afterModal = null;
    if (after) {
      after();
    }
  }

  /* ---------------- keyboard ---------------- */

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      /* Escape closes a dialog from anywhere in it, a field included: a
       * dialog whose name field had the caret ignored Escape, which is the
       * one key every dialog answers. The chooser has its own rule below. */
      if (e.key === 'Escape' && !this.nodes.modal.hidden && !this.choosing() && t && this.nodes.modal.contains(t)) {
        e.preventDefault();
        this.closeModal();
        return;
      }
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        return;
      }
      /* The build sheet is a page laid over the whole builder, and nothing behind it
       * moves while it is open: a Delete meant for the sheet must not take a gate
       * out from under it. Escape puts it away. */
      const sheet = document.getElementById('tb-sheet');
      if (sheet && !sheet.hidden) {
        if (e.key === 'Escape') {
          sheet.hidden = true;
        }
        return;
      }
      /* The chooser is a question, and nothing behind it moves while it is
       * asked. It opens before the author has touched anything, so a first
       * key pressed at it (G for a gate, V for the 3D view, Delete) would
       * otherwise land on a canvas they have not chosen yet. Its own keys,
       * the arrows, Enter and Space, are handled on its cards. */
      if (this.choosing()) {
        if (e.key === 'Escape') {
          this.closeModal();
        }
        return;
      }
      /* Every other dialog holds the page's keys the same way: G pressed over
       * Load armed a gate behind it, and Delete took one away. */
      if (!this.nodes.modal.hidden) {
        if (e.key === 'Escape') {
          this.closeModal();
        }
        return;
      }
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.save();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.setSelection(this.doc.elements.map((el) => el.id));
        return;
      }
      /* Control D copies on a whoop canvas, and would otherwise be the
       * browser's bookmark. Elsewhere it is left to the browser. */
      if (mod && e.key.toLowerCase() === 'd' && this.isWhoopRace()) {
        e.preventDefault();
        this.copySelection();
        return;
      }
      if (mod) {
        return;
      }

      /* A road being laid: Enter finishes it open, Escape puts it away and
       * leaves the tool armed, and Backspace takes back the last node. */
      if (this.roadDraft && this.nodes.modal.hidden) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.finishDraft(false);
          return;
        }
        if (e.key === 'Escape') {
          this.cancelDraft();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          this.undoDraftNode();
          return;
        }
      }
      /*
       * ESCAPE PUTS AWAY THE NEAREST THING, in this order: a dialog, the More
       * menu (and the keyboard goes back to More), a phone's tools drawer, the
       * side drawer, an armed tool, a picked pipe, and last the selection. The
       * drawer used to come nowhere, so Escape with it open let go of the
       * selection and left the drawer over half the room (MENUS-PLAN.md 1.18).
       */
      if (e.key === 'Escape') {
        if (!this.nodes.modal.hidden) {
          this.closeModal();
        } else if (this.closeMore(true)) {
          /* The menu is shut and More has the keyboard. */
        } else if (this.closeTools()) {
          /* The palette drawer of a phone is shut. */
        } else if (this.drawerOpen) {
          this.toggleDrawer(false);
        } else if (this.armed) {
          this.disarm();
        } else if (this.clearPickedSide()) {
          /* Let go of the picked pipe and keep the gate selected. */
        } else {
          this.setSelection([]);
        }
        return;
      }
      if (this.armed === 'route' && (e.key === 'Delete' || e.key === 'Backspace')) {
        /* In Fly order the key takes the last pass off the lap, not the piece. */
        e.preventDefault();
        this.removeLastPassOfLap();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        /* A picked node of the selected road goes, not the road; a picked
         * pipe goes on its own; otherwise the selection goes. */
        this.pruneActiveNode();
        if (this.activeNode) {
          this.deleteRoadNode(this.activeNode.id, this.activeNode.index);
          return;
        }
        if (this.pickedSide) {
          this.removePickedSide();
        } else {
          this.deleteSelection();
        }
        return;
      }
      if (e.key === 'x' || e.key === 'X') {
        this.flipSelectedFace();
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        this.viewChosen = true;
        this.toggleView();
        return;
      }
      /* The arrows nudge on a whoop canvas: a grid square, or six inches with
       * Shift. Where an armed tool or a road is being laid they are left alone. */
      if (this.isWhoopRace() && !this.armed && this.selection.size
        && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        this.nudgeSelection(e.key.slice(5).toLowerCase(), e.shiftKey);
        return;
      }
      if ((e.key === 'f' || e.key === 'F') && this.isWhoopRace()) {
        this.frameSelection();
        return;
      }
      if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
        this.nudgeYaw((e.key === 'q' || e.key === 'Q') ? 15 : -15);
        return;
      }
      if (e.key === 'Home') {
        this.frameAll();
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        this.togglePath();
        return;
      }

      /* A whoop canvas's tools that are not pieces: H lays a row, K a cube, M is
       * the ruler and N the fly order. */
      const tool = this.isWhoopRace() ? toolByKey(e.key) : undefined;
      if (tool) {
        this.pickTool(tool.id);
        return;
      }

      /* The palette's own keys: a map's are not a track's. */
      const def = elementByKey(e.key, trackClassOf(this.doc), docModeOf(this.doc));
      if (def) {
        this.pickTool(def.id);
      }
    });
  }

  nudgeYaw(degrees) {
    if (!this.selection.size) {
      return;
    }
    this.edit('rotate', (d) => {
      /* A cube turns a quarter about its middle with every face; the pieces that are not in a group turn as they do. */
      turnGroups(d, [...this.selection], Math.sign(degrees) * QUARTER);
      for (const id of this.selection) {
        const element = elementById(d, id);
        /* A road turns by its nodes and a vehicle by its road. */
        if (element && !element.group && ![KIND.ANNOTATION, KIND.ROAD, KIND.VEHICLE].includes(kindOf(element))) {
          /* A whoop gate steps a quarter turn, which is what RaceGOW can
           * build; a building steps a whole quarter turn, from wherever the
           * compass has it, rather than fifteen degrees it cannot hold. */
          if (turnStepFor(this.doc, element) === QUARTER) {
            setYaw(d, id, nearestQuarter(element.yaw + Math.sign(degrees) * QUARTER));
          } else if (turnsOf(element.type) === 'quarter') {
            setYaw(d, id, snapYaw(element.type, snapYaw(element.type, element.yaw) + Math.sign(degrees) * QUARTER_TURN));
          } else {
            /* From where a marker's square sits, not its stored yaw: see
             * shownYaw. Everything else, shownYaw returns its own yaw. */
            setYaw(d, id, this.shownYaw(element) + degrees * RAD);
          }
        }
      }
    });
    for (const id of this.selection) {
      this.rememberYaw(elementById(this.doc, id));
    }
  }
}

/* Read a track handed in through the URL, so a track can be linked to. Used
 * by index.html at boot and kept here so app.js owns every way a document
 * can arrive. */
export function docFromLocation() {
  /* Decoded once, by the module that owns the link's format: see sharelink.js,
   * and then out of the address: see dropUrlParams. */
  const doc = docFromQuery(window.location.search);
  dropUrlParams('track');
  return doc;
}
