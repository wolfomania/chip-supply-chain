/**
 * App entry point: loads the dataset, wires the header controls,
 * builds the three views and the detail panel, and keeps everything
 * in sync with the URL-hash state.
 */
import { loadData, hasActiveFilters } from './data.js';
import { getState, setState, subscribe } from './store.js';
import { STAGES, stageOf } from './meta.js';
import { el, clear } from './dom.js';
import { createFlowView } from './views/flow.js';
import { createMapView } from './views/map.js';
import { createListView } from './views/list.js';
import { createDetailPanel } from './detail.js';

const VIEWS = ['flow', 'map', 'companies'];
let returnFocus = null;

init().catch(showFatalError);

async function init() {
  const data = await loadData();

  const ctx = {
    ...data,
    onSelect(id) {
      returnFocus = document.activeElement;
      setState({ c: id }, { push: true });
    },
    onClose: closePanel,
    onCountryToggle(name) {
      setState({ country: getState().country === name ? '' : name });
    },
    onClearFilters() {
      setState({ q: '', stage: '', country: '' });
    },
  };

  const views = {
    flow: createFlowView(document.getElementById('flow-canvas'), ctx),
    map: createMapView(
      document.getElementById('map-canvas'),
      document.getElementById('country-list'),
      ctx,
    ),
    companies: createListView(
      document.getElementById('company-grid'),
      document.getElementById('result-count'),
      ctx,
    ),
  };
  const detail = createDetailPanel(document.getElementById('detail-panel'), ctx);

  wireHeader(data, ctx);
  wireKeyboard();

  subscribe(render);
  render(getState());

  function render(state) {
    for (const view of VIEWS) {
      const section = document.getElementById(`view-${view}`);
      const tab = document.querySelector(`[data-view="${view}"]`);
      const active = state.view === view;
      section.hidden = !active;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    syncHeader(state);
    for (const view of Object.values(views)) view.update(state);
    detail.update(state);
  }
}

function wireHeader(data, ctx) {
  // Keep the tagline's headline number tied to the dataset so it cannot drift.
  const companyCount = document.getElementById('company-count');
  if (companyCount) companyCount.textContent = String(data.companies.length);

  const search = document.getElementById('search');
  search.addEventListener('input', () => setState({ q: search.value }));

  const countrySelect = document.getElementById('country-filter');
  for (const { name, count } of data.countries) {
    countrySelect.append(el('option', { value: name, text: `${name} (${count})` }));
  }
  countrySelect.addEventListener('change', () => setState({ country: countrySelect.value }));

  const chipBar = document.querySelector('.stage-chips');
  STAGES.forEach((stage, i) => {
    if (i > 0 && stage.id !== 'logistics') {
      chipBar.append(el('span', { class: 'chip-arrow', 'aria-hidden': 'true', text: '→' }));
    }
    const count = data.companies.filter((c) => stageOf(c.tier) === stage.id).length;
    chipBar.append(el('button', {
      class: 'stage-chip',
      type: 'button',
      'aria-pressed': 'false',
      dataset: { stage: stage.id },
      style: {
        '--chip-color': `var(--stage-${stage.id})`,
        '--chip-dark': `var(--stage-${stage.id}-dark)`,
        '--chip-soft': `var(--stage-${stage.id}-soft)`,
      },
      onclick: () => setState({ stage: getState().stage === stage.id ? '' : stage.id }),
    }, [
      el('span', { class: 'dot', 'aria-hidden': 'true' }),
      stage.label,
      el('span', { class: 'count', text: String(count) }),
    ]));
  });

  document.getElementById('clear-filters').addEventListener('click', ctx.onClearFilters);

  const tablist = document.querySelector('.view-tabs');
  tablist.addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-view]');
    if (tab) setState({ view: tab.dataset.view }, { push: true });
  });
  tablist.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const dir = ev.key === 'ArrowRight' ? 1 : -1;
    const idx = VIEWS.indexOf(getState().view);
    const next = VIEWS[(idx + dir + VIEWS.length) % VIEWS.length];
    setState({ view: next }, { push: true });
    document.querySelector(`[data-view="${next}"]`)?.focus();
  });
}

function syncHeader(state) {
  const search = document.getElementById('search');
  if (search.value !== state.q) search.value = state.q;

  const countrySelect = document.getElementById('country-filter');
  if (countrySelect.value !== state.country) countrySelect.value = state.country;

  for (const chip of document.querySelectorAll('.stage-chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.stage === state.stage));
  }
  document.getElementById('clear-filters').hidden = !hasActiveFilters(state);
}

function wireKeyboard() {
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && getState().c) {
      ev.preventDefault();
      closePanel();
    }
  });
}

function closePanel() {
  setState({ c: '' }, { push: true });
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

function showFatalError(error) {
  const main = document.getElementById('main');
  clear(main);
  main.append(el('div', { class: 'empty-note' }, [
    el('p', { text: 'The dataset could not be loaded.' }),
    el('p', { text: 'If you opened index.html directly from disk, serve the folder over HTTP instead — e.g. run: npx serve .' }),
    el('p', { text: String(error?.message ?? error) }),
  ]));
}
