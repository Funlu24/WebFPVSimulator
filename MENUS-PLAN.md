# Menus: a review, and a plan to streamline and fine tune

The owner asked on 2026-10-01: "The menu systems through the game, map
builders and tracks and times page have grown in complexity over the last
month. Please undertake a full uiux review of the menu systems and make a
plan to stream line and fine tune." This is that review and that plan.
Nothing in either repository was changed to write it, except this file and
its PROGRESS.md entry.

**What was looked at.** Three surfaces that a pilot moves between as if they
were one product:

- the simulator's menu shell: `src/ui/ui.js`, styled in `index.html`, wired
  in `src/main.js`, on main at 831b724;
- the builder, `src/trackbuilder/`, at the same commit, on all three
  canvases;
- the board, "Tracks and Statistics": the WebFPVSimulator-LeaderBoard
  repository at 4935604, which is byte for byte what
  https://webfpv.org/board/ serves.

**How.** The real pages in headless Chromium, through a copy of
`tests/lib/page.js` kept in the session scratchpad. The copy served the live
board's GET API to the page and refused every other request, so the Race and
Freestyle rooms showed the real 44 tracks and 18 maps, and no stats event,
time, ticket or track reached production (every POST was refused and
logged). Every screen was photographed at 1600x900. Every room, the launch card,
pause and results were also taken at 844x390 with touch, and the gate,
title, Race room and Settings at 390x844. The builder
was taken at 1600x900, 1280x720 and 844x390, and the board at 1600x900 and
390x844. Each screen's live row list was read through `window.__ui`.
`npm run lint:shell` was run once. Three read only code inventories were
taken, of the shell, the builder and the board.

The pictures are in that session's scratchpad
(`/tmp/claude-0/-home-user-WebFPVSimulator/ffed60f5-1978-5614-aaea-d550c8f33970/scratchpad/shots/`),
not in the repository, per CLAUDE.md. A name below such as `d-20-pilot.png`
says what was looked at, and the file and line references say where. The
prefixes are `d-` for desktop, `pl-` for a landscape phone, `pp-` for a
portrait phone, `b-` `bs-` `bp-` for the builder at three sizes, `w-` `wp-`
for the board, and `v-` for pictures taken to check a finding.

**What was not judged.** Flight feel, physics and the HUD in flight, except
where a menu sits over them. The results pictures were staged: the race
results through `showResults` with a hand made log, and the freestyle results
through the lettering fixtures in `src/ui/letterdemo.js`. They are used for
layout only, never for a row's text.

Sizes: S is under half a day, M a day or two, L a week or more. Nothing here
touches physics, the plant, the module ABI or the build.

---

## In one page

### Keep

A lot here is right, and the plan is built not to break it:

- **One row grammar everywhere.** A chevron is a door, an arrow leaves the
  tab, and a value adjusts in place.
- **Escape always lands somewhere that exists.** `lint:shell` walks it.
- **The cursor comes back** to the row you left.
- **Three voices in the key legend:** keyboard, pad, and "Tap a row" on touch.
- **The gate's cards are reused** by the builder's chooser.
- **Tune, PIDs and Rates each live in one room**, with doors to them from
  elsewhere rather than copies.
- **Getting into the air is quick.** A returning pilot needs three Enter
  presses (gate, Fly, launch card) and a first visitor needs two
  (measured below).
- **The board is the most finished of the three:** a real search, five
  orders, a sheet per track, and ghosts on 258 of 322 times.

### What has gone wrong

It is not any one screen. Each decision in `ui.js` is argued in its comment,
and each was right for the report it answered. A month of those answers adds
up to six problems.

1. **Too many names for the same few things.** Each rename fixed one report,
   and the old name stayed somewhere. The board's row went from Leaderboard,
   to Open the board, to Tracks and Times, to Tracks and Statistics. The
   settings room went from Settings, to Pilot, to Pilot and radio, and back
   to Settings. Today:
   - The board is called eight things depending on the screen: "Tracks and
     Statistics", "Tracks and Statistics on the web", "Open Tracks and
     Statistics", "Open on the web", "Tracks and times", "Tracks and Times",
     "THE BOARD" and "leaderboard".
   - The builder is "Map builder" on the gate and "TRACK BUILDER" on its own
     page.
   - One setting is "Flight model" on the launch card and "Physics model" in
     the Freestyle room.
   - The town's card says "Freestyle city"; every sentence about it says "the
     town".
2. **Rows whose value is about something else.**
   - On the title, Settings reads "Not set": that is the pilot's name.
   - Quad reads "Betaflight default": that is the tune.
   - On the pause menu, Quad and Tune both read "Betaflight default", one
     above the other.
3. **Long rooms in short windows.**
   - Settings is 39 rows in a 464 px window: 1,691 px of list, which is 3.6
     windows of scrolling at 1600x900 and 11 on a landscape phone.
   - The Race room's eight action rows start at y=1854, under 31 cards.
   - Credits' two rows hang 1,540 px below the window, which is why
     `lint:shell` is red on main today.
   - How to fly's only row is 123 px below the fold.
   - At 1600x900, Pause's last row, Quit to title, is cut off.
4. **Chrome on every screen.** A room carries up to seven things that are not
   its rows: the crumb, a Patreon chip, a Flying chip, Report bug, the music
   chip, a sticky copy of the primary row, and the key legend. On a landscape
   phone they leave the title one and a half rows.
5. **Joins that drop you at the front door.**
   - Every simulator row that promises "The public page for" a track opens the
     board's front page.
   - The board's Fly this track lands on the simulator's title, while its Fly
     this map goes straight into the air.
   - The same door has a different name on each surface.
6. **A radio cannot drive six screens.**
   - On the title menu, Quad, Rates, PIDs, the firmware bench and Stick help,
     the sticks never move the cursor (`ui.js:16350`). Each has a reason
     written beside it, but the legend still says "Pitch Move" there.
   - Quad opens with the cursor on Aircraft, where one select swaps the
     aircraft and the world.
   - Dialogs ignore the pad entirely, so a radio pilot cannot answer the form
     that opens by itself after their first race.

Two things stand apart from the six:

- **One outright trap.** In the whoop builder, the side drawer cannot be
  closed once it is open (1.18).
- **One matter that is not about menus at all.** The board's bug inbox
  answers without a token on production. It should not wait for this plan;
  see "Found on the way".

### The plan in seven moves

1. **One glossary, enforced by the noun lint** (Stage 0 and Stage 1).
2. **Fine tune** every collision, every cut value and every row under the fold
   named below (Stage 1, all S).
3. **The simulator** (Stage 2):
   - the title from 10 rows to 8, and the pause menu from 17 items to 12
     (14 stops to 10);
   - Settings from 33 stops to about 24, with the render knobs behind one
     Advanced door;
   - the Race room's actions moved onto the chosen track;
   - a budget for the chrome.
4. **The board** (Stage 3): one name, tracks on a phone's first screen, each
   pilot's best time first, and deep links.
5. **The builder** (Stage 4): one name, one view vocabulary, and panels that
   belong to the canvas they are on.
6. **The joins** (Stage 5): deep links both ways, and the same name for the
   same door on all three surfaces.
7. **The radio, and copy that is true** (2.9 and 1.35): the sticks, or one
   stated rule, on every screen; and notes that promise the board only what
   it is actually sent.

---

## What was measured

### Growth since 30 August

Measured on origin/main against 34e9323, the last commit of 30 August.

| | 30 Aug | 1 Oct | Commits in September |
|---|---|---|---|
| `src/ui/ui.js` | 9,027 lines | 16,450 | 126 |
| `index.html` | 3,424 lines | 5,507 | 65 |
| `src/main.js` | 6,900 lines | 11,444 | 134 |
| `src/trackbuilder/` | 13,536 lines in 18 files | 48,559 in 34 | 105 |
| Board `public/index.html` (from 25 Aug) | 1,301 lines | 3,002 | 43 of 55 board commits touched `public/` |
| Board `public/app.js` (from 25 Aug) | 1,202 lines | 3,263 | |
| Named shell screens | 14 | 16 | |
| Row notes in `ui.js` | 44 strings, about 790 words | 67 strings, about 1,620 words | rough regex count |

