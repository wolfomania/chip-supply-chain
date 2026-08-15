# The Chip Supply Chain

An interactive explorer of the supply chain behind advanced semiconductors — from
quartz sand, photoresist and ultra-flat ceramic wafer chucks, through lithography
machines and fabs, to the memory makers, packaging houses and chip designers at
the end of the line.

**Live site: <https://wolfomania.github.io/chip-supply-chain/>**

## What's in it

- **Sankey flow** — the whole chain as one diagram, tier by tier, with every
  supplier relationship drawn as a link you can trace end to end.
- **3D globe** — headquarters and key facilities plotted on a rotating globe,
  with supply arcs showing how far a wafer's ingredients travel.
- **Company directory** — all **47 companies**, filterable by tier, each with what
  they make, who they ship it to, and whether they are a genuine single-point
  bottleneck.

The project was inspired by a video essay on the semiconductor supply chain; the
transcript that seeded the research is in [`transcript.md`](transcript.md).

## Development

```bash
cd site
npm install
npm run dev      # http://localhost:5173/chip-supply-chain/
```

Other scripts: `npm run build` (type-check + production build to `site/dist/`),
`npm run preview`, `npm run lint`.

## Repo layout

| Path | What |
| --- | --- |
| `site/` | The Vite + React + TypeScript app (see `site/README.md` for internals) |
| `site/src/views/` | `SankeyView`, `GlobeView`, `CompaniesView` |
| `site/src/data/companies/` | The company dataset the app loads at build time |
| `data/` | Source research files + [`data/SCHEMA.md`](data/SCHEMA.md), the record shape |
| `transcript.md` | Transcript of the video that inspired the project |
| `.github/workflows/deploy.yml` | Builds `site/` and publishes to GitHub Pages on push to `main` |

## Deployment

Pushing to `main` triggers the GitHub Actions workflow, which runs `npm ci &&
npm run build` in `site/` and publishes `site/dist` to GitHub Pages. Vite's
`base` is set to `/chip-supply-chain/` and the app uses hash routing, so the
static build works under the project-pages subpath with no server config.

## Data and sources

The dataset was researched in **August 2026**. Facts come from company websites,
product and investor pages, with supporting detail from public reporting;
imagery is primarily from **Wikimedia Commons**. Every record carries its own
`website`, `productUrl`, `imageUrl` and `imageCredit` fields — image attribution
lives in the data JSON alongside the company it belongs to.

This is an editorial snapshot, not a live feed: market positions, fab locations
and supplier relationships change, and a few "sole supplier" claims are
necessarily judgement calls about companies that do not publish their customer
lists.
