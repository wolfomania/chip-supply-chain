import type { Tier } from './types';

/**
 * Canonical left-to-right ordering of the chain. `logistics` sits at the end
 * because it is cross-cutting — it moves goods between every other stage
 * rather than occupying a position in the flow.
 */
export const TIER_ORDER: readonly Tier[] = [
  'raw-materials',
  'materials',
  'equipment-suppliers',
  'equipment',
  'eda',
  'fabs',
  'memory',
  'packaging',
  'designers',
  'logistics',
] as const;

/** Tiers that form the linear flow, i.e. everything except cross-cutting ones. */
export const FLOW_TIERS: readonly Tier[] = TIER_ORDER.filter((t) => t !== 'logistics');

/** Tiers that apply across the whole chain rather than at one stage. */
export const CROSS_CUTTING_TIERS: readonly Tier[] = ['logistics'];

export const TIER_LABEL: Record<Tier, string> = {
  'raw-materials': 'Raw materials',
  materials: 'Materials',
  'equipment-suppliers': 'Equipment suppliers',
  equipment: 'Equipment',
  eda: 'EDA software',
  fabs: 'Fabs',
  memory: 'Memory',
  packaging: 'Packaging',
  designers: 'Chip designers',
  logistics: 'Logistics',
};

/** One-line explanation of what the tier contributes, used as section standfirst. */
export const TIER_BLURB: Record<Tier, string> = {
  'raw-materials': 'What comes out of the ground — the quartz, gases and metals everything else is made from.',
  materials: 'Refined inputs: polished silicon wafers, photoresists, ultrapure chemicals, substrates.',
  'equipment-suppliers': 'The specialists who build the critical sub-assemblies inside the machines.',
  equipment: 'The tools that pattern, etch, deposit and inspect — lithography and everything around it.',
  eda: 'The software a chip is designed and verified in before a single wafer moves.',
  fabs: 'Where designs become silicon. A handful of companies run the leading-edge nodes.',
  memory: 'DRAM, HBM and NAND — the memory an AI accelerator is starved without.',
  packaging: 'Advanced packaging binds logic and memory dies into one working part.',
  designers: 'The companies whose names end up on the chip.',
  logistics: 'Moving fragile, export-controlled, extremely valuable cargo across the planet.',
};

/**
 * Tier accent colours. Mirrors the `--tier-*` custom properties in
 * src/styles/tokens.css — keep the two in sync. Exported for canvas/WebGL
 * consumers (Sankey, Globe) that cannot read CSS variables cheaply.
 */
export const TIER_COLOR: Record<Tier, string> = {
  'raw-materials': '#b4693c',
  materials: '#b78c2a',
  'equipment-suppliers': '#7c8b39',
  equipment: '#3d8c6b',
  eda: '#2c8a92',
  fabs: '#3a72b8',
  memory: '#6a63c4',
  packaging: '#96559f',
  designers: '#bf4f79',
  logistics: '#6f7681',
};

const TIER_INDEX = new Map<Tier, number>(TIER_ORDER.map((t, i) => [t, i]));

/** Position of a tier in TIER_ORDER; unknown tiers sort last. */
export function tierIndex(tier: Tier): number {
  return TIER_INDEX.get(tier) ?? TIER_ORDER.length;
}

/** Runtime guard, for validating data that arrives from JSON. */
export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && TIER_INDEX.has(value as Tier);
}
