/*
 * bugs.js: send a tester ticket to the public board.
 *
 * THE CONNECTION, WRITTEN DOWN ONCE.
 *
 *   Submit     POST {board}/api/bugs   { kind, title, what, expected?,
 *                                      steps?, reporter?, context? }
 *
 * The board origin is the same one board.js already resolved: a ?board=
 * query, a stored override, then the local default. A board that is down
 * must not take the rest of the game with it. The caller shows the error.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { boardOrigin } from './board.js';

export const BUG_KINDS = [
  { id: 'crash', label: 'Crash or freeze' },
  { id: 'blocking', label: 'Cannot play' },
  { id: 'wrong', label: 'Wrong behaviour' },
  { id: 'visual', label: 'Looks wrong' },
  { id: 'feel', label: 'Flight feel' },
  { id: 'other', label: 'Other' },
];

function trimOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

/*
 * WHAT EVERY TICKET SAYS ABOUT THE BUILD IT CAME FROM, so that tickets can be
 * grouped over time: the aircraft being flown, and the version of the physics.
 * They ride beside `context` and never inside it, because the board caps a
 * context at 32 keys and a feel report already uses about 28.
 *
 *   airframe    the id in configs/airframes.js, '5inch' or 'whoop65'.
 *   sim.wasm    the first 16 hex characters of the SHA-256 of the bytes of
 *               dist/sim.wasm this page loaded. It names the PHYSICS, which
 *               the deploy stamp cannot: that moves on every deploy,
 *               including ones that change no physics.
 *   sim.deploy  the deploy stamp from src/fresh.js (window.__fresh.stamp), or
 *               '' on a checkout. It names the SHELL.
 *
 * main.js hands the hash over once the module is loaded, off the frame loop.
 * Before that, or with no crypto.subtle (an insecure origin), it is '' and
 * the board takes it as unknown. The contract is written out in the board's
 * README, under Tunes.
 */
const ticketMeta = { wasm: '', airframeOf: null };

export function setTicketMeta(next) {
  if (!next) {
    return;
  }
  if (typeof next.wasm === 'string') {
    ticketMeta.wasm = /^[0-9a-f]{0,16}$/.test(next.wasm) ? next.wasm : '';
  }
  if (typeof next.airframeOf === 'function') {
    ticketMeta.airframeOf = next.airframeOf;
  }
}

/* The first 16 hex characters of the SHA-256 of the module's bytes, or ''. */
export async function wasmFingerprint(bytes) {
  try {
    if (!bytes || typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.subtle.digest !== 'function') {
      return '';
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest).subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return '';
  }
}

function deployStamp() {
  try {
    const stamp = String((window.__fresh && window.__fresh.stamp) || '');
    return /^[0-9a-z]{0,12}$/.test(stamp) ? stamp : '';
  } catch (e) {
    return '';
  }
}

/* The ticket with the build it came from added, unless the caller already
 * said (a tune names the aircraft it was flown on, which is not always the
 * one selected by the time it is sent). */
function withTicketMeta(payload) {
  const out = { ...payload };
  if (out.airframe === undefined && ticketMeta.airframeOf) {
    const id = String(ticketMeta.airframeOf() || '');
    if (id) {
      out.airframe = id;
    }
  }
  if (out.sim === undefined) {
    out.sim = { wasm: ticketMeta.wasm, deploy: deployStamp() };
  }
  return out;
}

export async function submitBug(payload, origin = boardOrigin()) {
  const board = trimOrigin(origin);
  const res = await fetch(`${board}/api/bugs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(withTicketMeta(payload)),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = null;
  }
  if (!res.ok) {
    const message = (body && body.error) || text || `The board answered ${res.status}.`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return body;
}
