# LomFon (ลมฝน) — notes for Claude Code

Static weather-map web app (Windy + RainViewer style). Plain HTML/CSS/ES-module JS, **no build step, no backend, no API keys**. Hosted on GitHub Pages from `main` / root.

## Run locally
ES modules don't load from `file://` — always serve over HTTP:
```
py -m http.server 8000      # Windows (or: python -m http.server 8000)
```
Open http://localhost:8000. After code changes, hard-refresh (Ctrl+F5). The service worker only registers on https, so it never caches on localhost.

## Code map
- `index.html` — layout, icon sprite, CDN scripts (Leaflet 1.9.4, Chart.js 4.4.1 from jsDelivr)
- `js/app.js` — main controller: map, panes, model-grid loading, timeline, layer panel, radar/satellite toggles, search, favourites, URL hash, settings
- `js/config.js` — API endpoints, basemap, radar/satellite settings, layer colour scales, models, country bboxes
- `js/grid.js` — one Open-Meteo multi-location request → `Grid` with bilinear sampling (u/v for wind)
- `js/layers.js` — Leaflet canvas layers: `HeatLayer` (colour field) and `ParticleLayer` (animated wind)
- `js/radar.js` — RainViewer frames + animation
- `js/panel.js` — point forecast panel (now / hourly / 16 days / model comparison)
- `js/i18n.js` — Thai/English strings; `js/util.js` — units, formatting, ColorScale, storage, fetch
- `sw.js` — PWA shell cache (bump `CACHE` version when shell files change)

## Data sources and limits
- Open-Meteo (forecast, AQI, marine, geocoding): free, non-commercial, rate-limited. Multi-location grid requests count once per point, so keep grid sizes modest (`GRID.pointsWorld`/`pointsFocus` in config).
- RainViewer free API: past ~2 h radar only, no nowcast, no satellite, max URL zoom 7, colour scheme 2.
- NASA GIBS satellite: daily mosaic. `VIIRS_SNPP_*` tiles returned 404 in Nov 2026; NOAA-20 and MODIS Terra work.
- Basemap: Esri Canvas Dark Gray (no key). CARTO basemaps now require an API key — don't switch back.

## Gotchas
- Classes built with `L.Layer.extend` must not use field names Leaflet already uses (`_off`, `_on`, `_events`, `_map`, `_layerAdd`, …). A field called `_off` broke the heat layer once.
- Keep UI text in `i18n.js` (both `th` and `en`).
- The user communicates in Thai; reply in Thai.

## Status (2026-11-08)
v1.0 pushed, followed by a fix for the `_off` crash and the basemap. Verified 2026-11-08 against live data in a browser (localhost): layer list, colour layers (wind/temp/rain), wind particles, radar animation, daily satellite, map tap → forecast panel (all 4 tabs), Thailand area mode — all OK, no console errors. Only a harmless Chrome `willReadFrequently` warning from the particle layer's periodic `getImageData` wipe (don't set `willReadFrequently: true` — it makes every draw CPU-side).

## Ideas for next steps
- GitHub Action that fetches GFS (GRIB2) every 6 h and writes a global JSON grid to the repo, for Windy-like global resolution without a server
- Wave-height map layer, near-real-time infrared satellite
