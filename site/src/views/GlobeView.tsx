import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import type { Material } from 'three';
import type { Company, Edge, Tier } from '../data/types';
import type { ViewProps } from './viewProps';
import { TIER_COLOR, TIER_LABEL, TIER_ORDER, tierIndex } from '../data/tiers';
import countriesUrl from '../assets/countries-110m.geo.json?url';
import './GlobeView.css';

/**
 * GLOBE VIEW — the chain plotted on a rotating globe.
 *
 * `react-globe.gl` (and with it all of three.js) is pulled in through
 * React.lazy, so the ~1 MB WebGL stack only downloads when this tab is opened.
 * Everything WebGL-facing takes its colour from TIER_COLOR rather than the CSS
 * custom properties — a shader cannot read `var(--tier-fabs)`.
 *
 * The base map is drawn, not photographed: no satellite imagery, no terrain.
 * A flat-coloured sphere is the ocean and Natural Earth's 110m country
 * polygons are laid on top as vector land with hairline borders — the same
 * paper-and-ink register as the rest of the page, and nothing to pinch or
 * blur at the poles. The tier-coloured arcs and points are the only saturated
 * things on screen.
 *
 * Layers, bottom to top:
 *   globe     flat ocean-coloured sphere (no texture), soft atmosphere
 *   polygons  177 country caps + hairline strokes, from the bundled GeoJSON
 *             in src/assets (Natural Earth 110m via world-atlas, ~185 kB,
 *             emitted as an asset and fetched from our own origin)
 *   arcs      one per supply edge, cluster → cluster, source → target gradient
 *   objects   one flat disc per node — the atlas dots, see below
 *   rings     pulse on the selected company's nodes
 *
 * What is drawn is *not* the raw site list: sites are grouped into nodes by a
 * zoom-aware clustering pass (see "clustering" below), so the map shows one
 * dot per country-scale group when it is far away and individual sites once
 * you are close enough to tell them apart.
 */

const Globe = lazy(() => import('react-globe.gl'));

/** Where the density is: Taiwan / Japan / Korea / coastal China. */
const HOME_POV = { lat: 24, lng: 122, altitude: 2.1 } as const;
const FOCUS_ALTITUDE = 1.5;

/* ---- camera range --------------------------------------------------------
   globe.gl works in globe radii: the sphere has radius 100 and `altitude` is
   how many radii the camera sits above the surface, so a camera distance of
   100 * (1 + altitude). globe.gl's own floor is a hair above the surface
   (~0.0006) — the practical floor here is set by the marker shelf, which
   lives at ~0.013 radii, plus room to look at it. MIN_ALTITUDE puts roughly
   180 km across the viewport, enough to walk around Hsinchu.               */

/** three.js PerspectiveCamera default, and globe.gl never changes it. */
const CAMERA_FOV = 50;
const MIN_ALTITUDE = 0.03;
const MAX_ALTITUDE = 6;
const GLOBE_RADIUS = 100;

/* ---- base map palette ----------------------------------------------------
   Deliberately quiet and close in value: warm cream land on a cool, pale
   ocean, with borders only a step darker than the land they divide. Read as
   a printed reference map, so the tier colours on top stay the only accents.
   These sit next to --paper #faf8f4 / --line #e4dfd5 from tokens.css but are
   hardcoded — WebGL cannot resolve CSS custom properties.                  */

const OCEAN = '#dde6ed'; /* pale desaturated blue-grey */
const LAND = '#f3efe6'; /* warm light cream, a touch above the paper */
const BORDER = 'rgba(140, 131, 116, 0.85)'; /* warm grey hairline */
const LAND_EDGE = 'rgba(163, 154, 138, 0.5)'; /* the 0.004 lip around each cap */
const ATMOSPHERE = '#a8c2dd';

/** Land floats a hair above the sphere so the two never z-fight. */
const LAND_ALTITUDE = 0.004;

/* ---- site markers --------------------------------------------------------
   Atlas dots: every node is a flat circle lying on the map, exactly the way a
   printed reference map marks a city. They have no extruded height at all, so
   they read as clean circles from any camera angle instead of the tilted 3D
   pills that a cylinder gives you at a grazing view.

   An HQ gets a paper-toned halo under its dot — a slightly wider disc showing
   as a ring — so the colour separates from the arcs and country borders it
   lands on. A facility is a smaller plain dot, no halo. A cluster is a larger
   haloed dot carrying the number of sites it stands for, printed into the
   disc's own texture so the count lies flat on the map like a place name.   */

/** Radii at the home view, in degrees of arc on the sphere. */
const HQ_DOT_DEG = 0.42;
const FACILITY_DOT_DEG = 0.26;
/** How far the halo extends past the dot it sits under. */
const HALO_RING_DEG = 0.14;
/** The selected company's dots grow by this much. */
const SELECTED_DOT_SCALE = 1.5;

/** --paper, a step lighter than LAND, so the halo reads over land and sea alike. */
const HALO_COLOR = '#faf8f4';

/* Altitudes in globe radii. Land caps sit at LAND_ALTITUDE; each marker layer
   gets its own shelf clear of them and of each other. The discs additionally
   render with depthWrite off and an explicit paint order (below), so where two
   of them do overlap the winner is fixed rather than decided by the depth
   buffer — no flicker as the camera moves. */
const HALO_ALTITUDE = 0.009;
const DOT_ALTITUDE = 0.0105;
const RING_ALTITUDE = 0.0135;

/** Paint order: every halo before every dot, then one slot per disc. */
const HALO_ORDER = 10;
const DOT_ORDER = 1000;
/** Clear of any per-disc slot, so the selected company always paints on top. */
const SELECTED_ORDER = 500;

const DEG = Math.PI / 180;
/** three-globe draws on a fixed radius-100 sphere; one degree of arc is this many units. */
const UNITS_PER_DEG = (2 * Math.PI * GLOBE_RADIUS) / 360;

