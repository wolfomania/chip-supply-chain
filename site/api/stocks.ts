/**
 * GET /api/stocks?symbol=NVDA&range=6mo
 *
 * Thin, cached proxy in front of Yahoo Finance's public chart endpoint. It
 * exists for three reasons: the browser cannot call Yahoo directly (no CORS),
 * the response is ~40x larger than the site needs, and Vercel's edge cache
 * lets one upstream request serve every visitor for a day.
 *
 * This is a public URL, so `symbol` is pattern-checked and `range` is a
 * whitelist — the proxy must never be usable to fetch arbitrary things.
 *
 * `getSeries` is exported separately from the handler so the Vite dev server
 * can mount the identical logic as middleware (see vite.config.ts) and dev
 * gets byte-for-byte the same payload as production.
 */

export const config = { runtime: 'edge' };

export type StockRange = '1d' | '1mo' | '6mo' | '1y';

/** Ranges we serve, and the candle interval each one is drawn at. */
const INTERVALS: Record<StockRange, string> = {
  '1d': '5m', // last trading session, intraday
  '1mo': '1d',
  '6mo': '1d',
  '1y': '1d',
};

const RANGES = Object.keys(INTERVALS) as StockRange[];

/** Tickers only: letters, digits, dot (2330.TW), dash (BRK-B), caret (^GSPC). */
const SYMBOL_RE = /^[A-Za-z0-9.^-]{1,20}$/;

/** Yahoo serves bot-shaped requests a 4xx; a plain browser UA is enough. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** A day at the edge, another day of serving stale while revalidating. */
const CACHE_OK = 'public, s-maxage=86400, stale-while-revalidate=86400';
/** Never cache a failure for long — the next visitor should retry upstream. */
const CACHE_ERR = 'public, s-maxage=300';

export interface StockPoint {
  /** Epoch seconds. */
  t: number;
  /** Close. */
  c: number;
}

export interface StockSeries {
  symbol: string;
  currency: string;
  /** Close immediately before the requested window, i.e. the change baseline. */
  previousClose: number | null;
  points: StockPoint[];
}

export interface ProxyResult {
  status: number;
  cacheControl: string;
  body: StockSeries | { error: string };
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { currency?: string; symbol?: string; chartPreviousClose?: number; previousClose?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }> | null;
  };
}

function fail(status: number, error: string): ProxyResult {
  return { status, cacheControl: CACHE_ERR, body: { error } };
}

/** Trim to 4dp — enough for any quote, and it halves the payload. */
function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Fetch one symbol/range from Yahoo and reduce it to `{ t, c }` points.
 * Never throws: every failure comes back as a `ProxyResult` with a short cache.
 */
export async function getSeries(symbolParam: string | null, rangeParam: string | null): Promise<ProxyResult> {
  const symbol = (symbolParam ?? '').trim();
  if (!SYMBOL_RE.test(symbol)) return fail(400, 'Invalid symbol');

  const range = (rangeParam ?? '').trim() as StockRange;
  if (!RANGES.includes(range)) return fail(400, 'Invalid range');

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${INTERVALS[range]}`;

  let raw: YahooChart;
  try {
    const upstream = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    if (!upstream.ok) return fail(502, `Upstream responded ${upstream.status}`);
    raw = (await upstream.json()) as YahooChart;
  } catch {
    return fail(502, 'Upstream request failed');
  }

  const result = raw.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  if (!result || stamps.length === 0) return fail(502, 'No price data for symbol');

  // Yahoo pads the series with nulls at holidays and thin intraday minutes.
  const points: StockPoint[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const c = closes[i];
    if (typeof c === 'number' && Number.isFinite(c)) points.push({ t: stamps[i], c: round(c) });
  }
  if (points.length === 0) return fail(502, 'No price data for symbol');

  const prev = result.meta?.chartPreviousClose ?? result.meta?.previousClose;

  return {
    status: 200,
    cacheControl: CACHE_OK,
    body: {
      symbol: result.meta?.symbol ?? symbol,
      currency: result.meta?.currency ?? '',
      previousClose: typeof prev === 'number' && Number.isFinite(prev) ? round(prev) : null,
      points,
    },
  };
}

export default async function handler(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const { status, cacheControl, body } = await getSeries(params.get('symbol'), params.get('range'));

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  });
}