The screens barely multiplied. What grew is what is inside them: rows, notes,
conditions and doors.

### The simulator at 1600x900, rows read live

| Screen | Rows | Where the rows sit | Picture |
|---|---|---|---|
| Gate | 4 cards | fine | `d-00-gate.png` |
| Title | 10 | fine; strapline, BETA, Patreon and lap chip above | `d-10-title-returning.png` |
| Race (`courses`) | 31 track cards, then 8 rows | the rows start at y=1854 | `d-20-courses.png`, `v-71-courses-bottom.png` |
| Standings | 4 | fine | `v-72-standings.png` |
| Before you fly (`launch`) | 10 (8 stops) | fine | `d-20-launch.png` |
| Freestyle | 12 cards, then 5 rows | the rows start at y=895 | `d-20-freestyle.png` |
| Quad | 12 (9 stops) | fine | `d-20-quad.png` |
| Settings (`pilot`) | 39 (33 stops) | 1,691 px list in a 464 px window | `d-20-pilot*.png` |
| Rates | 21 | 940 px list in 500 px | `d-20-rates*.png` |
| PIDs | 14 | 654 px list in 500 px | `d-20-pids*.png` |
| Firmware bench | 129 on the PID tab | 4,339 px in 740 px | `v-10-fc-via-door.png` |
| Paused | 17 (14 stops) | Quit to title is cut at the bottom | `d-32-paused.png` |
| Run complete | 8 (2 greyed out) | the Total row slides under the menu | `v-60-results-race.png` |
| How to fly | 1 | Back is 123 px below the window | `d-20-howto.png` |
| Credits | 2 | 1,540 px below the window | `d-20-credits.png` |
| Stick help | 4 | fine | `d-20-stickhelp.png` |

`npm run lint:shell` on main today: **FAIL**, "credits: the list hangs 1540
px off the bottom of the window, was 1518 px (0 of 2 rows visible)". It
passed on 2026-09-27 at 6928650.

### The simulator on a landscape phone, 844x390 with touch

| Screen | Window the list scrolls in | List | Rows visible on arrival |
|---|---|---|---|
| Title | 145 px | 614 px | 1.5 (`pl-10-title-returning.png`) |
| Before you fly | 222 px | 695 px | 3.5 (`pl-30-after-fly.png`) |
| Settings | 222 px | 2,518 px | 1.5 (`pl-20-pilot.png`) |
| Paused | small | | 2.5, Quit to title far below (`pl-32-paused.png`) |
| Firmware bench | 181 px | 10,765 px | |
| Race | page | rows at y=2748 | 3 cards (`pl-20-courses.png`) |

About one session in five on the board's own statistics is touch: 2,174 of
10,801 over 30 days.

### Presses to the air, by keyboard, from a cold load

- **A first visitor:** gate, then First flight. Two presses; the guided first
  flight skips the launch card.
- **A returning pilot:** gate, then Fly, then the launch card, whose cursor is
  already on Fly. Three presses.
- **From the board's Fly this track:** the simulator opens on the title, then
  Fly, then the launch card: two more presses after the click. This one is
  read from the code (board `app.js:414`; `src/main.js:9527-9545`), not
  driven.

### The board, live on 2026-10-01

- **Content:** 44 tracks (31 five inch, 13 whoop), 322 times, 18 maps.
- **On a phone:** at 360x780 the first track card starts at y=942, below the
  first screen. The masthead is 424 px and the toolbar 313 px.
- **Tags:** 7 of the 9 tag pills are disabled on the default view.
- **Every attempt is a row.** Flags and cones has 53 rows. In 22 of the 39
  flown tracks, one name appears more than once in the top three.
- **Pilot names are free text.** "AsylumFPV" and "Asylum Fpv" rank 2nd and
  5th as two pilots.

### The builder

Controls visible at once at 1440x900, hit tested by the builder inventory's
probe:

| State | Controls |
|---|---|
| Five inch, empty | 38 |
| Five inch, a 37 element track, one gate selected | 52 |
| Whoop, empty | 48 |
| Whoop, RaceGOW5 Track 6, one gate selected | 100 (55 of them in the room) |
| Freestyle map, empty | 47 |

The drawing area left by the bars, the banner and the panels:

| Canvas | Window | Drawing area |
|---|---|---|
| Five inch | 1280x800 | 780x650 |
| Five inch | 1440x900 | 910x750 |
| Five inch | 844x390 | 344x203 (`bp-10-race.png`) |
| Five inch | 390x844 | 0 px wide; 9 bar controls past the right edge |
| Whoop | 390x844 | 188 px wide |

`src/trackbuilder/index.html:1605-1612` declares phones out of scope, and
`html, body` are `overflow: hidden` (`index.html:206-209`), so a control
past the edge cannot be reached at all.

The palettes need scrolling:

- whoop at 1280x800: 878 px of buttons in 648 px, with Extra out of sight;
- freestyle at 1440x900: 1,538 px in 748 px, with 20 of 36 buttons visible.

What is already better than the polish survey found:

- The five inch bar no longer overlaps itself at 1440 to 1920. It wraps to two
  rows; that was polish item 7 (`b-10-race.png`).
- Gap labels avoid each other, and Labels is on all three canvases; that was
  item 13.

---

## Rules for every change in this plan

1. **One thing, one name, everywhere.** The glossary below is the list. A
   row, a heading, a crumb, a board button and a sentence in a note all use
   it.
2. **A row's value describes that row.** Quad shows the aircraft. Settings
   shows nothing, because the Pilot chip already shows the name.
3. **One home per setting.** A door elsewhere may show the value of the room
   it opens, never a second control for it. This is already the rule for
   Tune, PIDs and Rates; extend it.
4. **No scrolling the page to reach a room's rows.** Every row of a room is
   reachable without scrolling the page at 1280x720. On an 844x390 phone, the
   primary row and Back are on the first screen. A long list scrolls inside a
   window that uses all the height it has.
5. **A room explains itself in one line.** Anything longer goes in the help
   column, which shows only for the row under the cursor, or on the wiki.
6. **A chrome budget.** The crumb, the Flying chip and the legend appear
   everywhere. Everything else appears only where it is used.
7. **Links between the three surfaces land on the thing named.** The
   simulator, the builder and the board never send each other to a front
   page.
8. **Every change to rows lands with the check that sees it.** That means
   `lint:shell`, `lint:input`, `lint:devices`, `check:builder` and the noun
   lint. A baseline is never moved to make a check pass (CLAUDE.md). Where a
   number gets better, re-record the baseline deliberately and say so in
   PROGRESS.md.

---

## The glossary

The left column is the proposal. The owner's call on any of it is final; see
"For the owner".

