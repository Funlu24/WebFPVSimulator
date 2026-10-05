/*
 * supportprompt.js: soft support prompts at good moments.
 *
 * A small, dismissible prompt shown after a new personal best, about 20
 * minutes of total flying in a session, or right after publishing a map in
 * the builder. At most once a week per browser (localStorage). Never during
 * a run. Never for existing patrons if the sim can tell.
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

import { counting, eventsUrl } from './stats.js';

const SUPPORT_PROMPT_KEY = 'webfpv.support.prompt.v1';
const SUPPORT_DISABLED_KEY = 'webfpv.support.disabled.v1';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/* Stripe tip link: one-off, USD $5 suggested, payer can change the amount */
export const TIP_URL = 'https://donate.stripe.com/7sY4gzaAC2Eu3aOews8so0g';

/* Patreon $3 tier join link */
export const PATREON_JOIN_URL = 'https://www.patreon.com/checkout/webfpv?rid=29740590';

/* Track the last time the prompt was shown */
function readPromptState() {
  try {
    const raw = localStorage.getItem(SUPPORT_PROMPT_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writePromptState(lastShownMs) {
  try {
    localStorage.setItem(SUPPORT_PROMPT_KEY, JSON.stringify({ lastShownMs }));
    return true;
  } catch (e) {
    return false;
  }
}

/* Check if the prompt is disabled in settings */
export function isPromptDisabled() {
  try {
    return localStorage.getItem(SUPPORT_DISABLED_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

export function disablePrompt() {
  try {
    localStorage.setItem(SUPPORT_DISABLED_KEY, 'true');
    return true;
  } catch (e) {
    return false;
  }
}

/* Check if enough time has passed since the last prompt (at least one week) */
export function canShowPrompt() {
  if (isPromptDisabled()) {
    return false;
  }
  const state = readPromptState();
  if (!state || !state.lastShownMs) {
    return true;
  }
  const now = Date.now();
  return (now - state.lastShownMs) >= ONE_WEEK_MS;
}

/* Record that the prompt was shown and send a tracking beacon */
function recordPromptShown(trigger) {
  writePromptState(Date.now());
  try {
    if (counting()) {
      const body = JSON.stringify({ v: 1, kind: 'support_prompt_shown', source: `sim-${trigger}` });
      navigator.sendBeacon(eventsUrl(), new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (e) {
    /* No beacon in this browser, or it refused. The prompt is already showing. */
  }
}

/* Record a click on one of the support options */
function recordPromptClick(trigger, target) {
  try {
    if (counting()) {
      const body = JSON.stringify({ v: 1, kind: 'support_click', source: `sim-prompt-${trigger}`, target });
      navigator.sendBeacon(eventsUrl(), new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (e) {
    /* No beacon */
  }
}

/*
 * Show the support prompt. `trigger` is one of: 'pb' (personal best),
 * 'time' (20 minutes of flying), or 'publish' (published a map).
 * `container` is the DOM element to append the prompt to.
 */
export function showSupportPrompt(trigger, container) {
  if (!canShowPrompt() || !container) {
    return null;
  }

  recordPromptShown(trigger);

  const prompt = document.createElement('div');
  prompt.className = 'support-prompt';
  prompt.setAttribute('role', 'dialog');
  prompt.setAttribute('aria-label', 'Support WebFPV');

  const message = document.createElement('p');
  message.className = 'support-prompt-message';
  message.textContent = 'I build WebFPV in my spare time. If you are enjoying it, a $3 Patreon or a one-off battery helps keep it free.';

  const actions = document.createElement('div');
  actions.className = 'support-prompt-actions';

  const patreonBtn = document.createElement('a');
  patreonBtn.href = `${PATREON_JOIN_URL}?utm_source=sim-prompt&ref=sim-prompt`;
  patreonBtn.target = '_blank';
  patreonBtn.rel = 'noopener noreferrer';
  patreonBtn.className = 'support-prompt-btn support-prompt-btn-primary';
  patreonBtn.textContent = 'Patreon $3/mo';
  patreonBtn.addEventListener('click', () => {
    recordPromptClick(trigger, 'patreon');
  });

  const tipBtn = document.createElement('a');
  tipBtn.href = `${TIP_URL}?utm_source=sim-prompt&client_reference_id=prompt-${trigger}&ref=sim-prompt`;
  tipBtn.target = '_blank';
  tipBtn.rel = 'noopener noreferrer';
  tipBtn.className = 'support-prompt-btn';
  tipBtn.textContent = 'One-off $5';
  tipBtn.addEventListener('click', () => {
    recordPromptClick(trigger, 'tip');
  });

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'support-prompt-btn-text';
  settingsBtn.textContent = 'Settings';
  settingsBtn.addEventListener('click', () => {
    prompt.remove();
    /* The settings action would be handled by the caller, opening the settings menu */
    if (prompt.onSettingsClick) {
      prompt.onSettingsClick();
    }
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'support-prompt-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    prompt.remove();
  });

  actions.append(patreonBtn, tipBtn, settingsBtn);
  prompt.append(closeBtn, message, actions);
  container.append(prompt);

  return prompt;
}
