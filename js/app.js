// LomFon — main application.
import { API, BASEMAP, SATELLITE, GRID, GFS, MODELS, LAYERS, LAYER_ORDER, COUNTRIES } from './config.js';
import { t, setLang, getLang, applyI18n } from './i18n.js';
import {
  store, units, debounce, ColorScale, convert, unitLabel, fmtValue, fmtTime, HM, compass,
  escapeHtml, normLon, clamp, fetchJSON, qs, icon,
} from './util.js';
import { fetchGrid, gridDims } from './grid.js';
import { loadGfsGrid } from './gfs.js';
import { HeatLayer, ParticleLayer } from './layers.js';
import { Radar } from './radar.js';
import { PointPanel } from './panel.js';

const L = window.L;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state
const saved = store.get('settings', {});
const state = {
  layer: 'wind',
  particles: true,
  radar: false,
  satellite: false,
  model: GFS.id,
  focus: 'WORLD',
  tIndex: 0,
  ...(saved.state || {}),
};
// one-time switch to the global GFS grid for settings saved before it existed
if (!saved.gfs) state.model = GFS.id;
Object.assign(units, saved.units || {});
setLang(saved.lang || ((navigator.language || '').toLowerCase().startsWith('th') ? 'th' : 'en'));

let favorites = store.get('favorites', []);

// URL hash overrides (shared links)
const hash = new URLSearchParams(location.hash.slice(1));
let initView = saved.view || (getLang() === 'th' ? { lat: 13.2, lon: 101.0, z: 5 } : { lat: 20, lon: 10, z: 3 });
if (hash.get('c')) {
  const [lat, lon, z] = hash.get('c').split(',').map(Number);
  if ([lat, lon, z].every(Number.isFinite)) initView = { lat, lon, z };
}
if (hash.get('l') && (LAYERS[hash.get('l')] || hash.get('l') === 'none')) state.layer = hash.get('l');
if (hash.has('p')) state.particles = hash.get('p') === '1';
if (hash.has('r')) state.radar = hash.get('r') === '1';
if (hash.has('s')) state.satellite = hash.get('s') === '1';
if (hash.get('m') && MODELS.some((m) => m.id === hash.get('m'))) state.model = hash.get('m');
if (hash.get('f') && COUNTRIES.some((c) => c.code === hash.get('f'))) state.focus = hash.get('f');
const hashPoint = hash.get('pt')?.split(',').map(Number);

function saveSettings() {
  const c = map.getCenter();
  store.set('settings', {
    lang: getLang(),
    gfs: 1,
    units: { ...units },
    state: { layer: state.layer, particles: state.particles, radar: state.radar, satellite: state.satellite, model: state.model, focus: state.focus },
    view: { lat: +c.lat.toFixed(3), lon: +c.lng.toFixed(3), z: map.getZoom() },
  });
}

// ---------------------------------------------------------------- map
const map = L.map('map', {
  zoomControl: false,
  worldCopyJump: true,
  minZoom: 2,
  maxZoom: 12,
  zoomSnap: 0.5,
}).setView([initView.lat, initView.lon], initView.z);

L.control.zoom({ position: 'bottomright' }).addTo(map);
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution('Weather &copy; <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0), NOAA GFS');

const pane = (name, z) => {
  const p = map.createPane(name);
  p.style.zIndex = z;
  p.style.pointerEvents = 'none';
  return p;
};
pane('satPane', 250);
pane('heatPane', 350);
pane('radarPane', 420);
pane('particlePane', 440);
pane('labelPane', 460);

L.tileLayer(BASEMAP.base, { attribution: BASEMAP.attribution, maxNativeZoom: BASEMAP.maxNativeZoom, maxZoom: 20 }).addTo(map);
L.tileLayer(BASEMAP.labels, { pane: 'labelPane', maxNativeZoom: BASEMAP.maxNativeZoom, maxZoom: 20 }).addTo(map);

const heat = new HeatLayer();
const particles = new ParticleLayer();
let grid = null;

