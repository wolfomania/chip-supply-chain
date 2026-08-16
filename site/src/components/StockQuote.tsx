import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Company } from '../data/types';
import { isListed, listingFor, type Listing } from '../data/stocks/listings';
import {
  DEFAULT_RANGE,
  STOCK_RANGES,
  fetchStockSeries,
  type StockPoint,
  type StockRange,
  type StockSeries,
} from '../data/stocks/series';
import './StockQuote.css';

const PERCENT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

interface MoneyFormat {
  /** Price with the currency's own symbol: $225.16, ¥1,234, ₩58,900. */
  price: Intl.NumberFormat;
  /** Bare change, at the currency's natural precision (none for JPY/KRW). */
  delta: Intl.NumberFormat;
}

const MONEY = new Map<string, MoneyFormat>();

/** Quotes come in TWD, KRW, JPY and EUR as well as USD — let Intl decide the shape. */
function money(currency: string): MoneyFormat {
  const cached = MONEY.get(currency);
  if (cached) return cached;

  let format: MoneyFormat;
  try {
    // 'symbol', not 'narrowSymbol': narrow renders TWD as a bare "$", which
    // reads as US dollars. Full symbols keep NT$ / ₩ / ¥ unambiguous.
    const price = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'symbol' });
    const digits = price.resolvedOptions().minimumFractionDigits;
    format = {
      price,
      delta: new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    };
  } catch {
    // Unknown or empty currency code: fall back to a plain two-decimal number.
    const plain = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    format = { price: plain, delta: plain };
  }

  MONEY.set(currency, format);
  return format;
}

/**
 * Share price for the company in the detail panel. Companies with no listing —
 * private, family-owned, taken private, or not a company at all — get one quiet
 * line saying which, instead of the block.
 */
export function StockQuote({ company }: { company: Company }) {
  const listing = listingFor(company.id);

  if (!isListed(listing)) {
    return (
      <section className="detail__section stock">
        <h3 className="eyebrow">Listing</h3>
        <p className="stock__unlisted">{listing?.note ?? 'Privately held — no public listing.'}</p>
      </section>
    );
  }

  // Keyed so switching companies inside the panel resets range and series.
  return <StockBlock key={listing.symbol} listing={listing} companyName={company.name} />;
}

type Load =
  | { status: 'loading'; series: StockSeries | null }
  | { status: 'ready'; series: StockSeries }
  | { status: 'error'; series: null };

function StockBlock({ listing, companyName }: { listing: Listing; companyName: string }) {
  const [range, setRange] = useState<StockRange>(DEFAULT_RANGE);
  const [load, setLoad] = useState<Load>({ status: 'loading', series: null });
  /** The point under the cursor on the chart, if any — it takes over the headline. */
  const [hover, setHover] = useState<StockPoint | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    // Keep the previous series on screen (dimmed) while a new range loads.
    setLoad((prev) => ({ status: 'loading', series: prev.series }));
    setHover(null);

    fetchStockSeries(listing.symbol, range, ac.signal)
      .then((series) => setLoad({ status: 'ready', series }))
      .catch(() => {
        if (!ac.signal.aborted) setLoad({ status: 'error', series: null });
      });

    return () => ac.abort();
  }, [listing.symbol, range]);

  const series = load.series;
  const move = useMemo(() => (series ? measure(series) : null), [series]);
  // Hovering the chart retargets the headline at that point; the section keeps
  // the whole-window direction, so the chart's own colour never flickers.
  const view = move ? (hover ? delta(hover.c, move.base) : move) : null;
  const tab = STOCK_RANGES.find((r) => r.id === range);
  // Yahoo's currency is authoritative; the mapping's is the fallback before it lands.
  const cash = money(series?.currency || listing.currency);

  // The note earns its line when the ticker belongs to someone else.
  const sameIssuer = listing.companyLabel.toLowerCase().startsWith(companyName.toLowerCase());
  const via = listing.note ?? (sameIssuer ? null : `via ${listing.companyLabel}`);

  return (
    <section
      className={`detail__section stock${load.status === 'loading' && series ? ' is-stale' : ''}`}
      data-dir={move?.dir ?? 'flat'}
      aria-busy={load.status === 'loading'}
    >
      <h3 className="eyebrow">Stock</h3>

      <div className="stock__ident">
        <span className="stock__ticker">{listing.symbol}</span>
        <span className="stock__exchange">{listing.exchange}</span>
        <span className="stock__ccy">{listing.currency}</span>
      </div>
      {via ? <p className="stock__via">{via}</p> : null}

      {move && view && series ? (
        <>
          <p className="stock__headline">
            <span className="stock__price">{cash.price.format((hover ?? move.last).c)}</span>
            <span className="stock__change" data-dir={view.dir}>
              {view.sign}
              {cash.delta.format(Math.abs(view.change))} ({view.sign}
              {PERCENT.format(Math.abs(view.pct))}%)
            </span>
            <span className="stock__window">{tab?.blurb}</span>
          </p>
          <Sparkline
            points={series.points}
            baseline={move.base}
            format={cash.price.format}
            onHover={setHover}
          />
        </>
      ) : load.status === 'error' ? (
        <p className="stock__error">Price data unavailable right now.</p>
      ) : (
        <div className="stock__skeleton" aria-hidden="true">
          <span className="stock__skeleton-line" />
          <span className="stock__skeleton-chart" />
        </div>
      )}

      <div className="stock__ranges" role="group" aria-label="Price range">
        {STOCK_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`stock__range${r.id === range ? ' is-active' : ''}`}
            aria-pressed={r.id === range}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <p className="stock__caption">
        Prices delayed up to a day{move ? ` · as of ${stamp(move.last.t, range === '1d')}` : ''}
      </p>
    </section>
  );
}