/* ---- clustering ----------------------------------------------------------
   Ten headquarters share the south bay, Hsinchu's science park holds a dozen
   more, and from orbit the whole of Taiwan is narrower than a fingernail.
   Drawn as authored they land on the same pixel — and worse, an arc drawn to
   whichever one won the pixel fight looks like it lands in the wrong country.

   So nothing is drawn per site. Sites are grouped by angular distance and one
   node is drawn per group, and the grouping radius is a fixed fraction of how
   much of the sphere the camera can currently see. Zoom out and the radius
   grows in degrees, so groups merge; zoom in and it shrinks, so they split.
   Every size on the map is expressed the same way — as a fraction of the
   visible cap — which is what keeps a dot the same size in pixels no matter
   how close you get, and what makes "one dot for Taiwan" and "one dot per
   fab" the same rule at two altitudes.

   Two extra rules keep it honest:

   * Groups never cross a national border. Taipei and Fuzhou are 340 km apart
     and would happily merge at low zoom, which is exactly the confusion this
     is meant to remove.
   * A group that no amount of further zoom could split — every member inside
     the grouping radius at MIN_ALTITUDE, i.e. sites the data places in the
     same spot — is not drawn as a cluster. It is dealt onto a rosette of
     individual dots around its centroid instead, because a "5" the reader can
     never open is worse than five dots nudged a few kilometres apart. Once
     the camera is close enough that those sites are already further apart on
     screen than the rosette would place them, even the rosette is dropped
     and they are drawn where they actually are.                            */

/** Grouping radius, as a fraction of the visible cap's angular radius. */
const CLUSTER_FRAC = 0.075;
/** Cluster dot radius as a fraction of the cap: 2 sites → 1.9%, 30+ → 3.3%. */
const CLUSTER_DOT_BASE = 0.012;
const CLUSTER_DOT_PER_OCTAVE = 0.0065;
const CLUSTER_DOT_MAX_FRAC = 0.033;
/** …and never wider than this in degrees, so the far view stays a map. */
const CLUSTER_DOT_MAX_DEG = HQ_DOT_DEG * 6;

/** Centre-to-centre gap between neighbouring dots in a rosette, at the home view. */
const FAN_SPACING_DEG = 1.15;
/** No dot is ever thrown further than this from its true position, at the home view. */
const FAN_MAX_DEG = 1.9;

/** Share of the half-view an opened cluster should fill once the camera lands. */
const OPENED_FRAME_FRAC = 0.55;

/* Arcs and the selection pulse are measured in degrees of arc too, so they
   scale with the camera alongside the dots — left fixed, a 0.22° tube is a
   hairline over the Pacific and a motorway over Hsinchu. */
const ARC_STROKE_DEG = 0.22;
const ARC_STROKE_LIT_DEG = 0.5;
const RING_MAX_DEG = 3.2;
const RING_SPEED_DEG = 1.6;

/* ---- how often any of this is recomputed ---------------------------------
   The altitude changes on every frame of a wheel spin, and nothing on the map
   needs to keep up with that. Three brakes, coarsest first:

   LAYOUT_STEP  which sites group with which, and where a rosette deals them.
                Changing this rebuilds the arc layer, whose curves are the
                expensive geometry on screen, so it moves in ~26% steps — a
                dozen or so re-clusters across the whole range of the camera.
   SIZE_STEP    dot and halo radii. Cheap (a few hundred 48-gons), and a 12%
                step is under the threshold where the change is visible as a
                pop rather than as smooth growth.
   ZOOM_STEP    how much the altitude must move before React hears about it at
                all; fine enough that the two grids above are never overshot. */

const LAYOUT_STEP = 2 ** (1 / 3); /* ≈ 1.26 */
const SIZE_STEP = 1.12;
const ZOOM_STEP = 1.05;

/** Snap an altitude onto a geometric grid, so equal zooms give equal levels. */
function quantize(altitude: number, step: number): number {
  const snapped = step ** Math.round(Math.log(altitude) / Math.log(step));
  return Math.min(MAX_ALTITUDE, Math.max(MIN_ALTITUDE, snapped));
}

/**
 * Angular radius, in degrees, of the sphere cap the camera can see from
 * `altitude` globe radii up.
 *
 * Close in, the vertical field of view is the limit and the cap is tiny;
 * past ~0.13 radii the horizon takes over and the cap stops growing. This is
 * the yardstick every on-map size is a fraction of, which is why it is worth
 * getting right rather than approximating with the altitude itself.
 */
function visibleCapDeg(altitude: number): number {
  const d = 1 + Math.max(altitude, 1e-4);
  const half = (CAMERA_FOV / 2) * DEG;
  const reach = d * Math.sin(half);
  // Horizon-limited once the frustum is wider than the sphere's silhouette.
  return reach >= 1 ? Math.acos(1 / d) / DEG : (Math.asin(reach) - half) / DEG;
}

/** The cap at the opening view — the reference every fraction is calibrated to. */
const HOME_CAP_DEG = visibleCapDeg(HOME_POV.altitude);
/** The tightest grouping the camera can ever reach; the "same place" test. */
const LEAF_CLUSTER_DEG = visibleCapDeg(MIN_ALTITUDE) * CLUSTER_FRAC;

/** Every drawn size, resolved for one camera altitude. */
interface ZoomMetrics {
  altitude: number;
  /** Angular radius of the visible cap, degrees. */
  cap: number;
  /** What to multiply a home-view size in degrees by to hold its size in pixels. */
  scale: number;
  /** Sites within this many degrees of a group's seed join it. */
  cluster: number;
  hqDot: number;
  facilityDot: number;
  halo: number;
  fanSpacing: number;
  fanMax: number;
}

function metricsAt(altitude: number): ZoomMetrics {
  const cap = visibleCapDeg(altitude);
  // Everything on the map is a fixed share of the cap, so it holds its size in
  // pixels rather than in kilometres. Clamped at 1 so pulling back past the
  // opening shot does not inflate the map beyond how it was authored.
  const scale = Math.min(1, cap / HOME_CAP_DEG);
  return {
    altitude,
    cap,
    scale,
    cluster: cap * CLUSTER_FRAC,
    hqDot: HQ_DOT_DEG * scale,
    facilityDot: FACILITY_DOT_DEG * scale,
    halo: HALO_RING_DEG * scale,
    fanSpacing: FAN_SPACING_DEG * scale,
    fanMax: FAN_MAX_DEG * scale,
  };
}

/**
 * Antarctica ships as two features, tagged by `properties.role`.
 *
 * world-atlas clips the ice sheet at ~85.6°S, which would leave a hole at the
 * pole, so the `fill` feature carries its boundary down the antimeridian to
 * 90°S and closes along it — correct cap, but stroking it would draw a stray
 * line from the Ross Sea to the pole. The `stroke` feature is the true coast
 * traced out and back: zero area, so it contributes only the outline.
 */
