# The freestyle builder: build the map in 3D

A plan for the owner, 2 October 2026. It is written to be argued with. Section 6
lists the decisions it takes on the owner's behalf, and how to reverse each one.

Status is kept at the top and updated as stages land. As of 2 October 2026 stages A
to C are built and their checks pass; section 8 says what was done against this plan
and where it differs.

## 0. What was asked

In the owner's words: "excellent work, now lets improve the freestyle builder to
allow for the 3d building like we've done with the whoop and 5 inch tracks."

The whoop canvas (WHOOP-BUILDER-PLAN.md) and the five inch canvas
(TRACK-BUILDER-5IN-PLAN.md, 4.4) are built in the room: pick a piece, a ghost
follows the pointer, a click puts it down, a press on a piece takes it and a drag
moves it, a ring at its foot turns it, a card floats beside it, a line at the
foot says what the pointer does now. The freestyle canvas is the one canvas left
that is built on the 2D plan, with its 3D view as a preview where "a click there
places nothing". This plan brings it across.

## 1. What a map is built with today

- `buildsIn3D()` is `docModeOf(doc) !== 'freestyle'`. A map opens in 2D, the
  switch has 2D first, and the 3D view is a preview: the palette dims and says
  "Build in 2D", a tool picked there opens 2D with the tool in hand
  (`pickTool`), and the only edit the preview takes is dragging an asset's
  height.
- The preview already draws the map in the game's own art (`view3d.js`,
  `buildFreestyle`): the props kit, the town's light, sky and ink, roads and cars
  from `src/maps/built/`, named gaps as amber windows, and a Play button that
  drives the cars with the physics module. What it does not have is any of the
  room's gestures, because those were written for tracks: `edit3d.js` finds a
  floor point with a plane at z = 0, builds its ghost with `buildElement` (which
  knows gates, flags and obstacles and nothing else), puts the ghost, the guides,
  the measures and the ruler into the race scene's root (a map is drawn in
  another scene, `fs`, so none of them would show), and turns a gate by the ring
  `buildRing` draws from an aperture's width.
- A map has things a track does not, and the plan handles each: raised assets
  that stand on other assets ("Nothing floats", `seat.js`), assets that keep to
  the compass, roads laid node by node, cars dropped on roads, named gaps, ground
  paint, and a flying order that does not exist.

## 2. The design

One principle, as in the other two plans: the canvas whose room is the tool is
built in the room, the plan stays one key away, and the document does not change.
`schemaVersion` stays 3 and no field is added. A map saved from the room is a
map saved from the plan.

### 2.1 What the room's gestures mean on a map

| Gesture | On a track | On a map |
| --- | --- | --- |
| Tool armed, pointer moves | Ghost on the floor, with a distance to the gate before | Ghost of the asset's solids standing on what is under the pointer, with its size |
| Click | Places, tool stays armed | Same. Gap, pads, gates and flags too |
| Press a piece, drag | Pulls it across the floor | Pulls it across the ground and over other assets, and it stands on what it ends up over |
| Ring at the foot | Turns a gate in 15 degree steps, Alt free | Turns any asset. Buildings, containers, bridges and the skate set keep to quarter turns and say why once; the rest take 15 degrees, Alt free |
| Shift drag | Box select | Same |
| Card by the piece | Gate fields, flags, Fly it | Asset fields: style, X, Y, Base, Turn, size; Copy, Remove, More |
| Lap bar and strip | Lap figures, flying order | What is on the map and what the physics holds, warnings, field size, the drawer. No strip: there is no order |
| Road tool | Not on a track | Clicks lay nodes on the ground, close by clicking the first, Enter finishes |
| Vehicle tool | Not on a track | Click a road to put a car on it, drag a car along its road |

### 2.2 Standing on what you point at

The 2D plan puts an asset at an (x, y) and leaves its Base to the inspector. In
the room the pointer has a height too, and the natural gesture is "put it on the
roof I am looking at". So the ghost's z is the highest box top under its origin
that is at or below where the pointer ray first meets something solid, or the
ground. That is `seat.js`'s own rule ("the highest solid top under the origin that
is no more than SEAT_SLACK over the base"), asked for a point and a height
instead of for an element, so what the ghost shows is what `seat()` keeps.

- The surfaces are the box tops the physics holds (`topUnder`'s own: only boxes are
  landable), taken from `place.js` with one new query. Nothing is new in the
  world: it is the arithmetic the seat already runs, exported.
- Pointing at the side of a building puts the ghost on the ground at its foot,
  not on the roof, because the roof is above where the pointer is looking.
