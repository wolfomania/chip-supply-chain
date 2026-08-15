import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import type { Company, Tier } from '../data/types';
import type { ViewProps } from './viewProps';
import { TIER_COLOR, TIER_LABEL, TIER_ORDER } from '../data/tiers';
import earthDayUrl from '../assets/earth-day.jpg';
import earthTopologyUrl from '../assets/earth-topology.png';
import './GlobeView.css';

/**
 * GLOBE VIEW — the chain plotted on a rotating globe.
 *
 * `react-globe.gl` (and with it all of three.js) is pulled in through
 * React.lazy, so the ~1 MB WebGL stack only downloads when this tab is opened.
 * Everything WebGL-facing takes its colour from TIER_COLOR rather than the CSS
 * custom properties — a shader cannot read `var(--tier-fabs)`.
 *
 * Layers, bottom to top:
 *   globe     earth-day.jpg + earth-topology.png bump, both bundled locally
 *             (GitHub Pages, no CDN at runtime)
 *   arcs      one per supply edge, HQ → HQ, source-tier → target-tier gradient
 *   points    one bar per HQ (tall) and per facility (short)
 *   rings     pulse on the selected company's sites
 */

const Globe = lazy(() => import('react-globe.gl'));

/** Where the density is: Taiwan / Japan / Korea / coastal China. */
const HOME_POV = { lat: 24, lng: 122, altitude: 2.1 } as const;
const FOCUS_ALTITUDE = 1.5;

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

export function GlobeView({ companies, edges, selectedId, onSelectCompany }: ViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [hiddenTiers, setHiddenTiers] = useState<ReadonlySet<Tier>>(() => new Set<Tier>());

  /* ---- data -------------------------------------------------------------- */

  const hqByCompany = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const allPoints = useMemo(() => buildPoints(companies), [companies]);

  const allArcs = useMemo<SupplyArc[]>(() => {
    const out: SupplyArc[] = [];
    for (const edge of edges) {
      const source = hqByCompany.get(edge.source);
      const target = hqByCompany.get(edge.target);
      if (!source || !target) continue;
      out.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceTier: edge.sourceTier,
        targetTier: edge.targetTier,
        startLat: source.hq.lat,
        startLng: source.hq.lng,
        endLat: target.hq.lat,
        endLng: target.hq.lng,
        label: `${source.name} → ${target.name}${edge.what ? ` · ${edge.what}` : ''}`,
      });
    }
    return out;
  }, [edges, hqByCompany]);

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

    // Flatten the lighting. globe.gl's default puts a directional light over
    // the north pole, which leaves a hard terminator and a dim southern half —
    // the "planet in space" look. A dominant ambient light plus a soft key
    // renders the earth as an evenly lit object sitting on the page instead.
    // `three` already lives in this lazily-loaded chunk, so the import is free.
    void import('three').then(({ AmbientLight, DirectionalLight }) => {
      if (globeRef.current !== globe) return;
      const key = new DirectionalLight(0xffffff, 1.1);
      key.position.set(1, 0.5, 1.4);
      globe.lights([new AmbientLight(0xffffff, 3.4), key]);
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

  const isSelected = useCallback((p: SitePoint) => p.companyId === selectedId, [selectedId]);

  const pointLabel = useCallback((obj: object) => {
    const p = obj as SitePoint;
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

  const pointColor = useCallback(
    (obj: object) => {
      const p = obj as SitePoint;
      if (!selectedId) return rgba(p.color, p.kind === 'hq' ? 0.94 : 0.78);
      return isSelected(p) ? rgba(p.color, 1) : rgba(p.color, p.kind === 'hq' ? 0.4 : 0.28);
    },
    [selectedId, isSelected],
  );

  const pointRadius = useCallback(
    (obj: object) => {
      const p = obj as SitePoint;
      const base = p.kind === 'hq' ? 0.62 : 0.38;
      return isSelected(p) ? base * 1.7 : base;
    },
    [isSelected],
  );

  const pointAltitude = useCallback(
    (obj: object) => {
      const p = obj as SitePoint;
      const base = p.kind === 'hq' ? 0.05 : 0.02;
      return isSelected(p) ? base + 0.06 : base;
    },
    [isSelected],
  );

  const arcColor = useCallback(
    (obj: object) => {
      const a = obj as SupplyArc;
      const touches = selectedId != null && (a.source === selectedId || a.target === selectedId);
      const alpha = selectedId == null ? 0.42 : touches ? 0.9 : 0.08;
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

  const handlePointClick = useCallback(
    (obj: object) => {
      setInteracted(true);
      onSelectCompany((obj as SitePoint).companyId);
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
        {size.width > 0 ? (
          <Suspense fallback={<GlobeLoading />}>
            <Globe
              ref={globeRef}
              width={size.width}
              height={size.height}
              backgroundColor="rgba(0,0,0,0)"
              globeImageUrl={earthDayUrl}
              bumpImageUrl={earthTopologyUrl}
              showAtmosphere
              atmosphereColor="#a9c2dd"
              atmosphereAltitude={0.17}
              onGlobeReady={handleReady}
              /* points */
              pointsData={points}
              pointLat="lat"
              pointLng="lng"
              pointColor={pointColor}
              pointRadius={pointRadius}
              pointAltitude={pointAltitude}
              pointResolution={16}
              pointsMerge={false}
              pointsTransitionDuration={300}
              pointLabel={pointLabel}
              onPointClick={handlePointClick}
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
