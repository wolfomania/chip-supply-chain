/**
 * Companies view: searchable, filterable card grid with a result count
 * and an explicit empty state.
 */
import { el, clear } from '../dom.js';
import { stageOf, TIER_LABELS } from '../meta.js';
import { matchesFilters } from '../data.js';

export function createListView(gridEl, countEl, ctx) {
  const { companies, onSelect, onClearFilters } = ctx;

  function update(state) {
    const matched = companies.filter((company) => matchesFilters(company, state));
    countEl.textContent = `${matched.length} of ${companies.length} companies`;
    clear(gridEl);

    if (!matched.length) {
      gridEl.append(el('div', { class: 'empty-note' }, [
        el('p', { text: 'No companies match the current search and filters.' }),
        el('button', { type: 'button', text: 'Clear filters', onclick: onClearFilters }),
      ]));
      return;
    }

    for (const company of matched) {
      gridEl.append(makeCard(company, state));
    }
  }

  function makeCard(company, state) {
    const stage = stageOf(company.tier);
    const country = company.hq?.country;
    return el('button', {
      class: `company-card${company.id === state.c ? ' selected' : ''}`,
      type: 'button',
      style: {
        '--card-color': `var(--stage-${stage})`,
        '--card-dark': `var(--stage-${stage}-dark)`,
        '--card-soft': `var(--stage-${stage}-soft)`,
      },
      dataset: { id: company.id },
      onclick: () => onSelect(company.id),
    }, [
      el('span', { class: 'card-top' }, [
        el('span', { class: 'card-name', text: company.name }),
        el('span', { class: 'tier-tag', text: TIER_LABELS[company.tier] ?? company.tier }),
      ]),
      company.role ? el('span', { class: 'role', text: company.role }) : null,
      el('span', { class: 'card-meta' }, [
        country ? el('span', { text: country }) : null,
        company.bottleneck ? el('span', { class: 'badge-choke', text: '◆ chokepoint' }) : null,
      ]),
    ]);
  }

  return { update };
}
