/**
 * Company id → public listing, for the stock block in the detail panel.
 *
 * Many companies in the dataset are divisions rather than issuers (Samsung's
 * memory and foundry arms, TSMC's CoWoS packaging, Cymer inside ASML). Those
 * map to the *parent* ticker, and `note` says so in the panel so the reader is
 * never shown a price that quietly belongs to somebody else. Where a company's
 * US ADR is too thin to chart, the entry points at the primary local listing
 * instead — hence the TWD, KRW, JPY and EUR quotes in here.
 *
 * An `Unlisted` entry carries the reason: private, family-owned, taken private,
 * or not a company at all. A missing key behaves like `null`.
 */
export interface Listing {
  /** Yahoo Finance symbol, e.g. "TSM", "2330.TW", "005930.KS". */
  symbol: string;
  /** Human exchange name shown as a badge, e.g. "NasdaqGS". */
  exchange: string;
  /** ISO currency of the quote, e.g. "USD". */
  currency: string;
  /** The issuer the ticker actually belongs to, e.g. "ASML Holding N.V.". */
  companyLabel: string;
  /** Why the ticker differs from the company, e.g. "charts parent ASML". */
  note: string | null;
}

/** No public listing, plus the reason there isn't one. */
export interface Unlisted {
  symbol: null;
  note: string;
}

export type ListingEntry = Listing | Unlisted;

