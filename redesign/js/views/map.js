/**
 * Map view: world map (Natural Earth projection, plain SVG) with company
 * headquarters as stage-coloured dots, a selected company's facilities,
 * and a country concentration list.
 */
import { el, svgEl, clear } from '../dom.js';
import { STAGES, stageOf, shortName } from '../meta.js';
import { matchesFilters } from '../data.js';
import { createProjection, geoToPath } from '../projection.js';
import { showTooltip, hideTooltip } from '../tooltip.js';

const MAP_WIDTH = 960;

export function createMapView(container, countryListEl, ctx) {
  const { companies, byId, countries, world, onSelect, onCountryToggle } = ctx;
  const proj = createProjection(MAP_WIDTH);
  const dotEls = new Map();
  const countryRows = new Map();
  let overlay = null;

  build();

  function build() {
    clear(container);
    const svg = svgEl('svg', {
      viewBox: `0 0 ${proj.width} ${proj.height}`,
      role: 'img',
      'aria-label': 'World map of company headquarters',
    });
    svg.append(
      svgEl('path', { class: 'map-sphere', d: proj.spherePath }),
      svgEl('path', { class: 'map-land', d: geoToPath(world, proj.project) }),
    );

    // Cluster overlapping HQs (Tokyo, Hsinchu…) into small rings.
    const clusters = new Map();
    for (const company of companies) {
      if (typeof company.hq?.lat !== 'number' || typeof company.hq?.lng !== 'number') continue;
      const [x, y] = proj.project(company.hq.lng, company.hq.lat);
      const key = `${Math.round(x / 12)}:${Math.round(y / 12)}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push({ company, x, y });
    }

    const dotsGroup = svgEl('g');
    for (const members of clusters.values()) {
      const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
      const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
      members.forEach((member, i) => {
        let { x, y } = member;
        if (members.length > 1) {
          const angle = (i / members.length) * 2 * Math.PI - Math.PI / 2;
          const radius = Math.max(6, members.length * 1.5);
          x = cx + radius * Math.cos(angle);
          y = cy + radius * Math.sin(angle);
        }
        dotsGroup.append(makeDot(member.company, x, y));
      });
    }

    overlay = svgEl('g');
    svg.append(dotsGroup, overlay);
    container.append(svg, makeLegend());
    buildCountryList();
  }

  function makeDot(company, x, y) {
    const stage = stageOf(company.tier);
    const hq = company.hq ?? {};
    const place = [hq.city, hq.country].filter(Boolean).join(', ');
    const dot = svgEl('circle', {
      class: 'hq-dot',
      cx: x.toFixed(1),
      cy: y.toFixed(1),
      r: 4.4,
      fill: `var(--stage-${stage})`,
      tabindex: 0,
      role: 'button',
      'aria-label': `${company.name} — headquarters ${place || 'unknown'}`,
    });
    dot.addEventListener('click', () => onSelect(company.id));
    dot.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(company.id); }
    });
    dot.addEventListener('mousemove', (ev) => showTooltip(ev.clientX, ev.clientY, shortName(company), place));
    dot.addEventListener('mouseleave', hideTooltip);
    dot.addEventListener('focus', () => {
      const r = dot.getBoundingClientRect();
      showTooltip(r.right, r.top, shortName(company), place);
    });
    dot.addEventListener('blur', hideTooltip);
    dotEls.set(company.id, { dot, x, y });
    return dot;
  }

  function makeLegend() {
    return el('div', { class: 'map-legend', 'aria-hidden': 'true' }, STAGES.map((stage) =>
      el('span', { class: 'key' }, [
        el('span', { class: 'swatch', style: { background: `var(--stage-${stage.id})` } }),
        stage.label,
      ]),
    ));
  }

  function buildCountryList() {
    clear(countryListEl);
    countryListEl.append(
      el('h2', { text: 'Where it concentrates' }),
      el('p', { class: 'hint', text: 'Companies headquartered per country — tap to filter.' }),
    );
    const max = countries[0]?.count ?? 1;
    for (const { name, count } of countries) {
      const row = el('button', {
        class: 'country-row',
        type: 'button',
        'aria-pressed': 'false',
        onclick: () => onCountryToggle(name),
      }, [
        el('span', { class: 'row-top' }, [
          el('span', { text: name }),
          el('span', { class: 'n', text: String(count) }),
        ]),
        el('span', { class: 'bar' }, [
          el('span', { style: { width: `${(count / max) * 100}%` } }),
        ]),
      ]);
      countryRows.set(name, row);
      countryListEl.append(row);
    }
  }

  function update(state) {
    for (const [id, { dot }] of dotEls) {
      const company = byId.get(id);
      const dimmed = !matchesFilters(company, state);
      dot.classList.toggle('dimmed', dimmed);
      dot.setAttribute('tabindex', dimmed ? '-1' : '0');
      dot.classList.toggle('selected', id === state.c);
    }
    for (const [name, row] of countryRows) {
      row.setAttribute('aria-pressed', String(name === state.country));
    }
    drawOverlay(state.c ? byId.get(state.c) : null);
  }

  function drawOverlay(company) {
    clear(overlay);
    if (!company) return;
    const entry = dotEls.get(company.id);
    if (!entry) return;

    overlay.append(svgEl('circle', { class: 'select-ring', cx: entry.x, cy: entry.y, r: 8.5 }));
    const stage = stageOf(company.tier);
    for (const facility of company.facilities ?? []) {
      if (typeof facility?.lat !== 'number' || typeof facility?.lng !== 'number') continue;
      const [fx, fy] = proj.project(facility.lng, facility.lat);
      overlay.append(
        svgEl('path', {
          class: 'facility-link',
          d: `M${entry.x},${entry.y} L${fx.toFixed(1)},${fy.toFixed(1)}`,
        }),
        svgEl('rect', {
          class: 'facility-dot',
          x: (fx - 3).toFixed(1),
          y: (fy - 3).toFixed(1),
          width: 6,
          height: 6,
          fill: `var(--stage-${stage}-dark)`,
          transform: `rotate(45 ${fx.toFixed(1)} ${fy.toFixed(1)})`,
        }),
      );
    }
  }

  return { update };
}
