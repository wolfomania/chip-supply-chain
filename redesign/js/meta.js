/**
 * Domain metadata: stages (colour groups / filters), tier labels,
 * and compact display names for dense views. Only names are shortened —
 * no data is invented here.
 */

export const STAGES = [
  { id: 'materials',   label: 'Materials',   tiers: ['raw-materials', 'materials'] },
  { id: 'equipment',   label: 'Equipment',   tiers: ['equipment-suppliers', 'equipment'] },
  { id: 'fabrication', label: 'Fabrication', tiers: ['fabs', 'memory'] },
  { id: 'packaging',   label: 'Packaging',   tiers: ['packaging'] },
  { id: 'design',      label: 'Design',      tiers: ['eda', 'designers'] },
  { id: 'logistics',   label: 'Logistics',   tiers: ['logistics'] },
];

export const TIER_LABELS = {
  'raw-materials': 'Raw materials',
  'materials': 'Materials & substrates',
  'equipment-suppliers': 'Critical subsystems',
  'equipment': 'Fab equipment',
  'eda': 'Design software (EDA)',
  'fabs': 'Foundries',
  'memory': 'Memory',
  'packaging': 'Packaging & test',
  'designers': 'Chip designers',
  'logistics': 'Logistics',
};

const TIER_TO_STAGE = {};
for (const stage of STAGES) {
  for (const tier of stage.tiers) TIER_TO_STAGE[tier] = stage.id;
}

/** Stage id for a company tier; 'materials' as a safe fallback. */
export function stageOf(tier) {
  return TIER_TO_STAGE[tier] ?? 'materials';
}

export function stageColorVars(stageId) {
  return {
    color: `var(--stage-${stageId})`,
    dark: `var(--stage-${stageId}-dark)`,
    soft: `var(--stage-${stageId}-soft)`,
  };
}

/** Compact names for the flow diagram and map tooltips. */
export const SHORT_NAMES = {
  'quartz-sand': 'Spruce Pine quartz',
  'toto': 'TOTO',
  'ajinomoto': 'Ajinomoto',
  'ibiden': 'Ibiden',
  'unimicron': 'Unimicron',
  'shin-etsu': 'Shin-Etsu',
  'sumco': 'SUMCO',
  'globalwafers': 'GlobalWafers',
  'siltronic': 'Siltronic',
  'jsr': 'JSR',
  'tok': 'Tokyo Ohka (TOK)',
  'air-liquide': 'Air Liquide',
  'linde': 'Linde',
  'hoya': 'HOYA',
  'tanaka': 'TANAKA',
  'trumpf': 'TRUMPF',
  'zeiss-smt': 'ZEISS SMT',
  'cymer': 'Cymer',
  'vdl-etg': 'VDL ETG',
  'asml': 'ASML',
  'applied-materials': 'Applied Materials',
  'lam-research': 'Lam Research',
  'kla': 'KLA',
  'tokyo-electron': 'Tokyo Electron',
  'nikon': 'Nikon',
  'canon': 'Canon',
  'cadence': 'Cadence',
  'synopsys': 'Synopsys',
  'tsmc': 'TSMC',
  'samsung-foundry': 'Samsung Foundry',
  'intel': 'Intel',
  'globalfoundries': 'GlobalFoundries',
  'sk-hynix': 'SK hynix',
  'micron': 'Micron',
  'samsung-memory': 'Samsung Memory',
  'tsmc-cowos': 'TSMC CoWoS',
  'ase': 'ASE',
  'amkor': 'Amkor',
  'nvidia': 'NVIDIA',
  'amd': 'AMD',
  'apple': 'Apple',
  'broadcom': 'Broadcom',
  'qualcomm': 'Qualcomm',
  'air-cargo-747': 'EUV 747 airlift',
  'dsv': 'DSV',
  'china-airlines-cargo': 'China Airlines Cargo',
  'eva-air-cargo': 'EVA Air Cargo',
};

export function shortName(company) {
  return SHORT_NAMES[company.id] ?? company.name;
}
