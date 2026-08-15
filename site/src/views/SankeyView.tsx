import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { SankeyLink, SankeyNode } from 'd3-sankey';
import type { Company, Edge, Tier } from '../data/types';
import type { ViewProps } from './viewProps';
import { CROSS_CUTTING_TIERS, FLOW_TIERS, TIER_COLOR, TIER_LABEL, tierIndex } from '../data/tiers';
import './SankeyView.css';

/**
 * FLOW VIEW — the supply chain as a Sankey diagram.
 *
 * Columns are *pinned* to `tierIndex()` rather than inferred from graph depth,
 * so the diagram always reads raw-materials → … → designers even when the data
 * has no path that walks every stage. d3-sankey derives its column count from
 * the longest path in the graph (`max(node.depth) + 1`) and then clamps whatever
 * `nodeAlign` returns into that range — so a zero-weight "spine" of one invisible
 * node per tier is added to the graph purely to make that count equal the number
 * of flow tiers. The spine is filtered out before anything is rendered.
 *
 * Cross-cutting tiers (logistics) are excluded entirely: they connect to every
 * stage and would turn the diagram into a hairball. Same-tier links can't be
 * drawn between two pinned columns either, so they are dropped from the ribbons;
 * both omissions are called out in the footnote.
 *
 * Layout is computed with d3-sankey; every element is rendered by React.
 */

/* Geometry ------------------------------------------------------------------ */

const MIN_WIDTH = 1280;
const NODE_W = 14;
const NODE_PAD = 14;
const MARGIN = { top: 68, right: 30, bottom: 18, left: 4 };
const LABEL_GAP = 8;
const LABEL_SIZE = 11.5;
const LABEL_LEAD = 12.5;
const CHAR_W = LABEL_SIZE * 0.55;
const HEADER_CHAR_W = 7;

/** Flow tiers in canonical order — one diagram column each. */
const COLUMN_TIERS: Tier[] = [...FLOW_TIERS].sort((a, b) => tierIndex(a) - tierIndex(b));
const COLUMN_OF = new Map<Tier, number>(COLUMN_TIERS.map((tier, i) => [tier, i]));
const CROSS_CUTTING = new Set<Tier>(CROSS_CUTTING_TIERS);

/* Label text ---------------------------------------------------------------- */

const LEGAL_SUFFIXES = [
  'SE + Co. KG',
  'Co., Ltd.',
  'Co. Ltd.',
  'Co., Inc.',
  'Technology Corp.',
  'Corporation',
  'Incorporated',
  'Holdings',
  'Holding',
  'Corp.',
  'Inc.',
  'Limited',
  'Ltd.',
  'N.V.',
  'S.A.',
  'A.G.',
  'GmbH',
  'L.L.C.',
  'LLC',
  'plc',
  'PLC',
  'AG',
  'SE',
  'KG',
];

/** "Shin-Etsu Chemical Co., Ltd." → "Shin-Etsu Chemical". Display only. */
function shortName(name: string): string {
  let out = name.replace(/\s*\([^()]*\)\s*$/, '').trim();
  for (let pass = 0; pass < 4; pass += 1) {
    const before = out;
    for (const suffix of LEGAL_SUFFIXES) {
      if (out.length > suffix.length + 1 && out.slice(-suffix.length - 1) === ` ${suffix}`) {
        out = out.slice(0, -suffix.length - 1).replace(/[,\s]+$/, '');
        break;
      }
    }
    if (out === before) break;
  }
  return out || name;
}

/** Greedy word wrap into at most `maxLines` lines of roughly `maxChars`. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    // Once the last permitted line is open, everything else joins it.
    if (line && next.length > maxChars && lines.length < maxLines - 1) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* Layout data --------------------------------------------------------------- */

interface NodeDatum {
  id: string;
  name: string;
  label: string[];
  role: string;
  tier: Tier;
  column: number;
  spine: boolean;
  fixedValue?: number;
}

interface LinkDatum {
  id: string;
  source: string;
  target: string;
  sourceTier: Tier;
  targetTier: Tier;
  what: string;
  value: number;
  spine: boolean;
}

type LaidOutNode = SankeyNode<NodeDatum, LinkDatum>;
type LaidOutLink = SankeyLink<NodeDatum, LinkDatum>;

interface RenderNode {
  id: string;
  name: string;
  role: string;
  tier: Tier;
  column: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  label: string[];
  labelX: number;
  labelY: number;
  labelAnchor: 'start' | 'end';
  degree: number;
}

interface RenderLink {
  id: string;
  path: string;
  width: number;
  gradient: string;
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  what: string;
  midX: number;
  midY: number;
}