const landColor = (obj: object) => ((obj as CountryFeature).properties.role === 'stroke' ? 'rgba(0,0,0,0)' : LAND);
const landEdgeColor = (obj: object) => ((obj as CountryFeature).properties.role ? 'rgba(0,0,0,0)' : LAND_EDGE);
const borderColor = (obj: object) => ((obj as CountryFeature).properties.role === 'fill' ? false : BORDER);

/** Only the drawn layers answer the pointer; the base map is scenery. */
const pointerEventsFilter = (obj: object) =>
  (obj as { __globeObjType?: string }).__globeObjType !== 'polygon';

/** One country from the bundled Natural Earth extract. */
interface CountryFeature {
  type: 'Feature';
  properties: { name: string; role?: 'fill' | 'stroke' };
  geometry: object;
}

/**
 * The async pieces of the base map, revealed together — plus the three module
 * itself, which the marker layer needs synchronously to build its discs.
 */
interface BaseMap {
  material: Material;
  countries: CountryFeature[];
  three: typeof import('three');
}

type SiteKind = 'hq' | 'facility';

interface SitePoint {
  id: string;
  companyId: string;
  companyName: string;
  tier: Tier;
  kind: SiteKind;
  lat: number;
  lng: number;
  color: string;
  /** Tooltip heading — company name, or facility name for a facility. */
  title: string;
  /** Tooltip second line — the company role, or the facility note. */
  detail: string;
  city: string;
  country: string;
  place: string;
  bottleneck: boolean;
}

/** One drawn marker: a single site, or a group of them standing under one dot. */
interface GlobeNode {
  /** Stable across re-clusters at the same altitude. */
  key: string;
  cluster: boolean;
  /** Drawn position — a centroid for clusters, a rosette slot for fanned sites. */
  lat: number;
  lng: number;
  /** Every site under this node. Length 1 unless `cluster`. */
  members: SitePoint[];
  /** The one site, when this is not a cluster. */
  site: SitePoint | null;
  tier: Tier;
  color: string;
  /** Companies represented here — drives selection highlighting. */
  companyIds: Set<string>;
}

/** One flat disc on the map: a node's coloured dot, or the halo beneath it. */
interface SiteDisc {
  node: GlobeNode;
  lat: number;
  lng: number;
  altitude: number;
  /** Degrees of arc. */
  radius: number;
  hex: string;
  alpha: number;
  /** three.js renderOrder — see the altitude note above. */
  order: number;
  /** Printed into the disc when > 0. */
  count: number;
}

/** One drawn arc. Several supply edges collapse into one when their ends do. */
interface SupplyArc {
  key: string;
  sourceTier: Tier;
  targetTier: Tier;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  label: string;
  /** Every company at either end — `touches` tests membership. */
  endpoints: Set<string>;
  /** Where a click sends the reader. */
  target: string;
  edges: number;
}

/** `#rrggbb` → `rgba(r, g, b, a)`. globe.gl parses colour strings, not THREE.Color. */
function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPoints(companies: Company[]): SitePoint[] {
  const points: SitePoint[] = [];

  for (const company of companies) {
    const color = TIER_COLOR[company.tier];

    points.push({
      id: `hq:${company.id}`,
      companyId: company.id,
      companyName: company.name,
      tier: company.tier,
      kind: 'hq',
      lat: company.hq.lat,
      lng: company.hq.lng,
      color,
      title: company.name,
      detail: company.role,
      city: company.hq.city,
      country: company.hq.country,
      place: `${company.hq.city}, ${company.hq.country}`,
      bottleneck: company.bottleneck,
    });

    company.facilities.forEach((facility, i) => {
      points.push({
        id: `fac:${company.id}:${i}`,
        companyId: company.id,
        companyName: company.name,
        tier: company.tier,
        kind: 'facility',
        lat: facility.lat,
        lng: facility.lng,
        color,
        title: facility.name,
        detail: facility.note ?? company.role,
        city: facility.city,
        country: facility.country,
        place: `${facility.city}, ${facility.country}`,
        bottleneck: company.bottleneck,
      });
    });
  }

  return points;
}

/** Shortest signed distance from `b` to `a` in degrees of longitude. */
function lngDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/** A degree of longitude is shorter than a degree of latitude away from the equator. */
function lngScale(lat: number): number {
  return Math.max(0.15, Math.cos(lat * DEG));
}

interface SiteGroup {
  /** The first member in id order; the group is measured from here, not from a
      drifting centroid, so the result cannot chain across a continent. */
  seed: SitePoint;
  members: SitePoint[];
}

/**
 * Greedy angular grouping: walk the sites in id order, drop each into the
 * first open group whose seed is within `radiusDeg` and in the same country,
 * else open a new one.
 *
 * O(n · groups), which for a dataset this size (a couple of hundred sites) is
 * a few tens of microseconds — no spatial index earns its complexity here,
 * and the sort makes the layout identical on every render and every reload.
 */
function groupSites(points: SitePoint[], radiusDeg: number): SiteGroup[] {
  const seeded = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const groups: SiteGroup[] = [];
  const r2 = radiusDeg * radiusDeg;

  for (const point of seeded) {
    const home = groups.find((group) => {
      if (group.seed.country !== point.country) return false;
      const dLat = group.seed.lat - point.lat;
      const dLng = lngDelta(group.seed.lng, point.lng) * lngScale(group.seed.lat);
      return dLat * dLat + dLng * dLng <= r2;
    });
    if (home) home.members.push(point);
    else groups.push({ seed: point, members: [point] });
  }

  return groups;
}

/** Mean position of a group, measured against the seed so the antimeridian is a non-event. */
function centroid(group: SiteGroup): { lat: number; lng: number } {
  const n = group.members.length;
  return {
    lat: group.members.reduce((sum, m) => sum + m.lat, 0) / n,
    lng: group.seed.lng + group.members.reduce((sum, m) => sum + lngDelta(m.lng, group.seed.lng), 0) / n,
  };
}