| Thing | Call it | Called today | Where |
|---|---|---|---|
| The public site of tracks, times and maps | **Tracks and times** (in prose, "the board") | Tracks and Statistics | title row `ui.js:7087`, board `<title>` and eyebrow (board `index.html:37`, `2529`) |
| | | Tracks and Statistics on the web | Race room `ui.js:7319` |
| | | Open Tracks and Statistics | results `ui.js:8244`, `8269` |
| | | Open on the web | Standings `ui.js:7969`, `3310` |
| | | Tracks and Times | partners page (board `partners.html:929`, `1056`) |
| | | leaderboard | `ui.js:6971`, README |
| | | THE BOARD | gate card chip |
| The board's analytics page | **Site statistics**, in the board's footer only | Statistics, Site statistics | board `index.html:2570`, `2597` |
| Sending a lap to the board | **Post a time**, "Post 11.80" | Upload a time, Upload 11.80, Upload new best | `ui.js:3051`, `3086`, `12527` |
| | | post a lap, times posted | board copy |
| A recorded lap to fly against | **Ghost** for the thing, **Chase** for the verb | ghost | the simulator |
| | | chase | the board |
| | | Race the record | Standings `ui.js:7963` |
| The page that makes tracks and maps | **Builder** | Map builder | gate card `ui.js:3986` |
| | | TRACK BUILDER | the builder's own bar |
| | | Open in the track builder | `ui.js:7290` |
| | | Build a track | the board |
| | | Build a freestyle map | `ui.js:7474` |
| A gated layout with a clock | **Track** (a whoop's track is still a track; the room is where it stands) | track, room, Whoop Micro Tracks, course | board aircraft switch, builder, old links |
| A gateless place to fly | **Map** | map, world, place | |
| The shipped town | **The town** | Freestyle city | the card, `src/maps/registry.js:67`, `src/maps/city/index.js:2569` |
| | | The town, the whole town | every sentence about it |
| Expert or Arcade physics | **Flight model** | Flight model | launch card `ui.js:8024` |
| | | Physics model | Freestyle room `ui.js:7458` |
| | | Expert physics | help copy |
| The room of pilot settings | **Settings** | Settings | the screen, since the rename from Pilot (`ui.js:7055`) |
| The way back to the cards | **What to fly** (the gate) | "The three cards" | `ui.js:7119`; there are four |
| The room listing tracks | **Tracks**, opened by the title's Track row | crumb RACE, heading TRACKS | `SCREEN_TITLES.courses` at `ui.js:279`, the heading at `ui.js:4830` |
| The room listing maps | **Maps**, opened by the title's Map row | Freestyle | `ui.js:280` |
| The room of tunes and PID sliders | **Tune**, with PIDs inside it (crumb "Quad / Tune") | the row says Tune, the room says PIDs | Quad and pause rows `ui.js:3352`; `SCREEN_TITLES.pids`. PROGRESS records it as an open question (`PROGRESS.md:37576`) |
| The Betaflight key editor | **Firmware bench** | Every setting, Flight controller screen | PIDs row `ui.js:8609`; `src/ui/fc.js:797` |

`scripts/noun-lint.js` already exists on both sides. Its word list should
grow by the retired names in the "Called today" column, so that a retired
name fails the lint rather than coming back in the next ticket's note.

---

## The simulator's menus, before and after

### Title (race)

```
before (10)                        after (8)
Fly                                Fly
Track       Flags and cones  >     Track      Flags and cones  >
Quad        Betaflight default >   Quad       Five inch        >
Settings    Not set          >     Settings                    >
How to fly                   >     How to fly                  >
FPV wiki                     ^     Tracks and times            ^
Tracks and Statistics        ^     About                       >   Credits, Partners, Support, FPV wiki
Support                      ^     What to fly
Credits                      >
What to fly
```

Support is already the Patreon chip beside the wordmark. Credits already
holds the Partners door. FPV wiki is the one outbound row a pilot needs least
while choosing what to fly.

### Paused

```
before (17 items, 14 stops)        after (12 items, 10 stops)
Resume                             Resume
Restart run                        Restart run
Ghost       Your best lap          Ghost      Your best lap
DOES IT FEEL WRONG?                DOES IT FEEL WRONG?
Tune        Betaflight default >   Tune       Betaflight default >
Rates       Actual 670/670/670 >   Rates      Actual 670/670/670 >
Weight      100 %                  Weight     100 %
Flight feel                        Flight feel
ELSEWHERE                          ELSEWHERE
Quad        Betaflight default >   Settings                      >
Settings    Not set          >     How to fly                    >
Graphics    AUTO LOW MED HIGH      Quit to title
How to fly                   >
FPV wiki                     ^
Support                      ^
Credits                      >
Quit to title
```

Graphics stays reachable through Settings. Whether it deserves its own row
mid run is the owner's call; see "For the owner".

### Settings

Before, the room had 33 stops under six headings: You, Sticks, Screen, HUD,
Sound and Diagnostics. After:

```
YOU         Your name
STICKS      Choose joystick, Calibrate sticks, Check sticks, Stick help,
            Stick mode, Keyboard throttle, Rates, Radio link
SCREEN      Graphics, Advanced graphics >, Fullscreen in flight,
            Manga and scoring, Clean FPV, Impact frame, Crosshairs
SOUND       Sound, Volume, Motors, Wind, Music, Music track, Binaural tone
            Back
```

That is about 24 stops. Advanced graphics is a new room holding GPU, Render
scale, Frame cap, Low latency view, Predicted view, Frame pacing, Input to
screen, Flight log and Download flight log: the nine rows a pilot touches
only when something is wrong.

The row "Tune, PIDs and the firmware" (`ui.js:7740`) goes. It is a door to
Quad, which is on the title.

The list window also grows to the height it has. At 1600x900 the panel is
464 px tall and ends at y=748, about 110 px above the legend, with the room's
heading and lede taking the 280 px above it.

### Tracks (the Race room)

Before: 31 cards, then eight rows that act on the seated track, whose card is
two screens up (`v-71-courses-bottom.png`):

- Open in the track builder
- Publish this track (greyed out)
- Upload a time (greyed out)
- Edit a copy
- Edit this track (greyed out)
- Standings
- Tracks and Statistics on the web
- Back

Choosing a card already swaps in that card's own rows (`ui.js:3279-3317`):
Fly it, Open in the track builder, Standings, Open on the web and Back to
the list, under a heading with its name. But they are drawn in the same place
under the grid. Choosing a card in the top row scrolls the page to the
bottom, and the card that was chosen leaves the screen
(`v-80-courses-card-chosen.png`).

After, there are two versions, an S one now and an M one later.

- **S.** The row block sits in a column beside the grid, or above it, so it
  is on screen on arrival. Greyed rows are hidden, and their reason goes in
  the help line of the row that replaced them.
- **M.** Choosing a card opens its rows beside the card, as a sheet the way
  the board's track sheet works, rather than at the foot of the page. The
  seated track's eight rows fold into the same sheet. The sheet holds:
  - Fly;
  - its top three, with a door to Standings;
  - Edit, which is the right one of "Edit a copy" and "Edit this track";
  - Post a time, when one is pending;
  - Publish, on your own unpublished track;
  - "This track on Tracks and times".

  The room's own rows become a "New track" card at the front of the grid, and
  Back. Add the board's order control (most flown, newest, mine) once there
  are more than about 12 cards; there are 31.

### Run complete

Before, eight rows: Fly again, Upload 11.80, Publish this track (greyed),
Edit a copy, Edit this track (greyed), Open Tracks and Statistics, Flight
feel, Back to title.

After, six rows:

- Fly again
- Post 11.80
- Edit
- This track on Tracks and times
- Flight feel
- Back to title

Greyed rows are hidden. Publish shows only on your own unpublished track.

---

## Stage 0: guards first

The menus have more checks than most of the project. Two of them are red or
blind today, and every structural change below moves rows those checks
assert on, so they come first. This is the menus' version of the owner's
rule that coverage lands before the model changes.

### 0.1 `lint:shell` is red on main
- **What.** "credits: the list hangs 1540 px off the bottom of the window,
  was 1518 px". Credits' Partners and Back rows sit under the whole credits
  roll. The fold grew 22 px since 2026-09-27, when the check passed. The
  previous entry in PROGRESS.md (2026-10-01, the new tickets) found the same
  failure on an untouched commit and left the baseline alone as the owner's
  call.
- **Fix.** Fix the layout, not the number: put Credits' two rows where they
  are seen on arrival, beside the roll or pinned at its foot. The check then
  improves, and its baseline is re-recorded down with a note. Do not raise
  the budget.
- **Size.** S.

### 0.2 The fold checks see one window size
- **What.** `scripts/shell-check.js` measures `below` and `seen` at
  1600x900, plus `--w/--h` by hand. Several findings below exist only at
  1280x720 or 844x390.
- **Fix.** Run the walk at 1600x900, 1280x720 and 844x390 with touch, and
  assert three things for the title, launch, paused, results, stickhelp,
  howto and credits:
  - the primary row is seen on arrival;
  - Back, or the way out, is seen on arrival;
  - nothing hangs below the window.
- **Size.** S to M.

### 0.3 The glossary as a lint
- **What.** The names drift because nothing fails when they do.
  `scripts/noun-lint.js` has one rule: it fails on a player visible "course"
  (`noun-lint.js:66`), and its allowed list is empty. It passes on main, 295
  files.
- **Fix.** Extend it in both repositories with the retired names from the
  glossary. Then add a check that one action has one label: every row whose
  action is `leaderboard`, or whose note opens the board, carries the same
  words.
- **Size.** S.

### 0.4 The checks that pin today's rows
`lint:input` asserts that calibration lives in Settings, through the
`calibrate` action. `shell-check.js` pins the stop count and travel per
screen. `device-check.js` pins the builder bar and the phone OSD.
`builder-flow-check.js` walks the builder. Each stage below names which of
these it changes, and each change is deliberate and recorded.

---

## Stage 1: fine tune

All S, no structure moved. Most are one string or one CSS rule.

### Names and values

**1.1 The gate row promises three cards; there are four.**
- **Where.** `ui.js:7119` says "The three cards: five inch racing, whoop racing
  or freestyle". The gate also has Map builder (`BUILDER_CARD`, `ui.js:6903`).
- **Fix.** Name all four, or say "the cards".

**1.2 Settings shows "Not set".**
- **Where.** `ui.js:7075` puts `readPilotName() || 'Not set'` on the Settings
  row of the title and pause menus.
- **Why.** It reads as "your settings are not set". When a name is set, the
  Pilot chip in the top right already shows it (`contextChips`, `ui.js:14640`).
- **Fix.** No value on the Settings row. The Your name row inside keeps "Not
  set".

**1.3 Quad shows the tune.**
- **Where.** `ui.js:7049` shows `tuneById(s.tune).name`, so the title,
  the launch card and the Freestyle room read "Quad: Betaflight default". The
  pause menu then has Quad and Tune with the same value.
- **Fix.** Quad shows the aircraft ("Five inch", "65 mm whoop"). Tune keeps
  the tune.

**1.4 "Physics model" and "Flight model" are one setting.**
- **Where.** `ui.js:7458` and `ui.js:8024`.
- **Fix.** Call both Flight model, per the glossary.

**1.5 The town's card says "Freestyle city".**
- **Where.** `src/maps/registry.js:67` and `src/maps/city/index.js:2569`.
  Every sentence about it, including the gate's, says the town.
- **Fix.** The card says The town. Check that stats, ghosts and saved
  settings key off the id, not the name, before renaming. The board's
  statistics already count it as "Freestyle city" (board `stats.js:908`)
  while the partners dashboard says "The town" (board `partners.js:62`); pick
  one there too.

**1.6 The Race room is RACE in the crumb and TRACKS in the heading.**
- **Where.** `ui.js:279` and `ui.js:4830`. The title row that opens it is
  Track.
- **Fix.** Tracks for the crumb, the heading and `SCREEN_TITLES`. Freestyle
  becomes Maps the same way, opened by the Map row. This one is the owner's
  call, because "Race" and "Freestyle" are also the gate's words.

**1.7 Upload becomes Post.**
- **Where.** `ui.js:3051`, `3059`, `3067`, `3086` and `12527`. The board says
  post ("post a lap under your name"), and so does the Quad room's own lede
  ("Carried with every time you post").
- **Fix.** "Post a time", "Post 11.80".

### Layout and collisions

**1.8 The no radio message is printed over the Settings heading.**
- **Where.** Calibrate sticks with no pad reuses the flight banner
  (`ui.js:4540`, fed by `noRadioBanner` at `src/main.js:6296`). Notices are
  drawn at 22% of the height whatever screen is up (`src/main.js:9318`, which
  runs before the menu check at `9320`). Its three lines of 32 px yellow type
  sit on the SETTINGS lettering and the lede (`v-20-calibrate.png`).
- **Fix.** On a menu screen, say it in the help column of the Calibrate row,
  or as the notice style the shell uses elsewhere. The banner is for flight.

**1.9 PAUSED is lettered over the lap clock.**
- **Where.** The OSD's 0.00 and "No record yet" print through the heading
  (`d-32-paused.png`, `pl-32-paused.png`).
- **Fix.** Hide the OSD's centre block while paused, or move the heading
  below it.

**1.10 On a phone, the Race room's TRACKS lettering covers the RACE crumb**
and the Patreon chip, and Report bug covers the end of the lede
(`pl-20-courses.png`). On the phone launch card and Freestyle room, Report
bug and the music chip sit on the panel's top right (`pl-30-after-fly.png`,
`pl-20-freestyle.png`).
- **Fix.** The chrome budget in 2.6 removes most of this. Until then, give the
  heading a top margin equal to the chrome's height under 500 px tall.