- A drag works the same, with the dragged pieces left out of what the ray can
  hit, so a container lifted over another stands on it and lifted off it comes
  down. The grab point stays under the pointer: the plan's own rule, on the plane
  the press landed on, raised by the height the piece has been carried to.
- What stands on a piece goes with it. A move of a container, by a drag or an arrow
  key, takes the billboard on its roof along (the transitive set the seat already
  knows: `seatFor` names what each thing stands on). A turn does not: what was on
  the roof is left where it is and the seat sets it down if the turn took the roof
  from under it.
- Page Up and Page Down step a named gap by a quarter metre (a metre with Shift),
  and Base is a field on the card, because a gap's sill is sometimes meant to be
  somewhere nothing is. What is built, the start pads included, stands on what is
  under it and sets itself down (`seat.js`), so a step is not a thing it can take.
  The old height drag is gone: a drag on a piece moves it.
- Paint and notes stay on the ground whatever is under the pointer: a decal is
  never raised, a label has no height, a road is on the paving.

### 2.3 The ghost

An asset's ghost is its parts, boxes and capsules, in a translucent volume with
its edges drawn, from `partsOf(el)` at the heading and style it will be placed
with: it is what the physics will hold, it needs no kit pass, it is there on the
first frame, and it writes no depth so the town's ink draws no line round it. A
gap's ghost is its window, a decal's its rectangle, the pads and the furniture
gates are drawn as the room draws them. The ghost, the guides, the measures, the
ruler and the ring go into the scene the map is drawn in (`stage()`), which is
the one thing in `view3d.js` that has to learn there are two.

### 2.4 Turning

The ring's radius comes from the asset's footprint, not an opening's width, with
a fingertip's span as the least, and its line, its grab band and its knob are a few
pixels wide wherever the camera is, because a ring at gate scale is a hairline on a
26 m building seen from 180 m and a hoop on a lamp. Turning goes through the same
`snapYaw` the plan's handle uses, so a building cannot be left at 40 degrees and
the plan and the room agree about what a heading is.

### 2.5 Roads and cars

A road is laid with clicks on the ground; the draft is drawn as nodes, the line
between them and a rubber band to the pointer; the first node closes it; a double
click or Enter finishes it; right click or Escape cancels; Backspace takes the
last node back. A selected road shows its nodes and a knob between each pair, on
the ground and sized to the screen, and they are dragged as the plan's are
(`moveRoadNode`, `insertRoadNode`, with every car on the road kept where it was).
A road has no mesh to pick, so a click on the tarmac is read from the ground point
(`snapToRoad` with no slack). A car is picked by its mesh, dropped by a click on
a road (`dropVehicle`), and dragged along its own road (`slideVehicle`). Play is
unchanged.

### 2.6 The chrome

The room's layout is `body.tb-whoop`, and `buildsIn3D()` decides it, so a map
gets the drawer, the card, the coach line, the empty state and the lap bar when
it is true. Each has a map's words: the coach says "Click the plot to place it"
and, for the road, what the next click does; the empty state offers the starter
yard; the lap bar reads Things, Solids, Warnings, Plot and the drawer's toggle
(Details). The "Build in 2D" note, the hop to 2D in `pickTool` and
`armGroundLogo`, `previewing()` and the preview's own height drag go with the
premise they were written for.

### 2.7 Keys

Everything the room has: Q and E turn, F frames the selection, Control D copies,
the arrows nudge, Delete removes, V is 2D and 3D, Top is the plan camera. The
asset keys are the palette's own, as they are. M is the ruler on a track and the
ledge on a map, so a map's ruler has no key.

## 3. Stages

| Stage | What | Status |
| --- | --- | --- |
| A | The room takes a map: `buildsIn3D`, the chrome and its words, the scene plumbing (`stage()`, groups, hover, overlay), select, box select, move on the ground, turn by the ring, copy, nudge, delete, the map card, the asset ghost, place on the ground. The 2D plan is untouched. | done |
| B | Standing on things: the landing query in `place.js`, the ghost and the drop on a roof, a move over and off other pieces, what stands on a piece goes with it, Base on the card, Page Up and Page Down. | done |
| C | Roads and cars in the room. | done |
| D | The flow cases for all of it, the self test for the rules, the dead preview code taken out, the docs. | done |

Each stage ends green on `node src/trackbuilder/selftest.js` and the flow cases it
adds, and is committed on its own.

## 4. What does not change, and what could break