/**
 * Polar offsets for the `n` sites of one rosette: concentric rings holding 6,
 * 12, 18… dots, which is roughly how circles pack, with alternate rings
 * staggered by half a step so the outer dots sit in the inner gaps.
 *
 * Ring one contracts for small rosettes — a pair ends up one spacing apart
 * rather than two — and the whole thing is squeezed if its outermost ring
 * would otherwise reach past `maxRadius`.
 */
function fanSlots(n: number, spacing: number, maxRadius: number): { r: number; a: number }[] {
  const perRing: number[] = [];
  for (let left = n, ring = 1; left > 0; ring++) {
    const take = Math.min(left, 6 * ring);
    perRing.push(take);
    left -= take;
  }

  const slots: { r: number; a: number }[] = [];
  perRing.forEach((count, i) => {
    const r =
      i === 0
        ? Math.min(spacing, spacing / (2 * Math.sin(Math.PI / Math.max(count, 2))))
        : spacing * (i + 1);
    const offset = (i % 2) * (Math.PI / count);
    for (let j = 0; j < count; j++) slots.push({ r, a: offset + (j / count) * 2 * Math.PI });
  });

  const outermost = slots[slots.length - 1].r;
  if (outermost > maxRadius) {
    const squeeze = maxRadius / outermost;
    for (const slot of slots) slot.r *= squeeze;
  }

  return slots;
}

/**
 * Rosette seating order: headquarters first, then facilities, then by id.
 *
 * Slots come out innermost-first, so this keeps the haloed HQ dots — the ones
 * the arcs attach to — nearest their true position, and pushes the smaller
 * facility dots to the outer ring. Reads as a hierarchy, and is stable.
 */
function fanOrder(p: SitePoint): string {
  return `${p.kind === 'hq' ? 0 : 1}|${p.companyId}|${p.id}`;
}

function soloNode(site: SitePoint, lat = site.lat, lng = site.lng): GlobeNode {
  return {
    key: site.id,
    cluster: false,
    lat,
    lng,
    members: [site],
    site,
    tier: site.tier,
    color: site.color,
    companyIds: new Set([site.companyId]),
  };
}

/** The tier the most sites in a group belong to; ties go to the earlier stage. */
function dominantTier(members: SitePoint[]): Tier {
  const counts = new Map<Tier, number>();
  for (const m of members) counts.set(m.tier, (counts.get(m.tier) ?? 0) + 1);
  let best = members[0].tier;
  for (const [tier, count] of counts) {
    const bestCount = counts.get(best) ?? 0;
    if (count > bestCount || (count === bestCount && tierIndex(tier) < tierIndex(best))) best = tier;
  }
  return best;
}

/**
 * Turn the visible sites into the nodes actually drawn at this altitude.
 *
 * Pure and cheap enough to run speculatively — the fly-to-selection code
 * calls it a couple of dozen times to find the altitude at which a company
 * stops hiding inside a cluster.
 */
function buildNodes(points: SitePoint[], m: ZoomMetrics): GlobeNode[] {
  const nodes: GlobeNode[] = [];

  for (const group of groupSites(points, m.cluster)) {
    const n = group.members.length;
    if (n === 1) {
      nodes.push(soloNode(group.members[0]));
      continue;
    }

    // Would zooming all the way in ever break this apart? If not, it is one
    // real place wearing several names — fan it out instead of counting it.
    if (m.cluster <= LEAF_CLUSTER_DEG || groupSites(group.members, LEAF_CLUSTER_DEG).length === 1) {
      const { lat, lng } = centroid(group);

      // …unless the camera is already close enough that the sites are further
      // apart on the map than the rosette would put them. Dealing them out
      // then would compress real geography instead of revealing it.
      const scale0 = lngScale(lat);
      const spread = group.members.reduce(
        (max, s) => Math.max(max, Math.hypot(s.lat - lat, lngDelta(s.lng, lng) * scale0)),
        0,
      );
      if (spread >= m.fanMax) {
        for (const member of group.members) nodes.push(soloNode(member));
        continue;
      }

      const slots = fanSlots(n, m.fanSpacing, m.fanMax);
      const scale = lngScale(lat);
      [...group.members]
        .sort((a, b) => fanOrder(a).localeCompare(fanOrder(b)))
        .forEach((member, i) => {
          const { r, a } = slots[i];
          nodes.push(
            soloNode(
              member,
              Math.max(-89, Math.min(89, lat + r * Math.sin(a))),
              lng + (r * Math.cos(a)) / scale,
            ),
          );
        });
      continue;
    }

    const { lat, lng } = centroid(group);
    const tier = dominantTier(group.members);
    nodes.push({
      key: `cl:${group.seed.id}`,
      cluster: true,
      lat,
      lng,
      members: group.members,
      site: null,
      tier,
      color: TIER_COLOR[tier],
      companyIds: new Set(group.members.map((s) => s.companyId)),
    });
  }

  return nodes;
}

/** Cluster dots grow with the log of their count, then stop. */
function clusterDotDeg(count: number, cap: number): number {
  const frac = Math.min(CLUSTER_DOT_MAX_FRAC, CLUSTER_DOT_BASE + CLUSTER_DOT_PER_OCTAVE * Math.log2(count));
  return Math.min(CLUSTER_DOT_MAX_DEG, cap * frac);
}

/** How a node names itself inside an arc label. */
function nodeTitle(node: GlobeNode): string {
  if (!node.cluster) return node.site?.companyName ?? node.site?.title ?? '';
  return `${node.members.length} sites in ${node.members[0].country}`;
}

/** Up to `limit` distinct city names in a group, oldest-first, then "+n more". */
function citySummary(members: SitePoint[], limit = 3): string {
  const cities: string[] = [];
  for (const m of members) if (m.city && !cities.includes(m.city)) cities.push(m.city);
  if (cities.length <= limit) return cities.join(' · ');
  return `${cities.slice(0, limit).join(' · ')} +${cities.length - limit} more`;
}