heat.setSource((lat, lon) => (grid ? grid.sample(LAYERS[state.layer]?.field, state.tIndex, lat, lon) : NaN));
particles.setSource((lat, lon) => (grid ? grid.sampleUV(state.tIndex, lat, lon) : null));

// ---------------------------------------------------------------- UI helpers
let loadingCount = 0;
function loading(d) {
  loadingCount = Math.max(0, loadingCount + d);
  $('loadbar').classList.toggle('active', loadingCount > 0);
}

let toastTimer;
function toast(msg, ms = 3500) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

// ---------------------------------------------------------------- grid management
const scales = {};
const scaleFor = (k) => (scales[k] ||= new ColorScale(LAYERS[k].scale, LAYERS[k].transform));

function focusCountry() {
  const c = COUNTRIES.find((x) => x.code === state.focus);
  return c && c.bbox ? c : null;
}

function viewBBox() {
  const b = map.getBounds();
  let w = b.getWest(), e = b.getEast();
  const s = clamp(b.getSouth(), -85, 85), n = clamp(b.getNorth(), -85, 85);
  if (e - w >= 359) {
    w = -180;
    e = 180;
  } else {
    const c = (w + e) / 2;
    const shift = normLon(c) - c;
    w = clamp(w + shift, -180, 180);
    e = clamp(e + shift, -180, 180);
  }
  return { s, w, n, e };
}

function expandBBox(v, pad) {
  let { s, w, n, e } = v;
  const dx = Math.max(e - w, 3), dy = Math.max(n - s, 2);
  const cx = (w + e) / 2, cy = (s + n) / 2;
  return {
    s: clamp(cy - (dy / 2) * (1 + 2 * pad), -85, 85),
    n: clamp(cy + (dy / 2) * (1 + 2 * pad), -85, 85),
    w: clamp(cx - (dx / 2) * (1 + 2 * pad), -180, 180),
    e: clamp(cx + (dx / 2) * (1 + 2 * pad), -180, 180),
  };
}

let gridAbort = null;
let pendingKey = '';
let gfsFailed = false; // GFS data set unavailable this session → Open-Meteo instead
const useGfs = () => state.model === GFS.id && !gfsFailed;
const gridModel = () => (state.model === GFS.id ? 'best_match' : state.model);

async function ensureGfsGrid(force) {
  if (grid && grid.model === GFS.id && !force) return;
  if (pendingKey === GFS.id) return;
  gridAbort?.abort();
  const ctl = (gridAbort = new AbortController());
  pendingKey = GFS.id;
  loading(1);
  try {
    const g = await loadGfsGrid(ctl.signal);
    if (g !== grid) setGrid(g);
  } catch (e) {
    if (e.name === 'AbortError') return;
    gfsFailed = true;
    toast(t('gfsUnavailable'));
    if (pendingKey === GFS.id) pendingKey = '';
    ensureGrid(true);
  } finally {
    loading(-1);
    if (pendingKey === GFS.id) pendingKey = '';
  }
}

async function ensureGrid(force = false) {
  if (useGfs()) return ensureGfsGrid(force);
  const fc = focusCountry();
  let bbox, N;
  if (fc) {
    const [s, w, n, e] = fc.bbox;
    bbox = expandBBox({ s, w, n, e }, 0.1);
    N = GRID.pointsFocus;
  } else {
    const v = viewBBox();
    if (
      !force && grid && !grid.focus && grid.model === gridModel() && grid.covers(v) &&
      grid.bbox.e - grid.bbox.w <= 3.2 * Math.max(v.e - v.w, 3) &&
      grid.bbox.n - grid.bbox.s <= 3.2 * Math.max(v.n - v.s, 2)
    ) return;
    bbox = expandBBox(v, 0.25);
    N = GRID.pointsWorld;
  }
  const key = [gridModel(), N, bbox.s, bbox.w, bbox.n, bbox.e].map((x) => (typeof x === 'number' ? x.toFixed(2) : x)).join('|');
  if (!force && grid && grid.key === key) return;
  if (key === pendingKey) return;
  gridAbort?.abort();
  const ctl = (gridAbort = new AbortController());
  pendingKey = key;
  loading(1);
  try {
    const { nx, ny } = gridDims(bbox, N);
    const g = await fetchGrid(bbox, gridModel(), nx, ny, ctl.signal);
    g.key = key;
    g.focus = !!fc;
    setGrid(g);
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.status === 429 ? t('rateLimited') : `${t('loadError')}: ${e.message}`);
  } finally {
    loading(-1);
    if (pendingKey === key) pendingKey = '';
  }
}