**1.11 Results: the Total row slides under the menu.**
- **Where.** At 1600x900 with three laps, the menu box starts at y=450 and the
  Total row is at y=440 (`v-60-results-race.png`). Polish item 8 fixed the
  trick rows at 1280x720; the lap list has the same problem.
- **Fix.** Use the same fix: the copy column scrolls above the menu, or the
  rows are capped.

**1.12 How to fly's Back is below the window.**
- **Where.** 123 px under it at 1600x900. The closing paragraph sits under the
  key legend (`d-20-howto.png`).
- **Fix.** Pin the one row at the foot of the content column.

**1.13 The paused menu's last row is cut.**
- **Where.** Quit to title is half under the legend at 1600x900
  (`d-32-paused.png`).
- **Fix.** Stage 2.2 removes five rows. Until then, the list's window has to
  end above the legend.

**1.14 Race card metadata runs together.**
- **Where.** "by Crapshack 13 gates record 9.04", with no separators, and the
  number wraps onto its own line (`d-20-courses.png`). The Freestyle room
  writes "by DankProps · 62 pieces", and the board "by Le Star · 12 gates".
- **Fix.** The board's form: "by X · 12 gates", with the record on its own
  line, labelled.

**1.15 The GPU row cuts its value.**
- **Where.** "Software (Google Inc. (..." (`d-20-pilot-mid.png`).
- **Fix.** Show the renderer's short name. It moves to Advanced graphics in
  2.3 anyway.

**1.16 The Quad room's picture contradicts the Flight mode row.**
- **Where.** On a keyboard, the row has ACRO selected while the caption under
  the quad says "ANGLE. STICKS ARE TILT. HANDS OFF LEVELS." (`d-20-quad.png`).
  Both are true: a race on keys starts in Angle whatever the row says
  (`ui.js:7561`). But the screen asserts two different things.
- **Why it happens.** Keyboard race mode (`keyRaceMode`, `ui.js:975`) is a
  setting with no row: only M in flight changes it. So the Quad room cannot
  say it.
- **Fix.** Say it on the row itself: "Acro (keys race in Angle)". Or disable
  the segment that does not apply, with the reason in the note.

**1.17 The Freestyle room's Flying chip names the race track.**
- **Where.** While a pilot is choosing a map, the chip says "Flying Flags and
  cones" (`d-20-freestyle.png`).
- **Fix.** Hide it in the Freestyle room until a map is seated, or say "Last
  flown".

### The builder

**1.18 The whoop drawer cannot be closed once it is open.** This is the most
serious item in the review.
- **What.** In the whoop room at 1280x800, 1440x900 and 1920x1080, the right
  hand drawer has four faults:
  - it covers its own only toggle, the lap bar's Flying order button, and
    covers Build sheet beside it;
  - at 1280 and 1440 it also covers the selection card's close button;
  - it has no close button of its own;
  - Escape does not close it: the Escape handler at
    `src/trackbuilder/app.js:4398-4408` has no step for it.

  At 1024 wide it also paints over open dialogs, because its z-index is 30
  (`index.html:1661`) against the dialog's 20 (`index.html:1378`).
- **Evidence.** The builder inventory's hit tests and its pictures
  `agentB/shots/whoop-track6-drawer.png` and `drawer-over-modal-1024.png`.
  The code is at `index.html:1659-1670`, `ui.js:1824` and `2286-2287`, and
  `app.js:1914-1917`.
- **Why.** An author who opens the order to check it is stuck with half the
  room covered.
- **Fix.**
  - Give the drawer a close button.
  - Make Escape close it before it clears the selection.
  - Keep the toggle outside the drawer's footprint.
  - Put the drawer under the modal layer.
  - Add the drawer to `lint:devices`, which checks the whoop bar only on
    tablets today.

