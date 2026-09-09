/**
 * URL-hash-backed state store. The hash is the single source of truth,
 * so every view (and the selection) survives refresh and supports
 * back/forward navigation.
 *
 * Shape: #view=flow&q=asml&stage=equipment&country=Japan&c=asml
 */

const VALID_VIEWS = ['flow', 'map', 'companies'];
const KEYS = ['view', 'q', 'stage', 'country', 'c'];

const listeners = [];
let current = parse();

function parse() {
  const params = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
  const view = params.get('view');
  return {
    view: VALID_VIEWS.includes(view) ? view : 'flow',
    q: params.get('q') ?? '',
    stage: params.get('stage') ?? '',
    country: params.get('country') ?? '',
    c: params.get('c') ?? '',
  };
}

function serialize(state) {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    if (state[key]) params.set(key, state[key]);
  }
  return params.toString();
}

export function getState() {
  return current;
}

/**
 * Update state. `push` creates a history entry (used for selection,
 * so Back closes the panel); filter/typing changes replace instead.
 */
export function setState(patch, { push = false } = {}) {
  const next = { ...current, ...patch };
  const hash = serialize(next);
  if (hash === serialize(current)) return;
  current = next;
  if (push) {
    window.history.pushState(null, '', hash ? '#' + hash : '#');
  } else {
    window.history.replaceState(null, '', hash ? '#' + hash : window.location.pathname + window.location.search);
  }
  notify();
}

export function subscribe(fn) {
  listeners.push(fn);
}

function notify() {
  for (const fn of listeners) fn(current);
}

window.addEventListener('hashchange', () => {
  const next = parse();
  if (serialize(next) === serialize(current)) return;
  current = next;
  notify();
});
window.addEventListener('popstate', () => {
  const next = parse();
  if (serialize(next) === serialize(current)) return;
  current = next;
  notify();
});
