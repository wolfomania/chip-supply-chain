# Chip Supply Chain Explorer — redesign

A zero-build static site. Plain HTML + CSS + ES modules; no framework, no bundler,
no CDN dependencies (the world map projection is implemented in `js/projection.js`).

## Run locally

Any static file server works (ES modules + `fetch` need HTTP, not `file://`):

```sh
cd redesign
npx serve .          # or: python3 -m http.server 8000
```

Then open the printed URL.

## Deploy (Vercel)

Point Vercel at this directory — it is the finished site:

- Output directory: `redesign/` (the directory itself)
- Build command: none
- e.g. `cd redesign && vercel --prod`

## Structure

- `index.html` — the single page (Flow / Map / Companies views + detail panel)
- `css/` — `tokens.css` holds the entire warm palette; one stylesheet per concern
- `js/` — small modules: `store.js` (URL-hash state), `data.js` (loading + indexes),
  `views/` (flow, map, list), `detail.js`, `projection.js` (Natural Earth I)
- `data/` — the four company JSON files (copied verbatim from `../data/`),
  `listings.json` (converted from the old site's `listings.ts`),
  `world.geo.json` (copied from the old site's assets)

## Data honesty

Everything shown comes from the static dataset above. Stock entries are listing
references (ticker, exchange, issuer, caveats) — there are no live or historical
prices in this build, and the UI says so.