- `schemaVersion` stays 3, no field is added, a map serialises to the bytes it did
  (the layout hash of a published map is unaffected). The physics, the module ABI
  and the build do not change: `git diff --stat vendor/betaflight` stays empty and
  `place.js` gains one query and keeps every answer it gave. The board is not
  touched.
- The 2D plan of a map, the whoop canvas and the five inch canvas keep their
  behaviour. The flow check's whoop and five inch cases are the net for the two
  canvases, and its map cases are rewritten for the new premise.
- What could break:
  - The map scene is drawn through the town's post pipeline, so anything added to
    it that writes depth draws an ink line (the ghost, the ring and the road
    handles all avoid it).
  - A scene rebuilt on every selection is cheap for tracks and a map holds
    hundreds of assets; the art is cached by what it is drawn from, so a
    rebuild is groups, not geometry. Measured on the starter yard before and
    after.
  - Picking a thin asset at 180 m (a lamp, a pole, a mast): the kit's pick
    proxies are what a click lands on, and the cases pick the thinnest.
  - A drag that changes a height must not leave a thing floating: every edit
    already goes through `settle()`, and the case drags over and off a roof.

## 5. How it is checked

1. `node src/trackbuilder/selftest.js`, with a section for the landing rule
   (stands on a roof, on a stack, never on itself, edges are not over, the height
   of the pointer limits what is stood on), what stands on a piece, a map's tool
   list.
2. `scripts/builder-flow-check.js`, which drives the real page: the map opens in
   the room with the right chrome, a building is placed by click and a billboard on
   its roof, a container is dragged on to another and off it, the ring turns a
   crane freely and a building by quarters, a road is laid and a car dropped on
   it, a node dragged, and the same by touch.
3. The self test's seat suite (which places maps and seats what floats on them) and
   `check:props` and `check:roads`, because `place.js` is touched.
4. `lint:devices` for the card on touch tablets, `lint:preload`, `check:fresh`,
   `lint:nouns`, `check:path`.

`npm run verify` is not needed: nothing in the plant, the module, the build or the
control loop changes. PROGRESS.md says so, with the run log.

## 6. Decisions taken on the owner's behalf

Each is the plan's answer, in force until the owner says otherwise.

1. **A map is built in 3D**, the plan one key away. Reverse: make `buildsIn3D`
   false for maps, which brings back the plan as the canvas and the preview note.
2. **You stand on what you point at**, by the rule in 2.2, and Base is a field.
3. **No lift handle.** The height drag the preview had is replaced by the surface
   under the pointer, the field and the Page keys. Since the merge below, Page Down
   also sinks an asset on the ground, and the field takes a sunk base.
4. **A move takes what stands on it.** Reverse: do not extend the moved set.
5. **Compass assets turn in quarters on the ring** and say why once, as the plan
   does. That is the physics' rule (axis aligned boxes), not this plan's.
6. **A map has no magnets** beyond the grid, which Alt turns off. Snapping a wall
   to a neighbour's face is a different ask.
7. **Gates and flags on a map are furniture**, as they are on the plan: no flying
   order, no Fly it, no card rows about passes.
8. **A copy on a map is `clone.js`'s**, which another session made while this was
   built (see section 8): beside what it copies, a car on along its own road, a
   road with its cars. The room asks it for every map. This plan had a smaller rule
   of its own for a car, which `cloneElements` replaces.
9. **The ruler is on the map palette**, in metres, with no key (M is the ledge).

## 7. Not in this plan

Snapping an asset to another's faces, a lift gizmo, rotating a box off the compass
(the physics), a road on a roof, publishing a map from the room differently from
the plan, and the board's own copy of any of it.

## 8. What was done, against the plan

Everything in sections 2.1 to 2.7 was built. Where the build differs from what is
written above:

- **Page Up and Page Down** step a gap only, and say so once on anything else (2.2,
  corrected). A start pad is built, so it is seated like the rest.
- **The ring is sized in pixels.** The plan grew it with the footprint; it is the
  footprint's reach or a fingertip's span, whichever is larger, with a line, a knob
  and a band to take that are a few pixels wide wherever the camera is, made again
  when the camera has come in or out by a fifth (`fitRing`). A gate's ring on the
  other canvases is untouched.
- **A pointer ray, not a plane, finds the height.** `surfaceAt` takes the nearest
  solid thing the ray meets (a window, a car, a label and a ring are not solid) or
  the ground, reads the highest box top under that point at or below the ray's
  height (`under` in `place.js`), and a drag carries the grab point up with the piece
  (the plane it is pulled across rises by the height it has been carried to).