interface Gradient {
  id: string;
  x1: number;
  x2: number;
  from: string;
  to: string;
}

interface ColumnHeader {
  tier: Tier;
  index: number;
  x: number;
  ruleEnd: number;
  anchor: 'start' | 'end';
  lines: string[];
  count: number;
}

interface Layout {
  width: number;
  height: number;
  nodes: RenderNode[];
  links: RenderLink[];
  gradients: Gradient[];
  headers: ColumnHeader[];
  upstream: Map<string, LaidOutLink[]>;
  downstream: Map<string, LaidOutLink[]>;
  linkById: Map<string, RenderLink>;
  nodeCount: number;
  linkCount: number;
  sameTierCount: number;
}

/** Nudge overlapping labels apart inside each vertical lane. */
function deCollide(nodes: RenderNode[], top: number, bottom: number): void {
  const lanes = new Map<string, RenderNode[]>();
  for (const node of nodes) {
    const key = `${node.column}:${node.labelAnchor}`;
    const lane = lanes.get(key);
    if (lane) lane.push(node);
    else lanes.set(key, [node]);
  }
  for (const lane of lanes.values()) {
    lane.sort((a, b) => a.labelY - b.labelY);
    const gapAfter = (i: number) =>
      ((lane[i].label.length + lane[i + 1].label.length) / 2) * LABEL_LEAD + 3;
    for (let i = 1; i < lane.length; i += 1) {
      const min = lane[i - 1].labelY + gapAfter(i - 1);
      if (lane[i].labelY < min) lane[i].labelY = min;
    }
    const last = lane[lane.length - 1];
    if (last && last.labelY > bottom) last.labelY = bottom;
    for (let i = lane.length - 2; i >= 0; i -= 1) {
      const max = lane[i + 1].labelY - gapAfter(i);
      if (lane[i].labelY > max) lane[i].labelY = max;
    }
    if (lane[0] && lane[0].labelY < top) lane[0].labelY = top;
  }
}

