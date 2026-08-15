import type { Company, CompanyFile, DanglingEdge, Edge, Tier } from './types';
import { isTier, tierIndex } from './tiers';

/**
 * Every JSON file in src/data/companies/ is a `{ "companies": [...] }` document
 * matching data/SCHEMA.md. Dropping a new research file in that folder is the
 * only step needed to add data — no code changes, no import list to update.
 */
const modules = import.meta.glob<CompanyFile>('./companies/*.json', { eager: true });

function collect(): { companies: Company[]; duplicates: string[] } {
  const byId = new Map<string, Company>();
  const duplicates: string[] = [];

  for (const path of Object.keys(modules).sort()) {
    const mod = modules[path] as CompanyFile & { default?: CompanyFile };
    // Vite returns the parsed object directly for JSON, but a `default` key
    // shows up under some transform pipelines. Accept either.
    const file: CompanyFile = Array.isArray(mod?.companies) ? mod : (mod.default as CompanyFile);
    const list = file?.companies;
    if (!Array.isArray(list)) {
      console.warn(`[loadData] ${path} has no "companies" array; skipped.`);
      continue;
    }

    for (const raw of list) {
      if (!raw?.id) continue;
      if (!isTier(raw.tier)) {
        console.warn(`[loadData] ${path}: "${raw.id}" has unknown tier "${raw.tier}"; skipped.`);
        continue;
      }
      if (byId.has(raw.id)) {
        duplicates.push(raw.id);
        continue;
      }
      byId.set(raw.id, normalize(raw));
    }
  }

  return { companies: [...byId.values()], duplicates };
}

/** Fill in optional fields so consumers never branch on undefined vs null. */
function normalize(raw: Company): Company {
  return {
    ...raw,
    bottleneck: raw.bottleneck === true,
    facilities: Array.isArray(raw.facilities) ? raw.facilities : [],
    suppliesTo: Array.isArray(raw.suppliesTo) ? raw.suppliesTo : [],
    productUrl: raw.productUrl ?? null,
    imageUrl: raw.imageUrl ?? null,
    imageCredit: raw.imageCredit ?? null,
  };
}

const { companies: loaded, duplicates } = collect();

if (duplicates.length > 0) {
  console.warn(`[loadData] duplicate company ids ignored: ${[...new Set(duplicates)].join(', ')}`);
}

/** Sorted by tier order, then alphabetically by name. */
export const companies: Company[] = loaded.sort(
  (a, b) => tierIndex(a.tier) - tierIndex(b.tier) || a.name.localeCompare(b.name),
);

export const companiesById: ReadonlyMap<string, Company> = new Map(companies.map((c) => [c.id, c]));

/** Companies of one tier, in display order. */
export const companiesByTier: ReadonlyMap<Tier, Company[]> = (() => {
  const map = new Map<Tier, Company[]>();
  for (const company of companies) {
    const bucket = map.get(company.tier);
    if (bucket) bucket.push(company);
    else map.set(company.tier, [company]);
  }
  return map;
})();

/** Tiers that actually have companies loaded, in canonical order. */
export const presentTiers: Tier[] = [...companiesByTier.keys()].sort((a, b) => tierIndex(a) - tierIndex(b));

function buildEdges(list: Company[]): { edges: Edge[]; dangling: DanglingEdge[] } {
  const known = new Map(list.map((c) => [c.id, c]));
  const merged = new Map<string, Edge>();
  const dangling: DanglingEdge[] = [];

  for (const source of list) {
    for (const link of source.suppliesTo) {
      const target = known.get(link.target);
      if (!target) {
        dangling.push({ source: source.id, target: link.target, what: link.what });
        continue;
      }
      if (target.id === source.id) continue;

      const id = `${source.id}->${target.id}`;
      const existing = merged.get(id);
      if (existing) {
        // Same pair listed twice — keep both descriptions on one edge.
        if (link.what && !existing.what.includes(link.what)) {
          existing.what = existing.what ? `${existing.what} · ${link.what}` : link.what;
        }
        continue;
      }
      merged.set(id, {
        id,
        source: source.id,
        target: target.id,
        sourceTier: source.tier,
        targetTier: target.tier,
        what: link.what ?? '',
      });
    }
  }

  return { edges: [...merged.values()], dangling };
}

const built = buildEdges(companies);

/** Resolved supply relationships. Both endpoints are guaranteed to exist. */
export const edges: Edge[] = built.edges;

/** `suppliesTo` entries pointing at ids not present in the dataset (yet). */
export const danglingEdges: DanglingEdge[] = built.dangling;

if (import.meta.env.DEV && danglingEdges.length > 0) {
  console.info(
    `[loadData] ${danglingEdges.length} supply edge(s) reference unknown ids: ` +
      `${[...new Set(danglingEdges.map((e) => e.target))].join(', ')}`,
  );
}

/** Companies this company supplies. */
export function customersOf(id: string): Company[] {
  return edges
    .filter((e) => e.source === id)
    .map((e) => companiesById.get(e.target))
    .filter((c): c is Company => Boolean(c));
}

/** Companies that supply this company. */
export function suppliersOf(id: string): Company[] {
  return edges
    .filter((e) => e.target === id)
    .map((e) => companiesById.get(e.source))
    .filter((c): c is Company => Boolean(c));
}

/** The edge between two companies, if any. */
export function edgeBetween(source: string, target: string): Edge | undefined {
  return edges.find((e) => e.source === source && e.target === target);
}

/** Favicon URL for a company logo. Google's service is CDN-cached and stable. */
export function logoUrl(logoDomain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(logoDomain)}&sz=${size}`;
}

export const stats = {
  companies: companies.length,
  edges: edges.length,
  tiers: presentTiers.length,
  bottlenecks: companies.filter((c) => c.bottleneck).length,
  countries: new Set(companies.map((c) => c.hq.country)).size,
};

export type { Company, Edge, Tier };
