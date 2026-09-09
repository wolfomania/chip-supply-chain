/**
 * Loads the static dataset and builds derived indexes:
 * companies by id, reverse supply edges, country counts.
 */
import { stageOf } from './meta.js';

const COMPANY_FILES = [
  'data/materials.json',
  'data/equipment.json',
  'data/fabs-memory-packaging.json',
  'data/designers-eda-logistics.json',
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.json();
}

/** Loads everything the app needs. Throws on failure; caller renders the error. */
export async function loadData() {
  const [files, listings, world] = await Promise.all([
    Promise.all(COMPANY_FILES.map(fetchJson)),
    fetchJson('data/listings.json'),
    fetchJson('data/world.geo.json'),
  ]);

  const companies = files
    .flatMap((file) => (Array.isArray(file?.companies) ? file.companies : []))
    .filter((company) => company && company.id && company.name && company.tier);

  const byId = new Map(companies.map((company) => [company.id, company]));

  // Reverse edges: who supplies each company, with the "what".
  const suppliedBy = new Map();
  for (const company of companies) {
    for (const edge of company.suppliesTo ?? []) {
      if (!edge?.target || !byId.has(edge.target)) continue;
      if (!suppliedBy.has(edge.target)) suppliedBy.set(edge.target, []);
      suppliedBy.get(edge.target).push({ source: company.id, what: edge.what ?? '' });
    }
  }

  // Country counts for the concentration list (HQ only, so 1 company = 1 count).
  const countryCounts = new Map();
  for (const company of companies) {
    const country = company.hq?.country;
    if (!country) continue;
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
  }
  const countries = [...countryCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { companies, byId, suppliedBy, countries, listings, world };
}

/** Does a company pass the current search + filters? */
export function matchesFilters(company, state) {
  if (state.q) {
    const q = state.q.trim().toLowerCase();
    const haystack = `${company.name} ${company.id}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (state.stage && stageOf(company.tier) !== state.stage) return false;
  if (state.country && company.hq?.country !== state.country) return false;
  return true;
}

/** True when any search/filter is active. */
export function hasActiveFilters(state) {
  return Boolean(state.q || state.stage || state.country);
}
