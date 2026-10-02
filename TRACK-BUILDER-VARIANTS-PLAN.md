# The builder's variants: the owner's catalogue, built

A plan and a ledger for the owner, 2 October 2026. It is written to be argued with. Section 5 lists
what was assumed and how to reverse each assumption, and section 6 lists what was not done because it
needs the owner's word.

Status: every row of the catalogue in section 4 is either built, buildable from what is there by a
recipe the table gives, or in section 6 with a question. The self test is at 2,139 passed, the builder
flow check at 639 passed with a case that drives the new pieces with the pointer, and the device check is
clear. Nothing here changes the flight model, the module ABI or the build.

## 0. What was asked

In the owner's words, 2 October 2026: "ok getting there with the builder, lets focus on that, i'll
manually build the tracks, here are all the variants we need in the track builder, figure it out".
Then a catalogue.

Part 1, the manoeuvres: straight (exit leaning left, right, up or down), hop (pop-over), turn
(hairpin 180, orbit 360, and 90, 180 and 360 either way), climbing turn (spiral up, orbit up),
descending turn (spiral down, orbit down), split-S (S-turn), reverse split-S (half power loop),
power loop, corkscrew (a sideways power loop, left or right, up or down), dive, launch (punch-out),
slalom (weave), figure 8 (Dutch 8) and the Matty flip (back swing). "Every turn has a handedness
(left or right) and, where relevant, a vertical sense (up or down)."

Part 2, the elements and flight paths, in six groups: flags (the flag's line extends for ever, so it
is flown around and never over), ground gates, hurdles, elevated and stacked gates, indoor and whoop
elements, and course structure.

## 1. How it was read

A track here is pieces and the order they are flown in, and the racing line between them is derived
(`path.js`). That settles what the two parts are. Part 1 is **shapes of the line** between pieces.
Part 2 is **what is standing there**, and the shapes that go with it. So:

- a manoeuvre is not a piece. It is a run of ordinary waypoints in the flying order, each pointing
  the way the line goes through it, so the board, the game and the line already understand it and
  nothing about the stored track is new;
- an element that is a variant of one already there (a hurdle of another size, a gate that is
  hopped over) is a choice on the piece's card, which rewrites ordinary elements;
- an element that is several pieces laid in a pattern (a chicane, a flag slalom, a Dutch 8) is laid
  by one tool in one undo step, and is ordinary pieces afterwards.

The one place the document grows is one optional word on a stacked gate's sequence entry (section 3.4).

## 2. What the pilot sees

**Pictures first.** Every figure is offered as a card with its own picture, drawn from the same curve
that lays it (`glyphs.js`), so a left turn and a right turn are mirror images because the curves are,
and a figure changes its picture when its geometry changes. A card is lit when it is the one that is
laid.

**Where.** A gate or a flag has three places a figure can go: **Then**, after the pass; **Into it**,
before the pass; and for a flag **Round it**, which is a turn round the flag that stands on both
sides of its pass. The floating card has a **Flight path** row with Then and Into (and **Round it** for a flag), each saying
what is laid there, and a press opens the details at **Flight path**, with the tab for that place
showing. On a screen that is touched the card stays the small bar it was and the choices are in the
details, under More. The details hold the grid of
pictures, and under the one that is laid the choices that change it where it is: which way, how far
round (90, 180 or 360), over or under, how many weaves, which way the exit leans, how big (tight,
standard or wide).

**One press each way.** A figure is laid in one undo step. Laying another in the same place replaces
it. A point of a figure is a waypoint, so it can be dragged to reshape the figure, and selecting
one says "One point of Turn left 180" with **Take the figure out**, which removes the whole of it,
and the second pass through a gate that some figures bring, with it.

**Round this gate.** A gate has its own figures that are also a second pass: round a flagged leg
(hairpin, spiral up, spiral down, orbit and back through, and a figure 8 when both uprights are
flagged), a turnaround (hairpin left or right, or over the top), and a power loop gate.

**Pieces.** The palette gains **Section** (J), **Bar hurdle** and **Launch gate**. A hurdle's card
gains its size, how it is flown and its angle. A gate's card gains **Fly over**.

## 3. The design

### 3.1 The figures

