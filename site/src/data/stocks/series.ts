/**
 * Client half of the stock feature. Talks to /api/stocks — the Vercel edge
 * function in production, the equivalent Vite middleware in dev (see
 * vite.config.ts) — which is the only thing that ever touches Yahoo.
 */

export interface StockPoint {
  /** Epoch seconds. */
  t: number;
  /** Close. */
  c: number;
}

export interface StockSeries {
  symbol: string;
  currency: string;
  /** Close immediately before the window: the baseline the change is measured from. */
  previousClose: number | null;
  points: StockPoint[];
}

/** The Google-Finance-style range tabs, in tab order. */
export const STOCK_RANGES = [
  { id: '1d', label: '1D', blurb: 'today' },
  { id: '1mo', label: '1M', blurb: 'past month' },
  { id: '6mo', label: '6M', blurb: 'past 6 months' },
  { id: '1y', label: '1Y', blurb: 'past year' },
] as const;

export type StockRange = (typeof STOCK_RANGES)[number]['id'];

export const DEFAULT_RANGE: StockRange = '6mo';

/** Throws on any non-200 or malformed payload; callers render the error state. */
export async function fetchStockSeries(
  symbol: string,
  range: StockRange,
  signal?: AbortSignal,
): Promise<StockSeries> {
  const url = `/api/stocks?symbol=${encodeURIComponent(symbol)}&range=${range}`;
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`stocks: ${res.status}`);

  const data = (await res.json()) as Partial<StockSeries>;
  if (!Array.isArray(data.points) || data.points.length === 0) throw new Error('stocks: empty series');

  return {
    symbol: data.symbol ?? symbol,
    currency: data.currency ?? '',
    previousClose: typeof data.previousClose === 'number' ? data.previousClose : null,
    points: data.points,
  };
}