**1.19 The builder's More menu ignores Escape.**
- **Where.** It closes on a mousedown elsewhere or on its own items
  (`src/trackbuilder/app.js:3917`), so a keyboard user cannot close it.
- **Fix.** Close it on Escape, and give focus back to More.

**1.20 One key, two tools.**
- **What.** The whoop palette shows O on both Fly order and Ground logo, and
  pressing O arms Fly order (`elements.js:960`, `1514`; `app.js:4467-4472`).
- **Fix.** Give one of them another letter.

**1.21 Load deletes without asking.**
- **What.** The Load dialog's own Delete removes a track at once
  (`app.js:2538-2546`), while More > Delete asks first (`app.js:2460-2465`).
  Its rows also have three smaller faults:
  - they show a raw ISO time;
  - they never say which kind of track a row is;
  - the five inch list includes whoop rooms, because the library is filtered
    by mode only (`storage.js:129-132`).
- **Fix.**
  - Confirm, or offer an undo toast.
  - Show "2 days ago".
  - Put the class on the row and filter the list by class.

**1.22 Publish shows a raw "Board address" field.**
- **What.** Both Publish dialogs carry a URL field for the board's address
  (`app.js:2851`, `3032`).
- **Why.** It is a developer's override, and `?board=` already covers it.
- **Fix.** Remove it from the dialog.

**1.23 Path and Show line are one switch twice.**
- **What.** The palette's Path and the bar's Show line toggle the same thing
  (`ui.js:478-481`; `app.js:3845`), and Path stays lit like an armed tool
  (`b-20-whoop.png`).
- **Fix.** Keep Show line.

**1.24 Back to the simulator lands on the gate.**
- **What.** It is a plain `../../index.html` (`app.js:3875`), so the
  simulator asks what to fly again instead of returning to the title or the
  room the pilot came from (`ui.js:4128`, `4190`).
- **Fix.** Carry `?craft=` and the mode, as Fly this track already does.

**1.25 The builder's banner says tracks on every canvas.**
- **Where.** "This browser only. Tracks you build stay here ... Publish a
  track" is static HTML (`src/trackbuilder/index.html:2008`), shown on the
  freestyle canvas too (`b-30-map.png`).
- **Fix.** The noun follows the canvas. After a first save, the banner
  becomes a short status ("Saved in this browser") beside Save, rather than
  a full width bar.

**1.26 The freestyle canvas has a Flying order panel whose only content is
that a map has none** (`b-30-map.png`).
- **Fix.** Hide the panel on maps.

### The board

**1.27 Hide empty tag pills.** Seven of nine are disabled on the default view
(`w-00-home.png`). Whoop rooms wear the five inch "Small field" tag:
`board.js:480-486` defines it as a five inch tag, and 10 of the 13 rooms carry
it.

**1.28 Take Admin out of the public masthead.** Show it once signed in, or put
it in the footer (`w-00-home.png`).

**1.29 Remove the dead credits overlay.** `#credits-sheet` (board
`index.html:2989`) is never opened, and `bindCredits` still fetches its three
logos at boot (board `app.js:2963`).

**1.30 Keyboard.** Two problems:
- Six spine links at opacity 0 are in the tab order at the top of the page
  (board `index.html:431-445`).
- The search box and the selects drop their focus outline (board
  `index.html:531`, `571`).

**1.31 The statistics view's `.hero` and `.facts` rules also restyle the track
sheet** (board `index.html:2321-2338`). Scope them to the statistics section.

**1.32 Two counts with one name.** The masthead's Pilots is 51 names that have
posted a time. The statistics' Pilots today is 241 browsers. Times is 322 in
one place and 329 in another (board `app.js:1644-1684`; `stats.js:971-975`,
`1120-1127`). Label them as what they count: "51 pilots on the board" and
"241 visitors today".

**1.33 Closing a sheet leaves a dead Back press.** Close and Escape use
`replaceState`, so the next Back appears to do nothing. Seen once in render;
the code is at board `app.js:2629-2639`. A sheet opened by a click should be
closed by Back.

**1.34 Table semantics.** The sheet's table headers are 9 px, with no `scope`
and no caption, and two header cells are empty: the rank and chase columns
(board `index.html:1160`). Give them text, even if it is visually hidden.

### Copy, crumbs and affordances

**1.35 Copy that promises the board more than it is sent.**
- **What.** Three notes say the board receives the run's settings:
  - the Quad lede, "Carried with every time you post" (`ui.js:4957`);
  - the launch card's Quad note, "it goes to the board with the time"
    (`ui.js:8002`);
  - Radio link, "Times set on it are marked on the board" (`ui.js:8036`).

  A posted time carries the name, the lap, the three lap total, the ghost
  and the weight, and nothing else (`postTime`, `src/share/board.js:864-899`).
  The ghost is positions, attitudes and splits (`encodeGhost`,
  `src/share/ghostdata.js:90`). The launch card's own sentence, "Your best
  on Flags and cones is filed under exactly this", is true of the best kept
  in this browser and is not a promise about the board.
- **Fix.** Make the copy say what is true now: the board ranks every lap on
  the clock and shows the weight. Whether the board should also receive the
  tune, link and flight model is the owner's call, and a board change.
- **Size.** S for the copy.

**1.36 Old room names in live copy.** Each of these is a rename that landed
in one place and not the others:
- The bench says "Flight mode in Settings", "Launch control in Settings" and
  "Open Flight controller from Settings" (`src/ui/fc.js:707`, `717`, `797`).
  Both rows live in Quad, and the bench is opened from Quad.
- Results says "Switch Run to Scored" (`ui.js:8210`); the row is called
  Scoring.
- The bench's save prompt says saving is "the same as changing a rate today"
  (`fc.js:450`). The shell inventory reports that a rate change no longer
  restarts the run. That was not checked here, so check it before
  rewording.
- `ui.js:11-19` says Settings ignores the sticks; it is Quad.

The glossary lint (0.3) catches the first kind from then on.

**1.37 The crumb is fixed text.**
- **What.** Three faults:
  - Calibrate and Choose joystick have no CRUMBS entry, so the crumb shows
    the raw ids, CALIBRATE and PADPICK.
  - Rates always says "Settings / Rates", even when it was opened from Quad
    or the pause menu (`ui.js:295-312`).
  - From the bench's "Open the Rates screen", Escape lands on the title
    (`ui.js:15736-15739`), which no crumb says.
- **Fix.** Give the two screens entries, and build the trail from the same
  `roomFrom`, `ratesFrom` and `pidsFrom` that Escape uses.

**1.38 Rows that look different for the same behaviour.**
- Check sticks has a chevron in Stick help and none in Settings, because
  `calibrate-check` is missing from `SCREEN_ACTIONS` (`ui.js:223`).
- Open on the web opens the board's tab without the link arrow, because
  `card-board` is missing from `LINK_ACTIONS` (`ui.js:218`).
- Fix: add both to their sets. `lint:shell` already checks row ids and
  could check this too.

**1.39 A cut value cannot be read.**
- **What.** Plain values stop at 52% of the row's width with an ellipsis
  (`index.html:3134-3138`), and only read only rows get a tooltip
  (`ui.js:8822`). Cut values include:
  - a Choose joystick device name, which runs to about 56 characters;
  - an adjusted Tune value;
  - long track and map names on door rows.
- **Fix.** Give every cut value a title, and shorten the values polish item 6
  already listed.

**1.40 Graphics changes shape with its own value.**
- **What.** "Auto (Medium)" is longer than the 24 character budget for a
  segmented row, so the row becomes a list, while Low and High stay
  segmented (`ui.js:2753-2764`, `3578`).
- **Fix.** The segment reads "Auto". The preset Auto chose goes in the note.

**1.41 A phone pilot cannot report a bug from the title.**
- **What.** The title has no bug chip, by decision (`ui.js:5958`), and a
  phone has no F8.
- **Fix.** A Report a bug row in the About room (2.1).