`src/trackbuilder/manoeuvres.js` is the owner's fourteen, as pure curves in a local frame (u ahead,
v left, w up). Every point carries its tangent in all three axes, so a vertical loop is followed:
`path.js` now reads a waypoint's pitch for its tangent (when it has been set), where it used to take
the tangent level. A curve has points at most 45 degrees apart, which is the spacing at which the
Hermite line reproduces a circle to about a percent (measured: half loops are 0.013 m from the true
circle).

Sizes are a field's: a turn is 3 m in radius, a loop is 3 m in radius, a hop is 1.8 m high and 10 m
long, a slalom weaves 1.4 m either side every 8 m, a corkscrew advances 20 m in a turn of its roll, a dive
or a launch is 5 m. A whoop's are a seventh of that (0.45 m radius). Tight is 0.6 of the size and wide
is 1.6. These are in `FIGURE_BASE` and are one place to change.

**Names are a closed grammar** and are how a figure is found again: `Turn left 180`, `Climbing turn
right 360, wide`, `Corkscrew left up`, `Slalom right x4`, `Exit left`, `Hop`, `Dip`, `Power loop`,
with `, back through` where the piece is flown a second time. A name that is nearly one and is not
(`Turn 3`, `Turn left`) is left alone, so a waypoint a person named is never taken for a figure.

### 3.2 Where a figure lives

The waypoints between two passes are one slot, which is the "then" of the first pass and the "into"
of the second, and a slot holds one figure. A turn round a flag is the exception: it is the arc in
and the arc out, a quarter, half or whole turn's worth on each side of the flag's own pass, so two
flags in a row each keep a turn of their own in the slot between them, which is what a Dutch 8 is.
Another piece's turn is never read as a gate's figure, whatever stands next to it.

A figure that comes back to its own piece (an orbit round a flagged leg, a turnaround, a power loop
gate) adds the second pass as its own sequence entry, and its name says so, so taking the figure out
takes that pass with it.

### 3.3 The Section tool

`src/trackbuilder/runs.js`. A click lays the shape you picked under the tool, in the flying order,
the first piece standing where you clicked and facing the way the track is going there:

| shape | what it lays |
| --- | --- |
| Straight | 2 to 8 gates a gap apart |
| Sweeper | gates round a long arc, a radius of 6 turns, each turned further round |
| Hairpin | gates spread round a half circle, the last facing back; two gates is a hairpin pair |
| Chicane | a swing out one way and back the other, eased in and out of the line |
| Esses | two chicanes end to end |
| Step sequence | gates in a line, each 0.75 m higher (or lower) than the one before |
| Flag slalom | flags on the line, the lap passing them on alternate sides |
| Dutch 8 | two flags across the line and a full orbit round each, the opposite ways |

The gap is **short, normal or long** (6, 10 or 15 m), which is also the reading of "gaps" in the course
structure row. A hairpin has no gap,
so its spacing sets how wide the half circle is. Left or right says which way the first bend goes.
The ghost in the room shows what the click will lay. The tool is on the five inch palette only: a whoop
track keeps RaceGOW's own vocabulary, though the flight paths are on both canvases and are drawn at
the size of the track they are on.

### 3.4 Stacks

A spiral up or down on a ladder, and a split-S, are what they were. The way a spiral turns is new:
`wrap` on a sequence entry, `left`, `right` or `over`, read by the line to say how it gets from one
opening of a stack to the next. It is written only when it was said, so a track that never said
keeps its bytes and its layout hash, and a reader that does not know the word flies the default.
The reverse split-S (bottom, then top, the other way, out over the front) is `over`.

### 3.5 The hurdle family

