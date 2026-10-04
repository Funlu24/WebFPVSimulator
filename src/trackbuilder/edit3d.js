/*
 * edit3d.js: the gestures of the whoop room, where a track is built.
 *
 * WHY THERE IS A SECOND SET OF GESTURES. The 3D view was a preview, and its
 * drag on a gate that stood on the ground was an orbit: the natural gesture did
 * the opposite of what a pilot meant, and nothing in it could place anything.
 * On a whoop canvas the room is the tool now (WHOOP-BUILDER-PLAN.md, section
 * 3), and this file is what a press, a drag and a release mean there. The other
 * canvases keep view3d.js's own handlers, untouched.
 *
 * THE SPLIT. This file decides what a gesture is and asks the host to do it;
 * view3d.js draws, and knows where things are on the screen. So this module
 * holds no Three.js, is loaded with the view and costs nothing to a page that
 * never opens the room, and every change goes through the host's one door
 * (beginEdit, moveSelected, rotateSelected, endEdit, placeAt), which is how
 * undo, the autosave and the derived racing line come with it.
 *
 *   A tool armed:   a click on the floor places, and the tool stays armed. A
 *                   drag looks round instead, so the camera is never lost to
 *                   a tool. A ghost follows the pointer, snapped, with its
 *                   distance to the gate before it.
 *   Nothing armed:  press a gate, anywhere in it, and it is selected and can
 *                   be pulled across the floor. The ring at its foot turns it.
 *                   A press on empty floor orbits, and a click there lets go.
 *                   Shift drags a box. Right or middle drag pans.
 *
 * A press is not an edit. The undo step begins at the first real movement, so
 * a click that only selects leaves nothing behind.
 *
 * TOUCH. One finger does what the mouse does: a tap places or selects, a drag on
 * a gate moves it, a drag on the floor orbits. A second finger takes over: whatever
 * the first was doing is put back, and two fingers are the camera, sliding with
 * the pair's middle, zooming with the distance between them and turning with the
 * twist. The finger left when one lifts has no gesture to go on with (a gesture
 * begins with a press), so a lifted pair never becomes a stray move. Only fingers
 * are tracked that way; a pen is a mouse that cannot hover.
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

import { ELEMENTS, KIND, defaultDims, isFiveInchPiece, letterDimsFor, trackClassOf } from './elements.js';
import { elementById, kindOf, apertureCenter, aperturesOf } from './model.js';
import { SEAT_SLACK } from './seat.js';
import {
  cubeItems, measuresFor, placementFor, rowPlan, rulerPoint, rulerReading, spacingTone,
} from './snap.js';
import { inches, GATE_SPACING_NOMINAL } from './racegow.js';
import { partGhosts } from './parts.js';
import { primaryOpening } from '../props/letters.js';
import { scaleOf, say } from './scale.js';
import { absNodes, vehiclePlace } from './roadtool.js';

/* How far a press travels, in pixels, before it is a drag and not a click. */
const CLICK_PX = 4;

/* How near, in pixels, a click on a map has to be to a node of the road being laid to close it or finish it, and how near a
 * car has to be dropped to a road, past the road's own edge: the plan's own reach, at the size of the screen. */
const NODE_PX = 12;
const SNAP_PX = 18;

/* Tools that are not placed with a click on the floor: a road is laid node by
 * node and a vehicle is dropped on a road. Neither is on a whoop palette. */