function buildLayout(
  companies: Company[],
  edges: Edge[],
  width: number,
  plotHeight: number,
  uid: string,
): Layout {
  const flowCompanies = companies.filter((c) => !CROSS_CUTTING.has(c.tier) && COLUMN_OF.has(c.tier));
  const flowIds = new Set(flowCompanies.map((c) => c.id));

  const usable = edges.filter((e) => flowIds.has(e.source) && flowIds.has(e.target));
  const drawable = usable.filter((e) => e.sourceTier !== e.targetTier);
  const sameTierCount = usable.length - drawable.length;

  const degree = new Map<string, number>();
  for (const edge of drawable) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const plotLeft = MARGIN.left;
  const plotRight = width - MARGIN.right;
  const plotTop = MARGIN.top;
  const plotBottom = MARGIN.top + plotHeight;
  const kx = (plotRight - plotLeft - NODE_W) / (COLUMN_TIERS.length - 1);
  const laneChars = Math.max(14, Math.floor((kx - NODE_W - LABEL_GAP - 6) / CHAR_W));
  const wrapAt = Math.max(20, Math.min(32, laneChars));

  const nodeData: NodeDatum[] = flowCompanies.map((company) => ({
    id: company.id,
    name: company.name,
    label: wrapText(shortName(company.name), wrapAt, 2),
    role: company.role,
    tier: company.tier,
    column: COLUMN_OF.get(company.tier) as number,
    spine: false,
    // A company whose only relationships are inside its own tier would collapse
    // to zero height; keep it visible at the weight of one link.
    fixedValue: degree.has(company.id) ? undefined : 1,
  }));

  const linkData: LinkDatum[] = drawable.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceTier: edge.sourceTier,
    targetTier: edge.targetTier,
    what: edge.what,
    value: 1,
    spine: false,
  }));

  // Zero-weight spine: forces d3-sankey's column count to the number of tiers so
  // pinned columns are never clamped, and guarantees no column is empty.
  for (let i = 0; i < COLUMN_TIERS.length; i += 1) {
    nodeData.push({
      id: `__spine__${i}`,
      name: '',
      label: [],
      role: '',
      tier: COLUMN_TIERS[i],
      column: i,
      spine: true,
    });
    if (i > 0) {
      linkData.push({
        id: `__spine__${i}`,
        source: `__spine__${i - 1}`,
        target: `__spine__${i}`,
        sourceTier: COLUMN_TIERS[i - 1],
        targetTier: COLUMN_TIERS[i],
        what: '',
        value: 0,
        spine: true,
      });
    }
  }

  const generator = sankey<NodeDatum, LinkDatum>()
    .nodeId((d) => d.id)
    .nodeAlign((d) => d.column)
    .nodeWidth(NODE_W)
    .nodePadding(NODE_PAD)
    .iterations(32)
    .extent([
      [plotLeft, plotTop],
      [plotRight, plotBottom],
    ]);

  const graph = generator({
    nodes: nodeData as LaidOutNode[],
    links: linkData as unknown as LaidOutLink[],
  });

  const pathOf = sankeyLinkHorizontal<NodeDatum, LinkDatum>();

  const columnAnchors = new Map<number, LaidOutNode>();
  for (const node of graph.nodes) {
    if (node.spine) columnAnchors.set(node.column, node);
  }

  const upstream = new Map<string, LaidOutLink[]>();
  const downstream = new Map<string, LaidOutLink[]>();
  const gradients = new Map<string, Gradient>();
  const links: RenderLink[] = [];

  for (const link of graph.links) {
    if (link.spine) continue;
    const source = link.source as LaidOutNode;
    const target = link.target as LaidOutNode;

    const key = `${source.tier}__${target.tier}`;
    if (!gradients.has(key)) {
      gradients.set(key, {
        id: `${uid}-${key}`,
        x1: source.x1 as number,
        x2: target.x0 as number,
        from: TIER_COLOR[source.tier],
        to: TIER_COLOR[target.tier],
      });
    }

    const out = downstream.get(source.id);
    if (out) out.push(link);
    else downstream.set(source.id, [link]);

    const incoming = upstream.get(target.id);
    if (incoming) incoming.push(link);
    else upstream.set(target.id, [link]);

    links.push({
      id: link.id,
      path: pathOf(link) ?? '',
      width: Math.max(1, link.width ?? 1),
      gradient: `${uid}-${key}`,
      source: source.id,
      target: target.id,
      sourceName: source.name,
      targetName: target.name,
      what: link.what,
      midX: ((source.x1 as number) + (target.x0 as number)) / 2,
      midY: ((link.y0 as number) + (link.y1 as number)) / 2,
    });
  }

  const lastColumn = COLUMN_TIERS.length - 1;
  const nodes: RenderNode[] = [];
  for (const node of graph.nodes) {
    if (node.spine) continue;
    const x0 = node.x0 as number;
    const x1 = node.x1 as number;
    const y0 = node.y0 as number;
    const y1 = node.y1 as number;
    const anchor: 'start' | 'end' = node.column === lastColumn ? 'end' : 'start';
    nodes.push({
      id: node.id,
      name: node.name,
      role: node.role,
      tier: node.tier,
      column: node.column,
      x0,
      x1,
      y0,
      y1,
      label: node.label,
      labelX: anchor === 'start' ? x1 + LABEL_GAP : x0 - LABEL_GAP,
      labelY: (y0 + y1) / 2,
      labelAnchor: anchor,
      degree: (upstream.get(node.id)?.length ?? 0) + (downstream.get(node.id)?.length ?? 0),
    });
  }

  deCollide(nodes, plotTop + LABEL_LEAD / 2, plotBottom - LABEL_LEAD / 2);

  const counts = new Map<Tier, number>();
  for (const company of flowCompanies) counts.set(company.tier, (counts.get(company.tier) ?? 0) + 1);

  const headerChars = Math.max(9, Math.floor((kx - 10) / HEADER_CHAR_W));
  const headers: ColumnHeader[] = COLUMN_TIERS.map((tier, i) => {
    const anchorNode = columnAnchors.get(i);
    const x0 = anchorNode ? (anchorNode.x0 as number) : plotLeft + i * kx;
    const x1 = x0 + NODE_W;
    const anchor: 'start' | 'end' = i === lastColumn ? 'end' : 'start';
    return {
      tier,
      index: i + 1,
      x: anchor === 'start' ? x0 : x1,
      ruleEnd:
        anchor === 'start' ? x0 + Math.min(kx - 12, 148) : x1 - Math.min(kx - 12, 148),
      anchor,
      lines: wrapText(TIER_LABEL[tier], headerChars, 2),
      count: counts.get(tier) ?? 0,
    };
  });

  return {
    width,
    height: plotBottom + MARGIN.bottom,
    nodes,
    links,
    gradients: [...gradients.values()],
    headers,
    upstream,
    downstream,
    linkById: new Map(links.map((l) => [l.id, l])),
    nodeCount: flowCompanies.length,
    linkCount: links.length,
    sameTierCount,
  };
}