MultiGP's own figures: the hurdle is a panel 10 ft by 5 ft with pole pockets and no flags, and an
h-hurdle is that hurdle "with the addition of a gate leg panel on the top", a 5 ft pole rising from
one end. So a hurdle card has four sizes, **Nationals** (the plan's 4 m by 1 m, still what the tool
puts down), **10 x 5 ft**, **h-hurdle** (the same with a flag on one end on a mast 10 ft tall: the
hurdle's own flag, nothing new), and **Super** (twice the standard one, see section 5).

The line over a hurdle is the waypoint that pins it, named for how it goes. **Over** is a metre
above the top, **Skim** a hand above it, and **Under** goes beneath a **bar hurdle**, a horizontal
pole 10 ft wide at 5 ft up on two legs, which is the only one with anything under it. **Set at**
turns it square to the line or 45 degrees either way. A gate can be hopped over the same way:
**Fly over** on its card adds the pass a metre above its frame.

### 3.6 The launch gate

MultiGP: "forces pilots to punch the throttle and launch upwards". It is the horizontal gate a dive
gate is, 15 ft up, flown **up**. A line that is vertical through a gate thirty metres from the last
one sags under the ground on the way, so the gate comes with a **pull up** (three waypoints, level
then a quarter circle to vertical) and a **push over** (two, a quarter circle to level) which can be
dragged or taken out like any other.

### 3.7 Rules

`over-flag`: the line goes over a flag. A flag's line goes up for ever, so it is flown round and
never over; a hop or a loop laid where a flag stands, or a waypoint dragged over one, is a warning
with the flag and where. The Nationals qualifier's flags are all flown round and it has none.
`figure-exit` and `figure-entry`: a figure that ends facing away from the next piece, or starts
facing back at the last. Every figure's own curvature is exempt from `tight-corner`.

## 4. The catalogue, row by row

**Built** is new in this change. **Was there** is a piece or a control the builder already had.
**Recipe** is made from what is there, in the steps given. **Assumed** says a reading was made and
section 5 says which. **Question** is in section 6.

### Part 1, the manoeuvres

| Item | How it is built now | Status |
| --- | --- | --- |
| Straight, exit biased left, right, up, down | Then or Into it: **Straight**, with **Exit leans** | Built |
| Hop (pop-over) | **Hop**, over or under (a dip), and tight, standard or wide. Over a hurdle or a gate: Fly over | Built |
| Turn: hairpin 180, orbit 360, 90, 180, 360, left or right | **Turn**, with **Which way** and **How far round**; round a flag: Round it | Built |
| Climbing turn: spiral up, orbit up | **Climbing turn**, 90 / 180 / 360, left or right; round a flag: Round it; a flagged leg: Spiral up; a stack: spiral up, left or right | Built |
| Descending turn: spiral down, orbit down | **Descending turn**, the same ways; a flagged leg: Spiral down; a triple stack: spiral down, left or right | Built |
| Split-S (S-turn) | **Split-S**; a stack: Split-S | Built, stacks were there |
| Reverse split-S (half power loop) | **Reverse Split-S**; a stack: Reverse Split-S | Built |
| Power loop | **Power loop**; on a gate, **Power loop gate** flies it twice with a loop between | Built |
| Corkscrew, left or right, up or down | **Corkscrew**, with **Which way** and **Up or down** | Built |
| Dive | **Dive** | Built |
| Launch (punch-out) | **Launch**; and the **Launch gate** piece | Built |
| Slalom (weave) | **Slalom**, 3 to 6 weaves, left or right first; as pieces: Section, Flag slalom, Chicane, Esses | Built |
| Figure 8 (Dutch 8) | **Figure 8**; both flags of a gate: Round this gate, Figure 8; two flags: Section, Dutch 8 | Built |
| Matty flip (back swing) | **Matty flip** | Built |

### Part 2, flags

| Item | How it is built now | Status |
| --- | --- | --- |
| Flag | The Flag tool, with the side the line passes it on | Was there |
| Pennant, directional marker | A flag, with its pass side (the card's **Line passes on its**) | Was there, Assumed |
| Gate with a top corner flag | Flagged gate, **Flags: Left, Right, Both, On top** | Was there |
| Double flagged gate, including the figure 8 | Flags: Both; **Round this gate: Figure 8** flies it through, round one flag, back through, round the other, back through | Built |
| Flag slalom | Section: **Flag slalom** | Built |
| Two flag Dutch 8 | Section: **Dutch 8** | Built |
| The flag's line goes on for ever: round, never over | The warning `over-flag` | Built |

### Ground gates

| Item | How it is built now | Status |
| --- | --- | --- |
| Gate with an exit bias | Then: **Straight**, Exit leans | Built |
| Turnaround | **Round this gate: Turnaround**, hairpin left or right, or over the top | Built |
| Power loop gate | **Round this gate: Power loop gate** | Built |
| Corkscrew | Then or Into it: **Corkscrew** | Built |
| Gate slalom | A **Wall** flown as a weave (was there), or Section: **Chicane** or **Esses**, or **Slalom** as a figure | Was there, Built |
| Hairpin pair | Section: **Hairpin** with two gates | Built |
| 90 and chicane | Then: **Turn** 90; Section: **Chicane** | Built |
| Angled gate | A gate turned to any angle: the card's **Turn**, or the heading field. Turned over on its side (banked, with roll): not in the document | Was there, Question |
| Fly over gate | **Fly over** on a gate's card: the lap hops it a metre above its frame; Over or Skim | Built |

### Hurdles

| Item | How it is built now | Status |
| --- | --- | --- |
| Hurdle 10 ft by 5 ft: over, skim, 45 degrees | Hurdle, **Size: 10 x 5 ft**, **Flown: Over or Skim**, **Set at: 45 degrees left or right** | Built |
| Hurdle: under | **Bar hurdle**, **Flown: Under**; a board on the ground has nothing to go under | Built |
| Slurdle | A hurdle, then **Then: Slalom**. Nobody's definition of it is in the course book or the contest rules I could find | Recipe, Assumed |
| h-hurdle | Hurdle, **Size: h-hurdle** | Built, Assumed |
| Super hurdle | Hurdle, **Size: Super** | Built, Assumed |

### Elevated and stacked

| Item | How it is built now | Status |
| --- | --- | --- |
| Tower, double stack, ladder, triple gate | Tower, Double stack, Triple stack | Was there |
| Ladder: spiral up or down, left or right | Triple stack, How it is flown: **Spiral up** or **Spiral down**, then **Which way it turns** | Built |
| Topless ladder | A triple stack with its top bar taken away (the frame grid, in the details) | Was there |
| Split-S gate | A stack: **Split-S**. As MultiGP draws it (a gate up and over, with flags behind and beside it): a Tower, **Fly over**, flags beside it | Recipe, Assumed |
| Offset 90 | A gate and a Tower beside each other, one turned a quarter with **Turn** | Recipe, Assumed |
| Dive gate, its entries and exits | Dive gate with **Reverse** for the other way through; **Dive** and **Launch** as the figure into or out of it | Was there, Built |
| Launch gate | The **Launch gate** piece | Built |
| Cube | A whoop piece. Not on a five inch track | Was there, Question |
| Tunnel | | Question |
| Sky bridge | | Question |

### Indoor and whoop

| Item | How it is built now | Status |
| --- | --- | --- |
| Arch | | Question |
| Hoop | The Hoop (whoop), not on the board yet | Was there |
| Horizontal hoop | A Hoop with **Tilt** 90 in the details, or the whoop's Horizontal gate | Was there |
| Keyhole | | Question |
| Furniture gaps | Table, Chair and Banner (whoop), not on the board yet, and the named Gap on a map | Was there |

### Course structure

| Item | How it is built now | Status |
| --- | --- | --- |
| Start and finish | Start pads, and the first gate in the order, which the race times from | Was there |
| Straight, sweeper, hairpin, chicane, esses | The Section tool | Built |
| Crossover | Two sections laid across each other, one raised on a tower or elevated gates. No rule checks the height: see section 6 | Recipe, Question |
| Step sequence | Section: **Step sequence**, climbing or dropping | Built |
| Gaps | Section: **Gap**, short, normal or long. The named Gap is a map's | Built, Assumed |

## 5. What was assumed, and how to reverse each

1. **Slurdle.** The course book, the contest rules and the shop do not define it. I read it as a hurdle
   with a slalom after it and built nothing for it. Tell me what it is and it becomes a preset.
2. **Super hurdle.** MultiGP says "massive" and gives no figure. It is twice the standard hurdle, 20 ft by
   10 ft. The numbers are `HURDLE_SIZES` and `BAR_HURDLE` in `parts.js`, and the width and height are
   fields in the details.
3. **h-hurdle.** MultiGP builds it as a hurdle with a 5 ft pole rising from one end and a 1 ft arm at the top
   of the pole. I built the pole as the hurdle's own flag mast, 10 ft tall, on one end. The arm is
   not drawn.
4. **Gaps.** I read "gaps" in the course structure row as the spacing of gates in a section. If it meant
   the named Gap a map has, that exists and is a map's.
5. **Pennant, directional marker.** A flag with the side the lap passes it on.
6. **The sizes of a section and of the figures** are mine, from MultiGP's gate sizes and the radii the
   rest of the builder is held to. They are `RUN_BASE`, `SWEEP_RADII`, `HAIRPIN_RADII` and `SWING` in
   `runs.js` and `FIGURE_BASE` in `manoeuvres.js`.
7. **Orbit up and orbit down on a stack** are the spiral up and down: the line goes round the structure
   between openings. The left or right is the pilot's.
8. **Split-S gate and offset 90** are recipes, because the course book describes them in a sentence and the
   pieces are all there. Say if you want one press for either.

## 6. Questions for the owner

These each change the document's shape or need a definition, so none of them was done.

1. **Roll on a gate.** "Angled gate" may mean a gate banked over on its side. The document has pitch (tilt
   forward) and yaw (heading) and no roll, and the game builds a gate with pitch and yaw only. Roll is a field
   on every aperture, a change to how the game builds a gate and how the line reads its tangent. Is a banked
   gate wanted, and at what angles?
2. **Tunnel.** One element with a length, flown through, or a run of gates? A tunnel of N gates is one press
   with the Section tool today (a straight with the gap short); one element that is a tube is new geometry
   in the game and a new type on the board.
3. **Sky bridge.** I could not tell what it is, so it is not built. A bridge two towers carry, a bar hurdle
   flown over and under at different laps, or a map's Bridge?
4. **Arch and keyhole.** A new aperture shape each (a flat top and a round one, or a gate with a hole in its
   face), which is a new `apertureShapeOf` and a new mesh. The hoop and the hex gate are the whoop's two
   shapes beside the square.
5. **The board's vocabulary.** The board does not yet know the hoop, the hex gate, the table, the chair or
   the banner, and refuses a track with one in it. None of the new pieces here needs it. Teaching the board
   those is its own change, in the board's repository, and a cube on a five inch track needs it too.
6. **A crossover rule.** I wrote a check that notes where the line crosses itself within a body's height of
   itself, and took it out: it fired twice on the Nationals qualifier, which is a time trial and is right. If
   heats are flown on these tracks it should come back, as a note and not a warning.
7. **A climbing turn with something over it.** The radius of a climbing turn is limited by anything
   overhead. The `barrier` check already warns when the line goes through a barrier, a table or a banner, and
   nothing checks the line against a structure that stands over it. That check is the freestyle map's
   solids, and I did not extend it to a race track.
8. **The new word on a sequence entry.** `wrap` is optional and additive and is in `schema.md`. It is the
   one change to the document. A track with a right-handed spiral that is published to the board carries it,
   and the board stores it with the rest of the document; the board's layout hash covers it, so changing
   which way a spiral turns is a new layout there. Say if you would rather it were a waypoint instead.

## 7. How it is checked

- `node src/trackbuilder/selftest.js`: 2,139 passed. New suites: the manoeuvres (geometry, mirror images,
  names), the flight paths in a document (laying, reading back, clearing, the second pass, a flag's turn
  and two of them in a row, a gate's figure beside a flag's), stacks (which way a spiral turns, the half
  loops), sections (every shape, in a document, on both classes), hurdles (sizes, over, skim, under,
  angle, a gate flown over), the launch gate, and the over-flag warning.
- `node scripts/builder-flow-check.js`: 639 passed, 0 failed. The case `five inch: variants` drives a
  flight path, a section, a bar hurdle and a launch gate with the pointer.
- `npm run lint:devices`: clear on every device. It found that the new rows made the whoop card too tall
  for a tablet held in the hand, so on a touched screen the choices are left to the details and Then and
  Into share a row.
- Looked at in headless Chromium, on a field and on a whoop track: the pictures of the figures, the
  Flight path section, the Section options and its ghost, the hurdle card.

## 8. What changed

New: `manoeuvres.js`, `flightpaths.js`, `glyphs.js`, `runs.js`. Changed: `path.js` (a waypoint's
pitch), `figures.js` and `model.js` (`wrap`), `parts.js` (the hurdle family, a gate flown over),
`warnings.js`, `elements.js` (three pieces), `ui.js`, `app.js`, `edit3d.js`, `index.html`,
`schema.md`, `selftest.js`, the flow check. No file under `vendor/`, and no module or build change.