export const LISTINGS: Record<string, ListingEntry | null> = {
  'quartz-sand': {
    symbol: null,
    note: 'Not a company — Spruce Pine quartz comes from The Quartz Corp and Sibelco, both privately held.',
  },
  toto: {
    symbol: 'TOTDY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'TOTO Ltd. (ADR)',
    note: 'Unsponsored OTC ADR; native listing is 5332.T (Tokyo, JPY).',
  },
  ajinomoto: {
    symbol: 'AJNMY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'Ajinomoto Co., Inc. (ADR)',
    note: 'OTC ADR (ticker changed from AJINY after the 2025 ADR split); native listing is 2802.T.',
  },
  ibiden: {
    symbol: 'IBIDY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'Ibiden Co., Ltd. (ADR)',
    note: 'OTC ADR; native listing is 4062.T (Tokyo, JPY).',
  },
  unimicron: {
    symbol: '3037.TW',
    exchange: 'Taiwan Stock Exchange',
    currency: 'TWD',
    companyLabel: 'Unimicron Technology Corp.',
    note: 'No US ADR — charts the primary Taiwan listing.',
  },
  'shin-etsu': {
    symbol: 'SHECY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'Shin-Etsu Chemical Co., Ltd. (ADR)',
    note: null,
  },
  sumco: {
    symbol: 'SUOPY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'SUMCO Corporation (ADR)',
    note: 'Thinly traded OTC ADR; native listing is 3436.T (Tokyo, JPY).',
  },
  globalwafers: {
    symbol: '6488.TWO',
    exchange: 'Taipei Exchange',
    currency: 'TWD',
    companyLabel: 'GlobalWafers Co., Ltd.',
    note: 'Trades on the Taipei Exchange rather than the TWSE. No US ADR.',
  },
  siltronic: {
    symbol: 'WAF.DE',
    exchange: 'XETRA',
    currency: 'EUR',
    companyLabel: 'Siltronic AG',
    note: 'Charts the primary Frankfurt/XETRA listing; the US OTC line is effectively untraded.',
  },
  jsr: {
    symbol: null,
    note: 'Delisted June 2024 — taken private by the Japan Investment Corporation.',
  },
  tok: {
    symbol: '4186.T',
    exchange: 'Tokyo Stock Exchange',
    currency: 'JPY',
    companyLabel: 'Tokyo Ohka Kogyo Co., Ltd.',
    note: 'No live US ADR — charts the primary Tokyo listing.',
  },
  'air-liquide': {
    symbol: 'AIQUY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'L\'Air Liquide S.A. (ADR)',
    note: 'OTC ADR; primary listing is AI.PA in Paris (EUR).',
  },
  linde: {
    symbol: 'LIN',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Linde plc',
    note: null,
  },
  hoya: {
    symbol: 'HOCPY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'HOYA Corporation (ADR)',
    note: null,
  },
  tanaka: {
    symbol: null,
    note: 'Privately held — TANAKA Holdings has never been listed.',
  },
  trumpf: {
    symbol: null,
    note: 'Privately held — family-owned by the Leibinger family and its foundation.',
  },
  'zeiss-smt': {
    symbol: null,
    note: 'Not listed — a wholly owned subsidiary of Carl Zeiss AG, itself owned by the Carl-Zeiss-Stiftung.',
  },
  cymer: {
    symbol: 'ASML',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'ASML Holding N.V.',
    note: 'An ASML subsidiary since 2013 — charts parent ASML.',
  },
  'vdl-etg': {
    symbol: null,
    note: 'Privately held — part of VDL Groep, owned by the van der Leegte family.',
  },
  asml: {
    symbol: 'ASML',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'ASML Holding N.V.',
    note: 'US listing; also trades in Amsterdam as ASML.AS (EUR).',
  },
  'applied-materials': {
    symbol: 'AMAT',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Applied Materials, Inc.',
    note: null,
  },
  'lam-research': {
    symbol: 'LRCX',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Lam Research Corporation',
    note: null,
  },
  kla: {
    symbol: 'KLAC',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'KLA Corporation',
    note: null,
  },
  'tokyo-electron': {
    symbol: 'TOELY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'Tokyo Electron Limited (ADR)',
    note: 'Liquid OTC ADR; native listing is 8035.T (Tokyo, JPY).',
  },
  nikon: {
    symbol: '7731.T',
    exchange: 'Tokyo Stock Exchange',
    currency: 'JPY',
    companyLabel: 'Nikon Corporation',
    note: 'The US ADR is far too thin to chart — this is the primary Tokyo listing.',
  },
  canon: {
    symbol: 'CAJPY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'Canon Inc. (ADR)',
    note: 'Canon\'s NYSE listing was withdrawn; CAJPY is the surviving OTC ADR of 7751.T.',
  },
  tsmc: {
    symbol: 'TSM',
    exchange: 'NYSE',
    currency: 'USD',
    companyLabel: 'Taiwan Semiconductor Manufacturing Co. (ADR)',
    note: 'Native listing is 2330.TW (TWD).',
  },
  'samsung-foundry': {
    symbol: '005930.KS',
    exchange: 'Korea Exchange (KRX)',
    currency: 'KRW',
    companyLabel: 'Samsung Electronics Co., Ltd.',
    note: 'Samsung Foundry is a division of Samsung Electronics — charts the parent.',
  },
  intel: {
    symbol: 'INTC',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Intel Corporation',
    note: null,
  },
  globalfoundries: {
    symbol: 'GFS',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'GLOBALFOUNDRIES Inc.',
    note: null,
  },
  'sk-hynix': {
    symbol: '000660.KS',
    exchange: 'Korea Exchange (KRX)',
    currency: 'KRW',
    companyLabel: 'SK hynix Inc.',
    note: 'Listed in Seoul in its own right; no live US ADR.',
  },
  micron: {
    symbol: 'MU',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Micron Technology, Inc.',
    note: null,
  },
  'samsung-memory': {
    symbol: '005930.KS',
    exchange: 'Korea Exchange (KRX)',
    currency: 'KRW',
    companyLabel: 'Samsung Electronics Co., Ltd.',
    note: 'Samsung\'s memory business is a division of Samsung Electronics — charts the parent.',
  },
  'tsmc-cowos': {
    symbol: 'TSM',
    exchange: 'NYSE',
    currency: 'USD',
    companyLabel: 'Taiwan Semiconductor Manufacturing Co. (ADR)',
    note: 'CoWoS is TSMC\'s advanced-packaging line — charts parent TSMC.',
  },
  ase: {
    symbol: 'ASX',
    exchange: 'NYSE',
    currency: 'USD',
    companyLabel: 'ASE Technology Holding Co., Ltd. (ADR)',
    note: 'Native listing is 3711.TW (TWD).',
  },
  amkor: {
    symbol: 'AMKR',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Amkor Technology, Inc.',
    note: null,
  },
  cadence: {
    symbol: 'CDNS',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Cadence Design Systems, Inc.',
    note: null,
  },
  synopsys: {
    symbol: 'SNPS',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Synopsys, Inc.',
    note: null,
  },
  nvidia: {
    symbol: 'NVDA',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'NVIDIA Corporation',
    note: null,
  },
  amd: {
    symbol: 'AMD',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Advanced Micro Devices, Inc.',
    note: null,
  },
  apple: {
    symbol: 'AAPL',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Apple Inc.',
    note: null,
  },
  broadcom: {
    symbol: 'AVGO',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'Broadcom Inc.',
    note: null,
  },
  qualcomm: {
    symbol: 'QCOM',
    exchange: 'NasdaqGS',
    currency: 'USD',
    companyLabel: 'QUALCOMM Incorporated',
    note: null,
  },
  'air-cargo-747': {
    symbol: null,
    note: 'Not a company — the chartered 747 airlift that moves EUV tools between continents.',
  },
  dsv: {
    symbol: 'DSDVY',
    exchange: 'OTC Markets',
    currency: 'USD',
    companyLabel: 'DSV A/S (ADR)',
    note: 'Liquid OTC ADR; primary listing is DSV.CO in Copenhagen (DKK).',
  },
  'china-airlines-cargo': {
    symbol: '2610.TW',
    exchange: 'Taiwan Stock Exchange',
    currency: 'TWD',
    companyLabel: 'China Airlines, Ltd.',
    note: 'Cargo is a division of China Airlines — charts the parent airline.',
  },
  'eva-air-cargo': {
    symbol: '2618.TW',
    exchange: 'Taiwan Stock Exchange',
    currency: 'TWD',
    companyLabel: 'EVA Airways Corp.',
    note: 'Cargo is a division of EVA Airways — charts the parent airline.',
  },
};

/**
 * Entry for a company id, or null when the id is not in the map at all —
 * which the panel treats exactly like an explicit unlisted entry.
 */
export function listingFor(companyId: string): ListingEntry | null {
  return LISTINGS[companyId] ?? null;
}

/** Narrows an entry to a real, tradeable listing. */
export function isListed(entry: ListingEntry | null): entry is Listing {
  return entry !== null && entry.symbol !== null;
}