function setGrid(g) {
  const prevTime = grid ? grid.times[state.tIndex] : null;
  grid = g;
  const slider = $('timeSlider');
  slider.max = g.nt - 1;
  setTimeIndex(g.nearestTimeIndex(prevTime ?? Date.now() / 1000));
  updateTicks();
}

// ---- on-demand frames (GFS grid only: each time step is a separate download)
function frameFields() {
  const f = [];
  if (LAYERS[state.layer]) f.push(LAYERS[state.layer].field);
  if (state.particles || canHover) f.push('wind_speed_10m');
  return f;
}

function redraw() {
  heat.refresh();
  particles.refresh();
  refreshHover();
}

let lastStaleReload = 0;
function loadFrame() {
  const g = grid;
  if (!g || !g.load) return;
  const ti = state.tIndex, fields = frameFields();
  const prefetch = () => {
    const n = (ti + 1) % g.nt;
    if (grid === g && !g.has(n, fields)) g.load(n, fields).catch(() => {});
  };
  if (g.has(ti, fields)) return prefetch();
  loading(1);
  g.load(ti, fields)
    .then(() => {
      if (grid === g && state.tIndex === ti) redraw();
      prefetch();
    })
    .catch((e) => {
      if (grid !== g) return;
      // files replaced by a newer run → pick up the new manifest (at most once a minute)
      if (e.status === 404 && Date.now() - lastStaleReload > 60000) {
        lastStaleReload = Date.now();
        ensureGrid(true);
      } else toast(`${t('loadError')}: ${e.message}`);
    })
    .finally(() => loading(-1));
}
setInterval(() => {
  if (useGfs() && !document.hidden) ensureGrid(true);
}, GFS.recheckMs);

// ---------------------------------------------------------------- timeline
let rafPending = false;
function setTimeIndex(i) {
  if (!grid) return;
  state.tIndex = clamp(i, 0, grid.nt - 1);
  $('timeSlider').value = state.tIndex;
  updateTimeLabel();
  loadFrame();
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    redraw();
  });
}

function updateTimeLabel() {
  if (!grid) return;
  const ts = grid.times[state.tIndex];
  $('timeLabel').textContent = fmtTime(ts, { weekday: 'short', day: 'numeric', month: 'short', ...HM });
  const dh = Math.round((ts - Date.now() / 1000) / 3600);
  $('timeRel').textContent = dh === 0 ? t('nowLabel') : dh > 0 ? t('hoursAhead', dh) : t('hoursAgo', -dh);
}

function updateTicks() {
  const box = $('timeTicks');
  if (!grid) return (box.innerHTML = '');
  const out = [];
  let lastDay = '';
  grid.times.forEach((ts, i) => {
    const day = fmtTime(ts, { weekday: 'short', day: 'numeric' });
    if (day !== lastDay) {
      lastDay = day;
      if (i > 0 || fmtTime(ts, { hour: '2-digit', hour12: false }).replace(/\D/g, '') === '00') {
        out.push(`<span style="left:${(i / Math.max(1, grid.nt - 1)) * 100}%">${escapeHtml(day)}</span>`);
      }
    }
  });
  box.innerHTML = out.join('');
}

