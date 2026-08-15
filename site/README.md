# The Chip Supply Chain — site

Vite + React + TypeScript. Static build, deployed to GitHub Pages at
`https://wolfomania.github.io/chip-supply-chain/` (hence `base: '/chip-supply-chain/'`
in `vite.config.ts`).

```bash
npm install
npm run dev      # http://localhost:5173/chip-supply-chain/
npm run build    # -> dist/
npm run preview
```

## Adding real data

Research files matching `../data/SCHEMA.md` go in **`src/data/companies/`** as
`*.json`. `src/data/loadData.ts` globs that folder eagerly — no imports to update,
no code changes:

```bash
cp ../data/materials.json ../data/equipment.json \
   ../data/fabs-memory-packaging.json ../data/designers-eda-logistics.json \
   src/data/companies/
rm src/data/companies/placeholder.json   # delete the fake dataset
```

Duplicate ids are dropped with a console warning; `suppliesTo` entries pointing at
ids that are not loaded are collected in `danglingEdges` rather than silently lost.

## Layout

| Path | What |
| --- | --- |
| `src/data/types.ts` | Types mirroring `data/SCHEMA.md` |
| `src/data/tiers.ts` | Tier order, labels, blurbs, colours |
| `src/data/loadData.ts` | Glob loader, derived `edges`, lookups, `stats` |
| `src/styles/tokens.css` | Design tokens — colours, type scale, spacing, motion |
| `src/components/` | `CompanyCard`, `CompanyDetail`, `DetailPanel`, chips, icons |
| `src/views/` | `CompaniesView` (built), `SankeyView` / `GlobeView` (stubs) |
| `src/views/viewProps.ts` | The props contract every view implements |

Tier colours live in **two** places that must stay in sync: the `--tier-*` custom
properties in `src/styles/tokens.css` (for CSS) and `TIER_COLOR` in
`src/data/tiers.ts` (for canvas/WebGL, which cannot read custom properties).