export function GlobeView({ companies, edges, selectedId, onSelectCompany }: ViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [hiddenTiers, setHiddenTiers] = useState<ReadonlySet<Tier>>(() => new Set<Tier>());
  const [hqOnly, setHqOnly] = useState(false);
  const [altitude, setAltitude] = useState<number>(HOME_POV.altitude);
  const [baseMap, setBaseMap] = useState<BaseMap | null>(null);

  /* ---- base map ----------------------------------------------------------
     The ocean is the globe's own material, so it has to be built from three —
     imported dynamically to keep the WebGL stack out of the entry bundle, the
     same way the Globe component is. The countries file is an emitted asset
     fetched from our own origin, not a CDN. Both land together so the sphere
     never flashes as a bare black ball before the map arrives.             */

  useEffect(() => {
    let alive = true;

    const loadCountries = fetch(countriesUrl)
      .then((res) => res.json() as Promise<{ features: CountryFeature[] }>)
      .then((collection) => collection.features)
      // A missing base map is a cosmetic loss, not a reason to withhold the data.
      .catch(() => [] as CountryFeature[]);

    void Promise.all([import('three'), loadCountries]).then(([three, countries]) => {
      if (!alive) return;
      setBaseMap({
        material: new three.MeshLambertMaterial({ color: OCEAN }),
        countries,
        three,
      });
    });

    return () => {
      alive = false;
    };
  }, []);

  /* ---- data -------------------------------------------------------------- */

  const hqByCompany = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const allPoints = useMemo(() => buildPoints(companies), [companies]);

  /** Tiers present in the data, in chain order, with a site count each. */
  const legend = useMemo(() => {
    const counts = new Map<Tier, number>();
    for (const point of allPoints) counts.set(point.tier, (counts.get(point.tier) ?? 0) + 1);
    return TIER_ORDER.filter((t) => counts.has(t)).map((tier) => ({ tier, count: counts.get(tier) ?? 0 }));
  }, [allPoints]);

  const points = useMemo(
    () =>
      allPoints.filter((p) => !hiddenTiers.has(p.tier) && (!hqOnly || p.kind === 'hq')),
    [allPoints, hiddenTiers, hqOnly],
  );

  const visibleEdges = useMemo<Edge[]>(
    () =>
      hiddenTiers.size === 0
        ? edges
        : edges.filter((e) => !hiddenTiers.has(e.sourceTier) && !hiddenTiers.has(e.targetTier)),
    [edges, hiddenTiers],
  );

  /* ---- the drawn map, per altitude ---------------------------------------
     Two grids, so the cheap thing can follow the camera more closely than the
     expensive one: `layout` decides what groups with what and where each dot
     lands, `sizes` decides how wide the dots are drawn. Both are memoised on
     a quantised altitude, so scrolling past a hundred intermediate values
     recomputes each of them only a handful of times.                       */

  // Quantised to numbers first: a number dep is what lets the metrics — and
  // everything memoised on them — survive an altitude change untouched.
  const layoutAltitude = quantize(altitude, LAYOUT_STEP);
  const sizeAltitude = quantize(altitude, SIZE_STEP);

  const layout = useMemo(() => metricsAt(layoutAltitude), [layoutAltitude]);
  const sizes = useMemo(() => metricsAt(sizeAltitude), [sizeAltitude]);
  const nodes = useMemo(() => buildNodes(points, layout), [points, layout]);

  /** Where each company's HQ actually got drawn — its own dot, or the cluster over it. */
  const nodeByHq = useMemo(() => {
    const placed = new Map<string, GlobeNode>();
    for (const node of nodes) {
      for (const member of node.members) if (member.kind === 'hq') placed.set(member.companyId, node);
    }
    return placed;
  }, [nodes]);

  /**
   * Arcs run node to node, not city to city, so an arc never appears to leave
   * a place that is not on the map. Two edges whose ends land on the same pair
   * of nodes are one drawn arc; an edge whose ends land on the *same* node has
   * collapsed into a cluster and is not drawn at all.
   */
  const arcs = useMemo<SupplyArc[]>(() => {
    const merged = new Map<string, SupplyArc>();

    for (const edge of visibleEdges) {
      const from = nodeByHq.get(edge.source);
      const to = nodeByHq.get(edge.target);
      if (!from || !to || from === to) continue;

      const key = `${from.key}>${to.key}`;
      const existing = merged.get(key);
      if (existing) {
        existing.edges += 1;
        existing.endpoints.add(edge.source);
        existing.endpoints.add(edge.target);
        continue;
      }

      const source = hqByCompany.get(edge.source);
      const target = hqByCompany.get(edge.target);
      if (!source || !target) continue;

      merged.set(key, {
        key,
        sourceTier: from.cluster ? from.tier : edge.sourceTier,
        targetTier: to.cluster ? to.tier : edge.targetTier,
        startLat: from.lat,
        startLng: from.lng,
        endLat: to.lat,
        endLng: to.lng,
        label: `${source.name} → ${target.name}${edge.what ? ` · ${edge.what}` : ''}`,
        endpoints: new Set([edge.source, edge.target]),
        target: edge.target,
        edges: 1,
      });
    }

    // A merged arc cannot keep one edge's caption; name its two ends instead.
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    for (const arc of merged.values()) {
      if (arc.edges === 1) continue;
      const [fromKey, toKey] = arc.key.split('>');
      const from = byKey.get(fromKey);
      const to = byKey.get(toKey);
      arc.label = `${arc.edges} supply links${from && to ? ` · ${nodeTitle(from)} → ${nodeTitle(to)}` : ''}`;
    }

    return [...merged.values()];
  }, [visibleEdges, nodeByHq, hqByCompany, nodes]);

  const rings = useMemo(
    () => (selectedId ? nodes.filter((n) => n.companyIds.has(selectedId)) : []),
    [nodes, selectedId],
  );

  /**
   * The drawn discs: a halo then a dot for each HQ and each cluster, a plain
   * dot for each facility. Rebuilt whenever the zoom, the selection or a
   * filter changes, which is what repaints the layer — the objects layer reads
   * appearance at creation.
   */
  const discs = useMemo<SiteDisc[]>(() => {
    const out: SiteDisc[] = [];

    nodes.forEach((node, i) => {
      const haloed = node.cluster || node.site?.kind === 'hq';
      const chosen = selectedId != null && node.companyIds.has(selectedId);
      const scale = chosen ? SELECTED_DOT_SCALE : 1;
      const radius =
        (node.cluster
          ? clusterDotDeg(node.members.length, sizes.cap)
          : node.site?.kind === 'hq'
            ? sizes.hqDot
            : sizes.facilityDot) * scale;
      const alpha =
        selectedId == null ? (haloed ? 0.94 : 0.78) : chosen ? 1 : haloed ? 0.4 : 0.28;
      const slot = i + (chosen ? SELECTED_ORDER : 0);

      if (haloed) {
        out.push({
          node,
          lat: node.lat,
          lng: node.lng,
          altitude: HALO_ALTITUDE,
          radius: radius + sizes.halo * scale,
          hex: HALO_COLOR,
          // The halo fades with its dot, or a dimmed company would keep a
          // bright white ring and read as the loud one.
          alpha: alpha * 0.92,
          order: HALO_ORDER + slot,
          count: 0,
        });
      }

      out.push({
        node,
        lat: node.lat,
        lng: node.lng,
        altitude: DOT_ALTITUDE,
        radius,
        hex: node.color,
        alpha,
        order: DOT_ORDER + slot,
        count: node.cluster ? node.members.length : 0,
      });
    });

    return out;
  }, [nodes, selectedId, sizes]);

  /* ---- sizing ------------------------------------------------------------ */

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setSize((prev) => {
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        return prev.width === width && prev.height === height ? prev : { width, height };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  /* ---- camera & auto-rotation -------------------------------------------- */

  const handleReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;

    globe.pointOfView(HOME_POV, 0);

    const controls = globe.controls();
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.autoRotateSpeed = 0.3;
    controls.minDistance = GLOBE_RADIUS * (1 + MIN_ALTITUDE);
    controls.maxDistance = GLOBE_RADIUS * (1 + MAX_ALTITUDE);
    // There is a lot more range to travel now; a slightly longer stride keeps
    // the wheel from becoming a chore between orbit and street level.
    controls.zoomSpeed = 1.25;
    controls.addEventListener('start', () => setInteracted(true));

    // Crisp over cheap: antialiasing is on by globe.gl's default, and the
    // pixel ratio is pinned here rather than left to it — the vector base map
    // lives or dies on clean 1px border strokes.
    globe.renderer().setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    // Light it like a diagram, not a planet. globe.gl's default puts a fixed
    // directional light over the north pole, which leaves a hard terminator
    // and a dim southern half. Here the key light rides the camera instead, so
    // the falloff is always radial — brightest under the cursor, a touch
    // deeper towards the limb — which reads as a sphere from every angle with
    // no day/night line anywhere. Under three's physical lighting a Lambert
    // surface reflects intensity/π; ambient 2.55 + key 0.62 puts the centre at
    // ~1.0, i.e. the map colours come out as authored.
    // `three` already lives in this lazily-loaded chunk, so the import is free.
    void import('three').then(({ AmbientLight, DirectionalLight }) => {
      if (globeRef.current !== globe) return;
      const camera = globe.camera();
      const key = new DirectionalLight(0xffffff, 0.62);
      const followCamera = () => key.position.copy(camera.position);
      followCamera();
      controls.addEventListener('change', followCamera);
      globe.lights([new AmbientLight(0xffffff, 2.55), key]);
    });

    setReady(true);
  }, []);

  /* ---- following the zoom ------------------------------------------------
     Every marker on the map is sized and grouped from the camera altitude, so
     the altitude has to reach React — but not on every frame of a wheel spin.
     Two brakes: one read per animation frame at most, and a new state only
     once the altitude has moved by ZOOM_STEP, which is well below the point
     where a re-cluster is visible but far above the per-frame churn.       */

  useEffect(() => {
    const globe = ready ? globeRef.current : undefined;
    if (!globe) return;

    const controls = globe.controls();
    let frame = 0;

    const read = () => {
      frame = 0;
      const next = globe.pointOfView().altitude;
      if (!Number.isFinite(next)) return;
      setAltitude((prev) => (Math.max(next / prev, prev / next) >= ZOOM_STEP ? next : prev));
    };

    const onChange = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    controls.addEventListener('change', onChange);
    read();

    return () => {
      controls.removeEventListener('change', onChange);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ready]);

  // Spin slowly until the reader takes over, then leave the camera alone.
  useEffect(() => {
    const controls = ready ? globeRef.current?.controls() : undefined;
    if (controls) controls.autoRotate = !interacted && !selectedId;
  }, [ready, interacted, selectedId]);

  /* Read by the fly-to effect below, which must not re-fire when a filter
     changes — only when the selection does. */
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Fly to whatever the app selected — including selections made elsewhere.
  // Deep enough that the company is its own dot rather than a number inside a
  // cluster, and onto the dot's drawn position rather than the raw city.
  useEffect(() => {
    if (!ready || !selectedId) return;
    const company = hqByCompany.get(selectedId);
    if (!company) return;

    const list = pointsRef.current;
    const hqId = `hq:${selectedId}`;
    let alt = FOCUS_ALTITUDE;
    let lat = company.hq.lat;
    let lng = company.hq.lng;

    if (list.some((p) => p.id === hqId)) {
      for (let i = 0; i < 24; i++) {
        const found = buildNodes(list, metricsAt(alt)).find((n) => !n.cluster && n.site?.id === hqId);
        if (found) {
          lat = found.lat;
          lng = found.lng;
          break;
        }
        if (alt <= MIN_ALTITUDE) break;
        alt = Math.max(MIN_ALTITUDE, alt * 0.75);
      }
    }

    globeRef.current?.pointOfView({ lat, lng, altitude: alt }, 900);
  }, [ready, selectedId, hqByCompany]);

  /* ---- accessors --------------------------------------------------------- */

  /**
   * One flat circle, tangent to the sphere. The objects layer positions and
   * orients it — a CircleGeometry faces straight out with its local up
   * pointing north, with no rotation of our own — so all this has to settle is
   * size, colour, paint order and, for a cluster, the number printed on it.
   *
   * The count goes into the disc's own canvas texture rather than onto a
   * billboarded sprite: it then lies flat on the map and foreshortens with it,
   * the way a place name on paper does, and it cannot be clipped by the sphere
   * near the limb.
   *
   * Geometry and material are per-disc rather than shared: three-globe
   * disposes both — and the material's texture with them — when an object
   * leaves the layer, which would pull the rug from under any cached copy. A
   * few hundred 48-gons is nothing, and three caches the shader program across
   * identical materials anyway.
   */
  const discObject = useMemo(() => {
    if (!baseMap) return undefined;
    const { CanvasTexture, CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace } =
      baseMap.three;

    return (obj: object) => {
      const disc = obj as SiteDisc;
      const material = new MeshBasicMaterial({
        color: disc.count > 0 ? '#ffffff' : disc.hex,
        transparent: true,
        opacity: disc.alpha,
        side: DoubleSide,
        depthWrite: false,
      });

      if (disc.count > 0) {
        const texture = new CanvasTexture(countCanvas(disc.count, disc.hex));
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        material.map = texture;
      }

      const mesh = new Mesh(new CircleGeometry(1, 48), material);
      mesh.scale.setScalar(disc.radius * UNITS_PER_DEG);
      mesh.renderOrder = disc.order;
      return mesh;
    };
  }, [baseMap]);

  const discLabel = useCallback((obj: object) => {
    const node = (obj as SiteDisc).node;

    if (node.cluster) {
      return `
        <div class="globe-tip" style="--tip-accent:${node.color}">
          <span class="globe-tip__eyebrow">Cluster · ${node.members.length} sites</span>
          <span class="globe-tip__title">${escapeHtml(node.members[0].country)}</span>
          <span class="globe-tip__detail">${escapeHtml(citySummary(node.members))}</span>
          <span class="globe-tip__place">Click to zoom in</span>
        </div>`;
    }

    const p = node.site;
    if (!p) return '';
    const kind = p.kind === 'hq' ? 'Headquarters' : 'Facility';
    return `
      <div class="globe-tip" style="--tip-accent:${p.color}">
        <span class="globe-tip__eyebrow">${escapeHtml(TIER_LABEL[p.tier])} · ${kind}</span>
        <span class="globe-tip__title">${escapeHtml(p.title)}</span>
        ${p.kind === 'facility' ? `<span class="globe-tip__owner">${escapeHtml(p.companyName)}</span>` : ''}
        <span class="globe-tip__detail">${escapeHtml(p.detail)}</span>
        <span class="globe-tip__place">${escapeHtml(p.place)}</span>
        ${p.bottleneck ? '<span class="globe-tip__flag">Sole / dominant supplier</span>' : ''}
      </div>`;
  }, []);

  const arcLabel = useCallback((obj: object) => {
    const a = obj as SupplyArc;
    return `<div class="globe-tip globe-tip--arc"><span class="globe-tip__detail">${escapeHtml(a.label)}</span></div>`;
  }, []);

  const arcColor = useCallback(
    (obj: object) => {
      const a = obj as SupplyArc;
      const touches = selectedId != null && a.endpoints.has(selectedId);
      // A touch heavier than they were over the old satellite texture: the
      // vector base map is pale, so a thin arc needs the extra opacity to
      // hold its own where it crosses land.
      const alpha = selectedId == null ? 0.52 : touches ? 0.92 : 0.09;
      return [rgba(TIER_COLOR[a.sourceTier], alpha), rgba(TIER_COLOR[a.targetTier], alpha)];
    },
    [selectedId],
  );

  // Keyed off the layout grid rather than the finer size grid: changing the
  // stroke rebuilds every arc tube, and that is the one thing worth spending
  // a coarser step on.
  const arcStroke = useCallback(
    (obj: object) => {
      const a = obj as SupplyArc;
      const touches = selectedId != null && a.endpoints.has(selectedId);
      return (touches ? ARC_STROKE_LIT_DEG : ARC_STROKE_DEG) * layout.scale;
    },
    [selectedId, layout],
  );

  /**
   * Clicking a cluster opens it: fly to it, and far enough in that it is no
   * longer one dot.
   *
   * "Far enough" has to satisfy two things at once. The grouping must actually
   * split — asked of the same code that will run when the camera arrives, at
   * successively lower altitudes — and the group must end up filling a decent
   * share of the frame, or a cluster of two neighbouring cities would break
   * apart into two dots a hair either side of the centre and look no different
   * from where it started. The second condition is usually the binding one.
   */
  const openCluster = useCallback((node: GlobeNode, from: number) => {
    const scale = lngScale(node.lat);
    const spread = node.members.reduce((max, m) => {
      const dLat = m.lat - node.lat;
      const dLng = lngDelta(m.lng, node.lng) * scale;
      return Math.max(max, Math.hypot(dLat, dLng));
    }, 0);

    let alt = from;
    for (let i = 0; i < 64 && alt > MIN_ALTITUDE; i++) {
      alt = Math.max(MIN_ALTITUDE, alt * 0.85);
      const m = metricsAt(alt);
      if (m.cap <= spread / OPENED_FRAME_FRAC && groupSites(node.members, m.cluster).length > 1) break;
    }

    globeRef.current?.pointOfView({ lat: node.lat, lng: node.lng, altitude: alt }, 900);
  }, []);

  // Halo and dot both carry their node, so the ring is as clickable as the ink.
  const handleDiscClick = useCallback(
    (obj: object) => {
      setInteracted(true);
      const node = (obj as SiteDisc).node;
      // Read the altitude off the camera rather than off the throttled state:
      // the search below starts from wherever the reader actually is.
      if (node.cluster) {
        openCluster(node, globeRef.current?.pointOfView().altitude ?? HOME_POV.altitude);
      } else if (node.site) {
        onSelectCompany(node.site.companyId);
      }
    },
    [onSelectCompany, openCluster],
  );

  const handleArcClick = useCallback(
    (obj: object) => {
      setInteracted(true);
      onSelectCompany((obj as SupplyArc).target);
    },
    [onSelectCompany],
  );

  const ringColor = useCallback((obj: object) => {
    const node = obj as GlobeNode;
    return (t: number) => rgba(node.color, 1 - t);
  }, []);

  /* ---- legend ------------------------------------------------------------ */

  const toggleTier = useCallback((tier: Tier) => {
    setHiddenTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setHiddenTiers(new Set());
    setHqOnly(false);
  }, []);

  const facilityCount = allPoints.length - companies.length;
  const hqCount = useMemo(() => points.filter((p) => p.kind === 'hq').length, [points]);
  const clusterCount = useMemo(() => nodes.filter((n) => n.cluster).length, [nodes]);
  const filtered = hiddenTiers.size > 0 || hqOnly;

  return (
    <section className="globe" aria-labelledby="globe-heading">
      <header className="globe__head">
        <h2 className="globe__title" id="globe-heading">
          Where the chain actually is
        </h2>
        <p className="globe__standfirst">
          Every headquarters and key facility placed on the planet, with an arc for each supply
          relationship. Nearby sites merge into one numbered dot until you are close enough to tell
          them apart. Drag to rotate, scroll to zoom, click a cluster to open it or a site to open
          its company.
        </p>
        <dl className="globe__stats">
          <div>
            <dt>Sites</dt>
            <dd>{allPoints.length}</dd>
          </div>
          <div>
            <dt>Facilities</dt>
            <dd>{facilityCount}</dd>
          </div>
          <div>
            <dt>Arcs</dt>
            <dd>{visibleEdges.length}</dd>
          </div>
        </dl>
      </header>

      {/* The canvas itself is not reachable by keyboard; the Companies view is the
          accessible route through the same data, so describe rather than trap. */}
      <p className="visually-hidden">
        A 3D globe showing {allPoints.length} sites across {companies.length} companies and{' '}
        {edges.length} supply links. The Companies tab lists the same data as text.
      </p>

      <div className="globe__stage" ref={stageRef}>
        {size.width > 0 && baseMap ? (
          <Suspense fallback={<GlobeLoading />}>
            <Globe
              ref={globeRef}
              width={size.width}
              height={size.height}
              backgroundColor="rgba(0,0,0,0)"
              /* base map — flat ocean sphere, vector land on top */
              globeImageUrl={null}
              globeMaterial={baseMap.material}
              globeCurvatureResolution={3}
              showAtmosphere
              atmosphereColor={ATMOSPHERE}
              atmosphereAltitude={0.18}
              onGlobeReady={handleReady}
              pointerEventsFilter={pointerEventsFilter}
              /* countries */
              polygonsData={baseMap.countries}
              polygonCapColor={landColor}
              polygonSideColor={landEdgeColor}
              polygonStrokeColor={borderColor}
              polygonAltitude={LAND_ALTITUDE}
              polygonCapCurvatureResolution={3}
              polygonsTransitionDuration={0}
              /* sites — flat atlas dots lying on the map */
              objectsData={discs}
              objectLat="lat"
              objectLng="lng"
              objectAltitude="altitude"
              objectThreeObject={discObject}
              objectLabel={discLabel}
              onObjectClick={handleDiscClick}
              /* arcs */
              arcsData={arcs}
              arcStartLat="startLat"
              arcStartLng="startLng"
              arcEndLat="endLat"
              arcEndLng="endLng"
              arcColor={arcColor}
              arcStroke={arcStroke}
              arcAltitudeAutoScale={0.42}
              arcDashLength={0.32}
              arcDashGap={0.7}
              arcDashInitialGap={() => Math.random()}
              arcDashAnimateTime={7000}
              arcCurveResolution={64}
              arcsTransitionDuration={300}
              arcLabel={arcLabel}
              onArcClick={handleArcClick}
              /* selection pulse */
              ringsData={rings}
              ringLat="lat"
              ringLng="lng"
              ringAltitude={RING_ALTITUDE}
              ringColor={ringColor}
              ringMaxRadius={RING_MAX_DEG * layout.scale}
              ringPropagationSpeed={RING_SPEED_DEG * layout.scale}
              ringRepeatPeriod={1100}
            />
          </Suspense>
        ) : (
          <GlobeLoading />
        )}

        <div className="globe__legend">
          <p className="globe__legend-head">
            <span>Tiers</span>
            {filtered ? (
              <button type="button" className="globe__legend-reset" onClick={resetFilters}>
                Show all
              </button>
            ) : null}
          </p>
          <ul>
            {legend.map(({ tier, count }) => {
              const on = !hiddenTiers.has(tier);
              return (
                <li key={tier}>
                  <button
                    type="button"
                    className={`globe__legend-item${on ? '' : ' is-off'}`}
                    style={{ ['--tier-dot' as string]: TIER_COLOR[tier] }}
                    onClick={() => toggleTier(tier)}
                    aria-pressed={on}
                  >
                    <span className="globe__legend-dot" />
                    <span className="globe__legend-label">{TIER_LABEL[tier]}</span>
                    <span className="globe__legend-count">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="globe__legend-filters">
            <button
              type="button"
              className={`globe__legend-item globe__legend-toggle${hqOnly ? ' is-on' : ''}`}
              onClick={() => setHqOnly((v) => !v)}
              aria-pressed={hqOnly}
            >
              <span className="globe__legend-check" aria-hidden="true" />
              <span className="globe__legend-label">Headquarters only</span>
              <span className="globe__legend-count">{hqCount}</span>
            </button>
          </div>
        </div>

        <p className="globe__hint">
          {selectedId
            ? 'Selected sites pulse · click another to compare'
            : clusterCount > 0
              ? 'Click a numbered dot to open the cluster'
              : 'Drag to rotate · scroll to zoom'}
        </p>
      </div>
    </section>
  );
}

/* ---- cluster counts ------------------------------------------------------
   The number is painted into the disc's texture, not laid over it, so it
   belongs to the map rather than to the interface. 128 px is comfortably more
   than the ~44 device pixels a cluster dot covers at the widest.           */

const COUNT_CANVAS_PX = 128;
const COUNT_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function countCanvas(count: number, hex: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = COUNT_CANVAS_PX;
  canvas.height = COUNT_CANVAS_PX;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const mid = COUNT_CANVAS_PX / 2;
  // A 2 px transparent margin: linear filtering otherwise smears the disc's
  // colour past its own edge.
  ctx.beginPath();
  ctx.arc(mid, mid, mid - 2, 0, 2 * Math.PI);
  ctx.fillStyle = hex;
  ctx.fill();

  const text = count > 999 ? '999+' : String(count);
  const base = COUNT_CANVAS_PX * 0.52;
  ctx.font = `600 ${base}px ${COUNT_FONT}`;
  // Shrink to fit the chord across the disc rather than the canvas square.
  const width = ctx.measureText(text).width || 1;
  const fitted = Math.min(base, (base * (COUNT_CANVAS_PX * 0.66)) / width);
  ctx.font = `600 ${fitted}px ${COUNT_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = HALO_COLOR;
  ctx.fillText(text, mid, mid + fitted * 0.04);

  return canvas;
}

function GlobeLoading() {
  return (
    <div className="globe__loading">
      <span className="globe__loading-orb" aria-hidden="true" />
      <p>Loading the globe…</p>
      <p className="globe__loading-note">Fetching the 3D renderer — this only happens once.</p>
    </div>
  );
}
