/**
 * Flow view: the supply chain as ordered columns of HTML node buttons with
 * an SVG edge layer underneath. Hovering or selecting a company traces its
 * upstream and downstream links.
 */
import { el, svgEl, clear } from '../dom.js';
import { stageOf, shortName, TIER_LABELS } from '../meta.js';
import { matchesFilters } from '../data.js';
import { showTooltip, hideTooltip } from '../tooltip.js';

const COLUMNS = [
  { tiers: ['raw-materials'] },
  { tiers: ['materials'] },
  { tiers: ['equipment-suppliers'] },
  { tiers: ['equipment', 'eda'] },
  { tiers: ['fabs', 'memory'] },
  { tiers: ['packaging'] },
  { tiers: ['designers'] },
];

export function createFlowView(container, ctx) {
  const { companies, byId, onSelect } = ctx;
  const nodeEls = new Map();
  let edgeEls = [];
  let svg = null;
  let hoverId = null;
  let lastState = null;

  build();

  function build() {
    clear(container);
    svg = svgEl('svg', { class: 'flow-edges', 'aria-hidden': 'true' });
    container.append(svg);

    for (const column of COLUMNS) {
      const colEl = el('div', { class: 'flow-col' });
      for (const tier of column.tiers) {
        const members = companies.filter((c) => c.tier === tier);
        if (!members.length) continue;
        const stage = stageOf(tier);
        const group = el('div', { class: 'flow-group' }, [
          el('h2', {
            class: 'flow-group-title',
            style: { '--group-color': `var(--stage-${stage}-dark)` },
            text: TIER_LABELS[tier] ?? tier,
          }),
          ...members.map(makeNode),
        ]);
        colEl.append(group);
      }
      container.append(colEl);
    }

    // Logistics runs under everything — it connects the whole chain.
    const logistics = companies.filter((c) => c.tier === 'logistics');
    if (logistics.length) {
      container.append(el('div', { class: 'flow-logistics' }, [
        el('h2', {
          class: 'flow-group-title',
          style: { '--group-color': 'var(--stage-logistics-dark)' },
          text: TIER_LABELS.logistics,
        }),
        ...logistics.map(makeNode),
      ]));
    }

    requestAnimationFrame(drawEdges);
    const observer = new ResizeObserver(() => requestAnimationFrame(drawEdges));
    observer.observe(container);
  }

  function makeNode(company) {
    const stage = stageOf(company.tier);
    const node = el('button', {
      class: 'flow-node',
      type: 'button',
      style: { '--node-color': `var(--stage-${stage})` },
      'aria-label': `${company.name}${company.bottleneck ? ' (chokepoint)' : ''}`,
      dataset: { id: company.id, tier: company.tier },
      onclick: () => onSelect(company.id),
      onmouseenter: () => setHover(company.id),
      onmouseleave: () => setHover(null),
      onfocus: () => setHover(company.id),
      onblur: () => setHover(null),
    }, [
      el('span', { text: shortName(company) }),
      company.bottleneck ? el('span', { class: 'choke', 'aria-hidden': 'true', text: '◆' }) : null,
    ]);
    nodeEls.set(company.id, node);
    return node;
  }

  function drawEdges() {
    if (!svg || !container.isConnected) return;
    clear(svg);
    edgeEls = [];
    const base = container.getBoundingClientRect();
    if (base.width === 0) return;
    svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);

    for (const company of companies) {
      for (const edge of company.suppliesTo ?? []) {
        const target = byId.get(edge.target);
        const srcEl = nodeEls.get(company.id);
        const tgtEl = target && nodeEls.get(target.id);
        if (!srcEl || !tgtEl) continue;

        const d = edgePath(srcEl, tgtEl, base, company.tier === 'logistics');
        const stage = stageOf(company.tier);
        const path = svgEl('path', { class: 'edge', d, stroke: `var(--stage-${stage})` });
        const hit = svgEl('path', { class: 'edge-hit', d });
        const label = `${shortName(company)} → ${shortName(target)}`;
        hit.addEventListener('mousemove', (ev) => showTooltip(ev.clientX, ev.clientY, label, edge.what ?? ''));
        hit.addEventListener('mouseleave', hideTooltip);
        svg.append(path, hit);
        edgeEls.push({ path, src: company.id, tgt: target.id });
      }
    }
    applyTrace();
  }

  function edgePath(srcEl, tgtEl, base, fromLogistics) {
    const a = relRect(srcEl, base);
    const b = relRect(tgtEl, base);

    if (fromLogistics) {
      // Rise from the logistics band up into the chain.
      const x1 = a.left + a.width / 2;
      const y1 = a.top;
      const x2 = b.left + b.width / 2;
      const y2 = b.top + b.height;
      const bend = Math.max(40, (y1 - y2) * 0.4);
      return `M${x1},${y1} C${x1},${y1 - bend} ${x2},${y2 + bend} ${x2},${y2}`;
    }

    const x1 = a.left + a.width;
    const y1 = a.top + a.height / 2;
    const x2 = b.left;
    const y2 = b.top + b.height / 2;

    if (x2 - x1 < 18) {
      // Same-column (or overlapping) link: bow out to the right.
      const bow = 34 + Math.abs(y2 - y1) * 0.12;
      return `M${x1},${y1} C${x1 + bow},${y1} ${x2 + a.width + bow},${y2} ${x2 + b.width},${y2}`;
    }
    const mid = (x1 + x2) / 2;
    return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
  }

  function relRect(node, base) {
    const r = node.getBoundingClientRect();
    return { left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height };
  }

  function setHover(id) {
    hoverId = id;
    applyTrace();
  }

  function applyTrace() {
    const traceId = hoverId ?? lastState?.c ?? null;
    const active = traceId && nodeEls.has(traceId) ? traceId : null;
    container.classList.toggle('tracing', Boolean(active));

    const lit = new Set();
    if (active) {
      lit.add(active);
      for (const { src, tgt } of edgeEls) {
        if (src === active) lit.add(tgt);
        if (tgt === active) lit.add(src);
      }
    }
    for (const { path, src, tgt } of edgeEls) {
      path.classList.toggle('lit', Boolean(active && (src === active || tgt === active)));
    }
    for (const [id, node] of nodeEls) {
      node.classList.toggle('lit', lit.has(id));
      node.classList.toggle('origin', id === active);
      node.classList.toggle('selected', id === lastState?.c);
    }
  }

  function update(state) {
    lastState = state;
    for (const [id, node] of nodeEls) {
      const company = byId.get(id);
      node.classList.toggle('dimmed', !matchesFilters(company, state));
    }
    applyTrace();
  }

  return { update };
}