- **`place.js`.** `supportsOf` now offers `under(x, y, z, ignore)` as well as
  `seatFor(el, z)`, which is `under` for an element, and `supportsFor(doc)` exports
  it. Every answer the seat gave is the same (the self test's seat suite, which
  places maps and seats what floats on them, and the props and roads checks all pass
  as they did).
- **`seat.js` `standingOn`** is the carry: the ids that stand, directly or through
  another, on a set of pieces, read off `seatFor`. A gap on a roof is not carried, as
  it stands on nothing.
- **A hover outline** on the asset under the pointer, which the plan did not list,
  because a room with no word for what a click would take is a room where a click
  takes the wrong thing.
- **The card keeps off the whole piece** on screen (`selectionArea`), not off a point
  in it, because a map's pieces run from a lamp to a warehouse.
- **Bend line and Square are not on a map's bar.** They were the room's and are a
  track's: a map has no racing line to bend and no gates to square.
- **The preview's own handlers are gone from `view3d.js`**: the height drag, the
  plain orbit with its toast about things that stand on the ground, and the pan,
  with `raiseSelected` and `isGrounded` in `app.js`. What `view3d.js` still carries
  is the racing line's bend, which the room's editor hands over.
- **`buildsIn3D()` is a question that is always yes.** It is kept as the one place a
  canvas that is a preview again would change, and every call site reads as the
  question it asks.

### After main moved (2 October)

Another session pushed six commits to main while this was built, from the board's bug
inbox (bug-e605ff6a): Duplicate on a map (`clone.js`), an asset sunk into the ground
(`lowestBase`), an asset stood on end (`tilt`, `placedPartsOf`), a hollow chimney and a
wind turbine. Three of those lived in the preview this plan removes, so the merge was
more than text:

- **Duplicate.** `copySelection` picks by the document and not by the view: a track's
  copy is `copyElements`, a map's is `cloneElements`, because `buildsIn3D()` is yes for
  both now. The map's own inspector button is gone: it was there because a map "has no
  card in the room to hold Copy", and the card has Copy on every canvas now.
- **Sinking.** The preview's height drag was how an asset was pulled under the ground.
  In the room the card's Base takes a negative number down to `-SINK_MAX` and says how
  far it is sunk, Page Down sinks an asset on the ground a quarter metre (a metre with
  Shift) and Page Up brings it back, with what stands on it going the same way. A drag
  keeps a sunk piece sunk while it is over the ground and sets it on a roof when it is
  taken over one, because carrying the sink on would leave it inside the building and
  the seat would then drop it to the ground inside it.
- **Standing on end.** The card has the inspector's Stands choice (Flat, On end), made
  by one function for both (`standItems`). The ghost, the ring, the plan's footprint and
  the placement already read `placedPartsOf`, which the merge brought in; the card's
  area and F read the height with the tilt.
- The hollow chimney and the turbine are palette items, so "every tool" walks them.

### After a map builder's report (3 October)

bug-67ae1762 came from somebody building maps in the room: the card duplicates the
side panel and covers the view, vertical objects are awkward, and the lap voice has
no switch. What changed, and what did not:

- **The card steps aside on a map for the open drawer**, which holds every field the
  card has (`renderCard` hides it, and `toggleDrawer` renders it again either way), and
  **for a pull** (`placeCard` hides it while `gesturing()`, an edit between `beginEdit`
  and `endEdit`, and shows it the frame the piece is put down). A track's card is as it
  was: the whoop's and the five inch's drawer is closed by default and the card is
  their editor. The card is still how a map piece is edited with the drawer shut.
- **A typed position carries what stands on the piece** (`setElementCoord`), as a pull
  and an arrow key do. It was the one way of moving a piece that did not, so a container
  stood on end on another was left in the air when the one under it was typed to
  somewhere else, and the seat set it on the ground: the report's "snap to ground if
  move object underneath".
- **Not changed: what a piece stands on is read at its origin.** A tall piece whose middle
  is off the roof it leans on is set on the ground, by the seat's own rule for every
  asset (`seatFor`). The report's other half, "snap to the center", is not something I
  could find in the code, and it calls the whole of it "not a big deal", so it is left.
- **Not done: a switch for the lap voice**, the report's third point ("would be cool").
  It is a menu decision and not a fix: Sound is the shell check's own example of a plain
  switch (Enter flips, Left is off, Right is on), so the voice cannot be a state of that
  row, and a row of its own makes Settings one row longer than `tests/shell-baseline.json`
  allows, which only re-recording the baseline accepts. See PROGRESS.md for the options.

### What was measured

See PROGRESS.md for the run log: the self test, the flow check, the device check and
the cheap checks.
