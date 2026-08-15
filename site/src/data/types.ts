/**
 * Types mirroring data/SCHEMA.md exactly.
 * Research agents drop `{ "companies": [...] }` files into src/data/companies/;
 * loadData.ts globs them in. Keep this file in sync with SCHEMA.md and nothing else.
 */

/** Supply-chain tier. `logistics` is cross-cutting rather than a stage. */
export type Tier =
  | 'raw-materials'
  | 'materials'
  | 'equipment-suppliers'
  | 'equipment'
  | 'eda'
  | 'fabs'
  | 'memory'
  | 'packaging'
  | 'designers'
  | 'logistics';

export interface Place {
  city: string;
  country: string;
  lat: number;
  lng: number;
}

/** A key plant / fab site relevant to chips. */
export interface Facility extends Place {
  name: string;
  /** e.g. "3nm/5nm" */
  note?: string | null;
}

/** One outgoing supply relationship. `target` is a canonical company id. */
export interface Supply {
  target: string;
  /** What flows along this edge, e.g. "electrostatic ceramic wafer chucks". */
  what: string;
}

export interface Company {
  /** kebab-case canonical id, e.g. "asml" */
  id: string;
  name: string;
  tier: Tier;
  /** One line: what they make for the chip supply chain. */
  role: string;
  /** 2-4 plain-language sentences. */
  description: string;
  /** True if effectively the sole / dominant supplier. */
  bottleneck: boolean;
  hq: Place;
  facilities: Facility[];
  suppliesTo: Supply[];
  website: string;
  productUrl?: string | null;
  /** Direct image URL (Wikimedia Commons preferred), or null. */
  imageUrl?: string | null;
  imageCredit?: string | null;
  /** Bare domain used for favicon/logo lookup, e.g. "toto.com". */
  logoDomain: string;
}

/** Shape of every file in src/data/companies/. */
export interface CompanyFile {
  companies: Company[];
}

/**
 * A resolved supply relationship, derived from `suppliesTo`.
 * Only edges whose `target` resolves to a loaded company are kept.
 */
export interface Edge {
  /** `${source}->${target}` — stable, unique per pair. */
  id: string;
  source: string;
  target: string;
  sourceTier: Tier;
  targetTier: Tier;
  /** What flows along the edge (joined with " · " if a pair appears twice). */
  what: string;
}

/** Edges whose target id is not present in the loaded dataset. */
export interface DanglingEdge {
  source: string;
  target: string;
  what: string;
}