**1.42 Built, maintained and never shown.**
- **What.** Every room still builds a hint line that CSS hides
  (`index.html:3485`). One of them, the paused Rates hint, contradicts its
  rows (`ui.js:8902`; `src/main.js:5376`).
- **Fix.** Delete the hidden hint lines.
- **Not this.** The Trick list's screen, catalogue and checks stay, as its
  comment asks (`ui.js:7029-7046`). It is withdrawn, not dead.

**1.43 First flight is lost by a reload.**
- **What.** Answering the gate saves settings (`ui.js:15562`). Any saved
  settings mark a returning pilot (`detectFirstRun`). So a newcomer who
  reloads before flying never sees First flight.
- **Fix.** Key the first run on having flown, not on having answered the gate.

---

## Stage 2: streamline the simulator

### 2.1 The title, from 10 rows to 8
- **What.** Fold FPV wiki, Support and Credits into one About room: Credits'
  roll, Partners, Support and FPV wiki. Rename Tracks and Statistics to
  Tracks and times. Quad shows the aircraft (1.3) and Settings shows no value
  (1.2). The tree is above.
- **Why.** The front page answers "what am I flying, on what, and where are my
  times". Four of its ten rows answer "who made this". On a landscape phone
  it shows one and a half rows.
- **Checks.** `lint:shell` stop counts and ids; `lint:input`'s title trouble
  rows.
- **Size.** S to M.

### 2.2 The pause menu, from 17 items to 12
- **What.** Remove Quad (its two flight related doors, Tune and Rates, are
  already on this menu), Graphics (in Settings), FPV wiki, Support and
  Credits. The tree is above.
- **Why.**
  - A pause is for the run: resume, restart, fix the feel, or leave.
  - Opening the wiki in another tab mid run is a way to lose the run.
  - The two "Betaflight default" rows go with it.
  - At 1600x900 the last row is cut; on a phone, 2.5 rows show.
- **Checks.** `lint:shell` paused; `lint:devices`.
- **Size.** S.

### 2.3 Settings: one door for the render knobs, and a window that uses the
height
- **What.**
  - Move GPU, Render scale, Frame cap, Low latency view, Predicted view, Frame
    pacing, Input to screen, Flight log and Download flight log into an
    Advanced graphics room behind one row under Screen.
  - Fold the one row HUD section into Screen.
  - Drop "Tune, PIDs and the firmware".
  - Let the list's window grow to the panel's available height.
- **Why.**
  - 33 stops become about 24.
  - The nine moved rows are diagnostic or expert. The latency rows came from
    the input lag work (PROGRESS 2026-09-27 and 09-28), and their own notes
    say Auto handles them.
  - A pilot looking for Volume should not scroll past Frame pacing.
  - This is the second time. The one Settings room was split into Quad and
    Pilot on 28 August because it had grown to 30 rows (`ui.js:4937`). It is
    33 to 35 again.
- **Checks.** `lint:input` (the Settings room); `lint:shell` pilot; the quality
  and latency checks that read these settings by key, which move with the rows.
- **Size.** M.

### 2.4 The Race room's actions on the track they act on
- **What.** The S and M versions above. The S version ships first.
- **Why.** Eight rows two screens below the card they act on, three of them
  greyed out, read as the room's settings rather than the track's.
- **Checks.** `lint:shell` courses; `scripts/shell-check.js`'s library seed,
  which already covers the pilot's own tracks.
- **Size.** S, then M to L.

### 2.5 Ledes in one line
- **What.** The ledes of Freestyle (4 lines), Rates (4), PIDs (4), Stick help
  (4 plus a status line and a block) and How to fly (3) each become one line.
  The rest moves into the help column of the row it explains, or onto the
  wiki.
- **Why.** The help column already shows the note for the row under the
  cursor. A paragraph above the list pushes the rows down and is read once.
- **Size.** S.

### 2.6 A chrome budget
Proposed, and the owner's call:

| Element | Where it stays |
|---|---|
| Crumb | everywhere but the title and the gate |
| Flying chip | rooms where what is seated matters (title, Tracks, launch, Quad); not the Freestyle room before a map is seated |
| Report bug chip | paused, results, Settings and Stick help, where reports come from; F8 everywhere, which How to fly already teaches. The title has none today, by decision (`ui.js:7110-7112`), and keeps none |
| Music chip | title, paused, and Settings' Sound section, not every room |
| Patreon chip | title and About, not beside every crumb |
| BETA chip | title only, as now |
| Sticky primary button | on touch, and on desktop only when the primary row is not on screen |

- **Why.** Up to seven floating things per room, and on a phone they take the
  top 120 px and the bottom 40 px of 390 px.
- **Size.** S to M.

### 2.7 The launch card stays, and asks once per track per session
- **What.**
  - Fly on the title opens Before you fly the first time a track is flown in a
    session. After that, Fly launches with the same run settings.
  - Choosing a different track opens the card again, and the seated track's
    own actions in the Tracks room (2.4) carry a "Before you fly" row.
  - Today it shows on every Fly (`ui.js:15709`).
