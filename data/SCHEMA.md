# Chip supply chain — research data schema

Each research agent writes ONE file: `data/<segment>.json` with this shape:

```json
{
  "companies": [
    {
      "id": "kebab-case-id",            // MUST use canonical IDs below
      "name": "TOTO Ltd.",
      "tier": "raw-materials | materials | equipment-suppliers | equipment | eda | fabs | memory | packaging | designers | logistics",
      "role": "One-line: what they make for the chip supply chain",
      "description": "2-4 sentences, plain language: what they do, why they matter, any near-monopoly / bottleneck angle. Include a concrete memorable fact if there is one.",
      "bottleneck": true,                // true if effectively sole/dominant supplier
      "hq": { "city": "Kitakyushu", "country": "Japan", "lat": 33.87, "lng": 130.88 },
      "facilities": [                    // 0-3 KEY facilities relevant to chips (fab sites, main plants)
        { "name": "Fab 18", "city": "Tainan", "country": "Taiwan", "lat": 23.11, "lng": 120.27, "note": "3nm/5nm" }
      ],
      "suppliesTo": [                    // edges; targets MUST be canonical IDs
        { "target": "asml", "what": "electrostatic ceramic wafer chucks" }
      ],
      "website": "https://...",          // official site
      "productUrl": "https://...",       // product/division page for the relevant item, if findable
      "imageUrl": "https://...",         // direct image URL: Wikimedia Commons (upload.wikimedia.org) preferred, else official press/product image; null if none found
      "imageCredit": "short attribution or null",
      "logoDomain": "toto.com"           // primary domain for favicon/logo lookup
    }
  ]
}
```

Rules:
- Coordinates: decimal degrees, ~2 decimal places is enough. Verify country/city; guessing lat/lng roughly for a verified city is fine.
- `suppliesTo` targets may reference companies in OTHER segments — use the canonical ID list.
- Facts must come from research (web), not invention. If a link 404s, find another or set null.
- Keep descriptions tight; this feeds UI cards.

## Canonical IDs

raw/materials: quartz-sand (Spruce Pine / The Quartz Corp + Sibelco), toto, ajinomoto, ibiden, unimicron, shin-etsu, sumco, globalwafers, siltronic, jsr, tok (Tokyo Ohka), air-liquide, linde, hoya, tanaka
equipment-suppliers: trumpf, zeiss-smt, cymer, vdl-etg
equipment: asml, applied-materials, lam-research, kla, tokyo-electron, nikon, canon
eda: cadence, synopsys
fabs: tsmc, samsung-foundry, intel, globalfoundries
memory: sk-hynix, micron, samsung-memory
packaging: tsmc-cowos, ase, amkor
designers: nvidia, amd, apple, broadcom, qualcomm
logistics: (agent's choice, e.g. air-cargo-747, plus any named freight players actually documented for ASML/chip logistics)
