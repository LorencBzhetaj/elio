# Interactive map

## What is used

| Part | Choice | Licence / terms |
|---|---|---|
| Map library | **MapLibre GL JS 6.14** (`maplibre-gl`) | BSD-3-Clause, open source, no key |
| Default tiles & style | **OpenFreeMap** `https://tiles.openfreemap.org/styles/positron` | Project MIT; map data © OpenStreetMap contributors (ODbL); tiles schema OpenMapTiles. No key, no registration. |
| Clustering | MapLibre's built-in GeoJSON clustering | — |

Checked 18 Oct 2026 on openfreemap.org: the public instance states no request limits, but also
**no SLA or guaranteed support**. Do not rely on that for production. Before launch choose one:

1. **MapTiler** or **Stadia Maps** — commercial vector tiles with a free tier and paid plans; needs a
   public browser key restricted to your domain (set it inside `PUBLIC_MAP_STYLE_URL`). Check current
   pricing/limits on the provider's site at signup.
2. **Self-hosted** OpenFreeMap or Protomaps (PMTiles on your own storage/CDN) — no per-view fees,
   you operate it.

Whatever you choose: keep attribution visible (MapLibre shows the style's attribution automatically in
the ⓘ control — do not hide it), and never put a secret key in the browser (map keys are public and must
be domain-restricted).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PUBLIC_MAP_STYLE_URL` | OpenFreeMap positron | MapLibre style JSON URL |
| `PUBLIC_MAP_LABEL_FONT` | `Noto Sans Bold` | Font for cluster counts; must exist in the style's glyphs |
| `PUBLIC_MAP_SHOW_UNVERIFIED` | `true` | Show pins not yet verified (sample town centres). **Set `false` for launch** until editors verify locations. |

These are read at request time on the server (no rebuild needed).

## Data and privacy rules

- Public pins come only from published CMS content: destination `location`, free place `coordinates`,
  event `location`. Nothing is guessed: items without a location are listed under "Not on the map yet".
- Sample destinations have **approximate town-centre** points marked `verified: false`; the card says so.
  Places (photo spots) have no coordinates yet.
- **Premium guide locations** live only in the `premium_places` table and are returned by
  `GET /api/map/premium` to a signed-in buyer with an active entitlement (`no-store, private`). The map
  page HTML only carries a yes/no flag. Refunds remove access immediately. The guide page shows a count
  ("N places, shown on your map after purchase"), never positions. The build fails if premium strings
  reach the public output.
- Search, `/api/map/points` and the page JSON contain no prices, private file keys or premium data
  (covered by tests).

## Performance

MapLibre (≈1 MB uncompressed / ~270 kB gzip, plus a worker) is in a separate chunk loaded only when a
map container approaches the viewport (homepage preview) or is opened (/map, or "Map" on phones). The
hero and other pages never load it.

## Behaviour summary

- Initial view: Albania. Zoom/pan, clusters (click to zoom; overlapping points open their places).
- List ↔ map sync: choosing in the list highlights the pin and opens the card; clicking a pin highlights
  and scrolls the list. Phones: List / Map switch; selection and filters are kept when switching.
- Text search + Filters (Category, Region) update list and pins together.
- Moving the map shows **Search this area**; results only change when you press it. "Show all places"
  removes the area limit. All of this is in the URL (`q`, `category`, `region`, `bbox`, `place`, `view`).
- If the map can't load (no WebGL, tiles unreachable, timeout) a message appears and the list keeps
  working.
- Out of scope in this phase: routing/route optimisation, live travel times, offline maps.
