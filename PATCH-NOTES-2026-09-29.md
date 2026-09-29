# Patch notes for 24 to 29 September 2026: published

## Status

Published on 2026-09-29 to https://webfpv.org/notes/, in the landing repository `landingpage-WebFPVSimulator-` as commit `bf2052f`, with four claims corrected in `fd645f2`, as one section a day: 24, 25, 26, 27, 28 and 29 September, newest first. The served page is byte identical to the committed `notes/index.html`. That file is the copy of record for the wording, so this one no longer carries the entry.

This file began as a single 23 to 29 September draft, written while the landing repository could not be attached (the auto mode classifier had denied it). The owner then asked for the repository to be attached with push access and the notes published, said the Patreon price was reduced and that Firefox is fixed, asked for the entry to be broken into days, and asked for the missing repositories to be cloned to see what had changed. All of that is done, and the draft's text was replaced by the published sections. The draft is still in this branch's history.

## How the days were cut

Days are Perth time (UTC+8), the owner's calendar. A change goes on the day it reached `main`, not the day its first commit was written. Stick help was written on the 28th and reached `main` at 06:47 on the 29th, so it is on the 29th. The input lag work was written on the 27th and reached `main` at 10:27 on the 28th, so it is on the 28th. The go live times come from the `PROGRESS:` entries that say a change went to `main`, and from the merge commits.

| Day | What went live |
|---|---|
| 24 | The solid world in the physics, the crash reset, tumble flat, keyboard and whoop fixes, the wiki rewrite |
| 25 | Freestyle maps built, published and remixed, the loader change, share links, visit source counting |
| 26 | Roads, cars and the chase, the scoring counter, the manga look, practice and lap calls, Support, three lap RaceGOW, refused laps |
| 27 | Partners, the manga first screen on the front page, the Firefox fix, gamepad sticks, any weight on the board, the wiki checked against Betaflight |
| 28 | The input lag work, the default tune, Crosshairs |
| 29 | Stick help, the Manga and scoring switch, four swept bug fixes |

## What was read

Simulator: `9ed8b9c..40258cda`, 330 non-merge commits, the 175 turn entries PROGRESS.md gained, and the sections of the larger ones that say what a pilot sees. Board: 31 non-merge commits since 22 September, from the cloned repository. Landing: 50 non-merge commits since the last notes commit, and its `CLAUDE.md`, which sets the rules the notes follow (no em or en dashes, no brand named for a controller, Betaflight never called a partner or supporter).

The board's side was read from the board's own code and commit messages this time: three lap RaceGOW ranking (`1558b98`), refused laps and the one time purge of three rows (`7075761`), the `Weight N%` tag beside a pilot, the Freestyle maps tab with Fly and Remix, and the privacy panel wording for visit sources. The wiki rewrite is landing commit `d12c8e6` (10 files, 742 article directories) and the Betaflight check is `1dfe8b0`.

Checked on the live site after the push: the Pages origin and `webfpv.org` both serve the new page, and the served bytes equal the commit.

## Left out on purpose

Replay mode, the request hardening in `scripts/boardcards.js` (PR #21), the plans, goldens, checks and tooling, partner sign ins and counters, the empty Supporters section, and every WIP and PROGRESS only commit.

Betaflight's mark and its "Powered by" line, which the first draft had. The landing repository's `CLAUDE.md` says nothing on the page may suggest Betaflight endorses WebFPV, and that sentence sat beside the partners.

Controller brand names, which the same file says the site does not use.

## Open, for the owner

The Patreon copy is still the old tiers ($5, $12, $25, plus GST) in the landing repository (`PATREON_NOTE` in `src/config.js`, and static copies in `index.html`, `wiki/index.html` and `notes/index.html`) and in the board (`public/app.js` line 71 and three places in `public/index.html`). The simulator's note says $3, $8 and $20, "USD a month". The 26 September entry states the reduced tiers, so the notes and the simulator agree and the front page, wiki and board tooltips do not.

Changing it in the landing repository is not a one line edit. `src/config.js` is a module, the landing repository's rule is a new `?v=` on every importer of a changed module, and the wiki's 742 generated articles carry it. Changing only the static copies would disagree with what `bindPatreonLinks()` sets at runtime. It was left alone for that reason and put here. The board needs push access, which was attached read only.

The branch `ccr-dae555c4-52y1sr` was cut from `513e40d`, and `main` has since moved (the bug sweep of 29 September). The only conflict when it merges will be the end of PROGRESS.md, where both sides appended.
