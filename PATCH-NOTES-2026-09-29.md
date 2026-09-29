# Patch notes for 29 September 2026: a draft for webfpv.org/notes/

## Status

Drafted, not published. The public page is https://webfpv.org/notes/, and its source is in `landingpage-WebFPVSimulator-`, not in this repository. The session that wrote this file asked to attach that repository with push access, and the permission check denied it, so the page has not been touched. This file is the record of the entry, kept here for the same reason `WIKI-REWRITE.md` is: the work is worth keeping and the landing repository was out of reach.

To apply it, in the landing repository:

1. On the page's header line, change "22 August to 22 September 2026" to "22 August to 29 September 2026".
2. Add the entry below above the "22 September" entry, in whatever markup the page uses.

Four things need a decision first, listed under "Check before publishing" at the foot of this file. The first is the Patreon prices, which disagree between the sim and the front door.

## The entry

**29 September**

23 to 29 September

### New

*   You can build a freestyle map. Open the track builder, pick Freestyle, lay a map out from a library of drawn pieces, and press Fly this map. It starts you in the air, not on a menu. Until you build one, Your map is Hibari Yard.
*   Freestyle maps go on the board. Publish from the builder and the board has a Freestyle maps tab. Fly a map from there, or remix it in the builder. The Freestyle room lists the board's ten newest maps and pictures the world you are flying, and pause has Back to the track builder on a track or map you built.
*   Freestyle maps score the line you fly. Named gaps pay when you go through them. Skims along a wall or a roof, threads between two solids, unders and low passes are close calls. All of it goes into one combo, and a crash drops the whole combo. A low pass pays its points and buys no multiplier.
*   There are cars to chase. The builder has roads and vehicles, and the Tail meter builds while you hold a car's bumper and banks when you peel off. Hitting a car loses the tail and pays nothing. Hibari Yard has a drift coupe with a compact blue coupe chasing it, every car was redrawn, and Hibari Yard Tandem, a drift course with two drift coupes in tandem, is on the board.
*   The freestyle score is lettered in a manga hand, small and out of the middle of the picture. Past 72 km/h ink strokes gather at the edges and lean toward where you are heading, and a crash freezes for a beat in ink. After a scored run the results are a manga page with a share card. The menus wear it too. Settings, Screen, Manga and scoring turns all of it off and leaves the counting alone.
*   Race tracks have a fourth lap count, Practice. It has no end, and nothing you fly in it goes to the board. Lap times are called out loud, in your browser's own voice, and the call follows Volume in Settings.
*   Settings has a HUD section. Its first row is Crosshairs: Off, Wings, Cross or Dot. It starts Off.
*   Support is a row on the title and pause menus and opens Patreon. Its note gives the tiers as $3, $8 and $20 a month in US dollars, with no GST. The last notes had $5, $12 and $25 plus GST.
*   Three partners back WebFPV: Global Drone Solutions, Mantis FPV and the West Coast Multirotor Club. Their marks are on the front door and the board, and painted into every freestyle map. Find one and you get a callout, a panel and 1000 points into the combo. Betaflight's mark is on the loading screen and in the credits, under Powered by.
*   The wiki is rewritten for a Year 10 reader: all 36 articles, every settings page, the figures and the glossary. Five settings that had been called live do nothing in this build, and Settings greys them now, with the reason.

### Walls and crashes

*   Walls, roofs, gates, trees and the train are now solved inside the physics step, a thousand times a second, by the same step that does the ground. A roof lands, slides and settles like the street. Props flex and skate along a face instead of levering the frame, and the camera is kept off the glass so it cannot end up inside a wall.
*   A crash is a reset, at once. A hit of 4 m/s or more that does not land on your belly sets you down nearby: "Crashed, set down nearby. R restarts the run." You no longer hang on a wall or wait on your back, and a crashed quad ends flat, on its belly or its back.
*   You are set down on the ground or a roof top, never in the air, which had put a whoop on the ceiling. Crash on a road and you are put down on the verge, a little over 4 m from its middle. You are never set down where you cannot take off. One crash had put a craft under the crane's bottom bar.
*   A slow belly first tap on a wall is not a crash. The sim read the wall's direction in the wrong frame, so on some maps a tap counted when it should not have.
*   Crashes are judged on every physics step, not once a frame. A 60 Hz laptop and a 144 Hz monitor call the same hit the same way, and you are set down where you hit.

