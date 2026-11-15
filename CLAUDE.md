# LomFon (ลมฝน) — notes for Claude Code

Static weather-map web app (Windy + RainViewer style). Plain HTML/CSS/ES-module JS, **no build step, no backend**; the only key is a public, referrer-locked Esri basemap key in `js/config.js`. Hosted on GitHub Pages from `main` / root.

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
- `js/gfs.js` — `GfsGrid`: global 0.5° GFS grid from the `gfs-data` branch, same interface as `Grid` but loads each time step on demand (`load`/`has`)
- `scripts/fetch_gfs.py` + `.github/workflows/gfs.yml` — every 6 h: pull GFS GRIB2 records from the NOAA AWS bucket, write gzip'd uint8 planes + `manifest.json`, force-push them as one commit to the `gfs-data` branch
- `js/layers.js` — Leaflet canvas layers: `HeatLayer` (colour field) and `ParticleLayer` (animated wind)
- `js/radar.js` — RainViewer frames + animation
- `js/panel.js` — point forecast panel (now / hourly / 16 days / model comparison)
- `js/i18n.js` — Thai/English strings; `js/util.js` — units, formatting, ColorScale, storage, fetch
- `sw.js` — PWA shell cache (bump `CACHE` version when shell files change)

## Data sources and limits
- Open-Meteo (forecast, AQI, marine, geocoding): free, non-commercial, rate-limited. Multi-location grid requests count once per point, so keep grid sizes modest (`GRID.pointsWorld`/`pointsFocus` in config).
- GFS grid (default map model `gfs_grid`): read from `raw.githubusercontent.com/ad0112/lomfon/gfs-data/` (repo path is hard-coded in `GFS.url`), or from `./data/gfs/` on localhost (git-ignored; create with `py scripts/fetch_gfs.py`, needs `pip install -r scripts/requirements.txt`, ~3 min, ~37 MB). 41 steps, 3-hourly to +120 h. If the manifest is missing or stale the map falls back to Open-Meteo `best_match` with a toast. Changing the file format means changing `fetch_gfs.py` and `gfs.js` together (bump `version` in the manifest).
- RainViewer free API: past ~2 h radar only, no nowcast, no satellite, max URL zoom 7, colour scheme 2.
- NASA GIBS satellite: daily mosaic. `VIIRS_SNPP_*` tiles returned 404 in Nov 2026; NOAA-20 and MODIS Terra work.
- Basemap: Esri static basemap tiles (`arcgis/dark-gray` + `arcgis/imagery/labels` overlay, 512 px tiles) from ArcGIS Location Platform. Esri's terms require a key, so the old keyless `server.arcgisonline.com` tiles were dropped (2026-11-16). `ESRI_KEY` in `js/config.js` is deliberately committed: privilege = static basemap tiles only, referrers = `https://ad0112.github.io`, `http://localhost:8000`, `http://localhost:8765` (any other origin/port gets 401 → no basemap). **Expires 2027-11-14** — rotate in the ArcGIS portal (account `adwittaya`, item "LomFon basemap"). CARTO basemaps also require a key — don't switch back.
- RainViewer terms (read 2026-11-16): free for personal/educational/small community use, attribution with link required (present); not for commercial or high-volume use.

## Gotchas
- Classes built with `L.Layer.extend` must not use field names Leaflet already uses (`_off`, `_on`, `_events`, `_map`, `_layerAdd`, …). A field called `_off` broke the heat layer once.
- Keep UI text in `i18n.js` (both `th` and `en`).
- The user communicates in Thai; reply in Thai.

## Status (2026-11-08)
v1.0 pushed, followed by a fix for the `_off` crash and the basemap. Verified 2026-11-08 against live data in a browser (localhost): layer list, colour layers (wind/temp/rain), wind particles, radar animation, daily satellite, map tap → forecast panel (all 4 tabs), Thailand area mode — all OK, no console errors. Only a harmless Chrome `willReadFrequently` warning from the particle layer's periodic `getImageData` wipe (don't set `willReadFrequently: true` — it makes every draw CPU-side).

GFS grid added 2026-11-16: script run locally and the app verified against its output on localhost (wind/rain/temp layers, timeline playback, fallback, point panel). The GitHub workflow itself has not run yet — after pushing, trigger "GFS grid" once from the Actions tab and check that the `gfs-data` branch appears.

2026-11-16 later: wind/gust colour scale replaced with LomFon's own palette; basemap moved to keyed Esri tiles (verified on localhost:8765). Repo was still private at that point — GitHub Pages and the `gfs-data` raw URL both need it public.

## Ideas for next steps
- Wave-height map layer, near-real-time infrared satellite
