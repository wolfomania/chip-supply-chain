/**
 * Detail panel: everything the dataset knows about one company —
 * description, places, supply relationships, stock listing, links.
 * Fields render only when present; missing data is simply omitted.
 */
import { el, clear } from './dom.js';
import { stageOf, shortName, TIER_LABELS } from './meta.js';

export function createDetailPanel(panel, ctx) {
  const { byId, suppliedBy, listings, onSelect, onClose } = ctx;
  let openId = null;

  function update(state) {
    const company = state.c ? byId.get(state.c) : null;
    if (!company) {
      if (!panel.hidden) {
        panel.hidden = true;
        openId = null;
      }
      return;
    }
    if (company.id === openId) return; // already showing it
    openId = company.id;
    render(company);
    panel.hidden = false;
    panel.scrollTop = 0;
    panel.querySelector('.detail-close')?.focus();
  }

  function render(company) {
    clear(panel);
    const stage = stageOf(company.tier);
    panel.style.setProperty('--panel-color', `var(--stage-${stage})`);
    panel.style.setProperty('--panel-dark', `var(--stage-${stage}-dark)`);
    panel.style.setProperty('--panel-soft', `var(--stage-${stage}-soft)`);

    panel.append(
      el('div', { class: 'detail-head' }, [
        el('span', { class: 'tier-tag', text: TIER_LABELS[company.tier] ?? company.tier }),
        el('button', {
          class: 'detail-close',
          type: 'button',
          'aria-label': 'Close details',
          text: '✕',
          onclick: onClose,
        }),
      ]),
      el('h2', { id: 'detail-title', text: company.name }),
    );

    if (company.role) panel.append(el('p', { class: 'detail-role', text: company.role }));
    if (company.bottleneck) {
      panel.append(el('span', { class: 'detail-choke', text: '◆ Chokepoint — effectively sole or dominant supplier' }));
    }

    if (company.imageUrl) {
      const img = el('img', {
        src: company.imageUrl,
        alt: company.imageCredit ? `${company.name} — ${company.imageCredit}` : company.name,
        loading: 'lazy',
      });
      const figure = el('figure', { class: 'detail-figure' }, [
        img,
        company.imageCredit ? el('figcaption', { text: company.imageCredit }) : null,
      ]);
      img.addEventListener('error', () => figure.remove());
      panel.append(figure);
    }

    if (company.description) panel.append(el('p', { class: 'detail-desc', text: company.description }));

    appendPlaces(company);
    appendEdges('Supplies', company.suppliesTo ?? [], (edge) => ({ id: edge.target, what: edge.what }));
    appendEdges('Supplied by', suppliedBy.get(company.id) ?? [], (edge) => ({ id: edge.source, what: edge.what }));
    appendStock(company);
    appendLinks(company);
  }

  function appendPlaces(company) {
    const hq = company.hq;
    const facilities = (company.facilities ?? []).filter((f) => f?.name);
    if (!hq?.country && !facilities.length) return;

    panel.append(el('h3', { text: 'Locations' }));
    const list = el('ul', { class: 'place-list' });
    if (hq?.country || hq?.city) {
      list.append(el('li', {}, [
        el('span', { class: 'place-name', text: 'Headquarters' }),
        ' — ',
        el('span', { class: 'place-loc', text: [hq.city, hq.country].filter(Boolean).join(', ') }),
      ]));
    }
    for (const facility of facilities) {
      const loc = [facility.city, facility.country].filter(Boolean).join(', ');
      list.append(el('li', {}, [
        el('span', { class: 'place-name', text: facility.name }),
        loc ? el('span', { class: 'place-loc', text: ` — ${loc}` }) : null,
        facility.note ? el('div', { class: 'place-note', text: facility.note }) : null,
      ]));
    }
    panel.append(list);
  }

  function appendEdges(title, edges, pick) {
    const rows = edges
      .map(pick)
      .filter((edge) => edge.id && byId.has(edge.id));
    if (!rows.length) return;

    panel.append(el('h3', { text: title }));
    const wrap = el('div', { class: 'link-rows' });
    for (const { id, what } of rows) {
      const peer = byId.get(id);
      const peerStage = stageOf(peer.tier);
      wrap.append(el('div', { class: 'link-row' }, [
        el('button', {
          class: 'peer',
          type: 'button',
          style: { '--peer-color': `var(--stage-${peerStage})` },
          text: shortName(peer),
          onclick: () => onSelect(id),
        }),
        what ? el('span', { class: 'what', text: what }) : null,
      ]));
    }
    panel.append(wrap);
  }

  function appendStock(company) {
    const entry = listings?.[company.id];
    panel.append(el('h3', { text: 'Stock listing' }));

    if (!entry || !entry.symbol) {
      panel.append(el('div', { class: 'stock-block' }, [
        el('p', { text: entry?.note ?? 'No public listing information in this dataset.' }),
      ]));
      return;
    }

    panel.append(el('div', { class: 'stock-block' }, [
      el('div', { class: 'stock-line' }, [
        el('span', { class: 'stock-symbol', text: entry.symbol }),
        entry.exchange ? el('span', { class: 'stock-exchange', text: entry.exchange }) : null,
        entry.currency ? el('span', { class: 'stock-exchange', text: entry.currency }) : null,
      ]),
      entry.companyLabel ? el('div', { class: 'stock-issuer', text: `Issuer: ${entry.companyLabel}` }) : null,
      entry.note ? el('p', { class: 'stock-note', text: entry.note }) : null,
      el('p', {
        class: 'stock-disclaimer',
        text: 'Listing reference from a static dataset — no live or historical prices are shown here.',
      }),
    ]));
  }

  function appendLinks(company) {
    const links = [
      company.website ? { href: company.website, label: 'Official website' } : null,
      company.productUrl ? { href: company.productUrl, label: 'Relevant products' } : null,
    ].filter(Boolean);
    if (!links.length) return;

    panel.append(
      el('h3', { text: 'Links' }),
      el('div', { class: 'ext-links' }, links.map(({ href, label }) =>
        el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: label }),
      )),
    );
  }

  return { update };
}