interface Delta {
  change: number;
  pct: number;
  dir: 'up' | 'down' | 'flat';
  sign: string;
}

interface Move extends Delta {
  last: StockPoint;
  /** Close the change is measured from: the pre-window close, or the first point. */
  base: number;
}

/** One close against the baseline — used for the last point and for hovered ones. */
function delta(value: number, base: number): Delta {
  const change = value - base;
  const pct = base === 0 ? 0 : (change / base) * 100;
  // Anything under half a cent of movement reads as flat, not as a rounded 0.00 up.
  const dir = change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat';

  return { change, pct, dir, sign: dir === 'up' ? '+' : dir === 'down' ? '−' : '' };
}

function measure(series: StockSeries): Move {
  const last = series.points[series.points.length - 1];
  const base = series.previousClose ?? series.points[0].c;

  return { last, base, ...delta(last.c, base) };
}

/* Sparkline ---------------------------------------------------------------- */

const W = 440;
const H = 104;
const PAD = 8;
/** Right inset so the marker on the last close sits fully inside the box. */
const X_END = W - 9;

/**
 * Hand-rolled line chart: closes only, no axes, no grid. The dashed rule is the
 * baseline the change above is measured against, so the reader can see at a
 * glance which side of it the line spends its time on.
 */
function Sparkline({
  points,
  baseline,
  format,
  onHover,
}: {
  points: StockPoint[];
  baseline: number;
  /** Price formatter for the hover label — the currency's own, from the block. */
  format: (value: number) => string;
  onHover: (point: StockPoint | null) => void;
}) {
  const gradientId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<number | null>(null);

  const { line, area, base, dot, xs, ys, intraday } = useMemo(() => {
    const values = points.map((p) => p.c);
    const lo = Math.min(baseline, ...values);
    const hi = Math.max(baseline, ...values);
    const span = hi - lo || Math.max(Math.abs(hi) * 0.01, 0.01);

    const x = (i: number) => (points.length === 1 ? X_END / 2 : (i / (points.length - 1)) * X_END);
    const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);

    const xs = points.map((_, i) => x(i));
    const ys = points.map((p) => y(p.c));
    const d = points.map((_, i) => `${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join('L');
    const last = points.length - 1;
    // Candle spacing, not the range tab, decides whether a stamp needs a clock:
    // 1D comes back at 5-minute bars, every other range at one point per day.
    const step = last > 0 ? (points[last].t - points[0].t) / last : Infinity;

    return {
      line: `M${d}`,
      area: `M${d}L${xs[last].toFixed(1)},${H}L${xs[0].toFixed(1)},${H}Z`,
      base: y(baseline),
      dot: { cx: xs[last], cy: ys[last] },
      xs,
      ys,
      intraday: step < 12 * 3600,
    };
  }, [points, baseline]);

  // A new series arrives under a cursor that never moved: drop the stale marker.
  useEffect(() => setAt(null), [points]);

  const cursor = at !== null && at < points.length ? at : null;

  // Keep the label inside the plot: centred on the point until an edge is near,
  // then pinned flush to it. Written straight to the node — measuring the label
  // and re-rendering for it would double the work on every pointer move.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const box = boxRef.current;
    if (!tip || !box || cursor === null) return;

    const width = box.clientWidth;
    const centre = (xs[cursor] / W) * width;
    tip.style.left = `${Math.min(Math.max(centre - tip.offsetWidth / 2, 0), Math.max(width - tip.offsetWidth, 0))}px`;
  }, [cursor, xs]);

  /** Nearest point to the pointer, in the SVG's own coordinates. */
  function locate(clientX: number) {
    const box = boxRef.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    if (rect.width === 0) return;

    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
    }

    if (best !== cursor) {
      setAt(best);
      onHover(points[best]);
    }
  }

  function clear() {
    setAt(null);
    onHover(null);
  }

  return (
    <div
      className="stock__chart"
      ref={boxRef}
      onPointerDown={(e) => locate(e.clientX)}
      onPointerMove={(e) => locate(e.clientX)}
      onPointerLeave={clear}
      onPointerCancel={clear}
      // A finger has nowhere to rest: lifting it ends the scrub.
      onPointerUp={(e) => {
        if (e.pointerType !== 'mouse') clear();
      }}
    >
      <svg className="stock__spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="stock__spark-stop-a" />
            <stop offset="100%" className="stock__spark-stop-b" />
          </linearGradient>
        </defs>
        <path className="stock__spark-area" d={area} fill={`url(#${gradientId})`} />
        <line className="stock__spark-base" x1="0" y1={base} x2={W} y2={base} />
        {cursor !== null ? (
          <line className="stock__spark-cross" x1={xs[cursor]} y1="0" x2={xs[cursor]} y2={H} />
        ) : null}
        <path className="stock__spark-line" d={line} />
        <circle className="stock__spark-dot" cx={dot.cx} cy={dot.cy} r="3.4" />
        {cursor !== null ? (
          <circle className="stock__spark-mark" cx={xs[cursor]} cy={ys[cursor]} r="4" />
        ) : null}
      </svg>

      {cursor !== null ? (
        <div
          className="stock__tip"
          ref={tipRef}
          // The label sits on the empty half of the box, away from the point.
          data-side={ys[cursor] < H / 2 ? 'bottom' : 'top'}
          aria-hidden="true"
        >
          <span className="stock__tip-price">{format(points[cursor].c)}</span>
          <span className="stock__tip-when">{stamp(points[cursor].t, intraday)}</span>
        </div>
      ) : null}
    </div>
  );
}

function stamp(epochSeconds: number, intraday: boolean): string {
  const d = new Date(epochSeconds * 1000);
  return intraday ? `${DAY.format(d)}, ${TIME.format(d)}` : DAY.format(d);
}