### Feel

*   The default tune has a quarter more feedforward. Stick response is 125, with F at 150, 156 and 150, and three I term settings changed to take the bounce out of a stop: iterm relax cutoff 10, iterm relax RPY_INC and a yaw pidsum limit of 500. Slow to answer the stick was the most ticked box on the feel form, on 23 reports, and bounces back after a stop was ticked on nine.
*   In the sim's own stick test a flick reaches 90 percent of its roll rate 3 to 5 ms sooner. A full stick roll or pitch stop comes back about half a degree, where it came back 1.2 and 1.6, and a yaw stop at three quarter stick comes back 4.6 degrees, where it was 7.8.
*   The Tune row still says Betaflight default, with a note saying what changed. Personal bests on the default tune start again, because the record key follows the tune, and laps flown before stay under their old key. The board ranks on the clock and never sees the tune.
*   The whoop is heavier by default. Weight 100 on a whoop now flies what 125 flew, because a pilot flying the same track in another sim had to take it to 120 to 130. The whoop's slider tops out at 120, and a saved weight above that comes down to it. Whoop bests carry over. The five inch is unchanged.

### Screen and lag

*   The low latency canvas was never being asked for. three.js built its own context and dropped the option on every browser. The sim makes the context itself now, and Settings, Screen, Low latency view says whether your browser granted it. It is on by default.
*   Auto graphics measures. It lowers resolution a tenth after half a second of late frames and raises it a twentieth after three seconds of headroom, and on the title it can move the preset for a machine that keeps missing or keeps idling. Pick a preset by hand and Auto leaves it alone. The town and built maps follow Render scale and Auto now.
*   Predicted view draws the FPV camera where the quad will be when the frame reaches the screen. A frame is on the glass one display period after it is drawn, which at 60 Hz is 17 ms, or 11 degrees of a 670 degree per second roll. It is on by default, in Settings, Screen. It is a setting because you feel it: turn it off if a flip overshoots at the end or the picture jumps when you land.
*   Frame pacing is a Settings row: Timer with Low, Timer, always or Display, always. The timer runs the loop without waiting for the display. On one laptop at Low, key to screen fell from 80 ms to 64 at the median and from 144 ms to 80 at the 90th, over nine presses each. It draws about twice the frames, which is heat and battery, and Auto holds still while it runs. Low uses the timer by default, and so does any machine Auto puts on Low.
*   Low asks less of the GPU, and the OSD less of the page. Low draws to an 8 bit colour target where nothing reads the extra precision, drops the cloud shading it had kept after losing real shadows, and never draws more than a million pixels. The OSD updates its numbers about 15 times a second and no longer reads the layout every frame.
*   Fly, Restart and Resume go fullscreen, and Escape leaves it and pauses. Fullscreen in flight is a Settings row if you would rather not. Input to screen in Settings reads the time from a key press to the frame that first showed it. It is the browser's number, not photons.

### Sticks

*   Stick help. A stick that does nothing in flight is caught, and Stick help shows where the signal is lost: in the radio, the browser or the system. It is a row on the pause menu and in Settings, and a bug report carries what it found. Chrome on Android hands a radio four axes and drops the rest, so yaw or throttle goes missing, and Stick help says so.
*   A game controller flies its own sticks in your stick mode. Mode 1 or Mode 2 now reaches a pad. A DualSense that had throttle on the right stick is right on its next visit, and a DJI RC 2 can have throttle on the right.
*   A radio that Firefox calls a gamepad flies the right channels. On Firefox for Linux the throttle was reading as yaw, and pitch as a switch channel. When a browser has your throttle as yaw, the title says so about four seconds after you leave the throttle alone.
*   Settings, Sticks, Restart switch: choose it, flip any AUX or press any button, and from then on flipping it does what R does. It is kept per radio.
*   On the keyboard, letting go of the throttle keys holds height. The throttle springs to the hover for your cap, aircraft, weight and pack, not to a fixed low value. M switches between Angle and Acro.
*   The joystick picker draws what the page will fly, not a gamepad's axes.

### The whoop