- **Why.** The card carries the fairness contract ("Your best on Flags and
  cones is filed under exactly this"), and the cursor already lands on Fly, so
  the cost is one press and one screen to read. That is small, which is why
  this is the owner's call and not a finding.
- **But there are two launch paths, and they disagree.**
  - The title's Fly always shows the card.
  - A chosen card's Fly it, or a double click on a card, calls `fly` and then
    `launch-go` at once (`flyToGrid`, `src/main.js:9551-9556`), so the card
    flashes past. That is deliberate: its comment says every caller there
    "asked for the grid".
  - Standings' Fly this track shows it again (`ui.js:15407-15446`).

  If the card matters for fairness, every path should show it. If it does
  not, none should. The rule proposed above, once per track per session,
  applied to every path, is the middle.
- **Size.** S.

### 2.8 The feel prompt on the first results (owner's call)
- **What.** It opens once ever, 1.4 s after the first finished race
  (`ui.js:6498`), over the pilot's first time (`d-33-results-race.png`). The
  comment there already worries that "a record celebration with a form on top
  of it is a form remembered as an interruption".
- **Fix.** Ask on the second results screen, or on the title after the first
  race. Keep the rule that it asks only once.

### 2.9 The radio in the menus
- **What.** A radio pilot drives the pause menu, the rooms, the launch card
  and results with the sticks: pitch to move, roll right to choose, roll left
  to go back. On six screens the sticks are ignored and only buttons work
  (`ui.js:16350`): the title menu, Quad, Rates, PIDs, the bench and Stick
  help. The reasons are written beside it:
  - the title and Quad pose the quad;
  - Rates rides a dot along the curve;
  - Stick help is testing the sticks.

  Each reason is sound. What follows from them is not:
  - **The legend lies on those screens.** It still says Pitch Move and Roll
    Adjust (`ui.js:14695-14712`).
  - **One select in Quad swaps the aircraft.** Quad opens with the cursor on
    Aircraft. A select cycles a segmented row, so a radio pilot's first
    press there swaps the aircraft and the world and lands on the title. The
    shell inventory saw this happen; `src/main.js:4554-4557`.
  - **A radio with no buttons may be stuck.** It selects by holding a stick
    for 700 ms (`src/input/input.js:195`) and has no Back. Its select is
    turned off on Stick help (`ui.js:16347`), and on Rates the cursor opens
    on a read only row. Read from the code, not driven: it cannot leave
    either.
  - **Dialogs ignore the pad completely** (`ui.js:16288`). That is on
    purpose, so that a flick cannot land on the menu underneath. But it
    means a radio pilot cannot answer the name prompt, a confirm, or the
    feel form that opens by itself after the first race.
  - **Lists that open in place cannot be stepped** on those six screens,
    because the guard returns before the list code (`ui.js:16403`).
- **Fix, S.**
  - The legend says what works on those screens: "Buttons: choose, back".
  - Quad opens on a row a select cannot change.
  - The feel form is never auto opened for a pilot whose last input was the
    pad.
- **Fix, M, and the owner's call.** One rule everywhere: pitch moves the
  cursor on every screen. The screens that need the sticks for something
  else say so in one line, and give the cursor back on a held roll left.
  Dialogs take the pad once it has seen the sticks centred, which is what
  the pad gate (`src/input/padgate.js`) already does for menus opened from
  flight.
- **Checks.** `lint:input`, which drives the calibrate screen and the
  Settings room with synthetic radios, and `input:selftest`.
- **Size.** S, then M.

---

## Stage 3: streamline the board

### 3.1 One name: Tracks and times
- **What.**
  - The `<title>`, the eyebrow and the partners page say "Tracks and times".
  - The first tab, which is that name today, becomes "Tracks", beside "Maps".
  - Site statistics moves to the footer and the admin view.
  - In the simulator, the title row, the Race room row and the results row all
    say "Tracks and times", and the Standings row says "This track on Tracks
    and times".
- **Why.**
  - The owner's own words for the page are "tracks and times".
  - "Statistics" names the part of the page a pilot needs least: the site's
    traffic, not their times.
  - Statistics today behaves as a third tab while styled as a link, and when
    it is open neither tab is lit (`w-30-stats.png`).
  - The name is a leftover. The page was "Tracks and Times" on 12 September.
    It became "Tracks and Statistics" on 19 September, when statistics was
    its second tab. On 25 September Freestyle maps took that tab and
    statistics moved beside Admin, and the name stayed (board commits
    9c37ec4, 17b6099 and 7d1f89b).
  - "Tracks and times" does not name the maps. If that matters more than the
    owner's own phrase, "The board" is the alternative; see "For the
    owner".
- **Size.** S on each side.

### 3.2 Tracks on a phone's first screen
- **What.**
  - On a phone, collapse the masthead to the wordmark and one line.
  - Move the counters and the partner strip to the foot of the page.
  - Put search, Built by, Order and the tags behind one Filter button with a
    count of what is on.
- **Why.**
  - At 360x780 the first card is at y=942 and the standings rail at y=14,666 of
    16,169.
  - One session in five is touch.
- **Size.** M.

### 3.3 Each pilot's best first
- **What.**
  - The podium on each card and the sheet's table rank each pilot's best time.
  - Under the table, "All 53 times" opens every attempt, as the table shows
    today.
  - This changes what a reader sees, not what is stored; `store.js:1626`
    keeps every row.
- **Why.** In 22 of 39 flown tracks one name fills more than one podium place,
  and Flags and cones has Alexulfer first, second and third. The simulator's
  Standings shows the same (`v-72-standings.png`).
- **Size.** S to M. This is the owner's call; see below.

### 3.4 One pilot, one name
- **What.** Fold names that differ only by case and spacing when ranking
  ("AsylumFPV", "Asylum Fpv"), and say in the posting dialog which existing
  name a new one matches.
- **Why.** The masthead's Pilots 51 and the Fastest pilots rail count one
  person twice.
- **Size.** S for display folding. A real identity is out of scope.

### 3.5 The aircraft switch scopes everything
- **What.**
  - "31 of 44 tracks" with no filter set reads as a filter. It should read
    "31 tracks".
  - "Built by" lists whoop only authors on the five inch side.
  - The rail mixes three lap totals with single laps without labelling them.
  - Source: board `app.js:1107-1111`, `1236`, `1335`.
- **Fix.** Scope all three to the side that is chosen.
- **Size.** S.

### 3.6 Fly this track flies
- **What.** Add `fly=1` to the track link (board `app.js:414`), as the map link
  already has (`app.js:521`). It lands on the launch card, one press from the
  air, instead of the title.
- **Size.** S on both sides. The simulator must treat `fly=1` on a track as
  "open the launch card".

### 3.7 Whoop tables at 360 px
- **What.** At 360 px the three lap table is 386 px wide in a 338 px column.
- **Fix.** Hide Posted under 420 px as Gap is already hidden under 560 px,
  and move the date into the row's title text.
- **Size.** S.

---

## Stage 4: streamline the builder

### 4.1 One name for the page: Builder
- **What.**
  - The page says "Builder".
  - The canvas switch says "Five inch track", "Whoop track" and "Freestyle
    map".
  - The gate card, the Tracks and Maps room rows, the pause menu's "Back to
    the track builder" and the board's Build a track all name it the same way.

  Today the product names it four ways:
  - "Map builder" on the gate, with the facts "Tracks, Rooms, Maps"
    (`ui.js:3984-3987`);
  - "track builder" in the simulator's rows (`ui.js:3296`, `7290`, `3003`);
  - "Track Builder" on the page and its tab (`index.html:35`);
  - "Which builder" in the switch's tooltip (`app.js:3946`).

  The page's own words for the ground drift too: "Field" heads the inspector
  on every canvas, and the sponsor dialog says "grass" on a map's concrete and
  a room's floor.
- **Why.** The owner calls them "map builders" and the code calls it the track
  builder. A racer and a freestyler both need to find it.
- **Size.** S. The page title and the og tags follow.

### 4.2 One view vocabulary
- **What.** On the five inch and freestyle canvases, "2D | 3D" means build in
  2D and preview in 3D. A palette tool still arms in the 3D preview, where a
  click places nothing (`view2d.js:706`; `edit3d.js:346`).

  The whoop canvas switches "Room | Plan | 2D":
  - Room is a 3D view you build in;
  - Plan is the same renderer looking straight down;
  - 2D is the classic plan canvas;
  - V toggles Room and Plan only (`app.js:2196-2207`).

  So "Plan" and "2D" are both plans.
- **Fix.**
  - Five inch and freestyle: grey the palette in the 3D preview, saying "Build
    in 2D".
  - Whoop: call its views 3D and 2D, and make the overhead camera a button in
    3D beside Fit, rather than a third view.
- **Size.** S.

### 4.2a One key map, one unit, one origin
- **What.** The same letter arms a different tool on each canvas
  (`elements.js:565`, `611`, `810`, `1496-1508`; `props/types.js`):

  | Key | Five inch | Whoop | Map |
  |---|---|---|---|
  | H | Flagged double | Side by side | Stair set |
  | T | Tower | Tower | Tree |
  | W | Waypoint | Waypoint | Street lamp |

  On whoop, one piece is given in three coordinate systems:
  - the card: inches from the room's centre (`ui.js:1906-1917`);
  - the drawer: metres from the corner (`ui.js:691`);
  - the readout: metres (`app.js:1960`).
- **Fix.** Where a tool exists on two canvases it keeps its letter, and a
  letter is not reused for a different kind of thing. On each canvas, one
  unit and one origin, with the other unit in small print as the card already
  does.
- **Size.** S to M.

### 4.2b What whoop learned, on the other two canvases
The whoop builder's Stage 0 to 4 added these, and only the whoop room has
them:
- an empty state with "Start from a RaceGOW track";
- a coach line;
- plain words for the model, Turn for Yaw and Height off floor for Sill
  height, which WHOOP-BUILDER-PLAN.md lines 61 to 66 called hard for anyone;
- Copy share link, Build sheet and Picture;
- touch.

A first five inch author meets an empty grid and a paragraph at the foot of
the palette. Load ships 8 whoop starters, 2 maps and no five inch track
(`storage.js:151`).
- **Fix.** Bring the empty state, the plain words and the share link to the
  five inch canvas first, with starters. The converted race tracks in
  `tracks/json/` are the ones published to the board. "Start from a track on
  the board" can open one as a copy, the way Remix in the builder already
  does.

  This avoids shipping a second copy of a board track. The Tracks room
  stopped listing shipped copies for exactly that reason: a copy answered to
  nobody (`ui.js:7229-7238`).
- **Size.** M.

### 4.2c A canvas switch says what it does
- **What.** Switching canvas has two silent side effects:
  - it clears the undo history (`app.js:2387-2398`);
  - it changes the simulator's seated aircraft (`app.js:3652`;
    `session.js:83-96`).
- **Fix.**
  - Keep undo per canvas, or say in the toast that it starts again.
  - Name the aircraft in the toast: "Switched to the whoop: the simulator
    will fly the whoop."
- **Size.** S.

### 4.3 Publish asks for a real name
- **What.** The Race room's first impression includes "Untitled track",
  "race track??" and "bando??", and the Freestyle room has "Untitled map",
  "nice map" and "globoe".
