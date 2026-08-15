import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import type { Material } from 'three';
import type { Company, Tier } from '../data/types';
import type { ViewProps } from './viewProps';
import { TIER_COLOR, TIER_LABEL, TIER_ORDER } from '../data/tiers';
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
 *   arcs      one per supply edge, HQ → HQ, source-tier → target-tier gradient
 *   objects   one flat disc per site — the atlas dots, see below
 *   rings     pulse on the selected company's sites
 */

const Globe = lazy(() => import('react-globe.gl'));

/** Where the density is: Taiwan / Japan / Korea / coastal China. */
const HOME_POV = { lat: 24, lng: 122, altitude: 2.1 } as const;
const FOCUS_ALTITUDE = 1.5;

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
   Atlas dots: every site is a flat circle lying on the map, exactly the way a
   printed reference map marks a city. They have no extruded height at all, so
   they read as clean circles from any camera angle instead of the tilted 3D
   pills that a cylinder gives you at a grazing view.

   An HQ gets a paper-toned halo under its dot — a slightly wider disc showing
   as a ring — so the colour separates from the arcs and country borders it
   lands on. A facility is a smaller plain dot, no halo.                     */

/** Radii, in degrees of arc on the sphere. */
const HQ_DOT_DEG = 0.42;
const FACILITY_DOT_DEG = 0.26;
/** How far the halo extends past the HQ dot it sits under. */
const HALO_RING_DEG = 0.14;
/** The selected company's sites grow by this much. */
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

/* ---- fanning out co-located sites ----------------------------------------
   Ten headquarters share the south bay, and central Tokyo holds a similar
   crowd; drawn as authored they land on the same pixel, so all you see is
   whichever one happened to be painted last. Sites within CLUSTER_DEG of each
   other are therefore grouped and dealt out onto concentric rings around
   their shared centroid — a rosette, one dot per site, all of them legible.

   Only the rendered coordinates move: tooltips still name the true city, and
   the camera still flies to the real HQ. The displacement is a couple of
   degrees at most, which is well inside the "one dot for a metro area"
   fiction this map already trades in.                                      */

/** Sites closer than this (degrees, longitude corrected for latitude) are one place. */
const CLUSTER_DEG = 0.45;
/** Centre-to-centre gap between neighbouring dots in a rosette. */
const FAN_SPACING_DEG = 1.15;
/** No dot is ever thrown further than this from its true position. */
const FAN_MAX_DEG = 1.9;

const DEG = Math.PI / 180;
/** three-globe draws on a fixed radius-100 sphere; one degree of arc is this many units. */
const UNITS_PER_DEG = (2 * Math.PI * 100) / 360;

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
  place: string;
  bottleneck: boolean;
}

/** One flat disc on the map: a site's coloured dot, or the halo beneath an HQ. */
interface SiteDisc {
  site: SitePoint;
  lat: number;
  lng: number;
  altitude: number;
  /** Degrees of arc. */
  radius: number;
  hex: string;
  alpha: number;
  /** three.js renderOrder — see the altitude note above. */
  order: number;
}

