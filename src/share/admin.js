/*
 * admin.js: whether this tab is signed in to the board as an admin, and the
 * token that says so.
 *
 * AN ADMIN IS A PERSON ON THE BOARD'S WHITELIST, NOT SOMETHING THIS PAGE
 * DECIDES. The board owns the login (POST /api/admin/login in the
 * leaderboard's src/server.js) and owns the rule it unlocks: an official
 * track can only be changed by an admin, and the board refuses everybody
 * else whatever this page says. Nothing here grants anything. It remembers a
 * token the board gave and hands it back as a header, which is why the lock
 * cannot be walked past by editing this file in the browser.
 *
 * SESSIONSTORAGE, NOT LOCALSTORAGE, AND NEVER A COOKIE, for the board's own
 * reasons (see ADMIN_KEY in its public/app.js). This is an admin credential,
 * so closing the tab is a good moment to lose it, and the board gives it
 * twelve hours at most whichever runs out first. It is not a cookie because
 * a cookie is sent by the browser on its own initiative, and the board
 * reflects any origin that asks, which is only safe while no credential
 * travels that way.
 *
 * ONE BOARD. The session remembers which board issued it and is offered to
 * that origin and no other, so a ?board= pointing the page at somebody
 * else's board cannot be handed an admin token meant for this one.
 *
 * Every read and write is wrapped, because storage throws in a private
 * window. Without it, signing in still works for as long as the page is
 * open and a reload asks again.
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

const ADMIN_KEY = 'webfpv.share.admin.v1';

/* In memory as well, so a window that refuses storage still keeps the
 * session until the page closes. */
let held = null;

function sameBoard(a, b) {
  const trim = (v) => String(v || '').trim().replace(/\/+$/, '');
  return trim(a) !== '' && trim(a) === trim(b);
}

function stillGood(session) {
  if (!session || typeof session.token !== 'string' || !session.token) {
    return false;
  }
  if (!session.expiresUtc) {
    return true;
  }
  const until = Date.parse(session.expiresUtc);
  return Number.isNaN(until) || until > Date.now();
}

function readStored() {
  try {
    const raw = sessionStorage.getItem(ADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/*
 * The session for `board`, or null. An expired one reads as none, so a stale
 * token is never sent to find out the hard way. The board is still what
 * decides: a token this clock calls good may have been revoked, and the
 * board's answer to that is a 403 the callers already handle.
 */
export function readAdminSession(board) {
  const session = held || readStored();
  if (!stillGood(session) || !sameBoard(session.board, board)) {
    return null;
  }
  return {
    token: session.token,
    email: String(session.email || ''),
    expiresUtc: String(session.expiresUtc || ''),
    board: String(session.board),
  };
}

export function writeAdminSession(session) {
  if (!session || typeof session.token !== 'string' || !session.token || !session.board) {
    return false;
  }
  held = {
    token: session.token,
    email: String(session.email || ''),
    expiresUtc: String(session.expiresUtc || ''),
    board: String(session.board),
  };
  try {
    sessionStorage.setItem(ADMIN_KEY, JSON.stringify(held));
  } catch (e) {
    /* The in-memory copy is what requests use. */
  }
  return true;
}

export function clearAdminSession() {
  held = null;
  try {
    sessionStorage.removeItem(ADMIN_KEY);
  } catch (e) {
    /* nothing to do about it */
  }
}

/* What a request to `board` adds to its headers. Empty for everybody who is
 * not signed in, which is nearly everybody. */
export function adminAuthHeaders(board) {
  const session = readAdminSession(board);
  return session ? { authorization: `Bearer ${session.token}` } : {};
}