*   The whoop room is recoloured in the sakura theme, lit like a room and not a sunset, with the slap pack stickers as posters and banners on its walls. The logos painted on the floor now show on the mat.
*   The whoop reads 1S and 4.2 V, and only the label changed. Its copy no longer calls it a five inch, and its OSD has no speed readout, because the number was a five inch's ground speed printed over a room built 3.4 times life size.
*   The whoop builder lets you delete any side of a gate, one at a time, for a virtual gate that keeps its trigger area, and drag any part of the flight path in 3D to bend it. A pole is drawn as a pole and not a flag, and the square swings on its pole the way it scores.

### The board

*   A time goes up at any weight, and says so. The board keeps the weight you flew at and prints it in amber beside your name, like Weight 60%, on any row that is not 100. Ranking is still on the clock.
*   RaceGOW rooms rank on the fastest three consecutive laps, and the best single lap sits in the next column. A run that never put three clean laps together is stored and stays off the sheet. The simulator's standings follow the same rule. Impossible laps came off the public board.
*   Tags survive a republish. A published track lost its tags whenever it was republished from the builder without re-ticking them, and whenever the pilot renamed themselves. Publishing now goes up as a copy when the board already has the id.
*   A shared link to a track or a map shows that track or map as its picture.

### Fixes

*   Firefox would not start the sim between 25 and 27 September. The page said "The specifier three was a bare specifier". The loader change of the 25th wrote its import map after Cloudflare's own module script had already started, and Firefox refuses a map that late. The map is written before the body now.
*   Every page loads the scripts of the deploy it was served from, so a cached script from before an update no longer runs against a page from after it. That mismatch had left the Publish button missing for a pilot and had broken the lap export.
*   A finger can scroll the menus on an iPhone, and a vertical swipe on the quad picture scrolls the page.
*   The town took 47 seconds to load on the first flight of the new walls. Its modules are preloaded now. A town that failed to load no longer leaves you in a room with nothing to press.
*   On a map with no start pads you start in the open, never in a pylon. The crane's foot is solid where it is drawn.
*   Tracks: a card is chosen where you click it, and a double click flies it. The page used to scroll after the first click and leave Fly below the fold. Fly this track goes straight to the starting blocks.
*   The builder's racing line no longer leaves a gate and doubles back through it to reach the next. Labels can be switched off while building. The top bar wraps instead of hiding Undo, Redo and the views. After a station counts, the next one needs a little flying first, half a metre on the field and less in a room, so on Orbit rocking on the flag no longer counts laps. The builder warns when two stations in a row stand closer than that.
*   The same opening twice in a row is two passes, not one. On 2022 AU Nationals the lap counts only when 32 to 36 is flown, the loop is flown, and 32 to 36 is flown again.
*   On a plain gate the race OSD read "GATE 1 OF 12, SPLIT-S, LEVEL 1". It reads "GATE 1 OF 12" now. The Air slot is airtime from takeoff, not the lap clock, which ran on the pads.
*   The Weight card retires by itself: on your first landing or crash, after 8 seconds in the air, or on your first stick move in the air. The Weight slider fades while you fly and comes back when you land or pause. Pause has a Weight row.
*   The OSD is inked, so PACK, height, THROTTLE, SCORE, AIR and the stick captions read over pale concrete and overcast. Values that were cut off with dots read whole, like Camera angle 30° and Rates as Actual 670/670/670. On a phone the flight lines sit in the two top corners with nothing in the middle third, and the flight chips fade after three seconds in the air and come back on a touch, on landing or on pause.
*   Overcast clouds are lit and inked, tree canopies shade round and not as a mosaic of triangles, and drift smoke thins to white near the eye and never blinds the lens. A plain roll around a rail scores as a Roll or nothing, never a Maverick Loop.

### Held back

*   The Trick list is still off the title and the Freestyle room. Trick names stay behind the Scoring row, which starts on Lines only.
*   Screentone, ink dots in the darkest band at High, is built and off, because the dots swim on the glass.
*   Finding the SubTwoFifty mark is no longer an achievement, and the pill is gone from the map cards. The mark stays painted on every map, and it is easier to see from the pads.
*   A radio that reports under about 190 times a second still flicks back a little after a small stop. The fix is in how the sim feeds the controller, and it is not made.

## How this was built