let playTimer = null;
function setPlaying(on) {
  clearInterval(playTimer);
  playTimer = null;
  if (on && grid) {
    playTimer = setInterval(() => {
      const n = (state.tIndex + 1) % grid.nt;
      // GFS grid: wait for the next frame instead of showing a stale one
      if (grid.load && !grid.has(n, frameFields())) return void grid.load(n, frameFields()).catch(() => {});
      setTimeIndex(n);
    }, 450);
  }
  $('btnPlay').innerHTML = icon(on ? 'pause' : 'play');
}

$('timeSlider').addEventListener('input', (e) => setTimeIndex(+e.target.value));
$('btnPlay').addEventListener('click', () => setPlaying(!playTimer));

// ---------------------------------------------------------------- layers & legend
function applyLayer() {
  const def = LAYERS[state.layer];
  if (def) {
    heat.setScale(scaleFor(state.layer));
    if (!map.hasLayer(heat)) heat.addTo(map);
    else heat.refresh();
  } else if (map.hasLayer(heat)) {
    map.removeLayer(heat);
  }
  if (state.particles && !map.hasLayer(particles)) particles.addTo(map);
  if (!state.particles && map.hasLayer(particles)) map.removeLayer(particles);
  renderLayerList();
  renderLegend();
  refreshHover();
  loadFrame();
}

function renderLayerList() {
  $('layerList').innerHTML = LAYER_ORDER.map((k) => {
    const sw = LAYERS[k] ? `<span class="sw" style="background:${LAYERS[k].swatch}"></span>` : '<span class="sw none"></span>';
    return `<button class="lp-item${k === state.layer ? ' active' : ''}" data-layer="${k}">${sw}${t('layer_' + k)}</button>`;
  }).join('');
}

function renderLegend() {
  const def = LAYERS[state.layer];
  const el = $('legend');
  if (!def) return (el.hidden = true);
  el.hidden = false;
  const sc = scaleFor(state.layer);
  $('legendTitle').textContent = `${t('layer_' + state.layer)} · ${unitLabel(def.unitType)}`;
  $('legendBar').style.background = sc.cssGradient();
  $('legendTicks').innerHTML = def.ticks
    .map((v) => `<span style="left:${(sc.pos(v) * 100).toFixed(1)}%">${fmtValue(def.unitType, v, false)}</span>`)
    .join('');
}

$('layerList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-layer]');
  if (!b) return;
  state.layer = b.dataset.layer;
  applyLayer();
  persist();
});

$('tglParticles').addEventListener('change', (e) => {
  state.particles = e.target.checked;
  applyLayer();
  persist();
});

// ---------------------------------------------------------------- radar
const radar = new Radar(map, {
  onFrame(frame) {
    const chip = $('radarChip');
    if (!frame) {
      $('radarTime').textContent = t('radarNone');
      return;
    }
    const mins = Math.round((Date.now() / 1000 - frame.time) / 60);
    $('radarTime').textContent = `${t('radarLabel')} ${fmtTime(frame.time, HM)} · ${t('minAgo', mins)}`;
    chip.classList.toggle('latest', frame === radar.frames[radar.lastPast]);
  },
  onError() {
    toast(t('radarError'));
  },
});

function applyRadar() {
  $('radarChip').hidden = !state.radar;
  radar.setVisible(state.radar);
  $('radarPlay').innerHTML = icon(radar.playing ? 'pause' : 'play');
}

$('tglRadar').addEventListener('change', (e) => {
  state.radar = e.target.checked;
  applyRadar();
  persist();
});
$('radarPlay').addEventListener('click', () => {
  $('radarPlay').innerHTML = icon(radar.toggle() ? 'pause' : 'play');
});