const NOT_PLACED = new Set(['road', 'vehicle', 'route']);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class RoomEditor {
  constructor(view, host) {
    this.view = view;
    this.host = host;
    /* The gesture in progress, or null. */
    this.drag = null;
    /* The ruler being drawn, or held after its second click: { a, b, fixed }. */
    this.ruler = null;
    /* The fingers on the screen, by pointer id, and the two-finger gesture they
     * are making, if any. */
    this.touches = new Map();
    this.pinch = null;
  }

  /* Whether these are the handlers: a track, of either class, with the room up. */
  active() {
    return Boolean(this.view.enabled && this.view.renderer && this.host.buildsIn3D());
  }

  /* ---------------- press ---------------- */

  onDown(e) {
    const v = this.view;
    const h = this.host;
    const at = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch') {
      /* A primary touch is the first finger of a new hand, so anything left over
       * from an old one (a lift the page never heard about) is forgotten. */
      if (e.isPrimary) {
        this.touches.clear();
        this.pinch = null;
      }
      this.touches.set(e.pointerId, at);
      if (this.touches.size === 2) {
        this.beginPinch();
        return;
      }
      if (this.touches.size > 2) {
        return;
      }
    }
    if (e.button === 1 || e.button === 2) {
      /* Right click puts an armed tool away, as it does on the plan; when
       * nothing is armed, right and middle drag pan. */
      if (e.button === 2 && h.roadDraft) {
        h.cancelDraft();
        return;
      }
      if (e.button === 2 && h.armed) {
        h.disarm();
        return;
      }
      v.canvas.setPointerCapture(e.pointerId);
      this.drag = { kind: 'pan', last: at };
      return;
    }
    if (e.button !== 0) {
      return;
    }
    v.canvas.setPointerCapture(e.pointerId);

    /* The row tool, and a field's wall: a drag along the floor is the row. */
    if (h.armed === 'row' || h.armed === 'wall') {
      this.beginRow(e, at);
      return;
    }
    /* The ruler: a click is a point, and a drag looks round, as a tool does. */
    if (h.armed === 'ruler') {
      this.drag = { kind: 'ruler', start: at, last: at, moved: false };
      return;
    }
    /* Fly order: a click on a piece adds a pass through it, and a drag looks round.
     * What is under the pointer is read at the press, before anything moves it. */
    if (h.armed === 'route') {
      this.drag = { kind: 'route', start: at, last: at, moved: false, hit: v.pickHit(e) };
      return;
    }

    /* The road tool lays a node a click and the car is dropped on a road: both, like every tool, leave a drag to
     * look round with. */
    if (h.armed === 'road' || h.armed === 'vehicle') {
      this.drag = { kind: h.armed === 'road' ? 'lay' : 'drop', start: at, last: at, moved: false };
      v.clearGhost();
      return;
    }

    /* A tool: a click places, a drag looks round. Whatever is under the
     * pointer, a gate included, because a tool armed is a tool armed. */
    if (h.armed && !NOT_PLACED.has(h.armed)) {
      this.drag = { kind: 'place', start: at, last: at, moved: false };
      v.clearGhost();
      return;
    }

    const hit = v.pickHit(e);
    if (hit && hit.ring) {
      this.drag = { kind: 'turn', id: hit.id, start: at, last: at, began: false };
      return;
    }
    /* A selected road's nodes, and the knob between two to pull a new one out of. */
    if (hit && (hit.node != null || hit.leg != null)) {
      this.pressHandle(hit, at);
      return;
    }

    /* The racing line runs through the middle of every gate, so it takes a
     * press only while Bend line is on, and then only where it is nearer than
     * what is hit or what is hit is only the pane across an opening. The
     * bend itself is the view's own gesture (a drag that starts on the line
     * drops a waypoint on it), so it is handed over whole. */
    if (h.bendLine) {
      const line = v.pathHit(e);
      if (line && (!hit || hit.weak || line.distance < hit.distance)) {
        v.drag = { kind: 'bend-pending', start: at, last: at, line };
        return;
      }
    }

    if (hit && hit.id) {
      this.pressElement(e, hit, at);
      return;
    }

    /* Open ground, or a road laid on it: a road has no mesh to hit, so what is under the pointer on the ground is
     * asked of the plan's own rule for where a road is. A press on one selects it and pulls it, as the plan does. */
    if (!e.shiftKey && v.isFreestyle()) {
      const g = v.levelPoint(e.clientX, e.clientY, 0);
      const on = g ? h.roadAt(g, 0) : null;
      if (on) {
        h.setSelection([on]);
        this.drag = {
          kind: 'move', id: on, start: at, last: at, began: false, plane: 0, origin: null, offset: null, side: null,
        };
        return;
      }
    }

    this.drag = e.shiftKey
      ? { kind: 'box', start: at, last: at, additive: true }
      : { kind: 'floor', start: at, last: at, moved: false };
  }

  /*
   * A PRESS ON A ROAD'S HANDLE: a node is picked, and pulled with the road's cars kept where they were; a knob
   * between two nodes puts a new one in and pulls that. Nothing is an edit until it moves.
   */
  pressHandle(hit, at) {
    const h = this.host;
    const road = elementById(h.doc, hit.id);
    if (!road) {
      return;
    }
    const starts = h.vehicleStarts(road.id);
    if (hit.node != null) {
      h.setActiveNode(road.id, hit.node);
      this.drag = { kind: 'node', id: road.id, index: hit.node, starts, start: at, last: at, began: false };
      return;
    }
    this.drag = { kind: 'node', id: road.id, index: -1, leg: hit.leg, starts, start: at, last: at, began: false };
  }

  pressElement(e, hit, at) {
    const v = this.view;
    const h = this.host;
    const el = elementById(h.doc, hit.id);
    if (!el) {
      return;
    }
    const was = h.selection.has(hit.id);
    if (e.shiftKey) {
      h.toggleSelection(hit.id);
      /* Shift clicking a selected element takes it OUT, so there is nothing
       * to pull by. Deselecting is the whole gesture. */
      if (!h.selection.has(hit.id)) {
        return;
      }
    } else if (!was) {
      h.setSelection([hit.id]);
    }
    /* A car is wherever its road puts it: it is slid along it, not moved. */
    if (kindOf(el) === KIND.VEHICLE) {
      h.setSelection([el.id]);
      this.drag = { kind: 'slide', id: el.id, start: at, last: at, began: false };
      return;
    }
    /* A waypoint is a handle on the line, and pulling one moves it across its
     * own level and pins the gates either side of it (moveWaypoint), which is
     * the view's gesture and not a move. */
    if (el.type === 'waypoint' && !e.shiftKey) {
      v.beginWaypointGrab(e, hit.id, at);
      return;
    }
    this.drag = {
      kind: 'move',
      id: hit.id,
      start: at,
      last: at,
      began: false,
      /* The height of the point that was pressed, so the gate follows the
       * pointer exactly and not the floor under it. */
      plane: Math.max(0, hit.point ? hit.point.z : 0),
      origin: null,
      offset: null,
      /* A second press on a pipe of the one selected gate picks that side, to
       * be taken away with Delete (pickSide), as it always did; it happens on
       * release, and only when the press did not turn into a pull. */
      side: was && hit.side && !hit.weak && h.selection.size === 1 && !e.shiftKey ? hit.side : null,
    };
  }

  /* ---------------- movement ---------------- */

  onMove(e) {
    if (e.pointerType === 'touch') {
      if (this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (this.pinch) {
        this.movePinch();
        return;
      }
    }
    const d = this.drag;
    if (!d) {
      this.hover(e);
      return;
    }
    const at = { x: e.clientX, y: e.clientY };
    const v = this.view;
    const h = this.host;
    if (d.kind === 'pan') {
      v.panBy(at.x - d.last.x, at.y - d.last.y);
      d.last = at;
      return;
    }
    if (d.kind === 'row' || d.kind === 'wall') {
      const p = v.levelPoint(e.clientX, e.clientY, 0);
      if (!p) {
        return;
      }
      d.b = h.snap(p, e.altKey);
      d.free = e.altKey;
      this.showRow(d);
      return;
    }
    if (d.kind === 'node' || d.kind === 'slide') {
      if (!d.began) {
        if (dist(at, d.start) < CLICK_PX) {
          return;
        }
        this.beginHandle(d, e);
        if (!d.began) {
          return;
        }
      }
      const g = v.levelPoint(e.clientX, e.clientY, 0);
      if (!g) {
        return;
      }
      if (d.kind === 'slide') {
        h.slideVehicle(d.id, g, SNAP_PX * v.metresPerPixel(g));
      } else {
        h.moveRoadNode(d.id, d.index, h.snap(g, e.altKey), d.starts);
      }
      return;
    }
    if (d.kind === 'floor' || d.kind === 'place' || d.kind === 'ruler' || d.kind === 'route' || d.kind === 'lay' || d.kind === 'drop') {
      if (!d.moved && dist(at, d.start) < CLICK_PX) {
        return;
      }
      d.moved = true;
      v.orbitBy(at.x - d.last.x, at.y - d.last.y);
      d.last = at;
      return;
    }
    if (d.kind === 'box') {
      d.last = at;
      v.showBox({ x0: d.start.x, y0: d.start.y, x1: at.x, y1: at.y });
      return;
    }
    if (d.kind === 'move') {
      if (!d.began) {
        if (dist(at, d.start) < CLICK_PX) {
          return;
        }
        this.beginMove(d);
      }
      /* The grab point stays under the pointer, at the height it has now: on a map that is the height the
       * piece has been carried to, so lifting it on to a roof does not leave the pointer behind. */
      const g = v.levelPoint(e.clientX, e.clientY, d.plane + d.dz);
      if (!g) {
        return;
      }
      const anchor = d.origin.get(d.id);
      const pulled = elementById(h.doc, d.id);
      const snapped = h.snap({ x: g.x + d.offset.x, y: g.y + d.offset.y, z: 0 }, e.altKey,
        { type: pulled.type, ignore: [...d.origin.keys()] });
      if (v.isFreestyle()) {
        /* It stands on what is under it now at or below where the pointer is looking, with what is moving
         * left out, and rises or falls by the difference from what it stood on when it was picked up. A piece
         * sunk into the ground stays sunk while it is over the ground, and comes up to what it is put on when
         * that is a roof, which would otherwise leave it inside the building. */
        const look = v.surfaceAt(e, { type: pulled.type, ignore: d.ignore });
        if (look) {
          const surface = v.standAt(snapped.x, snapped.y, look.look, d.ignore);
          const above = d.above < -SEAT_SLACK && surface > SEAT_SLACK ? 0 : d.above;
          d.dz = surface + above - anchor.z;
        }
      }
      h.moveSelected(d.origin, { x: snapped.x - anchor.x, y: snapped.y - anchor.y, z: d.dz });
      v.movePieces([...d.origin.keys()]);
      v.setGuides(h.guides);
      this.measureDragged(d.id);
      return;
    }
    if (d.kind === 'turn') {
      if (!d.began) {
        if (dist(at, d.start) < CLICK_PX) {
          return;
        }
        h.beginEdit('rotate');
        d.began = true;
      }
      const el = elementById(h.doc, d.id);
      /* The ring lies at the piece's foot, which on a map may be a roof. */
      const g = el ? v.levelPoint(e.clientX, e.clientY, v.isFreestyle() ? el.position.z : 0) : null;
      if (!el || !g) {
        return;
      }
      const raw = Math.atan2(g.y - el.position.y, g.x - el.position.x);
      h.rotateSelected(h.turnWanted(el, raw, e.altKey), d.id);
      /* A turn changes what a piece IS, not only where, so the room is rebuilt
       * as it goes; it is rare, and a rebuild is a few milliseconds. */
      v.markDirty();
      return;
    }
  }

  /* A node or a car taken hold of: the undo step begins at the first real movement, and a knob between two nodes puts
   * its node in as it does. */
  beginHandle(d, e) {
    const h = this.host;
    d.began = true;
    if (d.kind === 'slide') {
      h.beginEdit('slide vehicle');
      return;
    }
    if (d.index >= 0) {
      h.beginEdit('move node');
      return;
    }
    const g = this.view.levelPoint(e.clientX, e.clientY, 0);
    h.beginEdit('add node');
    const index = g ? h.insertRoadNode(d.id, d.leg, h.snap(g, e.altKey), d.starts) : -1;
    if (index < 0) {
      h.cancelEdit();
      d.began = false;
      this.drag = null;
      return;
    }
    d.index = index;
  }

  /* The pieces about to be pulled, where they are, and where the pointer is
   * against the one that was pressed. The undo step begins here. */
  beginMove(d) {
    const h = this.host;
    const v = this.view;
    const anchor = elementById(h.doc, d.id).position;
    d.origin = new Map([...h.selection].map((id) => [id, { ...elementById(h.doc, id).position }]));
    /* On a map what stands on a piece goes with it, and none of what is going is a thing to stand on. */
    d.dz = 0;
    d.ignore = null;
    d.stoodOn = 0;
    d.above = 0;
    if (v.isFreestyle()) {
      for (const id of h.carriedBy([...h.selection])) {
        d.origin.set(id, { ...elementById(h.doc, id).position });
      }
      d.ignore = new Set(d.origin.keys());
      d.stoodOn = v.standAt(anchor.x, anchor.y, anchor.z, d.ignore);
      /* How far above what it stands on it is: nothing for a piece that is seated, negative for one that is sunk. */
      d.above = anchor.z - d.stoodOn;
    }
    const g = v.levelPoint(d.start.x, d.start.y, d.plane);
    d.offset = g ? { x: anchor.x - g.x, y: anchor.y - g.y } : { x: 0, y: 0 };
    h.beginEdit('move');
    d.began = true;
  }

  /* ---------------- release ---------------- */

  onUp(e) {
    if (e.pointerType === 'touch') {
      this.letGo(e);
    }
    const d = this.drag;
    if (!d) {
      return;
    }
    const v = this.view;
    const h = this.host;
    this.drag = null;
    if (d.kind === 'floor' && !d.moved) {
      /* A click on empty floor lets go of what was selected. */
      h.setSelection([]);
    } else if (d.kind === 'place' && !d.moved) {
      const p = v.surfaceAt(e, { type: h.armed });
      if (p) {
        const at = h.snap(p, e.altKey, { type: h.armed });
        /* The height is the surface's, which a snap to the grid does not touch. */
        h.placeAt({ x: at.x, y: at.y, z: p.z });
      }
    } else if ((d.kind === 'lay' || d.kind === 'drop') && !d.moved) {
      const g = v.levelPoint(e.clientX, e.clientY, 0);
      if (g && d.kind === 'lay') {
        h.draftClick(g, h.snap(g, e.altKey), NODE_PX * v.metresPerPixel(g));
      } else if (g) {
        h.dropVehicle(g, SNAP_PX * v.metresPerPixel(g));
      }
    } else if ((d.kind === 'node' || d.kind === 'slide') && d.began) {
      h.endEdit();
    } else if (d.kind === 'row') {
      v.clearGhost();
      h.placeRow(d.a, d.b);
    } else if (d.kind === 'wall') {
      v.clearGhost();
      v.clearMeasures();
      h.placeWallAt(d.a, d.b, 'none', d.free);
    } else if (d.kind === 'ruler' && !d.moved) {
      this.rulerClick(e);
    } else if (d.kind === 'route' && !d.moved) {
      if (d.hit && d.hit.id && !d.hit.ring) {
        h.routeTo(d.hit.id, d.hit.point);
      }
    } else if (d.kind === 'box') {
      h.setSelection(this.idsInBox(d, e), true);
      v.showBox(null);
    } else if (d.kind === 'move') {
      if (d.began) {
        h.endEdit();
      } else if (d.side) {
        h.pickSide(d.id, d.side);
      }
    } else if (d.kind === 'turn' && d.began) {
      h.endEdit();
    }
    v.clearMeasures();
    v.setGuides([]);
    v.canvas.style.cursor = '';
    if (e && v.canvas.hasPointerCapture?.(e.pointerId)) {
      v.canvas.releasePointerCapture(e.pointerId);
    }
    /* Whatever the gesture did, the scene is rebuilt from the document once,
     * now: a drag only moves pieces about. */
    v.markDirty();
    h.requestDraw();
  }

  /* The browser took the pointer away: a gesture half done is put back, and a
   * drag that never began has nothing to put back. */
  onCancel(e) {
    if (e.pointerType === 'touch') {
      this.letGo(e);
    }
    const d = this.drag;
    if (!d) {
      return;
    }
    const v = this.view;
    const h = this.host;
    this.drag = null;
    if ((d.kind === 'move' || d.kind === 'turn' || d.kind === 'node' || d.kind === 'slide') && d.began) {
      h.revertEdit();
    }
    v.showBox(null);
    v.clearMeasures();
    v.setGuides([]);
    v.canvas.style.cursor = '';
    if (e && v.canvas.hasPointerCapture?.(e.pointerId)) {
      v.canvas.releasePointerCapture(e.pointerId);
    }
    v.markDirty();
    h.requestDraw();
  }

  /* ---------------- two fingers ---------------- */

  /*
   * A SECOND FINGER: put back what the first was doing (a piece half pulled goes
   * home, a box is dropped; a tap that had not moved had done nothing) and start
   * reading the pair as the camera.
   */
  beginPinch() {
    const v = this.view;
    const d = this.drag;
    if (d && (d.kind === 'move' || d.kind === 'turn') && d.began) {
      this.host.revertEdit();
    }
    this.drag = null;
    v.showBox(null);
    v.clearMeasures();
    v.setGuides([]);
    v.clearGhost();
    this.pinch = this.readPinch();
    v.markDirty();
    this.host.requestDraw();
  }

  /* Where the pair of fingers is: the middle, the distance and the angle of the
   * line between them, on the screen. */
  readPinch() {
    const [a, b] = [...this.touches.values()];
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  movePinch() {
    if (this.touches.size < 2) {
      return;
    }
    const v = this.view;
    const was = this.pinch;
    const now = this.readPinch();
    /* The angle wraps at half a turn; the step between two moves never does. */
    let twist = now.angle - was.angle;
    if (twist > Math.PI) {
      twist -= 2 * Math.PI;
    } else if (twist < -Math.PI) {
      twist += 2 * Math.PI;
    }
    /* The floor that was between the fingers is between them now: slide, spread
     * and twist are one grip (view3d gripFloor, which the wheel uses as well). A
     * clockwise twist on the screen is the angle growing, and turns the room
     * clockwise, which is the camera going the other way round it. */
    v.gripFloor(was.mid, now.mid, was.dist / now.dist, -twist);
    this.pinch = now;
  }

  /*
   * A FINGER LIFTED OR TAKEN AWAY. The pair is over when there are fewer than two.
   * Nothing else is undone, because there is nothing else to undo: the second
   * finger put the first one's gesture back and cleared it (beginPinch), so the
   * finger that is left is not doing anything until it, or another, is pressed.
   */
  letGo(e) {
    this.touches.delete(e.pointerId);
    if (this.pinch && this.touches.size < 2) {
      this.pinch = null;
    }
  }

  /* The pointer left the canvas with nothing pressed: a ghost has nowhere to be. */
  onLeave() {
    if (!this.drag) {
      this.view.clearGhost();
      this.view.clearMeasures();
      this.view.setGuides([]);
      this.view.setHover(null);
    }
  }

  /* The wheel zooms toward the pointer: what is under it stays under it. */
  onWheel(e) {
    this.view.zoomToward(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012));
  }

  /* ---------------- hover, and the ghost ---------------- */

  hover(e) {
    const v = this.view;
    const h = this.host;
    /* The readout at the foot says where on the floor the pointer is, in the
     * room as on the plan: it sat at nought while the room was up, the one
     * number on the canvas that was not about anything. */
    const floor = v.isFreestyle() ? v.surfaceAt(e, { type: h.armed }) : v.levelPoint(e.clientX, e.clientY, 0);
    if (floor) {
      h.onHoverWorld(floor);
    }
    if (h.armed === 'ruler') {
      this.rulerHover(e);
      v.setHover(null);
      v.canvas.style.cursor = 'crosshair';
      return;
    }
    if (h.armed === 'route') {
      /* The piece a click would fly through lights up, as a piece does under the
       * pointer when nothing is armed. */
      const near = v.pickHit(e);
      v.setHover(near && near.id && !near.ring ? near.id : null);
      v.canvas.style.cursor = near && near.id ? 'pointer' : '';
      return;
    }
    if (h.armed === 'road' || h.armed === 'vehicle') {
      this.showTrafficGhost(e);
      v.setHover(null);
      v.canvas.style.cursor = 'crosshair';
      return;
    }
    if (h.armed && !NOT_PLACED.has(h.armed)) {
      this.showGhost(e);
      v.setHover(null);
      v.canvas.style.cursor = 'crosshair';
      return;
    }
    const hit = v.pickHit(e);
    v.setHover(hit && !hit.ring && hit.node == null && hit.leg == null ? hit.id : null);
    v.canvas.style.cursor = hit ? (hit.ring ? 'grab' : 'pointer') : '';
    if (h.bendLine) {
      const line = v.pathHit(e);
      v.showLineKnob(line && (!hit || hit.weak || line.distance < hit.distance) ? line.pos : null);
    }
  }

  /*
   * THE GHOST: the piece as it would stand if the pointer were pressed now,
   * snapped to the grid, facing the way it would be placed, with its arrow and
   * the distance to the gate before it. Rebuilt only when the snapped spot or
   * its heading changes, not on every pointer move.
   */
  showGhost(e) {
    const v = this.view;
    const h = this.host;
    /* A map's pieces are solids that stand on what is under them, with no gate before them to measure from. */
    if (v.isFreestyle()) {
      this.showMapGhost(e);
      return;
    }
    if (h.armed === 'cube') {
      this.showCubeGhost(e);
      return;
    }
    /* The five inch pieces made of pieces: a wall, a hurdle, an up gate. */
    if (isFiveInchPiece(h.armed)) {
      this.showPartGhost(e);
      return;
    }
    /* The row tool's ghost, before the drag, is one gate: where the row would begin. */
    const type = h.armed === 'row' ? 'gate' : h.armed;
    const def = ELEMENTS[type];
    const p = v.levelPoint(e.clientX, e.clientY, 0);
    if (!def || !p) {
      v.clearGhost();
      v.clearMeasures();
      return;
    }
    const at = h.snap(p, e.altKey, { type });
    v.setGuides(h.guides);
    const plan = placementFor(h.doc, at, type, { square: h.square && !h.isWhoopRace() });
    /* A letter's ghost is the one in hand: its own size, and which letter it is. */
    const letter = type === 'letter' ? h.letterTool : null;
    v.setGhost({
      type,
      position: { x: at.x, y: at.y, z: 0 },
      yaw: plan.yaw,
      ...(letter ? { props: { letter, dims: letterDimsFor(letter) } } : {}),
    });
    if (def.kind === KIND.APERTURE) {
      const ap = aperturesOf(letter
        ? { type, letter, dims: letterDimsFor(letter), position: { x: at.x, y: at.y, z: 0 }, yaw: plan.yaw, pitch: 0 }
        : { type, dims: defaultDims(type, trackClassOf(h.doc)) })[letter ? primaryOpening(letter) : 0];
      v.setMeasures(measuresFor(h.doc, { x: at.x, y: at.y, z: ap ? ap.centerH : 0 }));
    } else {
      v.clearMeasures();
    }
  }

  /*
   * THE GHOST ON A MAP: the piece's solids, mint and see-through, where a click would put it, facing the way it
   * would be placed and standing at the height of what is under the pointer (view3d.js surfaceAt). There are
   * no distances: a map has no gate before it to be measured from.
   */
  showMapGhost(e) {
    const v = this.view;
    const h = this.host;
    const type = h.armed;
    const p = ELEMENTS[type] ? v.surfaceAt(e, { type }) : null;
    if (!p) {
      v.clearGhost();
      v.clearMeasures();
      return;
    }
    const at = h.snap(p, e.altKey, { type });
    v.setGuides([]);
    /* What is on legs from a bar starts at the height it is made with, whatever it is over. */
    v.setGhost({ type, position: { x: at.x, y: at.y, z: ELEMENTS[type].standsFree ? undefined : p.z }, yaw: h.newYawFor(type) });
    v.clearMeasures();
  }

  /*
   * THE ROAD TOOL AND THE CAR UNDER THE POINTER. The road tool says where the next node would be, with the line
   * to it from the last one laid (view3d.js setDraftPointer); the car shows where it would be put, on the road
   * nearest the pointer and facing the way it would drive, or nothing when no road is near enough.
   */
  showTrafficGhost(e) {
    const v = this.view;
    const h = this.host;
    const g = v.levelPoint(e.clientX, e.clientY, 0);
    if (!g) {
      v.setDraftPointer(null);
      v.setCarGhost(null);
      return;
    }
    if (h.armed === 'road') {
      v.setDraftPointer(h.snap(g, e.altKey));
      v.setCarGhost(null);
      return;
    }
    v.setDraftPointer(null);
    v.setCarGhost(h.carGhostAt(g, SNAP_PX * v.metresPerPixel(g)));
  }

  /* The cube tool's ghost: the five faces a click would lay, faint, where they would stand, facing the way a gate
   * would face here. They are the list placeCube lays them from, so what is shown is what is put down. It snaps
   * as the click does, as a cube: the gate's magnet would take it 30 in along a gate's width, where a cube, which
   * is 30 in wide itself, would be inside the gate. */
  showCubeGhost(e) {
    const v = this.view;
    const h = this.host;
    const p = v.levelPoint(e.clientX, e.clientY, 0);
    if (!p) {
      v.clearGhost();
      v.clearMeasures();
      return;
    }
    const at = h.snap(p, e.altKey, { type: 'cube' });
    v.setGuides(h.guides);
    const yaw = placementFor(h.doc, at, 'gate').yaw;
    const plan = cubeItems(h.doc, at, { yaw });
    v.setGhosts(plan.items.map((it) => ({ type: 'gate', position: it.position, yaw: it.yaw, props: it.props })));
    v.clearMeasures();
  }

  /* The distances round a gate that is being pulled. */
  measureDragged(id) {
    const el = elementById(this.host.doc, id);
    if (!el || kindOf(el) !== KIND.APERTURE) {
      this.view.clearMeasures();
      return;
    }
    const c = apertureCenter(el, 0);
    this.view.setMeasures(measuresFor(this.host.doc, c, id));
  }

  /* ---------------- the row ---------------- */

  /* A press with the row tool: where the row begins, magnets and all, as a gate's
   * position would be. */
  beginRow(e, at) {
    const v = this.view;
    const h = this.host;
    const p = v.levelPoint(e.clientX, e.clientY, 0);
    if (!p) {
      return;
    }
    const a = h.snap(p, e.altKey, { type: 'gate' });
    v.setGuides([]);
    this.drag = {
      kind: h.armed === 'wall' ? 'wall' : 'row', start: at, last: at, a: { x: a.x, y: a.y }, b: { x: a.x, y: a.y }, free: e.altKey,
    };
    this.showRow(this.drag);
  }

  /* The row as it would be laid, drawn faint, and the 30 in between the gates. A wall is the same gesture on a
   * field, and says how many bays and how long. */
  showRow(d) {
    const v = this.view;
    const h = this.host;
    if (d.kind === 'wall') {
      this.showWall(d);
      return;
    }
    const plan = rowPlan(h.doc, d.a, d.b);
    v.setGhosts(plan.items.map((it) => ({ type: 'gate', position: { x: it.x, y: it.y, z: 0 }, yaw: it.yaw })));
    const centre = 0.3556;
    v.setMeasures(plan.items.slice(1).map((it, i) => {
      const before = plan.items[i];
      return {
        from: { x: before.x, y: before.y, z: centre },
        to: { x: it.x, y: it.y, z: centre },
        d: GATE_SPACING_NOMINAL,
        tone: spacingTone(GATE_SPACING_NOMINAL),
        text: inches(GATE_SPACING_NOMINAL),
      };
    }));
  }

  /* A wall as it would be laid: its bays, faint, and one line along it saying how many and how long. */
  showWall(d) {
    const v = this.view;
    const h = this.host;
    const { plan, items } = partGhosts(h.doc, 'wall', d.a, d.b, { free: d.free, square: h.square && !d.free });
    v.setGhosts(items);
    const first = plan.items[0];
    const last = plan.items[plan.items.length - 1];
    const along = { x: plan.dir.x * plan.pitch * 0.5, y: plan.dir.y * plan.pitch * 0.5 };
    const z = scaleOf(h.doc).measureH;
    const from = { x: first.x - along.x, y: first.y - along.y, z };
    const to = { x: last.x + along.x, y: last.y + along.y, z };
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    v.setMeasures([{
      from, to, d: len, tone: 'plain', text: `${plan.count} bays, ${say(h.doc, len)}`,
    }]);
  }

  /* The ghost of a hurdle or an up gate: what a click would put down, and how far it is from the gate before. */
  showPartGhost(e) {
    const v = this.view;
    const h = this.host;
    if (h.armed === 'wall') {
      const p = v.levelPoint(e.clientX, e.clientY, 0);
      if (!p) {
        v.clearGhost();
        v.clearMeasures();
        return;
      }
      const at = h.snap(p, e.altKey, { type: 'gate' });
      v.setGuides(h.guides);
      this.showWall({ a: at, b: at, free: e.altKey });
      return;
    }
    const p = v.levelPoint(e.clientX, e.clientY, 0);
    if (!p) {
      v.clearGhost();
      v.clearMeasures();
      return;
    }
    const at = h.snap(p, e.altKey, { type: h.armed === 'run' ? 'gate' : h.armed });
    v.setGuides(h.guides);
    const { items } = partGhosts(h.doc, h.armed, at, at, { square: h.square, run: h.runSpec });
    v.setGhosts(items);
    v.setMeasures(measuresFor(h.doc, { x: at.x, y: at.y, z: scaleOf(h.doc).measureH }));
  }

  /* ---------------- the ruler ---------------- */

  /* A click with the ruler: the first point starts one, the second ends it, and
   * the next click starts another. What it says is not in the track. */
  rulerClick(e) {
    const p = this.view.levelPoint(e.clientX, e.clientY, 0);
    if (!p) {
      return;
    }
    const at = rulerPoint(this.host.doc, p, { off: e.altKey });
    this.ruler = !this.ruler || this.ruler.fixed
      ? { a: at, b: at, fixed: false }
      : { a: this.ruler.a, b: at, fixed: true };
    this.showRuler();
  }

  /* Between the two clicks, the line follows the pointer. */
  rulerHover(e) {
    if (!this.ruler || this.ruler.fixed) {
      return;
    }
    const p = this.view.levelPoint(e.clientX, e.clientY, 0);
    if (!p) {
      return;
    }
    this.ruler = { a: this.ruler.a, b: rulerPoint(this.host.doc, p, { off: e.altKey }), fixed: false };
    this.showRuler();
  }

  showRuler() {
    const r = this.ruler;
    this.view.setRuler(r ? { a: r.a, b: r.b, text: rulerReading(r.a, r.b, this.host.doc).text, fixed: r.fixed } : null);
  }

  clearRuler() {
    this.ruler = null;
    this.view.setRuler(null);
  }

  /* ---------------- box select ---------------- */

  /* What a box drawn on the screen holds: every piece whose middle projects
   * inside it. */
  idsInBox(d, e) {
    const v = this.view;
    const x0 = Math.min(d.start.x, e.clientX);
    const x1 = Math.max(d.start.x, e.clientX);
    const y0 = Math.min(d.start.y, e.clientY);
    const y1 = Math.max(d.start.y, e.clientY);
    const rect = v.canvas.getBoundingClientRect();
    const ids = [];
    const doc = this.host.doc;
    const inside = (p) => {
      const s = v.toScreen(p);
      if (!s) {
        return false;
      }
      const px = rect.left + s.x;
      const py = rect.top + s.y;
      return px >= x0 && px <= x1 && py >= y0 && py <= y1;
    };
    for (const el of doc.elements) {
      const kind = kindOf(el);
      /* The plan's rule for what a box takes: a road is taken when all its nodes are inside, a car where it is
       * drawn, and a car's own position is nothing at all (it is where its road puts it). */
      if (kind === KIND.ROAD) {
        const nodes = absNodes(el);
        if (nodes.length && nodes.every((n) => inside({ x: n.x, y: n.y, z: 0 }))) {
          ids.push(el.id);
        }
        continue;
      }
      if (kind === KIND.VEHICLE) {
        const at = vehiclePlace(doc, el);
        if (inside({ x: at.x, y: at.y, z: 0 })) {
          ids.push(el.id);
        }
        continue;
      }
      if (inside(kind === KIND.APERTURE ? apertureCenter(el, 0) : el.position)) {
        ids.push(el.id);
      }
    }
    return ids;
  }
}