- **Fix.** Publish refuses "Untitled track" and "Untitled map" and asks for a
  name in the same dialog. What is already published is the owner's call.
- **Size.** S.

### 4.3a Learn about refused parts before placing them
- **What.** Six whoop parts are refused by the board: Table, Chair, Banner,
  Hoop, Hex gate and Cube (`board.js:535-572`). The author learns this only
  on pressing Publish (`app.js:2713-2720`).
- **Fix.** Mark them in the palette ("not on the board yet") until the board
  accepts them. That is a board deploy, and decision 6 of the whoop plan.
- **Size.** S.

### 4.4 The phone
- **What.** At 390x844 the five inch drawing area is 0 px wide, and 9 bar
  controls sit past the right edge where `overflow: hidden` makes them
  unreachable. On a landscape phone the drawing is 344x203
  (`bp-10-race.png`). The CSS declares phones out of scope
  (`index.html:1605-1612`). Whoop has touch and a drawer, from Stage 2 of
  its plan; the five inch and map canvases have neither: 2D has no touch pan
  or zoom, and their key hints vanish on touch (`view2d.js:654-694`;
  `index.html:1983-1984`).
- **Fix.** Under 500 px in either direction, either:
  - say plainly that the builder needs a bigger screen, with Fly this track
    one tap away and Load still usable; or
  - make the palette and inspector drawers, drop the banner (1.25) and fold
    the second bar into More.

  The first is S and honest; the second is M.
- **Size.** S, then M.

### 4.5 Links that stay in the address
- **What.** `?track=` and `?share=` are read and left in the address
  (`start.js:70-75`; `app.js:547-659`), unlike `?mode=` and `?mapshare=`,
  which are removed.
- **Inference from the code, not tested.**
  - A reload after editing a `?track=` document probably reopens the link's
    version, and moves the edits to Load as a copy (`app.js:2327-2346`).
  - A reload on a `?share=` remix probably asks "Open a copy...?" again.
- **Fix.** Drop both after reading, as `dropUrlMode` does. Confirm first that
  this is what happens.
- **Size.** S.

---

## Stage 5: the joins between the three

### 5.1 Deep links from the simulator to the board
- **What.** `boardPageUrl` (`src/share/board.js:198-203`) takes no track, so
  every row whose note says "The public page for" a track opens the board's
  front page (`ui.js:3312`, `7971`, `8273`). The board accepts `?track=id` and
  `?map=id` (board `app.js:578-594`).
- **Fix.** Pass the id.
- **Size.** S.

### 5.2 Deep links from the builder to the board
- **What.** After Publish, the builder opens a map's own sheet (`#map=id`) but
  only the board's front page for a track (`src/trackbuilder/app.js:2949` and
  `3110`).
- **Fix.** Track the same way.
- **Size.** S.

### 5.2a The builder's way back
- **What.** Back to the simulator opens the gate (1.24). Fly this track and
  Fly this map already carry `?craft=` and `fly=1` and go straight into the
  air (`app.js:4190-4229`).
- **Fix.** The way back carries the same context, without `fly=1`.
- **Size.** S.

### 5.3 The board's Credits link
- **What.** The board's Credits link navigates the simulator's named tab to
  `/sim/#credits` (board `app.js:2814-2838`), which reloads a flight if one
  is running there.
- **Fix.** Open it in a new tab, or give the board its own credits roll back.
- **Size.** S. The second option is the owner's call.

### 5.3a A time posted shows on the board without a reload
- **What.** The board loads tracks and times once and never again
  (board `app.js:1692-1696`; no interval or `visibilitychange` handler).
  Picture a pilot who:
  - posts a time in the simulator;
  - moves to the board's named tab, which is the design (`windows.js:4-19`).

  They do not see the time until they reload, so it reads as "my time was
  lost".
- **Fix.** Refetch the list when the tab becomes visible, at most once a
  minute. The statistics view already polls every 30 s while it is visible
  (board `stats.js:1229-1261`).
- **Size.** S.

### 5.4 One door, one name, both sides
- **What.** After 3.1 and the glossary, a lint compares the simulator's door
  labels for the board with the board's own name for itself.
- **Size.** S (part of 0.3).

---

## For the owner

These change what the product says or does, not only how it is laid out, so
they are yours. Each has a recommendation.

1. **The glossary**, especially:
   - "Tracks and times" for the board, or "The board", which also covers the
     maps (3.1);
   - "Builder" for the page;
   - "Post" for sending a time;
   - "The town" for the shipped map;
   - Tracks and Maps as the room names in place of Race and Freestyle.

   Recommended as written.
2. **The title's About room** (2.1). Recommended. The alternative is to keep
   Credits and drop only FPV wiki and Support.
3. **Graphics on the pause menu** (2.2). Recommended: remove it, since it is
   one door away under Settings. Keep it if you have seen pilots change
   graphics mid run.
4. **The launch card once per track per session** (2.7). Recommended, but the
   cost today is one press.
5. **Best time per pilot on the board** (3.3). Recommended, with every attempt
   one press away. It changes what "the podium" means on every card.
6. **Untitled tracks already on the board** (4.3). Rename, hide or leave them.
7. **The chrome budget** (2.6), especially the Patreon chip leaving the crumb
   line and the music chip leaving the rooms.
8. **The radio's rule in the menus** (2.9). Recommended: pitch moves the
   cursor everywhere, and the screens that borrow the sticks say so and give
   them back. The S fixes need no decision.
9. **One launch path** (2.7). Recommended: every way of flying a track shows
   Before you fly the first time in a session, and none after.
10. **What a posted time carries** (1.35). Either the copy stops promising the
    board the tune, link and flight model, or the board starts receiving them.
    Recommended: fix the copy now, and decide the board change separately.

---

## Found on the way, not in this plan

- **The board's bug inbox reads without a token on production.** GET
  /board/api/bugs?status=open answered 200 with tickets, because
  `bugsAuthorized` returns true when BUGS_TOKEN is unset (board
  `src/server.js:422-425`). Whether the status buttons also work without one
  was not tested, on purpose. That is not a menu matter and should not wait
  for this plan: set BUGS_TOKEN on the board service, or make the check fail
  closed.
- **Records under a second.** Two two gate tracks hold records under a
  second: Simple Orbits at 0.66 and Orbit (Anticlockwise) at 0.74
  (`d-20-courses.png`, `v-71-courses-bottom.png`). Polish item 5 found the
  second track's two stations at one point. Whether these laps are real is
  the board's floor rule to judge, not the menus'.
- **Board names are free text.** 3.4 makes ranking fold obvious duplicates.
  Real pilot identity is a product decision, not a layout one.

---

## How done is measured

Each item's check is named in its section. Overall:

| Measure | Today | Target |
|---|---|---|
| `lint:shell` | red (credits) | green, and run at 1600x900, 1280x720 and 844x390 |
| Title rows | 10 | 8 |
| Paused items | 17 | 12 |
| Settings stops | 33 | about 24 |
| Settings list, landscape phone | 2,518 px in a 222 px window | under 1,700 px, in a window that uses the height |
| Rows below the window on arrival at 1600x900 | Race actions, Credits, How to fly, Quit to title | none |
| Rows seen on the title on arrival, 844x390 | 1.5 | at least 4, Fly among them |
| Names for the board | 8 | 1, enforced by the noun lint |
| Board, 360x780 | first card at y=942 | first card on the first screen |
| Sim links to the board that land on the thing named | 0 of 3 | 3 of 3 |
| Whoop drawer closes by its own button and by Escape | neither | both, in `lint:devices` |
| Builder Load's Delete asks or offers undo | no | yes |
| Board tag pills shown disabled on the default view | 7 of 9 | none |
| Board podium places held twice by one pilot | 22 of 39 flown tracks | none, with every attempt one press away |
| Shell screens where the legend names a stick that does nothing | 6 | 0 |
| Radio presses in Quad that can swap the aircraft by accident | 1 (the first) | 0 |
| Notes that promise the board something it is not sent | 3 | 0 |
| Crumbs that print a raw screen id | 2 | 0 |