**The window.** `9ed8b9c..513e40d` on `origin/main`: 326 non-merge commits, 62 merges, 214 files, from 24 to 28 September. The 22 September entry's last items (the trick list withdrawn, the frozen frame message, the Patreon link) are the last commits before `9ed8b9c`, which is what puts the boundary there. The previous entry covered 45 commits, so this one is longer on purpose.

**What was read.** All 326 commit subjects. The headings of the 175 turn entries PROGRESS.md gained in the window, and the opening paragraph of most of them. The sections that say what a pilot sees ("What changed", "For the owner", "The owner's answer") of about thirty of the larger ones. Not every entry was read in full. The owner's flights and answers were used to separate what shipped from what was only proposed.

**Checked against the code at `513e40d`.** The default tune values in `configs/betaflight-default.diff`. The whoop's `gravityBase` 2.025 and `weightMax` 120, and the five inch's 1.62 and 140. The defaults `crosshair: 'off'`, `predictView: true`, `pacing: 'auto'`, `lowLatency: true`, `fullscreenFly: true`, `mangaAndScoring: true` and `freestyleScoring: 'off'`. The labels Crosshairs, Wings, Cross, Dot, Predicted view, Frame pacing, Timer with Low, Timer always, Low latency view, Fullscreen in flight, Input to screen, Stick help, Restart switch, Manga and scoring, Clean FPV, Impact frame, Practice, Support, Back to the track builder, Lines only and the Volume note. The crash notice text. That the Trick list is still withdrawn. That `MARK_FINDS` is false and `PARTNER_FINDS` is true, and that a found mark pays `EGG_POINTS`, 1000. The Support note and its prices. The Betaflight mark on the loading screen. The M key calling `flipFlightMode`. That `main.js` imports and uses the gap, close call, chase, counter, predict, gpu gate, auto scale and voice modules, and calls the manga frame, and that the road and car modules are imported by the built map.

**Checked on the live site.** A crawler request for a shared track link returns that track's name and its card as `og:title` and `og:image`, so share cards are live. The front door names the three partners and quotes the old Patreon prices. The board has a Freestyle maps section and a Partners link.

## Check before publishing

*   **The Patreon prices disagree between the sim and the front door.** The sim's Support note, on `main`, reads $3, $8 and $20 with no GST. A commit says those were "confirmed on the Patreon dashboard". The live front door still reads "$5, $12, $25, USD, plus GST on join", which is what the 22 September notes quoted. Patreon's own page returned 403 to the fetch. Confirm the tiers, and update the front door if the sim is right.
*   **Firefox's two bad days.** The Firefox bullet says the 25 September loader change broke Firefox until the 27th. That is what the PROGRESS entry found, and it is a regression this window introduced and then fixed. Keep or cut it as suits, but the cause it names is the real one.
*   **Partners.** Naming the three partners repeats what the front door already says. The wording is theirs ("official training partner" and so on), so the entry says only that they back WebFPV.
*   **The wiki.** The wiki rewrite lives in the landing repository, and the live wiki's articles did not render in a fetch. That bullet rests on the PROGRESS entry that records it, which names landing commits `d12c8e6` and `4d125d8`.

## Taken from PROGRESS.md and not checked in code or live

The board's side, because that repository was not readable: weight labels, RaceGOW three lap ranking, the removal of impossible laps, tags surviving a republish, publishing as a copy, and that Hibari Yard Tandem is on the board. The board's pages load their data in the browser, so a fetch showed the page's shell and not its rows.

The behaviour of the freestyle counter, the chase, the manga layer and the cars comes from the entries and the "look for" notes the owner flew against. The code for each exists at the tip. Nothing in this turn ran the simulator, so none of it was flown by this session.

The frame pacing figures are one laptop, nine presses each side. The entry says so, and so does the bullet.

## Left out on purpose

Replay mode (`?replay=` for capturing ghosts, a URL only and not something a pilot reaches), visit source attribution and the partner click counts (analytics, not flying), the request hardening in `scripts/boardcards.js` (PR #21, security and not visible), the plans, checks, goldens and tooling, the freestyle asset library's internals, `pace.js` being deleted, and every WIP and PROGRESS only commit. The board's Statistics tab copy and named pilots strip, which changed, are small enough to add if wanted.