/** Every node and link reachable from `id`, following the chain both ways. */
function connected(layout: Layout, id: string): { nodes: Set<string>; links: Set<string> } {
  const nodes = new Set<string>([id]);
  const links = new Set<string>();

  const walk = (start: string, table: Map<string, LaidOutLink[]>, step: (l: LaidOutLink) => string) => {
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const link of table.get(current) ?? []) {
        links.add(link.id);
        const next = step(link);
        if (!nodes.has(next)) {
          nodes.add(next);
          queue.push(next);
        }
      }
    }
  };

  walk(id, layout.downstream, (l) => (l.target as LaidOutNode).id);
  walk(id, layout.upstream, (l) => (l.source as LaidOutNode).id);
  return { nodes, links };
}

/* Component ----------------------------------------------------------------- */

type Hover = { kind: 'node'; id: string } | { kind: 'link'; id: string } | null;

interface Tip {
  x: number;
  y: number;
  flip: boolean;
  title: string;
  body: string;
}

export function SankeyView({ companies, edges, selectedId, onSelectCompany }: ViewProps) {
  const rawUid = useId();
  const uid = useMemo(() => `sk${rawUid.replace(/[^a-zA-Z0-9]/g, '')}`, [rawUid]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [plotHeight, setPlotHeight] = useState(760);
  const [hover, setHover] = useState<Hover>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      setPageWidth(document.documentElement.clientWidth);
      setPlotHeight(Math.round(Math.max(700, Math.min(1080, window.innerHeight - 210))));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setAvailable(Math.round(box.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const width = Math.max(MIN_WIDTH, available);

  const layout = useMemo(
    () => (available > 0 ? buildLayout(companies, edges, width, plotHeight, uid) : null),
    [companies, edges, width, plotHeight, uid, available],
  );

  const focus = useMemo(() => {
    if (!layout) return null;
    if (hover?.kind === 'link') {
      const link = layout.linkById.get(hover.id);
      if (!link) return null;
      return { nodes: new Set([link.source, link.target]), links: new Set([link.id]) };
    }
    const id = hover?.kind === 'node' ? hover.id : selectedId;
    if (!id || !layout.nodes.some((n) => n.id === id)) return null;
    return connected(layout, id);
  }, [layout, hover, selectedId]);

  const showTip = useCallback((event: { clientX: number; clientY: number }, title: string, body: string) => {
    const host = scrollRef.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    setTip({
      x: event.clientX - box.left + host.scrollLeft,
      y: event.clientY - box.top,
      flip: event.clientX > window.innerWidth - 340,
      title,
      body,
    });
  }, []);

  const clearHover = useCallback(() => {
    setHover(null);
    setTip(null);
  }, []);

  const stateOf = (id: string, bucket: 'nodes' | 'links') => {
    if (!focus) return '';
    return focus[bucket].has(id) ? ' is-hot' : ' is-cool';
  };

  return (
    <div className="sankey">
      <header className="sankey__intro">
        <p className="eyebrow">Flow · raw materials to finished silicon</p>
        <p className="sankey__lede">
          Every ribbon is one supply relationship. Columns are the stages of the chain, in order — a company
          sits in the column of the job it does, and the chain runs left to right. Hover a company to light up
          everything it depends on and everything that depends on it.
        </p>
        {layout ? (
          <p className="sankey__meta">
            <strong>{layout.nodeCount}</strong> companies · <strong>{layout.linkCount}</strong> links ·{' '}
            <strong>{COLUMN_TIERS.length}</strong> stages
          </p>
        ) : null}
      </header>

      <div
        className="sankey__bleed"
        style={
          pageWidth > 0
            ? { width: `${pageWidth}px`, marginInline: `calc(50% - ${pageWidth / 2}px)` }
            : undefined
        }
      >
        <div className="sankey__scroll" ref={scrollRef}>
          {layout ? (
            <div className="sankey__stage" style={{ width: layout.width, height: layout.height }}>
              <svg
                className={`sankey__svg${focus ? ' is-focused' : ''}`}
                width={layout.width}
                height={layout.height}
                role="img"
                aria-label={`Sankey diagram of ${layout.nodeCount} chip supply-chain companies and ${layout.linkCount} supply relationships`}
                onMouseLeave={clearHover}
              >
                <defs>
                  {layout.gradients.map((g) => (
                    <linearGradient
                      key={g.id}
                      id={g.id}
                      gradientUnits="userSpaceOnUse"
                      x1={g.x1}
                      x2={g.x2}
                      y1={0}
                      y2={0}
                    >
                      <stop offset="0%" stopColor={g.from} />
                      <stop offset="100%" stopColor={g.to} />
                    </linearGradient>
                  ))}
                </defs>

                <g className="sankey__headers">
                  {layout.headers.map((h) => (
                    <g key={h.tier}>
                      <text
                        className="sankey__col-index"
                        x={h.x}
                        y={MARGIN.top - 48}
                        textAnchor={h.anchor}
                        fill={TIER_COLOR[h.tier]}
                      >
                        {String(h.index).padStart(2, '0')}
                      </text>
                      <line
                        x1={h.x}
                        x2={h.ruleEnd}
                        y1={MARGIN.top - 40}
                        y2={MARGIN.top - 40}
                        stroke={TIER_COLOR[h.tier]}
                        strokeWidth={2}
                      />
                      <text
                        className="sankey__col-label"
                        x={h.x}
                        y={MARGIN.top - 26}
                        textAnchor={h.anchor}
                        fill={TIER_COLOR[h.tier]}
                      >
                        {h.lines.map((line, i) => (
                          <tspan key={i} x={h.x} dy={i === 0 ? 0 : 11}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  ))}
                </g>

                <g className="sankey__links" fill="none">
                  {layout.links.map((link) => (
                    <path
                      key={link.id}
                      className={`sankey__link${stateOf(link.id, 'links')}`}
                      d={link.path}
                      stroke={`url(#${link.gradient})`}
                      strokeWidth={link.width}
                      onMouseEnter={(event) => {
                        setHover({ kind: 'link', id: link.id });
                        showTip(
                          event,
                          `${link.sourceName} → ${link.targetName}`,
                          link.what || 'Supply relationship',
                        );
                      }}
                      onMouseLeave={clearHover}
                      onClick={() => onSelectCompany(link.target)}
                    >
                      <title>{`${link.sourceName} → ${link.targetName}: ${link.what}`}</title>
                    </path>
                  ))}
                </g>

                <g className="sankey__nodes">
                  {layout.nodes.map((node) => (
                    <rect
                      key={node.id}
                      className={`sankey__node${stateOf(node.id, 'nodes')}${
                        node.id === selectedId ? ' is-selected' : ''
                      }`}
                      x={node.x0}
                      y={node.y0}
                      width={node.x1 - node.x0}
                      height={Math.max(2, node.y1 - node.y0)}
                      rx={2}
                      fill={TIER_COLOR[node.tier]}
                      tabIndex={0}
                      role="button"
                      aria-label={`${node.name} — ${TIER_LABEL[node.tier]}, ${node.degree} links`}
                      onMouseEnter={() => setHover({ kind: 'node', id: node.id })}
                      onMouseLeave={clearHover}
                      onFocus={() => setHover({ kind: 'node', id: node.id })}
                      onBlur={clearHover}
                      onClick={() => onSelectCompany(node.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectCompany(node.id);
                        }
                      }}
                    >
                      <title>{`${node.name} — ${node.role}`}</title>
                    </rect>
                  ))}
                </g>

                <g className="sankey__labels">
                  {layout.nodes.map((node) => (
                    <text
                      key={node.id}
                      className={`sankey__label${stateOf(node.id, 'nodes')}${
                        node.id === selectedId ? ' is-selected' : ''
                      }`}
                      x={node.labelX}
                      y={node.labelY - ((node.label.length - 1) * LABEL_LEAD) / 2 + 4}
                      textAnchor={node.labelAnchor}
                      onMouseEnter={() => setHover({ kind: 'node', id: node.id })}
                      onMouseLeave={clearHover}
                      onClick={() => onSelectCompany(node.id)}
                    >
                      {node.label.map((line, i) => (
                        <tspan key={i} x={node.labelX} dy={i === 0 ? 0 : LABEL_LEAD}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  ))}
                </g>
              </svg>

              {tip ? (
                <div
                  className={`sankey__tip${tip.flip ? ' is-flipped' : ''}`}
                  style={{ left: tip.x, top: tip.y }}
                  role="status"
                >
                  <p className="sankey__tip-title">{tip.title}</p>
                  <p className="sankey__tip-body">{tip.body}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="sankey__stage sankey__stage--empty" style={{ height: plotHeight }} />
          )}
        </div>
      </div>

      <p className="sankey__foot">
        Logistics links are shown on the Globe view.
        {layout && layout.sameTierCount > 0
          ? ` ${layout.sameTierCount} supply links run between companies in the same stage — they sit inside a single column and cannot be drawn as a ribbon, so open a company to see them.`
          : ''}{' '}
        Every ribbon carries the same weight: the dataset records which relationships exist, not how much
        moves along them.
      </p>
    </div>
  );
}