// ---------------------------------------------------------------- satellite (NASA GIBS, yesterday's mosaic)
let satLayer = null, satTry = 0;
function satDate() {
  const d = new Date(Date.now() - 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function makeSat() {
  const name = SATELLITE.layers[satTry % SATELLITE.layers.length];
  const layer = L.tileLayer(SATELLITE.url(name, satDate()), {
    pane: 'satPane', maxNativeZoom: SATELLITE.maxNativeZoom, maxZoom: 12, opacity: 0.95, attribution: SATELLITE.attribution,
  });
  let errors = 0, loaded = 0;
  layer.on('tileload', () => loaded++);
  layer.on('tileerror', () => {
    errors++;
    if (errors >= 6 && loaded === 0 && satTry < SATELLITE.layers.length - 1 && satLayer === layer) {
      satTry++;
      map.removeLayer(layer);
      satLayer = makeSat();
      if (state.satellite) satLayer.addTo(map);
    }
  });
  return layer;
}
function applySat() {
  if (state.satellite) {
    satLayer ||= makeSat();
    if (!map.hasLayer(satLayer)) satLayer.addTo(map);
  } else if (satLayer && map.hasLayer(satLayer)) {
    map.removeLayer(satLayer);
  }
}
$('tglSat').addEventListener('change', (e) => {
  state.satellite = e.target.checked;
  applySat();
  persist();
});

// ---------------------------------------------------------------- model & focus
function renderSelects() {
  $('selModel').innerHTML = MODELS.map(
    (m) => `<option value="${m.id}"${m.id === state.model ? ' selected' : ''}>${escapeHtml(m.label[getLang()])}</option>`
  ).join('');
  $('selFocus').innerHTML = COUNTRIES.map(
    (c) => `<option value="${c.code}"${c.code === state.focus ? ' selected' : ''}>${escapeHtml(c[getLang()] || c.en)}</option>`
  ).join('');
}
$('selModel').addEventListener('change', (e) => {
  state.model = e.target.value;
  gfsFailed = false;
  ensureGrid(true);
  panel.reload();
  persist();
});
$('selFocus').addEventListener('change', (e) => {
  state.focus = e.target.value;
  const fc = focusCountry();
  if (fc) {
    const [s, w, n, eb] = fc.bbox;
    map.fitBounds([[s, w], [n, eb]], { padding: [20, 20] });
  }
  ensureGrid(true);
  persist();
});

// ---------------------------------------------------------------- hover readout (desktop)
const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
let hoverLatLng = null, hoverPt = null, hoverRaf = false;
function refreshHover() {
  const el = $('hover');
  if (!canHover || !hoverLatLng || !grid) return (el.hidden = true);
  const lat = hoverLatLng.lat, lon = normLon(hoverLatLng.lng);
  const def = LAYERS[state.layer];
  const parts = [];
  if (def) {
    const v = grid.sample(def.field, state.tIndex, lat, lon);
    if (!Number.isNaN(v)) parts.push(`<b>${fmtValue(def.unitType, v)}</b>`);
  }
  if (state.layer === 'wind' || state.layer === 'gust' || (!def && state.particles)) {
    const uv = grid.sampleUV(state.tIndex, lat, lon);
    if (!def) parts.push(`<b>${fmtValue('wind', grid.sample('wind_speed_10m', state.tIndex, lat, lon))}</b>`);
    if (uv) parts.push(compass((Math.atan2(-uv[0], -uv[1]) * 180) / Math.PI));
  }
  if (!parts.length) return (el.hidden = true);
  el.innerHTML = parts.join(' ');
  el.style.transform = `translate(${hoverPt.x + 14}px, ${hoverPt.y + 14}px)`;
  el.hidden = false;
}
if (canHover) {
  map.on('mousemove', (e) => {
    hoverLatLng = e.latlng;
    hoverPt = e.containerPoint;
    if (hoverRaf) return;
    hoverRaf = true;
    requestAnimationFrame(() => {
      hoverRaf = false;
      refreshHover();
    });
  });
  map.on('mouseout', () => {
    hoverLatLng = null;
    $('hover').hidden = true;
  });
}

// ---------------------------------------------------------------- point panel
const favKey = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;
let marker = null;

const panel = new PointPanel({
  el: $('panel'),
  getModel: () => (state.model === GFS.id ? GFS.pointModel : state.model),
  isFav: (lat, lon) => favorites.some((f) => favKey(f.lat, f.lon) === favKey(lat, lon)),
  onToggleFav(lat, lon, name) {
    const k = favKey(lat, lon);
    if (favorites.some((f) => favKey(f.lat, f.lon) === k)) {
      favorites = favorites.filter((f) => favKey(f.lat, f.lon) !== k);
    } else {
      const nm = window.prompt(t('favName'), name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`);
      if (nm === null) return;
      favorites.push({ name: nm.trim() || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat: +lat.toFixed(4), lon: +lon.toFixed(4) });
    }
    store.set('favorites', favorites);
    renderFavs();
  },
  onShare: share,
  onOpen(lat, lon) {
    if (marker) marker.setLatLng([lat, lon]);
    else marker = L.circleMarker([lat, lon], { pane: 'markerPane', radius: 7, color: '#fff', weight: 2, fillColor: '#38d6c4', fillOpacity: 1 }).addTo(map);
    writeHash();
  },
  onClose() {
    if (marker) map.removeLayer(marker);
    marker = null;
    writeHash();
  },
});

map.on('click', (e) => {
  closeSheets();
  panel.open(e.latlng.lat, normLon(e.latlng.lng));
});

// ---------------------------------------------------------------- search
const searchInput = $('searchInput');
const results = $('searchResults');
let searchCtl = null, searchItems = [];

const doSearch = debounce(async (q) => {
  searchCtl?.abort();
  if (q.length < 2) return (results.hidden = true);
  const ctl = (searchCtl = new AbortController());
  try {
    const j = await fetchJSON(API.geocode + '?' + qs({ name: q, count: 8, language: getLang(), format: 'json' }), ctl.signal);
    searchItems = j.results || [];
    results.innerHTML = searchItems.length
      ? searchItems.map((r, i) => `<li><button data-i="${i}"><b>${escapeHtml(r.name)}</b><span class="muted"> ${escapeHtml([r.admin1, r.country].filter(Boolean).join(', '))}</span></button></li>`).join('')
      : `<li class="muted pad">—</li>`;
    results.hidden = false;
  } catch (e) {
    if (e.name !== 'AbortError') results.hidden = true;
  }
}, 300);

function pickResult(r) {
  results.hidden = true;
  searchInput.value = r.name;
  searchInput.blur();
  map.flyTo([r.latitude, r.longitude], Math.max(map.getZoom(), 8), { duration: 1.2 });
  panel.open(r.latitude, r.longitude, [r.name, r.country].filter(Boolean).join(', '));
}

searchInput.addEventListener('input', () => doSearch(searchInput.value.trim()));
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && searchItems[0]) pickResult(searchItems[0]);
  if (e.key === 'Escape') results.hidden = true;
});
results.addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (b) pickResult(searchItems[+b.dataset.i]);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) results.hidden = true;
});

// ---------------------------------------------------------------- locate
$('btnLocate').addEventListener('click', () => {
  if (!navigator.geolocation) return toast(t('geoUnsupported'));
  loading(1);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      loading(-1);
      const { latitude, longitude } = pos.coords;
      map.flyTo([latitude, longitude], Math.max(map.getZoom(), 8), { duration: 1.2 });
      panel.open(latitude, longitude, t('myLocation'));
    },
    () => {
      loading(-1);
      toast(t('geoError'));
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
});

// ---------------------------------------------------------------- sheets: layers (mobile) & settings
function closeSheets() {
  $('layerPanel').classList.remove('open');
}
$('btnLayers').addEventListener('click', (e) => {
  e.stopPropagation();
  $('layerPanel').classList.toggle('open');
});
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => {
    const el = $(b.dataset.close);
    if (el.classList.contains('modal')) el.hidden = true;
    else el.classList.remove('open');
  })
);

$('btnMenu').addEventListener('click', () => {
  $('settings').hidden = false;
  renderFavs();
});
$('settings').addEventListener('click', (e) => {
  if (e.target === $('settings')) $('settings').hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('settings').hidden) $('settings').hidden = true;
  else if (panel.isOpen) panel.close();
});

function renderSettings() {
  $('selLang').value = getLang();
  $('selTempUnit').value = units.temp;
  $('selWindUnit').value = units.wind;
}
$('selLang').addEventListener('change', (e) => {
  setLang(e.target.value);
  refreshTexts();
  persist();
});
$('selTempUnit').addEventListener('change', (e) => {
  units.temp = e.target.value;
  refreshUnits();
});
$('selWindUnit').addEventListener('change', (e) => {
  units.wind = e.target.value;
  refreshUnits();
});

function refreshUnits() {
  renderLegend();
  refreshHover();
  if (panel.isOpen && panel.data) panel.render();
  persist();
}

function refreshTexts() {
  applyI18n();
  renderLayerList();
  renderLegend();
  renderSelects();
  renderFavs();
  updateTimeLabel();
  updateTicks();
  if (state.radar && radar.frames.length) radar.show(radar.idx);
  if (panel.isOpen) panel.render();
}

function renderFavs() {
  const ul = $('favList');
  if (!favorites.length) {
    ul.innerHTML = `<li class="muted">${t('noFavs')}</li>`;
    return;
  }
  ul.innerHTML = favorites
    .map((f, i) => `<li><button class="fav-go" data-i="${i}">${icon('star', 'ic filled')} ${escapeHtml(f.name)}</button><button class="icon-btn sm" data-del="${i}" aria-label="${t('favRemove')}">${icon('x')}</button></li>`)
    .join('');
}
$('favList').addEventListener('click', (e) => {
  const go = e.target.closest('[data-i]');
  const del = e.target.closest('[data-del]');
  if (del) {
    favorites.splice(+del.dataset.del, 1);
    store.set('favorites', favorites);
    renderFavs();
    if (panel.isOpen) panel.renderHead();
  } else if (go) {
    const f = favorites[+go.dataset.i];
    $('settings').hidden = true;
    map.flyTo([f.lat, f.lon], Math.max(map.getZoom(), 8), { duration: 1.2 });
    panel.open(f.lat, f.lon, f.name);
  }
});

// ---------------------------------------------------------------- URL hash & sharing
function buildHash() {
  const c = map.getCenter();
  const p = {
    c: `${c.lat.toFixed(3)},${normLon(c.lng).toFixed(3)},${map.getZoom()}`,
    l: state.layer,
    p: state.particles ? 1 : 0,
    r: state.radar ? 1 : 0,
    s: state.satellite ? 1 : 0,
    m: state.model,
    f: state.focus,
  };
  if (panel.isOpen) p.pt = `${panel.lat.toFixed(4)},${panel.lon.toFixed(4)}`;
  return '#' + qs(p);
}
const writeHash = debounce(() => {
  try {
    history.replaceState(null, '', buildHash());
  } catch {
    /* ignore */
  }
}, 250);

async function share() {
  const url = location.href.split('#')[0] + buildHash();
  const title = panel.isOpen && panel.name ? `LomFon · ${panel.name}` : 'LomFon';
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(t('copied'));
  } catch {
    window.prompt(t('share'), url);
  }
}

function persist() {
  writeHash();
  saveSettings();
}

// ---------------------------------------------------------------- map events
const onMoveEnd = debounce(() => {
  if (!focusCountry()) ensureGrid();
  persist();
}, 450);
map.on('moveend', onMoveEnd);

// ---------------------------------------------------------------- boot
function boot() {
  applyI18n();
  renderSelects();
  renderSettings();
  $('tglParticles').checked = state.particles;
  $('tglRadar').checked = state.radar;
  $('tglSat').checked = state.satellite;
  $('btnPlay').innerHTML = icon('play');
  applyLayer();
  applySat();
  applyRadar();
  ensureGrid(true);
  if (hashPoint && hashPoint.length === 2 && hashPoint.every(Number.isFinite)) panel.open(hashPoint[0], hashPoint[1]);
  if (!store.get('seenHint', false)) {
    setTimeout(() => toast(t('clickHint'), 5000), 1200);
    store.set('seenHint', true);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