interface SupplyArc {
  id: string;
  source: string;
  target: string;
  sourceTier: Tier;
  targetTier: Tier;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  label: string;
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

/**
 * Polar offsets for the `n` sites of one cluster: concentric rings holding 6,
 * 12, 18… dots, which is roughly how circles pack, with alternate rings
 * staggered by half a step so the outer dots sit in the inner gaps.
 *
 * Ring one contracts for small clusters — a pair ends up one spacing apart
 * rather than two — and the whole rosette is squeezed if its outermost ring
 * would otherwise reach past FAN_MAX_DEG.
 */
function fanSlots(n: number): { r: number; a: number }[] {
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
        ? Math.min(FAN_SPACING_DEG, FAN_SPACING_DEG / (2 * Math.sin(Math.PI / Math.max(count, 2))))
        : FAN_SPACING_DEG * (i + 1);
    const offset = (i % 2) * (Math.PI / count);
    for (let j = 0; j < count; j++) slots.push({ r, a: offset + (j / count) * 2 * Math.PI });
  });

  const outermost = slots[slots.length - 1].r;
  if (outermost > FAN_MAX_DEG) {
    const squeeze = FAN_MAX_DEG / outermost;
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

/**
 * Group sites that share a place and deal each group onto a rosette.
 *
 * Greedy, seeded on the first member in id order, so the layout is identical
 * on every render and every reload. Singletons are returned untouched; only
 * the lat/lng of clustered sites change, never their labels.
 */
function fanOutCoLocated(points: SitePoint[]): SitePoint[] {
  const seeded = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const clusters: { lat: number; lng: number; members: SitePoint[] }[] = [];

  for (const point of seeded) {
    const home = clusters.find((cluster) => {
      const dLat = cluster.lat - point.lat;
      const dLng = lngDelta(cluster.lng, point.lng) * lngScale(cluster.lat);
      return dLat * dLat + dLng * dLng <= CLUSTER_DEG * CLUSTER_DEG;
    });
    if (home) home.members.push(point);
    else clusters.push({ lat: point.lat, lng: point.lng, members: [point] });
  }

  const fanned: SitePoint[] = [];

  for (const cluster of clusters) {
    const n = cluster.members.length;
    if (n === 1) {
      fanned.push(cluster.members[0]);
      continue;
    }

    // Centroid, measured relative to the seed so the antimeridian is a non-event.
    const lat = cluster.members.reduce((sum, m) => sum + m.lat, 0) / n;
    const lng =
      cluster.lng + cluster.members.reduce((sum, m) => sum + lngDelta(m.lng, cluster.lng), 0) / n;

    const slots = fanSlots(n);
    const scale = lngScale(lat);

    [...cluster.members]
      .sort((a, b) => fanOrder(a).localeCompare(fanOrder(b)))
      .forEach((member, i) => {
        const { r, a } = slots[i];
        fanned.push({
          ...member,
          lat: Math.max(-89, Math.min(89, lat + r * Math.sin(a))),
          lng: lng + (r * Math.cos(a)) / scale,
        });
      });
  }

  return fanned;
}

export function GlobeView({ companies, edges, selectedId, onSelectCompany }: ViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [hiddenTiers, setHiddenTiers] = useState<ReadonlySet<Tier>>(() => new Set<Tier>());
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

  // Fanned once, off the full set: hiding a tier must not reshuffle the layout.
  const allPoints = useMemo(() => fanOutCoLocated(buildPoints(companies)), [companies]);

  /** Where each HQ dot actually got drawn — arcs have to land on the dot, not the city. */
  const hqPlacement = useMemo(() => {
    const placed = new Map<string, SitePoint>();
    for (const point of allPoints) if (point.kind === 'hq') placed.set(point.companyId, point);
    return placed;
  }, [allPoints]);

  const allArcs = useMemo<SupplyArc[]>(() => {
    const out: SupplyArc[] = [];
    for (const edge of edges) {
      const source = hqByCompany.get(edge.source);
      const target = hqByCompany.get(edge.target);
      const from = hqPlacement.get(edge.source);
      const to = hqPlacement.get(edge.target);
      if (!source || !target || !from || !to) continue;
      out.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceTier: edge.sourceTier,
        targetTier: edge.targetTier,
        startLat: from.lat,
        startLng: from.lng,
        endLat: to.lat,
        endLng: to.lng,
        label: `${source.name} → ${target.name}${edge.what ? ` · ${edge.what}` : ''}`,
      });
    }
    return out;
  }, [edges, hqByCompany, hqPlacement]);

  /** Tiers present in the data, in chain order, with a site count each. */
  const legend = useMemo(() => {
    const counts = new Map<Tier, number>();
    for (const point of allPoints) counts.set(point.tier, (counts.get(point.tier) ?? 0) + 1);
    return TIER_ORDER.filter((t) => counts.has(t)).map((tier) => ({ tier, count: counts.get(tier) ?? 0 }));
  }, [allPoints]);

  const points = useMemo(
    () => (hiddenTiers.size === 0 ? allPoints : allPoints.filter((p) => !hiddenTiers.has(p.tier))),
    [allPoints, hiddenTiers],
  );

  // An arc is only meaningful while both of its endpoints are on the globe.
  const arcs = useMemo(
    () =>
      hiddenTiers.size === 0
        ? allArcs
        : allArcs.filter((a) => !hiddenTiers.has(a.sourceTier) && !hiddenTiers.has(a.targetTier)),
    [allArcs, hiddenTiers],
  );

  const rings = useMemo(
    () => (selectedId ? points.filter((p) => p.companyId === selectedId) : []),
    [points, selectedId],
  );

  /**
   * The drawn discs: a halo then a dot for each HQ, a dot for each facility.
   * Rebuilt whenever the selection or the tier filter changes, which is what
   * repaints the layer — the objects layer reads appearance at creation.
   */
  const discs = useMemo<SiteDisc[]>(() => {
    const out: SiteDisc[] = [];

    points.forEach((site, i) => {
      const hq = site.kind === 'hq';
      const chosen = selectedId != null && site.companyId === selectedId;
      const scale = chosen ? SELECTED_DOT_SCALE : 1;
      const radius = (hq ? HQ_DOT_DEG : FACILITY_DOT_DEG) * scale;
      const alpha =
        selectedId == null ? (hq ? 0.94 : 0.78) : chosen ? 1 : hq ? 0.4 : 0.28;
      const slot = i + (chosen ? SELECTED_ORDER : 0);

      if (hq) {
        out.push({
          site,
          lat: site.lat,
          lng: site.lng,
          altitude: HALO_ALTITUDE,
          radius: radius + HALO_RING_DEG * scale,
          hex: HALO_COLOR,
          // The halo fades with its dot, or a dimmed company would keep a
          // bright white ring and read as the loud one.
          alpha: alpha * 0.92,
          order: HALO_ORDER + slot,
        });
      }

      out.push({
        site,
        lat: site.lat,
        lng: site.lng,
        altitude: DOT_ALTITUDE,
        radius,
        hex: site.color,
        alpha,
        order: DOT_ORDER + slot,
      });
    });

    return out;
  }, [points, selectedId]);

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
    controls.minDistance = 140;
    controls.maxDistance = 700;
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

  // Spin slowly until the reader takes over, then leave the camera alone.
  useEffect(() => {
    const controls = ready ? globeRef.current?.controls() : undefined;
    if (controls) controls.autoRotate = !interacted && !selectedId;
  }, [ready, interacted, selectedId]);

  // Fly to whatever the app selected — including selections made elsewhere.
  useEffect(() => {
    if (!ready || !selectedId) return;
    const company = hqByCompany.get(selectedId);
    if (!company) return;
    globeRef.current?.pointOfView(
      { lat: company.hq.lat, lng: company.hq.lng, altitude: FOCUS_ALTITUDE },
      900,
    );
  }, [ready, selectedId, hqByCompany]);

  /* ---- accessors --------------------------------------------------------- */

  /**
   * One flat circle, tangent to the sphere. The objects layer positions and
   * orients it — a CircleGeometry faces straight out with no rotation of our
   * own — so all this has to settle is size, colour and paint order.
   *
   * Geometry and material are per-disc rather than shared: three-globe
   * disposes both when an object leaves the layer, which would pull the rug
   * from under any cached copy. A few hundred 48-gons is nothing, and three
   * caches the shader program across identical materials anyway.
   */
  const discObject = useMemo(() => {
    if (!baseMap) return undefined;
    const { CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial } = baseMap.three;

    return (obj: object) => {
      const disc = obj as SiteDisc;
      const mesh = new Mesh(
        new CircleGeometry(1, 48),
        new MeshBasicMaterial({
          color: disc.hex,
          transparent: true,
          opacity: disc.alpha,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.scale.setScalar(disc.radius * UNITS_PER_DEG);
      mesh.renderOrder = disc.order;
      return mesh;
    };
  }, [baseMap]);

  const discLabel = useCallback((obj: object) => {
    const p = (obj as SiteDisc).site;
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
      const touches = selectedId != null && (a.source === selectedId || a.target === selectedId);
      // A touch heavier than they were over the old satellite texture: the
      // vector base map is pale, so a thin arc needs the extra opacity to
      // hold its own where it crosses land.
      const alpha = selectedId == null ? 0.52 : touches ? 0.92 : 0.09;
      return [rgba(TIER_COLOR[a.sourceTier], alpha), rgba(TIER_COLOR[a.targetTier], alpha)];
    },
    [selectedId],
  );

  const arcStroke = useCallback(
    (obj: object) => {
      const a = obj as SupplyArc;
      const touches = selectedId != null && (a.source === selectedId || a.target === selectedId);
      return touches ? 0.5 : 0.22;
    },
    [selectedId],
  );

  // Halo and dot both carry their site, so the ring is as clickable as the ink.
  const handleDiscClick = useCallback(
    (obj: object) => {
      setInteracted(true);
      onSelectCompany((obj as SiteDisc).site.companyId);
    },
    [onSelectCompany],
  );

  const handleArcClick = useCallback(
    (obj: object) => {
      setInteracted(true);
      onSelectCompany((obj as SupplyArc).target);
    },
    [onSelectCompany],
  );

  const ringColor = useCallback((obj: object) => {
    const p = obj as SitePoint;
    return (t: number) => rgba(p.color, 1 - t);
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

  const facilityCount = allPoints.length - companies.length;

  return (
    <section className="globe" aria-labelledby="globe-heading">
      <header className="globe__head">
        <h2 className="globe__title" id="globe-heading">
          Where the chain actually is
        </h2>
        <p className="globe__standfirst">
          Every headquarters and key facility placed on the planet, with an arc for each supply
          relationship. Drag to rotate, scroll to zoom, click a site to open its company.
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
            <dd>{arcs.length}</dd>
          </div>
        </dl>
      </header>

      {/* The canvas itself is not reachable by keyboard; the Companies view is the
          accessible route through the same data, so describe rather than trap. */}
      <p className="visually-hidden">
        A 3D globe showing {allPoints.length} sites across {companies.length} companies and{' '}
        {allArcs.length} supply links. The Companies tab lists the same data as text.
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
              ringMaxRadius={3.2}
              ringPropagationSpeed={1.6}
              ringRepeatPeriod={1100}
            />
          </Suspense>
        ) : (
          <GlobeLoading />
        )}

        <div className="globe__legend">
          <p className="globe__legend-head">
            <span>Tiers</span>
            {hiddenTiers.size > 0 ? (
              <button type="button" className="globe__legend-reset" onClick={() => setHiddenTiers(new Set())}>
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
        </div>

        <p className="globe__hint">
          {selectedId ? 'Selected sites pulse · click another to compare' : 'Drag to rotate · scroll to zoom'}
        </p>
      </div>
    </section>
  );
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
